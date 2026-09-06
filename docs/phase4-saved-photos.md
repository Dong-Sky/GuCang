# Phase 4: saved collection photos (Preview)

Scope: collection detail → 管理照片. Up to three active photos, reorder with a handle or move buttons, choose main photo, replace, rotate, remove, and recover recently removed photos. No dictionary or multi-character features.

## Data safety

- Photos belong to the style. The editor shows the number of affected instances, including trash; multiple instances require explicit acknowledgement.
- Replacement/rotation creates new immutable files at standard quality. Both variants must exist before the transaction changes the active album.
- `save_photo_album` uses membership checks and SECURITY INVOKER, locks the style briefly, validates the expected album and shared count, and updates metadata atomically. Repeating an already-applied album is harmless.
- Removal, replacement, and rotation archive the previous image metadata. Recovery is offered for seven days. This phase never physically deletes old files; archived files continue to count toward storage usage even after recovery expires.
- Failed or abandoned uploads may leave unreferenced new files. Automatic orphan cleanup is deliberately deferred, not silently performed.
- Cancel discards local adjustments. Save failures preserve the operation for retry; after starting a save, adjustment controls remain locked to avoid changing an uncertain submission.
- No schema/data migration or test writes on production. The additive function migration is applied to gucang-test only for this Preview. Before a later approved production merge: verified local backup under the existing latest-three/recycle-bin rule, apply the reviewed function migration to production, then release. Never promote a build containing test environment variables.

## Verification

- 28 unit tests, lint and production build pass.
- Phase 4 browser tests at 390px and 1280px: main-photo ordering, shared confirmation, remove/restore, replacement+rotation dimensions, failed thumbnail upload leaving old album intact, retry, unrelated style unchanged, reload persistence, no browser errors.
- Existing photo, phase 1, phase 2, entry-context, phase 3 and complete smoke suites pass, including 1205-record browsing/search and weak-network upload retry.
- Real PostgreSQL transaction test in `supabase/tests/phase4_photos.sql` is rolled back. Covers ordering, idempotence, restore, stale/duplicate/shared-count rejection, bad/missing upload, expiry and outsider rejection; verifies anonymous callers blocked and function invoker mode.
- Security advisor reports existing unrelated policies/definer-function/auth warnings; no new phase-4 function warning.

Manual phone acceptance still needed: actual camera/gallery selection, touch drag feel, rotation appearance, and recovery wording. Browser automation does not substitute for these device checks.
