# Homepage Preview Changes

Status: local preview only. Do not commit/push until explicitly approved.

## Preview-only local fixes

These were added to make localhost preview usable:

- `src/App.tsx`
  - Allows the public landing page `/` to render without waiting for Gear API/account readiness.
  - App routes now render once the Gear API is ready, without waiting on account readiness.
  - Purpose: avoid endless loader during public homepage and app-page preview.

- `src/pages/matchs/Layout.tsx`
  - Replaced an invalid import from `public/images/dashboard-prediction.jpeg` with the public URL `/images/dashboard-prediction.jpeg`.
  - Purpose: fix Vite dev-server asset error.

## Landing carousel changes

Files:

- `src/pages/landing/Landing.tsx`
- `src/pages/landing/landing.css`

### General carousel

- Added slide-specific classes: `scb-slide--1`, `scb-slide--2`, etc.
- Purpose: allow per-banner positioning without changing every slide.

### Slide 1: The Global Football Prediction Game

- Horizontally flipped the image so the person appears on the right side.
- Adjusted image sizing/crop to preserve more of the bottom while keeping full banner coverage.
- Current image rule:

```css
.scb-slide--1 .scb-slide__img {
  width: 112%;
  height: 112%;
  object-fit: cover;
  object-position: center 38%;
  transform: translate(4%, -2%) scale(0.94) scaleX(-1);
  transform-origin: center top;
}
```

### Slide 2: Play the World Cup Like a Pro

- Moved all text, CTA buttons, and benefit tags to the right side.
- Right-aligned all content.
- Adjusted the image so people checking the mobile phone stay visible on the left side.
- Current image rule:

```css
.scb-slide--2 .scb-slide__img {
  width: 112%;
  height: 112%;
  object-fit: cover;
  object-position: left 38%;
  transform: translate(-3%, -6%) scale(0.94);
  transform-origin: left top;
}
```

### Slide 3: No friction. No waiting. No complexity.

- Split title into two lines:
  - `No friction. No waiting.`
  - `No complexity.`
- Adjusted image up and slightly right while preserving full banner coverage.
- Current image rule:

```css
.scb-slide--3 .scb-slide__img {
  width: 108%;
  height: 108%;
  object-position: center top;
  transform: translate(2%, -6%);
}
```

### Slide 4: No House. Just Players

- Moved all text, CTA buttons, and benefit tags to the right side.
- Right-aligned all content.
- Adjusted image position so the person’s head is fully visible.
- Current image rule:

```css
.scb-slide--4 .scb-slide__img {
  object-position: center 12%;
}
```

## Navbar

- Hid/deactivated the `EN / ES / PT` language selector.
- Kept the JSX commented for future i18n rollout.
- `Enter app` button remains visible.

## Review notes

- All changes are local only at this stage.
- No commit/push should happen until approved.
- Dev should decide whether preview-only fixes become permanent or are replaced with a cleaner routing/app-readiness approach.

## Progress page widget changes

File:

- `src/pages/home/dashboard.css`

### Final Prize Pool widget

- Moved the World Cup trophy image to the right side of the widget.
- Kept the value, stat rows, and status content constrained on the left side.
- Made the distribution bar and `Claim Prize` CTA span the full widget width.
- Made the Final Prize Pool note lines span the full widget width.
- Added responsive fallback so the trophy stacks cleanly on small screens.

## Homepage app entry routing

File:

- `src/pages/landing/Landing.tsx`

- Updated landing-page app-entry CTAs to navigate to `/all-matches` instead of `/home`.
- Affected visible CTAs include `Enter app`, carousel `Start predicting`, and the lower large CTA.

## Sidebar logo routing

File:

- src/components/layout/sidebar/Sidebar.tsx

- Updated the SmartCup League logo click target inside the app sidebar from /progress to /.
- Impact: clicking the logo from All Matches, My Predictions, Leaderboard, My Progress, or DAO now returns to the public homepage instead of My Progress.

## DAO page deactivation

Files:

- src/components/layout/sidebar/Sidebar.tsx
- src/pages/index.tsx

- Removed DAO from the app sidebar navigation for All Matches, My Predictions, Leaderboard, and My Progress.
- Disabled the /dao route in the frontend route map so it is not part of the active app sitemap/navigation surface.
- Left DAO component files untouched so member-only access can be enabled later.

## Sidebar social links

Files:

- src/components/layout/sidebar/Sidebar.tsx
- src/components/layout/sidebar/scb-dashboard.css

- Added centered social icons to the bottom of the app sidebar.
- Links point to SmartCup League X, Instagram, and Telegram community pages.
- Kept them icon-only with accessible labels and external-link behavior.
- Updated styling to use larger simple white icons with no circular background and no divider above the social row.

## Championship Pick page and on-chain caveat

Files:

- src/pages/championship-pick/ChampionshipPick.tsx
- src/pages/championship-pick/championship-pick.css
- src/pages/championship-pick/index.tsx
- src/pages/index.tsx
- src/App.tsx

### Current frontend implementation

- Added standalone /championship-pick page for the tournament-wide podium prediction.
- UI lets the player choose Champion, Runner-Up, and 3rd Place from existing team/flag data.
- Dropdowns prevent selecting the same team in more than one podium slot.
- The selected flags are rendered proportionally with object-fit: contain.
- The page reads r32_lock_time from queryState() and disables submission after the lock.
- The submit action calls bolao-core submitPodiumPick(champion, runner_up, third_place) through the generated Sails service.
- The page now includes a VARA stake input and sends the selected amount with the submitPodiumPick transaction, matching the match-prediction payment pattern.


