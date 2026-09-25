"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import UploadZone from "./UploadZone";
import Timeline from "./Timeline";
import VideoPreview from "./VideoPreview";
import SpecPanel from "./SpecPanel";
import TranscriptEditor from "./TranscriptEditor";
import { parseCaptions, serializeCaptions, serializeSubRip, type CaptionCue } from "@/lib/captions";
import { detectScenesLocally, processLocally, type ProcessingPhase, type ProcessingPhaseStatus } from "@/lib/local-processing";
import { deleteSavedProject, listSavedProjects, saveProject, type SavedProject } from "@/lib/project-history";

type Status = "IDLE" | "PROCESSING" | "COMPLETE" | "FAILED";
type Result = {
  videoUrl: string;
  captionsUrl?: string;
  captionError?: string;
  sceneMarkers: number[];
  videoBlob: Blob;
  historyId: string;
  createdAt: number;
  fileName: string;
  duration: number;
  sourceVideo: Blob;
  sourceDuration: number;
  trimStart: number;
  trimEnd: number;
  includeSceneDetection: boolean;
  includeCaptions: boolean;
  sceneDetectionSucceeded: boolean;
  sourceAvailable: boolean;
};
type StepStatus = "waiting" | "working" | "complete" | "failed" | "skipped";
type Steps = { upload: StepStatus; trimming: StepStatus; sceneDetection: StepStatus; captions: StepStatus };

function DownloadGlyph() {
  return <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><path d="M10 3.5v8m0 0 3-3m-3 3-3-3M4.5 13v3.25h11V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function formatPreviewTime(time: number) {
  const minutes = Math.floor(time / 60);
  const seconds = (time % 60).toFixed(2).padStart(5, "0");
  return `${String(minutes).padStart(2, "0")}:${seconds}`;
}

function ProcessingSteps({ steps, messages, elapsedSeconds }: { steps: Steps; messages: Partial<Record<keyof Steps, string>>; elapsedSeconds: number }) {
  const items: { key: keyof Steps; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "trimming", label: "Trim" },
    { key: "sceneDetection", label: "Scene detection" },
    { key: "captions", label: "Captions" },
  ];
  const activeItem = items.find(({ key }) => steps[key] === "working");
  const doneCount = items.filter(({ key }) => steps[key] === "complete" || steps[key] === "skipped").length;
  const hasFailed = items.some(({ key }) => steps[key] === "failed");
  const progressMatch = activeItem ? messages[activeItem.key]?.match(/about (\d+)%/) : null;
  const progressPercent = progressMatch ? Number(progressMatch[1]) : null;
  const elapsed = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  return <section className="mt-5 overflow-hidden rounded-xl border border-line bg-surface-raised/70 shadow-inner shadow-black/20" aria-label="Processing progress">
    {activeItem && <div className="h-1 w-full overflow-hidden bg-[#30313A]" role="progressbar" aria-label={`${activeItem.label} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent ?? undefined}><div className={`${progressPercent === null ? "progress-light w-1/3 bg-gradient-to-r from-transparent via-[#E5DEFF] to-transparent" : "bg-accent transition-[width] duration-300"} h-full rounded-full shadow-[0_0_10px_2px_rgba(184,165,255,0.45)]`} style={progressPercent === null ? undefined : { width: `${progressPercent}%` }} /></div>}
    <div className="p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink" aria-live="polite">{activeItem ? `${activeItem.label} in progress` : doneCount === items.length ? "Processing complete" : hasFailed ? "Processing finished with an unavailable step" : "Processing steps"}</p>
          <p className="mt-1 truncate text-[10px] text-ink-muted">{activeItem ? messages[activeItem.key] ?? "Working on this step… Progress updates as the work completes." : doneCount === items.length ? "Your export is ready." : "Steps update as each part of your video finishes."}</p>
        </div>
        {activeItem && <span className="shrink-0 rounded-md border border-line-strong bg-[#100C17] px-2 py-1 font-mono text-[10px] tabular-nums text-ink-muted">{elapsed} elapsed</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map(({ key, label }, index) => <div key={key} className={`flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 ${steps[key] === "working" ? "border-accent/40 bg-[#2A2037]" : steps[key] === "complete" ? "border-[#514365] bg-[#201A2A]" : steps[key] === "failed" ? "border-rose-800/60 bg-rose-950/20" : "border-line/70 bg-[#100C17]/50"}`}>
          <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold ${steps[key] === "complete" ? "bg-accent text-paper" : steps[key] === "working" ? "border border-accent text-accent" : steps[key] === "failed" ? "bg-rose-400 text-[#1A0A0A]" : "border border-line-strong text-ink-faint"}`}>{steps[key] === "complete" ? "✓" : steps[key] === "working" ? <span className="size-2 animate-pulse rounded-full bg-accent" /> : steps[key] === "failed" ? "!" : steps[key] === "skipped" ? "–" : index + 1}</span>
          <span className="min-w-0"><span className="block truncate text-[10px] font-semibold text-ink">{label}</span><span className="mt-0.5 block truncate text-[9px] text-ink-faint">{steps[key] === "working" ? "In progress" : steps[key] === "complete" ? "Complete" : steps[key] === "failed" ? "Needs attention" : steps[key] === "skipped" ? "Skipped" : "Up next"}</span></span>
        </div>)}
      </div>
    </div>
  </section>;
}

