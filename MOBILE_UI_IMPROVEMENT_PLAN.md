# SmartCup League Mobile UI Improvement Plan

Status legend:

- [ ] Planned
- [~] In progress
- [x] Done

Primary objective: improve the SmartCup League mobile experience across every public and app page without changing the desktop experience.

Current next phase:

- [~] Championship Pick mobile layout

Primary desktop protection rule:

- All layout and visual changes for mobile must be scoped behind mobile media queries, preferably `@media (max-width: 768px)`.
- Shared component changes must preserve existing desktop class names, layout behavior, and visual output.
- Desktop regression checks are required after every major mobile section.

Primary mobile breakpoint:

```css
@media (max-width: 768px) {
  /* mobile-only changes */
}
```

Small-phone breakpoint:

```css
@media (max-width: 420px) {
  /* narrow phone refinements */
}
```

## Global Acceptance Criteria

- [x] Desktop app sidebar remains unchanged above `768px`.
- [x] Desktop page spacing, card sizing, and table layouts remain unchanged above `768px`.
- [x] Mobile app pages expose primary navigation without relying on the desktop sidebar.
- [x] No route has document-level horizontal scrolling on mobile.
- [x] Touch targets are at least `44px` tall where practical on the five primary app pages.
- [x] Fixed and sticky elements do not overlap the mobile bottom navigation for the primary app shell/header pass.
- [x] Long team names, wallet names, task labels, and technical strings do not break layouts on the five primary app pages.
- [x] Loading, empty, connected wallet, disconnected wallet, error, and modal states are checked on the five primary app pages.
- [ ] Public pages and authenticated app pages behave intentionally differently where needed.
- [x] Match Detail and Championship Pick use the approved mobile bottom nav as standalone app/action pages.

## Execution Order

1. [x] Mobile app shell and bottom navigation
2. [x] Global mobile overflow, spacing, typography, and safe-area rules
3. [x] All Matches
4. [x] My Predictions
5. [x] Leaderboard
6. [x] My Progress
7. [x] Rewards
8. [x] Match Detail
9. [~] Championship Pick
10. [~] Landing page
11. [ ] Legal pages
12. [ ] Shared components
13. [ ] Admin Fixtures
14. [ ] Simulator pages
15. [ ] DAO/Governance future-proofing
16. [ ] Full mobile QA pass
17. [ ] Desktop regression pass

## 1. Mobile App Shell And Navigation

Target files:

- `frontend/src/pages/AppLayout.tsx`
- `frontend/src/app-layout.css`
- `frontend/src/components/layout/sidebar/Sidebar.tsx`
- `frontend/src/components/layout/sidebar/scb-dashboard.css`
- New: `frontend/src/components/layout/mobile-nav/MobileTabBar.tsx`
- New: `frontend/src/components/layout/mobile-nav/mobile-tab-bar.css`
- Optional new shared config: `frontend/src/components/layout/nav-items.tsx`

Tasks:

- [x] Extract the authenticated app nav items into a shared config used by desktop sidebar and mobile nav.
- [x] Preserve current desktop sidebar markup and class behavior as much as possible.
- [x] Add a mobile-only bottom tab bar with these five primary items:
  - All Matches
  - My Predictions
  - Leaderboard
  - Rewards
  - My Progress
- [x] Use the same route-active rules currently used by the desktop sidebar.
- [x] Keep icons visible and labels short enough for phone widths.
- [x] Add accessible labels for each tab.
- [x] Respect `env(safe-area-inset-bottom)`.
- [x] Hide mobile nav above `768px`.
- [x] Hide desktop sidebar at or below `768px`.
- [x] Add mobile bottom padding to app content so content does not sit behind the tab bar.
- [x] Verify mobile nav on `/all-matches`, `/my-predictions`, `/leaderboard`, `/rewards`, and `/progress`.
- [x] Add the same mobile-only bottom nav to standalone app/action routes:
  - Match Detail
  - Championship Pick
