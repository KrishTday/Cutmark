import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TRANSCRIBE_OUTPUT_BUCKET = process.env.TRANSCRIBE_OUTPUT_BUCKET as string;
const OUTPUTS_BUCKET = process.env.OUTPUTS_BUCKET as string;
const JOBS_TABLE = process.env.JOBS_TABLE as string;

interface TranscribeItem {
  start_time?: string;
  end_time?: string;
  type: "pronunciation" | "punctuation";
  alternatives: { content: string; confidence?: string }[];
}

interface StateInput {
  jobId: string;
  trimStart: number;
  trimEnd: number;
}

const MAX_WORDS_PER_CUE = 12;
const MAX_CUE_SECONDS = 6;
const SENTENCE_ENDERS = new Set([".", "!", "?"]);

function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number, len = 2) => n.toString().padStart(len, "0");
  const secWhole = Math.floor(seconds);
  const ms = Math.round((seconds - secWhole) * 1000);
  return `${pad(hours)}:${pad(minutes)}:${pad(secWhole)}.${pad(ms, 3)}`;
}

function itemsToVtt(items: TranscribeItem[], trimStart: number, trimEnd: number): string {
  // Transcribe runs on the full source audio, but the output video is only
  // [trimStart, trimEnd]. Keep pronunciation items that fall inside that
  // window (plus any punctuation immediately following a kept word), and
  // shift every timestamp back by trimStart so captions line up with the
  // trimmed clip instead of the original file.
  const windowed: TranscribeItem[] = [];
  let lastWordInWindow = false;

  for (const item of items) {
    if (item.type === "pronunciation") {
      const start = parseFloat(item.start_time ?? "0");
      lastWordInWindow = start >= trimStart && start < trimEnd;
      if (lastWordInWindow) {
        windowed.push({
          ...item,
          start_time: String(Math.max(0, start - trimStart)),
          end_time: String(Math.max(0, parseFloat(item.end_time ?? String(start)) - trimStart)),
        });
      }
    } else if (lastWordInWindow) {
      windowed.push(item);
    }
  }

  const cues: { start: number; end: number; text: string }[] = [];

  let words: string[] = [];
  let cueStart: number | null = null;
  let cueEnd = 0;

  const flush = () => {
    if (words.length === 0 || cueStart === null) return;
    cues.push({ start: cueStart, end: cueEnd, text: words.join(" ").replace(/ ([,.!?])/g, "$1") });
    words = [];
    cueStart = null;
  };

  for (const item of windowed) {
    const content = item.alternatives[0]?.content ?? "";
    if (!content) continue;

    if (item.type === "punctuation") {
      words.push(content);
      if (SENTENCE_ENDERS.has(content)) flush();
      continue;
    }

    const start = parseFloat(item.start_time ?? "0");
    const end = parseFloat(item.end_time ?? String(start));

    if (cueStart === null) cueStart = start;
    words.push(content);
    cueEnd = end;

    if (words.length >= MAX_WORDS_PER_CUE || end - (cueStart ?? end) >= MAX_CUE_SECONDS) {
      flush();
    }
  }
  flush();

  const body = cues
    .map((cue, i) => `${i + 1}\n${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}\n${cue.text}`)
    .join("\n\n");

  return `WEBVTT\n\n${body}\n`;
}

export const handler = async (event: StateInput) => {
  const { jobId, trimStart, trimEnd } = event;
  const transcriptKey = `${jobId}/transcript.json`;

  const raw = await s3.send(new GetObjectCommand({ Bucket: TRANSCRIBE_OUTPUT_BUCKET, Key: transcriptKey }));
  const text = await raw.Body?.transformToString();
  if (!text) throw new Error(`Empty transcript for job ${jobId}`);

  const parsed = JSON.parse(text);
  const items: TranscribeItem[] = parsed.results?.items ?? [];
  const vtt = itemsToVtt(items, trimStart, trimEnd);

  const captionsKey = `${jobId}/captions.vtt`;
  await s3.send(
    new PutObjectCommand({
      Bucket: OUTPUTS_BUCKET,
      Key: captionsKey,
      Body: vtt,
      ContentType: "text/vtt",
    })
  );

  await ddb.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { jobId },
      UpdateExpression: "SET captionsKey = :c, updatedAt = :u",
      ExpressionAttributeValues: { ":c": captionsKey, ":u": new Date().toISOString() },
    })
  );

  return { captionsKey };
};
