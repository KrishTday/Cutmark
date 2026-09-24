# Splice

A web-based video editor that trims clips, detects scene changes, and creates timed captions. I built Splice to explore how a lightweight editor can hand long-running media work to an asynchronous AWS pipeline.

## Technologies

- Next.js and React
- TypeScript and Tailwind CSS
- AWS Lambda, Step Functions, S3, DynamoDB, API Gateway, and CloudFront
- AWS Transcribe
- FFmpeg and Python
- AWS CDK

## Features

Here's what you can do with Splice:

- **Trim a video clip**: Set the in and out points with the editor timeline and preview the source video.
- **Upload directly to S3**: The browser uploads video using a presigned URL, so the file doesn't pass through the API server.
- **Detect scene changes**: FFmpeg's scene filter finds likely cuts in the processed clip and returns markers to the editor.
- **Generate captions**: AWS Transcribe produces word-level speech results that are converted into WebVTT captions.
- **Download the processed clip**: Retrieve the trimmed video and view its captions when processing finishes.
- **Process tasks asynchronously**: The browser can poll job status while Step Functions coordinates video processing and transcription.

## The Process

I built the editor as a static Next.js site, with the browser responsible for selecting the video and uploading it directly to S3. After the user chooses a trim range, the API records a job and starts a Step Functions workflow.

The workflow runs video processing and transcription as parallel branches. A containerized Lambda uses FFmpeg to trim the video and detect scene changes. AWS Transcribe analyzes the source audio, and another Lambda converts its word-level results into WebVTT. Because transcription runs on the full source, the caption step filters words to the selected trim range and shifts their timestamps so they line up with the trimmed clip.

When both branches finish, the workflow stores the combined results. The editor polls the job status and presents the processed video, captions, and detected scene markers.

## What I Learned

This project helped me understand how to coordinate work that takes longer than a normal web request. Step Functions lets video processing and transcription run independently, while the frontend can stay responsive and check for the final result.

I also learned how important it is to keep timestamps consistent across media steps. Transcribe returns times relative to the original video, while the output starts at the selected trim point, so captions need to be filtered and shifted before they can match the processed clip.

Building the infrastructure with CDK gave me practice defining the storage, API, functions, workflow, and hosting as code. I also learned to describe the scene detection accurately: it uses FFmpeg's deterministic frame-difference filter, while AWS Transcribe handles speech recognition.

## License

MIT. See [LICENSE](LICENSE).
