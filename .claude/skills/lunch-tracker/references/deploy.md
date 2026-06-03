# Deploy Reference

Secrets come from `.env` (gitignored): `set -a; . /Users/victor/Documents/lunche/.env; set +a`

## 1. Deploy the Worker
```bash
cd /Users/victor/Documents/lunche
set -a; . ./.env; set +a
node --check cloudflare_worker_v2.js        # validate syntax first
npx wrangler deploy cloudflare_worker_v2.js  # uses $CLOUDFLARE_API_TOKEN
```

## 2. Deploy app + share page (Firebase Hosting)
`deployHTML` ships BOTH files in one version:
- `/index.html` ← the `html` you POST
- `/update-bill.html` ← the Worker's `UPDATE_BILL_HTML` constant

```bash
cd /Users/victor/Documents/lunche
python3 - <<'EOF'
import json, subprocess
src = open("index.html","r",encoding="utf-8").read()
open("/tmp/deploy_index.json","w",encoding="utf-8").write(
    json.dumps({"action":"deployHTML","secret":"WORKER_SECRET_HERE","html":src}))
print(subprocess.run(["curl","-s","-X","POST","WORKER_URL_HERE",
  "-H","Content-Type: application/json; charset=utf-8",
  "--data-binary","@/tmp/deploy_index.json"],capture_output=True,text=True).stdout)
EOF
```
- Send **raw HTML**, never base64 — `deployHTML` expects a plain string.
- Returns `{success, version, url, files:["/index.html","/update-bill.html"]}`.

## 3. Updating the share page (`update-bill.html`)
The live share page is served from the Worker's `UPDATE_BILL_HTML` constant AND from
Hosting. To change it:
1. Edit `update-bill.html`.
2. Re-embed into `cloudflare_worker_v2.js` (escape `` ` ``, `${`, `\`):
   ```python
   html = open("update-bill.html").read().rstrip("\n")
   esc = html.replace("\\","\\\\").replace("`","\\`").replace("${","\\${")
   lines = open("cloudflare_worker_v2.js").readlines()
   s = next(i for i,l in enumerate(lines) if l.startswith("const UPDATE_BILL_HTML = `"))
   e = next(i for i in range(s+1,len(lines)) if lines[i].rstrip("\n")=="`;")
   lines[s:e+1] = ["const UPDATE_BILL_HTML = `"+esc+"\n`;\n"]
   open("cloudflare_worker_v2.js","w").writelines(lines)
   ```
3. `node --check` + deploy the Worker (step 1).
4. Run deployHTML (step 2) to push both files to Hosting.

## What the Worker does internally for Hosting
Uses a service account (embedded in the Worker) with scope
`https://www.googleapis.com/auth/firebase.hosting`:
1. `POST /sites/{site}/versions` → version name
2. gzip + SHA-256 each file → `POST /{version}:populateFiles {files:{path:sha}}`
3. upload required hashes to the returned upload URL
4. `PATCH /{version}?update_mask=status {status:"FINALIZED"}`
5. `POST /sites/{site}/releases?versionName={version}`

Firestore writes use the same service account with scope
`https://www.googleapis.com/auth/datastore`.

## Notes
- HTML is served `cache-control: max-age=3600`. After a code deploy, hard refresh
  (Cmd+Shift+R / Ctrl+Shift+R). Data changes are realtime and need no refresh.
- `deployHTML` MUST be POST (HTML too large for GET params).
