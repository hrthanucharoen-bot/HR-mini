# Mini HR App — Handoff / Continuation Notes

> เอกสารนี้สรุปสถานะปัจจุบันของโปรเจกต์ "Mini HR App" (Google Apps Script + LINE/LIFF)
> สำหรับส่งไม้ต่อให้เครื่องมืออื่น (เช่น Codex) ทำงานต่อ เมื่อ Claude Code ติด usage limit
> อัปเดตล่าสุด: 2026-06-26

## Goal

ทำให้ระบบ HR App (เช็คอิน/ลา/OT/อนุมัติ ผ่าน LINE OA + LIFF) **ใช้งานได้จริง** (production-ready)
ไม่ใช่แค่ scaffolding — ตามคำสั่งเดิม: "จัดการให้ใช้งานได้จริง"

## Key IDs / Resources

| รายการ | ค่า |
|---|---|
| Google Sheet (Database) | `1RXzMpPJkIyKJ0ydVNNpoOYXq_4wcJLWoSWIGuPjgoNU` |
| Apps Script Project (Script ID) | `10Juj0moR123zmZ-1dnH-0v3PdWSSofXIO2oe6vmK1Ak4O5dHDwgoW4EU` |
| Drive folder "Mini HR App - Files" | `1QDS1HJxeVkSyq16BfHymiEjIxjQi7lrW` |
| Web App URL (deployed) | `https://script.google.com/macros/s/AKfycbyqQ8lpbEUMpYSlWP7B9UCiYPmwuabVu5yIiBLQ5HjRmi53boc4cguSRATox_bAZeGn9w/exec` |
| LINE Provider | "hr" |
| Messaging API Channel | "Thanuchai HR" (Channel ID `2010512630`), Bot Basic ID `@304wbrty`, Bot userId `Ue6524b812d05b70d1d70f28c36c1ed63` |
| LINE Login (LIFF) Channel | "Mini HR LIFF" (Channel ID `2010518964`) — 9 LIFF apps created |
| GitHub repo (source pushed) | https://github.com/hrthanucharoen-bot/HR-mini (branch `main`) |
| Current Apps Script deployment | **Version 4** |
| **Owner's LINE userId** (ดึงจาก Logs sheet) | `Ud33c1d12d516bdedec84ac0d2a7a845d` |

## Accounts in use

- Google account สำหรับ Apps Script/Sheets/Drive ทั้งหมด: **hr.thanucharoen@gmail.com**
- ต้องใช้ **Chrome browser** เท่านั้นสำหรับงานที่เกี่ยวกับ Google Apps Script editor / Sheets UI / LINE Developers Console (ไม่ใช่ clasp/CLI สำหรับ deploy งานในเซสชันนี้ — ทำผ่าน browser UI โดยตรง)
- GitHub: repo เป็นของบัญชี `hrthanucharoen-bot`; เครื่อง local ผูก credential กับบัญชี `tncgarmentthanuchai-th` ซึ่งถูกเพิ่มเป็น collaborator (Write access) แล้ว — push ได้แล้ว

## Security constraint (สำคัญมาก — ห้ามฝ่าฝืน)

**ห้าม AI agent กรอก/ป้อนค่า LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET หรือ password/API key/token ใดๆ ลงในฟอร์มเองเด็ดขาด** — ผู้ใช้ต้องเป็นคนกรอกค่าที่เป็นความลับด้วยตัวเองเสมอ ปัจจุบันค่าเหล่านี้ถูกตั้งไว้ใน Script Properties แล้วโดยผู้ใช้

## Architecture notes (สำคัญ — โค้ดใน editor ≠ โค้ด local)

⚠️ **โค้ดใน Apps Script editor (ที่ deploy จริง) แตกต่างจากไฟล์ source local ในโฟลเดอร์นี้** บาง function ใน editor ถูกแก้ไข signature ไปแล้ว (เช่น `handleFollowEvent(event)` ใน editor เทียบกับ `handleFollowEvent(userId, replyToken)` ใน local `Router.gs`) — **ก่อนแก้โค้ดใดๆ ต้องเปิด Apps Script editor ดูโค้ดจริงก่อน อย่าเชื่อไฟล์ local เพียงอย่างเดียว**

Bug ที่เคยพบและ fix แล้วใน editor (Version 4):
1. `Code.gs` doPost: เคยเรียก `handleLineWebhook(body.events)` ผิด — ต้องเป็น `handleLineWebhook(body)` เพราะ `Router.gs` รับ `body` เต็มแล้วดึง `body.events` เอง
2. `Router.gs` `handleLineWebhook`: ต้อง return `jsonOutput({ ok: true })` ไม่ใช่ plain object `{ ok: true }`