export default function Editor() {
  const [file, setFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [status, setStatus] = useState<Status>("IDLE");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [captionCues, setCaptionCues] = useState<CaptionCue[]>([]);
  const [recentProjects, setRecentProjects] = useState<SavedProject[]>([]);
  const [projectPendingDelete, setProjectPendingDelete] = useState<SavedProject | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const [historyMessage, setHistoryMessage] = useState("");
  const [sceneTimes, setSceneTimes] = useState<number[]>([]);
  const [scenesDetected, setScenesDetected] = useState(false);
  const [sceneScanStatus, setSceneScanStatus] = useState<StepStatus>("waiting");
  const [sceneScanMessage, setSceneScanMessage] = useState("");
  const [snapToCuts, setSnapToCuts] = useState(false);
  const [includeSceneDetection, setIncludeSceneDetection] = useState(false);
  const [includeCaptions, setIncludeCaptions] = useState(false);
  const [steps, setSteps] = useState<Steps>({ upload: "waiting", trimming: "waiting", sceneDetection: "waiting", captions: "waiting" });
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const processingStartedAt = useRef<number | null>(null);
  const [stepMessages, setStepMessages] = useState<Partial<Record<keyof Steps, string>>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultRef = useRef<Result | null>(null);
  const projectIdentity = useRef<{ id: string; sourceAvailable: boolean } | null>(null);
  const pendingEditRange = useRef<{ start: number; end: number } | null>(null);
  const selectedPreview = useRef(false);

  useEffect(() => {
    let active = true;
    void listSavedProjects()
      .then((projects) => { if (active) setRecentProjects(projects); })
      .catch((error: unknown) => { if (active) setHistoryMessage(error instanceof Error ? error.message : "Could not load recent projects."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (projectPendingDelete && !dialog.open) dialog.showModal();
    else if (!projectPendingDelete && dialog.open) dialog.close();
  }, [projectPendingDelete]);

  useEffect(() => {
    if (status !== "PROCESSING" || processingStartedAt.current === null) return;
    const updateElapsed = () => setProcessingElapsed(Math.floor((Date.now() - (processingStartedAt.current ?? Date.now())) / 1000));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [status]);

  const clearResult = useCallback(() => {
    if (resultRef.current) {
      URL.revokeObjectURL(resultRef.current.videoUrl);
      if (resultRef.current.captionsUrl) URL.revokeObjectURL(resultRef.current.captionsUrl);
    }
    resultRef.current = null;
    setResult(null);
    setCaptionCues([]);
  }, []);

  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);
  useEffect(() => () => {
    if (resultRef.current) {
      URL.revokeObjectURL(resultRef.current.videoUrl);
      if (resultRef.current.captionsUrl) URL.revokeObjectURL(resultRef.current.captionsUrl);
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      setRecentProjects(await listSavedProjects());
      setHistoryMessage("");
    } catch (error) {
      setHistoryMessage(error instanceof Error ? error.message : "Could not load recent projects.");
    }
  }, []);

  const updateCaptionCues = useCallback((nextCues: CaptionCue[]) => {
    setCaptionCues(nextCues);
    const current = resultRef.current;
    if (!current) return;
    const vtt = serializeCaptions(nextCues);
    const captionsUrl = nextCues.length ? URL.createObjectURL(new Blob([vtt], { type: "text/vtt" })) : undefined;
    if (current.captionsUrl) URL.revokeObjectURL(current.captionsUrl);
    const nextResult = { ...current, captionsUrl, captionError: undefined };
    resultRef.current = nextResult;
    setResult(nextResult);
    void saveProject({
      id: current.historyId,
      fileName: current.fileName,
      createdAt: current.createdAt,
      video: current.videoBlob,
      sourceVideo: current.sourceVideo,
      sourceIsExport: !current.sourceAvailable,
      sourceDuration: current.sourceDuration,
      trimStart: current.trimStart,
      trimEnd: current.trimEnd,
      includeSceneDetection: current.includeSceneDetection,
      includeCaptions: current.includeCaptions,
      sceneDetectionSucceeded: current.sceneDetectionSucceeded,
      captionsVtt: nextCues.length ? vtt : null,
      sceneMarkers: current.sceneMarkers,
      duration: current.duration,
    }).then(refreshHistory).catch((error: unknown) => {
      setHistoryMessage(error instanceof Error ? error.message : "Could not save caption changes to recent projects.");
    });
  }, [refreshHistory]);

  const handleFileSelected = useCallback((selected: File) => {
    projectIdentity.current = null;
    pendingEditRange.current = null;
    setFile(selected);
    clearResult();
    setErrorMessage(null);
    setStatus("IDLE");
    setProgress("");
    setDuration(0);
    setCurrentTime(0);
    setTrimStart(0);
    setTrimEnd(0);
    setSteps({ upload: "complete", trimming: "waiting", sceneDetection: "waiting", captions: "waiting" });
    setStepMessages({ upload: "Clip loaded" });
    setSceneTimes([]);
    setScenesDetected(false);
    setSceneScanStatus("waiting");
    setSceneScanMessage("");
    setSnapToCuts(false);
    setIncludeSceneDetection(false);
    setIncludeCaptions(false);
    setHistoryMessage("");
    setObjectUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(selected);
    });
  }, [clearResult]);

  const handleProcess = useCallback(async () => {
    if (!file) return;
    clearResult();
    setStatus("PROCESSING");
    processingStartedAt.current = Date.now();
    setProcessingElapsed(0);
    setProgress("Starting local processing…");
    setSteps({ upload: "complete", trimming: "working", sceneDetection: includeSceneDetection ? "waiting" : "skipped", captions: includeCaptions ? "waiting" : "skipped" });
    setStepMessages({ upload: "Clip loaded" });
    setErrorMessage(null);
    try {
      const processed = await processLocally(file, trimStart, trimEnd, (phase: ProcessingPhase, phaseStatus: ProcessingPhaseStatus, message: string) => {
        const displayStatus: StepStatus = phaseStatus;
        setSteps((previous) => ({ ...previous, upload: "complete", [phase]: displayStatus }));
        setStepMessages((previous) => ({ ...previous, [phase]: message }));
        setProgress(message);
      }, { sceneDetection: includeSceneDetection, captions: includeCaptions, sourceDuration: duration }, scenesDetected ? sceneTimes : undefined);
      const cues = processed.captionError ? [] : parseCaptions(await processed.captions.text());
      setCaptionCues(cues);
      const createdAt = Date.now();
      const historyId = projectIdentity.current?.id ?? `${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
      const sourceAvailable = projectIdentity.current?.sourceAvailable ?? true;
      const next: Result = {
        videoUrl: URL.createObjectURL(processed.video),
        captionsUrl: cues.length ? URL.createObjectURL(new Blob([serializeCaptions(cues)], { type: "text/vtt" })) : undefined,
        captionError: processed.captionError,
        sceneMarkers: processed.sceneMarkers,
        videoBlob: processed.video,
        historyId,
        createdAt,
        fileName: file.name,
        duration: trimEnd - trimStart,
        sourceVideo: file,
        sourceDuration: duration,
        trimStart,
        trimEnd,
        includeSceneDetection,
        includeCaptions,
        sceneDetectionSucceeded: includeSceneDetection && !processed.sceneDetectionError,
        sourceAvailable,
      };
      projectIdentity.current = { id: historyId, sourceAvailable };
      resultRef.current = next;
      setResult(next);
      setStatus("COMPLETE");
      processingStartedAt.current = null;
      if (includeSceneDetection && !scenesDetected && !processed.sceneDetectionError) {
        setSceneTimes(processed.sceneMarkers.map((time) => Number((time + trimStart).toFixed(3))));
        setScenesDetected(true);
      } else if (processed.sceneDetectionError) {
        setScenesDetected(false);
      } else if (!includeSceneDetection) {
        setSceneTimes([]);
        setScenesDetected(false);
      }
      const finalMessage = processed.captionError ? "Video export is ready." : "Export ready.";
      setProgress(finalMessage);
      setStepMessages((previous) => ({ ...previous, upload: "Clip loaded", trimming: "Trimmed video ready", sceneDetection: includeSceneDetection ? processed.sceneDetectionError ?? `${processed.sceneMarkers.length} cuts found` : "Skipped for a faster export", captions: includeCaptions ? processed.captionError ?? `${cues.length} cues created` : "Skipped for a faster export" }));
      const savedProject: SavedProject = {
          id: historyId,
          fileName: file.name,
          createdAt,
          video: processed.video,
          sourceVideo: file,
          sourceIsExport: !sourceAvailable,
          sourceDuration: duration,
          trimStart,
          trimEnd,
          includeSceneDetection,
          includeCaptions,
          sceneDetectionSucceeded: includeSceneDetection && !processed.sceneDetectionError,
          captionsVtt: cues.length ? serializeCaptions(cues) : null,
          captionError: processed.captionError,
          sceneMarkers: processed.sceneMarkers,
          duration: trimEnd - trimStart,
      };
      try {
        await saveProject(savedProject);
        await refreshHistory();
      } catch (error) {
        try {
          await saveProject({ ...savedProject, sourceVideo: undefined, sourceDuration: undefined, trimStart: undefined, trimEnd: undefined, sourceIsExport: true });
          await refreshHistory();
          setHistoryMessage("Browser storage could not keep the original clip. This project can still be reopened and edited from its exported MP4.");
        } catch {
          setHistoryMessage(error instanceof Error ? error.message : "Could not save this result in recent projects.");
        }
      }
    } catch (error) {
      setStatus("FAILED");
      processingStartedAt.current = null;
      setErrorMessage(error instanceof Error ? error.message : "Unable to process this video in the browser.");
      setProgress("");
      setSteps((previous) => {
        const active = (Object.keys(previous) as (keyof Steps)[]).find((key) => previous[key] === "working");
        return active ? { ...previous, [active]: "failed" } : previous;
      });
    }
  }, [file, trimStart, trimEnd, duration, clearResult, scenesDetected, sceneTimes, includeSceneDetection, includeCaptions, refreshHistory]);

  const detectSceneCuts = useCallback(async () => {
    if (!file) return;
    setIncludeSceneDetection(true);
    setSceneScanStatus("working");
    setSteps((previous) => ({ ...previous, sceneDetection: "working" }));
    setSceneScanMessage("Preparing scene scan…");
    try {
      const detected = await detectScenesLocally(file, setSceneScanMessage);
      setSceneTimes(detected);
      setScenesDetected(true);
      setSceneScanStatus("complete");
      setSceneScanMessage(`${detected.length} scene ${detected.length === 1 ? "cut" : "cuts"} found.`);
      setSteps((previous) => ({ ...previous, sceneDetection: "complete" }));
      setStepMessages((previous) => ({ ...previous, sceneDetection: `${detected.length} cuts found` }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not detect scene changes.";
      setSceneScanStatus("failed");
      setSceneScanMessage(message);
      setSteps((previous) => ({ ...previous, sceneDetection: "failed" }));
    }
  }, [file]);

  const restoreProject = useCallback((project: SavedProject) => {
    clearResult();
    const sourceVideo = project.sourceVideo ?? project.video;
    const sourceDuration = project.sourceDuration ?? project.duration;
    const sceneDetectionSucceeded = project.sceneDetectionSucceeded ?? project.sceneMarkers.length > 0;
    const includedSceneDetection = project.includeSceneDetection ?? project.sceneMarkers.length > 0;
    const includedCaptions = project.includeCaptions ?? Boolean(project.captionsVtt || project.captionError);
    const sourceFile = new File([sourceVideo], project.fileName, { type: project.sourceVideo ? sourceVideo.type : "video/mp4" });
    const sourceAvailable = Boolean(project.sourceVideo) && !project.sourceIsExport;
    projectIdentity.current = { id: project.id, sourceAvailable };
    pendingEditRange.current = null;
    setObjectUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(sourceFile);
    });
    const cues = project.captionsVtt ? parseCaptions(project.captionsVtt) : [];
    setCaptionCues(cues);
    const next: Result = {
      videoUrl: URL.createObjectURL(project.video),
      captionsUrl: cues.length ? URL.createObjectURL(new Blob([serializeCaptions(cues)], { type: "text/vtt" })) : undefined,
      captionError: project.captionError,
      sceneMarkers: project.sceneMarkers,
      videoBlob: project.video,
      historyId: project.id,
      createdAt: project.createdAt,
      fileName: project.fileName,
      duration: project.duration,
      sourceVideo,
      sourceDuration,
      trimStart: project.trimStart ?? 0,
      trimEnd: project.trimEnd ?? sourceDuration,
      includeSceneDetection: includedSceneDetection,
      includeCaptions: includedCaptions,
      sceneDetectionSucceeded,
      sourceAvailable,
    };
    resultRef.current = next;
    setResult(next);
    setFile(sourceFile);
    setStatus("COMPLETE");
    setDuration(project.duration);
    setTrimStart(0);
    setTrimEnd(project.duration);
    setCurrentTime(0);
    setSceneTimes(project.sceneMarkers.map((time) => time + (project.trimStart ?? 0)));
    setScenesDetected(sceneDetectionSucceeded);
    setSceneScanStatus(sceneDetectionSucceeded ? "complete" : "waiting");
    setSceneScanMessage(`${project.sceneMarkers.length} scene cuts`);
    setSteps({ upload: "complete", trimming: "complete", sceneDetection: includedSceneDetection ? sceneDetectionSucceeded ? "complete" : "failed" : "skipped", captions: project.captionError ? "failed" : includedCaptions ? "complete" : "skipped" });
    setStepMessages({ upload: "Restored from history", trimming: "Export ready", sceneDetection: `${project.sceneMarkers.length} cuts found`, captions: project.captionError ?? `${cues.length} cues` });
    setProgress("Opened from recent projects.");
    setErrorMessage(null);
    setHistoryMessage("");
  }, [clearResult]);

  const editVideo = useCallback(() => {
    const current = resultRef.current;
    if (!current) return;
    pendingEditRange.current = { start: current.trimStart, end: current.trimEnd };
    setDuration(current.sourceDuration);
    setTrimStart(current.trimStart);
    setTrimEnd(current.trimEnd);
    setCurrentTime(0);
    setSceneTimes(current.sceneMarkers.map((time) => time + current.trimStart));
    setScenesDetected(current.sceneDetectionSucceeded);
    setSceneScanStatus(current.sceneDetectionSucceeded ? "complete" : "waiting");
    setSceneScanMessage("");
    setIncludeSceneDetection(current.includeSceneDetection);
    setIncludeCaptions(current.includeCaptions);
    setSteps({ upload: "complete", trimming: "waiting", sceneDetection: current.includeSceneDetection ? "complete" : "waiting", captions: "waiting" });
    setStepMessages({ upload: "Clip loaded" });
    clearResult();
    setStatus("IDLE");
    setProgress(current.sourceAvailable ? "Ready to edit the original clip." : "Editing the saved export. The original clip was not stored with this older project.");
  }, [clearResult]);

  const removeSavedProject = useCallback(async (project: SavedProject) => {
    setDeletingProjectId(project.id);
    try {
      await deleteSavedProject(project.id);
      setRecentProjects((projects) => projects.filter((item) => item.id !== project.id));
      setProjectPendingDelete(null);
      setHistoryMessage("");
    } catch (error) {
      setHistoryMessage(error instanceof Error ? error.message : "Could not delete this project from browser history.");
    } finally {
      setDeletingProjectId(null);
    }
  }, []);

  const seekPreviewTo = useCallback((point: "beginning" | "left" | "right") => {
    const video = videoRef.current;
    if (!video) return;
    selectedPreview.current = false;
    const time = result
      ? point === "right" ? Math.max(0, trimEnd - trimStart) : 0
      : point === "beginning" ? 0 : point === "left" ? trimStart : trimEnd;
    video.currentTime = time;
  }, [result, trimEnd, trimStart]);

  const jumpToCut = useCallback((direction: "previous" | "next") => {
    const video = videoRef.current;
    if (!video) return;
    const cuts = result?.sceneMarkers ?? sceneTimes;
    const target = direction === "next"
      ? cuts.find((time) => time > video.currentTime + 0.05)
      : [...cuts].reverse().find((time) => time < video.currentTime - 0.05);
    if (target !== undefined) {
      selectedPreview.current = false;
      video.currentTime = target;
    }
  }, [result, sceneTimes]);

  const previewSelection = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    selectedPreview.current = true;
    video.currentTime = trimStart;
    void video.play().catch(() => { selectedPreview.current = false; });
  }, [trimStart]);

  const handleVideoPlay = useCallback(() => {
    const video = videoRef.current;
    if (video && selectedPreview.current && (video.currentTime < trimStart || video.currentTime >= trimEnd)) video.currentTime = trimStart;
  }, [trimEnd, trimStart]);

  const handleVideoTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
    const video = videoRef.current;
    if (video && selectedPreview.current && time >= trimEnd) {
      video.pause();
      video.currentTime = trimEnd;
      selectedPreview.current = false;
    }
  }, [trimEnd]);

  const resetEditor = () => {
    projectIdentity.current = null;
    pendingEditRange.current = null;
    setFile(null);
    setObjectUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    clearResult();
    setStatus("IDLE");
    setProgress("");
    setErrorMessage(null);
    setDuration(0);
    setCurrentTime(0);
    setTrimStart(0);
    setTrimEnd(0);
    setSceneTimes([]);
    setScenesDetected(false);
    setSceneScanStatus("waiting");
    setSceneScanMessage("");
    setSnapToCuts(false);
    setIncludeSceneDetection(false);
    setIncludeCaptions(false);
    setSteps({ upload: "waiting", trimming: "waiting", sceneDetection: "waiting", captions: "waiting" });
    setStepMessages({});
    setHistoryMessage("");
  };

  const busy = status === "PROCESSING";
  const previewSrc = result?.videoUrl ?? objectUrl;
  const statusCopy = status === "IDLE" ? null : { PROCESSING: "Working on your device", COMPLETE: "Export complete", FAILED: "Couldn’t finish export" }[status];

  return (
    <>
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_20px_65px_rgba(0,0,0,0.24)]">
      <header className="flex min-h-[62px] flex-wrap items-center justify-between gap-3 border-b border-line bg-[#1B1C22] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="min-w-0"><p className="truncate text-[13px] font-semibold tracking-[-0.02em] text-ink">{file ? file.name : "New project"}</p><p className="mt-0.5 text-[10px] text-ink-faint">{file ? "Source clip" : "Import a video to begin"}</p></div>
        </div>
        {statusCopy && <div className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-[#14151A] px-3 py-1.5 text-[10px] font-medium text-ink-muted" aria-live="polite">
          <span className={`size-1.5 rounded-full ${busy ? "animate-pulse bg-accent" : status === "FAILED" ? "bg-rose-400" : "bg-[#82C5A0]"}`} />
          <span>{statusCopy}</span>
        </div>}
      </header>

      {!file && <UploadZone onFileSelected={handleFileSelected} />}

      {file && previewSrc && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 p-4 sm:p-6 lg:p-7">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-ink-muted">Preview</span>
              <span className="text-[10px] text-ink-faint">{status === "COMPLETE" ? "Processed clip" : "Original clip"}</span>
            </div>
            <VideoPreview
              ref={videoRef}
              src={previewSrc}
              captionsUrl={result?.captionsUrl}
              onLoadedMetadata={(videoDuration) => {
                setDuration(videoDuration);
                const restoredRange = pendingEditRange.current;
                pendingEditRange.current = null;
                setTrimStart(restoredRange ? Math.min(restoredRange.start, videoDuration) : 0);
                setTrimEnd(restoredRange ? Math.min(restoredRange.end, videoDuration) : videoDuration);
              }}
              onTimeUpdate={handleVideoTimeUpdate}
              onPlay={handleVideoPlay}
            />

            <div className="mt-5 rounded-xl border border-line bg-[#14151A] p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink">Trim range</span>
                <span className="text-[10px] tabular-nums text-ink-faint">{(result?.sceneMarkers ?? sceneTimes).length} scene {(result?.sceneMarkers ?? sceneTimes).length === 1 ? "cut" : "cuts"}</span>
              </div>
              <Timeline
                duration={duration}
                trimStart={trimStart}
                trimEnd={trimEnd}
                currentTime={currentTime}
                sceneMarkers={result?.sceneMarkers ?? (scenesDetected ? sceneTimes : [])}
                snapToScenes={snapToCuts}
                disabled={busy || status === "COMPLETE" || sceneScanStatus === "working"}
                onChange={(start, end) => { setTrimStart(start); setTrimEnd(end); }}
                onScrub={(time) => { if (videoRef.current) videoRef.current.currentTime = time; }}
              />
              <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div className="flex flex-wrap items-center gap-2" aria-label="Preview seek points">
                  <button type="button" onClick={previewSelection} disabled={status === "COMPLETE" || busy} className="rounded-lg bg-accent px-3.5 py-2 text-[11px] font-semibold text-[#17131F] transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-accent-strong focus-visible:outline-accent disabled:opacity-40">Preview selection</button>
                  <button type="button" onClick={() => seekPreviewTo("beginning")} className="rounded-lg bg-accent px-3 py-2 text-[11px] font-semibold text-[#17131F] transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-accent-strong focus-visible:outline-accent">Start</button>
                  <button type="button" onClick={() => seekPreviewTo("left")} className="rounded-lg bg-accent px-3 py-2 text-[11px] font-semibold text-[#17131F] transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-accent-strong focus-visible:outline-accent">Left cut <span className="ml-1 font-mono">{formatPreviewTime(trimStart)}</span></button>
                  <button type="button" onClick={() => seekPreviewTo("right")} className="rounded-lg bg-accent px-3 py-2 text-[11px] font-semibold text-[#17131F] transition-[background-color,transform] duration-200 hover:-translate-y-px hover:bg-accent-strong focus-visible:outline-accent">Right cut <span className="ml-1 font-mono">{formatPreviewTime(trimEnd)}</span></button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => jumpToCut("previous")} disabled={!(result?.sceneMarkers ?? sceneTimes).length || busy} className="rounded-md border border-line px-2.5 py-2 text-[11px] text-ink-muted hover:bg-white/[0.04] disabled:opacity-40" aria-label="Jump to previous scene cut">← Cut</button>
                  <button type="button" onClick={() => jumpToCut("next")} disabled={!(result?.sceneMarkers ?? sceneTimes).length || busy} className="rounded-md border border-line px-2.5 py-2 text-[11px] text-ink-muted hover:bg-white/[0.04] disabled:opacity-40" aria-label="Jump to next scene cut">Cut →</button>
                  <button type="button" onClick={detectSceneCuts} disabled={busy || status === "COMPLETE" || sceneScanStatus === "working"} className="rounded-md border border-line px-3 py-2 text-[11px] font-medium text-ink-muted hover:bg-white/[0.04] hover:text-ink disabled:opacity-40">{scenesDetected ? "Rescan cuts" : "Detect cuts"}</button>
                  <label className="flex items-center gap-1.5 pl-1 text-[11px] text-ink-muted">
                    <input type="checkbox" checked={snapToCuts} onChange={(event) => setSnapToCuts(event.target.checked)} disabled={!scenesDetected || status === "COMPLETE"} className="size-3.5 accent-accent" />
                    Snap to cuts
                  </label>
                </div>
              </div>
              {sceneScanMessage && <p className={`mt-2 text-[11px] ${sceneScanStatus === "failed" ? "text-rose-300" : "text-ink-faint"}`} role={sceneScanStatus === "failed" ? "alert" : "status"}>{sceneScanMessage}</p>}
            </div>

            <section className="mt-4 rounded-xl border border-line bg-[#1A1B21] p-4" aria-label="Optional processing">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xs font-semibold text-ink">Optional processing</h2>
                <span className="text-[10px] text-ink-faint">Off by default for a faster export</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-200 ${includeSceneDetection ? "border-accent/50 bg-accent-soft/60" : "border-line bg-[#14151A] hover:border-line-strong"}`}>
                  <input type="checkbox" checked={includeSceneDetection} disabled={busy || status === "COMPLETE" || sceneScanStatus === "working"} onChange={(event) => setIncludeSceneDetection(event.target.checked)} className="mt-0.5 size-3.5 shrink-0 accent-accent" />
                  <span><span className="block text-[11px] font-medium text-ink">Detect scene changes</span><span className="mt-1 block text-[10px] leading-relaxed text-ink-faint">Scans the video at low resolution to find likely cuts.</span></span>
                </label>
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-200 ${includeCaptions ? "border-accent/50 bg-accent-soft/60" : "border-line bg-[#14151A] hover:border-line-strong"}`}>
                  <input type="checkbox" checked={includeCaptions} disabled={busy || status === "COMPLETE"} onChange={(event) => setIncludeCaptions(event.target.checked)} className="mt-0.5 size-3.5 shrink-0 accent-accent" />
                  <span><span className="block text-[11px] font-medium text-ink">Generate captions</span><span className="mt-1 block text-[10px] leading-relaxed text-ink-faint">Uses an on-device speech model; first use downloads it.</span></span>
                </label>
              </div>
            </section>

            <ProcessingSteps steps={steps} messages={stepMessages} elapsedSeconds={processingElapsed} />

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button onClick={handleProcess} disabled={busy || status === "COMPLETE" || sceneScanStatus === "working" || !Number.isFinite(duration) || duration <= 0} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-paper shadow-[0_3px_16px_rgba(185,165,255,0.12)] transition-[background-color,box-shadow] duration-150 hover:bg-accent-strong hover:shadow-[0_5px_22px_rgba(185,165,255,0.2)] focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-45">
                {busy && <span className="size-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />}
                {status === "IDLE" && "Process video"}
                {status === "PROCESSING" && "Processing"}
                {status === "COMPLETE" && "Export ready"}
                {status === "FAILED" && "Try again"}
                {status === "IDLE" && <span aria-hidden="true">→</span>}
              </button>
              {result && <a href={result.videoUrl} download={`${file.name.replace(/\.[^.]+$/, "")}-cutmark.mp4`} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-well focus-visible:outline-accent"><DownloadGlyph /> MP4</a>}
              {result?.captionsUrl && captionCues.length > 0 && <a href={`data:application/x-subrip;charset=utf-8,${encodeURIComponent(serializeSubRip(captionCues))}`} download="captions.srt" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-well hover:text-ink focus-visible:outline-accent"><DownloadGlyph /> Subtitles (.srt)</a>}
              {result && <button type="button" onClick={editVideo} className="inline-flex h-9 items-center justify-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-well focus-visible:outline-accent">Edit video</button>}
              <button onClick={resetEditor} disabled={busy || sceneScanStatus === "working"} className="ml-auto inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-paper hover:text-ink focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40">New video</button>
            </div>

            {(progress || errorMessage) && <div className={`mt-4 flex items-start gap-2.5 border-l-2 px-3 py-2 text-xs leading-relaxed ${errorMessage ? "border-rose-500 text-rose-300" : "border-line-strong text-ink-muted"}`} role={errorMessage ? "alert" : "status"}>
              {!errorMessage && busy && <span className="mt-0.5 size-3 shrink-0 animate-spin rounded-full border-2 border-accent/25 border-t-accent" />}
              {!errorMessage && !busy && <span className="mt-0.5 size-3 shrink-0 rounded-full bg-ink-faint" />}
              {errorMessage ?? progress}
            </div>}
            {result?.captionError && <div className="mt-3 rounded-lg border border-amber-800/50 bg-amber-950/20 px-3 py-2.5 text-xs leading-relaxed text-amber-200" role="status">
              Captions were not created: {result.captionError} The video export is still available.
            </div>}
            {historyMessage && <p className="mt-3 text-[11px] text-amber-200" role="status">Recent project history: {historyMessage}</p>}
            {result && <TranscriptEditor cues={captionCues} duration={duration} onChange={updateCaptionCues} />}
          </div>

          <div className="border-t border-line bg-[#15161B] p-4 sm:p-5 xl:border-l xl:border-t-0">
            <SpecPanel fileName={file.name} fileSize={file.size} duration={duration} trimStart={trimStart} trimEnd={trimEnd} status={status} result={result} />
          </div>
        </div>
      )}
      {!file && <section className="border-t border-line bg-[#15161B] px-5 py-5 sm:px-6" aria-label="Recent project history">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">Recent projects</h2><p className="mt-1 text-[11px] text-ink-muted">Finished clips are saved in this browser.</p></div>
          {historyMessage && <span className="text-[11px] text-amber-200">{historyMessage}</span>}
        </div>
        {recentProjects.length ? <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {recentProjects.map((project) => <li key={project.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-[#1A1B21] p-3 transition-colors duration-200 hover:border-line-strong">
            <span className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-[#14151A] text-ink-faint"><svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="m8 7 5 3-5 3V7Z" fill="currentColor"/></svg></span><span className="min-w-0"><span className="block truncate text-xs font-medium text-ink">{project.fileName}</span><span className="mt-1 block truncate text-[10px] text-ink-faint">{new Date(project.createdAt).toLocaleDateString()} · {project.captionsVtt ? "Captions saved" : "No captions"}</span></span></span>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => restoreProject(project)} className="rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-[11px] font-medium text-ink-muted transition-colors hover:border-accent/50 hover:bg-[#2A2037] hover:text-ink">Open project</button>
              <button type="button" onClick={() => { setHistoryMessage(""); setProjectPendingDelete(project); }} aria-label={`Delete ${project.fileName} from recent projects`} title="Delete project" className="grid size-9 place-items-center rounded-lg border border-line text-ink-faint transition-colors hover:border-rose-500/40 hover:bg-rose-950/30 hover:text-rose-300 focus-visible:outline-accent">
                <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><path d="M4.5 6h11m-9.5 0 .6 9.2a1.25 1.25 0 0 0 1.25 1.17h4.3a1.25 1.25 0 0 0 1.25-1.17L14 6M8 6V4.75c0-.69.56-1.25 1.25-1.25h1.5C11.44 3.5 12 4.06 12 4.75V6m-3 2.5v5m2-5v5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </li>)}
        </ul> : <p className="mt-4 rounded-lg border border-dashed border-line px-3 py-4 text-xs text-ink-faint">Your five most recent exports will appear here.</p>}
      </section>}
    </section>
    <dialog ref={deleteDialogRef} onCancel={(event) => { event.preventDefault(); if (deletingProjectId === null) setProjectPendingDelete(null); }} aria-labelledby="delete-project-title" className="m-auto w-[min(420px,calc(100vw-2rem))] rounded-2xl border border-[#594567] bg-[#191421] p-0 text-ink shadow-[0_24px_90px_rgba(0,0,0,0.65)] backdrop:bg-black/75">
      {projectPendingDelete && <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-rose-500/25 bg-rose-950/35 text-rose-300"><svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true"><path d="M4.5 6h11m-9.5 0 .6 9.2a1.25 1.25 0 0 0 1.25 1.17h4.3a1.25 1.25 0 0 0 1.25-1.17L14 6M8 6V4.75c0-.69.56-1.25 1.25-1.25h1.5C11.44 3.5 12 4.06 12 4.75V6m-3 2.5v5m2-5v5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
          <div className="min-w-0 pt-0.5">
            <h2 id="delete-project-title" className="text-sm font-semibold tracking-[-0.01em]">Are you sure you want to delete this project?</h2>
            <p className="mt-2 break-words text-xs leading-relaxed text-ink-muted"><span className="font-medium text-ink">{projectPendingDelete.fileName}</span> will be removed from recent projects in this browser.</p>
          </div>
        </div>
        {historyMessage && <p className="mt-3 text-xs text-rose-300" role="alert">{historyMessage}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" autoFocus onClick={() => setProjectPendingDelete(null)} disabled={deletingProjectId !== null} className="rounded-lg border border-line-strong bg-surface-raised px-3.5 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-[#2A2037] hover:text-ink disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void removeSavedProject(projectPendingDelete)} disabled={deletingProjectId !== null} className="inline-flex min-w-[112px] items-center justify-center gap-2 rounded-lg border border-rose-400/30 bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:cursor-wait disabled:opacity-60">{deletingProjectId !== null && <span className="size-3 animate-spin rounded-full border-2 border-white/35 border-t-white" />}{deletingProjectId === projectPendingDelete.id ? "Deleting…" : "Delete project"}</button>
        </div>
      </div>}
    </dialog>
    </>
  );
}
