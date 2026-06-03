# Lunch Tracker — Claude Notes

## Deploy Cloudflare Worker
Secrets live in `.env` (gitignored). Load them, then deploy:
```bash
cd /Users/victor/Documents/lunche
set -a; . ./.env; set +a          # exports CLOUDFLARE_API_TOKEN, WORKER_SECRET, ...
npx wrangler deploy cloudflare_worker_v2.js
```

## Deploy Firebase (index.html)
```python
python3 << 'EOF'
import json, subprocess, os
secret = os.environ["WORKER_SECRET"]   # run `set -a; . ./.env; set +a` first
with open("index.html", "r", encoding="utf-8") as f:
    html_raw = f.read()
payload = json.dumps({"action":"deployHTML","secret":secret,"html":html_raw})
with open("/tmp/deploy_index.json","w",encoding="utf-8") as f:
    f.write(payload)
result = subprocess.run(["curl","-s","-X","POST",
    "https://falling-wood-1078.viet-le-worker.workers.dev",
    "-H","Content-Type: application/json; charset=utf-8",
    "--data-binary","@/tmp/deploy_index.json"],capture_output=True,text=True,timeout=120)
print(result.stdout)
EOF
```
⚠️ ALWAYS send raw HTML (not base64) — deployHTML expects plain string, not encoded.

## Deploy update-bill.html (share page)
The share page lives on Firebase Hosting at `https://lunche-81567.web.app/update-bill.html?bill=N`.
`deployHTML` ships BOTH `/index.html` AND `/update-bill.html` in one version (the latter
from the `UPDATE_BILL_HTML` constant at the top of the Worker). To update the share page:
1. Edit `/Users/victor/Documents/lunche/update-bill.html`
2. Re-embed it into `UPDATE_BILL_HTML` in `cloudflare_worker_v2.js` (escape `\`` and `${`), deploy Worker
3. Run the deployHTML script above (pushes both files to Hosting)

## Key IDs
- Firebase project: `lunche-81567`
- App URL: https://lunche-81567.web.app
- Share/update page: https://lunche-81567.web.app/update-bill.html?bill=N
- Cloudflare Worker: https://falling-wood-1078.viet-le-worker.workers.dev
- Worker secret: in `.env` as `WORKER_SECRET` (not committed)

---

## RULES — Bugs fixed, never repeat these

### 1. addBill — Worker auto-handles everything now
- Worker auto-assigns `billNo` (max + 1)
- Worker auto-prepends `#billNo` to note: `"#15 Quan My - ..."` 
- Just pass the raw note, Worker does the rest

### 2. addPayment — Duplicate check built in
- Worker now rejects duplicate `(en + covers)` with `{success: false, error: "duplicate"}`
- If you get `success: false`, DO NOT call again — update the existing payment instead

### 3. Bill date format — always "DD Mon YYYY"
- Always use `"23 May 2026"` format, NOT `"2026-05-23"`
- Wrong format breaks `normDate()` matching in the app

### 4. Bill must have billNo before QR Scan works
- QR scan content uses bill number: `"Duke 14n35"` = bill #14, 35k
- Worker now assigns billNo automatically on creation ✓
- **Parser A NEVER falls back to day-of-month.** If bill ID not found → returns 422 error, payment NOT created.
- All bills always have billNos. If a payment fails with "Bill #X not found", check billNo in Firestore.

### 5. One payment per day per person
- `covers` must always be a single date like `"23 May 2026"`
- Never lump multiple days into one payment record
- If transfer message has multiple days (e.g. "Malie 11n30 12n35 13n35"), add SEPARATE payments for each day

### 6. Verify Worker response after addPayment
- Always check `success: true` before reporting done
- If `success: false, error: "duplicate"` → tell Victor and ask whether to update existing

### 7. Photo upload
- Compress with PIL: max 1200px wide, JPEG quality 75, apply EXIF rotation
- Use Firebase SDK HTML tool (NOT Worker updateDoc GET — URL too long for base64)
- Check ~/Downloads for recent .jpeg files when user sends receipt photo

### 8. Two bills today (different shops) 
- Each shop visit = separate bill with its own date
- Don't merge two restaurants into one bill
