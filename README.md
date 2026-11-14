# kasion_framework

ชุดเริ่มต้นสำหรับทำแอปของ kasion ให้เร็ว: รวม stack และฟังก์ชันที่ใช้ซ้ำจาก `kasion_delivery` และ `kasion_date`
ไว้ในที่เดียว สร้างแอปใหม่ได้ในคำสั่งเดียว แล้วเขียนเฉพาะฟีเจอร์ของแอปนั้น

**Stack:** Cloudflare Worker + D1 + Durable Object (realtime) + ไฟล์ static · ล็อกอินด้วย Google ผ่าน Firebase ·
หน้าจอเขียนด้วย Vue 3 + Vant 4 (ฝังไฟล์ไว้ใน `public/vendor/` ไม่มีขั้นตอน build) · โมดูลเสริมติดตั้งได้ทีละตัว

## เริ่มแอปใหม่

```bash
node bin/create.mjs kasion_notes --title "kasion notes" --domain notes.kasion.dev --accent "#3B82F6" --admin you@gmail.com --with profile,safety,feed --provision
```

โมดูลเสริม (`--with …` ตอนสร้าง หรือ `npm run kasion -- add <ชื่อ>` ในแอป): `profile` โปรไฟล์ · `safety` บล็อก/รายงาน ·
`feed` กระดานโพสต์ · `rooms` ห้องแชตกลุ่ม · `people` คนออนไลน์/ใกล้ฉัน · `invites` ลิงก์ชวนเพื่อน · `admin` หน้าผู้ดูแล ·
`wallet` กระเป๋าเงิน + เติมพร้อมเพย์ · `maps` แผนที่ — รายละเอียดใน [docs/features.md](docs/features.md) หน้าจอเขียนตาม [docs/vue.md](docs/vue.md)

คำสั่งอื่น: `kasion list` · `kasion update` (ดึง core รุ่นใหม่เข้าแอป) · `kasion doctor` (ตรวจการตั้งค่า)

- ชื่อแอปเป็น snake_case เสมอ โฟลเดอร์ใหม่จะอยู่ข้าง ๆ `kasion_framework`
- `--provision` สร้างฐานข้อมูล D1 และรัน migration ให้ (ทั้งในเครื่องและบน Cloudflare)
- ต้องใช้ Node 22 สำหรับ wrangler: `export PATH="$HOME/.nvm/versions/node/v22.23.1/bin:$PATH"`

จากนั้น:

```bash
cd ../kasion_notes
npm run dev        # http://localhost:8787/?as=alice  ล็อกอินจำลอง ใช้ได้เฉพาะในเครื่อง
npm run check      # ตรวจ syntax ทุกหน้าและ worker
npm run deploy     # ตรวจแล้ว deploy
```

ทำครั้งเดียวต่อแอป:
1. Firebase Console → Authentication → Settings → Authorized domains → เพิ่มโดเมนของแอป
2. `npm run push:keys` ถ้าจะใช้แจ้งเตือนตอนปิดแอป
3. ถ้าจะใช้โทร: ใส่ `AGORA_APP_ID` ใน `wrangler.jsonc`, `KASION.agoraAppId` ใน `public/app.config.js` แล้วรัน `npx wrangler secret put AGORA_APP_CERTIFICATE`

## ได้อะไรมาบ้าง

| ส่วน | ไฟล์ | ทำอะไร |
|---|---|---|
| ตัวแอป | `src/core/app.js` | router, ตรวจ token, ตาราง `users`, สิทธิ์ admin, จำกัดความถี่, socket |
| ล็อกอิน | `src/core/auth.js` | ตรวจ Firebase ID token และล็อกอินจำลองสำหรับทดสอบในเครื่อง |
| Realtime | `src/core/hub.js` | Durable Object ตัวเดียว ใช้ได้ทั้ง socket ส่วนตัวและห้องรวม |
| แชต | `src/core/chat.js` | ข้อความส่วนตัว พร้อมติ๊ก ส่งแล้ว / ถึงแล้ว / อ่านแล้ว |
| โทร | `src/core/calls.js`, `agora.js` | โทรเสียงและวิดีโอผ่าน Agora |
| แจ้งเตือน | `src/core/push.js` | Web Push ตอนปิดแอป |
| รูป | `src/core/images.js` | เก็บรูปที่บีบอัดแล้วใน D1 |
| จ่ายเงิน | `src/core/pay.js` | เชื่อม pay.kasion.dev (PromptPay + ตรวจสลิป) |
| หน้าจอ | `public/kasion.js` | runtime, ล็อกอิน, `api()`, realtime, เสียง, ดูรูป, ติดตั้งเป็นแอป, route ใน URL |
| หน้าตัวอย่าง | `public/*.html` | หน้าแรก (ฟีด realtime), login, แชต, โทร, ตั้งค่า, หน้าเปล่า |

## เอกสาร

- [docs/server.md](docs/server.md) — เขียน API: route, context, ปลั๊กอิน, migration
- [docs/runtime.md](docs/runtime.md) — เขียนหน้าจอ: template, state, routeKeys, ตัวช่วยทั้งหมด
- [docs/recipes.md](docs/recipes.md) — สูตรที่ใช้บ่อย: ฟีด realtime, ห้องแชต, อัปโหลดรูป, หน้า admin, เติมเงิน
- [docs/gotchas.md](docs/gotchas.md) — ข้อผิดพลาดที่เคยเจอจริง และวิธีเลี่ยง
- [CLAUDE.md](CLAUDE.md) — คำแนะนำสำหรับ Claude ตอนทำงานกับ framework นี้

## ดูแล framework

```bash
npm test    # สร้างแอปทดสอบในโฟลเดอร์ชั่วคราว รันในเครื่อง ติดตั้งทุกโมดูลผ่าน CLI แล้วตรวจทุก route (121 ข้อ)
```

แก้ `template/src/core/` หรือ `template/public/kasion.js` แล้วต้องรัน `npm test` ทุกครั้ง
แอปที่สร้างไปแล้วอัปเดต core ได้โดยคัดลอก `template/src/core/` และ `template/public/kasion.js` ไปทับ (ดูเลขรุ่นใน `src/core/VERSION`)
