import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const s3 = new S3Client({});
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET as string;

const ALLOWED_CONTENT_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
]);

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { fileName, contentType } = body as { fileName?: string; contentType?: string };

    if (!fileName || !contentType) {
      return jsonResponse(400, { message: "fileName and contentType are required" });
    }
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      return jsonResponse(415, { message: `Unsupported content type: ${contentType}` });
    }

    const jobId = randomUUID();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-128);
    const key = `${jobId}/source/${safeName}`;

    const command = new PutObjectCommand({
      Bucket: UPLOADS_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

    return jsonResponse(200, { jobId, key, uploadUrl, bucket: UPLOADS_BUCKET });
  } catch (err) {
    console.error("presign-upload failed", err);
    return jsonResponse(500, { message: "Failed to create upload URL" });
  }
};
