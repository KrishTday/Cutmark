# Splice

Splice is a browser-based video editor for trimming a clip, finding scene changes, and generating captions. Video and audio processing run locally on the user's device, so source media is not uploaded to an application server.

## Features

- Preview a video and choose its in and out points on a timeline.
- Detect likely scene changes and show them as timeline markers.
- Generate timed English captions from speech.
- Export a trimmed MP4 and WebVTT captions.
- Keep the selected video and processing results in the browser.

## How it works

The frontend is a statically exported Next.js application. FFmpeg WebAssembly handles media decoding, scene detection, and video encoding in the browser. Whisper Tiny, through Transformers.js, transcribes audio locally. The speech model downloads the first time it is needed and the browser can cache it for later use.

The AWS infrastructure in this repository hosts the static site using a private S3 bucket and CloudFront. It does not need a video processing backend, database, or managed transcription service.

## Built with

- Next.js, React, TypeScript, and Tailwind CSS
- FFmpeg WebAssembly
- Transformers.js and Whisper Tiny
- AWS CDK, Amazon S3, and CloudFront

## License

MIT. See [LICENSE](LICENSE).
