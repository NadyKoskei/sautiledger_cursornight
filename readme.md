# SautiLedger

Voice-first inventory and credit book for a Kenyan duka. The shopkeeper talks; the app keeps the books.

> **Architecture rule: AI is the ears and the mouth. The database is the brain.**
> Speech is turned into a strict JSON intent and nothing more. Every price lookup, stock decrement, total, balance, and profit figure is computed by PostgreSQL. The model never does arithmetic, so it can never invent a number.

## The flow

```
speech  →  POST /api/parse-intent  →  { action, items[], payment_type, customer_name }
                                            │
                                            ▼
                              POST /api/transaction
                                            │
                    SQL: read price · check stock · compute total
                         decrement stock · write ledger · update balance
                                            │
                                            ▼
                     { message: "Recorded 300 bob cash. Unga stock is now 48." }
                                            │
                                            ▼
                                  spoken back to the user
```

## Stack

| Layer    | Choice                                                |
| -------- | ----------------------------------------------------- |
| Backend  | Node.js, Express, `pg`, dotenv                        |
| Frontend | React, Vite, Tailwind CSS, React Router, lucide-react |
| Database | PostgreSQL                                            |
| Mobile   | Installable PWA (manifest, service worker, icons)     |

## The eight screens

| #   | Screen                   | What it does                                                                                                            |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | **Login / Sign Up**      | Phone + numeric PIN, sign-up adds business and owner name, language toggle (English / Kiswahili / Mixed)                |
| 2   | **Onboarding**           | Business type, currency, voice language, then add the first items or skip                                               |
| 3   | **Dashboard**            | Today's cash, credit and collected; low-stock banner; one grounded proactive tip; big mic                               |
| 4   | **Inventory**            | Search and low-stock filter, colour-coded levels, add/edit/remove, mic scoped to "add stock"                            |
| 5   | **Sales / Voice ledger** | Mic with listening animation, live transcript, confirmation card, undo on the last entry, typed fallback                |
| 6   | **Customers / Madeni**   | Total outstanding, sorted by balance, history per customer, repayment by voice or typing                                |
| 7   | **Reports**              | Today / Week / Month / Custom, revenue, cost, profit, cash vs credit chart, top sellers, closing stock, share           |
| 8   | **AI Assistant**         | Chat with suggestion chips; every answer quotes real figures and shows the rows behind them                             |

Navigation is a five-tab bottom bar with a raised centre mic that jumps straight to the voice ledger, so the primary action is always under the thumb.

## Running it

### 1. Database

```bash
createdb sautiledger
psql sautiledger -f backend/init.sql
```

### 2. Backend

```bash
cd backend
cp .env.example .env      # then set DATABASE_URL and AUTH_SECRET
npm install
npm run db:seed           # demo shop: 0712345678 / PIN 1234
npm start
```

The API listens on `http://localhost:5000`. On macOS, AirPlay Receiver usually holds port 5000; either set `PORT=5050` in `backend/.env` or turn AirPlay Receiver off in System Settings → General → AirDrop & Handoff.

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local   # point VITE_API_URL at your backend port
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome or Edge — the mic uses the Web Speech API.

## Deploy on Render (frontend and backend separately)

Push `development` to GitHub first. Create **two services** in the dashboard — not one. Deploy the API, copy its URL, then deploy the site.

### 1. Backend (Web Service)

Dashboard → **New → Web Service** → this repo.

| Setting | Value |
| ------- | ----- |
| Branch | `development` |
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm install` |
| Pre-Deploy Command | leave empty (schema runs on start) |
| Start Command | `npm start` |

Environment:

| Key | Value |
| --- | ----- |
| `DATABASE_URL` | Postgres **Internal** URL (Connections on your existing Render DB) |
| `DATABASE_SSL` | `true` |
| `AUTH_SECRET` | any long random string |
| `ELEVENLABS_API_KEY` | your `sk_` key |
| `ELEVENLABS_VOICE_ID` | your voice id |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` |
| `ELEVENLABS_STT_MODEL_ID` | `scribe_v2` |

Do not set `PORT`. Render sets it.

Deploy, then open `https://YOUR-API.onrender.com/api/health`. You want `"ok": true`. Copy that `https://YOUR-API.onrender.com` URL (no trailing slash).

Seed once from **sautiledger-api → Shell**:

```bash
node seed.mjs
```

### 2. Frontend (Static Site)

Dashboard → **New → Static Site** → the **same** repo.

| Setting | Value |
| ------- | ----- |
| Branch | `development` |
| Root Directory | `frontend` |
| Build Command | `npm install && npm run build` |
| Publish Directory | `dist` |

Environment (must be set **before** the first build):

| Key | Value |
| --- | ----- |
| `VITE_API_URL` | the backend URL from step 1, e.g. `https://sautiledger-api.onrender.com` |

Redirects/rewrites: a catch-all rewrite `/*` → `/index.html` is in `render.yaml`. If you created the static site in the dashboard, add the same rule under **Redirects/Rewrites** so `/customers` is not a 404.

If you change `VITE_API_URL` later, **Clear build cache & deploy** the static site. Vite bakes that URL in at build time.

Open the **static** URL to use the app, not the API URL.

- Open shop: `0701891234` (no PIN)
- Demo shop: `0712345678` / PIN `1234`

### Seed from your laptop

Use the database **External** URL (Internal only works inside Render):

```bash
cd backend
DATABASE_URL='postgresql://USER:PASSWORD@HOST/DATABASE' DATABASE_SSL=true npm run db:setup
```

## Install as an app

Chrome and Android show an install banner. On iPhone use Safari → Share → **Add to Home Screen**. The app shell works offline; recording a sale needs the backend, because only the database is allowed to price anything.

## Tests

```bash
cd backend
npm run test:e2e
```

Fifty checks walk the same API path the eight screens take: signup validation, onboarding, stock maths, overselling, undo reversal, repayments, report arithmetic, assistant grounding, and multi-tenant isolation. The harness deletes the shops it creates.

## Voice examples

| Say this                                | It records                       |
| --------------------------------------- | -------------------------------- |
| `sell two unga cash`                    | Cash sale, priced from your list |
| `nimeuza mbili milk na sugar tatu cash` | Two-line cash sale               |
| `credit 3 packets of unga to Mama Jane` | Credit sale, balance updated     |
| `Mama Jane amelipa 500`                 | Repayment against her balance    |
| `add 20 sugar` (on Inventory)           | Restock                          |

## Where the AI plugs in

| Piece          | File                                | Status                                                                                            |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| Speech → JSON  | `backend/src/lib/nlu.js`            | Rule-based stand-in. Replace `parseIntent` with an OpenAI/Gemma call returning the same schema.    |
| Answer wording | `backend/src/services/analytics.js` | Templates filled from SQL. A model may rephrase, never recompute.                                  |
| Text → speech  | `frontend/src/lib/tts.js`           | `playElevenLabsAudio` logs, then falls back to the browser voice. Drop the ElevenLabs SDK in here. |

Because the intent schema is fixed and the money maths lives in SQL, swapping in a real model changes only how words are understood — never what the books say.