- [x] Keep standalone app/action route desktop layouts unchanged after adding the mobile nav.
- [x] Add enough mobile bottom padding so Match Detail claim/submit content and Championship Pick submit/footer content are not hidden by the nav.
- [x] Keep existing top back buttons on Match Detail and Championship Pick.
- [x] Keep legal/public pages without the app bottom nav unless intentionally moved into the app shell later.
- [x] Verify desktop sidebar still appears unchanged at `1440x900`.

Acceptance criteria:

- [x] The five primary app sections are always visible and tappable on mobile.
- [x] Standalone app/action pages keep the same mobile navigation pattern as the primary app pages.
- [x] Desktop keeps the existing left sidebar.
- [x] No desktop route changes visually because of the mobile nav.

## 2. Global Mobile Layout Foundation

Target files:

- `frontend/src/app-layout.css`
- `frontend/src/styles.css`
- Page CSS files as needed

Tasks:

- [x] Add mobile CSS variables:
  - `--mobile-page-padding-x`
  - `--mobile-page-padding-top`
  - `--mobile-page-bottom-extra`
  - `--mobile-panel-padding-y`
  - `--mobile-panel-padding-x`
  - `--mobile-panel-radius`
  - `--mobile-tabbar-height`
  - `--mobile-safe-bottom`
- [x] Use `100dvh` where mobile viewport behavior matters.
- [x] Allow natural vertical scrolling on mobile app pages.
- [x] Prevent document-level horizontal scrolling in the mobile app shell.
- [x] Ensure main app content has `min-width: 0`.
- [x] Add safe bottom padding for pages with fixed mobile nav.
- [x] Define consistent mobile page padding.
- [x] Reduce mobile page top padding where current desktop spacing wastes viewport height.
- [x] Audit global `overflow: hidden` usage that traps mobile content.
- [x] Audit and contain primary-page horizontal overflow risks.

Acceptance criteria:

- [x] Mobile pages scroll vertically without clipping.
- [x] No page is squeezed by desktop shell dimensions.
- [x] Desktop shell behavior remains unchanged.

## 3. Mobile Typography And Controls

Target files:

- `frontend/src/styles.css`
- Page-specific CSS files

Tasks:

- [x] Normalize mobile type scale for page headings, section titles, card titles, helper text, and labels.
- [x] Standardize mobile card padding to roughly `12px-16px`.
- [x] Standardize mobile section gaps to avoid crowded panels.
- [x] Reduce oversized headings inside cards and dashboards.
- [x] Keep display-scale type only where it is truly a hero.
- [x] Avoid viewport-width font scaling.
- [x] Keep letter spacing at `0` in compact controls.
- [x] Make primary action buttons full-width where space is constrained.
- [x] Ensure buttons and selects have comfortable touch height.
- [x] Replace cramped text buttons with icon buttons only where the action is familiar and accessible.

Acceptance criteria:

- [x] Mobile pages feel dense enough for product use but no longer cramped.
- [x] Button text does not overflow or collide with icons.

## 4. Mobile Overflow Audit

Target areas:

- All page CSS files
- Shared wallet, footer, modal, and nav components

Tasks:

- [x] Search for fixed widths that can exceed mobile viewport.
- [x] Search for large `min-width` values that force horizontal overflow.
- [x] Search for `white-space: nowrap` on long labels or names.
- [x] Replace wide desktop grids with mobile single-column layouts where needed on the five primary app pages.
- [x] Contain unavoidable wide data tables inside internal horizontal scroll areas.
- [x] Add `overflow-wrap: anywhere` for long addresses, URLs, and technical strings.
- [x] Use two-line clamps or wrapping for team names and user labels instead of aggressive ellipsis where the layout needs readable content.
- [x] Add a 380px app-shell padding guard to reduce accidental 375px horizontal overflow risk.
- [x] Normalize empty/loading blocks so they keep stable width and readable spacing on narrow phones.