## Script Properties status (14 รายการ)

- ✅ DRIVE_FOLDER_ID, SHEET_ID, APPS_SCRIPT_URL — ตั้งค่าจริงแล้ว
- ✅ LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET — ผู้ใช้ตั้งเองแล้ว (ค่าจริง)
- ✅ LIFF_ID_* (9 ตัว) — อัปเดตเป็น LIFF ID จริงแล้วทั้งหมด
- ❌ **OWNER_LINE_USER_ID = "REPLACE_ME" (ยังไม่ตั้งค่า)** — ต้องเปลี่ยนเป็น `Ud33c1d12d516bdedec84ac0d2a7a845d`

## Roadmap (step-by-step ที่ผู้ใช้ขอ — ห้ามข้ามขั้นตอน)

| # | Step | สถานะ |
|---|------|------|
| 1 | หา OWNER_LINE_USER_ID จาก Logs (ส่งข้อความเข้า LINE OA) | ✅ เสร็จแล้ว — ได้ค่า `Ud33c1d12d516bdedec84ac0d2a7a845d` |
| 2 | ตั้งค่า OWNER_LINE_USER_ID ใน Script Properties | 🔄 **ทำต่อจากนี้** — ไปที่ Apps Script Project Settings → Script Properties → แก้ค่า OWNER_LINE_USER_ID เป็นค่าด้านบน → Save |
| 3 | ลงทะเบียนตัวเอง (เจ้าของ/HR) เป็นพนักงานคนแรกผ่าน LIFF | ⏳ |
| 4 | ตั้งค่า Rich Menu ให้เชื่อมกับ 9 LIFF apps | ⏳ |
| 5 | เพิ่มพนักงานคนอื่น + กำหนดผู้อนุมัติ (approver_L1/L2) | ⏳ |
| 6 | ทดสอบ flow จริง: เช็คอิน → ลา → อนุมัติ → ดูผล | ⏳ |
| 7 | ปิดช่องโหว่ความปลอดภัย (LINE signature verification ที่ปิดอยู่) | ⏳ |

## Separate future work (ยังไม่เริ่ม — มี plan แยกไว้แล้ว)

มี plan ละเอียดอยู่ที่ `C:\Users\ADMIN\.claude\plans\ot-misty-riddle.md` (ไม่ได้อยู่ใน repo นี้) สำหรับปรับโครงสร้างองค์กร 2 เรื่อง:
1. ลดระดับอนุมัติจาก 3 ระดับ (L1 หัวหน้าทีม → L2 ผู้จัดการ → L3 เจ้าของ) เป็น **2 ระดับ** (L1 ผู้จัดการ → L2 เจ้าของ) — ไม่มีหัวหน้าทีมคั่นกลาง
2. ลดช่วงเช็คอินจาก 4 ช่วง (IN/LUNCH_OUT/LUNCH_IN/OUT) เป็น **2 ช่วง** (IN/OUT เท่านั้น)

**นอกสโคป — ห้ามแก้:** การคำนวณเงินเดือน, การตั้งค่า/คำนวณ OT

ไฟล์ที่เกี่ยวข้องกับงานนี้ระบุไว้ละเอียดใน plan file ข้างต้น (Config.gs, handlers/Approval.gs, handlers/Leave.gs, handlers/OT.gs, handlers/Register.gs, handlers/Checkin.gs, flex/*.gs, liff/*.html, docs/*.md)

## How to continue (สำหรับ Codex หรือเครื่องมืออื่น)

1. เปิด repo นี้ (`mini-hr-app`) — code ปัจจุบันถูก push ขึ้น GitHub แล้วที่ branch `main`
2. **อย่าลืม**: โค้ดใน repo นี้อาจไม่ตรงกับโค้ดที่ deploy จริงบน Apps Script (ดู "Architecture notes" ด้านบน) — ถ้าจะแก้ไขโค้ดที่ deploy จริง ต้องเปิด Apps Script editor (Script ID ด้านบน) ตรวจโค้ดจริงก่อนแก้
3. ทำตาม Roadmap ต่อจาก Step 2
4. **ย้ำ security constraint**: ห้ามกรอก credential ใดๆ ให้ผู้ใช้เอง — ต้องให้ผู้ใช้กรอกเอง
