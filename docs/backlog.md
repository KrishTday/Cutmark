# Cutmark implementation checklist

The five recommended phases have working core user flows in the local build. This is a product backlog: completion of those phases does not mean every conditional/P3 extension or every device has been implemented or verified. The distinctions below are intentional; deferred controls are not exposed as working features.

## Phase status

| Phase | Delivered scope | Status |
| --- | --- | --- |
| 1 — Trust/revision safety | Independent drafts/artifacts, preserved wording, named undo, consistent timing, actual frame inspection, validation, cancellation, autosave/quota safety and legacy recovery | Implemented; regression coverage retained |
| 2 — Everyday usability | Real thumbnails/waveform, zoom/navigation, transport/shortcuts/context, transcription and transcript tools, scenes/notes, adaptive and keyboard-accessible workspace | Implemented; regression coverage retained |
| 3 — Deliverable quality | Shared caption burn-in/style, SRT/VTT import/export, real output settings/validation, names/duplicates/backups/relinking and scoped storage tools | Implemented; regression coverage retained |
| 4 — Repurposing/richer edits | Exact ordered ranges, split/remove, named clip extraction, static reframing/aspect versions, gain/mute/fades/meters, reviewed pauses, titles/logos and frame capture | Implemented; see [Phase 4](phase-4.md) |
| 5 — Advanced workflow | Small multi-source assembly, linked/independent source corrections, transcript proposals, clip queue/presets/naming and local review/handoff artifacts | Implemented selected P3 flows; see [Phase 5](phase-5.md) |

## Item coverage

| Items | Status and limits |
| --- | --- |
| 1–10 | Implemented: revision safety, timing, named/coalesced undo, previous downloads, strict boundaries and decoded frame navigation. |
| 11–20 | Implemented core timeline/transport/shortcuts/context/synchronization. J/K/L shuttle is conditional and not exposed. |
| 21–29 | Implemented transcription/editor operations/readability and caption/subtitle delivery. Native accessibility preview is an explicitly separate source view. |
| 30 | Deferred: animated word emphasis requires trustworthy editable word timings. Segment timestamps are not presented as word timing. |
| 31–32 | Implemented supported English/local-download/cache workflow. Additional languages/larger models await measured compatibility/performance; none are advertised. |
| 33–40 | Implemented repetition preservation, no-audio/silence/cancel/retry, recorded scene workflow, candidate correction and editorial notes. Scene scans remain reviewable estimates, not guaranteed editorial truth. |
| 41–44 | Implemented kept ranges, split/remove/reorder, named clips and explicit source/sequence mappings. Ripple closes gaps; no gap-retaining mode. |
| 45 | Hard cuts implemented. Optional dissolves/crossfades deferred. |
| 46–49 | Implemented ratios, fit/fill/solid background, drag/scale/keyboard/numeric placement/reset and non-exported adjustable guides. Blurred backgrounds deferred. |
| 50 | Deferred: crop keyframes and automatic tracking. Static reframing is complete. |
| 51–54 | Implemented listening/export distinction, gain/mute/fades, sample-meter/peak feedback and reviewable padded pause removal. No standards-compliant loudness/true-peak claim. |
| 55 | Deferred: optional local music and ducking. |
| 56–58 | Implemented timed titles/lower thirds, real transparent raster overlays, orientation/flip/reset/undo and asset recovery. |
| 59 | Deferred: grading/white balance pending separately verified color/performance behavior. Unverified HDR/wide-color re-encoding is blocked. |
| 60–65 | Implemented source/composed PNGs, output-oriented rendering, useful quality/resolution/audio/framing settings, presets and actual result metadata. Encoding intent is shared, not a promise of identical codec output bytes. |
| 66–70 | Implemented cancellation/stale guards/stage progress, relevant failure/retry messages and actual output checks. No invented ETA or success from a bare worker-complete message. |
| 71–80 | Implemented drafts, names/duplicates, portable references/bundles, exact-source relinking, versioned legacy recovery, explicit retention, shared assets, quota safety and requested durable storage. Browser retention remains a policy decision, not a backup guarantee. |
| 81–84 | Implemented media/capability checks, special-source guards and bounded native processing/resource cleanup. FFmpeg preparation and final in-memory MP4s still have real device limits. |
| 85 | Deferred conditional proxy/resource modes; no fake “light preview” switch. Rendered previews explicitly use export settings. |
| 86–95 | Implemented adaptive/progressive workspace, relevant guidance, keyboard/text alternatives, coarse-pointer sizing and reduced motion. Real screen-reader/touch-hardware and broader-device audits remain manual. |
| 96 | Implemented up to four sources, explicit IDs/joins, common framing, source captions and missing-video/image recovery. Verified representative mixed dimensions/rates; not a universal codec/device guarantee. |
| 97–98 | Implemented review-before-apply transcript passage edits and measured pause/peak suggestions. Automated filler/black-frame analysis remains optional future work. |
| 99 | Implemented sequential primary-source clip jobs, individual cancellation/failure recovery and local reusable style/output/naming presets. Not a crash-resumable background publishing queue. |
| 100 | Implemented local source/composed images and actual timecoded JSON edit/marker report. Professional interchange formats await target-app verification. |

## Verification record

The current test inventory is 50 unit tests and fourteen production-browser scripts. Tests inspect actual media frames, timestamps, dimensions, tracks, audio gain/fades, text/logo pixels, saved state, cancellations, quota rollback and recovery. The 100-range VFR case detects cumulative join drift rather than relying on approximate total duration alone.

Run npm test, npm run lint and npm run build in frontend. Serve the completed frontend/out directory, then run the browser scripts listed in Phase 5 using CUTMARK_TEST_URL, CUTMARK_PLAYWRIGHT_PATH and CUTMARK_ARTIFACTS. The speech suite also uses CUTMARK_SPEECH_FIXTURE. Do not rebuild the static directory while tests are loading hashed browser chunks.

Available target: Windows Edge. Firefox/Safari, actual phone rotation metadata/touch hardware, screen readers, other-script font fallback, multi-gigabyte/high-resolution sources and sustained heap/GPU profiling remain explicitly unverified. No universal compatibility, unlimited-file-size or error-free guarantee is made.

Final local run: **50 unit tests and all 14 browser suites passed**, with lint, TypeScript and production build successful. See the [dated verification record](verification-2026-10-14.md) for scope and limits.
