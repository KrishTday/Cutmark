export type JobStatus = "IDLE" | "UPLOADING" | "PROCESSING" | "COMPLETE" | "FAILED";

export interface PresignResponse {
  jobId: string;
  key: string;
  uploadUrl: string;
  bucket: string;
}

export interface StartJobResponse {
  jobId: string;
  status: "PROCESSING";
}

export interface JobStatusResponse {
  jobId: string;
  status: "PROCESSING" | "COMPLETE" | "FAILED";
  createdAt: string;
  updatedAt: string;
  error?: string;
  videoUrl?: string;
  captionsUrl?: string;
  sceneMarkers: number[];
}
