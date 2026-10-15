# Editing workspace simplification

The default editor now emphasizes the source preview, trim timeline, optional captions and a visible export action. This work remains local and uncommitted.

## Changes

- Export and the current-file downloads are in the project header, rather than beneath the editing panels. The active project's filename is the page heading.
- Basic transport shows play/pause, frame stepping and selection review. Rate, listening volume, loop, boundary jumps, cut-context review and display controls are behind Playback options.
- More editing tools groups the separate image/title, assembly, audio analysis, named clip, framing, sequence, scene and marker panels. The listening meter is in this group. Each feature keeps its own existing disclosure and underlying behavior.
- Empty captions show a short explanation and Add caption, without an empty search, selection toolbar or guidance form. Cue operations appear when cues are selected.
- Caption wording appears before transcription, style and import setup. The speech-model download/cache explanation is a disclosure. Generating captions remains a separate explicit action.
- The source stage is near-black, the timeline uses a distinct blue-gray working surface, and the caption inspector has a lighter slate surface. Caption text fields use a light background with dark text. Lavender identifies export and retained timeline selections; muted controls remain secondary. Focus, errors and warnings keep their own semantic treatment.
- The workspace uses square panel boundaries and small control radii, preserving the earlier homepage direction. The source preview is height-bounded to keep trimming closer to the video; fullscreen remains available in playback options.

Media rendering, range/caption timing, correction wording, undo state, output settings and asset storage formats were not rewritten for the presentation change.

## Verification

53 unit tests, lint, TypeScript and the production build passed. All sixteen production-browser suites passed during this work: workspace, homepage, browser, phase2, scenes, speech, caption-delivery, export-settings, project-backups, storage-tools, sequences, assembly, framing, finishing, images and join-precision.

Existing regression flows explicitly open the new disclosures through shared test helpers. They continue to check actual exported frames/audio/caption pixels and recovery safety. The new workspace suite checks default hidden advanced controls, header export visibility, opening and closing tools, preserved range/caption edits, mobile navigation, 200% zoom and reopening.

The final caption-panel ordering was followed by focused workspace, timeline/caption and transcription regressions. Desktop/mobile screenshots were captured and reviewed. Production files were not rebuilt during active browser runs.

Tests use Windows Edge and emulated viewport conditions. Actual touch hardware, screen readers and Safari/Firefox still need manual coverage. This change does not claim universal usability or codec compatibility.

Run the workspace suite with the existing CUTMARK_TEST_URL, CUTMARK_PLAYWRIGHT_PATH and CUTMARK_ARTIFACTS environment, using node frontend/tests/workspace.mjs from the repository root. It reuses the generated boundary.mp4 fixture. Captures go to the artifacts folder's workspace directory.

Visual review also found overlapping timeline timestamps on narrow screens. The ruler now uses three labels when its actual container is narrow, preserving exact full timecodes while removing overlap. The workspace suite explicitly checks their bounds on mobile.