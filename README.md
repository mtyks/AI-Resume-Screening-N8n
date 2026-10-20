# Resume Screening

ระบบคัดกรองใบสมัครงานอัตโนมัติ: ผู้สมัครส่งใบสมัครผ่านหน้าเว็บ → n8n ให้ AI (Gemini) อ่าน Resume และประเมินเทียบเกณฑ์ตำแหน่ง → HR/Admin ดูผลและจัดการผ่านเว็บ

```
เว็บ (React + Vite, GitHub Pages)
  ├─ ผู้สมัคร ── Edge Function submit-application ──► n8n webhook ──► Supabase (DB + Storage) + Gemini
  └─ HR/Admin ── Supabase Auth (Google) + RLS ──────► Supabase
```

## โครงสร้างโปรเจกต์

| โฟลเดอร์ | เนื้อหา |
|---|---|
| `src/` | เว็บ (หน้าสมัคร, Dashboard, ตั้งค่าตำแหน่ง, Log, Admin) |
| `src/api/` | ชั้นข้อมูล: `supabase.ts` (ของจริง) และ `mock.ts` (โหมดทดลอง) |
| `supabase/` | Edge Function `submit-application`, SQL migration, config |
| `n8n/` | export ของ workflow (`Resume-Screening-Main`, `Resume-Screening-Notify-Errors`) |
| `.github/workflows/` | deploy ขึ้น GitHub Pages อัตโนมัติ |

## รันในเครื่อง

```bash
npm install
cp .env.example .env     # ใส่ค่า Supabase (ดูด้านล่าง)
npm run dev              # http://localhost:5173
```

ไม่มี `.env` = โหมดทดลองด้วยข้อมูลจำลอง (ล็อกอินด้วยบัญชีตัวอย่าง `admin@example.com` / `hr@example.com`)

ตัวแปรใน `.env`: `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY` (anon/publishable key เปิดเผยฝั่งเว็บได้ ความปลอดภัยอยู่ที่ RLS) **ห้ามใส่ service role key หรือ `x-api-key` ของ webhook ในเว็บ**

## Deploy ขึ้น GitHub Pages

1. push โปรเจกต์ขึ้น GitHub (branch `main`)
2. Settings → Pages → Source = **GitHub Actions**
3. Settings → Secrets and variables → Actions → แท็บ **Variables** เพิ่ม `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY`
4. push อีกครั้ง (หรือรัน workflow เอง) จะได้ลิงก์ `https://<user>.github.io/<repo>/`
5. หน้าสมัครงานคือลิงก์หลัก เจ้าหน้าที่เข้าที่ `.../#/login`

ใช้ HashRouter จึงไม่ต้องตั้ง rewrite ฝั่งเซิร์ฟเวอร์ และทำงานใต้ path ย่อยของ Pages ได้

## ตั้งค่า Supabase

1. รัน `supabase/migrations/*.sql` (SQL Editor) แล้วเพิ่มอีเมล Admin คนแรกใน `authorized_users`
2. Authentication → Providers → **Google**: ใส่ Client ID/Secret
3. Authentication → URL Configuration: ใส่ลิงก์ GitHub Pages (และ `http://localhost:5173`) ใน **Site URL / Redirect URLs**
4. ฝั่ง Google Cloud: ใส่ Redirect URI ที่ Supabase แสดงในหน้า Google provider
5. Edge Function: `supabase functions deploy submit-application` แล้วตั้ง secrets
   - `N8N_WEBHOOK_URL` = `https://<โดเมน n8n>/webhook/resume-application`
   - `N8N_WEBHOOK_KEY` = ค่าเดียวกับ credential "Resume Webhook - Shared Secret" ใน n8n (Header `x-api-key`)
6. Storage: bucket `resumes` ตั้งเป็น **private**

## ตั้งค่า n8n

- import `n8n/*.json` แล้วผูก credentials: Supabase service role (Header Auth), Gemini หลัก/สำรอง (Header Auth), Webhook shared secret (Header Auth), Gmail (สำหรับ workflow แจ้งเตือน)
- เปิด (Activate) ทั้ง 2 workflow
- ตัวกวางานในโหนด 7.x ประมวลผลผู้สมัครที่ค้าง `pending` ทุก 5 นาที ปุ่ม "สแกนซ้ำ" ในเว็บแค่ตั้งสถานะกลับเป็น `pending`

## กติกาคะแนน

- คิดจากทักษะที่ต้องมี / ทักษะที่ควรมี / เครื่องมือ เท่านั้น (ปรับน้ำหนักให้รวม 100%) ประสบการณ์ไม่นำมาคิด
- ทักษะที่ต้องมีข้อใดมั่นใจต่ำกว่า 50 = ไม่ผ่าน Gate (คะแนนถูกจำกัดที่ เกณฑ์ผ่าน − 10)
- ประสบการณ์ที่ผู้สมัครเลือกในฟอร์มใช้เป็นธงให้ HR เท่านั้น ระบบไม่อ่านจำนวนปีจาก Resume

## สิทธิ์

| | HR | Admin |
|---|---|---|
| ดูผู้สมัคร/ผลคะแนน, เปลี่ยนสถานะการสมัคร, สแกนซ้ำ | ✓ | ✓ |
| ตั้งค่าตำแหน่ง (เกณฑ์ผ่าน, ทักษะ, ช่วงเปิดรับ) | ✓ | ✓ |
| ดู Log, จัดการผู้ใช้, แก้ข้อมูลผู้สมัคร, สลับ AI | | ✓ |

สิทธิ์บังคับที่ฐานข้อมูลด้วย RLS ไม่ใช่แค่ซ่อนเมนูในหน้าเว็บ
