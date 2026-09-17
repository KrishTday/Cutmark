import { TranscribeClient, StartTranscriptionJobCommand, MediaFormat } from "@aws-sdk/client-transcribe";

const transcribe = new TranscribeClient({});
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET as string;
const TRANSCRIBE_OUTPUT_BUCKET = process.env.TRANSCRIBE_OUTPUT_BUCKET as string;

interface StateInput {
  jobId: string;
  sourceKey: string;
  trimStart: number;
  trimEnd: number;
}

const EXTENSION_TO_FORMAT: Record<string, MediaFormat> = {
  mp4: MediaFormat.MP4,
  mov: MediaFormat.MP4, // Transcribe treats quicktime containers as mp4-compatible
  webm: MediaFormat.WEBM,
  mkv: MediaFormat.MP4,
};

export const handler = async (event: StateInput) => {
  const { jobId, sourceKey } = event;
  const extension = sourceKey.split(".").pop()?.toLowerCase() ?? "mp4";
  const mediaFormat = EXTENSION_TO_FORMAT[extension] ?? MediaFormat.MP4;

  // Transcription job names must be unique per account/region; the jobId
  // (a UUID) already guarantees that.
  const transcriptionJobName = `splice-${jobId}`;

  await transcribe.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: transcriptionJobName,
      IdentifyLanguage: true,
      MediaFormat: mediaFormat,
      Media: { MediaFileUri: `s3://${UPLOADS_BUCKET}/${sourceKey}` },
      OutputBucketName: TRANSCRIBE_OUTPUT_BUCKET,
      OutputKey: `${jobId}/transcript.json`,
      // We build WebVTT ourselves from the word-level timestamps in the
      // transcript JSON (transcription-complete lambda) rather than relying
      // on Transcribe's built-in Subtitles output, whose file-naming
      // behavior differs depending on whether OutputKey is a prefix or a
      // full object key - deterministic JSON parsing avoids that ambiguity.
    })
  );

  return { transcriptionJobName, status: "IN_PROGRESS" };
};
