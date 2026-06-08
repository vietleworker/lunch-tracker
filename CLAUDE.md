# Lunch Tracker — Claude Notes

> **Full guide:** see the `lunch-tracker` skill at `.claude/skills/lunch-tracker/`
> (`SKILL.md` + `references/deploy.md` + `references/troubleshooting.md`). The troubleshooting
> file is the complete operations/handoff doc (Firestore-rules fix, service account, git, gotchas).

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
- Worker auto-assigns a **date-based `billNo`** (string): `DDMMYY` + bill-of-day sequence,
  e.g. `0306261` (3 Jun 2026, 1st bill), `0306262` (2nd). Counts all bills on that calendar date.
- billNo is a STRING (keeps leading zero) — never `parseInt` it for display/links.
- Worker auto-prepends `#billNo` to note: `"#0306261 Quan My - ..."`. Just pass the raw note.
- Old bills #1–#20 keep integer numbers; everything understands both.

### 2. addPayment — Duplicate check built in
- Worker now rejects duplicate `(en + covers)` with `{success: false, error: "duplicate"}`
- If you get `success: false`, DO NOT call again — update the existing payment instead

### 3. Bill date format — always "DD Mon YYYY"
- Always use `"23 May 2026"` format, NOT `"2026-05-23"`
- Wrong format breaks `normDate()` matching in the app

### 4. QR / transfer-content scan uses billNo
- Content token = `billNo` + `n` + amountK: `"Duke 0306261n35"` = bill 0306261, 35k.
- SePay webhook parser (Worker) matches BOTH old (1–2 digit) and new (6–8 digit date-code) IDs:
  regex `/\b(\d{1,2}|\d{6,8})n(\d+)\b/`. billNo kept as string.
- **Parser NEVER falls back to day-of-month.** Unknown bill ID → 422, payment NOT created.

### 5. One payment per day per person
- `covers` must always be a single date like `"23 May 2026"`
- Never lump multiple days into one payment record
- If transfer message has multiple days (e.g. "Malie 11n30 12n35 13n35"), add SEPARATE payments for each day

### 6. Verify Worker response after addPayment
- Always check `success: true` before reporting done
- If `success: false, error: "duplicate"` → tell Victor and ask whether to update existing

### 7. Photo upload
- Compress with PIL: max 1200px wide, JPEG quality 75, EXIF transpose → base64 data URL.
- Attach via Worker **POST** (`addBill` photoData, or `updateDoc {photoData}`). POST handles size; never GET.
- ~/Downloads photos often have `com.apple.macl` → unreadable; copy into the repo dir first, then read & delete.

### 8. Two bills today (different shops)
- Each shop visit = separate bill with its own date (sequence counts both that day).
- Don't merge two restaurants into one bill.

### 9. Firestore "test mode" rules expire → app 403s
- If the webapp loads but can't read data (client 403, but Worker writes still work), the
  Firestore security rules expired. Fix = deploy non-expiring rules via the embedded service
  account. Full script in `.claude/skills/lunch-tracker/references/troubleshooting.md` §1.

### 10. Use curl, not Python urllib
- Python `urllib` fails TLS verification in this environment. Always call HTTPS via `curl`.

---

## Handoff (new machine / account)
- Repo carries the **service-account key + Worker secret** (in `cloudflare_worker_v2.js`) and the
  **Firebase web config** (in `index.html`). The only secret NOT in git is `CLOUDFLARE_API_TOKEN`
  (in `.env`, gitignored) — copy `.env` over or mint a new token. See `.env.example`.
- **Keep this repo PRIVATE** — it contains the SA private key. If leaked, rotate SA key + Worker
  secret + Cloudflare token. Note: `origin` URL has a GitHub PAT embedded (rotate / use SSH).
