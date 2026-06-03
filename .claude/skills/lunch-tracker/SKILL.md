---
name: lunch-tracker
description: >
  Full operations guide for Victor's Lunch Tracker web app (lunche-81567.web.app).
  Use whenever Victor mentions the Lunch Tracker, asks to add/edit a bill or payment,
  deploy the app or share page, upload a receipt photo, reconcile balances, or says someone
  transferred money for lunch. Also use when Victor sends a screenshot of a bank transfer or
  a receipt photo and says to update the app. Covers data model, Cloudflare Worker API,
  Firebase Hosting deploy, date-based bill IDs, the realtime share page, and team members.
---

# Lunch Tracker — Operations Guide

> Secrets live in `.env` (gitignored). Load them, never hard-code:
> ```bash
> set -a; . /Users/victor/Documents/lunche/.env; set +a
> ```
> Keys: `CLOUDFLARE_API_TOKEN`, `WORKER_URL`, `WORKER_SECRET`, `FIREBASE_PROJECT_ID`,
> `FIREBASE_API_KEY`, `APP_URL`, `SHARE_PAGE_URL`.

## Quick Reference

| What | Value |
|---|---|
| App URL | https://lunche-81567.web.app |
| Share/update page | https://lunche-81567.web.app/update-bill.html?bill=<billNo> |
| Firebase project | lunche-81567 |
| Worker | https://falling-wood-1078.viet-le-worker.workers.dev |
| Source dir | /Users/victor/Documents/lunche |
| Collections | `bills`, `payments`, `members`, `shops` |

## Files in the repo
- `index.html` — the web app (Firebase compat SDK, realtime via `onSnapshot`).
- `update-bill.html` — the no-login share page (realtime via `onSnapshot`); also embedded in the Worker as `UPDATE_BILL_HTML`.
- `cloudflare_worker_v2.js` — the API Worker (addBill, addPayment, addMember, updateDoc, deleteDoc, deployHTML) + SePay bank-webhook auto-matcher.
- `.env` / `.env.example` — secrets / template.

---

## Team Members (Vietnamese bank name → English name)

| English | Vietnamese |
|---|---|
| Malie | Hoa | 
| Emily | Nhi |
| Gerard | Duc |
| Parker | Hung |
| Duke | Duong |
| Currie | Cuong |
| Nero | Nguyen |
| Gracie | Tuyet |
| Vin | Vu |
| Victor | Viet (the owner/payer) |
| Jimmy | Khanh |

Map the Vietnamese transfer name to the English `en` used everywhere in the app.

---

## Data Model

### bills
```json
{ "date": "03 Jun 2026", "total": 280000, "billNo": "0306261",
  "note": "#0306261 Mỳ Quảng - ... - 9 người",
  "shop": "<shopDocId>", "photoData": "data:image/jpeg;base64,...",
  "items": [ { "en": "Victor", "vn": "", "dish": "Cơm Gà Xé", "price": 35000 } ] }
```
- `items` = ONE entry per person. `dish` = comma-joined dish names, `price` = SUM of those dishes.
- `shop` (shop doc id) makes the share page show dish checkboxes.
- `items` may be empty `[]` — people self-assign via the share link.

### payments
```json
{ "en": "Gerard", "vn": "Duc", "amount": 40000, "covers": "03 Jun 2026",
  "date": "03 Jun 2026", "method": "Bank Transfer", "billId": "<billDocId>" }
```
- `covers` is always a SINGLE date. Never lump multiple days into one payment.
- `billId` links the payment to a specific bill (set by Worker/parser/quick-pay).

---

## Bill IDs are DATE-BASED  (since Jun 2026)

Format: **`DDMMYY` + bill-of-day sequence**, stored as a **string** (keeps leading zero).
- 3 Jun 2026, 1st bill = `0306261`, 2nd = `0306262`.
- The Worker counts ALL bills on that calendar date (incl. old integer-numbered ones) so the sequence is the true "Nth bill of the day".
- When a payer copies/scans they see e.g. `Emily 0306261n30` → reads as 03/06, bill 1, 30k.
- **Old bills #1–#20 keep their integer numbers.** The bank webhook parser understands BOTH: 1–2 digit old IDs and 6–8 digit date codes (`/\b(\d{1,2}|\d{6,8})n(\d+)\b/`).

---

## Cloudflare Worker API (call with POST + curl)

bash_tool can reach workers.dev, so call via curl POST with a JSON body. Always check
`success: true` in the response.

