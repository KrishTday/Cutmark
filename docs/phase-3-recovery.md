# Phase 3C — portable recovery and storage

Historical phase checkpoint: the current implementation and verification inventory are tracked in [the complete checklist](backlog.md), [Phase 4](phase-4.md) and [Phase 5](phase-5.md). Portable versions 1–3 and database version 7 supersede the earlier format/storage versions described below.

Implemented locally on October 14, 2026. Together with [caption delivery](phase-3.md) and [export settings](phase-3-export.md), this completes Phase 3 for the supported single-source, single-range Windows Edge workflows. No hosting, accounts or cloud processing are introduced.

## Editor-visible result

- Rename a project independently of its source filename. Names persist and participate in named undo/redo. Export filenames capture the title at rendering time; renaming does not relabel an earlier output.
- Duplicate the current project into an independently editable copy. Creation time is new for the duplicate and preserved through later exports. Source media stays shared, and an inherited export remains shared until replaced.
- Download a lightweight .cutmark.json project file or a .cutmark bundle including the complete source. Both capture current trim, corrected captions, style/delivery, readability guidance/review notes, scene cuts/analysis/settings/dismissals, editorial notes and export preferences.
- Restore into a separate project after reviewing its title, source and cue/marker counts. Lightweight files require matching media; bundles include it. A differently named exact source works. A different video with the same filename fails.
- Cancellation, malformed files, unsupported versions and quota failure preserve the current project and available MP4. Import transactions roll back metadata and media together; recovery can be retried.
- Inspect saved-media references, estimated site usage/quota and the English model cache. Shared media is counted once within each category; older unmeasured records and unavailable cache sizes are identified.
- Remove only the cached English Whisper model files, preserving other models/caches, projects, captions and source/output media. The next transcription downloads missing model files again.
- Request browser storage retention only after an explanation. A grant reduces automatic eviction; it does not replace downloaded backups or protect against clearing browser data.

## Checklist

| Backlog items | Status | Verification / limits |
| --- | --- | --- |
| 72: names and duplication | Implemented | Rename/undo, saved titles, source filename preservation, immutable output filenames, creation times and independent duplicate edits pass. Each project retains its latest successful output; duplicate creates an independently revisable variant. |
| 73: portable project format | Implemented | Versioned lightweight JSON and source-included binary bundles are downloaded and restored in fresh browser contexts. Previous rendered MP4s, session undo, models and derived preview data are deliberately excluded and explained before download/recovery. |
| 74: media relinking | Implemented | Complete-content fingerprint, byte size, duration, dimensions, codec/track presence and HDR metadata checked. Filename is advisory. Same-name changed content fails; renamed identical media passes. Converted media is not accepted as an exact replacement. |
| 75: legacy preservation | Implemented | Version-1 recent records and version-2 combined assets remain readable. Original-source versus export-only provenance stays explicit in portable files. No original source is inferred from a saved export. |
| 76: visible retention policy | Implemented | Projects remain until explicit deletion. Latest output replaces the prior stored output only after successful rendering/validation; shared duplicate outputs remain while referenced. No silent project eviction or pin exception is needed because all projects follow the same retention policy. |
| 77: information and targeted cleanup | Implemented for current caches | Site estimate, measured media references and cache file counts/reported lengths available. Scoped English-model cleanup and individual project deletion pass. Preview thumbnails/waveforms are memory-only and released on source changes. No erase-everything action is offered. |
| 78: metadata and media separation/reuse | Implemented | Listings use metadata. Duplicates share source/export references; parent deletion preserves media needed by a duplicate. A new export stores only that new output, keeping its source shared. Unreferenced asset keys are collected after export/deletion. |
| 79: quota safety | Implemented | Open work/downloads retained; portable downloads require no IndexedDB save. Failed recovery leaves no partial project and allows retry. Existing save-retry and source/output downloads remain. |
| 80: durable storage | Implemented | Explained user-triggered request with grant, denial and unsupported/error handling. Actual grant policy remains browser-controlled. Local file handles are not required; ordinary downloads and IndexedDB remain the portable fallback. |

## Portable format v1

The lightweight file is UTF-8 JSON with format cutmark-project, version 1, title, creation/edit times, a source reference and current edit decisions. The source reference records original filename/type, byte size, metadata, provenance and a content fingerprint. Unknown format versions, editing features and unsupported range counts fail rather than being silently discarded. This version supports one source range; Phase 4 must extend the format when sequence editing is added.

The bundle is a Blob concatenation, not a ZIP or base64 document:

