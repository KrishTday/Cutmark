import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const JOBS_TABLE = process.env.JOBS_TABLE as string;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN as string;

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const jobId = event.pathParameters?.jobId;
  if (!jobId) {
    return jsonResponse(400, { message: "jobId is required" });
  }

  const { Item } = await ddb.send(new GetCommand({ TableName: JOBS_TABLE, Key: { jobId } }));

  if (!Item) {
    return jsonResponse(404, { message: "Job not found" });
  }

  const toUrl = (key?: string) => (key ? `https://${CLOUDFRONT_DOMAIN}/${key}` : undefined);

  return jsonResponse(200, {
    jobId: Item.jobId,
    status: Item.status,
    createdAt: Item.createdAt,
    updatedAt: Item.updatedAt,
    error: Item.error,
    videoUrl: toUrl(Item.outputKey),
    captionsUrl: toUrl(Item.captionsKey),
    sceneMarkers: Item.sceneMarkers || [],
  });
};
