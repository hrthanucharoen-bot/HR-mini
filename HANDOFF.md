# Mini HR App — Handoff Update (2026-06-30)

Continuation handoff for the production rollout (Google Apps Script + LINE OA + LIFF) for TNC Garment.

## UPDATE 2026-06-30 (afternoon) — Two-deployments gotcha discovered; webhook now serves HEAD

### TL;DR for whoever resumes
1. The Apps Script project has **TWO separate web-app deployments** (different deployment IDs / URLs):
   - **`Fix nextEmployee...`** ID `AKfycbwaVVPmsvFIc-...9XCuGkSp6fA` — what `docs/register.html` and `docs/leave.html` POST to (LIFF backend).
   - **`Reduce to register+leave only...`** ID `AKfycbxjf7arvbNZNBStophA_...UQJw` — what the **LINE webhook** URL in the LINE Developers Console actually targets.
2. `Manage deployments → Edit → New version → Deploy` updates **only the entry you selected** — it does NOT propagate to other deployments. The morning's v23 redeploy refreshed only the LIFF deployment; the webhook deployment was still serving a v19 snapshot from a much earlier session that predates `handleLineWebhook` in `Router.gs`. Every postback (approve/reject/list_pending_leave button) was therefore failing with `ReferenceError: handleLineWebhook is not defined`, logged into the `Logs` sheet as a `doPost` error.
3. Fixed at **30 มิ.ย. 12:54** by repeating `Manage deployments → click "Reduce to register..." entry → pencil → dropdown → เวอร์ชันใหม่ → Deploy`. Resulting **v24** keeps the same deployment ID + URL, so the LINE webhook URL is unchanged — it just now points to a snapshot that has `handleLineWebhook + processWebhookEvent + handlePostback + handleTextMessage + handleFollowEvent + parsePostbackData`.
4. **Going forward: any backend code change requires deploying BOTH entries.** Do it via two passes through Manage deployments. There is no "deploy all" button.

### Other things from this session
- **Approver chains set on the Employees sheet** so ปฏิพัทธ์ (EMP-0003) can exercise the approval flow end-to-end as the proxy owner. Both EMP-0002 (Jane) and EMP-0003 have `approver_L1_id = approver_L2_id = EMP-0003`. Self-approval on EMP-0003 is intentional for this test round only — it forces tester to tap "อนุมัติ" twice to walk the L1→L2 state machine.
- **Mistake to avoid:** triple_click + ctrl+a + Delete inside the deployment dialog will, if the dialog has lost focus to the editor pane behind it, **wipe whatever .gs file is currently open**. Happened once mid-session — wiped Router.gs entirely; recovered via Ctrl+Z (12 strokes) and the file's autosave hadn't fired yet so nothing was lost. When typing the deployment description, look at the dialog after clicking the description box before typing, and prefer leaving the description unchanged if you can't visually confirm focus.
- **`docs/*.html` URLs are unchanged.** Both `register.html:61` and `leave.html:108` still point at the `AKfycbwaVVPmsvFIc-...9XCuGkSp6fA` URL — that's the LIFF deployment, which is correct. Don't repoint them at the webhook deployment URL by mistake.

### ApprovalCard postback data format — to verify after the next test
Local `src/flex/ApprovalCard.gs` builds postback `data` as a **query-string** (`action=...&id=...&level=...&type=...`) and live `Router.gs.parsePostbackData` parses by `split('&')`. That matches. But the failed postback row in `Logs` (row 176, before the v24 fix) shows the actual postback data coming through as a **JSON object**: `{"action":"approve","id":"LV-20260630-0001","type":"leave","level":"L1"}`. Two possibilities: (a) live `ApprovalCard.gs` was edited at some point to build JSON instead of query-string (drift from local repo — entirely plausible given prior live-vs-local drift), or (b) something in the postback path JSON-encodes the data string. After the next button-press test, re-check Logs to see whether `data.action === 'approve'` actually parses — if `parsePostbackData` returns `{}` (no '&' delimiter), the second `if` falls through and the user gets `'คำสั่งไม่ถูกต้อง'`. If that happens, patch `parsePostbackData` to try `JSON.parse(dataStr)` first then fall back to query-string split. (Not patching speculatively now — wait for evidence.)

