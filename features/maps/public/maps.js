/**
 * kasion go — maps.js  (window.kmap)
 *
 * Provider: window.GOOGLE_MAPS_KEY non-empty → Google Maps JS API; else Leaflet 1.9.4 + OSM
 * tiles + OSRM routing + Nominatim geocoding. Route/geocode results cached in memory; network
 * failure falls back to a curved line + haversine distance so the UI never breaks.
 *
 * API:
 *   kmap.provider                      'google' | 'leaflet'
 *   kmap.PLACES                        {key:{label,lat,lng}} demo Bangkok places
 *   await kmap.create(el,{center,zoom=14,interactive=true}) → handle
 *     handle.el                        the real map div (move it, never re-create it)
 *     handle.setMarkers([{id,lat,lng,kind,label}])  kind: pickup|drop|driver|rider|shop|me
 *     handle.moveMarker(id,lat,lng,{rotate})
 *     await handle.drawRoute(from,to)  → {distanceKm,durationMin,path}
 *     handle.drawPath(path) · handle.fit(padding=48) · handle.onClick(cb({lat,lng}))
 *     handle.animateAlong(id,path,ms,onProgress(t,[lat,lng])) → {stop()}
 *     handle.destroy()
 *   await kmap.route(from,to) · await kmap.search(text) → [{label,lat,lng}] (≤6)
 *   await kmap.reverse(lat,lng) → string · await kmap.myLocation() → [lat,lng]
 *   kmap.fare(km, 'bike'|'car'|'xl'|'send') → baht
 *
 * RE-RENDER SURVIVAL (important): support.js re-renders the whole screen DOM on every setState
 * (host.replaceChildren). A map div inside the template would be destroyed each time. So:
 *   1. Put an empty placeholder in the template: <div id="map" style="height:300px"></div>
 *   2. In componentDidMount:
 *        this.map = await kmap.mount('#map', {center:[13.78,100.54]});   // creates map in a
 *        kmap.keepAlive(this, '#map', this.map);                          // detached div
 *      mount(sel, opts) = create the map on a persistent div, append it into the placeholder.
 *      keepAlive(component, sel, handle) wraps component.__render so after each render the same
 *      handle.el is re-appended into the new placeholder (like call.html / scan.html do) and
 *      the map is told to resize. Never call kmap.create inside render.
 */
