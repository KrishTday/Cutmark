# Phase 5 — Advanced workflow

The selected Phase 5 workflows are implemented: a small multi-source media bin, reviewable transcript and pause edits, sequential clip exports, reusable output/naming presets, and local handoff artifacts. This phase does not assert that every optional P3 idea in the 100-item product backlog has shipped.

| Backlog | Implemented workflow | Relevant verification |
| --- | --- | --- |
| 96 | Up to four original local sources; ordered source/range references; common output canvas; per-source caption import/correction; exact mixed-rate joins; source relinking and portable all-source recovery. | Mixed portrait/landscape 24/30 fps, no-audio input becoming silence, source captions mapped after joins, reload, missing-media recovery, fresh-profile lightweight and bundled restore/export. |
| 97 | Selected source cues propose keeping a passage or removing its interior. Configurable speech padding, review playback, explicit apply/discard and whole-sequence undo. | Actual keep/remove proposals and preserved corrected wording; interval subtraction and mapping tests. |
| 98 | Measured pause candidates and decoded sample-peak/clipping feedback. No automatic filler-word or deliberate-language removal. | Tone/silence/tone analysis and padded removals; cancellation and immutable source decisions. |
| 99 | Sequential immutable-revision primary-source clip jobs; per-job progress and cancellation; later jobs proceed after failure; previous downloads retained. Local validated presets capture caption style/delivery/guidance, framing, audio, export quality and MP4 prefix/suffix rules. | Actual multi-file outputs, failed/cancelled job safety, preset application/undo, saved naming rules and immutable previous filenames. |
| 100 | Source/composed PNG captures and JSON edit report with actual timecoded ranges, source references, marker notes/occurrences, captions, layers, framing/audio and clip definitions. | Real downloads and content inspection. The report is a review artifact; portable project files are the editable handoff. |

## Source identity and corrections

Assembly ranges refer to stable source identifiers. Captions and markers stay in each source's timebase; output times are derived from range order. Repeated ranges repeat the relevant content. Cue intersections are clipped/split into output intervals without changing source wording.

Adding the primary selection links its captions, titles, images and markers to the current primary edit. Later primary corrections update the assembly atomically, including undo/redo. The user can explicitly turn off that link to freeze an independent version. Other imported sources have independent cue corrections. Older version-3 documents without the binding flag retain their stored independent decisions rather than silently overwriting text.

The primary timeline continues editing the primary source. Assembly range controls edit the assembled sequence. Main Export video/current subtitle files use the assembly only when its explicit export-mode checkbox is enabled. Named clip jobs remain primary-source deliverables and capture their own framing/output preferences; global captions/audio are captured when the queue starts.

Source review uses native caption appearance. Render assembly preview is the reference for composed appearance and final audio adjustments. The shared canvas derives its pixel limit from the primary source; different source dimensions are fitted/filled using the chosen framing. Assemblies encode stereo audio. No arbitrary-source HDR conversion, cloud processing or account is introduced.

## Storage and portable format

IndexedDB database version is 7; the existing editable metadata schema remains 2. Upgrades preserve the original projects/assets and legacy recent records. Older tabs cannot reopen the upgraded database to overwrite newer decisions. Open connections close on version changes; blocked upgrades and stale clients receive actionable messages while live data/downloads remain intact.

Project metadata contains small source/image references and decisions. Large blobs live in the assets store. Primary/additional video, images and outputs retain shared ownership across duplicated projects. Garbage collection uses every remaining project's references, including independent assembly image layers. Autosave checks asset keys without loading/writing unchanged blobs; unused asset collection compares asset identities, not caption wording. Metadata and new assets commit in one transaction; abort/quota failure preserves the prior valid record.

The lightweight UTF-8 JSON format is cutmark-project with version 1, 2 or 3. A source-inclusive bundle keeps the eight-byte CMARK001 magic, four-byte little-endian JSON length and JSON header, then:
1. The primary source bytes.
2. Each additional distinct video/image asset once, in the deterministic order returned by the manifest references.
Assets identical to the primary source are not appended again. References record byte length, dimensions/media metadata, original/saved-export provenance where applicable, and the existing sha256-chunks-4m-v1 content fingerprint. Image references carry kind=image and validated local raster MIME/dimensions. Source-inclusive packaging remains Blob-backed; it does not build a base64 or ZIP copy of all media.

Header metadata is bounded to 16 MiB, with validated intervals/IDs/styles, source relationships and supported features. Conflicting metadata for an identical fingerprint, missing/truncated bytes and unknown versions are rejected. Recovery checks the primary video and every additional video/image against content and metadata before saving a separate recovered project. Lightweight recovery can relink assets individually. Images are verified by actual file signature, dimensions and content digest.

Portable files exclude earlier rendered MP4s, session undo history, transient clip results, preview caches and models. A source-inclusive bundle must have every referenced asset; lightweight files can retain missing references for later relinking. Browser retention is not a backup.

## Verification and limits

The production verification set comprises 50 unit tests and fourteen browser scripts: browser, phase2, scenes, speech, caption-delivery, export-settings, project-backups, storage-tools, sequences, assembly, framing, finishing, images and join-precision. Build the static app once before starting the browser run; do not replace frontend/out while browser pages are loading hashed chunks. Record actual per-suite results in the run, rather than treating the presence of these scripts as proof.

Automatic/compatible encoding is verified on the available Windows Edge runtime. Exact joins are also checked over 100 off-grid VFR ranges. Caption/title/image layers share rendering logic; unchanged frames can keep their decoded color planes. RGB compositing involves normal SDR canvas/color conversion and chroma resampling, so encoded files are not pixel-lossless. Unverified HDR/wide-color re-encoding remains blocked.

Remaining manual coverage includes Safari/Firefox, real mobile orientation metadata, screen readers/touch hardware, multi-gigabyte/high-resolution assemblies and long-running heap/GPU profiling. Compatible preparation can require significant memory and time; there is no claim of unlimited input size. Queued clip result files are available for the current open project session; this is not a crash-resumable background queue or an automatic publishing service.

Conditional future extensions include word-level animation with trustworthy timings, more speech models/languages after benchmarking, transitions, moving crops/tracking, music/ducking, blur backgrounds, color grading, proxy generation, automated filler/black-frame analysis and professional interchange formats. The user-facing controls for these deferred extensions have not been added.

Final local run: **50 unit tests and all 14 browser suites passed**, with lint, TypeScript and production build successful. See the [dated verification record](verification-2026-10-14.md) for scope and limits.
