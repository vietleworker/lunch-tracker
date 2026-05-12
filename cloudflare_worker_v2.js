// Lunch Tracker API — Cloudflare Worker v2
// ═══════════════════════════════════════════════════
// Actions: addBill, addPayment, addMember,
//          updateDoc, deleteDoc,
//          deployHTML  ← NEW: deploy index.html to Firebase Hosting
// ═══════════════════════════════════════════════════
// HOW TO UPDATE:
// 1. Go to Cloudflare Dashboard → Workers & Pages → your worker
// 2. Click "Edit code" → replace ALL code with this file
// 3. Click "Save and Deploy"
// ═══════════════════════════════════════════════════

const SA_EMAIL = "firebase-adminsdk-fbsvc@lunche-81567.iam.gserviceaccount.com";
const PROJECT  = "lunche-81567";
const SITE     = "lunche-81567";
const SECRET   = "lunch-enclave-2025";
const SA_KEY   = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDV2/0dHdlLPX64
IagAR9vu5dZgiNEIylodOFEMtTPjVt6EiQoqG2gr0t/Cvr2EbsLHuPa91Nn9OfWc
hHsjvvt2kobB8555mCG4CxnctE2IoJ6re+Ex0ycV8tMz8c34NQnVzl+qhgnVXV4C
u7okdYtuUsIZJzA6uuUg73Kjp8FyeVmnBWMB7kFcZhOzXB64BvjATOAAvnQl70iV
Tj8wUvtnhtZj08VCWmeRCpwlL0oXy6V8noqARCI+u7xTdhzjsEEZWMB3urQGw3/N
GuzKSJjhixjPbUvo2zjKXUDOtc/k3qo0O9xHtxcZ81OYkW9uz8flE8HpS1b1BDCB
HA18BDFvAgMBAAECggEAHV5gnCcFODfxtweoMqGrqlsV3ZvsWPCw/2JEfyJDRe0g
EcNgCfhJjfsfj3byP8WWKidUey1H4mabPCtVXctUbSwiJXB3SuuBdezQWGbKXwDv
yUzx2A3PSExYhMGoL3XZK+tzZ8+QeiSgTG/LWEZsJ3JmBV5EWUxhOuynKaJYBogz
Y73qtEqqbbLdH6W9gCnAppf7v97vvFG4q4vFH5QcK/+PVoENKX+2fBy/K0tfwzNx
ByU3HwBQjPvdOtRfCDF9w7rgYYdN6mZ4X0H0qz4LAGuFvJ+dbnz9TYNkgVr7yH5/
ggFeqQ+/Cfb70g2RmNYa7tQMeNcdPBkIIPwDPEkygQKBgQDxYnSEMbGobrbF8d48
4DwMce7X/aIAp8oTbeTnu2uKuJjfLufJbq2W22upcF0ha4GQD4b7FuewPDKYaojp
H5Vb7VeCk+c3OUNrmNEZXAaWmv1eJEhhIPH96hcxrFlaOoD1eiUSkui4FQaUjsBT
cEXVq415O9dwYHP3L05eRe0MBwKBgQDizuHsoamiBTM0pz3K62I5cAcJ1jTPj2Xr
RrAXpVabsDBRJW/clEakrrPKM0T8y5nV3VOvJj+O/H5h15Y5GPfo5E5+Y/Ln7tOD
UOToN8uAnNbTsgvT2gvwKqogSxuwDGCqBHmHMN6GVnIoI7f5c4LI5ZXkL710thA3
q1ewy7IlWQKBgCzwQHLv8XxDCGH3soEw2d0TRP0PKh7nHfbaCbieqtnLniJG0D4v
DcA9H2EPGzeClT9ltKKAVCf6PQ0lIFIOYDcaC6WytWQRlByu+Za4DD3zouHo7VSv
1n2IHENSK9xhcerBj69SjGLg/zWfEe02xLmP06nTWzt/qXdGZlekuwn3AoGAOuNs
VXxEBwVCnlEuAhnLjw4/RZaQb7PTypq37evH6PR+FxOZT7RQA0I4/C8Don9ameS1
bayIpB960PygzIJnG9jraHWbBA1Gbbn7NTAHboVKYfzAhWj/4IOzWF8n+TW9g2dW
Bnvxyv929GURx3ruYir6GB0tG7iJzWp3gjfhMUECgYEAw3YtefGHGDrxJ30gYi5X
EdiWcmi6nw2YhTxOAc1RfHl46BOlEoTYq4UnDMdY912dJU4vAP+M0TMG8DAiPz5+
7ox7VwjN9YUpyn6o6pK/3IXi8KmaktWbJ3CK/HpP3DHMlMt40PVSWzFVCumoKllL
uIIMS3sN/SXAhtSM+aV9ON8=
-----END PRIVATE KEY-----`;

// ── Crypto helpers (Web Crypto API) ──────────────────
function b64url(data) {
  const str = typeof data === "string"
    ? btoa(data)
    : btoa(String.fromCharCode(...new Uint8Array(data)));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function signJwt(payload) {
  const header = { alg: "RS256", typ: "JWT" };
  const input = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToArrayBuffer(SA_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(input));
  return input + "." + b64url(sig);
}

// ── Get Google OAuth token ───────────────────────────
// scope param allows different scopes for Firestore vs Hosting
async function getToken(scope) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt({
    iss: SA_EMAIL, sub: SA_EMAIL,
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
    scope: scope || "https://www.googleapis.com/auth/datastore"
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Token failed: " + JSON.stringify(data));
  return data.access_token;
}

// ── Firestore helpers ────────────────────────────────
const FSURL = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function toFsValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue) } };
  if (typeof v === "object") {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFsValue(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function buildFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFsValue(v);
  return fields;
}

async function addDoc(collection, data, token) {
  data.createdAt = new Date();
  const res = await fetch(`${FSURL}/${collection}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: buildFields(data) })
  });
  const doc = await res.json();
  if (doc.error) throw new Error(doc.error.message);
  return doc.name.split("/").pop();
}

