# Rewards Campaign Shutdown Plan

The Rewards / Freebet distribution campaign has ended. Users must keep the ability
to spend any freebet balance they already have, but the app must stop exposing the
campaign page and must not allow new reward/freebet grants.

## Goals

- Remove public access to the Rewards page.
- Remove navigation and UI entry points that invite users to claim new freebets.
- Keep existing freebet balances visible where useful.
- Keep existing freebet spending working in match prediction flows.
- Later, disable backend reward-granting paths and remove the rewards issuer from
  on-chain admin permissions.

## Non-Goals

- Do not remove `FreebetLedger` support from match betting.
- Do not remove `VITE_FREEBET_LEDGER_ID`.
- Do not revoke authorized bet programs from `FreebetLedger`.
- Do not disable user claims for match winnings or final prizes.
- Do not disable gasless voucher support unless we decide to end that separately.

## Phase 1: Remove Rewards Page Access

Focus: frontend only. This phase should make `/rewards` inaccessible as a campaign
page while preserving existing freebet usage.

### Tasks

- [x] Remove the `Rewards` route from `frontend/src/pages/index.tsx`.
- [x] Replace `/rewards` with a redirect to `/all-matches`, so old bookmarks do
   not open the campaign UI.
- [x] Remove `Rewards` from app navigation in
   `frontend/src/components/layout/nav-items.tsx`.
- [x] Update wallet/freebet UI entry points that currently link to `/rewards`:
   - `frontend/src/components/wallet/Wallet.tsx`
   - `frontend/src/components/freebet/FreebetBalancePill.tsx`
- [x] Keep freebet balance as a non-clickable status display.
- [x] Remove `frontend/src/pages/rewards/*` from active app source and archive it
   under `docs/archive/rewards-campaign/`.
- [x] Remove `VITE_REWARDS_API_URL` from `frontend/.env.example`.
- [x] Search for remaining `/rewards`, `Rewards`, and `VITE_REWARDS_API_URL`
   references in the frontend and clean up campaign-page references.

### Phase 1 Verification

Run:

```sh
cd frontend
yarn build
```

Manual checks:

- `/rewards` redirects and does not show campaign content.
- Sidebar and mobile nav no longer show Rewards.
- Wallet/freebet display no longer opens the campaign page.
- Match pages still allow selecting and spending `Freebet` when a user has
  available freebet balance.
- My Predictions still supports claiming/returning freebet principal where
  applicable.

## Phase 2: Disable Reward-Granting Backend Paths

Focus: server-side safety. Even if someone calls old endpoints directly, no new
campaign rewards should be granted.

### Tasks

- [ ] Add a campaign-ended guard in `rewards-backend`.
- [ ] Return `410 Gone` for public reward creation endpoints:
   - `POST /rewards/x/submit`
   - `POST /rewards/referrals/register`
- [ ] Disable admin grant paths unless we explicitly need a temporary backfill
   process:
   - `POST /rewards/grants/manual`
   - `POST /rewards/referrals/activity`
   - `POST /rewards/referrals/milestone`
- [ ] Keep `/health` only if the service remains deployed temporarily.
- [ ] Add tests proving disabled endpoints do not call `chain.grantLedgerFreebet`.

### Phase 2 Verification

Run:

```sh
cd rewards-backend
npm test
```

Manual checks:

- Old campaign API calls return `410 Gone`.
- No disabled endpoint can trigger `FreebetLedger.grant`.

## Phase 3: Remove Deployment Surface

Focus: stop running unused infrastructure once frontend and backend code are safe.

### Tasks

- [ ] Remove or comment out `smartcupleague-rewards` in `render.yaml`.
- [ ] Remove or archive `docker-compose.rewards.yml` if no longer needed for local
   development.
- [ ] Update docs to state that the Rewards / Freebet distribution campaign has
   ended.
- [ ] After deploy, remove production secrets that are only used by the rewards
   service:
   - `REWARDS_ACCOUNT`
   - `X_BEARER_TOKEN`
   - `ADMIN_API_KEY`

## Phase 4: On-Chain Admin Unwiring

Focus: remove the rewards issuer's authority to grant new ledger freebets while
preserving user balances and spending.

### Tasks

- [ ] Query `FreebetLedger.admins()`.
- [ ] Identify the rewards issuer account.
- [ ] If the rewards issuer is the only admin, first add a permanent owner/admin
   wallet.
- [ ] Call `remove_admin(rewardsIssuer)` on `FreebetLedger`.
- [ ] Verify the rewards issuer is no longer an admin.
- [ ] Verify authorized betting programs are still authorized.
- [ ] Verify existing user balances still read with `balance_of`.
- [ ] Verify freebet spending still works through match prediction flows.

## Commit Strategy

Use separate commits for each phase:

1. `Remove rewards page access`
2. `Disable rewards campaign grants`
3. `Remove rewards deployment config`
4. On-chain actions documented in an ops note or commit if scripts/docs change.
