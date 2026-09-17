import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const JOBS_TABLE = process.env.JOBS_TABLE as string;

interface StateInput {
  jobId: string;
  error?: { Error?: string; Cause?: string };
}

export const handler = async (event: StateInput) => {
  const { jobId, error } = event;

  await ddb.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { jobId },
      UpdateExpression: "SET #status = :status, #error = :error, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#status": "status", "#error": "error" },
      ExpressionAttributeValues: {
        ":status": "FAILED",
        ":error": error?.Cause ?? error?.Error ?? "Processing failed",
        ":updatedAt": new Date().toISOString(),
      },
    })
  );

  return { jobId, status: "FAILED" };
};