(function () {
  'use strict';
  const KEY = (window.GOOGLE_MAPS_KEY || '').trim();
  const provider = KEY ? 'google' : 'leaflet';
  const ACCENT = '#00A85A';

  // Test region: 'bkk' (default) or 'cdmx'. Auto-detects Mexico City time zone; override with localStorage kmap_region.
  // In CDMX mode the same place keys map to Mexico City spots, so every screen's defaults/chips move together.
  const REGION = (() => {
    try { const o = localStorage.getItem('kmap_region'); if (o === 'bkk' || o === 'cdmx') return o; } catch (e) {}
    try { if (/^America\/(Mexico_City|Monterrey|Merida|Cancun|Chihuahua|Tijuana)/.test(Intl.DateTimeFormat().resolvedOptions().timeZone)) return 'cdmx'; } catch (e) {}
    return 'bkk';
  })();
  const CDMX = {
    bts_ari: { label: 'Metro Insurgentes', lat: 19.4234, lng: -99.1630 },
    samyan: { label: 'Zócalo (Centro Histórico)', lat: 19.4326, lng: -99.1332 },
    siam_paragon: { label: 'Antara Polanco', lat: 19.4393, lng: -99.2026 },
    the_line_ari: { label: 'Roma Norte (Álvaro Obregón)', lat: 19.4180, lng: -99.1623 },
    central_world: { label: 'Ángel de la Independencia', lat: 19.4270, lng: -99.1677 },
    chatuchak: { label: 'Mercado de Coyoacán', lat: 19.3500, lng: -99.1620 },
    asok: { label: 'Parque México (Condesa)', lat: 19.4118, lng: -99.1700 },
    silom: { label: 'Bosque de Chapultepec', lat: 19.4204, lng: -99.1819 },
    ari_soi5: { label: 'Mercado Roma', lat: 19.4167, lng: -99.1641 },
    iconsiam: { label: 'Centro Santa Fe', lat: 19.3615, lng: -99.2752 },
    mbk: { label: 'Palacio de Bellas Artes', lat: 19.4352, lng: -99.1412 },
    lumphini: { label: 'Aeropuerto AICM T1', lat: 19.4363, lng: -99.0721 },
  };
  const PLACES_BKK = {
    bts_ari: { label: 'BTS อารีย์', lat: 13.7797, lng: 100.5446 },
    samyan: { label: 'สามย่านมิตรทาวน์', lat: 13.7335, lng: 100.5283 },
    siam_paragon: { label: 'สยามพารากอน', lat: 13.7462, lng: 100.5347 },
    the_line_ari: { label: 'เดอะ ลิน อารีย์', lat: 13.7812, lng: 100.5428 },
    central_world: { label: 'เซ็นทรัลเวิลด์', lat: 13.7466, lng: 100.5393 },
    chatuchak: { label: 'ตลาดนัดจตุจักร', lat: 13.7999, lng: 100.5505 },
    asok: { label: 'BTS อโศก', lat: 13.7370, lng: 100.5603 },
    silom: { label: 'สีลม', lat: 13.7286, lng: 100.5340 },
    ari_soi5: { label: 'อารีย์ ซอย 5', lat: 13.7830, lng: 100.5455 },
    iconsiam: { label: 'ไอคอนสยาม', lat: 13.7267, lng: 100.5104 },
    mbk: { label: 'MBK เซ็นเตอร์', lat: 13.7446, lng: 100.5300 },
    lumphini: { label: 'สวนลุมพินี', lat: 13.7314, lng: 100.5414 },
  };
  const PLACES = REGION === 'cdmx' ? CDMX : PLACES_BKK;

  // ---------- utils ----------
  const cache = new Map();
  const memo = async (k, fn) => { if (cache.has(k)) return cache.get(k); const p = fn(); cache.set(k, p); try { return await p; } catch (e) { cache.delete(k); throw e; } };
  const rad = d => d * Math.PI / 180;
  function haversine(a, b) {
    const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
  }
  function pathKm(p) { let d = 0; for (let i = 1; i < p.length; i++) d += haversine(p[i - 1], p[i]); return d; }
  function curve(a, b, n = 24) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, k = 0.15;
    const c = [mx - (b[1] - a[1]) * k, my + (b[0] - a[0]) * k];
    const out = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
    return out;
  }
  function fallbackRoute(a, b) { const km = haversine(a, b) * 1.3; return { distanceKm: +km.toFixed(2), durationMin: Math.max(1, Math.round(km / 22 * 60)), path: curve(a, b), fallback: true }; }
  const fetchJson = (url, ms = 8000) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return fetch(url, { signal: c.signal }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).finally(() => clearTimeout(t)); };
  const loadCss = href => { if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); } };
  const loadJs = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });

  // ---------- SDK loading ----------
  let sdk;
  function ensureSdk() {
    if (sdk) return sdk;
    if (provider === 'google') {
      sdk = new Promise((res, rej) => {
        if (window.google && google.maps && google.maps.Map) return res();
        window.__kmapGoogleReady = () => res();
        loadJs(`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&libraries=geometry,places&language=th&region=TH&loading=async&callback=__kmapGoogleReady`).catch(rej);
      });
    } else {
      loadCss('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css');
      sdk = window.L ? Promise.resolve() : loadJs('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js');
    }
    sdk.catch(() => { sdk = null; });
    return sdk;
  }
  (function css() {
    const s = document.createElement('style');
    s.textContent = `.kmap-el{width:100%;height:100%;min-height:160px}.kmap-ic{background:none;border:0}.kmap-ic>div{transition:transform .3s}.leaflet-container{font-family:inherit}`;
    document.head.appendChild(s);
  })();

  // ---------- marker glyphs ----------
  const CAR = '<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11v6h-2v-1.5H7V17H5zm2.2 0h9.6l-1-3H8.2zM8 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="#fff"/>';
  const BIKE = '<path d="M5 17a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-1.6a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM19 17a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0-1.6a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8zM10 9h3l1-2h3v1.5h-2.1l2.3 3.6-1.3.8-1.4-2.2L12 14H9l-1.5-3H6V9.5h2.5z" fill="#fff"/>';
  const SHOP = '<path d="M5 9l1.5-4h11L19 9v1a2 2 0 0 1-3.5 1.3A2 2 0 0 1 12 11.3 2 2 0 0 1 8.5 11.3 2 2 0 0 1 5 10zm1 3.5h12V19H6z" fill="#fff"/>';
  function markerHtml(kind) {
    const circ = (bg, inner, sz = 36) => `<div style="width:${sz}px;height:${sz}px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24">${inner}</svg></div>`;
    switch (kind) {
      case 'pickup': return { html: `<div style="width:22px;height:22px;border-radius:50%;background:#fff;border:6px solid ${ACCENT};box-shadow:0 2px 6px rgba(0,0,0,.35);box-sizing:border-box"></div>`, size: 22 };
      case 'drop': return { html: `<div style="width:20px;height:20px;background:#1a1a1a;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);box-sizing:border-box"></div>`, size: 20 };
      case 'driver': return { html: circ(ACCENT, CAR), size: 36 };
      case 'rider': return { html: circ(ACCENT, BIKE), size: 36 };
      case 'shop': return { html: circ('#FF7A00', SHOP, 32), size: 32 };
      default: return { html: `<div style="width:18px;height:18px;border-radius:50%;background:#1A73E8;border:3px solid #fff;box-shadow:0 0 0 6px rgba(26,115,232,.2);box-sizing:border-box"></div>`, size: 18 };
    }
  }

  // ---------- services ----------
  async function route(from, to) {
    // accept [lat,lng] or {lat,lng}
    if (from && !Array.isArray(from)) from = [from.lat, from.lng];
    if (to && !Array.isArray(to)) to = [to.lat, to.lng];
    const k = `r:${from[0].toFixed(5)},${from[1].toFixed(5)};${to[0].toFixed(5)},${to[1].toFixed(5)}`;
    try {
      return await memo(k, async () => {
        if (provider === 'google') {
          await ensureSdk();
          const r = await new google.maps.DirectionsService().route({ origin: { lat: from[0], lng: from[1] }, destination: { lat: to[0], lng: to[1] }, travelMode: 'DRIVING' });
          const leg = r.routes[0].legs[0];
          return { distanceKm: +(leg.distance.value / 1000).toFixed(2), durationMin: Math.max(1, Math.round(leg.duration.value / 60)), path: r.routes[0].overview_path.map(p => [p.lat(), p.lng()]) };
        }
        const j = await fetchJson(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`);
        const r = j.routes && j.routes[0]; if (!r) throw new Error('no route');
        return { distanceKm: +(r.distance / 1000).toFixed(2), durationMin: Math.max(1, Math.round(r.duration / 60)), path: r.geometry.coordinates.map(c => [c[1], c[0]]) };
      });
    } catch (e) { return fallbackRoute(from, to); }
  }

  function localSearch(text) {
    const q = text.trim().toLowerCase();
    return Object.values(PLACES).filter(p => p.label.toLowerCase().includes(q)).slice(0, 6).map(p => ({ ...p }));
  }
  async function search(text) {
    if (!text || !text.trim()) return [];
    try {
      return await memo('s:' + text.trim(), async () => {
        if (provider === 'google') {
          await ensureSdk();
          const r = await new google.maps.Geocoder().geocode({ address: text, region: 'TH', componentRestrictions: { country: 'TH' } });
          return r.results.slice(0, 6).map(x => ({ label: x.formatted_address, lat: x.geometry.location.lat(), lng: x.geometry.location.lng() }));
        }
        const j = await fetchJson(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=${REGION === 'cdmx' ? 'mx' : 'th'}&accept-language=${REGION === 'cdmx' ? 'es,th' : 'th'}&limit=6&q=${encodeURIComponent(text)}`);
        return j.slice(0, 6).map(x => ({ label: x.display_name.split(',').slice(0, 3).join(','), lat: +x.lat, lng: +x.lon }));
      });
    } catch (e) { return localSearch(text); }
  }
  async function reverse(lat, lng) {
    const fb = () => { let best, bd = Infinity; for (const p of Object.values(PLACES)) { const d = haversine([lat, lng], [p.lat, p.lng]); if (d < bd) { bd = d; best = p; } } return bd < 1 ? 'ใกล้ ' + best.label : `${lat.toFixed(5)}, ${lng.toFixed(5)}`; };
    try {
      return await memo(`g:${lat.toFixed(5)},${lng.toFixed(5)}`, async () => {
        if (provider === 'google') {
          await ensureSdk();
          const r = await new google.maps.Geocoder().geocode({ location: { lat, lng } });
          return r.results[0] ? r.results[0].formatted_address : fb();
        }
        const j = await fetchJson(`https://nominatim.openstreetmap.org/reverse?format=json&accept-language=th&lat=${lat}&lon=${lng}`);
        return j.display_name ? j.display_name.split(',').slice(0, 3).join(',') : fb();
      });
    } catch (e) { return fb(); }
  }
  function myLocation() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง'));
      navigator.geolocation.getCurrentPosition(p => res([p.coords.latitude, p.coords.longitude]), e => rej(new Error(
        e.code === 1 ? 'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง' : e.code === 3 ? 'หาตำแหน่งไม่ทันเวลา ลองใหม่อีกครั้ง' : 'ไม่สามารถระบุตำแหน่งได้')),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
    });
  }
  const FARES = { bike: [25, 8], car: [40, 10], xl: [60, 14], send: [39, 7] };
  function fare(km, kind) { const f = FARES[kind] || FARES.car; return Math.round(f[0] + f[1] * Math.max(0, +km || 0)); }

  // ---------- map handle ----------
  async function create(el, opts = {}) {
    await ensureSdk();
    const center = opts.center || [PLACES.bts_ari.lat, PLACES.bts_ari.lng];
    const zoom = opts.zoom || 14, interactive = opts.interactive !== false;
    const div = document.createElement('div'); div.className = 'kmap-el'; div.__keep = true; // survives support.js DOM morphing
    // Absolutely fill the container: placeholders are often flex boxes with loading text, which would squeeze the map.
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    div.style.cssText += ';position:absolute;inset:0;z-index:1;min-height:0';
    el.appendChild(div);
    const markers = new Map(); let lines = []; let routePath = null; const clickCbs = [];
    let map, h;
    const G = provider === 'google';
    if (G) {
      map = new google.maps.Map(div, { center: { lat: center[0], lng: center[1] }, zoom, disableDefaultUI: true, zoomControl: interactive, gestureHandling: interactive ? 'greedy' : 'none', clickableIcons: false });
      map.addListener('click', e => clickCbs.forEach(cb => cb({ lat: e.latLng.lat(), lng: e.latLng.lng() })));
    } else {
      map = L.map(div, { center, zoom, zoomControl: false, attributionControl: true, dragging: interactive, scrollWheelZoom: interactive, touchZoom: interactive, doubleClickZoom: interactive, boxZoom: interactive, keyboard: interactive });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      map.on('click', e => clickCbs.forEach(cb => cb({ lat: e.latlng.lat, lng: e.latlng.lng })));
    }
    // Google custom HTML marker via OverlayView
    function gMarker(m) {
      const { html, size } = markerHtml(m.kind);
      const ov = new google.maps.OverlayView();
      const box = document.createElement('div'); box.style.cssText = `position:absolute;width:${size}px;height:${size}px;margin:-${size / 2}px 0 0 -${size / 2}px`; box.innerHTML = html; box.title = m.label || '';
      ov.pos = new google.maps.LatLng(m.lat, m.lng);
      ov.onAdd = function () { this.getPanes().overlayMouseTarget.appendChild(box); };
      ov.draw = function () { const p = this.getProjection(); if (!p) return; const pt = p.fromLatLngToDivPixel(this.pos); box.style.left = pt.x + 'px'; box.style.top = pt.y + 'px'; };
      ov.onRemove = () => box.remove();
      ov.setMap(map);
      return { obj: ov, box, set(lat, lng) { ov.pos = new google.maps.LatLng(lat, lng); ov.draw(); }, remove() { ov.setMap(null); } };
    }
    function lMarker(m) {
      const { html, size } = markerHtml(m.kind);
      const mk = L.marker([m.lat, m.lng], { icon: L.divIcon({ className: 'kmap-ic', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }), title: m.label || '', keyboard: false }).addTo(map);
      if (m.label) mk.bindTooltip(m.label, { direction: 'top', offset: [0, -size / 2] });
      return { obj: mk, get box() { return mk.getElement(); }, set(lat, lng) { mk.setLatLng([lat, lng]); }, remove() { mk.remove(); } };
    }
    function clearLines() { lines.forEach(l => G ? l.setMap(null) : l.remove()); lines = []; }
    const toArr = p => (p && !Array.isArray(p) && typeof p === 'object') ? [p.lat, p.lng] : p;
    const okPt = p => { p = toArr(p); return !!p && isFinite(+p[0]) && isFinite(+p[1]); };
    function drawPath(path) {
      clearLines(); path = (path || []).filter(okPt).map(toArr); routePath = path;
      if (!path || path.length < 2) return;
      if (G) {
        const p = path.map(x => ({ lat: x[0], lng: x[1] }));
        lines.push(new google.maps.Polyline({ map, path: p, strokeColor: '#fff', strokeWeight: 10, strokeOpacity: 1, zIndex: 1 }));
        lines.push(new google.maps.Polyline({ map, path: p, strokeColor: ACCENT, strokeWeight: 6, strokeOpacity: 1, zIndex: 2 }));
      } else {
        lines.push(L.polyline(path, { color: '#fff', weight: 10, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map));
        lines.push(L.polyline(path, { color: ACCENT, weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map));
      }
    }
    const anims = new Set();
    h = {
      el: div, map, provider,
      setMarkers(list) {
        markers.forEach(m => m.remove()); markers.clear();
        (list || []).filter(m => m && isFinite(+m.lat) && isFinite(+m.lng)).forEach(m => markers.set(m.id, Object.assign(G ? gMarker(m) : lMarker(m), { lat: m.lat, lng: m.lng, raf: 0 })));
      },
      moveMarker(id, lat, lng, o = {}) {
        const m = markers.get(id); if (!m || !isFinite(+lat) || !isFinite(+lng)) return;
        cancelAnimationFrame(m.raf);
        if (o.rotate != null && m.box && m.box.firstElementChild) m.box.firstElementChild.style.transform = `rotate(${o.rotate}deg)`;
        const a = [m.lat, m.lng], t0 = performance.now(), D = o.duration || 600;
        const step = now => { const t = Math.min(1, (now - t0) / D), e = t * (2 - t); m.lat = a[0] + (lat - a[0]) * e; m.lng = a[1] + (lng - a[1]) * e; m.set(m.lat, m.lng); if (t < 1) m.raf = requestAnimationFrame(step); };
        m.raf = requestAnimationFrame(step);
      },
      async drawRoute(from, to) { if (!okPt(from) || !okPt(to)) return { distanceKm: 0, durationMin: 0, path: [] }; const r = await route(toArr(from), toArr(to)); drawPath(r.path); return r; },
      drawPath,
      fit(padding = 48) {
        const pts = []; markers.forEach(m => pts.push([m.lat, m.lng])); if (routePath) pts.push(...routePath);
        pts.splice(0, pts.length, ...pts.filter(okPt).map(toArr));
        if (!pts.length) return;
        if (G) { const b = new google.maps.LatLngBounds(); pts.forEach(p => b.extend({ lat: p[0], lng: p[1] })); if (pts.length === 1) map.setCenter(b.getCenter()); else map.fitBounds(b, padding); }
        else if (pts.length === 1) map.setView(pts[0], Math.max(map.getZoom(), 15)); else map.fitBounds(pts, { padding: [padding, padding] });
      },
      onClick(cb) { clickCbs.push(cb); return () => { const i = clickCbs.indexOf(cb); if (i >= 0) clickCbs.splice(i, 1); }; },
      animateAlong(id, path, durationMs = 10000, onProgress) {
        const m = markers.get(id); let raf = 0, stopped = false;
        const ctl = { stop() { stopped = true; cancelAnimationFrame(raf); anims.delete(ctl); } };
        if (!m || !path || path.length < 2) return ctl;
        const seg = [0]; for (let i = 1; i < path.length; i++) seg.push(seg[i - 1] + haversine(path[i - 1], path[i]));
        const total = seg[seg.length - 1] || 1, t0 = performance.now(); let i = 1;
        const step = now => {
          if (stopped) return;
          const t = Math.min(1, (now - t0) / durationMs), d = t * total;
          while (i < seg.length - 1 && seg[i] < d) i++;
          const a = path[i - 1], b = path[i], f = seg[i] > seg[i - 1] ? (d - seg[i - 1]) / (seg[i] - seg[i - 1]) : 1;
          m.lat = a[0] + (b[0] - a[0]) * f; m.lng = a[1] + (b[1] - a[1]) * f; m.set(m.lat, m.lng);
          const box = m.box; if (box && box.firstElementChild) box.firstElementChild.style.transform = `rotate(${Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI}deg)`;
          if (onProgress) try { onProgress(t, [m.lat, m.lng]); } catch (e) { console.error(e); }
          if (t < 1) raf = requestAnimationFrame(step); else anims.delete(ctl);
        };
        cancelAnimationFrame(m.raf); anims.add(ctl); raf = requestAnimationFrame(step);
        return ctl;
      },
      resize() { if (G) google.maps.event.trigger(map, 'resize'); else map.invalidateSize(); },
      destroy() { anims.forEach(a => a.stop()); markers.forEach(m => m.remove()); markers.clear(); clearLines(); if (!G) map.remove(); div.remove(); },
    };
    if (!G) setTimeout(() => map.invalidateSize(), 0);
    if (window.ResizeObserver) new ResizeObserver(() => h.resize()).observe(div);
    return h;
  }

  // ---------- re-render survival ----------
  async function mount(hostSelector, opts = {}) {
    const keeper = document.createElement('div'); keeper.__keep = true; // persistent, outside the rendered tree
    // Fill the placeholder absolutely so placeholder text / flex layout can't squeeze or offset the map.
    keeper.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1';
    const ph = document.querySelector(hostSelector);
    if (ph && getComputedStyle(ph).position === 'static') ph.style.position = 'relative';
    (ph || document.body).appendChild(keeper);
    const h = await create(keeper, opts);
    h.el = keeper;                                            // re-attach the wrapper, not inner div
    const ph2 = document.querySelector(hostSelector); if (ph2 && keeper.parentNode !== ph2) { if (getComputedStyle(ph2).position === 'static') ph2.style.position = 'relative'; ph2.appendChild(keeper); }
    // Leaflet/Google need a size recalculation whenever the container changes size (sheet animations, keyboard, rotation).
    if (window.ResizeObserver) new ResizeObserver(() => h.resize()).observe(keeper);
    h.resize();
    return h;
  }
  function keepAlive(component, selector, handle) {
    const base = component.__render;
    const reattach = () => {
      const ph = document.querySelector(selector);
      if (ph && handle.el.parentNode !== ph) { if (getComputedStyle(ph).position === 'static') ph.style.position = 'relative'; ph.appendChild(handle.el); handle.resize && handle.resize(); setTimeout(() => handle.resize && handle.resize(), 60); }
    };
    component.__render = function () { const r = base.apply(this, arguments); reattach(); return r; };
    reattach();
    return () => { component.__render = base; };
  }

  // Compatibility: screens may treat a location as [lat,lng] or {lat,lng}; also accept reverse({lat,lng}).
  const asLatLng = p => { const a = [p[0], p[1]]; a.lat = p[0]; a.lng = p[1]; return a; };
  const myLocation2 = () => myLocation().then(asLatLng);
  const reverse2 = (lat, lng) => (lat && typeof lat === 'object') ? reverse(lat.lat != null ? lat.lat : lat[0], lat.lng != null ? lat.lng : lat[1]) : reverse(lat, lng);
  window.kmap = { provider, PLACES, region: REGION, create, mount, keepAlive, route, search, reverse: reverse2, myLocation: myLocation2, fare, haversine, _ensureSdk: ensureSdk };
})();