async function updateDoc(collection, docId, data, token) {
  const updateMask = Object.keys(data).map(k => `updateMask.fieldPaths=${k}`).join("&");
  const res = await fetch(`${FSURL}/${collection}/${docId}?${updateMask}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: buildFields(data) })
  });
  const doc = await res.json();
  if (doc.error) throw new Error(doc.error.message);
  return doc.name.split("/").pop();
}

async function deleteDoc(collection, docId, token) {
  const res = await fetch(`${FSURL}/${collection}/${docId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "Delete failed");
  }
  return true;
}

// ── Firebase Hosting deploy ──────────────────────────
async function deployHTML(htmlContent) {
  const token = await getToken("https://www.googleapis.com/auth/firebase.hosting");
  const HURL = "https://firebasehosting.googleapis.com/v1beta1";

  // 1. Gzip the content
  const encoder = new TextEncoder();
  const raw = encoder.encode(htmlContent);
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(raw);
  writer.close();
  const gzBuf = await new Response(cs.readable).arrayBuffer();
  const gz = new Uint8Array(gzBuf);

  // 2. SHA-256 of gzipped content
  const hashBuf = await crypto.subtle.digest("SHA-256", gz);
  const hashArr = new Uint8Array(hashBuf);
  const sha = Array.from(hashArr).map(b => b.toString(16).padStart(2, "0")).join("");

  // 3. Create version
  const verRes = await fetch(`${HURL}/sites/${SITE}/versions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const ver = await verRes.json();
  if (ver.error) throw new Error("Create version: " + ver.error.message);
  const verName = ver.name;

  // 4. Populate files
  const popRes = await fetch(`${HURL}/${verName}:populateFiles`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ files: { "/index.html": sha } })
  });
  const pop = await popRes.json();
  if (pop.error) throw new Error("Populate: " + pop.error.message);

  // 5. Upload if needed
  if (pop.uploadRequiredHashes && pop.uploadRequiredHashes.length > 0) {
    const uploadUrl = pop.uploadUrl;
    const upRes = await fetch(`${uploadUrl}/${sha}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      body: gz
    });
    if (!upRes.ok) throw new Error("Upload failed: " + upRes.status);
  }

  // 6. Finalize
  const finRes = await fetch(`${HURL}/${verName}?update_mask=status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "FINALIZED" })
  });
  const fin = await finRes.json();
  if (fin.error) throw new Error("Finalize: " + fin.error.message);

  // 7. Release
  const relRes = await fetch(`${HURL}/sites/${SITE}/releases?versionName=${verName}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  });
  const rel = await relRes.json();
  if (rel.error) throw new Error("Release: " + rel.error.message);

  return { version: verName, url: `https://${SITE}.web.app` };
}

