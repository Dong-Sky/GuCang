# Compact select focus and consistent page headers

Verified locally on 2026-08-30, on `fix/compact-select-focus`.

## Causes

- The location filter and photo-quality selector are deliberately borderless native selects. The shared `select:focus-visible` rule drew a 2px green outline with a 4px outward offset. After the native picker retained focus, this appeared as the large box reported by the user. Both shapes were reproduced in the local browser; the quality selector inherited a 6px border radius from form fields.
- Mobile page-specific CSS used a 70px topbar on Home and 60px elsewhere, with further Collection margin and font-size overrides. At 390px width, title tops were Home 80px, Collection 60px, Locations 70px and Tasks 70px. Tasks also rendered an otherwise absent introductory subtitle.

## Changes

- Only the two borderless utility selects replace the outward focus outline with a 2px inset underline. No forced `blur()`, selection handlers or native picker behavior were changed. Forced-colors mode retains a system-color outline because shadows can be suppressed there.
- The four main views use the same `PageHeader` component. Mobile topbar height, title size, padding and first-content spacing are shared; page-specific overrides and the Tasks introductory subtitle were removed.
- The original font-family stack, counts, location hierarchy and task-specific functional guidance remain unchanged.

## Verification

- Used `http://127.0.0.1:3101` and the localhost-only in-memory fixture on port 54339. No production or test-cloud database was queried or changed by this verification.
- Before/after screenshots and computed layout measurements are in `.local-test/select-focus/` (gitignored).
- At 390 × 844, all four titles begin at y=70, use 20px/28px typography, and their first content starts at y=108. At 1280 × 900, all four titles begin at y=98, use 29px/37.7px typography, and first content starts at y=159.6875.
- Also checked 320 × 740 and 768 × 1024: title geometry matches within each viewport, and no horizontal overflow was found.
- Location selection filtered the local fixture to 113 bedroom items; clearing the filter returned 687 active items. Focus stayed on the selector with `outline-width: 0px`, `outline-offset: 0px` and the inset underline visible.
- Photo quality switched between `standard` and `high`, retained the chosen value and did not draw the outward box. Only local form state changed; no collection was saved.
- All three Tasks tabs rendered exactly one panel, with the same header position and no introductory subtitle.
- `npm test`: 19/19 passed. `npm run lint` and `npm run build`: passed. Existing non-failing Node module-type warnings remain unchanged.
- Added permanent header and focus assertions to `tests/browser-smoke.mjs`; syntax checked it with `node --check`. The standalone Playwright runner was not executed in this session; interactive checks used the in-app browser. Physical Android picker behavior, complete native keyboard navigation and OS forced-colors mode still require their respective device checks.

This patch contains frontend presentation and regression-test changes only. Verification was completed locally before release. The authorized release merges these changes to `main` through the existing GitHub/Vercel workflow; no database migration, environment-variable change, data import or image rewrite is involved.
