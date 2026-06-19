# SmartCup League Compact Desktop Density Plan

Status legend:

- [ ] Planned
- [~] In progress
- [x] Done

Primary objective: improve usability on normal and small laptops by making desktop pages feel closer to the current browser 80% zoom, without using browser zoom, `zoom`, or transform-based page scaling.

## Guiding Decision

Do not apply global `zoom: 0.8` or `transform: scale(0.8)`.

Instead, add a responsive compact desktop density layer that reduces excessive spacing, panel height, row height, and oversized visual padding only where laptop viewport space is constrained.

## Desktop Protection Rules

- [x] Do not use global browser-like scaling such as `zoom: 0.8`, `transform: scale(...)`, root `font-size` shrinkage, or page wrapper scaling.
- [x] Keep mobile rules, mobile page density, and mobile bottom navigation unchanged.
- [x] Keep large desktop monitors unchanged where practical, especially `1920x1080` and wider viewports.
- [x] Scope compact desktop rules to laptop-like desktop viewports using `min-width: 769px` plus width and/or height constraints.
- [x] Prefer page/component-level spacing reductions over global typography reductions.
- [x] Do not reduce core body text below readable desktop sizes.
- [x] Do not make click targets feel tiny or hard to use; compact controls should still feel clickable with a mouse/trackpad.
- [x] Avoid layout-wide transforms that break fixed positioning, sticky elements, scroll, modals, or hit testing.
- [x] Preserve existing route behavior, data fetching, wallet state, and transaction flows.
- [x] Preserve current visual hierarchy: primary actions such as Claim, Predict, and Submit must become easier to reach, not less prominent.
- [x] Keep compact rules additive and reversible: add scoped overrides instead of rewriting base desktop styles where possible.
- [x] Do not mix compact desktop work with paused mobile UI changes in the same commit.
- [ ] Before committing, verify the compact commit does not include:
  - `MOBILE_UI_IMPROVEMENT_PLAN.md`
  - paused mobile Match Detail preview changes
  - `frontend/tmp-mobile-visual-pass/`
- [ ] After each compact page pass, check at least one constrained laptop viewport and one large desktop viewport.

## Proposed Breakpoints

Primary compact desktop breakpoint:

```css
@media (min-width: 769px) and (max-width: 1440px) {
  /* compact laptop desktop density */
}
```

Short-height laptop breakpoint:

```css
@media (min-width: 769px) and (max-height: 850px) {
  /* compact vertical density for laptops where below-fold actions are hard to reach */
}
```

Extra-constrained laptop breakpoint:

```css
@media (min-width: 769px) and (max-width: 1366px),
       (min-width: 769px) and (max-height: 768px) {
  /* strongest compact desktop pass */
}
```

## Verification Viewports

- [ ] `1280x720`
- [ ] `1280x800`
- [ ] `1366x768`
- [ ] `1440x900`
- [ ] `1536x864`
- [ ] `1920x1080` unchanged or only minimally affected

## Execution Order

1. [x] Define shared compact desktop density tokens.
2. [x] Compact global app shell and sidebar spacing.
3. [x] Compact My Predictions desktop cards and make claim actions visible earlier.
4. [x] Compact All Matches desktop cards and action/status rows.
5. [x] Compact Match Detail desktop panels and claim/prediction action zone.
6. [x] Compact My Progress dashboard cards and leaderboard rows.
7. [x] Compact Leaderboard page header, table rows, and side content.
8. [x] Compact Rewards page header, task rows, and wallet/freebet sections.
9. [x] Check Championship Pick if laptop viewport pressure appears there.
10. [x] Full laptop viewport QA pass.
11. [x] Large desktop regression pass.
12. [~] Commit only compact desktop density changes.

## 10. Full Laptop Viewport QA Pass

Target routes:

- `/all-matches`
- `/my-predictions`
- `/leaderboard`
- `/rewards`
- `/progress`
- `/championship-pick`
- Match detail route from an opened match card

Tasks:

- [x] Check compact laptop viewports manually because this repo does not currently include Playwright or Cypress.
- [x] Verify `1280x720`.
- [x] Verify `1280x800`.
- [x] Verify `1366x768`.
- [x] Verify `1440x900`.
- [x] Confirm primary actions are visible sooner:
  - Claim
  - Predict
  - Submit
  - Get VARA
- [x] Confirm no desktop page feels mobile-like.
- [x] Confirm no footer, sidebar, wallet card, or action row overlaps page content.
- [x] Confirm no accidental horizontal document scroll on compact desktop.
- [x] Confirm changed pages still behave well at normal laptop browser chrome height.

