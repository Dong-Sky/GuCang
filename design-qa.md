# Minimal UI Preview — design QA

final result: passed

Verified on 2026-08-30. Delivery is restricted to `feat/minimal-ui` and Vercel Preview. No production database edits, environment-variable changes, migrations, historical-photo rewrites, or main-branch updates are part of this change.

## Evidence and comparison setup

- Sources: approved image set under `C:/Users/DMChoicer/.codex/generated_images/019fbe0a-f88d-73a0-bf88-dab09fcf0a05/`.
- Browser implementation: `http://127.0.0.1:3100`, isolated localhost-only Supabase protocol fixture on port 54339; no real family records.
- Mobile CSS viewport: 390 × 844. Reference/actual images are normalized to 390 px wide and placed in one comparison image, source left and actual right. Windows scrollbar/image-density differences are excluded from geometry findings.
- Fixture collection names/counts/photos are deliberately synthetic, not design-owned assets. The production photo components still use the existing private-image flow; no historical photo is replaced.
- Evidence directory: `.local-test/ui/` (gitignored). Each comparison below was opened with reference and actual together, not judged from an isolated screenshot.

| Screen/state | Approved reference file | Reviewed comparison |
| --- | --- | --- |
| Home | `exec-d2dc1244-5c3c-47a3-bbad-e159d5016c91.png` | `home-compare.png` |
| Collection/cards | `exec-3336eee2-f45b-4782-ac46-fbb76c6244ac.png` | `collection-cards-compare-v2.png` |
| Collection/detailed list | `exec-1a1678f0-0279-423a-bf1b-cc168f514f73.png` | `collection-list-compare-v2.png` |
| Add/one photo and required fields | `exec-1396b115-8f2a-4291-a8ab-0613af9d3e11.png` | `add-final-compare.png` |
| Locations/overview | `exec-67a23884-a1a1-4f6a-b00a-2ab416f33caa.png` | `locations-root-compare-v2.png` |
| Locations/house | `exec-2fe09302-1e9d-442a-a17f-619d2c6ea250.png` | `locations-house-compare-v2.png` |
| Locations/study | `exec-147a7e4a-2373-4fff-a919-138e7bd884c0.png` | `locations-study-compare.png` |
| Tasks/incomplete | `exec-75fad316-5b79-47bf-afd8-1f505c637e49.png` | `tasks-draft-compare-v2.png` |

Additional actual captures: `desktop-home.png`, `desktop-collection.png` (1280 × 900), `tablet-collection.png` (768 × 1024), `small-collection.png`, `small-add.png` (320 × 740), `tasks-out.png`, `tasks-trash.png`, `upload-retry.png`.

## Findings and iteration history

1. [P2, fixed] Home had extra viewport scrolling and overly generous inter-section spacing. Adjusted mobile minimum-height, pending block, and recent-section spacing. Re-captured in `home-compare.png`; two recent items and bottom navigation now fit without an unnecessary scrollbar.
2. [P2, fixed] Collection toolbar and row spacing pushed content too far below the approved density. Reduced collection header/tab/toolbar spacing and detailed-row height. Compared in `collection-cards-compare-v2.png` and `collection-list-compare-v2.png`. The two source variants differ slightly in toolbar height; implementation intentionally uses the same toolbar for both to avoid layout jumps.
3. [P2, fixed] Location overview initially put its action beside the page title and had an extra introduction. Moved “新建位置” beside “所有位置” and guidance below all root rows. Re-captured in `locations-root-compare-v2.png`; house/study comparisons verify the hierarchy, compact text-only rows and child counts.
4. [P2, fixed] Tasks initially used unnecessarily prominent outlined action buttons and loose spacing. Replaced these with compact text/chevron actions, reduced row spacing, and re-compared in `tasks-draft-compare-v2.png`. Exactly one panel is rendered; no swipe action layer exists.
5. [P2, fixed] The filled mobile add form initially put the secondary “更多资料” caption behind the sticky save area. Reduced vertical field/header gaps while retaining 44px inputs; `add-final-compare.png` shows the caption and save action together at 390 × 844. The shorter 320px screen scrolls vertically without losing access to Save.
6. [User feedback, fixed] Restored the exact original font-family stack after the user preferred the old font appearance. `font-compare.png` compares before/after at the same 390 × 844 list state; computed font family matches main, no horizontal overflow or console errors, and production build passed again. This user-approved typography change supersedes the initial mock-derived font-stack selection.

