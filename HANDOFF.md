# Mini HR App — Handoff Update (2026-06-29)

Continuation handoff for the production rollout (Google Apps Script + LINE OA + LIFF) for TNC Garment.

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
