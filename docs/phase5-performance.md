# Phase 5C — performance work in progress

Preview-only branch: `feat/phase5-performance`, based on phase 5B maintenance.
No production database, environment or main-branch changes.

## Implemented

- Startup and saved-style refresh no longer read up to 300 movement events.
  Details retain their independent instance-scoped, ten-row history pagination.
- BackupPanel is dynamically imported on settings entry, keeping the ZIP tool
  outside the eagerly imported application module graph.
- CI builds against localhost-only mock configuration and runs the phase 5
  browser regressions at 390px and 1280px. No cloud credentials are required.
- Portable browser runtime supports the desktop bundled installation and the
  pinned CI Playwright package. The runner owns and shuts down its test server,
  refuses an occupied port, and bounds individual browser tests to two minutes.

## Verified locally (2026-09-06)

- All 36 unit/API tests pass; assertions cover no history GET during startup or
  save and history still present when explicitly fetched after a move.
- Changed application/API files pass ESLint; Webpack production build and
  TypeScript pass. Default Turbopack build is blocked by this local copy's
  node_modules junction pointing outside its root, not an application diagnosis.
- The portable runner passes all four browser scenarios: backup roundtrip and
  malformed archive rejection; cleanup cancel, failure and retry, at both widths.
- No real cloud writes are performed by these tests.

## Remaining before 5C can be called complete

- True server-side collection browsing/search pagination and summary endpoints.
  Current startup still reads all metadata pages. Do not replace this with one
  page without changing search, IP/location counts, bulk selection and tasks:
  those currently depend on a complete Workspace and would otherwise miss data.
- Recent-items-first loading, independent summary loading and performance
  measurements with a large catalog.
- Cloud CI and Preview verification, including the inherited phase 5B migration.
- User acceptance before any main merge. This is not a release-ready claim.