Acceptance criteria:

- [x] No primary app route has accidental horizontal scrolling at `375px`.
- [x] Important content is readable instead of prematurely truncated on the five primary app pages.

## 5. All Matches

Target files:

- `frontend/src/components/predictions/AllMatchs.tsx`
- `frontend/src/components/predictions/all-matchs.css`

Tasks:

- [x] Stack top header, wallet, search, and filters cleanly on mobile.
- [x] Make search full-width.
- [x] Make tournament and phase filters full-width or two-per-row where practical.
- [x] Convert match card top rows into a stable mobile structure:
  - teams
  - status
  - kickoff/phase
  - pool
  - actions
- [x] Let team names wrap or clamp to two lines on mobile.
- [x] Reduce chip density inside match cards.
- [x] Remove mobile-breaking `min-width` values from pool chips.
- [x] Make prediction and claim actions full-width on narrow phones.
- [x] Ensure status badges do not force team rows to shrink too much.
- [x] Ensure flags, team names, and `VS` align cleanly at `375px`.
- [x] Keep the wallet widget visible in the All Matches mobile header.
- [x] Ensure empty, loading, and no-results states are mobile-friendly.
- [x] Refine mobile match cards so teams, state tags, match metadata, user pick, final/open score, and match prize pool read as one coherent card.
- [x] Keep mobile status/action tags compact without duplicating countdown or closed-state copy already shown in the message line.
- [x] Add localhost preview coverage for final/reward-ready, open/predict, open/details, closed/awaiting result, live, and cancelled match states.

Acceptance criteria:

- [x] User can scan upcoming matches comfortably on a phone.
- [x] Match cards do not overflow.
- [x] Filters are easy to use with touch.

## 6. My Predictions

Target files:

- `frontend/src/components/predictions/QueryBetsByUser.tsx`
- `frontend/src/components/predictions/my-predictions.css`

Tasks:

- [x] Rework prediction tables/grids into mobile-friendly cards or reduced rows.
- [x] Prioritize these fields on mobile:
  - match
  - user pick
  - result/status
  - stake
  - claim/action
- [x] Hide or collapse lower-priority columns below mobile breakpoint.
- [x] Remove large mobile-breaking grid columns such as `minmax(560px, ...)`.
- [x] Make claim buttons full-width on small phones.
- [x] Let team names and match labels wrap safely.
- [x] Make filters/search stack cleanly.
- [x] Ensure wallet/user labels do not push cards wider than the viewport.
- [x] Improve loading and empty states.
- [x] Normalize mobile header, wallet, and search framing with the other primary menu pages.

Acceptance criteria:

- [x] User can quickly understand every prediction from a phone.
- [x] Claimable states are obvious and easy to tap.
- [x] No prediction row is crushed into unreadable columns.

## 7. Leaderboard

Target files:

- `frontend/src/components/leaderboard/Leaderboards.tsx`
- `frontend/src/components/leaderboard/leaderboards.css`
- `frontend/src/components/leaderboard/UserProfileModal.tsx`

Tasks:

- [x] Make leaderboard top controls stack on mobile.
- [x] Make search full-width.
- [x] Make subnav/tabs wrap or stack.
- [x] Use a horizontally scrollable mobile leaderboard table so the phone view keeps the same desktop information:
  - rank
  - user
  - matches
  - exact
  - outcomes
  - points
