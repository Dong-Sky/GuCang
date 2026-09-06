# Phase 5C — performance Preview

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

## Earlier follow-up list (resolved locally below; cloud acceptance separate)

- True server-side collection browsing/search pagination and summary endpoints.
  Current startup still reads all metadata pages. Do not replace this with one
  page without changing search, IP/location counts, bulk selection and tasks:
  those currently depend on a complete Workspace and would otherwise miss data.
- Recent-items-first loading, independent summary loading and performance
  measurements with a large catalog.
- Cloud CI and Preview verification, including the inherited phase 5B migration.
- User acceptance before any main merge. This is not a release-ready claim.

## Integration regression follow-up

- 37 unit/API tests pass. Pagination now rejects missing payloads, changing
  totals, excess rows and invalid page sizes instead of publishing partial data.
- `node tests/run-phase5-browser.mjs --full` passed phase 1–5 regression flows:
  drafts, continuous entry, batch edits, filters, photo ordering/removal/recovery,
  failed uploads/retries, mobile Back cancellation, backup and maintenance.
- Full ESLint and Webpack production build pass. CI now runs the integrated
  suite, using the portable browser runtime for every included script.
- The combined branch remains the only phase 5 development target. No main push
  or merge, production schema change, or production business-data write.
- These results preceded the server-pagination work below.

## Catalog follow-up, 2026-09-06

- Cold startup now reads references, a server summary and two recent items.
- All-items browsing/search uses authenticated, RLS-protected 24-item database
  pages. Search and filter choices include unloaded records; stale responses
  are ignored, errors offer retry, and pages clamp to the actual result count.
- Advanced views (IP grouping, tasks, locations, editing and batch operations)
  deliberately load the complete index on first entry, preserving counts and
  selection semantics. It remains cached for that session. This is not server
  pagination for every advanced view.
- 38 unit/API tests pass, including 2,505-record startup/page/search coverage.
- Integrated phase 1–5 browser regressions pass at 390px and 1280px, including
  new remote-page/search-to-detail handoff tests. Local mocked login-to-home
  measured 289ms mobile and 216ms desktop, not production latency claims.
- Full ESLint, TypeScript and Webpack production build pass.
- Test-only SQL assertions pass for summary counts, pagination, numbered
  search, request bounds and cross-household access rejection. Assertions roll
  back; functions are installed only in gucang-test.
- Cloud deployment verification remains separate. Never promote/merge as part
  of this phase. Production migrations require separate release review.
- Historical photos are unchanged. Backup inspection is not automatic restore;
  the earlier isolated restore drill does not recreate Supabase Auth or every
  platform setting.