### Suspicious leftover files in the live Apps Script project
- `ไม่มีชื่อ.gs` — contains `setupStep4RichMenus` and helpers (`createRichMenu_`, `uploadRichMenuImage_`, `setDefaultRichMenu_`, `linkRichMenuToSpecificUser_`). Functionally superseded by `RichMenuSetup.gs`. **Symbols overlap** — `createRichMenu_` etc. are declared in both files. In V8 runtime the second declaration wins, but it's fragile. Safe to delete this file after confirming nothing else calls `setupStep4RichMenus()`.
- `ไฟล์ที่ไม่มีชื่อ 3 รายการ.gs` — contains a stub `myFunction()` plus `setupAdminGuardrails()` (the one-shot data-validation installer; harmless to leave or move). Not interfering with anything.
- Neither was the cause of the postback failure — that was purely the deployment-snapshot mismatch — but the duplicate-symbol risk in `ไม่มีชื่อ.gs` is worth cleaning up next time you're in the editor.

---

## UPDATE 2026-06-30 — Employee menu trimmed to register+leave; 2 NEW BUGS DISCOVERED (not yet fixed)

### What landed this session (all deployed live)

- **Rich menus reduced.** Employee menu = 2 buttons (`ลงทะเบียน`, `ส่งใบลา`). Owner menu = 1 button (`คำขอลารออนุมัติ`, postback `action=list_pending_leave`). Images generated locally by `scratchpad/make-richmenu-images.ps1` (GDI+ vector icons; supplementary-plane emoji rendered as tofu so were replaced with hand-drawn primitives) and committed to `docs/assets/{employee,owner}-menu.png` (2500×843, <1 MB). Created via new live `RichMenuSetup.gs` (`setupReducedRichMenus()` + `verifyRichMenus()`). Owner linked to `Ud33c1d12d516bdedec84ac0d2a7a845d`. Old rich menus deleted.
- **Backend trimmed.** Live `Router.gs` `ACTION_HANDLERS` = `{register, leave: submitLeave, leave_balance: getLeaveBalance}`. `handlePostback` dispatches `approve/reject` → `processApprovalPostback` and `list_pending_leave` → `listPendingLeaveForOwner`. Live `รหัส.gs` `allowedPages = ['register','leave']`. `handleApiGet` restricted to `api=leave_balance` only (other api values → `{ok:false,error:'forbidden'}`). All `checkin/ot/balance/evidence/hr_*/payment` actions removed from routing — POST `action=checkin` now returns `{ok:false,error:'unknown_action'}` (verified). Handler files themselves were NOT deleted (shared helpers like `isOwner()`, `uploadImage()` still needed).
- **Leave flow code.** `submitLeave` quota-exceeded message hardcoded to `คุณใช้สิทธิ์ในการลาครบกำหนดแล้ว กรุณาแจ้ง HR โดยตรง`. New `getLeaveBalance(payload)` returns sick/personal/vacation quota+used for current year. `processApprovalPostback`/`doApprove`/`doReject` hardcoded to leave only (OT branch + `need_info` removed). `buildLeaveApprovalCard` no longer renders the need-info button. `listPendingLeaveForOwner(userId, replyToken)` pushes one Flex card per pending leave for the owner.
- **GitHub Pages.** New `docs/leave.html` (JSONP balance fetch + client-side quota pre-check with exact Thai message + `no-cors` submit fallback). LIFF `2010518964-j0VESTLK` endpoint repointed in LINE Console to `https://hrthanucharoen-bot.github.io/HR-mini/leave.html`. `docs/register.html` `APPS_SCRIPT_URL` bumped to v22 deployment.
- **Active deployment** = `AKfycbwaVVPmsvFIc-ggLXamg6kggrcNAsBrucAHC9gOM3u8vcm0I0VeRiSKVA_9XCuGkSp6fA/exec` (v22).

### Bugs fixed mid-session

1. `handlePostback` called `processApprovalPostback(event, data)` but actual signature is `(payload)` — every approve/reject silently failed. Fixed by constructing merged payload.
2. Duplicate file `ไฟล์ที่ไม่มีชื่อ 2 รายการ.gs` had a stale `doGet` that shadowed the main one (Apps Script last-loaded wins). Diagnosed because `?page=checkin` still rendered despite trimmed `allowedPages`. **File deleted.**
3. `SheetStore.gs` quota helpers had wrong sheet constant (`SHEETS.LEAVEQUOTA` → `SHEETS.LEAVE_QUOTA`), wrong schema (`annual_quota` → sick/personal/vacation triple), and wrong `deductLeaveQuota` signature (4 args → 1 arg record). Rewritten to match actual sheet shape.