- [x] Restore the Points column in the mobile horizontal table.
- [x] Make `ME` badge compact.
- [x] Ensure wallet/user text has enough width.
- [x] Tune leaderboard rows into a consistent horizontally scrollable mobile table instead of special podium cards.
- [x] Ensure right-side info cards stack below the main leaderboard.
- [x] Review sticky bottom summary bar behavior on mobile.
- [x] Add enough spacing between sticky summary and bottom tab bar.
- [x] Make user profile modal fit within `96vw` and scroll internally.
- [x] Keep profile modal close action reachable on mobile.
- [x] Make long wallet addresses wrap safely inside the profile modal.
- [x] Make leaderboard rows keyboard-accessible with `Enter` and `Space`.
- [x] Make the follow button easier to tap on mobile.
- [x] Ensure row tap opens the profile modal while follow tap only follows/unfollows.
- [x] Add specific accessible labels and `aria-pressed` state to follow buttons.
- [x] Add live/status semantics to loading, empty, and no-results states.
- [x] Normalize mobile header, wallet, and search framing with the other primary menu pages.
- [x] Contain mobile leaderboard tabs, tables, sticky summary, earnings rows, championship pick rows, and upcoming match rows against horizontal document scroll.

Acceptance criteria:

- [x] Top rankings are readable at a glance.
- [x] User can search and switch views without layout jumps.
- [x] Sticky elements do not cover each other.
- [x] Mobile leaderboard keeps the same key stats as desktop through intentional horizontal table scrolling.
- [x] Profile modal and follow actions are usable by touch and keyboard.

## 8. My Progress

Target files:

- `frontend/src/pages/home/Home.tsx`
- `frontend/src/pages/home/dashboard.css`

Tasks:

- [x] Stack KPI cards into one column on small phones.
- [x] Keep the most important progress stats near the top.
- [x] Reduce visual density in activity and match sections.
- [x] Convert leaderboard-like mini tables into compact mobile rows.
- [x] Let team names wrap or clamp gracefully.
- [x] Make profile/wallet user row responsive.
- [x] Contain My Progress mini leaderboard table and upcoming match rows against horizontal document scroll.
- [x] Ensure progress bars maintain stable width.
- [x] Reduce decorative spacing that costs vertical room.
- [x] Ensure sticky or bottom content clears mobile nav.
- [x] Normalize mobile header and wallet framing with the other primary menu pages.

Acceptance criteria:

- [x] User immediately sees current status and progress.
- [x] Dashboard cards do not feel cramped.
- [x] Mini-tables do not break the viewport.

## 9. Rewards

Target files:

- `frontend/src/pages/rewards/Rewards.tsx`
- `frontend/src/pages/rewards/rewards.css`

Tasks:

- [x] Stack reward header and summary panels.
- [x] Convert two-column reward sections into one-column mobile sections.
- [x] Make task cards full-width.
- [x] Make progress rows wrap cleanly.
- [x] Remove fixed side-panel behavior below mobile breakpoint.
- [x] Make primary task buttons full-width.
- [x] Ensure referral/code fields fit mobile width.
- [x] Make copy actions easy to tap.
- [x] Contain Rewards referral links, task rows, referral cards, and modal actions against horizontal document scroll.
- [x] Prevent long task descriptions from truncating.
- [x] Make modal content scroll safely.
- [x] Normalize mobile header and wallet framing with the other primary menu pages.

Acceptance criteria:

- [x] Reward tasks are easy to read and complete from a phone.
- [x] Progress state is clear.
- [x] No code, task, or action row overflows.

## 10. Match Detail

Target files:

- `frontend/src/pages/matchs/Matchs.tsx`
- `frontend/src/pages/matchs/match.css`
- `frontend/src/pages/matchs/styles.css`
- `frontend/src/pages/matchs/matchcard.css`

Tasks:

- [x] Stack match header, odds, prediction, and info panels.
- [x] Reduce scoreboard width on mobile.
- [x] Make team blocks vertical or wrapped when necessary.
- [x] Ensure score inputs are large enough for touch.
- [x] Keep prediction submission controls readable, touch-friendly, and aligned with the approved mobile layout.
- [x] Separate mobile prediction stake, USD conversion, quick amount buttons, currency, and freebet messaging into a clear vertical flow.
- [x] Keep desktop currency selector/stake controls visually refined without changing desktop match layout behavior.
- [x] Reduce mobile footer legal link type size so page links fit more discreetly.
- [x] Verify all match states fit the approved mobile layout:
  - open, not predicted
  - open, predicted
  - closed, awaiting result
  - final, predicted
  - final, reward ready
  - [x] Local preview routes support all five states via `previewMatchState`.
  - [x] User visual approval on mobile viewport.