No unresolved P0/P1/P2 findings. Remaining P3 variations: OS font rendering and native select/datalist arrows; dynamic counts, fixture images and longer text; visible keyboard-focus outlines in automated captures. These do not change the approved structure or the main workflows.

## Fidelity review

- Typography: restrained dark headings, regular-weight field/row text, muted compact metadata; `GC-000000` stays beside category rather than becoming a primary title or full-width block. User feedback on 2026-08-30 requested the original softer font appearance, overriding the new font-stack choice. Restored the exact main-branch font family order: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif`; removed the newly added Segoe UI preference. Layout sizes and spacing remain the approved new design. No external font download or forced antialiasing is introduced.
- Spacing/layout: short home with two recent items; two-level collection controls; compact detailed rows; full-screen mobile add form with sticky Save; single tasks panel; all immediate location children, not a three-row cap. Desktop retains a sidebar and wider content.
- Color/shape: white canvas, forest-green identity and active actions, fine neutral separators; no purple glow, illustration backgrounds or decorative location cards. Missing-field copy uses muted warm contrast, errors remain visually distinct.
- Assets: real collection photos continue through the existing private-image cache/lazy-loading component. No location thumbnail, synthetic location photo or photo placeholder appears in location rows. Supplied test photos are explicitly disposable fixture content. GC raster mark is clean at header and PWA icon sizes; interface icons use Phosphor.
- Copy: required markers only for IP/category/current location; optional title hidden in More; automatic six-digit-minimum number; “保存” versus “保存为待完善” follows completeness. The final agreed location CTA is “查看这里的谷子 / 包含子位置”, deliberately replacing the earlier wording shown in some references.

## Behavior and safety verification

- Browser: Codex in-app browser. Production build loaded with localhost-only Supabase protocol fixture; no authenticated production session used. Fixture starts with 688 instances (687 active, 11 incomplete, 3 out, 1 in trash).
- Search, exact inventory-code lookup, clear, 24-item pagination, card/list toggle and IP → character grouping verified. One character remains one group across item types.
- Root → house → study → child navigation verified; study exposes four children and 338 recursively counted instances. “查看这里的谷子” includes both items directly at the selected parent and deeper descendants. Location rows contain zero images.
- Creating a local child location and editing a local non-root location verified, including persisted parent/type/name and subtree selection safeguards.
- Added a disposable one-photo record with no style name. Forced one thumbnail upload failure: photo/fields were retained, retry kept exactly one instance/code and uploaded only the failed file (three total upload requests, maximum concurrency two). Save did not reload household metadata and instance reads were scoped to the saved style.
- Take-out and return updated the correct instance, location and tasks count. Soft-delete and restore of local `GC-000688` restored the same code, kept only one tasks panel visible and did not alter historical image metadata (hash equality verified).
- Camera and gallery remain separate file inputs (`capture=environment` only on camera), selected-photo preview/removal present, maximum three photos retained. Physical Android camera launch/keyboard behavior still needs a real-device check; desktop emulation is not claimed as hardware testing.
- 320/390/768/1280px layouts checked: no horizontal overflow. Modal Tab/Shift+Tab stays inside the dialog; Escape closes and background is inert. Save remains reachable on shorter screens. Native browser/PWA history is retained; abandoned custom row-swipe interactions are not reintroduced.
- Production-browser console error/warning sample: empty. `npm run lint`: pass. `npm test`: 19/19 pass. `npm run build`: pass (Next.js production compilation, TypeScript and page generation). Existing Node module-type warnings in the unit harness are non-failing.
- `tests/browser-smoke.mjs` selectors updated for current names/structure and syntax-checked. The standalone Playwright runner was not executed; interactive browser checks above used the approved in-app browser instead.

## Brand provenance and implementation boundaries

Generated raster source: `exec-4d162bc2-4963-41be-aaf6-1f333abb352e.png` in the same generated-images directory. Reference: approved collection screen. ImageGen direction: reproduce only the forest-green interlocking GC mark from the approved upper-left logo, preserving its geometry/color; centered on plain white, no UI/text/frame/shadow/gradient, approximately 12% margin. The result was visually inspected before use.

`scripts/prepare-brand.mjs` only trims the white border and exports the raster mark plus padded 192/512px PWA icons; it does not redraw it. `scripts/compare-ui.mjs` mechanically places normalized reference/actual screenshots side by side, without retouching either.

This is an existing application update, not a backend rewrite. Existing upload retry/compression/cache paths, permissions, inventory IDs, seven-day trash behavior and historical media are preserved. Preview is code isolation, not a database copy: it inherits the existing Vercel Preview environment configuration, which this change does not modify.
