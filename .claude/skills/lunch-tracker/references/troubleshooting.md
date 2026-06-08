# Troubleshooting & Handoff

Everything a fresh session (or new machine/account) needs to fully operate the app.

---

## 0. Handoff — moving to a new machine / account

The repo (`github.com/vietleworker/lunch-tracker`) contains almost everything:
- `index.html`, `update-bill.html`, `cloudflare_worker_v2.js`, `CLAUDE.md`, `.claude/skills/…`, `wrangler.toml`.
- The **service-account private key** AND the **Worker secret** are baked into
  `cloudflare_worker_v2.js` (`SA_EMAIL`, `SA_KEY`, `SECRET` near line 378). So a clone can
  deploy + manage Firebase without anything extra.
- The **Firebase web config** (apiKey etc.) is in `index.html` (public by design).

**The ONLY secret not in git is `CLOUDFLARE_API_TOKEN`** (lives in `.env`, which is gitignored).
On a new machine either copy `.env` over, or create a fresh Cloudflare API token (Workers Scripts:Edit)
and put it in `.env`. See `.env.example` for the full key list.

> Because the SA key + worker secret are in the committed source, treat this repo as
> **sensitive — keep it private**. If it ever leaks, rotate: the SA key (GCP console →
> service accounts), the worker `SECRET` (edit the const + redeploy), and the Cloudflare token.

---

## 1. "App won't load" / stuck on "Connecting…" / Firestore 403

**Symptom:** `https://lunche-81567.web.app` loads the HTML but never shows data; a client
Firestore read returns `403 PERMISSION_DENIED` ("Missing or insufficient permissions"), yet
**Worker writes still succeed** (because the service account bypasses rules).

**Cause:** Firestore was left on Google's **test-mode rules that auto-expire**:
```
allow read, write: if request.time < timestamp.date(YYYY, M, D);
```
Once that date passes, all *client SDK* access is denied. (Happened 6 Jun 2026.)

**Diagnose:**
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
 "https://firestore.googleapis.com/v1/projects/lunche-81567/databases/(default)/documents/bills?pageSize=1&key=<FIREBASE_API_KEY>"
# 200 = fine ; 403 = rules deny client access
```

**Fix (no console needed)** — use the SA embedded in the Worker to deploy non-expiring rules.
The app has **no Firebase Auth** and does client-side reads *and* writes, so the working rule is
open read+write (this just restores prior behaviour):
```python
# run with: python3 - <<'PY'   (cwd = repo root)
import re, json, base64, subprocess, time
src=open("cloudflare_worker_v2.js").read()
email=re.search(r'SA_EMAIL\s*=\s*"([^"]+)"',src).group(1)
key=re.search(r'SA_KEY\s*=\s*`(-----BEGIN PRIVATE KEY-----.*?-----END PRIVATE KEY-----)`',src,re.S).group(1)
open("/tmp/sa.pem","w").write(key+"\n")
b64u=lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")
curl=lambda a: subprocess.run(["curl","-s"]+a,capture_output=True,text=True).stdout
now=int(time.time())
hdr=b64u(json.dumps({"alg":"RS256","typ":"JWT"}).encode())
clm=b64u(json.dumps({"iss":email,"scope":"https://www.googleapis.com/auth/firebase",
  "aud":"https://oauth2.googleapis.com/token","iat":now,"exp":now+3600}).encode())
open("/tmp/ji","wb").write((hdr+"."+clm).encode())
sig=subprocess.run(["openssl","dgst","-sha256","-sign","/tmp/sa.pem","/tmp/ji"],capture_output=True).stdout
jwt=hdr+"."+clm+"."+b64u(sig)
tok=json.loads(curl(["-X","POST","https://oauth2.googleapis.com/token",
  "-d","grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer","--data-urlencode","assertion="+jwt]))["access_token"]
RULES="rules_version='2';\nservice cloud.firestore{match /databases/{database}/documents{match /{document=**}{allow read, write: if true;}}}\n"
open("/tmp/rs.json","w").write(json.dumps({"source":{"files":[{"name":"firestore.rules","content":RULES}]}}))
new=json.loads(curl(["-X","POST","https://firebaserules.googleapis.com/v1/projects/lunche-81567/rulesets",
  "-H","Authorization: Bearer "+tok,"-H","Content-Type: application/json","--data-binary","@/tmp/rs.json"]))["name"]
