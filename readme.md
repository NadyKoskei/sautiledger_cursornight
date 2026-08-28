# SautiLedger

Voice-first duka inventory. **AI is ears and mouth. The database is the brain.**

Speech is parsed into a strict JSON intent. Node.js and PostgreSQL do every price lookup, stock decrement, and total. The model never does math.

## Stack

- Backend: Node.js, Express, `pg`, dotenv — port `5000`
- Frontend: React, Vite, Tailwind CSS, lucide-react, PWA — port `5173`
- Database: PostgreSQL

## 1. Create the database and load the schema

```bash
createdb sautiledger
psql sautiledger -f backend/init.sql
```

If your Postgres user needs a password:

```bash
psql -U postgres -d sautiledger -f backend/init.sql
```

## 2. Start the backend

```bash
cd backend
cp .env.example .env
npm install
npm start
```

Edit `backend/.env` so `DATABASE_URL` matches your local Postgres, for example:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sautiledger
```

Dev with auto-reload:

```bash
cd backend
npm run dev
```

The API listens on `http://localhost:5000`.

On macOS, AirPlay Receiver often occupies port 5000. If `npm start` fails with `EADDRINUSE`, either set `PORT=5050` in `backend/.env` (and `VITE_API_URL=http://localhost:5050` in the frontend) or turn off AirPlay Receiver in System Settings → General → AirDrop & Handoff.

## 3. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Use Chrome or Edge — the mic uses `webkitSpeechRecognition`.

### Install as a PWA

The frontend is a Progressive Web App (standalone display, service worker, home-screen icons).

- **Chrome / Edge / Android:** tap **Install SautiLedger on this phone** when the banner appears, or use the browser install icon.
- **iPhone:** Safari → Share → **Add to Home Screen**.
- Service workers register on localhost in `npm run dev`. For a production-like build:

```bash
cd frontend
npm run build
npm run preview
```

Ledger writes still need the backend online. The app shell can load offline; recording a sale cannot.

## Voice examples

- `Sell two unga cash`
- `Credit 1 sugar to Mama Jane`
- `Mama Jane paid 500`

`POST /api/parse-intent` currently uses a dummy parser. Swap `dummyParseIntent` in `backend/server.js` for OpenAI or Gemma later. TTS is a stub: `playElevenLabsAudio` in `frontend/src/lib/tts.js` only `console.log`s the spoken confirmation.
