# Phase 1 — trust and revision safety

Historical phase checkpoint: the current implementation and verification inventory are tracked in [the complete checklist](backlog.md), [Phase 4](phase-4.md) and [Phase 5](phase-5.md). Portable versions 1–3 and database version 7 supersede the earlier format/storage versions described below.

Implemented locally on main, October 14, 2026. The active checkout was relocated to Desktop/School Notes/Self made Projects/splice; the older workspace path no longer exists. The unrelated pre-existing untracked binary_ninja_lockdownbrowser_dll_functions.md was preserved. No hosting or infrastructure changes are included.

## Editor-visible result

- Export keeps the source, selection, editable captions and scene cuts available for revisions.
- A prior successful MP4 stays downloadable during an export, cancellation, failure or storage error. Each artifact captures its own revision, range, subtitle snapshot and output settings.
- Drafts autosave before export. Source and output assets are separate from project metadata. Saving no longer evicts projects beyond five.
- Caption text is controlled and saved as edit decisions, including intentionally blank text. Exported subtitles are derived separately; trimming never rewrites source cues.
- Named undo/redo covers trim commits, caption typing/timing/add/remove, scene cut edits and analysis settings. Typing coalesces within 800 ms; a drag commits once. History is bounded to 100 actions and is session-local.
- Shared timecodes accept seconds, MM:SS and HH:MM:SS with decimal seconds; invalid fields explain the error without changing the project. Escape discards the draft.
- Frame inspection uses decoded presentation timestamps, including fractional and variable rates. Unsupported decoders fall back to a clearly labeled approximate step.
- Export, scene scans, model setup and transcription can be cancelled. Stale jobs cannot replace the current project or output.
- English transcription is an independent action. Regeneration requires an explicit replacement choice; old corrections remain until success and can be restored with undo.
- Storage failures retain live decisions and downloads. Retry saving, source download and targeted deletion of other saved projects are accessible without leaving the editor.
- HDR/wide-color metadata is detected. Unverified trimming/re-encoding is blocked; source download remains available.

## Checklist

“Verified” below describes the available Windows Edge test environment, not every browser/device.

| Backlog items | Implementation | Verification / limits |
| --- | --- | --- |
| 1–2: project/output separation and caption preservation | Implemented | Export, caption correction, trim, undo/redo, reload, regeneration/undo and repeated export passed. Blank edits and Unicode/multiline cues survive reopening. Existing caption style controls were absent; styling belongs to Phase 3. |
| 3: explicit timing | Implemented | Source cues/markers remain source-relative. Shared source/sequence conversion and cue clipping tested. Export boundaries tested with real decoded first/last frames. Multi-range joins are not exposed yet. |
| 4: undo/redo | Implemented for existing controls | Caption coalescing, trim drag commit, marker changes and keyboard undo verified. Crop/audio/range-list controls do not exist yet. Undo stacks are not persisted across reloads. |
| 5: revision-aware outputs | Implemented | Earlier output labeling, immutable subtitle/settings snapshots and retention through failure/cancellation passed. |
| 6–7: timecodes and boundaries | Implemented | Invalid/extra components, hours, rounding carry, finite bounds and short media passed. CFR selections require one measured source frame or the whole source if shorter. VFR uses representable timestamp precision instead of a fictitious fixed frame rate. |
| 8–9: frame stepping and out convention | Implemented | Decoded timestamp stepping/out inspection passed for fractional, VFR, portrait and hour-long fixtures. Approximate decoder fallback is explicitly labeled. |
| 10: snapping | Implemented | Threshold is ten rendered pixels mapped to source time. Shift bypasses snapping; text entry is independent. Code inspected; a dedicated automated snap-target test remains a verification gap. Timeline zoom is Phase 2. |
| 61: export wording | Implemented | Output name, selection duration, dimensions, audio and separate subtitle delivery are shown. Processing completion no longer implies a video exists after caption-only work. |
| 66–68: cancellation, stale jobs, progress | Implemented for existing long operations | Export/scan/transcription cancellation and retained edits passed. Encoding reports measured progress; setup/transcription/validation remain indeterminate with stage/elapsed time. No ETA is fabricated. Waveform creation does not exist yet. |
| 69–70: failure and valid output | Implemented | FFmpeg exit codes, empty output, tracks, dimensions, duration and browser decodability are checked. Corrupt worker completion is rejected; retry and prior file retention passed. Failure messages retain useful detail and recovery actions. |
| 71: autosave | Implemented | Draft before export, revisions, reload, real IndexedDB put quota failure and saving retry passed. Changes waiting to save, saving, saved and failed states are distinct. Browser storage remains best-effort. |
| 75: legacy records | Implemented | Transactional IndexedDB v1→v2 migration passed with seven legacy records. Source-relative conversion and export-only limitations are verified. Creation dates and retained media are preserved. |
| 76, 78–79: critical storage | Implemented | No automatic eviction; metadata-only listing; asset reads on reopen; unchanged media not rewritten per keystroke; atomic saving; quota safety; deletion of another project while keeping the active project passed. |
| 77: storage information/cleanup | Partially implemented | Site usage/quota estimate and per-project deletion are available. Per-asset categories and model/cache-only cleanup are deferred to Phase 3. |
| 81–84: critical compatibility/resources | Implemented foundations | Actual container/tracks/duration/dimensions are probed. Conversion verifies utilized tracks and falls back to FFmpeg. Decoded frames, input readers, workers, object URLs, scene listeners/timers and temporary files have cleanup paths. Detailed memory profiling remains unverified. |