Acceptance criteria:

- [x] Small laptop users can see the important action area without browser zooming to 80%.
- [x] Dense pages remain readable and visually aligned.
- [x] No mobile-specific layout appears on desktop laptop widths.
- [x] Issues found during QA are fixed before commit.

## 11. Large Desktop Regression Pass

Target routes:

- `/all-matches`
- `/my-predictions`
- `/leaderboard`
- `/rewards`
- `/progress`
- `/championship-pick`

Tasks:

- [x] Open changed desktop routes locally for large-desktop regression review.
- [x] Confirm compact overrides are scoped to laptop-like breakpoints such as `max-width: 1440px`, `max-height: 850px`, or page-specific compact desktop ranges.
- [x] Confirm no global browser-like scaling was introduced:
  - no `zoom`
  - no `transform: scale(...)`
  - no root `font-size: 80%`
- [x] Run `git diff --check`.
- [x] Run frontend production build.

Acceptance criteria:

- [x] Large desktop monitors remain unchanged or only minimally affected by intended bounded compact rules.
- [x] The project builds successfully after compact desktop changes.
- [x] No new generated build files are staged by the regression pass.

## 12. Compact Desktop Commit Package

Status: ready for commit preparation.

Include only compact desktop density files:

- [ ] `frontend/src/app-layout.css`
- [ ] `frontend/src/components/layout/sidebar/scb-dashboard.css`
- [ ] `frontend/src/components/leaderboard/leaderboards.css`
- [ ] `frontend/src/components/predictions/all-matchs.css`
- [ ] `frontend/src/components/predictions/my-predictions.css`
- [ ] `frontend/src/pages/championship-pick/ChampionshipPick.tsx`
- [ ] `frontend/src/pages/championship-pick/championship-pick.css`
- [ ] `frontend/src/pages/home/dashboard.css`
- [ ] `frontend/src/pages/matchs/match.css`
- [ ] `frontend/src/pages/matchs/matchcard.css`
- [ ] `frontend/src/pages/rewards/rewards.css`
- [ ] `COMPACT_DESKTOP_DENSITY_PLAN.md`

Reviewed and excluded from this compact desktop commit:

- [x] `frontend/src/pages/matchs/MatchCard.tsx`
  - Decision: exclude.
  - Reason: current diff is dev-preview/freebet-state logic, not compact desktop density.

Exclude from this compact desktop commit:

- [ ] `MOBILE_UI_IMPROVEMENT_PLAN.md`
- [ ] `frontend/tmp-mobile-visual-pass/`
- [ ] `frontend/src/pages/matchs/MatchCard.tsx`
- [ ] Any unrelated mobile UI or preview-only artifact.

Final commit checks:

- [x] `git diff --check`
- [x] Frontend production build
- [ ] Review staged diff before commit.
- [ ] Commit with a compact desktop density message.
- [ ] Push after local branch is synchronized with the main repo.

## 9. Championship Pick Density Check

Target files:

- `frontend/src/pages/championship-pick/ChampionshipPick.tsx`
- `frontend/src/pages/championship-pick/championship-pick.css`

Tasks:

- [x] Confirm the primary Championship Pick panels fit acceptably on a 13-inch laptop viewport.
- [x] Remove the floating Get VARA CTA from the Championship Pick page footer area.
- [x] Place Get VARA inline at the right side of the footer on desktop.
- [x] Keep footer legal links readable and horizontally aligned where space allows.
- [x] Allow the footer to stack only on narrower/mobile viewports.

Acceptance criteria:

- [x] Footer text is not smashed into the bottom-left corner.
- [x] Get VARA appears in its proper footer position on desktop instead of floating over content.
- [x] Championship Pick layout remains otherwise unchanged.

## 1. Shared Compact Desktop Tokens

Target files:

- `frontend/src/app-layout.css`
- `frontend/src/components/layout/sidebar/scb-dashboard.css`

Tasks:

- [x] Add compact desktop CSS variables for:
  - page top padding
  - page side padding
  - section gap
  - card padding
  - card gap
  - control height
  - dense row height
- [x] Keep variables scoped to desktop compact breakpoints.
- [x] Do not alter mobile variables.
- [x] Do not alter default large-desktop variables unless necessary.

Acceptance criteria:

- [x] Compact density can be reused across pages.
- [x] Large desktop visual rhythm remains recognizable.

