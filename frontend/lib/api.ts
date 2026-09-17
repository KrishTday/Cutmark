import { PresignResponse, StartJobResponse, JobStatusResponse } from "./types";

// Set this to your deployed API Gateway endpoint, e.g. via
// NEXT_PUBLIC_API_URL at build time (see .env.example / README).
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getPresignedUpload(fileName: string, contentType: string): Promise<PresignResponse> {
  return request<PresignResponse>("/uploads", {
    method: "POST",
    body: JSON.stringify({ fileName, contentType }),
  });
}

export async function uploadToS3(uploadUrl: string, file: File, onProgress?: (pct: number) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.send(file);
  });
}

export async function startJob(
  jobId: string,
  key: string,
  trimStart: number,
  trimEnd: number
): Promise<StartJobResponse> {
  return request<StartJobResponse>("/jobs", {
    method: "POST",
    body: JSON.stringify({ jobId, key, trimStart, trimEnd }),
  });
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  return request<JobStatusResponse>(`/jobs/${jobId}`, { method: "GET" });
}