### Match-page visual treatment

- Updated /championship-pick to use the same stadium background image as the match pages: /images/dashboard-prediction.jpeg.
- Moved the route outside the standard AppLayout so the page owns the full match-style arena canvas instead of rendering inside the app sidebar shell.
- Added a match-style left sidebar with these reviewable widgets: Tournament Status, Bonus Points, Allocation, and Rules.
- Kept the main panel focused on the three podium dropdowns and VARA stake/submission flow.



### All Matches local preview guard

File:

- src/App.tsx

- Added /all-matches to the temporary preview routes list so the page can render on localhost without waiting for Gear API/contract readiness.
- Purpose: lets reviewers inspect the All Matches page and Championship Prediction callout before the contract wiring is available.
- This should be reviewed before production deployment; the guard can be kept only if product wants public/pre-contract rendering for this route.

### All Matches Championship Pick entry point

Files:

- src/components/predictions/AllMatchs.tsx
- src/components/predictions/all-matchs.css

- Added a Championship Prediction callout above the World Cup match list on /all-matches.
- Card states:
  - Not submitted: Make Picks -> routes to /championship-pick.
  - Submitted: View Picks ✓ routes to /championship-pick.
  - Locked: Locked 🔒 disabled after r32_lock_time.
- Current submitted detection uses the same local storage marker as the Championship Pick page until bolao-core exposes a wallet-scoped podium-pick query.


### My Progress Championship Picks row

Files:

- src/pages/home/Home.tsx
- src/pages/home/dashboard.css

- Added a Championship Picks row below Net Performance in Your Prediction Performance.
- States:
  - Not Submitted: shows Not Submitted, Earn up to +35 pts, and Make Picks ->.
  - Submitted: shows Submitted ✓, Potential: +35 pts, and View Picks ->.
  - Completed: shows +30 pts with no CTA.
- Current Submitted detection uses the same temporary local storage marker as the Championship Pick page until bolao-core exposes a wallet-scoped podium-pick query.


### Leaderboard Championship Picks card

Files:

- src/components/leaderboard/Leaderboards.tsx
- src/components/leaderboard/leaderboards.css
- src/pages/championship-pick/ChampionshipPick.tsx
- src/App.tsx

- Replaced the right-side Top Earnings card on the Leaderboard page with a Your Championship Picks card.
- States:
  - Not Submitted: explanation, +35 pts potential, and Make Your Picks -> CTA.
  - Submitted: shows locally saved Champion, Runner-Up, and 3rd Place picks plus Potential: +35 pts.
  - After Results: visual layout shows per-pick points and Total: +30 pts when podium_finalized is true.
- Persisted submitted podium pick values locally from /championship-pick so the Leaderboard can show the selected teams before bolao-core exposes a wallet-scoped query.
- Added /leaderboard to the temporary preview routes list so the card can be reviewed locally without contract/API readiness.
- Caveat: After Results scoring is UI-ready but needs a bolao-core query exposing final podium/result scoring to be production-accurate.


### Temporary preview route guard summary

File:

- src/App.tsx

- Temporary preview routes currently include /, /all-matches, /progress, /leaderboard, and /championship-pick.
- Purpose: lets reviewers inspect Championship Pick UI entry points locally while Gear API/contract readiness is unavailable.
- This is review/dev convenience and should be revisited before production deployment.

### Required bolao-core payment change

- Updated bolao-core submit_podium_pick locally so Championship Pick submissions require the same minimum stake as match predictions: 3 VARA.
- The submitted value is split as 95% final prize pool and 5% protocol fee.
- This changes contract behavior and requires a new bolao-core build/deploy before the frontend payment flow is safe for production.
- Without the updated contract deployed, attaching VARA from the frontend would not correctly update final_prize_accumulated/protocol_fee_accumulated.

### Caveat for deployment

- Bolao-core stores picks in state.podium_picks, but queryState() does not expose the connected wallet's existing podium pick.
- Because of that, the frontend cannot reliably rehydrate a user's already-submitted Championship Pick from chain after a page reload, different browser, or new device.
- The current UI can mark the pick as submitted locally after a successful transaction, but local storage is only a temporary frontend convenience and should not be treated as canonical.
- If a user already submitted on-chain and later opens the page in a fresh session, the frontend may not know that a pick exists until the contract rejects a second submitPodiumPick call with Podium pick already submitted.

### Proposed bolao-core solution

Add a wallet-scoped query to bolao-core:

```rust
query_podium_pick(user: ActorId) -> Option<PodiumPick>
```

Recommended behavior:

- Read state.podium_picks.get(&user).
- Return Option<PodiumPick> containing champion, runner_up, and third_place.
- Do not mutate state.
- No attached payment and no signer requirement beyond normal query access.

After adding the query:

- Regenerate/update the frontend Sails bindings in src/hocs/lib.ts.
- Add a frontend method such as queryPodiumPick(user).
- On /championship-pick load, call queryPodiumPick(account.decodedAddress) when the wallet is connected.
- If a pick exists, prefill all three dropdowns, disable editing/submission, and show Championship Pick Submitted.
- If no pick exists, allow submission until r32_lock_time.

Optional future query additions:

- Add podium_result to queryState() when the FE needs to display the official final podium.
- Add podium_picks_count to queryState() for aggregate public stats without exposing every wallet pick.

Recommendation:

- Do not expose the full podium_picks map in queryState() unless the product explicitly wants all users' picks to be public. A per-wallet query is lighter and cleaner.