### 🚨 BUGS DISCOVERED THIS SESSION — BOTH NOW FIXED

**Bug A — `nextEmployeeId()` produced wrong IDs (HIGH) — FIXED.** Old live `Utils.gs:62` used `sheet.getLastRow()` which counts rows with **any cell content including dropdown/validation formatting**. `setupAdminGuardrails()` applied data validation through Employees!A2:A1000 → `getLastRow()` returned ~999 → today's owner test-register produced **EMP-0999** instead of EMP-0003. **Replaced live with** (saved in editor, Utils.gs lines 62-70):
```js
function nextEmployeeId() {
  var rows = getAllRows(SHEETS.EMPLOYEES.name);
  var max = 0;
  rows.forEach(function(r) {
    var m = String(r.employee_id || '').match(/EMP-(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'EMP-' + padLeft(max + 1, 4);
}
```
Pasted via clipboard (avoids the Apps Script editor's auto-bracket compounding). Ran from editor → no error. Next register call should now return EMP-0004 (max of EMP-0002 + EMP-0003 = 3).

**Bug B — what looked like an owner duplicate was actually two real employees (corrected diagnosis) — FIXED.** Opening the live `Employees` sheet showed:

| row | employee_id | line_user_id | display_name | phone |
|-----|---|---|---|---|
| 2 | EMP-0002 | `Uae8148cab432...` | Jane Piya | 937381303 |
| 3 | EMP-0999 (now EMP-0003) | `Ud33c1d12d516...` | ปฏิพัทธ์ วงศ์สุทธิ | 825249362 |

Both rows have a real `line_user_id` and are real people — **not** a duplicate. The prior assumption that EMP-0002 had empty `line_user_id` was wrong. The two LINE IDs are different humans:
- `Uae8148cab432...` = Jane Piya (registered earlier — the row mentioned in the 2026-06-29 update was always real)
- `Ud33c1d12d516...` = ปฏิพัทธ์ วงศ์สุทธิ, who test-registered today and got EMP-0999 because of Bug A. **Note (clarified by user later in session):** ปฏิพัทธ์ is a regular employee, not the actual system owner. The `OWNER_LINE_USER_ID` script property + the rich-menu link target both currently point at his LINE ID — that's an inconsistency to resolve once the real owner registers (see "Owner role mis-pointed" below).

**Fix applied (sheet edits, no row deleted):**
- `Employees` A3: `EMP-0999` → `EMP-0003` (formula bar confirmed)
- `LeaveQuota` A3: `EMP-0999` → `EMP-0003`
- No row deleted. No code change for this bug.

Verified after the fix: `Employees` has 2 real rows (EMP-0002 Jane, EMP-0003 owner). `LeaveQuota` has matching rows. `setupAdminGuardrails()`'s dropdown validation on approver columns will now correctly offer EMP-0002 and EMP-0003.

### Deployment status — v23 live, URL unchanged

Bug A fix is now in production. Apps Script Manage deployments → Edit → New version → Deploy (description: "Fix nextEmployeeId() to scan max EMP-NNNN (was overcounted by getLastRow against validation rows)"). Result: **เวอร์ชัน 23 / 30 มิ.ย. 2026 11:48**. Because the Edit-existing-deployment path preserves the deployment ID, the `/exec` URL is **unchanged** (`AKfycbwaVVPmsvFIc-ggLXamg6kggrcNAsBrucAHC9gOM3u8vcm0I0VeRiSKVA_9XCuGkSp6fA/exec`) — verified via JS query on the Manage deployments dialog matches the URL already hardcoded in `docs/register.html:61` and `docs/leave.html:108`. No GitHub commit needed for the URL bump.

Next registration call will exercise the new `nextEmployeeId()` and should return `EMP-0004`.

### Approver setup — staged for E2E test with ปฏิพัทธ์ as proxy approver

Per user's request to test the approval flow before bringing in the real owner, set both employees' approver chains to ปฏิพัทธ์ via the dropdowns on the Employees sheet:

| row | approver_L1_id | approver_L2_id |
|---|---|---|
| EMP-0002 Jane | EMP-0003 | EMP-0003 |
| EMP-0003 ปฏิพัทธ์ | EMP-0003 | EMP-0003 |

Self-approval on EMP-0003 is intentional and only for this round of testing — once the real owner registers we'll set L2 (and L1 where appropriate) to the owner's `employee_id` instead. The L1=L2 setup also means tester must tap "อนุมัติ" twice (once for L1 → pending_L2, once for L2 → approved) to exercise the full state machine.

### ⚠ Owner role mis-pointed (open inconsistency)

`OWNER_LINE_USER_ID` and the owner rich-menu link both target ปฏิพัทธ์'s LINE userId (`Ud33c1d12d516…` = EMP-0003), but ปฏิพัทธ์ is a regular employee, not the actual system owner. The real owner has not registered yet and has no row in `Employees`.

When ready to bring in the real owner:
1. Owner taps the "ลงทะเบียน" button on the employee rich-menu in their own LINE → gets EMP-0004 (Bug A fix kicks in).
2. Update Script Properties: `OWNER_LINE_USER_ID` → owner's LINE userId.
3. Run `setupReducedRichMenus()` again — it deletes the old menus, recreates them, and links the owner menu to the new userId.
4. On Employees sheet, change `approver_L2_id` (and `approver_L1_id` if desired) of EMP-0002 + EMP-0003 from `EMP-0003` to `EMP-0004`.

### Task #17 verification — programmatic parts done, manual phone testing left

Done: `POST action=checkin` → `unknown_action` ✅; `GET ?page=checkin` → 404 ✅; sheet row counts (Checkins/OT/Payments/Leaves all 0) ✅; rich menu API confirms 2 menus exist with correct areas ✅; owner linked to owner-menu-v2 ✅.

Still to do **on the actual LINE mobile client** (cannot automate):
- Register button opens LIFF, fills user, submits, gets welcome message
- Leave button opens LIFF, balance pre-fills, submit valid leave → row in `Leaves`, manager gets Flex card
- Submit over-quota leave → exact Thai rejection, no Sheet write
- Submit `unpaid` type → bypasses quota
- L1 approve → status `pending_L2`, owner Flex notification fires
- L2 approve → status `approved`, employee notified
- Reject at either level → status `rejected`
- Owner rich-menu button → Flex list of pending leaves (or "ไม่มีคำขอลารออนุมัติ" if empty)

### Files of note

- Live Apps Script (source of truth, NOT git): `รหัส.gs`, `Router.gs`, `handlers/Approval.gs`, `handlers/Leave.gs`, `flex/ApprovalCard.gs`, `SheetStore.gs`, `RichMenuSetup.gs` (new), `Utils.gs` (Bug A FIXED — `nextEmployeeId` rewritten + saved; needs redeploy to take effect).
- Local repo files updated this session: `docs/leave.html` (new), `docs/register.html` (URL bumped), `docs/assets/employee-menu.png` (new), `docs/assets/owner-menu.png` (new), `scratchpad/make-richmenu-images.ps1` (kept in scratchpad, not committed).
- Plan file (still relevant): `C:\Users\ADMIN\.claude\plans\ot-misty-riddle.md`.

### Constraints still in force

- All browser work in Chrome under `hr.thanucharoen@gmail.com`.
- Never enter LINE secrets/tokens/passwords/API keys into any form on the user's behalf.
- Live Apps Script editor is production source of truth; local `src/` may differ.
- Do NOT delete unused handler/LIFF files in the live project — only unwire from routing (exception was the duplicate-doGet "Untitled" file which had no other functionality).
- When typing multi-line code into the Apps Script editor, write as a single minified line (no embedded newlines) — the editor's auto-bracket-closer inserts extra `}` otherwise.

---

## UPDATE 2026-06-29 (later) — Registration CONFIRMED working + back-office = Google Sheet guardrails

- **Registration now works end-to-end.** `Employees` sheet has real rows: EMP-0001 (curl test, junk — safe to delete) and **EMP-0002 = the owner's real LINE registration** (`Uae8148cab43...`, phone 0937381303, is_active checked). The 3-bug fix (jsonOutput wrap + register handler optional bank/selfie/idcard + GitHub Pages hosting) is validated.
- **Back-office decision:** building a separate web admin was blocked by cross-origin **reads** (CORS blocks reading Apps Script responses from github.io; a JSONP `doGet?api=` bridge was added in `รหัส.gs` + `handleApiGet()` but a deployment kept serving the page instead of JSONP — left parked/unverified). Per user choice, the back-office is the **Google Sheet itself with guardrails** instead.
- **Guardrails applied** via `setupAdminGuardrails()` (a new untitled `.gs` file in the project; re-runnable). Confirmed live on `Employees`/`LeaveQuota`:
  - `is_active` (col R) → checkboxes
  - `approver_L1_id` / `approver_L2_id` (cols O/P) → dropdown limited to existing `employee_id` (Employees!A2:A1000)
  - `LeaveQuota` quotas (sick/personal/vacation) → number ≥ 0
  - `LeaveQuota.employee_id` → dropdown of existing employee_ids
  - System columns protected warning-only: Employees A,B (id/lineId), M,N (image urls), S (registered_at); LeaveQuota D,F,H (*_used)
- **How the owner manages staff:** edit `display_name` directly; set approvers via the O/P dropdowns; **deactivate by un-checking `is_active`** (do NOT delete rows — preserves history); set leave quotas on the `LeaveQuota` tab (add a row per employee/year if missing). Delete the EMP-0001 test row.
- The JSONP/admin-web path, if revisited: the read-CORS wall is real; either finish the `doGet?api=` JSONP bridge (verify the deployment actually picks up the api branch) or host the backend somewhere that returns CORS headers. `handleApiGet()` + the `doGet` api line are already in `รหัส.gs` (saved); active deployment with them is **v18** `AKfycbwnxxOPXwTaHGsbYK1FjvMO8Ryza7cbPKf4a6RK_hw4ijIq3FcPQOZX5G_Ue1bUg5jHNQ` (register.html still points to v16 — fine, register works).

## TL;DR of this session

The registration ("register") LIFF flow was broken. Root-caused and fixed **three stacked bugs**. Registration LINE-ID auto-fill now works; backend write fixed; pending final end-to-end confirmation in LINE.

## CRITICAL ARCHITECTURE CHANGE — LIFF pages must NOT be hosted on Apps Script

**Confirmed on-device (alert showed origin `n-...-script.googleusercontent.com`):** Apps Script `HtmlService`/`doGet` serves user HTML inside a nested sandbox iframe on a `*.googleusercontent.com` origin. The LIFF endpoint is registered as `script.google.com/.../exec`, so the running page's origin never matches → `liff.init()` cannot get the LINE client context → `getProfile()` never returns → the LINE-ID field stays blank.

**Fix = host each LIFF page on a top-level domain.** We use **GitHub Pages**:
- Repo: `hrthanucharoen-bot/HR-mini`, Pages source = branch `main`, folder `/docs`.
- `register` page: `docs/register.html` → served at `https://hrthanucharoen-bot.github.io/HR-mini/register.html`
- The static page hardcodes `LIFF_ID` + `APPS_SCRIPT_URL` and calls Apps Script `/exec` **only as a backend API** via `fetch` POST with `Content-Type: text/plain` (simple request; plus a `no-cors` fallback in the catch to survive any CORS read failure — backend de-dupes by lineUserId so retries are safe).
- The LIFF **endpoint URL** in LINE console was changed from the Apps Script URL → the GitHub Pages URL.

**The old `liff/*.html` files in the repo (Apps Script-templated, `<?= LIFF_ID ?>`) are now obsolete for LIFF use.** The other 8 LIFF apps still need the same migration (see Remaining work).

## Three bugs fixed this session

1. **doGet path prefix** (earlier): `รหัส.gs doGet` used `createTemplateFromFile(page)` but files are named `liff/<page>`. Fixed to `'liff/' + page`; default page `'register'`. (Now moot for register since it's on GitHub Pages, but still relevant for any Apps Script-served page.)
2. **doPost returned a raw object**: `รหัส.gs doPost` (~line 56) did `return routeAction(action, body);`. `routeAction` (Router.gs) returns **plain objects**, so Apps Script rejected the response with "script completed but the return value is not a supported result type" → client saw "Failed to fetch". Fixed to `return jsonOutput(routeAction(action, body));`.
3. **register handler required the OLD schema**: `handlers/Register.gs register()` still had `if (!bankAccountNo) return ... missing_bank`, plus `missing_selfie` / `missing_id_card`, and an unconditional image-upload block that returned `upload_failed`. The simplified form only sends `displayName/phone/lineUserId/department/position`, so register() returned `missing_bank` and never wrote the row (Employees stayed empty). Fixed: removed those 3 validations (now optional) and guarded the upload with `if (selfieBase64 && idCardBase64) try { ... }`.

## Current live IDs / URLs

- Google Sheet DB: `1RXzMpPJkIyKJ0ydVNNpoOYXq_4wcJLWoSWIGuPjgoNU`
- Apps Script project: `10Juj0moR123zmZ-1dnH-0v3PdWSSofXIO2oe6vmK1Ak4O5dHDwgoW4EU`
- **Active web-app deployment (v16, 2026-06-27 18:22), access = Anyone:**
  - `https://script.google.com/macros/s/AKfycbxFUO1ksK1vqOeEhIiWwfdiYvTL4yaQCr3M_wwbZbIfDj5aUNE_BUI_0SctiUp3B5EDlA/exec`
  - NOTE: each new deployment gets a new `/exec` URL. The GitHub Pages `register.html` `APPS_SCRIPT_URL` must be kept in sync with whatever deployment is active. (Older deployments AKfycbyj…, AKfycbx0… are superseded.)
- LINE Login channel ID: `2010518964` — **status: Published** (changed from Developing this session; required so non-developers can open the LIFF).
- Register LIFF ID: `2010518964-DU5sTlpj` — endpoint now `https://hrthanucharoen-bot.github.io/HR-mini/register.html`, scopes `openid, profile`, size Full.
- Owner LINE user ID: `Ud33c1d12d516bdedec84ac0d2a7a845d`

## Constraints (still in force)

- Do all browser work in **Chrome under hr.thanucharoen@gmail.com** (not CLI/clasp/desktop). Editing Apps Script is via the web editor only.
- Never enter LINE secrets/tokens/passwords into any form — the user does that personally.
- The live Apps Script editor is the production source of truth; local repo `src/` may differ.

## Apps Script web-editor gotchas (learned the hard way)

- The version dropdown in "Manage deployments → edit (pencil)" is flaky; selecting "New version" often doesn't stick. **Prefer "New deployment"** (always uses latest saved code) — but it mints a new `/exec` URL, so update `register.html` after.
- The editor auto-closes brackets: typing `try {` or `if (...)` inserts a matching `}`/`)`. After typing, delete the stray closing char.
- Do NOT send `Page_Down` via the key tool — it gets typed as literal text into the file. Use `ctrl+End`, `Home`, `shift+End`, `ctrl+F` (these work).

## Remaining work

1. **Confirm register end-to-end** (pending): user registers in LINE → expect "ลงทะเบียนเรียบร้อย" → verify a row appears in `Employees` (header-only as of last check). Test rows `U_TEST_CURL_000x` may exist from curl attempts — clean them up.
2. **Migrate the other 8 LIFF pages to GitHub Pages** the same way (checkin, leave, ot, balance, hr-tools, approval-inbox, evidence, response): create `docs/<page>.html` static versions (hardcode LIFF_ID per page + APPS_SCRIPT_URL), push, and repoint each LIFF endpoint in the LINE console.
3. Set/verify rich menu links point to the `liff.line.me/<liffId>` URLs.
4. Add remaining employees + set approver_L1 (manager) / approver_L2 (owner).
5. Full real flow test: checkin (IN/OUT) → leave → approval L1→L2 → view results.
6. Security: LINE webhook signature verification is currently disabled (UNSAFE) — see `รหัส.gs doPost` Case 1; needs a proxy (e.g. Cloudflare Worker) to verify, since Apps Script can't read request headers.

NOTE (already in live code, confirmed this session): the 2-level approval restructure from the plan (`L1=ผู้จัดการ → L2=เจ้าของ`, statuses `pending_L1/pending_L2/approved`) and 2-slot checkin appear to be implemented in `handlers/Approval.gs` etc.

## How to continue

1. Open Apps Script project `10Juj0moR123zmZ-1dnH-0v3PdWSSofXIO2oe6vmK1Ak4O5dHDwgoW4EU` in Chrome (hr.thanucharoen@gmail.com).
2. For LIFF page changes, edit `docs/*.html` locally, `git push`, GitHub Pages auto-deploys (~1 min). For backend changes, edit in the web editor, save, then **New deployment** and update `register.html`'s `APPS_SCRIPT_URL`.
3. Verify in the `Employees` sheet and the `Logs` sheet (has `doPost_debug` / `register:*` entries).