No implementation item above is blocked. Verification on unavailable browsers/devices remains open.

## Timing and persistence contract

All timestamps use seconds. Source selections are start-inclusive and end-exclusive: [in, out). Source timestamps are never rewritten by a trim.

For a single range, output/sequence time is source time minus the in point. A cue intersects the range first; its intersected boundaries then map to output time. Subtitle delivery uses millisecond timestamps; intersections that collapse at that precision are omitted with a visible explanation, while the source cues remain saved. Cues entirely outside the selection are omitted from its subtitle deliverable, while the editable source cue remains untouched. An ordered-range mapping helper supports future joins, but the UI and renderer currently export one source range.

The out inspector retrieves the decoded frame immediately before the excluded boundary. Seeking/transport UI smoothness is not used as a substitute for decoded frame timestamps.

Edit decisions, playback position, source metadata and export artifacts are distinct. Every successful output retains its producing revision, range, caption snapshot and settings. Undo/redo always increments the current revision, so an older artifact remains identifiable even if decisions return to an earlier shape.

IndexedDB version 2 has metadata and asset stores. Migration transfers v1 records in one upgrade transaction before dropping the old store; an aborted upgrade rolls back. Legacy output-relative cues and markers are normalized only when original media is available. An export-only project uses that saved export as its editable source and explicitly states the original is unavailable.

Autosave is debounced by 600 ms, queued, and also attempted when the tab becomes hidden or the workspace exits. Switching to the project list awaits saving; a failed save keeps the editor open. A newer stored revision cannot be overwritten by an older queued save. This does not provide full conflict resolution for editing the same project concurrently in multiple tabs.

## Completed verification

- npm test: nine regression tests.
- npm run lint: passes without errors.
- npm run build: production static export and TypeScript checks pass. Next.js still reports the existing multiple-lockfile workspace-root warning.
- Edge production browser suite: real fixtures and exported files, not simulated captions or waveform data.
- Both native WebCodecs and single-thread FFmpeg were exercised. The native test explicitly blocked FFmpeg assets.
- Known color boundaries: exported first frame is green and last frame is blue, excluding the yellow frame at the out point.
- Fractional 30000/1001, actual VFR, portrait, single-frame and synthetic hour-long sources passed inspection and playable output checks.
- Silent audio, absent audio tracks, malformed timecodes, controlled caption typing, undo/redo, reload, cancellation, corruption, quota failure/retry and legacy migration passed.
- Desktop 1366×900 and mobile 390×844 layouts were captured; no horizontal overflow or uncaught browser errors were observed.
- Real English transcription was verified using a locally synthesized speech recording. The first model download produced the expected sentence before a video export. A fresh transcription worker reused cached model assets while Hugging Face network access was blocked; undo restored the corrected name.
- Model-download failure and cancellation keep the previous edited transcript.
- HDR verification uses a synthetic metadata-tagged fixture to check the guard, not a claim of HDR rendering support.

