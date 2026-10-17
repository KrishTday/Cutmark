# Homepage redesign

Implemented locally on 14 October 2026. This task does not commit, push or deploy the redesign.

## User journeys

First-time visitors see a concise editing promise, a real choose/drop import control, visible backup recovery, and a labelled static example showing a 24-second source becoming an 18-second edit. Returning visitors see the latest edited project near the top, plus immediate new-project and backup actions. Homepage content unmounts when the working editor opens.

Project cards show titles, distinct source filenames, last-edit dates, correctly labelled current edited/source/saved duration, and draft/current/stale/unknown export status. Dates fall back to creation time and reject values outside the Date range. An asset pointer alone is not treated as proof of a successful export. The latest project is selected by actual edit time, with a legacy fallback.

Search appears for five or more projects and remains available while its query is active after deletion. Search covers the latest project too; repeated visual results use distinct control IDs. Delete labels and confirmation identify the project title, and cancellation returns focus to the trigger. A completed deletion returns focus to a usable homepage action. Opening has a visible cancellable state; late completion cannot replace a cancelled session.

Explicit loading, empty, unavailable and populated states prevent an empty-project claim while storage is loading. Failed history loading has retry and does not disable new footage. The original verified backup/relinking flow is reused.

## Performance and design decisions

Homepage listing reads project summaries, not source/export/image blobs. Existing records do not have small persisted preview thumbnails, so cards use a consistent film icon. No video decoding, processing workers, model initialization, new media cache or database migration was added to display the homepage. Browser tests instrument asset reads and workers to verify this.

The product demonstration is a lightweight HTML/CSS illustration, labelled as an example, with an equivalent text explanation. It uses no private footage, stock media or autoplay. There is no simulated sample-import button or automatic transcription.

The charcoal/lavender identity is retained. Import, recovery and project controls have explicit focus states and practical touch sizing. The skip link bypasses the header, and source validation moves focus to the working editor. Returning home restores focus to a primary action.

Local-saving guidance explains browser eviction, independent backups and lack of automatic cross-device synchronization. Model/app downloads are disclosed; the page makes no network-free or unlimited compatibility claim.

## Verification

- 53 unit tests passed, including new recency, export-state and current-duration cases.
- Lint passed.
- Production build passed, including TypeScript and static generation.
- All 15 production-browser suites passed during the homepage work: homepage, browser, phase2, scenes, speech, caption-delivery, export-settings, project-backups, storage-tools, sequences, assembly, framing, finishing, images and join-precision.
- After final metadata/focus refinements, unit/lint/build and the directly affected homepage, editing-safety and backup suites passed again.
- Git whitespace check passed.

The homepage suite exercises first/returning visits, metadata-only listing, six seeded current/stale/draft/legacy/Unicode records, search surviving deletion, confirmation/focus, missing media, delayed opening cancellation, preserved caption corrections, verified backup cancellation/restoration, failed/slow storage, retry, import without storage, keyboard picker activation, invalid/cancelled file selection, actual drag/drop, corrupt-container retry, mobile/tablet layout, reduced motion and 200% zoom. No uncaught browser errors were observed.

Desktop and mobile screenshots were captured and visually reviewed. Production-browser tests use the available Windows Edge runtime, including emulated touch/viewport conditions. Actual touch hardware, screen readers, Firefox and Safari remain manual coverage. Native operating-system file-dialog cancellation was represented by a chooser left unsubmitted and an empty selection; no claim of OS-dialog automation is made.

The existing fourteen media suites continue to verify actual encoded frames, audio, caption/layer pixels, saved decisions, quota rollback and recovery. Static output was not rebuilt during active browser runs.

## Reproduce

Build frontend with npm run build, serve frontend/out, and use the existing CUTMARK_TEST_URL, CUTMARK_PLAYWRIGHT_PATH and CUTMARK_ARTIFACTS test environment. Run node frontend/tests/homepage.mjs from the repository root. The fixture is generated locally with FFmpeg; screenshots are written below the artifacts folder's homepage directory.

The speech regression additionally requires CUTMARK_SPEECH_FIXTURE. See the dated phase verification record for the original media-suite setup.

## Visual refinement

The homepage now uses square panels, border-separated project rows, unboxed status labels and plain icons. Rounded corners are limited to small control radii and the existing brand mark. The import area is centered; decorative panel gradients and floating project cards were removed. The green “On your device” badge remains removed. Lint, TypeScript/production build and the complete homepage browser suite passed after this refinement; desktop and mobile screenshots were reviewed.
Returning-user layout follows the requested order on every viewport: new-project import first, then the full-width Continue editing section below it. The first-visit illustration layout is unchanged.