```bash
set -a; . /Users/victor/Documents/lunche/.env; set +a
curl -s -X POST "$WORKER_URL" -H "Content-Type: application/json; charset=utf-8" \
  -d "{\"action\":\"addBill\",\"secret\":\"$WORKER_SECRET\",\"date\":\"03 Jun 2026\",\"total\":280000,\"note\":\"Mỳ Quảng - ... - 9 người\"}"
```

For Unicode (Vietnamese) or large base64 photos, write the JSON to a file and use `--data-binary @file`.

### Actions
- **addBill** — `date`, `total`, `note`, optional `photoData`. Auto-assigns the date-based `billNo` (string) and prepends `#billNo` to the note. Returns `{success, id, billNo, note}`. Does NOT take `shop`/`items` — set those with a follow-up `updateDoc`.
- **addPayment** — `en`, `vn`, `amount`, `covers`, optional `date`/`method`/`photoData`. Rejects duplicate `(en + covers)` with `{success:false, error:"duplicate", existingId}` — if so, update the existing one instead of re-adding.
- **addMember** — `en`, `vn`, …
- **updateDoc** — `collection`, `docId`, `fields:{...}` (nested arrays/maps OK; integers→integerValue, strings→stringValue).
- **deleteDoc** — `collection`, `docId`.
- **deployHTML** — see deploy section.

---

## Deploying

### Worker
```bash
cd /Users/victor/Documents/lunche
set -a; . ./.env; set +a
npx wrangler deploy cloudflare_worker_v2.js   # wrangler reads CLOUDFLARE_API_TOKEN from env
```

### App + share page (Firebase Hosting)
`deployHTML` ships BOTH `/index.html` (passed in) AND `/update-bill.html` (from the
Worker's `UPDATE_BILL_HTML` constant) in one version.
```bash
cd /Users/victor/Documents/lunche
python3 - <<'EOF'
import json, subprocess
src = open("index.html","r",encoding="utf-8").read()
open("/tmp/deploy_index.json","w",encoding="utf-8").write(
    json.dumps({"action":"deployHTML","secret":"<WORKER_SECRET>","html":src}))
print(subprocess.run(["curl","-s","-X","POST","<WORKER_URL>",
  "-H","Content-Type: application/json; charset=utf-8",
  "--data-binary","@/tmp/deploy_index.json"],capture_output=True,text=True).stdout)
EOF
```
(Substitute `<WORKER_SECRET>`/`<WORKER_URL>` from `.env`.) Always send **raw HTML** (not base64).

### Editing the share page (`update-bill.html`)
1. Edit `update-bill.html`.
2. Re-embed it into the `UPDATE_BILL_HTML` constant in `cloudflare_worker_v2.js`
   (escape `` ` ``, `${`, and `\`), then `node --check` + deploy the Worker.
3. Run the deployHTML script above (pushes both files).
See `references/deploy.md`.

---

## Receipt photos
1. Compress with PIL: `ImageOps.exif_transpose`, max 1200px wide, JPEG quality 75 → base64 data URL.
2. Attach via `addBill` `photoData` (new bill) or `updateDoc` `{photoData}` (existing). POST handles the size; do NOT use GET.
3. **macOS file access:** photos in `~/Downloads` often carry a `com.apple.macl` attribute that blocks reads (`Operation not permitted`). Ask Victor to copy the file into the repo folder (`cp "~/Downloads/Media (N).jpeg" /Users/victor/Documents/lunche/`) and read it there, then delete it.

---

## RULES (bugs fixed — never repeat)
1. **Bill date format = always `"DD Mon YYYY"`** (e.g. `03 Jun 2026`), never ISO `2026-06-03`. The app's bill-save was fixed to convert via `fromInputDate`. Wrong format breaks `normDate()`/day-of-week sorting.
2. **One payment = one day.** Multiple days in a transfer ("Malie 11n30 12n35") → separate payments per day.
3. **Two restaurants same day = two separate bills** (each its own date-based ID; sequence counts both).
4. After `addPayment`, verify `success:true`. On `error:"duplicate"`, update the existing payment, don't re-add.
5. **Date-coded billNo is a string** — preserve leading zeros everywhere (never `parseInt` it for display/links).
6. Both the app and the share page are **realtime** (`onSnapshot`). No manual refresh needed for data; only a hard refresh (Cmd+Shift+R) after a *code* deploy (HTML is cached `max-age=3600`).

## Verifying data (read-only)
Query Firestore REST with the Firebase API key:
```
https://firestore.googleapis.com/v1/projects/lunche-81567/databases/(default)/documents/<collection>?pageSize=300&key=<FIREBASE_API_KEY>
```