- [x] Verify freebet states fit without stretching the stake widget:
  - freebet configured with balance
  - freebet configured without enough balance
  - freebet ledger not configured
  - [x] Local preview routes support all three states via `previewFreebetState`.
  - [x] User visual approval on mobile viewport.
- [x] Preserve the current desktop Match Detail layout exactly while continuing mobile-only safety work.
- [x] Prevent odds/info tables from squeezing or causing horizontal page scroll.
- [x] Use contained horizontal scroll only when a table cannot be simplified safely.
- [x] Keep toast messages within viewport width.
- [x] Ensure match metadata remains readable without aggressive truncation.
- [x] Confirm modal/dialog/loading/disabled transaction states are usable on mobile.
- [x] Verify no accidental horizontal scroll at `360px`, `375px`, and `390px`.

Acceptance criteria:

- [x] User can place a prediction with one hand in the approved mobile flow.
- [x] Score controls are easy to tap.
- [x] No match panel is wider than the viewport.

## 11. Championship Pick

Target files:

- `frontend/src/pages/championship-pick/ChampionshipPick.tsx`
- `frontend/src/pages/championship-pick/championship-pick.css`

Tasks:

- [x] Stack pick selector and stake panel.
- [x] Make team select full-width with a mobile-only team picker sheet while preserving desktop native select behavior.
- [x] Ensure flag/select rows fit narrow screens.
- [x] Make quick amount buttons wrap cleanly.
- [x] Make submit button full-width.
- [x] Keep potential reward content readable.
- [x] Ensure disabled and locked states are clear on mobile.
- [x] Confirm mobile keyboard does not hide the submit action.

Acceptance criteria:

- [x] User can choose a champion and stake without zooming.
- [x] Select controls do not truncate flags or team names badly.

## 12. Landing Page

Target files:

- `frontend/src/pages/landing/Landing.tsx`
- `frontend/src/pages/landing/landing.css`

Tasks:

- [x] Ensure hero fits the first mobile viewport with primary CTA visible.
- [x] Reduce hero heading size on mobile.
- [x] Stack hero content vertically.
- [x] Make primary CTA full-width or near-full-width on small phones.
- [x] Ensure hero image/media remains inspectable and not overly cropped.
- [x] Maintain stable aspect ratios for tournament cards and images.
- [x] Prevent carousel/highlight sections from overflowing.
- [x] Make public footer links readable and tappable.

Acceptance criteria:

- [ ] Landing page has no clipped headline.
- [ ] CTA is visible without awkward scrolling.
- [ ] Images are not distorted.

## 13. Legal Pages

Target files:

- `frontend/src/pages/legal/TermsOfUse.tsx`
- `frontend/src/pages/legal/DaoConstitution.tsx`
- `frontend/src/pages/legal/Rules.tsx`
- `frontend/src/pages/legal/legal.css`

Tasks:

- [ ] Improve readable line length on mobile.
- [ ] Use comfortable document padding.
- [ ] Reduce heading sizes.
- [ ] Ensure legal nav and back links are visible.
- [ ] Prevent long URLs, addresses, and terms from overflowing.
- [ ] Add `overflow-wrap: anywhere` for long technical strings.

Acceptance criteria:

- [ ] Legal pages read like documents, not squeezed desktop panels.
- [ ] No long string causes horizontal scroll.

## 14. Shared Components

### Wallet

Target file:

- `frontend/src/components/wallet/Wallet.tsx`

Tasks:

- [x] Create or style a compact mobile wallet variant.
- [ ] Shorten address display on mobile.
- [x] Avoid wallet pill pushing page headers wider than viewport.
- [ ] Make wallet menus viewport-safe.

### Onboarding Modal

Target files:

