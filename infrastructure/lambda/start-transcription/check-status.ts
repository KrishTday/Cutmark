import { TranscribeClient, GetTranscriptionJobCommand } from "@aws-sdk/client-transcribe";

const transcribe = new TranscribeClient({});

interface StateInput {
  jobId: string;
  transcription: { transcriptionJobName: string; status: string };
}

export const handler = async (event: StateInput) => {
  const { transcriptionJobName } = event.transcription;

  const { TranscriptionJob } = await transcribe.send(
    new GetTranscriptionJobCommand({ TranscriptionJobName: transcriptionJobName })
  );

  const awsStatus = TranscriptionJob?.TranscriptionJobStatus; // IN_PROGRESS | COMPLETED | FAILED

  return {
    transcriptionJobName,
    status: awsStatus ?? "FAILED",
    failureReason: TranscriptionJob?.FailureReason,
  };
};