## 2. App Shell And Sidebar Density

Target files:

- `frontend/src/app-layout.css`
- `frontend/src/components/layout/sidebar/scb-dashboard.css`

Tasks:

- [x] Reduce desktop compact main padding.
- [x] Reduce sidebar internal gaps and nav item padding on compact laptop viewports.
- [x] Consider slightly narrower sidebar only if content visibility needs it.
- [x] Keep sidebar labels readable.
- [x] Keep desktop sidebar behavior unchanged on large monitors.

Acceptance criteria:

- [x] More vertical content is visible at `1366x768`.
- [x] Sidebar remains comfortable and does not look mobile-like.

## 3. My Predictions Claim Visibility

Target files:

- `frontend/src/components/predictions/QueryBetsByUser.tsx`
- `frontend/src/components/predictions/my-predictions.css`

Tasks:

- [x] Identify why claim actions fall below the fold on compact laptops.
- [x] Reduce desktop compact card padding and row gaps.
- [x] Reduce desktop compact header/wallet vertical footprint.
- [x] Make finalized/claim-ready cards expose the claim action earlier.
- [x] Ensure claim button remains visually prominent.
- [x] Avoid hiding prediction details that users need for trust.

Acceptance criteria:

- [x] Claim button is visible sooner at `1366x768`.
- [x] Claim-ready cards still feel premium and readable.
- [x] Large desktop My Predictions remains unchanged or minimally affected.

Implementation notes:

- Added compact desktop-only CSS overrides in `frontend/src/components/predictions/my-predictions.css`.
- Compressed the header, search, info cards, filters, table rows, match metadata, pick cells, and claim buttons only inside laptop-like desktop breakpoints.
- Kept mobile rules untouched and avoided component/data-flow changes.

## 4. All Matches Density

Target files:

- `frontend/src/components/predictions/AllMatchs.tsx`
- `frontend/src/components/predictions/all-matchs.css`

Tasks:

- [x] Reduce filter/header height on compact desktop.
- [x] Reduce match card vertical padding and tag gaps.
- [x] Keep team names, status tags, pool info, and action hints readable.
- [x] Ensure reward-ready/static claim badges do not push important content down.

Acceptance criteria:

- [x] More match cards are visible at `1366x768`.
- [x] No desktop action/status content becomes cramped.

Implementation notes:

- Added compact desktop-only CSS overrides in `frontend/src/components/predictions/all-matchs.css`.
- Compressed the header, search, info cards, filters, championship pick callout, card top rows, status/action badges, metadata chips, outcome chips, and prize pool blocks.
- Kept mobile rules and All Matches data/action behavior untouched.

## 5. Match Detail Density

Target files:

- `frontend/src/pages/matchs/match.css`
- `frontend/src/pages/matchs/matchcard.css`
- `frontend/src/pages/matchs/MatchCard.tsx`

Tasks:

- [x] Reduce desktop compact score/header vertical footprint.
- [x] Reduce panel/card padding.
- [x] Keep claim and prediction submit actions above the fold where possible.
- [x] Keep desktop currency selector refinement intact.
- [x] Do not disturb mobile match detail rules.

Acceptance criteria:

- [x] Match Detail actions are easier to reach on compact laptops.
- [x] Desktop claim-ready state is visible without browser zoom where practical.

Implementation notes:

- Added compact desktop-only CSS overrides in `frontend/src/pages/matchs/match.css` and `frontend/src/pages/matchs/matchcard.css`.
- Compressed the route frame, topbar, grid, score header, flags, claim CTA, prediction form, currency buttons, stake controls, metadata, submit button, and prize estimate.
- Kept mobile Match Detail rules and `MatchCard.tsx` behavior untouched for this pass.

## 6. My Progress Density

Target files:

- `frontend/src/pages/home/Home.tsx`
- `frontend/src/pages/home/dashboard.css`

Tasks:

- [x] Reduce dashboard card padding and grid gaps on compact desktop.
- [x] Reduce hero/header panel height.
- [x] Reduce leaderboard row height while keeping columns readable.
- [x] Keep exact/outcome/points columns visible and aligned.

Acceptance criteria:

- [x] Main dashboard stats and leaderboard fit better on small laptops.
- [x] Recent leaderboard accuracy fix remains visible.

Implementation notes:

- Added compact desktop-only CSS overrides in `frontend/src/pages/home/dashboard.css`.
- Compressed the progress header, tabs, grid gaps, card padding, status/performance/prize/activity/matches sections, and leaderboard rows.
- Preserved leaderboard columns for matches, exact, outcome, and points; no `Home.tsx` data behavior was changed.

