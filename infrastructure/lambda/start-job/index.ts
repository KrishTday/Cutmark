import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});

const JOBS_TABLE = process.env.JOBS_TABLE as string;
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN as string;

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
    const { jobId, key, trimStart, trimEnd } = body as {
      jobId?: string;
      key?: string;
      trimStart?: number;
      trimEnd?: number;
    };

    if (!jobId || !key || trimStart === undefined || trimEnd === undefined) {
      return jsonResponse(400, { message: "jobId, key, trimStart and trimEnd are required" });
    }
    if (trimEnd <= trimStart) {
      return jsonResponse(400, { message: "trimEnd must be greater than trimStart" });
    }

    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 3; // 3 days

    await ddb.send(
      new PutCommand({
        TableName: JOBS_TABLE,
        Item: {
          jobId,
          status: "PROCESSING",
          sourceKey: key,
          trimStart,
          trimEnd,
          createdAt: now,
          updatedAt: now,
          ttl,
        },
      })
    );

    await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: STATE_MACHINE_ARN,
        name: jobId,
        input: JSON.stringify({ jobId, sourceKey: key, trimStart, trimEnd }),
      })
    );

    return jsonResponse(202, { jobId, status: "PROCESSING" });
  } catch (err) {
    console.error("start-job failed", err);
    return jsonResponse(500, { message: "Failed to start job" });
  }
};
