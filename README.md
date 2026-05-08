# Lunch Tracker 🍱

Team lunch expense tracker for Team Enclave. Built with Firebase Firestore + Cloudflare Worker.

## Features

- 📊 **Overview** — Stats, top contributor, recent activity, member balances
- 🧾 **Bills** — Weekly grouped, collapsible, per-member order details, paid/unpaid tracking
- 💸 **Payments** — Filter by name/week/date, receipt photo upload
- 👥 **Members** — Add/edit/delete with avatar colors
- 🔐 **Auth** — Password-protected editing (view-only public)
- 🌐 **Bilingual** — English / Vietnamese toggle
- 📱 **Responsive** — Desktop sidebar + mobile bottom nav

## Tech Stack

- **Frontend**: Vanilla JS + Tailwind CSS + Material Symbols
- **Database**: Firebase Firestore (realtime)
- **Hosting**: Firebase Hosting via Cloudflare Worker
- **Backend**: Cloudflare Worker (deploy, DB operations)

## Setup

### 1. Firebase
Create a Firebase project and update the config in `index.html`:
```js
firebase.initializeApp({
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  ...
});
```

### 2. Cloudflare Worker
Deploy `cloudflare_worker_v2.js` to Cloudflare Workers.
Set the `SECRET` variable and Firebase service account credentials.

### 3. Deploy
Open `deploy_button.html` in browser → click Deploy Now.

## Default Password
`enclave2026` — change via Settings (⚙️) after login.

## Team Members
| EN | VN |
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