- `frontend/src/components/onboarding/OnboardingModal.tsx`
- `frontend/src/components/onboarding/OnboardingModal.css`

Tasks:

- [ ] Fit modal to `calc(100dvh - 32px)` on mobile.
- [ ] Make modal content scroll internally.
- [ ] Ensure inputs and buttons are not hidden by mobile keyboard.
- [ ] Use full-width primary action on mobile.

### Footer

Target files:

- `frontend/src/components/layout/footer/AppFooter.tsx`
- `frontend/src/components/layout/footer/AppFooter.css`

Tasks:

- [ ] Simplify or hide authenticated app footer on mobile if it competes with bottom nav.
- [ ] Keep public footer readable on landing and legal pages.
- [ ] Ensure footer links wrap cleanly.

Acceptance criteria:

- [ ] Shared components do not create mobile overflow.
- [ ] Shared component desktop appearance is preserved.

## 15. Admin Fixtures

Target files:

- `frontend/src/pages/admin-fixtures/AdminFixtures.tsx`
- Any related CSS or inline styles in the admin fixtures page

Tasks:

- [ ] Make admin forms stack vertically on mobile.
- [ ] Use full-width inputs and selects.
- [ ] Make fixture rows editable on mobile.
- [ ] Contain wide admin tables with internal horizontal scroll if needed.
- [ ] Ensure Google gate/auth screens fit mobile.

Acceptance criteria:

- [ ] Admin can inspect and edit fixtures from a phone in an emergency.

## 16. Simulator Pages

Target files:

- `frontend/src/pages/simulator/Simulator.tsx`
- `frontend/src/pages/simulator/RegisterMatch.tsx`
- `frontend/src/pages/simulator/RegisterPhase.tsx`
- `frontend/src/pages/simulator/PrepareSettlement.tsx`
- `frontend/src/pages/simulator/ProposeResult.tsx`
- `frontend/src/pages/simulator/FinalizeResult.tsx`

Tasks:

- [ ] Stack simulator navigation and actions.
- [ ] Make all forms single-column below `860px`.
- [ ] Replace inline fixed-width controls with full-width mobile controls.
- [ ] Make result/proposal tables contained.
- [ ] Ensure submit buttons remain visible and tappable.
- [ ] Reduce admin/dev panel padding on small screens.

Acceptance criteria:

- [ ] Simulator remains functional on mobile even if it is not a primary user path.

## 17. DAO And Governance Future-Proofing

Target files:

- `frontend/src/components/dao/GovernancePanel.tsx`
- `frontend/src/components/dao/GovernancePanel.css`
- `frontend/src/components/dao/Overview.tsx`
- `frontend/src/components/dao/CreateProposal.tsx`
- `frontend/src/components/dao/AllProposals.tsx`
- `frontend/src/components/dao/MyProposals.tsx`
- `frontend/src/components/dao/DaoPanel.tsx`

Tasks:

- [ ] Prepare mobile styles even while DAO route is disabled.
- [ ] Stack proposal lists and proposal detail panels.
- [ ] Make vote buttons full-width.
- [ ] Make proposal metadata wrap.
- [ ] Avoid wide governance tables.
- [ ] Make create proposal form fields full-width.
- [ ] Make tabs or filters horizontally scroll only inside their own container if needed.

Acceptance criteria:

- [ ] DAO can be re-enabled later without launching a broken mobile page.

## 18. QA Matrix

Viewports:

- [ ] `375x667`
- [ ] `390x844`
- [ ] `414x896`
- [ ] `430x932`
- [ ] `768x1024`
- [ ] `1440x900`

Routes:

- [ ] `/`
- [ ] `/all-matches`
- [ ] `/my-predictions`
- [ ] `/leaderboard`
- [ ] `/rewards`
- [ ] `/progress`
- [ ] `/championship-pick`
- [ ] `/2026worldcup/match/:id`
- [ ] `/terms-of-use`
- [ ] `/dao-constitution`
- [ ] `/rules`
- [ ] `/admin/fixtures`
- [ ] `/simulator`

