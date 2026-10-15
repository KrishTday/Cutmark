# Phase 3A — caption delivery

Historical phase checkpoint: the current implementation and verification inventory are tracked in [the complete checklist](backlog.md), [Phase 4](phase-4.md) and [Phase 5](phase-5.md). Portable versions 1–3 and database version 7 supersede the earlier format/storage versions described below.

Implemented locally on October 14, 2026. This completes the caption-delivery portion of Phase 3, not the entire deliverable-quality phase. [Export settings and presets are now implemented in Phase 3B](phase-3-export.md). [Portable project recovery and expanded storage management are now completed in Phase 3C](phase-3-recovery.md). No hosting or infrastructure changes are included.

## Editor-visible result

- Import SRT or VTT through a review step. Choose source timestamps or timestamps relative to the current selection, then append cues or replace all captions. Existing corrections remain until Apply; undo restores them.
- Choose subtitle files, burned-in MP4 captions, or both. Current-selection SRT and VTT downloads preserve words and clipped output-relative timing.
- Style captions with local Geist Sans/Mono fonts, regular/bold text, size/color, outline/shadow, a background plate, alignment, placement, and edge margin. Clean, social and high-contrast presets give useful starting points.
- The source preview and MP4 renderer share wrapping, sizing, line-height, positioning and transparent caption compositing. Text stays inside the safe area; long words wrap without dropping characters.
- Save/reopen and named undo preserve style, delivery and imported/edited words. Existing projects default to subtitle-file delivery. Successful exports retain their own style/delivery snapshot.
- Failed font loading, captions that cannot fit, cancellation and failed encoding leave the previous MP4 downloadable and the project editable.
- Native caption preview remains available through the video track. Fullscreen includes the styled canvas. Picture in picture uses the source/native caption track and explicitly explains that limitation.

## Checklist

“Verified” describes Windows Edge in the available environment.

| Backlog items | Implementation | Verification / limits |
| --- | --- | --- |
| 26: burned-in caption delivery | Implemented | Actual H.264 MP4 pixels, sidecar-only plain video, half-open cue boundaries, native encoding and compatible-source preparation with audio pass. Both delivery retains separate SRT/VTT downloads. |
| 27: style editor | Implemented | Local licensed fonts, bold, size, color, outline, shadow, plate/opacity, alignment, placement and margin controls feed the shared renderer. Presets, changes, undo and reopening pass. Latin fonts are bundled; other scripts use installed fallback fonts, so availability can vary by device. |
| 28: preview/render agreement | Implemented | Landscape sans/mono, bold/outline/shadow/top-right placement, portrait multiline/Unicode/long-word wrapping, safe areas and actual exported glyphs pass. Oversize text errors rather than silently shrinking or removing wording. Codec compression is not pixel-identical to the unencoded canvas. |
| 29: subtitle import/export | Implemented | SRT/VTT parsing, source/selection bases, append/replace, rejected out-of-bounds imports, malformed-block review, encoding rejection, fresh IDs and Unicode/entity/multiline round trips pass. UTF-8 and BOM-marked UTF-16 supported; 2 MB/5,000-cue limits. |
| 30: word emphasis | Deferred | No fabricated word timings; existing segment captions remain the supported workflow. |
| 62/64/65: export settings, engine intent, summary | Implemented in [Phase 3B](phase-3-export.md) | Caption mode is explicit and affects actual MP4 pixels. Compatible-source preparation still uses the shared styled renderer; an unavailable browser encoder causes an actionable failure, never a plain-video substitute. Resolution/quality/audio controls and measured metadata persistence are implemented in Phase 3B. Existing measured output metadata remains available. |
| 72–74: names, duplication, portable backup/relinking | Completed in [Phase 3C](phase-3-recovery.md) | Existing autosave/source/output separation remains; portable project files/bundles now provide recovery beyond browser storage. |
| 77/80: cache cleanup and durable storage | Completed in [Phase 3C](phase-3-recovery.md) | Existing usage/quota, individual saved-project deletion, source download and save retry remain. Targeted English-model cleanup and explained persistent-storage requests now work. |

## Rendering and timing contract

Editable cues remain in source seconds. Import with selection-relative timestamps adds the selection start once; it does not change stored cues when a trim later changes. Burn-in and selected sidecars consume the same clipped output-relative cues. Cue intervals remain start-inclusive/end-exclusive.

Fonts load explicitly in the page and worker before drawing. Both renderers use the same caption layout and a transparent caption layer at actual video dimensions. Decoded frame timestamps drive the source overlay, and the conversion worker receives output-relative sample timestamps. Multiple active cues are combined in source order.

Burn-in forces actual video encoding even for an unchanged full-source MP4. If the source cannot decode/encode directly, FFmpeg locally prepares H.264/AAC for the selected interval, then the shared browser caption renderer composes the text. This path needs a supported browser H.264 encoder; it does not claim that FFmpeg alone can render the selected font/layout. HDR/wide-color re-encoding remains guarded.

VTT positioning, regions, inline formatting, speaker tags and word timestamps are not retained as styling metadata. The review step reports these conversions. Unreadable blocks require an explicit acknowledgement before valid cues can be applied; invalid source/selection bounds block applying without clamping. Plain text escapes markup characters on delivery and decodes them on import.

## Verification

- 27 unit regressions pass, including import encodings, strict timestamp suffixes, Unicode/markup round trips, long words, emoji clusters, safe-area layout, overflow and revision snapshots.
- Lint, TypeScript and the production static build pass. The existing multiple-lockfile workspace-root warning remains.
- The caption-delivery Edge suite passes actual native and compatible MP4 rendering, preserved audio, sidecar-only pixels, cue boundaries, import append/replace/review/undo, out-of-source and invalid-encoding rejection, style persistence, native accessibility track mode, cancelled/failed font jobs, retry, overflow retention, portrait dimensions and mobile layout without uncaught browser errors.
- Glyph comparisons use exact-position white-ink F1 for 320×180 and 360×640 footage (thresholds 0.8/0.75/0.85 for the corresponding fixtures). The deliberately tiny 90×160 fixture has seven-pixel text: a separately declared one-pixel codec tolerance must exceed 0.95 bidirectional ink agreement. Direct main/worker unencoded glyph pixels were identical; strict compressed threshold masks alone were misleading at that size.
- The earlier export-safety, timeline/transcript, scene/marker and real-speech browser suites passed during this implementation session. Cached recognition still works with model downloads blocked, and undo restores a manually corrected name.

Run npm test, npm run lint and npm run build from frontend. Serve frontend/out; run tests/caption-delivery.mjs with CUTMARK_TEST_URL, CUTMARK_PLAYWRIGHT_PATH and CUTMARK_ARTIFACTS set to the existing Phase 1 fixture folder. The suite creates caption-delivery artifacts there and needs FFmpeg/ffprobe and Edge.

## Remaining verification and next work

1. Export resolution/quality policies and presets are implemented and verified in [Phase 3B](phase-3-export.md).
2. Portable backups, identity-checked relinking, names/duplication and storage management are completed in [Phase 3C](phase-3-recovery.md); Phase 4 sequence/repurposing work is next.
3. Check screen readers, native caption track behavior/fullscreen/PiP, touch devices, orientation metadata and high-resolution performance in real recordings. Firefox/Safari and devices with different fallback-script fonts remain unverified.
4. Add word emphasis only when reliable editable word timings are available. Keep multi-range joins, reframing/audio/effects and advanced queues in their later phases.
