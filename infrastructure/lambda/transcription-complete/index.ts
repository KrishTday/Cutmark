import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { itemsToVtt, TranscribeItem } from "./webvtt";

const s3 = new S3Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const TRANSCRIBE_OUTPUT_BUCKET = process.env.TRANSCRIBE_OUTPUT_BUCKET as string;
const OUTPUTS_BUCKET = process.env.OUTPUTS_BUCKET as string;
const JOBS_TABLE = process.env.JOBS_TABLE as string;

interface StateInput {
  jobId: string;
  trimStart: number;
  trimEnd: number;
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