// ── Helpers ──────────────────────────────────────────
function today() {
  const d = new Date();
  return d.getDate().toString().padStart(2, "0") + " " +
    d.toLocaleString("en-US", { month: "short" }) + " " + d.getFullYear();
}

const H = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

// ── Main handler ─────────────────────────────────────
const SEPAY_TOKEN = "1SGB9JS0P5C7Z1PEUHSRYWUC6FOKFBHWQIIFMTN5DWD8IQ7MJUN4MZBGR9XRGKET";

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    // GET — supports query params for all actions
    // e.g. ?action=addPayment&secret=xxx&en=Gerard&vn=Duc&amount=40000&covers=07+May+2025
    if (request.method === "GET") {
      const url = new URL(request.url);
      const action = url.searchParams.get("action");
      const path = url.pathname;
      const BASE = url.origin;

      // /run — execute any write action via GET (secret in URL)
      if (path === "/run") {
        const s = url.searchParams.get("secret");
        if (s !== SECRET) return new Response(JSON.stringify({ error: "Invalid secret" }), { status: 401, headers: H });
        const p = { get: (k) => url.searchParams.get(k) || "" };
        return handleAction(url.searchParams.get("action"), p);
      }

      // /data — returns all bills+payments + pre-built run URLs for detected issues
      if (path === "/data") {
        try {
          const token = await getToken();
          const [bRes, pRes] = await Promise.all([
            fetch(`${FSURL}/bills`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${FSURL}/payments`, { headers: { Authorization: `Bearer ${token}` } })
          ]);
          const [bData, pData] = await Promise.all([bRes.json(), pRes.json()]);
          const parseDocs = (docs) => (docs || []).map(d => {
            const fields = d.fields || {};
            const obj = { id: d.name.split("/").pop() };
            for (const [k, v] of Object.entries(fields)) {
              if (k === "photoData") { obj.hasPhoto = true; continue; }
              if (v.stringValue !== undefined) obj[k] = v.stringValue;
              else if (v.integerValue !== undefined) obj[k] = parseInt(v.integerValue);
              else if (v.doubleValue !== undefined) obj[k] = v.doubleValue;
              else if (v.timestampValue) obj[k] = v.timestampValue.slice(0, 10);
            }
            return obj;
          });
          const bills = parseDocs(bData.documents);
          const payments = parseDocs(pData.documents);

          // Auto-generate run URLs for any detected data issues
          const runUrls = {};
          const ts = Date.now();

          // Add payment URL template (Claude uses this to add payments)
          runUrls.addPayment = `${BASE}/run?secret=${SECRET}&action=addPayment&t=${ts}`;
          runUrls.addBill = `${BASE}/run?secret=${SECRET}&action=addBill&t=${ts}`;
          runUrls.updateDoc = `${BASE}/run?secret=${SECRET}&action=updateDoc&t=${ts}`;
          runUrls.deleteDoc = `${BASE}/run?secret=${SECRET}&action=deleteDoc&t=${ts}`;

          return new Response(JSON.stringify({ bills, payments, runUrls }), { headers: H });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: H });
        }
      }

      if (!action) {
        // Health check + full data dump
        try {
          const token = await getToken();
          const [bRes, pRes, mRes] = await Promise.all([
            fetch(`${FSURL}/bills`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${FSURL}/payments`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${FSURL}/members`, { headers: { Authorization: `Bearer ${token}` } })
          ]);
          const [bData, pData, mData] = await Promise.all([bRes.json(), pRes.json(), mRes.json()]);

          const parseDocs = (docs) => (docs || []).map(d => {
            const fields = d.fields || {};
            const obj = { id: d.name.split("/").pop() };
            for (const [k, v] of Object.entries(fields)) {
              if (v.stringValue !== undefined) obj[k] = v.stringValue;
              else if (v.integerValue !== undefined) obj[k] = parseInt(v.integerValue);
              else if (v.doubleValue !== undefined) obj[k] = v.doubleValue;
              else if (v.timestampValue) obj[k] = v.timestampValue;
              else if (v.booleanValue !== undefined) obj[k] = v.booleanValue;
            }
            // Don't include photoData in dump (too large)
            delete obj.photoData;
            return obj;
          });

          return new Response(JSON.stringify({
            status: "ok",
            app: "Lunch Tracker API v2",
            actions: ["addBill", "addPayment", "addMember", "updateDoc", "deleteDoc", "deployHTML"],
            data: {
              bills: parseDocs(bData.documents),
              payments: parseDocs(pData.documents),
              members: parseDocs(mData.documents)
            }
          }), { headers: H });
        } catch (e) {
          return new Response(JSON.stringify({
            status: "ok",
            app: "Lunch Tracker API v2",
            actions: ["addBill", "addPayment", "addMember", "updateDoc", "deleteDoc", "deployHTML"],
            dataError: e.message
          }), { headers: H });
        }
      }
      // Wrap URL params in same .get() interface as FormData
      const p = { get: (k) => url.searchParams.get(k) || "" };
      request = new Request(request.url, { method: "POST", body: null });
      return handleAction(action, p);
    }

    // POST = action
    const url2 = new URL(request.url);

    // ═══ SePay Webhook — auto-create payments from bank transfers ═══
    if (url2.pathname === "/webhook/sepay") {
      try {
        // Optional auth — only verify if Authorization header is present
        const authHeader = request.headers.get("Authorization") || "";
        if (authHeader) {
          const sepayKey = authHeader.replace("Apikey ", "").replace("Bearer ", "").trim();
          if (sepayKey !== SEPAY_TOKEN) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: H });
          }
        }

        const body = await request.json();
        // Only process incoming transfers
        if (body.transferType !== "in") {
          return new Response(JSON.stringify({ success: true, skipped: "outgoing transfer" }), { headers: H });
        }

        const amount = body.transferAmount || 0;
        const content = (body.content || "").toLowerCase();
        const desc = (body.description || "").toLowerCase();
        const txId = body.id;
        const txDate = body.transactionDate || new Date().toISOString();
        const refCode = body.referenceCode || "";

        // Load members from Firestore
        const token = await getToken();
        const mRes = await fetch(`${FSURL}/members`, { headers: { Authorization: `Bearer ${token}` } });
        const mData = await mRes.json();
        const members = (mData.documents || []).map(d => {
          const f = d.fields || {};
          return { en: f.en?.stringValue || "", vn: f.vn?.stringValue || "" };
        });

        // Match member by content/description
        let matched = null;
        const searchText = content + " " + desc;
        // Try exact EN name match first, then VN name
        for (const m of members) {
          if (m.en && searchText.includes(m.en.toLowerCase())) { matched = m; break; }
        }
        if (!matched) {
          for (const m of members) {
            if (m.vn && m.vn.length >= 2 && searchText.includes(m.vn.toLowerCase())) { matched = m; break; }
          }
        }
        // Also match bank transfer names (common VN full names)
        if (!matched) {
          const nameMap = {
            "hoa": "Malie", "nhi": "Emily", "uyen nhi": "Emily",
            "duc": "Gerard", "hung": "Parker", "duong": "Duke",
            "cuong": "Currie", "nguyen": "Nero", "tuyet": "Gracie",
            "vu": "Vin", "viet": "Victor", "khanh": "Jimmy"
          };
          for (const [key, en] of Object.entries(nameMap)) {
            if (searchText.includes(key)) {
              matched = members.find(m => m.en === en);
              if (matched) break;
            }
          }
        }

        if (!matched) {
          // Can't match — store as unmatched for manual review
          const unmatchedPayload = {
            fields: {
              type: { stringValue: "unmatched_transfer" },
              amount: { integerValue: String(amount) },
              content: { stringValue: body.content || "" },
              description: { stringValue: body.description || "" },
              txId: { integerValue: String(txId) },
              txDate: { stringValue: txDate },
              refCode: { stringValue: refCode },
              createdAt: { timestampValue: new Date().toISOString() }
            }
          };
          await fetch(`${FSURL}/webhook_log`, {
            method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(unmatchedPayload)
          });
          return new Response(JSON.stringify({ success: true, matched: false, content: body.content }), { headers: H });
        }

        // Check duplicate by SePay txId
        const dupCheck = await fetch(
          `${FSURL}/payments?pageSize=1`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // Parse date: "2023-03-25 14:02:37" → "25 Mar 2023"
        const txD = new Date(txDate.replace(" ", "T"));
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const todayD = new Date();
        const todayStr = todayD.getDate().toString().padStart(2,"0") + " " + months[todayD.getMonth()] + " " + todayD.getFullYear();
        const txYear = txD.getFullYear();
        const txMonth = txD.getMonth();

        // Smart content parsing
        // Format: "name [amount day] [amount day] ..."
        const todayDay = txD.getDate();

        // Clean content: strip out bank metadata BEFORE extracting numbers
        let cleanContent = content + " " + desc;
        // Remove member names
        cleanContent = cleanContent.replace(new RegExp(matched.en.toLowerCase(), "gi"), " ");
        if (matched.vn) cleanContent = cleanContent.replace(new RegExp(matched.vn.toLowerCase(), "gi"), " ");
        // Remove bank reference codes and account numbers (6+ digit numbers are junk)
        cleanContent = cleanContent.replace(/FT\d+/gi, " ");
        cleanContent = cleanContent.replace(/MBVCB[\.\d]+/gi, " ");
        cleanContent = cleanContent.replace(/[A-Z0-9]{8,}/gi, " ");
        cleanContent = cleanContent.replace(/\d{5,}/g, " "); // 5+ digit numbers = junk
        // Remove "CT tu ... toi ... tai BANK" pattern
        cleanContent = cleanContent.replace(/ct\s+tu[\s\S]*?(toi|$)/gi, " ");
        cleanContent = cleanContent.replace(/toi\s+[\s\S]*?(tai|$)/gi, " ");
        cleanContent = cleanContent.replace(/tai\s+\w*bank/gi, " ");
        // Remove common Vietnamese bank transfer keywords
        cleanContent = cleanContent.replace(/\b(chuyen|tien|tu|toi|tai|cho|tra|pay|nguyen|thi|anh|van|le|tran|pham|hoang|ngo|dang|bui|do|truong|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, " ");
        // Handle "40k" suffix
        cleanContent = cleanContent.replace(/(\d+)\s*k\b/gi, "$1");
        cleanContent = cleanContent.trim();

        const nums = cleanContent.match(/\d+/g);

        let coversDates = [];

        if (!nums || nums.length === 0) {
          // No numbers → covers today, full amount
          coversDates = [{ day: todayDay, amt: amount }];
        } else {
          // Check if pairs: amount+day pattern
          // Numbers > 31 are amounts (in thousands), numbers 1-31 are days
          const allNums = nums.map(Number);
          const amounts = [];
          const days = [];

          // Try to detect pairs: look at sequence
          // If alternating big/small: "50 11 40 12" → pairs
          // If all small (1-31): "11 12 13" → just days, split evenly
          const hasLargeNums = allNums.some(n => n > 31);

          if (hasLargeNums) {
            // Parse as [amount, day] pairs - cap amounts to reasonable lunch range
            const MAX_LUNCH_K = 500; // 500k = max per-day lunch
            for (let i = 0; i < allNums.length; i++) {
              if (allNums[i] > 31 && allNums[i] <= MAX_LUNCH_K) {
                amounts.push(allNums[i] * 1000); // convert to VND
                if (i + 1 < allNums.length && allNums[i + 1] >= 1 && allNums[i + 1] <= 31) {
                  days.push(allNums[i + 1]);
                  i++; // skip day
                } else {
                  days.push(todayDay); // no day specified, use today
                }
              } else if (allNums[i] >= 1 && allNums[i] <= 31) {
                // Standalone day without preceding amount
                days.push(allNums[i]);
                amounts.push(0); // will be filled later
              }
            }
            // Fill 0 amounts: split remaining evenly
            const totalSpecified = amounts.reduce((s, a) => s + a, 0);
            const zeroCount = amounts.filter(a => a === 0).length;
            if (zeroCount > 0 && totalSpecified < amount) {
              const perZero = Math.round((amount - totalSpecified) / zeroCount);
              for (let i = 0; i < amounts.length; i++) {
                if (amounts[i] === 0) amounts[i] = perZero;
              }
            }
            for (let i = 0; i < days.length; i++) {
              coversDates.push({ day: days[i], amt: amounts[i] || Math.round(amount / days.length) });
            }
          } else {
            // All small numbers = just days, split amount evenly
            const validDays = allNums.filter(d => d >= 1 && d <= 31);
            if (validDays.length > 0) {
              const perDay = Math.round(amount / validDays.length);
              for (let i = 0; i < validDays.length; i++) {
                const dayAmt = (i === validDays.length - 1) ? amount - perDay * (validDays.length - 1) : perDay;
                coversDates.push({ day: validDays[i], amt: dayAmt });
              }
            } else {
              coversDates = [{ day: todayDay, amt: amount }];
            }
          }
        }

        // Sanity check: parsed total must be within 10x of actual transfer
        const parsedTotal = coversDates.reduce((s, c) => s + (c.amt || 0), 0);
        if (parsedTotal > amount * 10 || parsedTotal === 0) {
          // Way off — fallback to "covers today with full amount"
          coversDates = [{ day: todayDay, amt: amount }];
        }
        // If parsed total is way less than actual amount and only days specified, split evenly
        if (parsedTotal < amount * 0.5 && coversDates.length > 1 && coversDates.every(c => c.amt < 1000)) {
          const perDay = Math.round(amount / coversDates.length);
          coversDates = coversDates.map((c, i) => ({
            day: c.day,
            amt: (i === coversDates.length - 1) ? amount - perDay * (coversDates.length - 1) : perDay
          }));
        }

        // Create payments
        const created = [];
        for (const cd of coversDates) {
          const dd = String(cd.day).padStart(2, "0");
          const coversStr = dd + " " + months[txMonth] + " " + txYear;

          const paymentPayload = {
            fields: {
              en: { stringValue: matched.en },
              vn: { stringValue: matched.vn },
              amount: { integerValue: String(cd.amt) },
              covers: { stringValue: coversStr },
              date: { stringValue: todayStr },
              method: { stringValue: "Bank Transfer" },
              source: { stringValue: "sepay_webhook" },
              sepayId: { integerValue: String(txId) },
              refCode: { stringValue: refCode },
              createdAt: { timestampValue: new Date().toISOString() }
            }
          };

          await fetch(`${FSURL}/payments`, {
            method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(paymentPayload)
          });
          created.push({ covers: coversStr, amount: cd.amt });
        }

        return new Response(JSON.stringify({
          success: true, matched: true,
          member: matched.en, amount, payments: created, sepayId: txId
        }), { headers: H });

      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: H });
      }
    }
    // ═══ End SePay Webhook ═══
    try {
      let p = await request.formData().catch(() => null);
      let action, secret;

      if (p) {
        action = p.get("action");
        secret = p.get("secret");
      } else {
        const json = await request.clone().json().catch(() => ({}));
        action = json.action;
        secret = json.secret;
        p = { _json: json, get(k) { return this._json[k] || ""; } };
      }

      if (secret !== SECRET) {
        return new Response(JSON.stringify({ error: "Invalid secret" }), { status: 401, headers: H });
      }

      return handleAction(action, p);
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500, headers: H });
    }
  }
};

async function handleAction(action, p) {
  try {
    const secret = gf(p, "secret");
    if (secret && secret !== SECRET) {
      return new Response(JSON.stringify({ error: "Invalid secret" }), { status: 401, headers: H });
    }

    const token = await getToken();

    if (action === "addBill") {
      const data = { date: gf(p, "date") || today(), total: gi(p, "total"), note: gf(p, "note") || "" };
      if (gf(p, "photoData")) data.photoData = gf(p, "photoData");
      const id = await addDoc("bills", data, token);
      return new Response(JSON.stringify({ success: true, id }), { headers: H });
    }

    if (action === "addPayment") {
      const data = {
        en: gf(p, "en"), vn: gf(p, "vn"),
        amount: gi(p, "amount"), covers: gf(p, "covers") || today(),
        method: gf(p, "method") || "Bank Transfer", date: gf(p, "date") || today()
      };
      if (gf(p, "photoData")) data.photoData = gf(p, "photoData");
      const id = await addDoc("payments", data, token);
      return new Response(JSON.stringify({ success: true, id }), { headers: H });
    }

    if (action === "addMember") {
      const data = {
        en: gf(p, "en"), vn: gf(p, "vn"), full: gf(p, "full") || "",
        aliases: gf(p, "aliases") || "", bg: gf(p, "bg") || "#f3f4f6",
        fg: gf(p, "fg") || "#374151", order: gi(p, "order") || 99
      };
      const id = await addDoc("members", data, token);
      return new Response(JSON.stringify({ success: true, id }), { headers: H });
    }

    if (action === "updateDoc") {
      const collection = gf(p, "collection");
      const docId = gf(p, "docId");
      const fieldsJson = gf(p, "fields");
      if (!collection || !docId || !fieldsJson) {
        return new Response(JSON.stringify({ error: "Need collection, docId, fields" }), { status: 400, headers: H });
      }
      const fields = JSON.parse(fieldsJson);
      const id = await updateDoc(collection, docId, fields, token);
      return new Response(JSON.stringify({ success: true, id }), { headers: H });
    }

    if (action === "deleteDoc") {
      const collection = gf(p, "collection");
      const docId = gf(p, "docId");
      if (!collection || !docId) {
        return new Response(JSON.stringify({ error: "Need collection, docId" }), { status: 400, headers: H });
      }
      await deleteDoc(collection, docId, token);
      return new Response(JSON.stringify({ success: true }), { headers: H });
    }

    if (action === "deployHTML") {
      const html = gf(p, "html");
      if (!html) return new Response(JSON.stringify({ error: "Need html field" }), { status: 400, headers: H });
      const result = await deployHTML(html);
      return new Response(JSON.stringify({ success: true, ...result }), { headers: H });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), { status: 400, headers: H });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: H });
  }
}

// Helper to get form field or JSON field
function gf(p, key) {
  if (p && typeof p.get === "function") return p.get(key) || "";
  if (p && typeof p === "object") return p[key] || "";
  return "";
}
function gi(p, key) {
  return parseInt(gf(p, key)) || 0;
}