## 7. Leaderboard Density

Target files:

- `frontend/src/components/leaderboard/Leaderboards.tsx`
- `frontend/src/components/leaderboard/leaderboards.css`

Tasks:

- [x] Reduce header and wallet section height.
- [x] Reduce table row height and card padding.
- [x] Preserve points, exact, outcome, matches, and wallet readability.
- [x] Keep profile modal sizing unchanged unless needed.

Acceptance criteria:

- [x] More leaderboard rows fit on compact laptop screens.
- [x] User profile/follow controls remain easy to use.

Implementation notes:

- Added compact desktop-only CSS overrides in `frontend/src/components/leaderboard/leaderboards.css`.
- Compressed the header, wallet/search area, tournament chips, tabs, table card, six-column leaderboard rows, side cards, upcoming match rows, and sticky rank bar.
- Preserved matches, exact, outcomes, points, and wallet readability; increased the compact desktop follow button target.

## 8. Rewards Density

Target files:

- `frontend/src/pages/rewards/Rewards.tsx`
- `frontend/src/pages/rewards/rewards.css`

Tasks:

- [x] Reduce header/wallet/reward summary height.
- [x] Reduce task card padding and row gaps.
- [x] Keep X task reward values visually clear.
- [x] Keep referral/link rows readable.

Acceptance criteria:

- [x] Reward tasks are easier to scan on laptop screens.
- [x] Existing mobile Rewards layout remains unchanged.

Implementation notes:

- Added compact desktop-only CSS overrides in `frontend/src/pages/rewards/rewards.css` for the Rewards header, wallet area, freebet balance summary, and top action buttons.
- Tightened compact desktop Rewards panel headings, X task list gaps, and X task row padding while keeping reward values visible.
- Added compact desktop pill styling for X task reward values so `2,000` and `4,000 VARA` remain prominent after row compression.
- Tightened referral alert, referral link, empty state, referral cards, and progress rows while keeping long referral URLs contained.
- Mobile Rewards rules remain untouched.

## 9. QA Matrix

For each route, test at `1366x768`, `1440x900`, and `1920x1080`.

- [ ] `/all-matches`
- [ ] `/my-predictions`
- [ ] `/leaderboard`
- [ ] `/rewards`
- [ ] `/progress`
- [ ] `/2026worldcup/match/:id`

State checks:

- [ ] Claim-ready prediction
- [ ] Finalized prediction
- [ ] Open prediction
- [ ] Wallet connected
- [ ] Wallet disconnected
- [ ] Loading state
- [ ] Empty state
- [ ] Long wallet/display names
- [ ] Long team names

Regression checks:

- [ ] `1920x1080` desktop still feels like the current full desktop design.
- [ ] Mobile viewport still uses mobile UI rules.
- [ ] No page-level horizontal scroll introduced.
- [ ] Sticky/fixed elements still align.
- [ ] Buttons remain clickable and visually clear.

## Notes During Implementation

- 2026-06-18: Created compact desktop density plan after reports that normal/small laptop users need browser zoom around 80% to see key actions such as claim buttons.
- Decision: implement a compact desktop density layer, not literal browser/page zoom.
- 2026-06-18: Reinforced desktop protection rules:
  - No global `zoom`, page-scale transform, root font-size shrinkage, or wrapper scaling.
  - Compact changes must be scoped to laptop-like desktop breakpoints.
  - Mobile UI work and compact desktop work must remain separate for commits.
  - Primary actions should become easier to reach without becoming visually weaker.
- 2026-06-18: Defined shared compact desktop density tokens:
  - Added laptop-scoped page, panel, card, row, control, title, helper, and label tokens in `frontend/src/app-layout.css`.
  - Added laptop-scoped sidebar and shell density tokens in `frontend/src/components/layout/sidebar/scb-dashboard.css`.
  - Tokens are defined only; page-specific compact layout application starts in the next task.
- 2026-06-18: Applied compact desktop density tokens to the global app shell and sidebar:
  - Reduced app main padding only inside compact desktop breakpoints.
  - Reduced shell gap/padding, sidebar width/padding, logo width, nav spacing, nav item height, icon size, and social icon spacing only for laptop-like desktop viewports.
  - Mobile and large desktop base rules remain unchanged.
- Initial priority: My Predictions claim visibility, then Match Detail action visibility, then other app pages.