open("/tmp/rel.json","w").write(json.dumps({"release":{"name":"projects/lunche-81567/releases/cloud.firestore","rulesetName":new},"updateMask":"rulesetName"}))
print(curl(["-X","PATCH","https://firebaserules.googleapis.com/v1/projects/lunche-81567/releases/cloud.firestore",
  "-H","Authorization: Bearer "+tok,"-H","Content-Type: application/json","--data-binary","@/tmp/rel.json"]))
import os; [os.remove(f) for f in ["/tmp/sa.pem","/tmp/ji","/tmp/rs.json","/tmp/rel.json"]]
PY
```
Verify the diagnose curl returns 200 afterwards. Then clean up temp files.

> **Better long-term fix (not yet done):** route ALL writes through the Worker, then set
> `allow read: if true; allow write: if false;` so clients can only read. Requires changing the
> app's `db.collection().add/update/delete` calls to Worker POST calls.

---

## 2. Service account (embedded in the Worker)

- Email: `firebase-adminsdk-fbsvc@lunche-81567.iam.gserviceaccount.com`
- Private key: `SA_KEY` const in `cloudflare_worker_v2.js` (~line 382).
- Bypasses Firestore security rules (that's why Worker writes always work).
- Scopes you can mint: `…/auth/datastore` (Firestore), `…/auth/firebase.hosting` (Hosting deploy),
  `…/auth/firebase` or `…/auth/cloud-platform` (Firestore **rules** via firebaserules API).
- Auth pattern: JWT (RS256, sign with `openssl dgst -sha256 -sign`) → exchange at
  `oauth2.googleapis.com/token` → Bearer token. The Worker does this internally; from a laptop use
  the Python+openssl+curl pattern above.

---

## 3. Environment gotchas

- **Python `urllib` fails TLS** here (`CERTIFICATE_VERIFY_FAILED`, no certifi). **Always use `curl`**
  for HTTPS from Python (`subprocess.run(["curl",...])`), not `urllib.request`.
- **macOS photo permission:** files in `~/Downloads` often have `com.apple.macl` → reads give
  `Operation not permitted` even with sandbox off. Copy into the repo dir first:
  `cp "~/Downloads/Media.jpeg" /Users/victor/Documents/lunche/` then read & delete.
- **Hosting cache:** HTML served `cache-control: max-age=3600`. After a *code* deploy, hard refresh
  (Cmd+Shift+R). Data is realtime (`onSnapshot`) and needs no refresh.

---

## 4. Git

- Remote: `github.com/vietleworker/lunch-tracker`, default branch **main** (history is direct-to-main).
- Commit only when asked; push only when asked. Commit message footer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- ⚠️ The `origin` URL has a **GitHub PAT embedded** (`https://ghp_…@github.com/…`). It is in
  `.git/config` (not committed) but is a leak risk — prefer SSH or a credential helper, and rotate
  the token. Older commits may also contain the worker token (it was in CLAUDE.md before sanitising).

---

## 5. Shop IDs (collection `shops`)

| Shop | doc id |
|---|---|
| Bún Huế | `FbHhkdxxilQl1N0NETbx` |
| Ra Cafe | `LLLEtYXnBMBKiBWP0KAp` |
| Quán Mỳ Quảng | `i5bnBlF5dJxSQNoXUP50` |
| Quán Cơm Gà | `qk7k450AY4935I17TZd6` |

Set `bill.shop` to one of these so the share page shows tickable dishes. Match a bill to its shop
by diacritic-insensitive substring of the note vs shop name.

---

## 6. Data hygiene (learned reconciling May/Jun 2026)

- **Duplicate payments** happen (double-submits). Dedupe key = `(en, normalized-covers, amount, billId)`;
  keep earliest `createTime`, delete the rest via `deleteDoc`.
- **Two bills same day** (e.g. food + drinks): a `covers`-only payment (no `billId`) is counted against
  BOTH → double counting. Fix by assigning each payment the correct `billId` (match the person's
  amount to their item price in each same-day bill).
- **Outstanding negative** in the app = **over-collected** (someone paid extra), not "still owed".
- **Bill total vs sum(items):** if they disagree, the `total` field is usually the stale/wrong one
  (the app's bill edit once saved ISO dates and could leave totals out of sync). Verify against the
  receipt photo.

## 7. Verify data (read-only)
```
https://firestore.googleapis.com/v1/projects/lunche-81567/databases/(default)/documents/<collection>?pageSize=300&key=<FIREBASE_API_KEY>
```
Collections: `bills`, `payments`, `members`, `shops`. Also `meta/auth` holds the app edit password.
