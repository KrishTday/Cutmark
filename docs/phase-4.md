# Phase 4 — Repurposing and richer edits

The Phase 4 core flows are implemented: keep/reorder/remove sections, extract named clips, prepare common aspect ratios, reposition and orient footage, adjust exported audio, and finish with timed titles and local transparent images. The simple one-range editor remains the default. Advanced panels are collapsed until needed.

## Implementation and verification

| Backlog | Current behavior | Verification |
| --- | --- | --- |
| 41–42 | Up to 100 ordered ranges from one source; select a range for timeline editing, split at the source playhead, remove/reorder ranges. Ripple behavior always closes gaps. One committed drag is one undo action. | Actual reordered exports, split/clipped captions, first/last frames, undo/reopen and portable recovery. |
| 43 | Up to 20 named primary-source clips with independent ranges and captured framing/resolution/quality/audio/naming preferences; decoded thumbnails and sequential export jobs. | Separate playable files, per-job progress, cancellation/failure preserving earlier clip downloads, later jobs continuing. |
| 44–45 | Explicit source/range identities, repeated occurrences and source-to-output mapping. Hard cuts are the implemented join. | A 100-range off-grid VFR sequence produces exactly 40 seconds and 300 intended frame intervals; join timestamps and first/last pixels are checked in native and compatible paths. |
| 46–49 | Original, 16:9, 9:16, 1:1, 4:5 and bounded custom ratios; fit/fill, solid background, scale, drag/keyboard/numeric positioning, reset, adjustable preview-only safe guides. | Real crop/rotation/flip pixels through both renderers; one-action drag undo; guides absent from MP4; mobile overflow checks. |
| 51–53 | Listening volume is separate from exported gain. Export gain −24 to +12 dB, mute while retaining the track, optional track omission, and sequence-wide fades. Opt-in live primary-source sample meter and decoded peak/clipping guidance. | Measured −6 dB output change, fades at the sequence ends, audio at joins, live meter activity. No true-peak or LUFS claim. |
| 54 | Measured primary-source peak-bin pause suggestions with threshold, minimum pause and speech padding. Review/select before applying; undo restores the whole sequence. | Actual tone/silence/tone decoding, padded intervals and reversible removal. |
| 56–58 | Timed editable titles/lower thirds, local transparent PNG/JPEG/WebP overlays, rotation and flips. Images are separate stored assets. | Real title timing and pixels, transparency, title/logo/caption layering, source/composed capture, saved decisions and image relinking/bundled recovery. |
| 60 | Decoded source frame or composed frame PNG; filenames include the actual source-frame timestamp. | Downloaded PNGs and recorded dimensions; captures exclude guides. |

## Timing and rendering contract

Ranges are continuous half-open time intervals [start, end). A video frame already active at the in point is retained with its interval shortened; the final included frame is shortened at the out point. Output offsets are the sum of requested range lengths, not guesses based on nominal FPS or encoded segment sizes. This matters for VFR and cuts between source timestamps.

The ordered renderer runs in a worker and encodes explicit presentation timestamps/durations. It keeps decoded color planes for plain same-source cuts. Framing and overlays use the same geometry/layout as the source preview. Images, then titles, then captions are drawn above framed footage. Each layer is evaluated at the output frame timestamp.

Joined audio is written to one continuous 48 kHz stereo timeline. Mono is copied to left/right at its listening level; stereo is retained. Native resampling uses bounded linear interpolation when sample rates differ. Unsupported/multichannel inputs can use compatible preparation. Gain and linear fades use the assembled output clock; they do not restart at each cut. Missing source audio becomes actual silence when the assembly needs an audio track. AAC encoder padding can affect the final container endpoint slightly; it does not accumulate at joins.

Automatic rendering first tries supported browser decoding/encoding. Compatible preparation transcodes original sources locally, preserves VFR timestamps, then uses the same exact range renderer. Whole-source preparation can be more expensive than a simple trim. Accurate joined output and composed layers require a supported browser video encoder; the app reports that limitation instead of silently falling back to approximate joins or dropping effects. Ordinary unchanged MP4 reuse and the basic FFmpeg path remain available where applicable.

Canvas dimensions derive from the primary source and selected resolution limit. A different aspect ratio changes that canvas; fill/zoom can enlarge and crop footage. Reframing preserves image proportions apart from even-pixel output rounding. Guides are adjustable approximations, not platform-certified placement templates.

The main player is a source editing view. Render sequence/adjusted preview produces the actual composed output using current export settings, including gain/fades. Native caption accessibility mode shows the unframed source; it is labelled separately. Picture-in-picture also shows the source. Other preview players pause when a new player starts.

## Persistence, cancellation and resource limits

Ranges, styles, framing, gain/fades, named clips, titles and image references are editing decisions. Their changes participate in named undo/redo and autosave. Previous successful main and clip files remain available until validated replacements succeed. Clip result URLs are session resources; clip definitions survive reload, but those individual result files must be downloaded before leaving the project.

Portable version 1 single-range files remain supported. Version 2 adds sequence/framing/audio/title/clip/naming decisions. Version 3 includes multi-source assemblies and external image references. See [Phase 5](phase-5.md) for the complete version-3 bundle contract.

Each image is limited to 2 MiB, 4096 pixels per edge and 8 megapixels; composed requests are limited to 16 megapixels of distinct decoded images. Up to five image layers and ten titles are allowed in the primary edit. Image signatures and dimensions are checked; SVG and remote image URLs are not accepted. Decoded bitmaps, frames, workers and temporary files are released on completion/replacement/cancellation. Backups package Blob assets rather than base64 media.

## Conditional extensions still deferred

These controls are not presented as working features: dissolves/crossfades, blurred backgrounds, animated crop/keyframes/tracking, imported music/ducking and color grading/white balance. They remain conditional backlog extensions requiring independent preview/render/performance verification. The completed Phase 4 scope is the practical hard-cut, static-framing, essential-audio and restrained finishing workflow above.

Run frontend/tests/sequences.mjs, framing.mjs, finishing.mjs, images.mjs and join-precision.mjs against a completed static build. The suites require Edge, Playwright, FFmpeg/ffprobe and the shared fixture folder. Native-frame capture, rotation metadata from real phones, long/high-resolution multi-source recordings, real touch/screen-reader sessions and Firefox/Safari remain manual coverage gaps.

Final local run: **50 unit tests and all 14 browser suites passed**, with lint, TypeScript and production build successful. See the [dated verification record](verification-2026-10-14.md) for scope and limits.