State checks:

- [ ] Loading
- [ ] Empty data
- [ ] Error
- [ ] Wallet disconnected
- [ ] Wallet connected
- [ ] Modal open
- [ ] Mobile keyboard open
- [ ] Sticky bars present
- [ ] Long team names
- [ ] Long wallet/user names
- [ ] Long legal/technical strings

Regression checks:

- [ ] Desktop sidebar visual regression
- [ ] Desktop All Matches visual regression
- [ ] Desktop My Predictions visual regression
- [ ] Desktop Leaderboard visual regression
- [ ] Desktop Rewards visual regression
- [ ] Desktop My Progress visual regression
- [ ] Desktop Match Detail visual regression
- [ ] Desktop Landing visual regression

## Notes During Implementation

Use this section to log decisions, tradeoffs, and completed batches.

- 2026-06-13: Created the initial mobile tracking plan.
- 2026-06-13: Added shared app navigation config, mobile-only bottom tab bar, and mobile app shell rules. Production build passed. Vite dev server is running at `http://localhost:3000/`. ESLint could not run because the frontend has no ESLint config file.
- 2026-06-13: Added mobile-only All Matches layout overrides for filters, match cards, team names, pool chips, status/action rows, and small-phone behavior.
- 2026-06-13: Fixed mobile wallet balance/freebet pills so their desktop flex-basis no longer becomes huge vertical empty space on narrow screens.
- 2026-06-13: Visual/source pass for mobile vertical clipping and bottom-nav overlap:
  - Screenshot-confirmed `/all-matches`, `/my-predictions`, and `/leaderboard` at `390x844`.
  - Source-confirmed `/rewards` and `/progress` bottom spacing via mobile app shell padding, page shell overflow rules, and fixed bottom nav height after headless Chrome repeatedly stopped the local dev server before those route screenshots could render.
  - No UI patch was required from this pass.
- 2026-06-13: Finished primary-page horizontal overflow containment:
  - Added mobile min-width/max-width containment to the main content shells and repeated cards on All Matches, My Predictions, Leaderboard, Rewards, and My Progress.
  - Constrained long labels, chips, match rows, wallet/referral/task rows, and action buttons to wrap or use intentional internal scrolling instead of creating document-level horizontal scroll.
  - Kept desktop selectors unchanged by scoping the new rules to mobile breakpoints.
- 2026-06-14: Normalized mobile type scale:
  - Added shared mobile typography tokens in `frontend/src/app-layout.css`.
  - Applied compact page-title, section-title, card-title, helper, label, and body text sizing across All Matches, My Predictions, Leaderboard, Rewards, and My Progress.
  - Kept changes scoped to mobile breakpoints so desktop typography remains unchanged.
- 2026-06-14: Standardized mobile card padding and section gaps:
  - Added shared mobile spacing tokens for card padding, section gaps, card gaps, and control gaps.
  - Applied the spacing rhythm across All Matches, My Predictions, Leaderboard, Rewards, and My Progress mobile layouts.
  - Marked desktop shell behavior as unchanged after manual confirmation.
- 2026-06-14: Removed mobile viewport-width font scaling and normalized compact-control letter spacing:
  - Added fixed mobile overrides for Rewards balance text and shared wallet button/balance/freebet text that otherwise used `vw` inside `clamp()`.
  - Set mobile compact controls, tabs, chips, badges, labels, buttons, selects, and bottom nav text to `letter-spacing: 0`.
  - Kept desktop font sizing behavior unchanged by scoping new rules to mobile breakpoints.
- 2026-06-14: Made primary actions full-width in constrained mobile areas:
  - Expanded prediction/detail/claim actions, filter clear buttons, leaderboard pager/buttons, reward/referral/task actions, modal actions, and progress footer actions where mobile space is constrained.
  - Kept compact icon/follow controls from being globally widened.
  - Scoped changes to mobile breakpoints to preserve desktop behavior.
