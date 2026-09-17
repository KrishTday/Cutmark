import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const JOBS_TABLE = process.env.JOBS_TABLE as string;

interface StateInput {
  jobId: string;
  parallelResult: [
    { videoResult: { outputKey: string; sceneMarkers: number[] } },
    { captionsResult: { captionsKey: string } }
  ];
}

export const handler = async (event: StateInput) => {
  const { jobId, parallelResult } = event;
  const [videoBranch, captionsBranch] = parallelResult;

  await ddb.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { jobId },
      UpdateExpression: "SET #status = :status, outputKey = :outputKey, sceneMarkers = :sceneMarkers, " +
        "captionsKey = :captionsKey, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "COMPLETE",
        ":outputKey": videoBranch.videoResult.outputKey,
        ":sceneMarkers": videoBranch.videoResult.sceneMarkers,
        ":captionsKey": captionsBranch.captionsResult.captionsKey,
        ":updatedAt": new Date().toISOString(),
      },
    })
  );

  return { jobId, status: "COMPLETE" };
};
