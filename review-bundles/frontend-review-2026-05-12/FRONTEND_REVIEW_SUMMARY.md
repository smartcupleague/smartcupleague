# SmartCup League FE Review Bundle - May 12, 2026

Status: frontend review bundle only. These files are copied from the local working tree so the dev can review and commit selectively.

## What Is Included

- `files/` contains the frontend files changed locally, preserving their repo-relative paths.
- `tracked-frontend-files.diff` contains the diff for tracked frontend files.
- New untracked Championship Pick files are included as full files under `files/frontend/src/pages/championship-pick/`.

## Main FE Topics

- Homepage and carousel updates.
- Terms of Use page replacement and first-connect agreement flow.
- Onboarding nickname/profile cleanup.
- Footer standardization across user-facing pages.
- Local preview route guards for review.
- My Progress page enhancements.
- Match Prediction page header/sidebar fixes.
- All Matches page enhancements, including `Your Pick` tags.
- Championship Pick page and entry points.
- Leaderboard column/data updates.
- Sidebar navigation and social links.
- DAO page deactivation from active app navigation.

## Important Review Notes

- The onboarding nickname/profile cleanup was already committed separately in repo commit `4e835ce`.
- Championship Pick pages/widgets/modals, preview-route work, and related FE entry points are still local/uncommitted unless the dev chooses to commit them.
- The `frontend/.yarn/` folder is intentionally excluded from this bundle.
- Some FE wiring depends on backend/database changes that are not included in this frontend-only zip.

## Deployment Caveats To Keep Visible

- The live Supabase `user_leaderboard_stats` view still needs the `outcome_count` path applied from `api/app/supabase/schema.sql`; otherwise the Leaderboard `Outcomes` column will safely fall back to `—`/`0`.
- Championship Pick submitted state currently uses localStorage until bolao-core exposes a wallet-scoped query such as `query_podium_pick(user)`.
- Temporary preview route guards in `frontend/src/App.tsx` should be reviewed before production.
- Championship Pick payment flow depends on the corresponding bolao-core podium-pick stake behavior being deployed before production use.

## Suggested Review Order

1. Start with `frontend/HOMEPAGE_PREVIEW_CHANGES.md` for the complete running changelog.
2. Review legal/onboarding updates:
   - `frontend/src/pages/legal/TermsOfUse.tsx`
   - `frontend/src/components/onboarding/OnboardingModal.tsx`
3. Review app routing/preview guards:
   - `frontend/src/App.tsx`
   - `frontend/src/pages/index.tsx`
4. Review Championship Pick:
   - `frontend/src/pages/championship-pick/`
   - All Matches, My Progress, and Leaderboard entry points.
5. Review leaderboard and stats wiring:
   - `frontend/src/components/leaderboard/Leaderboards.tsx`
   - `frontend/src/components/leaderboard/UserProfileModal.tsx`
6. Run frontend checks before commit:
   - `./node_modules/.bin/tsc -b`
