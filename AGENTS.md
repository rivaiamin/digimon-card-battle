# AGENTS.md

## Cursor Cloud specific instructions

Standard commands live in `README.md` and `package.json` (`pnpm dev`, `pnpm build`,
`pnpm lint`). Notes below are the non-obvious gotchas for working in this repo.

### Services
This is a **single-process app** (not a monorepo). `pnpm dev` runs `tsx server.ts`,
which boots Express + the Colyseus `battle` room + the Vite dev middleware all on
**http://localhost:3000**. There is no separate frontend/backend to start.
- Health check: `http://localhost:3000/api/health`
- Colyseus monitor (dev inspection): `http://localhost:3000/colyseus`
- `pnpm preview` serves only the static client bundle — it does **not** run the
  Colyseus game server, so matchmaking will not work under `preview`.

### Commands
- Lint / typecheck: `pnpm lint` (`tsc --noEmit`)
- Build: `pnpm build` (`vite build`, client bundle only)
- Run (dev): `pnpm dev`

### Firebase / running the core "join match" flow (important)
The home screen loads with no credentials, but **joining a match** (the core flow)
is gated by `BattleRoom.onAuth`, which calls Firebase Admin `verifyIdToken`.
- **Client anonymous sign-in already works out of the box**: the public client config
  is committed in `firebase-applet-config.json` (project `raysaber`) and Anonymous
  auth is enabled on that project.
- **Server side needs Firebase Admin credentials** via `FIREBASE_SERVICE_ACCOUNT_JSON`
  or `GOOGLE_APPLICATION_CREDENTIALS` (see `src/server/firebaseAdmin.ts`). Without
  them, `onAuth` throws and matchmaking fails.
- **Non-obvious**: `verifyIdToken` only needs the **project id** + Google's public
  certs (the private key is never used for verification). So for local dev/testing
  without real GCP service-account creds, a **project-only** service account works.
  Recreate it (both files are gitignored, so they do not persist across fresh VMs):

  ```bash
  openssl genrsa -out /tmp/k.pem 2048 2>/dev/null
  node -e 'const fs=require("fs");const pk=fs.readFileSync("/tmp/k.pem","utf8");fs.writeFileSync("service-account.local.json",JSON.stringify({type:"service_account",project_id:"raysaber",private_key_id:"local-dev",private_key:pk,client_email:"local-dev@raysaber.iam.gserviceaccount.com",client_id:"0",token_uri:"https://oauth2.googleapis.com/token"},null,2))'
  echo 'GOOGLE_APPLICATION_CREDENTIALS=/workspace/service-account.local.json' > .env
  ```

  The server auto-loads `.env` (via dotenvx) on `pnpm dev`. For a production-grade
  setup instead, set `FIREBASE_SERVICE_ACCOUNT_JSON` to a real service account for
  the matching Firebase project.

### Colyseus version mismatch
Client (`colyseus.js` 0.16) and server (`@colyseus/core` 0.17) differ on purpose; the
app bridges them with the `ColyseusClient017` shim in `src/services/colyseusClient.ts`.
A **raw** `colyseus.js` `Client` will fail to decode the join response — always go
through the app (browser) or the shim to test matchmaking.

### Testing matchmaking
Matchmaking pairs exactly 2 players. Test by opening **two browser windows** at
`http://localhost:3000` and clicking **JOIN MATCH** in each; both transition into the
battle arena.

### Optional / not required
Firestore (card catalog — falls back to `src/data/cards.json`), Redis, and the Gemini
API (`@google/genai`) are optional/unused for local gameplay.
