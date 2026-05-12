# SmartCup League Championship Pick FE Review Bundle

Date: 2026-05-11

Purpose: focused review package for the Championship Pick frontend implementation and the small BolaoCore payment change needed for the submitted transaction value split.

Send this bundle instead of the full repo. It excludes local caches such as frontend/.yarn and excludes generated side effects such as Cargo.lock.

Contents:

- files/: copy of each changed source file relevant to the review.
- tracked-files.diff: patch for tracked modified files. New untracked files are included under files/frontend/src/pages/championship-pick/.
- git-status-at-packaging.txt: worktree status when this bundle was created.
- files/frontend/HOMEPAGE_PREVIEW_CHANGES.md: human-readable change log and caveats.

Important caveats for dev review:

- Temporary preview routes are enabled in frontend/src/App.tsx for local UI review without contract/API readiness.
- Championship Pick submitted/readback state is temporarily localStorage-based until BolaoCore exposes query_podium_pick(user).
- The Leaderboard after-results scoring layout is UI-ready but needs a proper BolaoCore query/result source to be production accurate.
- BolaoCore submit_podium_pick was edited locally to accept value and split 95% final prize / 5% protocol fee; this requires core build/deploy review.
