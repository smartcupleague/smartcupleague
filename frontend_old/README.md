# SmartCup League — Frontend

React web application for the [SmartCup League](../README.md) prediction market on **Vara Network**.

Players connect a Polkadot wallet, place score predictions on football matches, and compete on a season-long leaderboard funded entirely by entries — no house edge.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | React 18.3 + TypeScript 5.7 |
| Bundler | Vite 6 |
| Routing | React Router 6 |
| Data fetching | TanStack Query 5 |
| Wallet | SubWallet via `@gear-js/wallet-connect` |
| Chain client | `@gear-js/api`, `@gear-js/react-hooks`, `@polkadot/api` |
| Contract clients | `sails-js` (generated from program IDLs) |
| Styling | SCSS modules · `styled-components` · `@gear-js/vara-ui` |
| Linting | ESLint 8 + Prettier |
| Package manager | **Yarn 4.9.2** (do not use npm) |

**Node.js requirement:** 20.19+ or 22.12+ (Vite 6 constraint).

---

## Getting Started

```bash
yarn install
cp .env.example .env   # fill in the VITE_ vars
yarn start             # dev server on http://localhost:3000
```

### Scripts

| Command | Description |
|---|---|
| `yarn start` | Vite dev server with HMR (port 3000) |
| `yarn build` | Type-check (`tsc -b`) + production build to `dist/` |
| `yarn preview` | Serve the production build locally |
| `yarn lint` | ESLint with `--max-warnings 0` |

---

## Environment Variables

All variables are read at build time and must be prefixed with `VITE_`.

| Variable | Required | Description |
|---|---|---|
| `VITE_NODE_ADDRESS` | yes | Vara Network WebSocket RPC (e.g. `wss://testnet.vara.network`) |
| `VITE_BOLAOCOREPROGRAM` | yes | BolaoCore program address (hex) |
| `VITE_DAOPROGRAM` | yes | DAO-SmartCupLeague program address (hex) |
| `VITE_ORACLE_URL` | yes | Oracle server base URL (e.g. `http://localhost:3001`) |
| `VITE_API_URL` | no | FastAPI backend base URL (defaults to `http://localhost:8000`) |
| `VITE_INDEXER_GRAPHQL_URL` | no | GraphQL indexer URL (leaderboard fast path) |

Example `.env`:

```env
VITE_NODE_ADDRESS=wss://testnet.vara.network
VITE_BOLAOCOREPROGRAM=0x...
VITE_DAOPROGRAM=0x...
VITE_ORACLE_URL=http://localhost:3001
VITE_API_URL=http://localhost:8000
```

---

## Routes

| Path | Page |
|---|---|
| `/` | Landing |
| `/progress` (alias `/home`) | Dashboard |
| `/2026worldcup/match/:id` (alias `/match/:id`) | Match prediction |
| `/all-matches` (alias `/all-predictions`) | All matches |
| `/my-predictions` | Connected wallet's prediction history |
| `/leaderboard` (alias `/leaderboards`) | Season leaderboard |
| `/predictions/:wallet` | Public prediction history for any wallet |
| `/dao` | DAO governance panel |
| `/simulator` | Tournament simulator |
| `/admin/fixtures` | Admin: fixture management |
| `/terms-of-use`, `/dao-constitution`, `/rules` | Legal / static |

---

## Project Structure

```
frontend/
├── public/                  Static assets served as-is
├── src/
│   ├── App.tsx              Providers + ApiProvider for Gear-JS
│   ├── main.tsx             React root
│   ├── pages/               Route entry points
│   │   ├── landing/
│   │   ├── home/
│   │   ├── matchs/
│   │   ├── dao/
│   │   ├── legal/
│   │   ├── simulator/
│   │   ├── admin-fixtures/
│   │   └── AppLayout.tsx    Shared layout shell
│   ├── components/
│   │   ├── common/          Buttons, modals, toast, etc.
│   │   ├── layout/          Header, footer, navigation
│   │   ├── predictions/     Match cards, bet flow, claim flow
│   │   ├── leaderboard/     Leaderboard table + UserProfileModal
│   │   ├── wallet/          StyledWallet, EditProfileModal
│   │   ├── dao/             Governance UI
│   │   └── onboarding/      First-time user modal
│   ├── hooks/               Custom React hooks (useVaraPrice, useWalletProfile, …)
│   ├── hocs/                Higher-order helpers + generated sails-js client
│   ├── utils/               Address conversion, formatting, match helpers
│   ├── consts.ts            App-wide constants
│   └── types/               Shared TypeScript types
├── vite.config.ts
├── package.json
└── vercel.json
```

---

## Wallet & Chain

- Provider: SubWallet (any Polkadot extension also works) via `@gear-js/wallet-connect`.
- Chain: **Vara Network**, configurable through `VITE_NODE_ADDRESS`.
- Token: **VARA** (12 decimals, "planck" subunit).
- **Minimum prediction:** 3 VARA (enforced client-side in `MatchCard.tsx`).
- Address handling: SS58 addresses are converted to lowercase hex with `decodeAddress` + `u8aToHex` before any backend call (see `useWalletProfile.ts`).

---

## Contract Integration

Sails-JS clients are generated from each program's IDL and live under `src/hocs/lib`. The frontend talks to:

- **BolaoCore-Program** (`VITE_BOLAOCOREPROGRAM`) — `placeBet`, `claimMatchReward`, `claimPrize`, `queryState`, `queryBetsByUser`.
- **DAO-SmartCupLeague-Program** (`VITE_DAOPROGRAM`) — governance proposals & voting.

Read paths prefer the GraphQL indexer (`VITE_INDEXER_GRAPHQL_URL`) when configured, falling back to direct on-chain `queryState` calls.

---

## Off-Chain Services

| Service | Default URL | Purpose |
|---|---|---|
| Oracle server | `VITE_ORACLE_URL` | Match fixtures, team crests, kick-off times |
| FastAPI backend | `VITE_API_URL` | Leaderboard enrichment, VARA price, wallet profiles |
| Indexer | `VITE_INDEXER_GRAPHQL_URL` | Fast leaderboard / match read path |

---

## Build & Deploy

```bash
yarn build          # → dist/
yarn preview        # local sanity check
```

Deployed on **Vercel** with `vercel.json` rewriting all routes to `index.html` (SPA fallback). Set the `VITE_*` vars in the Vercel dashboard — never commit secrets.

---

## License

MIT — see the repository [`LICENSE`](../LICENSE).
