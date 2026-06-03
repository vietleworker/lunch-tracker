// Lunch Tracker API — Cloudflare Worker v2
// ═══════════════════════════════════════════════════

const UPDATE_BILL_HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cập nhật món ăn</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;min-height:100vh}
.top-bar{background:#fff;padding:12px 16px 10px;border-bottom:1px solid #e5e7eb;position:sticky;top:0;z-index:10}
.bill-title{font-size:16px;font-weight:700;color:#111}
.bill-info{font-size:12px;color:#6b7280;margin-top:2px}
.sum-row{display:flex;justify-content:space-between;align-items:center;margin-top:9px;padding-top:9px;border-top:1px solid #f0f0f0}
.sum-label{font-size:13px;color:#374151}
.sum-val{font-size:14px;font-weight:700}
.sum-ok{color:#059669}.sum-warn{color:#dc2626}
.wrap{padding:12px;max-width:540px;margin:0 auto}
.member-card{background:#fff;border:2px solid #e5e7eb;border-radius:14px;margin-bottom:12px;overflow:hidden;transition:border-color .15s}
.member-card.active{border-color:#3b82f6}
.card-header{display:flex;align-items:center;gap:10px;padding:12px 14px;cursor:pointer}
.card-check{width:20px;height:20px;accent-color:#3b82f6;cursor:pointer;flex-shrink:0}
.avatar{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0}
.member-names{flex:1;min-width:0}
.member-en{font-size:15px;font-weight:700;color:#111}
.member-vn{font-size:12px;color:#6b7280}
.card-badge{font-size:14px;font-weight:700;color:#3b82f6;flex-shrink:0}
.dish-section{border-top:1px solid #f0f4f8;padding:2px 14px 10px}
.dish-label{font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.05em;text-transform:uppercase;padding:10px 0 6px}
.dish-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #f9fafb}
.dish-row:last-of-type{border-bottom:none}
.dish-check{width:18px;height:18px;accent-color:#3b82f6;cursor:pointer;flex-shrink:0}
.dish-name{flex:1;font-size:14px;color:#111;cursor:pointer}
.dish-price{font-size:14px;font-weight:600;color:#3b82f6;flex-shrink:0}
.total-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0 2px;border-top:1px solid #f0f4f8;margin-top:6px}
.total-label{font-size:13px;color:#374151}
.total-amount{font-size:16px;font-weight:700;color:#111}
.bottom-bar{position:sticky;bottom:0;background:#fff;border-top:1px solid #e5e7eb;padding:12px 16px;max-width:540px;margin:0 auto}
.btn-save{width:100%;background:#3b82f6;color:#fff;border:none;border-radius:11px;padding:14px;font-size:16px;font-weight:700;cursor:pointer}
.btn-save:disabled{opacity:.5;cursor:not-allowed}
.loading{text-align:center;padding:60px 20px;color:#6b7280;font-size:15px}
.toast{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:10px 20px;border-radius:12px;font-size:14px;font-weight:600;z-index:999;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.25);transition:opacity .3s}
</style>
</head>
<body>

<div id="loading" class="loading">⏳ Đang tải…</div>

<div id="app" style="display:none">
  <div class="top-bar">
    <div class="bill-title" id="h-title">Cập nhật món ăn</div>
    <div class="bill-info" id="h-sub"></div>
    <div class="sum-row">
      <span class="sum-label">Sum of items</span>
      <span class="sum-val sum-warn" id="sum-val">0k</span>
    </div>
  </div>
  <div class="wrap" id="members-wrap"></div>
  <div style="height:72px"></div>
</div>

<div class="bottom-bar" id="bottom-bar" style="display:none">
  <button class="btn-save" id="btn-save" onclick="saveBill()">💾 Save bill</button>
</div>

<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, getDoc, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const WORKER = "https://falling-wood-1078.viet-le-worker.workers.dev";
const SECRET = "lunch-enclave-2025";

const app = initializeApp({
  apiKey:"AIzaSyDrbRVGxjlU77S1AyfI4K7GFC-g5HI5FEo",
  authDomain:"lunche-81567.firebaseapp.com",
  projectId:"lunche-81567",
  storageBucket:"lunche-81567.firebasestorage.app",
  messagingSenderId:"1031125665255",
  appId:"1:1031125665255:web:cef82dd2abb76e61bca942"
});
const db = getFirestore(app);

const params = new URLSearchParams(location.search);
const billNoRaw = (params.get("bill") || params.get("billNo") || "").trim();
const billId = params.get("id") || "";

let bill = null, members = [], shopItems = [], allDishes = [];
let memberChecks = {};   // { en: { dish: bool } }
let memberIncluded = {}; // { en: bool }
let dirty = {};          // { en: true } — members this session actually edited
let lastItemsJSON = "";  // snapshot of bill.items we last applied (to detect remote changes)
let justSaved = false;   // true right after THIS user saves (so we don't toast our own change)

function noDiac(s) {
  return String(s||"").toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/đ/g,'d').replace(/\\s+/g,' ').trim();
}

async function init() {
  try {
    if (billId) {
      const d = await getDoc(doc(db,"bills",billId));
      if (d.exists()) bill = {id:d.id,...d.data()};
    } else if (billNoRaw) {
      // Try string match (new date-code billNo like "0306261"), then numeric (old #1..#20)
      let snap = await getDocs(query(collection(db,"bills"), where("billNo","==",billNoRaw)));
      if (snap.empty && /^\\d+$/.test(billNoRaw))
        snap = await getDocs(query(collection(db,"bills"), where("billNo","==",parseInt(billNoRaw))));
      if (!snap.empty) { const d=snap.docs[0]; bill={id:d.id,...d.data()}; }
    }
    if (!bill) { document.getElementById("loading").textContent="❌ Không tìm thấy bill."; return; }

    const [mSnap, sSnap] = await Promise.all([
      getDocs(collection(db,"members")),
      getDocs(collection(db,"shops"))
    ]);
    mSnap.forEach(d => members.push({id:d.id,...d.data()}));
    members.sort((a,b)=>(a.order??99)-(b.order??99));

    const noteNorm = noDiac(bill.note||"");
    let matchedShop = null;
    sSnap.forEach(d => {
      const s = {id:d.id,...d.data()};
      const sname = noDiac(s.name||"").replace(/quan /g,"");
      if (sname.length > 2 && noteNorm.includes(sname)) matchedShop = s;
    });
    shopItems = matchedShop ? (matchedShop.items||[]) : [];

    computeAllDishes();
    applyItemsToState(bill.items||[], /*force*/true);
    lastItemsJSON = itemsKey(bill.items||[]);

    render();
    document.getElementById("loading").style.display="none";
    document.getElementById("app").style.display="block";
    document.getElementById("bottom-bar").style.display="block";

    // ── Real-time sync: listen for remote changes to this bill ──
    listenForUpdates();
  } catch(e) {
    document.getElementById("loading").textContent="❌ "+e.message;
  }
}

// allDishes = UNION of shop menu + any single custom dish already in bill.items.
// bill.items dish may be comma-joined ("A, B") with a summed price — those dishes
// come from the shop menu so they resolve via shopItems. Only single-dish custom
// items have a reliable per-dish price worth adding.
// Stable, order-insensitive signature of an items array (to detect real changes)
function itemsKey(items) {
  return (items||[]).map(it => \`\${it.en}::\${it.dish}::\${it.price}\`).sort().join("|");
}

function computeAllDishes() {
  const dishMap = new Map();
  shopItems.forEach(it => { if (it.dish) dishMap.set(it.dish, it.price); });
  (bill.items||[]).forEach(it => {
    const names = String(it.dish||"").split(",").map(s=>s.trim()).filter(Boolean);
    if (names.length === 1 && !dishMap.has(names[0])) dishMap.set(names[0], it.price||0);
  });
  allDishes = [...dishMap.entries()].map(([dish,price])=>({dish,price})).sort((a,b)=>a.price-b.price);
}

// Rebuild memberChecks/memberIncluded from a bill.items array.
// When force=false, members currently being edited (dirty) keep their local edits.
function applyItemsToState(items, force) {
  members.forEach(m => {
    if (!force && dirty[m.en]) return; // preserve this user's in-progress edits
    memberIncluded[m.en] = false;
    memberChecks[m.en] = {};
  });
  (items||[]).forEach(it => {
    if (!force && dirty[it.en]) return;
    memberIncluded[it.en] = true;
    memberChecks[it.en] = memberChecks[it.en] || {};
    String(it.dish||"").split(",").map(s=>s.trim()).filter(Boolean).forEach(dn => {
      memberChecks[it.en][dn] = true;
    });
  });
}

function listenForUpdates() {
  onSnapshot(doc(db,"bills",bill.id), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const newItems = data.items || [];
    const newJSON = itemsKey(newItems);
    if (newJSON === lastItemsJSON) return; // nothing new (or our own echo already applied)

    // Adopt remote data; preserve members this user is editing right now.
    bill = { id: bill.id, ...data };
    computeAllDishes();
    applyItemsToState(newItems, /*force*/false);
    lastItemsJSON = newJSON;
    render();
    if (!justSaved) showToast("🔄 Vừa cập nhật từ người khác");
    justSaved = false;
  });
}

function memberTotal(en) {
  const c = memberChecks[en]||{};
  return allDishes.reduce((s,it)=>c[it.dish]?s+it.price:s, 0);
}
function grandTotal() {
  return members.filter(m=>memberIncluded[m.en]).reduce((s,m)=>s+memberTotal(m.en),0);
}
function updateSumBar() {
  const gt = grandTotal(), bt = bill.total||0;
  const el = document.getElementById("sum-val");
  const diff = gt-bt, diffStr = diff>=0?\`+\${diff/1000|0}k\`:\`\${diff/1000|0}k\`;
  el.textContent = \`\${(gt/1000)|0}k / \${(bt/1000)|0}k (\${diffStr})\`;
  el.className = "sum-val "+(Math.abs(diff)<5000?"sum-ok":"sum-warn");
}

function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/'/g,"&#39;"); }

function render() {
  const note = (bill.note||"").replace(/^#\\d+\\s*/,"");
  document.getElementById("h-title").textContent = note.split(" - ")[0]||"Bill";
  document.getElementById("h-sub").textContent =
    \`Bill #\${bill.billNo} · \${bill.date} · \${Number(bill.total||0).toLocaleString("vi-VN")}đ\`;
  updateSumBar();

  const wrap = document.getElementById("members-wrap");
  wrap.innerHTML = members.map(m => {
    const included = memberIncluded[m.en];
    const checks = memberChecks[m.en]||{};
    const total = memberTotal(m.en);
    const bg = m.bg||"#f3f4f6", fg = m.fg||"#374151";
    const initials = (m.en||"?").slice(0,2).toUpperCase();

    const dishRows = allDishes.map(it => \`
      <div class="dish-row">
        <input type="checkbox" class="dish-check"
          id="chk-\${esc(m.en)}-\${esc(it.dish)}"
          \${checks[it.dish]?'checked':''}
          onchange="onCheck('\${esc(m.en)}','\${esc(it.dish)}',this.checked)">
        <label class="dish-name" for="chk-\${esc(m.en)}-\${esc(it.dish)}">\${esc(it.dish)}</label>
        <span class="dish-price">\${(it.price/1000)|0}k</span>
      </div>\`).join('');

    return \`
    <div class="member-card\${included?' active':''}" id="card-\${esc(m.en)}">
      <div class="card-header" onclick="toggleHeader(event,'\${esc(m.en)}')">
        <input type="checkbox" class="card-check"
          \${included?'checked':''}
          onchange="onInclude('\${esc(m.en)}',this.checked)">
        <div class="avatar" style="background:\${bg};color:\${fg}">\${initials}</div>
        <div class="member-names">
          <div class="member-en">\${esc(m.en)}</div>
          <div class="member-vn">\${esc(m.vn||"")}</div>
        </div>
        <div class="card-badge" id="badge-\${esc(m.en)}">\${total>0?(total/1000|0)+'k':''}</div>
      </div>
      <div class="dish-section" id="dishes-\${esc(m.en)}" style="\${included?'':'display:none'}">
        <div class="dish-label">DISH</div>
        \${dishRows}
        <div class="total-row">
          <span class="total-label">Total:</span>
          <span class="total-amount" id="total-\${esc(m.en)}">\${total.toLocaleString('vi-VN')} đ</span>
        </div>
      </div>
    </div>\`;
  }).join('');
}

// Clicking anywhere on header (not the checkbox) toggles include too
window.toggleHeader = function(e, en) {
  if (e.target.classList.contains('card-check')) return; // checkbox handles itself
  const cb = document.querySelector(\`#card-\${CSS.escape(en)} .card-check\`);
  if (cb) { cb.checked = !cb.checked; window.onInclude(en, cb.checked); }
};

window.onInclude = function(en, checked) {
  memberIncluded[en] = checked;
  dirty[en] = true;
  const card = document.getElementById("card-"+en);
  if (card) {
    card.classList.toggle("active", checked);
    const sec = document.getElementById("dishes-"+en);
    if (sec) sec.style.display = checked?"":"none";
  }
  updateSumBar();
};

window.onCheck = function(en, dish, checked) {
  if (!memberChecks[en]) memberChecks[en]={};
  memberChecks[en][dish] = checked;
  memberIncluded[en] = true;  // ticking a dish implies this person ate
  dirty[en] = true;
  const total = memberTotal(en);
  const badge = document.getElementById("badge-"+en);
  if (badge) badge.textContent = total>0?(total/1000|0)+'k':'';
  const ta = document.getElementById("total-"+en);
  if (ta) ta.textContent = total.toLocaleString('vi-VN')+" đ";
  updateSumBar();
};

window.saveBill = async function() {
  const touched = Object.keys(dirty);
  if (touched.length === 0) { showToast("Chưa có thay đổi nào"); return; }

  const btn = document.getElementById("btn-save");
  btn.disabled=true; btn.textContent="⏳ Đang lưu…";

  try {
    // Re-fetch latest items so concurrent edits by others aren't clobbered
    let latest = [];
    try {
      const d = await getDoc(doc(db,"bills",bill.id));
      if (d.exists()) latest = d.data().items || [];
    } catch(_) { latest = bill.items || []; }

    // Keep items for members NOT touched this session
    const final = latest.filter(it => !dirty[it.en]);

    // Add fresh items for members this session edited.
    // App format = ONE item per person: dish = comma-joined names, price = SUM.
    members.forEach(m => {
      if (!dirty[m.en]) return;
      if (!memberIncluded[m.en]) return; // user unchecked => ate nothing
      const checks = memberChecks[m.en]||{};
      const sel = allDishes.filter(it => checks[it.dish]);
      if (sel.length === 0) return;
      final.push({
        en: m.en, vn: m.vn||"",
        dish: sel.map(it=>it.dish).join(", "),
        price: sel.reduce((s,it)=>s+it.price, 0)
      });
    });

    const res = await fetch(WORKER, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({action:"updateDoc",secret:SECRET,collection:"bills",docId:bill.id,fields:{items:final}})
    });
    const json = await res.json();
    if (json.success) {
      bill.items = final;
      lastItemsJSON = itemsKey(final);
      justSaved = true;   // suppress "updated by someone else" toast for our own echo
      dirty = {};
      showToast("✅ Đã lưu! Tổng "+final.length+" món");
    } else {
      showToast("❌ Lỗi: "+(json.error||"unknown"));
    }
  } catch(e) { showToast("❌ "+e.message); }

  btn.disabled=false; btn.textContent="💾 Save bill";
};

function showToast(msg) {
  const t=document.createElement("div");
  t.className="toast"; t.textContent=msg;
  document.body.appendChild(t);
  setTimeout(()=>{t.style.opacity="0";setTimeout(()=>t.remove(),300);},2500);
}

init();
</script>
</body>
</html>
`;
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
// Deploys MULTIPLE files in one version. Every deploy always also
// ships /update-bill.html (from UPDATE_BILL_HTML) so the share page
// lives on the Google domain alongside the app — and never disappears
// when index.html is redeployed.
async function deployHTML(htmlContent) {
  const token = await getToken("https://www.googleapis.com/auth/firebase.hosting");
  const HURL = "https://firebasehosting.googleapis.com/v1beta1";

  // Files to ship this version: path -> raw content
  const files = {
    "/index.html": htmlContent,
    "/update-bill.html": UPDATE_BILL_HTML
  };

  // 1. Gzip + SHA-256 each file
  const encoder = new TextEncoder();
  const pathToSha = {};   // "/index.html" -> sha
  const shaToGz = {};     // sha -> gz bytes
  for (const [path, content] of Object.entries(files)) {
    const cs = new CompressionStream("gzip");
    const writer = cs.writable.getWriter();
    writer.write(encoder.encode(content));
    writer.close();
    const gzBuf = await new Response(cs.readable).arrayBuffer();
    const gz = new Uint8Array(gzBuf);
    const hashBuf = await crypto.subtle.digest("SHA-256", gz);
    const sha = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
    pathToSha[path] = sha;
    shaToGz[sha] = gz;
  }

  // 2. Create version
  const verRes = await fetch(`${HURL}/sites/${SITE}/versions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const ver = await verRes.json();
  if (ver.error) throw new Error("Create version: " + ver.error.message);
  const verName = ver.name;

  // 3. Populate files (all paths)
  const popRes = await fetch(`${HURL}/${verName}:populateFiles`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ files: pathToSha })
  });
  const pop = await popRes.json();
  if (pop.error) throw new Error("Populate: " + pop.error.message);

  // 4. Upload required hashes
  if (pop.uploadRequiredHashes && pop.uploadRequiredHashes.length > 0) {
    const uploadUrl = pop.uploadUrl;
    for (const sha of pop.uploadRequiredHashes) {
      const gz = shaToGz[sha];
      if (!gz) continue;
      const upRes = await fetch(`${uploadUrl}/${sha}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
        body: gz
      });
      if (!upRes.ok) throw new Error("Upload failed (" + sha.slice(0,8) + "): " + upRes.status);
    }
  }

  // 5. Finalize
  const finRes = await fetch(`${HURL}/${verName}?update_mask=status`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "FINALIZED" })
  });
  const fin = await finRes.json();
  if (fin.error) throw new Error("Finalize: " + fin.error.message);

  // 6. Release
  const relRes = await fetch(`${HURL}/sites/${SITE}/releases?versionName=${verName}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  });
  const rel = await relRes.json();
  if (rel.error) throw new Error("Release: " + rel.error.message);

  return { version: verName, url: `https://${SITE}.web.app`, files: Object.keys(files) };
}

// ── Helpers ──────────────────────────────────────────
function today() {
  const d = new Date();
  return d.getDate().toString().padStart(2, "0") + " " +
    d.toLocaleString("en-US", { month: "short" }) + " " + d.getFullYear();
}

// Date -> DDMMYY code (e.g. "03 Jun 2026" -> "030626"). Basis of date-based billNo.
function dateToCode(dateStr) {
  let d;
  const m = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  else d = new Date(dateStr);
  if (isNaN(d)) d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return dd + mm + yy;
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

      // /update-bill — public page for team to self-update meal items (no login needed)
      if (path === "/update-bill") {
        return new Response(UPDATE_BILL_HTML, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }

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

        // ═══ RULE 1: MBVCB sender name extraction ═══
        // Format: MBVCB.digits.alphanum.SENDER_NAME chuyen tien.CT tu ...
        let matched = null;
        const rawText = (content + " " + desc).toLowerCase();
        const mbvcbMatch = rawText.match(/mbvcb[\d.]+[a-z0-9]+\.([a-z\s]+?)\s+chuyen\s*tien/i);
        if (mbvcbMatch) {
          const senderName = mbvcbMatch[1].trim().toLowerCase();
          // Step 1: EN name in sender (e.g. user has EN name in bank account)
          for (const m of members) {
            if (m.en && senderName.includes(m.en.toLowerCase())) { matched = m; break; }
          }
          // Step 2: given name (LAST word) → senderMap
          // NOTE: Do NOT use VN substring match on full sender name
          // "Nguyen" is Nero's VN name but also Vietnam's most common surname → false positives
          if (!matched) {
            const parts = senderName.split(/\s+/);
            const givenName = parts[parts.length - 1]; // Vietnamese: last word = given name
            const senderMap = {
              "vu":"Vin","viet":"Victor","hoa":"Malie","nhi":"Emily",
              "duc":"Gerard","hung":"Parker","duong":"Duke","cuong":"Currie",
              "tuyet":"Gracie","khanh":"Jimmy","khai":"Warren","dash":"Dash",
              "hien":"Joyce"
            };
            if (senderMap[givenName]) matched = members.find(m => m.en === senderMap[givenName]);
          }
        }

        // ═══ RULE 1.5: Plain "SENDER_NAME Chuyen tien" (no MBVCB prefix) ═══
        // e.g. "NGUYEN VUONG KHAI Chuyen tien"
        if (!matched) {
          const plainMatch = rawText.match(/^([a-z\s]{5,40})\s+(chuyen\s*tien|transfer)/i);
          if (plainMatch) {
            const sName = plainMatch[1].trim().toLowerCase();
            // Step 1: EN name
            for (const m of members) {
              if (m.en && sName.includes(m.en.toLowerCase())) { matched = m; break; }
            }
            // Step 2: given name (last word) → senderMap only (no VN substring match)
            if (!matched) {
              const sParts = sName.split(/\s+/);
              const givenName = sParts[sParts.length - 1];
              const sMap = {
                "vu":"Vin","viet":"Victor","hoa":"Malie","nhi":"Emily",
                "duc":"Gerard","hung":"Parker","duong":"Duke","cuong":"Currie",
                "tuyet":"Gracie","khanh":"Jimmy","khai":"Warren","dash":"Dash",
                "hien":"Joyce"
              };
              if (sMap[givenName]) matched = members.find(m => m.en === sMap[givenName]);
            }
          }
        }

        // ═══ RULE 2: User-written content matching ═══
        if (!matched) {
          let cleanSearch = (content + " " + desc);
          cleanSearch = cleanSearch.replace(/mbvcb[\d.]+[a-z0-9]*/gi, " ");
          cleanSearch = cleanSearch.replace(/[a-z\s]{3,30}\s+chuyen\s*tien/gi, " ");
          cleanSearch = cleanSearch.replace(/ct\s+tu[\s\S]*?(tai\s+[a-z]+bank[a-z]*|$)/gi, " ");
          cleanSearch = cleanSearch.replace(/\b(tpbank|vpbank|mbbank|acb|vcb|bidv|techcombank|vietcombank|agribank|sacombank)\b/gi, " ");
          cleanSearch = cleanSearch.replace(/\d{6,}/g, " ");
          cleanSearch = cleanSearch.replace(/\s+/g, " ").trim();
          // Step 1: EN name match (highest priority)
          for (const m of members) {
            if (m.en && cleanSearch.toLowerCase().includes(m.en.toLowerCase())) { matched = m; break; }
          }
          // Step 2: given name keyword map (unambiguous VN given names)
          if (!matched && cleanSearch.length > 0) {
            const nameMap = {
              "hoa":"Malie","nhi":"Emily","uyen nhi":"Emily","hung":"Parker",
              "duong":"Duke","cuong":"Currie","tuyet":"Gracie",
              "vu":"Vin","viet":"Victor","khanh":"Jimmy","khai":"Warren","dash":"Dash",
              "duc":"Gerard","hien":"Joyce"
              // "nguyen" excluded: common surname, would match Nero for everyone
            };
            for (const [key, en] of Object.entries(nameMap)) {
              if (cleanSearch.toLowerCase().includes(key)) { matched = members.find(m => m.en === en); if (matched) break; }
            }
          }
          // Step 3: VN name substring (last resort, skip "Nguyen" as it's a surname)
          if (!matched) {
            const SKIP_VN = ["nguyen"]; // too common as surname
            for (const m of members) {
              if (m.vn && m.vn.length >= 3 && !SKIP_VN.includes(m.vn.toLowerCase())
                  && cleanSearch.toLowerCase().includes(m.vn.toLowerCase())) { matched = m; break; }
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

        // ═══ DEDUPLICATION: check if sepayId already processed ═══
        const dupQuery = await fetch(
          `${FSURL}/payments:runQuery`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              structuredQuery: {
                from: [{ collectionId: "payments" }],
                where: {
                  fieldFilter: {
                    field: { fieldPath: "sepayId" },
                    op: "EQUAL",
                    value: { integerValue: String(txId) }
                  }
                },
                limit: 1
              }
            })
          }
        );
        const dupResult = await dupQuery.json();
        if (Array.isArray(dupResult) && dupResult.some(r => r.document)) {
          return new Response(JSON.stringify({
            success: true, skipped: "duplicate", sepayId: txId, member: matched.en
          }), { headers: H });
        }

        // ═══ PARSER A: billNo format "Emily 11n30 12n35 13n38" ═══
        // Pattern: (billNo)n(amountK) — each token = 1 payment linked to a specific bill
        const billNTokens = [];
        const rawForBillN = (content + " " + desc);
        // Old billNo = 1-2 digits (#1..#99); new date-code billNo = 6-8 digits (DDMMYY + seq).
        const billNRegex = /\b(\d{1,2}|\d{6,8})n(\d+)\b/gi;
        let bnMatch;
        if (matched) {
          while ((bnMatch = billNRegex.exec(rawForBillN)) !== null) {
            const billNo = bnMatch[1];   // keep as string to preserve leading zero
            const amt    = parseInt(bnMatch[2]);
            if (billNo && amt >= 5 && amt <= 500) {
              billNTokens.push({ billNo, amount: amt * 1000 });
            }
          }
        }

        if (matched && billNTokens.length >= 1) {
          // Load bills to map billNo → covers date + billId
          const bRes = await fetch(`${FSURL}/bills?pageSize=200`, { headers: { Authorization: `Bearer ${token}` } });
          const bData = await bRes.json();
          const billMap = {}; // billNo(string) → { date, id }
          for (const doc of (bData.documents || [])) {
            const f = doc.fields || {};
            const bn = f.billNo?.stringValue || (f.billNo?.integerValue != null ? String(f.billNo.integerValue) : "");
            if (bn) billMap[bn] = {
              date: f.date?.stringValue || "",
              id: doc.name.split("/").pop()
            };
          }

          const txDa = new Date(txDate.replace(" ", "T"));
          const monthsA = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const todayStrA = txDa.getDate().toString().padStart(2,"0") + " " + monthsA[txDa.getMonth()] + " " + txDa.getFullYear();
          const created = [];

          for (const tok of billNTokens) {
            const bill = billMap[tok.billNo];
            // Bill ID must exist — no fallback to day-of-month.
            if (!bill) {
              return new Response(JSON.stringify({
                success: false, matched: true, parser: "billno",
                error: `Bill #${tok.billNo} not found. Payment NOT recorded.`,
                member: matched.en, sepayId: txId
              }), { status: 422, headers: H });
            }
            const coversStr = bill.date;
            const billId    = bill.id;
            const pPayload = {
              fields: {
                en:         { stringValue: matched.en },
                vn:         { stringValue: matched.vn },
                amount:     { integerValue: String(tok.amount) },
                covers:     { stringValue: coversStr },
                date:       { stringValue: todayStrA },
                method:     { stringValue: "Bank Transfer" },
                source:     { stringValue: "sepay_webhook_billno" },
                billNo:     { stringValue: String(tok.billNo) },
                billId:     { stringValue: billId },
                sepayId:    { integerValue: String(txId) },
                refCode:    { stringValue: refCode },
                rawContent: { stringValue: (content || "").substring(0, 200) },
                createdAt:  { timestampValue: new Date().toISOString() }
              }
            };
            await fetch(`${FSURL}/payments`, {
              method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify(pPayload)
            });
            created.push(`Bill#${tok.billNo} ${coversStr} ${tok.amount/1000}k`);
          }

          return new Response(JSON.stringify({
            success: true, matched: true, parser: "billno",
            member: matched.en, payments: created, sepayId: txId
          }), { headers: H });
        }

        // ═══ PARSER B: old amount-day format "Malie 32 11, 35 12, 35 13" ═══
        const multiDayRegex = /\b(\d+)\s+(\d{1,2})\b/g;
        const multiPairs = [];
        let mdMatch;
        const rawForMulti = (content + " " + desc).toLowerCase();
        if (matched) {
          while ((mdMatch = multiDayRegex.exec(rawForMulti)) !== null) {
            const amt = parseInt(mdMatch[1]);
            const day = parseInt(mdMatch[2]);
            if (amt >= 5 && amt <= 500 && day >= 1 && day <= 31) {
              multiPairs.push({ amount: amt * 1000, day });
            }
          }
        }

        if (matched && multiPairs.length >= 2) {
          const txDx = new Date(txDate.replace(" ", "T"));
          const monthsx = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const txYearx = txDx.getFullYear();
          const txMonthx = txDx.getMonth();
          const todayStrx = txDx.getDate().toString().padStart(2,"0") + " " + monthsx[txDx.getMonth()] + " " + txYearx;
          const created = [];
          for (const pair of multiPairs) {
            const dd = String(pair.day).padStart(2,"0");
            const coversStr = dd + " " + monthsx[txMonthx] + " " + txYearx;
            const pPayload = {
              fields: {
                en: { stringValue: matched.en },
                vn: { stringValue: matched.vn },
                amount: { integerValue: String(pair.amount) },
                covers: { stringValue: coversStr },
                date: { stringValue: todayStrx },
                method: { stringValue: "Bank Transfer" },
                source: { stringValue: "sepay_webhook_multi" },
                sepayId: { integerValue: String(txId) },
                refCode: { stringValue: refCode },
                rawContent: { stringValue: (content || "").substring(0, 200) },
                createdAt: { timestampValue: new Date().toISOString() }
              }
            };
            await fetch(`${FSURL}/payments`, {
              method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify(pPayload)
            });
            created.push(coversStr + " " + pair.amount/1000 + "k");
          }
          return new Response(JSON.stringify({
            success: true, matched: true, multiDay: true,
            member: matched.en, payments: created, sepayId: txId
          }), { headers: H });
        }

        // ═══ SIMPLE PARSER: 1 transfer = 1 payment ═══
        // Only extract the COVERS DAY from content. Amount = transferAmount always.
        const txD = new Date(txDate.replace(" ", "T"));
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const todayD = new Date();
        const todayStr = todayD.getDate().toString().padStart(2,"0") + " " + months[todayD.getMonth()] + " " + todayD.getFullYear();
        const txYear = txD.getFullYear();
        const txMonth = txD.getMonth();
        const todayDay = txD.getDate();

        let coversDay = todayDay; // default: transfer date

        // Clean content for day extraction
        let cleanContent = content + " " + desc;
        // Remove matched member name
        cleanContent = cleanContent.replace(new RegExp(matched.en.toLowerCase(), "gi"), " ");
        if (matched.vn) cleanContent = cleanContent.replace(new RegExp(matched.vn.toLowerCase(), "gi"), " ");
        // Remove bank reference patterns
        cleanContent = cleanContent.replace(/FT\d+/gi, " ");
        cleanContent = cleanContent.replace(/MBVCB[\d.]+[A-Z0-9]*/gi, " ");
        cleanContent = cleanContent.replace(/[A-Z0-9]{8,}/gi, " ");
        // Remove timestamps: HH:MM:SS, HH:MM
        cleanContent = cleanContent.replace(/\d{1,2}:\d{2}(:\d{2})?/g, " ");
        // Remove SePay-style refs: digits-digits-timestamp
        cleanContent = cleanContent.replace(/\d+-\d+-\d{2}:\d{2}:\d{2}/g, " ");
        // Remove 5+ digit numbers (account numbers, refs)
        cleanContent = cleanContent.replace(/\d{5,}/g, " ");
        // Remove "CT tu...toi...tai BANK" pattern
        cleanContent = cleanContent.replace(/ct\s+tu[\s\S]*?(toi|$)/gi, " ");
        cleanContent = cleanContent.replace(/toi\s+[\s\S]*?(tai|$)/gi, " ");
        cleanContent = cleanContent.replace(/tai\s+\w*bank/gi, " ");
        // Remove common VN bank transfer keywords
        cleanContent = cleanContent.replace(/\b(chuyen|tien|tu|toi|tai|cho|tra|pay|ck|chuyen\s*khoan|nguyen|thi|anh|van|le|tran|pham|hoang|ngo|dang|bui|do|truong|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, " ");
        // Handle "Nk" suffix → convert to amount marker (ignore, we use transferAmount)
        // But recognize "25k" means the number is an AMOUNT not a day — so remove it
        cleanContent = cleanContent.replace(/\d+\s*k\b/gi, " ");
        cleanContent = cleanContent.trim();

        // Extract remaining small numbers (1-31) as potential day
        const nums = cleanContent.match(/\b(\d{1,2})\b/g);
        if (nums) {
          const validDays = nums.map(Number).filter(d => d >= 1 && d <= 31);
          if (validDays.length === 1) {
            coversDay = validDays[0]; // Single day found → use it
          } else if (validDays.length > 1) {
            // Multiple days: pick the one closest to transfer date
            const txDay = txD.getDate();
            coversDay = validDays.reduce((best, d) =>
              Math.abs(d - txDay) < Math.abs(best - txDay) ? d : best
            );
          }
          // If no valid days found, coversDay stays as transfer date
        }

        const dd = String(coversDay).padStart(2, "0");
        const coversStr = dd + " " + months[txMonth] + " " + txYear;

        // Create ONE payment
        const paymentPayload = {
          fields: {
            en: { stringValue: matched.en },
            vn: { stringValue: matched.vn },
            amount: { integerValue: String(amount) },
            covers: { stringValue: coversStr },
            date: { stringValue: todayStr },
            method: { stringValue: "Bank Transfer" },
            source: { stringValue: "sepay_webhook" },
            sepayId: { integerValue: String(txId) },
            refCode: { stringValue: refCode },
            rawContent: { stringValue: (body.content || "").substring(0, 200) },
            createdAt: { timestampValue: new Date().toISOString() }
          }
        };

        await fetch(`${FSURL}/payments`, {
          method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(paymentPayload)
        });

        return new Response(JSON.stringify({
          success: true, matched: true,
          member: matched.en, amount, covers: coversStr, sepayId: txId
        }), { headers: H });

      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: H });
      }
    }
    // ═══ End SePay Webhook ═══
    try {
      const clonedForJson = request.clone();
      let p = await request.formData().catch(() => null);
      let action, secret;

      if (p) {
        action = p.get("action");
        secret = p.get("secret");
      } else {
        const json = await clonedForJson.json().catch(() => ({}));
        action = json.action;
        secret = json.secret;
        p = { _json: json, get(k) { return this._json[k] ?? ""; } };
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
      // Date-based billNo: DDMMYY + bill-of-day sequence (string, keeps leading zero).
      // e.g. 1st bill of 3 Jun 2026 -> "0306261", 2nd -> "0306262".
      const billDate = gf(p, "date") || today();
      const code = dateToCode(billDate);
      const bRes = await fetch(`${FSURL}/bills?pageSize=300`, { headers: { Authorization: `Bearer ${token}` } });
      const bData = await bRes.json();
      // Sequence = "Nth bill of this calendar day". Count ALL bills on the same date
      // (incl. old integer-billNo bills), and also track max existing date-code seq so
      // we never collide with an existing code after deletions.
      let sameDayCount = 0, maxSeq = 0;
      for (const doc of (bData.documents || [])) {
        const f = doc.fields || {};
        const bdate = f.date?.stringValue || "";
        if (dateToCode(bdate) === code) {
          sameDayCount++;
          const bn = f.billNo?.stringValue;
          if (bn && bn.startsWith(code) && bn.length > code.length) {
            const seq = parseInt(bn.slice(code.length));
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
          }
        }
      }
      const newBillNo = code + (Math.max(sameDayCount, maxSeq) + 1); // string
      // Auto-prepend #billNo to note if not already present
      const rawNote = gf(p, "note") || "";
      const note = rawNote.startsWith("#") ? rawNote : `#${newBillNo} ${rawNote}`.trim();
      const data = { date: billDate, total: gi(p, "total"), note, billNo: newBillNo };
      if (gf(p, "photoData")) data.photoData = gf(p, "photoData");
      const id = await addDoc("bills", data, token);
      return new Response(JSON.stringify({ success: true, id, billNo: newBillNo, note }), { headers: H });
    }

    if (action === "addPayment") {
      const en     = gf(p, "en");
      const covers = gf(p, "covers") || today();
      // ── Duplicate check: same person + same covers date ──
      const dupRes = await fetch(`${FSURL}/payments:runQuery`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: "payments" }],
          where: { compositeFilter: { op: "AND", filters: [
            { fieldFilter: { field: { fieldPath: "en" }, op: "EQUAL", value: { stringValue: en } } },
            { fieldFilter: { field: { fieldPath: "covers" }, op: "EQUAL", value: { stringValue: covers } } }
          ]}},
          limit: 1
        }})
      });
      const dupData = await dupRes.json();
      if (Array.isArray(dupData) && dupData.some(r => r.document)) {
        const existingId = dupData.find(r => r.document)?.document?.name?.split("/").pop();
        return new Response(JSON.stringify({ success: false, error: "duplicate", existingId, en, covers }), { headers: H });
      }
      const data = {
        en, vn: gf(p, "vn"),
        amount: gi(p, "amount"), covers,
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
      const fields = (typeof fieldsJson === "object") ? fieldsJson : JSON.parse(fieldsJson);
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