1. Eight ASCII bytes CMARK001.
2. Four-byte little-endian unsigned JSON-header length.
3. That many bytes of the same UTF-8 project JSON.
4. The complete source bytes.

Metadata is limited to 16 MiB and collections to 50,000 entries, with bounded nesting and validated timing, identifiers, styles, notes and settings. A source-length mismatch, incomplete header or invalid UTF-8/JSON is rejected. A rendered output is not included as an additional artifact. For an export-only legacy project, the retained export is the source itself and its limitation is recorded.

Fingerprint algorithm sha256-chunks-4m-v1 hashes each consecutive 4 MiB source chunk with SHA-256, turns those digests into lowercase hexadecimal, then hashes UTF-8 text cutmark-source-v1:<decimal byte length>:<ordered chunk digests joined by colons>. Every source byte participates. This is an identity check, not a signature authenticating who authored a project file.

Hashing is cancellable between bounded reads/digests. Completed fingerprints are cached by immutable Blob identity. Bundling concatenates the source Blob directly instead of reading the entire video into a JavaScript buffer. Recovery probes the source and checks its fingerprint before committing or changing the open project. There is no mismatch override or automatic timing clamping.

## Saved assets and compatibility

IndexedDB database version is now 3; editable metadata schema remains 2. Upgrading preserves the existing projects/assets stores, legacy combined records and all prior media. Lower-version clients cannot reopen that database and overwrite reference fields. Version-change handlers close connections; blocked upgrades report a retry/close-other-tabs instruction. A stale tab's live data and downloads are not erased, and no automatic refresh is forced.

New records store source media under a stable source-asset key and each rendered output under an export-artifact key. Project metadata records both references. Duplicates reuse them. Changing an export updates only its output reference. Deleting a project collects only keys no remaining project uses; source media survives deleting its original owner when a duplicate still refers to it.

Older combined records can retain an old output alongside their source until that source asset is removed; cleanup favors preserving legacy media. Reported source/output category sizes can overlap for export-only legacy media, and the UI explains this. Site usage remains an estimate including storage overhead and browser caches.

## Verification

- 35 unit regressions pass, including UTF-8 portable round trips, Unicode/multiline wording, long caption review keys, markers/styles/provenance, invalid/unsupported metadata, truncated bundles, exact-source rejection, cancellable multi-chunk hashing, shared-media accounting and model URL scope.
- Lint, TypeScript and production static build pass. The existing multiple-lockfile workspace-root warning remains.
- The project-backups Edge suite passes actual project/bundle downloads; rename/undo and output-name snapshots; shared source/output duplication; parent deletion and reopening; independent export and unused-output collection; version-2 combined-asset upgrade and stale-client rejection; fresh-context exact-source relinking; restored cuts, styles, words and notes; bundled recovery and a valid new MP4; malformed version, cancellation, quota rollback/retry; mobile overflow and no uncaught browser errors.
- The storage suite uses real CacheStorage entries to verify removing only the English-model repository while preserving unrelated cache entries, project assets, edited captions and the prior MP4. Cancellation retains remaining entries. Grant/denial responses are injected to verify UI/API handling; these are not a claim that Edge always grants persistent storage.
- Earlier safety, caption-delivery, export-settings, timeline/transcript, scene/marker and real-speech suites all pass on the upgraded database. Actual cached English recognition works with model downloads blocked.
- Large-media architecture uses bounded hashing and Blob-backed bundles. Actual multi-gigabyte archive downloads/restore, storage limits, browser heap stability and file-dialog delays remain manual performance checks.

Run npm test, npm run lint and npm run build from frontend. Serve frontend/out and run tests/project-backups.mjs and tests/storage-tools.mjs with CUTMARK_TEST_URL, CUTMARK_PLAYWRIGHT_PATH and CUTMARK_ARTIFACTS configured. Backup tests reuse Phase 1 boundary.mp4 and Phase 3 compatible-burned-audio.mp4 fixtures. Outputs/screenshots are written under project-backups and storage-tools. The full verification set has eight browser scripts: browser, phase2, scenes, speech, caption-delivery, export-settings, project-backups and storage-tools.

## Remaining work

Phase 4 is next: ordered multi-range sequences, removing sections, clip extraction, aspect-ratio variants/static reframing and essential audio adjustments. Extend portable versioning with those real editing decisions and verify joins, timing and output parity before exposing controls.

Manual gaps remain Firefox/Safari, touch/screen-reader flows, other-script font fallback, real phone rotation metadata, large/high-resolution recordings and resource profiling. Word emphasis remains deferred until reliable editable word timing exists. Browser retention and quota policies vary; portable files remain the recovery path.