The worker build uses Next.js Webpack. Inspection and browser tests found that the default bundler emitted workers as raw TypeScript assets; those workers could not execute. Tailwind configuration also now resolves relative to its own file so launching from a different directory cannot silently remove the styles.

## Deferred work

The core Phase 2 editing workflows are now implemented; see [Phase 2](phase-2.md) for current verification and the remaining analysis, language and accessibility backlog. The table below records the original phase allocation.

| Phase | Remaining work |
| --- | --- |
| Phase 2: 11–20, 22–25, 31–40, 86–95 | Thumbnail/waveform generation, timeline zoom/navigation, scrubbing improvements, loop/speed/contextual review, richer shortcuts, cue highlighting/search/split/merge/group shift, readability warnings, accurate cache status/download-size UI, scene analysis records/refinement/sensitivity, named editorial markers, adaptive workspace and broader accessibility/touch work. Native playback, frame controls, focus-safe shortcuts, controlled captions and reduced motion already have foundations. |
| Phase 3: 26–30, 62–65, 72–74, 77, 80 | Actual caption burn-in and matching style/layout, subtitle import, export quality/presets, project rename/duplication, portable backups/relinking, detailed storage/cache cleanup and durable-storage requests. Current video exports deliver captions as sidecars only. |
| Phase 4: 41–60 | Multiple kept ranges, ripple/split edits, extraction/batch workflows, reframing/aspect ratios, audio adjustments and shared preview/render effects. |
| Phase 5: 96–100 and advanced timing | Multiple sources, transcript-driven edits, review suggestions, persistent queues/presets and handoff artifacts. Word emphasis remains deferred until reliable word timing exists. |

## Remaining verification and manual checklist

1. On Firefox, Safari and mobile browsers, import, trim, frame-step, export, cancel, retry and reopen a draft. Record actual codec limits and fallback behavior; do not infer support from API existence.
2. Check frame-snapping target feedback at different rendered widths and confirm Shift bypass and typed values.
3. Exercise an actual phone rotation-metadata file, a real long high-resolution recording, HDR/10-bit footage and memory pressure. Portrait geometry and hour timestamps were tested, but these are not substitutes for those characteristics.
4. Verify multi-thread FFmpeg under the deployed cross-origin-isolated hosting headers; the available tests used the compatible single-thread path.
5. Use a screen reader, touch input and increased text scaling for import, transport, trim fields, caption correction, dialogs and saving errors.
6. Profile repeated successful imports/exports/cancels/reopenings for retained resources. Cleanup paths and absence of uncaught errors were inspected/tested; no heap plateau claim is made.
7. Test real near-quota storage and upgrade interruption on browser/device implementations. A real IndexedDB put failure was injected; physically filling the browser quota was not performed.
8. Verify unusual codecs/containers, audio/video timestamp offsets, damaged files and full end-to-end playback on additional devices.
9. Before later phases ship, add SRT/VTT import round trips, preview/burn-in comparison, backup/relinking, actual multi-range joins and rendering parity tests. Those flows are currently deferred.

## Running the browser checks

Install or provide Playwright and Edge, and put FFmpeg/ffprobe on PATH. Serve frontend/out with a local static server, then run frontend/tests/browser.mjs with CUTMARK_TEST_URL pointing to it. CUTMARK_PLAYWRIGHT_PATH can point to an installed Playwright package; CUTMARK_ARTIFACTS selects the fixture/output/screenshot directory.

The optional tests/speech.mjs check additionally needs CUTMARK_SPEECH_FIXTURE pointing to a local English-speech MP4 and network access for the first public model download. The verification fixture was generated locally with Windows speech synthesis; no user media or transcript was uploaded.
