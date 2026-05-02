# Digimon World — Digital Card Arena

Online **1v1** turn-based card battle. Design rules live in **[GDD.md](./GDD.md)**; this README mirrors that document for a quick reference and adds how to run the repo.

---

## Game overview

*(From [GDD.md](./GDD.md) §1.)*

- Each player is a **Tamer** with a **30-card** deck.
- **Win:** First to **3 Points** (you score 1 Point each time the opponent’s **active Digimon** is reduced to **0 HP**).
- **Lose:** **3** of your Digimon defeated, or **deck out** (cannot draw when you must fill your hand to six).

---

## Deck construction

*(GDD §2.)*

| Rule | Detail |
|------|--------|
| Deck size | **30** cards |
| Copies | Up to **4** per card id (rares/boss limits in GDD apply when those cards exist) |
| Composition | Digimon, Option, and Item cards per GDD; this codebase focuses on **Digimon** data in [`src/data/cards.json`](src/data/cards.json) for match decks |

---

## Card anatomy

*(GDD §3 — summary.)*

**Digimon cards** (field units):

- **Level:** Rookie, Champion, Ultimate, Mega, Armor (see GDD for evolution ladder).
- **Type / specialty:** Fire, Ice, Nature, Dark, Rare — affects support and UI.
- **HP:** Active unit’s life; persists until KO or evolve heal.
- **Attacks:** **Circle (O)**, **Triangle (▲)**, **Cross (X)** — three attacks with different damage / roles.
- **+DP:** DP gained when the card is discarded from hand in Preparation.
- **Evolution cost:** DP spent to evolve **onto** the active Digimon.
- **Support effect:** Resolved when a card is committed as support in the Battle Phase (face-down, then reveal).

**Option / Item cards** (GDD §3.B): spell-like prep and battle effects; see GDD for full intent.

---

## DP (Digivolve Points)

*(GDD §4.)*

- DP does **not** auto-refresh each turn.
- **Gain:** In **Preparation**, discard hand cards to Trash; each card adds its **+DP** to your gauge.
- **Spend:** **Evolve** only — pay the new card’s **evolution cost** when moving up the ladder (Rookie → Champion → Ultimate → Mega per GDD; implementation details in server room logic).

---

## Turn structure & phases

*(GDD §5 — summary.)*

Turns alternate. Each turn has **three** phases:

1. **Draw** — Active player draws until they have **6** cards in hand (or 0 if already 6). **Deck out** if the deck is empty when a draw is required.
2. **Preparation** — Discard for DP, evolve, prep Options (GDD); then pass to Battle.
3. **Battle** — Support placement (optional face-down), simultaneous reveal and resolution order (active then defender), secret **Circle / Triangle / Cross** selection, damage resolution, KO / score / rookie redeploy per GDD.

For step-by-step priority, cancellation, and special Cross rules, read **[GDD.md](./GDD.md) §5**.

---

## Tech stack

| Layer | Technology |
|--------|------------|
| Client | React 19, Vite, Tailwind, Motion |
| Multiplayer | [Colyseus](https://colyseus.io/) (`battle` room), binary schema sync |
| Auth / data | Firebase (anonymous sign-in + ID token for join); Firestore optional for card catalog |
| Server | `tsx server.ts` — Express + Vite middleware (dev) + Colyseus |

---

## Run locally

**Prerequisites:** Node.js **22+** (recommended), **pnpm** (or npm).

1. **Install**

   ```bash
   pnpm install
   ```

2. **Environment**

   - Copy [`.env.example`](./.env.example) to `.env` if you use Gemini / other keys from the template.
   - **Firebase Admin** (required for `BattleRoom` token verification): set either  
     `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/serviceAccount.json`  
     **or**  
     `FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'`  
   - Client Firebase config: [`firebase-applet-config.json`](./firebase-applet-config.json) (must match the same Firebase project as Admin).

3. **Enable Firebase Auth** — Anonymous (or your chosen provider) in the Firebase console; ensure the **Web API key** allows **Identity Toolkit API** if the key is restricted.

4. **Start**

   ```bash
   pnpm dev
   ```

   Open **http://localhost:3000** — use **two browser windows** to test **Join Match** queueing.

5. **Colyseus monitor (dev):** [http://localhost:3000/colyseus](http://localhost:3000/colyseus)

**Other scripts:** `pnpm build` (client bundle), `pnpm preview` (static preview only — no Colyseus server unless you host both).

---

## Project layout (high level)

| Path | Role |
|------|------|
| [`GDD.md`](./GDD.md) | Full game design: phases, DP, combat |
| [`src/data/cards.json`](./src/data/cards.json) | Card definitions used by the server to build decks |
| [`src/rooms/BattleRoom.ts`](./src/rooms/BattleRoom.ts) | Authoritative rules & phase machine |
| [`src/schema/BattleState.ts`](./src/schema/BattleState.ts) | Synced room state (Colyseus schema) |
| [`src/components/Arena.tsx`](./src/components/Arena.tsx) | Battle UI wired to room state |

---

## License

See SPDX headers in source files where present (e.g. Apache-2.0 on some components).
