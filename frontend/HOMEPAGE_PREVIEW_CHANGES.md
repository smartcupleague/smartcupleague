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

## Onboarding nickname/profile cleanup

Files:

- src/components/onboarding/OnboardingModal.tsx
- src/hooks/useOnboarding.ts
- src/hooks/useWalletProfile.ts
- src/App.tsx
- src/pages/AppLayout.tsx
- src/pages/home/Home.tsx

- Removed the email request from the terms/onboarding modal because email was only stored locally and is not currently used by the backend.
- Wired the onboarding nickname to the same wallet profile save flow used by the balance display-name editor.
- Nickname entry now saves to /api/v1/profiles/{walletHex} as display_name when a connected wallet is available, so it can enrich the leaderboard instead of only living in localStorage.
- Kept localStorage only for the onboarding acceptance/nickname state.
- Matched the nickname max length to the backend wallet_profiles display_name limit of 30 characters.
- Removed the duplicate Progress-page onboarding modal so the root App.tsx owns the terms acceptance flow.
- Added a wallet-profile update event so the balance display-name widget updates immediately when the onboarding nickname saves.
- Moved onboarding modal ownership to App.tsx so first-time connected users see it across all routed pages, not only sidebar-layout pages.
