# Phase 3B — export settings and inspection

Historical phase checkpoint: the current implementation and verification inventory are tracked in [the complete checklist](backlog.md), [Phase 4](phase-4.md) and [Phase 5](phase-5.md). Portable versions 1–3 and database version 7 supersede the earlier format/storage versions described below.

Implemented locally on October 14, 2026. Caption delivery was completed in [Phase 3A](phase-3.md). This step implements actual export resolution/quality/audio settings, useful presets and persistent measured output inspection. [Portable recovery, names/duplication and cache management are now completed in Phase 3C](phase-3-recovery.md). No hosting changes are included.

## Editor-visible changes

- Export settings are disclosed within Export and storage details. Match source, Smaller file and High quality presets expose their resulting settings rather than hiding them.
- Choose source dimensions or an upper 1080p/720p/480p limit. Resolution is bounded by the longest edge for landscape or portrait; footage is never enlarged, reframed or cropped. Encoding-size rounding can introduce a slim letterbox border.
- Choose Smaller file, Balanced or High quality compression. Choose whether source audio is included. Preview volume still belongs to source review, while the output summary explicitly identifies absent audio.
- Frame timing remains source-based, including variable rates. Codec/resolution/framing controls that have no implemented renderer are not offered. Vertical reframing belongs to Phase 4. SRT/VTT downloads remain available without video encoding.
- Export captures the settings and project revision. Settings and presets are saved editing decisions with named undo/redo. Existing projects receive Match source defaults.
- Before encoding, the summary names dimensions, duration, source timing, audio and caption delivery. Afterwards, measured dimensions/tracks/codec/duration/file size appear alongside the captured quality intent. Measured metadata survives reopening; legacy files without stored measurements retain their recorded settings.
- The source remains available after export. Cancellation, failed validation and quota errors preserve the prior successful MP4.
- File selection is available after the client import handler is ready, preventing an initial source-selection race.

## Checklist

| Backlog items | Status | Verification / limits |
| --- | --- | --- |
| 62: export settings | Implemented for current single-range capabilities | Resolution, quality, audio inclusion and caption delivery affect actual MP4 output through both processors. Original/VFR timestamp behavior remains fixed rather than offering unverified frame-rate conversion. |
| 63: output presets | Implemented for supported delivery | Match source, Smaller file and High quality set inspectable controls. Caption-only SRT/VTT downloads already work without encoding. Vertical short/framing presets remain deferred until actual reframing is implemented. |
| 64: consistent engine intent | Implemented | Shared output dimensions, audio and quality policy feed native conversion and FFmpeg. Bitrate/quantizer and CRF express matching quality intent, not identical algorithms or file sizes. Compatible-source caption preparation uses high intermediate quality, followed by the requested final policy and the shared caption renderer. |
| 65: summary and output inspection | Implemented | Actual dimensions/tracks/duration/playability must match the request before success. Measured metadata, file size, codec and prior-version settings persist. No speculative size estimates are presented. |
| 72–74 and expanded 77/80 | Completed in [Phase 3C](phase-3-recovery.md) | Names/duplication, portable backup/relinking, targeted model cleanup and explained retention requests are implemented and verified. Existing autosave, source download, individual project deletion and quota recovery remain working. |

## Output contract

ExportPreferences are optional version-compatible edit decisions. The resolved OutputSpec contains the requested canvas size, audio presence and encoder policies. Lower-resolution dimensions preserve aspect ratio to even-pixel rounding; both paths contain the source within those dimensions. Source dimensions are retained exactly when no downscale is necessary.

A full-length MP4 with Match source, Balanced compression, unchanged audio and sidecar captions can reuse its original bytes. Trims, High quality/Smaller file, actual resizing, removal of an existing audio track or burned-in captions require encoding. Selecting a ceiling above a small source does not force enlargement.

Native conversion applies target dimensions before captions. Caption preview uses the same target-sized layout and canvas; the source preview remains the original footage. The caption renderer returns an explicitly timestamped RGBA VideoFrame. Testing found that canvas-backed VideoFrames could displace glyphs by one pixel at 854px width; supplying explicit pixels eliminates that displacement without compensating caption positions. Returned frames are closed by the conversion implementation; each worker is terminated on completion/cancellation. Pixel readback adds per-frame work, so large-media performance remains an explicit verification gap.

FFmpeg uses an aspect-preserving scale/pad when resizing, passes through original timestamps and applies the chosen H.264 CRF/AAC policy. For burned-in delivery, it prepares the selected source, then the shared browser renderer applies the final caption layout/quality; copied prepared audio avoids a second AAC encode. Omitted audio is never decoded unnecessarily by the native path and is absent from both exports.

Validation compares playable output metadata with the resolved request, not with unchanged source dimensions/audio. HDR/wide-color re-encoding guards include every setting that requires an encode; Match source on the unchanged full range remains the preservation path.

## Verification

Windows Edge is the available browser target.

- 29 unit regressions pass, including landscape/portrait resolution ceilings, no enlargement, intentional audio omission, reversible settings and immutable output snapshots.
- Lint, TypeScript and production static build pass. The existing multiple-lockfile workspace-root warning remains.
- The export-settings browser suite checks actual MP4s from native and compatible processors: High versus Smaller compression, original 24fps timing, audio retention, reduced-resolution audio omission, target-sized Unicode captions, presets/undo/reopen, measured metadata persistence, mobile overflow, and reduced portrait multiline captions.
- On the tagged BT.709 1280×720 fixture, native Smaller/High files measured approximately 0.55/1.37 MB and 38.94/53.10 dB PSNR against the same source frame. Compatible Smaller/High measured 0.79/1.48 MB and 39.79/50.28 dB. These are observations for this fixture, not promised compression ratios or a quality claim about every recording.
- Reduced landscape output is 854×480 with no audio track; reduced portrait output is 480×854. Caption comparisons use exact-position ink agreement, without accepting a coordinate shift.
- The existing export-safety suite passes: precise first/last boundaries, actual audio, retained source/corrections, cancellation, quota failure/retry, corruption/retry, migration, blank captions, fractional/VFR/portrait/single-frame/hour-long media, and guarded HDR.
- Caption-delivery regressions cover subtitle import, saved styles, font/overflow failure, cancel/retry, sidecar-only video, safe areas, native accessibility caption track, compatible captions/audio and tiny portrait frames.

Run npm test, npm run lint and npm run build from frontend. Serve frontend/out and run tests/export-settings.mjs using CUTMARK_TEST_URL, CUTMARK_PLAYWRIGHT_PATH and CUTMARK_ARTIFACTS as described in README. FFmpeg/ffprobe and Edge are required; artifacts are written under export-settings.

## Remaining work

1. Phase 3 is completed by [portable recovery/storage](phase-3-recovery.md). Continue to Phase 4 multi-range sequences and repurposing.
2. Check real high-resolution/long recordings, rotation metadata, low-powered devices and pixel-readback performance. Untagged source colors can be interpreted differently by decoders; the quantitative fixture uses explicit BT.709 metadata. Broader SDR color preservation remains a manual check.
3. Verify Firefox/Safari, screen readers, touch devices and fullscreen/PiP behavior. No universal codec or browser support claim is made.
4. Keep crop/reframing, multi-range joins, richer audio controls and vertical-format presets in Phase 4.
