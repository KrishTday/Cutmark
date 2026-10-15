# Final local verification — 14 October 2026

The completed static production build was served on Windows at http://127.0.0.1:4174 and tested with headless Microsoft Edge. Production files remained unchanged throughout the final browser run.

## Results

- Unit tests: **50 passed, 0 failed**.
- ESLint: passed.
- Production build: passed, including TypeScript and static page generation.
- Git whitespace/error check: passed.
- Production browser suites: **14 passed**.

| Suite | Verified behavior |
| --- | --- |
| browser | Draft/export separation, corrections, undo, cancellation, quota rollback, legacy recovery, corrupt-output rejection, fractional/VFR/portrait/one-frame/hour timing, silence and HDR guard. |
| phase2 | Decoded thumbnails/waveform, zoom/scrubbing/snapping, transport, caption operations/review, persistence and mobile/reduced-motion layout. |
| scenes | Source cuts, refinement, coverage, reviewed/manual decisions, cancellation/failure/retry and long transcript follow. |
| speech | Actual English-model download and recognition, source timestamps, network-blocked cached retry, undo restoring corrections. |
| caption-delivery | Reviewed SRT/VTT imports, Unicode, rendered caption timing/layout, fonts/failure recovery, native accessibility view and portrait delivery. |
| export-settings | Actual quality/file-size changes, source/detail preservation, resolution/audio intent, caption pixels, settings undo/reopen. |
| project-backups | Names, duplication/shared media, old-format migration, lightweight/bundled recovery, exact-content relinking, quota/cancel safety. |
| storage-tools | Targeted model cleanup, unrelated-cache/media preservation, cancellation and requested retention outcomes. |
| sequences | Real reordered picture/audio, split captions, framing/gain/fades, clip queue, individual failure/cancel retaining downloads, presets, captures/report. |
| assembly | Mixed dimensions/rates, missing audio, primary corrections following into assembly, all-source relinking/bundle restore and mobile layout. |
| framing | Crop/rotation/flip pixels in both processing paths, pointer undo, strict decimal entry, guides excluded from export and output naming. |
| finishing | Timed title pixels, preview/export agreement, live sample meter, reviewed transcript edits, measured padded pause removal and undo. |
| images | Transparent image/title/caption composition through both paths, saved external assets, wrong-image rejection, exact relinking and bundled recovery/export. |
| join-precision | 100 off-grid VFR ranges: exactly 40 seconds, 300 retained frame intervals, correct boundary frames and no cumulative timestamp drift. Known audio pulses stay aligned after 44.1-to-48 kHz conversion through the last join, in both processing paths. |

The final regression run updated two test expectations to match the completed UI: commit numeric guidance on blur, and expect verification of all source contents during recovery. Both affected suites were rerun successfully. No production changes were required by these two failures.

## Scope and limits

All five recommended phases have their core flows implemented. [The backlog checklist](backlog.md) identifies conditional extensions that remain deferred. This record does not claim every one of the 100 backlog items or every device/codec is complete.

Safari/Firefox, real touch devices/phone orientation metadata, screen readers, other-script font coverage, multi-gigabyte/high-resolution inputs and sustained resource profiling still need manual coverage. RGB-composited SDR video is not pixel-lossless; unverified HDR/wide-color encoding is blocked. Browser retention is not a backup, and clip output downloads are session-scoped.

The work is local; it has not been published to cutmark.dev.