- 2026-06-14: Standardized mobile touch target heights:
  - Added shared mobile control-height tokens.
  - Applied comfortable minimum heights to mobile buttons, selects, search fields, tabs, reward inputs, icon buttons, and bottom nav items.
  - Kept desktop control heights unchanged.
- 2026-06-14: Replaced familiar cramped text actions with accessible icon buttons:
  - Converted clear-filter buttons to icon-only buttons with `aria-label` and `title`.
  - Converted leaderboard refresh to an icon-only button with accessible naming.
  - Converted rewards copy actions to icon-only buttons with accessible naming.
  - Kept product/business actions such as Predict, Claim, Accept, Jump to me, and View matches as text buttons.
- 2026-06-14: Completed the Leaderboard mobile table/profile/accessibility pass:
  - Replaced special mobile podium treatment with a consistent horizontally scrollable table.
  - Kept mobile table information aligned with desktop: rank, wallet/user, matches, exact, outcomes, and points.
  - Made the user profile modal mobile-safe with `96vw`, internal scrolling, sticky close access, and long-address wrapping.
  - Enlarged the follow control for mobile, separated row/profile activation from follow/unfollow activation, and added keyboard access.
  - Added specific accessible labels, `aria-pressed`, `aria-busy`, `aria-live`, and `role="status"` where appropriate.
  - Decision: defer Playwright/Cypress setup until the broader mobile UI polish pass is complete; continue using production build plus manual viewport checks during active layout iteration.
- 2026-06-15: Advanced Match Detail mobile safety QA:
  - Added localhost-only match-state previews for open/not predicted, open/predicted, closed/awaiting result, final/predicted, and final/reward-ready via `previewMatchState`.
  - Added localhost-only Freebet previews for configured with balance, configured without enough balance, and ledger not configured via `previewFreebetState`.
  - Kept preview overrides inside the existing local `previewMatch=1` path so production data, real ledger checks, and desktop behavior remain unchanged.
  - Verified Vite TypeScript watcher reports zero errors and `git diff --check` passes for the preview-state work.
- 2026-06-13: Restored the All Matches mobile wallet header and fixed Rewards/My Progress wallet wrapper flex-basis so the shared wallet sits tightly like My Predictions and Leaderboard.
- 2026-06-13: Normalized My Predictions and Leaderboard mobile shell/header spacing to match the other menu pages.
- 2026-06-13: User verified the mobile bottom navigation on the primary app pages and confirmed the desktop sidebar navigation remains unchanged.
- 2026-06-13: Defined shared mobile page and panel padding tokens, then wired the primary app page headers to those tokens for consistent framing.
- 2026-06-13: Started horizontal overflow audit. Contained the My Predictions mobile table inside an internal scroll area so its wide grid cannot create document-level horizontal scroll.
- 2026-06-13: Continued horizontal overflow audit on Leaderboard. Added mobile containment/wrapping for tabs, table rows, sticky summary, earnings rows, championship pick rows, and upcoming match rows.
- 2026-06-13: Continued horizontal overflow audit on My Progress. Contained the mini leaderboard table inside internal scroll and stacked/wrapped upcoming match rows on mobile.
- 2026-06-13: Continued horizontal overflow audit on Rewards. Added mobile containment/wrapping for task rows, referral links/cards, copy/actions, and modal content.
- 2026-06-13: Audited top padding on All Matches, My Predictions, Leaderboard, Rewards, and My Progress. Confirmed primary mobile page shells use `padding: 0` and rely on the shared `10px` app top padding, with no duplicate top shell padding remaining.
- 2026-06-13: Audited global `overflow: hidden` usage. Kept intentional clipping for decorative backgrounds, cards, progress bars, ellipsis, and internal scroll areas; changed primary mobile header panels to `overflow: visible` so wallet/search/tab interactions are not trapped by desktop card clipping.
