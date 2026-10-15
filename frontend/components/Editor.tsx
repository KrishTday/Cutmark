"use client";
import {DEFAULT_FRAMING,DEFAULT_AUDIO,type Framing,type AudioAdjustments} from "@/lib/adjustments";
import {subtractInterval} from "@/lib/sequence-edits";
import {pauseOtherPreviews} from "@/lib/playback";
import ImagePanel from "./ImagePanel";
import {imageMime,bindImages,loadImageLayers,drawImageLayers,closeImageLayers,type ImageOverlay} from "@/lib/image-tools";
import AudioMeter from "./AudioMeter";
import type {TitleCue} from "@/lib/title-tools";
import TitlePanel from "./TitlePanel";
import AssemblyPanel from "./AssemblyPanel";
import {assemblyCaptions,assemblyTitles,assemblyImages,assemblyMarkers,validateAssembly,type AssemblySource} from "@/lib/assembly";
import PresetPanel from "./PresetPanel";
import CleanupPanel from "./CleanupPanel";
import ClipQueue from "./ClipQueue";
import type {ClipOutput} from "@/lib/clip-tools";
import AdjustmentPanel from "./AdjustmentPanel";
import SequencePanel from "./SequencePanel";
import ExportSettings from "./ExportSettings";
import {DEFAULT_EXPORT_PREFERENCES,outputSpec,outputFileName,type ExportPreferences} from "@/lib/output-spec";

import { useCallback, useEffect, useRef, useState, useMemo, useReducer } from "react";
import StoragePanel from "./StoragePanel";
import ProjectRecovery from "./ProjectRecovery";
import {createBackup,backupBlob,fingerprintSource,verifyImageRelink,verifyRelink,restoredProject,projectFileStem,type ProjectBackup} from "@/lib/portable-project";
import UploadZone from "./UploadZone";
import Timeline from "./Timeline";
import CaptionStylePanel from "./CaptionStylePanel";
import SubtitleImport from "./SubtitleImport";
import { DEFAULT_CAPTION_STYLE, type CaptionStyle, type CaptionDelivery } from "@/lib/caption-renderer";
import VideoPreview from "./VideoPreview";
import ScenePanel from "./ScenePanel";
import MarkerPanel from "./MarkerPanel";
import { analyzeScenes } from "@/lib/scene-analysis";
import { cutsFromLegacy, mergeSceneScan, type SceneCut, type SceneSettings, type EditorialMarker } from "@/lib/scene-tools";
import Transport from "./Transport";
import useCoalescedSeek from "./useCoalescedSeek";
import { captionIssues, type CaptionGuidance } from "@/lib/caption-editing";
import SpecPanel from "./SpecPanel";
import TranscriptEditor from "./TranscriptEditor";
import { parseCaptions, isSubtitleInterval, serializeCaptions, serializeSubRip, type CaptionCue } from "@/lib/captions";
import { processLocally, processAssembly,transcribeLocally } from "@/lib/local-processing";
import { duplicateSavedProject, deleteSavedProject, listSavedProjects, loadSavedProject, saveProject, type SavedProject, type SavedProjectSummary } from "@/lib/project-history";

import { createHistory, editReducer, type EditDecisions } from "@/lib/editable-project";
import { formatTime as formatPreviewTime, validateRange, mapCuesToOutput, sourceOccurrences, sequenceDuration, validateSequence } from "@/lib/timing";
import { probeMedia, validateOutput, adjacentFrame, lastIncludedFrame, type MediaMetadata } from "@/lib/media";

type Status = "IDLE" | "PROCESSING" | "COMPLETE" | "FAILED";
type Result = {
  videoUrl: string; videoBlob: Blob; artifactId: string; revision: number; trimStart: number; trimEnd: number;
  duration: number; settings: {images?:ImageOverlay[];titles?:TitleCue[]; width: number; height: number; audio: boolean; framing?:Framing;audioAdjustments?:AudioAdjustments;preferences?:ExportPreferences; timing: "source"; captions: CaptionDelivery; captionStyle?:CaptionStyle; fileName?:string; processor: "automatic" | "ffmpeg" }; captionsVtt: string | null; metadata?: MediaMetadata;
  sceneMarkers: number[]; captionError?: string;
};
type StepStatus = "waiting" | "working" | "complete" | "failed" | "skipped";
type Steps = { upload: StepStatus; trimming: StepStatus; sceneDetection: StepStatus; captions: StepStatus };

function DownloadGlyph() {
  return <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><path d="M10 3.5v8m0 0 3-3m-3 3-3-3M4.5 13v3.25h11V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function ProcessingSteps({ steps, messages, elapsedSeconds }: { steps: Steps; messages: Partial<Record<keyof Steps, string>>; elapsedSeconds: number }) {
  const items: { key: keyof Steps; label: string }[] = [
    { key: "upload", label: "Source" },
    { key: "trimming", label: "Export video" },
    { key: "sceneDetection", label: "Scene detection" },
    { key: "captions", label: "Transcription" },
  ];
  const activeItem = items.find(({ key }) => steps[key] === "working");
  const doneCount = items.filter(({ key }) => steps[key] === "complete" || steps[key] === "skipped").length;
  const completionCopy = steps.trimming === "complete" ? "Video export verified." : steps.captions === "complete" ? "Captions ready to review." : steps.sceneDetection === "complete" ? "Scene scan ready to review." : "Operation finished.";
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
          <p className="mt-1 truncate text-[10px] text-ink-muted">{activeItem ? messages[activeItem.key] ?? "Working on this step… Progress updates as the work completes." : doneCount === items.length ? completionCopy : "Steps update as each part of your video finishes."}</p>
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

const DEFAULT_SCENE_SETTINGS: SceneSettings = { mode: "quick", sensitivity: "balanced", scope: "source" };
const NO_MARKERS: EditorialMarker[] = [];
const DEFAULT_GUIDANCE: CaptionGuidance = { lineLength: 42, charactersPerSecond: 20 };

export default function Editor() {
  const empty: EditDecisions = { ranges: [], captions: [], sceneMarkers: [], scenesDetected: false, includeSceneDetection: false };
  const [assemblyMedia,setAssemblyMedia]=useState<Record<string,Blob>>({});
  const [file, setFile] = useState<File | null>(null);
  const storageOperation=useRef<AbortController|null>(null);
  const [storageWorking,setStorageWorking]=useState(false);
  const [projectWorking,setProjectWorking]=useState(false);
  const [projectProgress,setProjectProgress]=useState("");
  const [identity, setIdentity] = useState<{ id: string; createdAt: number; sourceAvailable: boolean;sourceAssetId?:string } | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null);
  const [history, dispatch] = useReducer(editReducer, createHistory(empty));
  const { present: edits, revision } = history;
  const duration = metadata?.duration ?? 0;
  const [selectedRange,setSelectedRange]=useState(0);
  const [clipOutputs,setClipOutputs]=useState<ClipOutput[]>([]);
  const clipJobRef=useRef<AbortController|null>(null),clipUrlsRef=useRef(new Map<string,string>());
  useEffect(()=>{const urls=clipUrlsRef.current;return()=>{clipJobRef.current?.abort();urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();};},[file]);
  const activeRangeIndex=Math.min(selectedRange,Math.max(0,edits.ranges.length-1));
  const activeRange=edits.ranges[activeRangeIndex];
  const trimStart = activeRange?.start ?? 0, trimEnd = activeRange?.end ?? 0;
  const primaryImageRender=useMemo(()=>bindImages(edits.images??[],assemblyMedia),[edits.images,assemblyMedia]);
  const outputImageRender=useMemo(()=>bindImages(edits.assembly?.enabled?assemblyImages(edits.assembly):mapCuesToOutput(edits.images??[],edits.ranges),assemblyMedia),[edits.assembly,edits.images,edits.ranges,assemblyMedia]);
  const outputTitles=edits.assembly?.enabled?assemblyTitles(edits.assembly):mapCuesToOutput(edits.titles??[],edits.ranges);
  const sequenceLength=edits.assembly?.enabled?sequenceDuration(edits.assembly.ranges):sequenceDuration(edits.ranges);
  const [sequencePreview,setSequencePreview]=useState<{url:string;revision:number;captions:string|null}|null>(null);
  useEffect(()=>()=>{if(sequencePreview)URL.revokeObjectURL(sequencePreview.url);},[sequencePreview]);
  const changeRange=(start:number,end:number,action:string)=>edit({...edits,ranges:edits.ranges.map((range,index)=>index===activeRangeIndex?{...range,start,end}:range)},action);
  const projectTitle=edits.projectTitle?.trim()||file?.name||"New project";
  const outputStem=projectFileStem(file&&projectTitle===file.name?file.name.replace(/\.[^.]+$/, ""):projectTitle);
  const captionCues = edits.captions, sceneTimes = edits.sceneMarkers, scenesDetected = edits.scenesDetected;
  const sceneCuts = useMemo(() => edits.sceneCuts ?? cutsFromLegacy(sceneTimes), [edits.sceneCuts, sceneTimes]);
  const sceneSettings = edits.sceneSettings ?? DEFAULT_SCENE_SETTINGS;
  const editorialMarkers = edits.editorialMarkers ?? NO_MARKERS;
  const includeSceneDetection = edits.includeSceneDetection;
  const captionStyle = edits.captionStyle ?? DEFAULT_CAPTION_STYLE, captionDelivery = edits.captionDelivery ?? "sidecar";
  const burnCaptions = captionDelivery !== "sidecar";
  const exportPreferences=edits.exportPreferences??DEFAULT_EXPORT_PREFERENCES;
  const framing=edits.framing??DEFAULT_FRAMING,audioAdjustments=edits.audioAdjustments??DEFAULT_AUDIO;
  const spec=metadata?outputSpec(metadata.width,metadata.height,edits.assembly?.enabled?edits.assembly.sources.some(source=>source.reference.metadata.hasAudio):metadata.hasAudio,exportPreferences,framing,audioAdjustments):null;
  const [nativeCaptionPreview,setNativeCaptionPreview] = useState(false);
  const guidance = edits.captionGuidance ?? DEFAULT_GUIDANCE;
  const [tool, setTool] = useState<"trim" | "captions" | "details">("trim");
  const [inspector, setInspector] = useState<"captions" | "details">("captions");
  const [playing, setPlaying] = useState(false), [loopSelection, setLoopSelection] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1), [previewVolume, setPreviewVolume] = useState(1);
  const [contextSeconds, setContextSeconds] = useState(1), [reviewMode, setReviewMode] = useState<"source" | "selection" | "context">("source");
  const [lastContext, setLastContext] = useState<{ start: number; end: number } | null>(null);
  const [pipSupported, setPipSupported] = useState(false), [modelCache, setModelCache] = useState("Checking local model cache…");
  const reviewBounds = useRef<{ start: number; end: number; kind: "selection" | "context" } | null>(null);
  const loopRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [status, setStatus] = useState<Status>("IDLE");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [recentProjects, setRecentProjects] = useState<SavedProjectSummary[]>([]);
  const [projectPendingDelete, setProjectPendingDelete] = useState<SavedProjectSummary | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const [historyMessage, setHistoryMessage] = useState("");
  const [savedSnapshot, setSavedSnapshot] = useState<{ id: string; revision: number; output: Result | null;mediaAssets:Record<string,Blob> } | null>(null);
  const [saveStatus, setSaveStatus] = useState("Not saved yet");
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [sceneScanStatus, setSceneScanStatus] = useState<StepStatus>("waiting");
  const [sceneScanMessage, setSceneScanMessage] = useState("");
  const [captionScope, setCaptionScope] = useState<"selection" | "source">("selection");
  const [captionWorking, setCaptionWorking] = useState(false);
  const [snapToCuts, setSnapToCuts] = useState(false);
  const [forceFFmpeg, setForceFFmpeg] = useState(false);
  const [steps, setSteps] = useState<Steps>({ upload: "waiting", trimming: "waiting", sceneDetection: "waiting", captions: "waiting" });
  const [processingElapsed, setProcessingElapsed] = useState(0);
  const [stepMessages, setStepMessages] = useState<Partial<Record<keyof Steps, string>>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [frameMessage, setFrameMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const { seek: queuedSeek, cancel: cancelSeek } = useCoalescedSeek(videoRef, objectUrl, duration);
  const operation = useRef<{ id: number; controller: AbortController } | null>(null);
  const generation = useRef(0), frameRequest = useRef(0);
  const mounted = useRef(true);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const persistRef = useRef<(() => Promise<void>) | null>(null);
  const busy = storageWorking || projectWorking || status === "PROCESSING" || sceneScanStatus === "working" || captionWorking;
  const [sourceCaptionsUrl, setSourceCaptionsUrl] = useState<string>();
  useEffect(() => {
    const url = captionCues.length ? URL.createObjectURL(new Blob([serializeCaptions(captionCues)], { type: "text/vtt" })) : undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize the native caption-track resource with editable cues.
    setSourceCaptionsUrl(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [captionCues]);
  const mappedOutputCues = useMemo(() => edits.assembly?.enabled?assemblyCaptions(edits.assembly):mapCuesToOutput(captionCues, edits.ranges), [captionCues, edits.ranges,edits.assembly]);
  const outputCues = useMemo(() => mappedOutputCues.filter((cue) => cue.text.trim() && isSubtitleInterval(cue.start, cue.end)), [mappedOutputCues]);
  const shortCaptionIntersections = mappedOutputCues.filter((cue) => cue.text.trim() && !isSubtitleInterval(cue.start, cue.end)).length;
  const previewSrc = objectUrl;
  const activeCueId = captionCues.find((cue) => currentTime >= cue.start && currentTime < cue.end)?.id;
  const reviewIssues = useMemo(() => captionIssues(captionCues, edits.ranges, guidance).filter((issue) => !issue.acknowledged), [captionCues, edits.ranges, guidance]);
  const displayedSaveStatus = saveStatus.startsWith("Save failed") || saveStatus === "Saving…" ? saveStatus : savedSnapshot && savedSnapshot.id === identity?.id && savedSnapshot.revision === revision && savedSnapshot.output === result && savedSnapshot.mediaAssets===assemblyMedia ? "Saved in this browser" : metadata ? "Changes waiting to save…" : saveStatus;
  const checkModelCache = useCallback(async () => {
    try {
      if (!("caches" in window)) { setModelCache("Model caching is unavailable in this browser."); return; }
      const names = await caches.keys();
      if (!names.includes("transformers-cache")) { setModelCache("English model is not downloaded yet."); return; }
      const cache = await caches.open("transformers-cache"), keys = await cache.keys();
      const urls = keys.map((key) => key.url).filter((url) => url.includes("onnx-community/whisper-tiny.en"));
      setModelCache(urls.some((url) => url.includes("encoder_model_quantized.onnx")) && urls.some((url) => url.includes("decoder_model_merged_quantized.onnx")) ? "English model weights are cached on this device." : urls.length ? "Some English model files are cached; remaining files download on use." : "English model is not downloaded yet.");
    } catch { setModelCache("Could not inspect the local model cache; valid cached files are still reused."); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- Detect browser capabilities after hydration.
  useEffect(() => { setPipSupported(Boolean(document.pictureInPictureEnabled)); void checkModelCache(); }, [checkModelCache]);
  const statusCopy = status === "PROCESSING" ? "Exporting on your device" : status === "FAILED" ? "Export needs attention" : result ? result.revision === revision ? "Latest export ready" : "Earlier export available" : null;
  const edit = useCallback((value: EditDecisions, action: string, group?: string) => dispatch({ type: "edit", value, action, group }), []);
  const refreshHistory = useCallback(async () => {
    try { const projects = await listSavedProjects(); if (mounted.current) setRecentProjects(projects); }
    catch (error) { if (mounted.current) setHistoryMessage(error instanceof Error ? error.message : "Could not load saved projects."); }
  }, [setRecentProjects,setHistoryMessage]);
  const cancelOperation = useCallback(() => {
    generation.current += 1;
    operation.current?.controller.abort(); operation.current = null;storageOperation.current?.abort();setClipOutputs(previous=>previous.map(o=>o.status==="waiting"||o.status==="working"?{...o,status:"cancelled",message:"Queue stopped; completed outputs remain available"}:o));
    setStatus("IDLE"); setProjectWorking(false); setProjectProgress(""); setCaptionWorking(false); setSceneScanStatus((value) => value === "working" ? "waiting" : value);
    setSceneScanMessage(""); setProgress("Cancelled. Your edit and previous export are preserved.");
    setSteps((previous) => Object.fromEntries(Object.entries(previous).map(([key, value]) => [key, value === "working" ? "waiting" : value])) as Steps);
  }, [setClipOutputs,setStatus,setCaptionWorking,setSceneScanStatus,setSceneScanMessage,setProgress,setSteps,setProjectWorking,setProjectProgress]);
  const beginOperation = () => {
    operation.current?.controller.abort();
    setProcessingElapsed(0);
    const job = { id: ++generation.current, controller: new AbortController() };
    operation.current = job; return job;
  };
  const isCurrent = (job: { id: number; controller: AbortController }) => mounted.current && generation.current === job.id && !job.controller.signal.aborted;
  const buildSavedProject = useCallback((): SavedProject | null => {
    if (!file || !identity || !metadata || !edits.ranges.length) return null;
    return { id: identity.id, sourceBytes:file.size,outputBytes:result?.videoBlob.size,title:edits.projectTitle?.trim()||file.name, fileName: file.name, createdAt: identity.createdAt, updatedAt: Date.now(), schemaVersion: 2,
      sourceVideo: file, sourceIsExport: !identity.sourceAvailable, sourceDuration: duration,
      images:edits.images,titles:edits.titles,assembly:edits.assembly,mediaAssets:assemblyMedia,clips:edits.clips,framing:edits.framing,audioAdjustments:edits.audioAdjustments,ranges:edits.ranges, trimStart:edits.ranges[0].start, trimEnd:edits.ranges[0].end, rangeId: edits.ranges[0].id, captions: captionCues, captionGuidance: guidance, captionStyle, captionDelivery, exportPreferences, revision, video: result?.videoBlob, exportRevision: result?.revision, exportId: result?.artifactId, exportSettings: result?.settings, exportMetadata:result?.metadata,
      exportTrimStart: result?.trimStart, exportTrimEnd: result?.trimEnd,
      exportCaptionsVtt: result?.captionsVtt ?? null, captionError: result?.captionError,
      includeSceneDetection, sceneDetectionSucceeded: scenesDetected,
      captionsVtt: captionCues.length ? serializeCaptions(captionCues) : null, captionTimebase: "source",
      sceneCuts, sceneAnalysis: edits.sceneAnalysis, sceneSettings, dismissedCuts: edits.dismissedCuts, editorialMarkers,
      sceneMarkers: sceneTimes, markerTimebase: "source", duration: result?.duration ?? sequenceLength };
  }, [file, identity, metadata, assemblyMedia,edits.images,edits.titles,edits.assembly,edits.clips,edits.framing,edits.audioAdjustments,edits.projectTitle, edits.ranges, sequenceLength,duration, revision, result, includeSceneDetection, scenesDetected, captionCues, sceneTimes, guidance, sceneCuts, edits.sceneAnalysis, sceneSettings, edits.dismissedCuts, editorialMarkers, captionStyle, captionDelivery, exportPreferences]);
  const persist = useCallback(async () => {
    const project = buildSavedProject();
    if (!project) return;
    setSaveStatus("Saving…");
    const pending = saveQueue.current.catch(() => {}).then(() => saveProject(project));
    saveQueue.current = pending;
    try {
      await pending;
      if (mounted.current) { setSavedSnapshot({ id: project.id, revision: project.revision ?? 0, output: result,mediaAssets:assemblyMedia }); setSaveStatus("Saved in this browser"); setHistoryMessage(""); await refreshHistory(); }
    } catch (error) {
      if (mounted.current) { setSaveStatus("Save failed — work remains in this tab"); setHistoryMessage(error instanceof Error ? error.message : "Local saving failed. Keep this tab open, download the source and export, then free browser storage and retry."); }
      throw error;
    }
  }, [setSaveStatus,setSavedSnapshot,setHistoryMessage,assemblyMedia,buildSavedProject, refreshHistory, result]);
  useEffect(() => { persistRef.current = persist; }, [persist]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void persist().catch(() => {}); }, 600);
    return () => window.clearTimeout(timer);
  }, [persist, saveAttempt]);
  useEffect(() => {
    let active = true;
    void listSavedProjects().then((projects) => { if (active) setRecentProjects(projects); }).catch((error: unknown) => { if (active) setHistoryMessage(error instanceof Error ? error.message : "Could not load saved projects."); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    mounted.current = true;
    const visibility = () => { if (document.visibilityState === "hidden") void persistRef.current?.().catch(() => {}); };
    document.addEventListener("visibilitychange", visibility);
    return () => { mounted.current = false; generation.current++; operation.current?.controller.abort(); document.removeEventListener("visibilitychange", visibility); void persistRef.current?.().catch(() => {}); };
  }, []);
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.videoUrl); }, [result]);
  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;
    if (projectPendingDelete && !dialog.open) dialog.showModal();
    else if (!projectPendingDelete && dialog.open) dialog.close();
  }, [projectPendingDelete]);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = window.setInterval(() => setProcessingElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    const video = videoRef.current;
    if (video) { video.playbackRate = playbackRate; video.volume = previewVolume; }
    // Initial media element settings; changes are handled by the transport and native events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectUrl]);
  const handleFileSelected = async (selected: File) => {
    cancelOperation(); cancelSeek(); reviewBounds.current = null; setPlaying(false); setReviewMode("source"); setLastContext(null); frameRequest.current++;
    setFrameMessage(""); setCaptionScope("selection"); setSnapToCuts(false); setForceFFmpeg(false); setSceneScanStatus("waiting"); setStepMessages({});
    const id = crypto.randomUUID();
    setIdentity({ id, createdAt: Date.now(), sourceAvailable: true });
    setAssemblyMedia({});setClipOutputs([]);setSequencePreview(null);setSelectedRange(0);setFile(selected); setObjectUrl(URL.createObjectURL(selected)); setMetadata(null); setResult(null);
    dispatch({ type: "reset", value: { ranges: [], captions: [], sceneMarkers: [], scenesDetected: false, includeSceneDetection: false } });
    setCurrentTime(0); setErrorMessage(null); setHistoryMessage(""); setSaveStatus("Checking source…");
    setProgress("Checking the video container and tracks…");
    const importGeneration = generation.current;
    try {
      const source = await probeMedia(selected);
      if (!mounted.current || generation.current !== importGeneration) return;
      setMetadata(source);
      dispatch({ type: "reset", value: { ranges: [{ id: crypto.randomUUID(), sourceId: id, start: 0, end: source.duration }], captions: [], sceneMarkers: [], scenesDetected: false, includeSceneDetection: false } });
      setSteps({ upload: "complete", trimming: "waiting", sceneDetection: "skipped", captions: "skipped" });
      setProgress("Source ready. The out point is excluded from the selection.");
    } catch (error) {
      if (generation.current === importGeneration) { setErrorMessage(error instanceof Error ? error.message : "This video could not be read. Choose a supported video."); setSaveStatus("Source not validated"); setProgress(""); }
    }
  };
  const updateCaptionCues = useCallback((nextCues: CaptionCue[], group?: string, action = "Edit captions") => edit({ ...edits, captions: nextCues }, action, group), [edit, edits]);
  const updateGuidance = useCallback((captionGuidance: CaptionGuidance) => edit({ ...edits, captionGuidance }, "Change caption guidance", "caption-guidance"), [edit, edits]);
  const updateCaptionStyle = useCallback((style:CaptionStyle,action:string,group?:string)=>edit({...edits,captionStyle:style},action,group),[edit,edits]);
  const onCaptionPreviewError = useCallback((message:string)=>setFrameMessage(previous=>message?"Caption preview: "+message:previous.startsWith("Caption preview:")?"":previous),[setFrameMessage]);
  const onImagePreviewError=useCallback((message:string)=>setFrameMessage(previous=>message?"Image preview: "+message:previous.startsWith("Image preview:")?"":previous),[setFrameMessage]);
  const getPlayhead = useCallback(() => videoRef.current?.currentTime ?? 0, []);
  const handleProcess = async (previewOnly=false) => {
    if (!file || !metadata || !spec) return;
    if(edits.assembly?.enabled){await exportAssembly(previewOnly);return;}
    if (metadata.hdr && (edits.ranges.length!==1 || trimStart !== 0 || trimEnd !== duration || forceFFmpeg || burnCaptions || outputTitles.length>0 || outputImageRender.length>0 || spec.reencode)) { setErrorMessage("HDR re-encoding is unavailable until color-preserving rendering is verified. Choose Match source, subtitle files and the unchanged full range to preserve the original HDR file."); return; }
    if(outputImageRender.some(image=>!image.blob)){setErrorMessage("Relink missing images before rendering.");return;}
    const invalid = validateSequence(edits.ranges,identity?.id??"",duration,metadata?.frameRate);
    if (invalid) { setErrorMessage(invalid); return; }
    if(burnCaptions && !outputCues.length){setErrorMessage("There are no deliverable captions in the selection. Add or import captions, or choose subtitle-file delivery.");return;}
    const job = beginOperation(), snapshotRevision = revision;
    setStatus("PROCESSING"); setErrorMessage(null); setProgress("Preparing export…");
    setSteps({ upload: "complete", trimming: "working", sceneDetection: "skipped", captions: "skipped" });
    setStepMessages({ upload: "Source ready", captions: burnCaptions?"Edited captions are rendered with the video; transcription is not rerun":"Edited captions are delivered as subtitle files; transcription is not rerun" });
    try {
      const processed = await processLocally(file, trimStart, trimEnd, (phase, phaseStatus, message) => {
        if (!isCurrent(job)) return;
        setSteps((previous) => ({ ...previous, [phase]: phase === "trimming" && phaseStatus === "complete" ? "working" : phaseStatus }));
        setStepMessages((previous) => ({ ...previous, [phase]: message })); setProgress(message);
      }, { sceneDetection: false, captions: false, sourceDuration: duration, ranges:edits.ranges,imageRender:outputImageRender,titleRender:outputTitles.length?outputTitles:undefined, outputSpec:spec, signal: job.controller.signal, forceFFmpeg, captionRender:burnCaptions?{cues:outputCues,style:captionStyle}:undefined }, scenesDetected ? sceneTimes : undefined);
      if (!isCurrent(job)) return;
      setProgress("Checking exported tracks, duration and playback…");
      setSteps((previous) => ({ ...previous, trimming: "working" }));
      setStepMessages((previous) => ({ ...previous, trimming: "Validating the exported file…" }));
      const measured = await validateOutput(processed.video, {...metadata,width:spec.width,height:spec.height,hasAudio:spec.audio}, sequenceLength, job.controller.signal);
      if (!isCurrent(job)) return;
      if(previewOnly){setSequencePreview({url:URL.createObjectURL(processed.video),revision:snapshotRevision,captions:!burnCaptions&&outputCues.length?serializeCaptions(outputCues):null});setStatus("IDLE");setProgress("Rendered sequence preview ready. It uses the current export settings.");return;}
      setResult({ videoUrl: URL.createObjectURL(processed.video), videoBlob: processed.video, artifactId: crypto.randomUUID(), settings: {images:outputImageRender.map(({blob:_blob,...image})=>{void _blob;return image;}),titles:outputTitles,framing,audioAdjustments,fileName:outputFileName(outputStem,exportPreferences), width: spec.width, height: spec.height, audio: spec.audio, preferences:exportPreferences, timing: "source", captions: captionDelivery, captionStyle:burnCaptions?captionStyle:undefined, processor: forceFFmpeg ? "ffmpeg" : "automatic" }, sceneMarkers: sceneTimes.flatMap(time=>sourceOccurrences(time,identity?.id??"",edits.ranges).map(hit=>hit.sequenceTime)),
        revision: snapshotRevision, trimStart, trimEnd, duration: measured.duration, metadata: measured,
        captionsVtt: outputCues.length ? serializeCaptions(outputCues) : null });
      setStatus("COMPLETE"); setSteps((previous) => ({ ...previous, trimming: "complete" }));
      setProgress("Export ready. Continue editing the source; this file stays available until the next export succeeds.");
    } catch (error) {
      if (!isCurrent(job)) return;
      setStatus("FAILED"); setErrorMessage(error instanceof Error ? error.message : "Export failed. Try the compatible processor or a shorter selection.");
      setSteps((previous) => ({ ...previous, trimming: "failed" }));
    } finally { if (isCurrent(job)) operation.current = null; }
  };
  const updateSceneCuts = (cuts:SceneCut[],action:string,removed?:SceneCut) => {
    const sorted = [...cuts].sort((a,b)=>a.time-b.time);
    edit({ ...edits, sceneCuts:sorted, sceneMarkers:sorted.map(cut=>cut.time), scenesDetected:true,
      dismissedCuts:removed?[...(edits.dismissedCuts??[]),removed.bracket??{start:removed.time-.15,end:removed.time+.15}]:edits.dismissedCuts },action);
  };
  const overlayStart=async()=>{const time=Math.max(0,Math.min(videoRef.current?.currentTime??currentTime,duration));return time>=duration-.000001&&file?(await lastIncludedFrame(file,duration)??Math.max(0,duration-(metadata?.frameRate?1/metadata.frameRate:.000001))):time;};
  const addTitle=async()=>{if(busy||!metadata||(edits.titles?.length??0)>=10)return;const job=beginOperation();setProjectWorking(true);setProjectProgress("Locating the displayed source frame…");try{const start=await overlayStart();if(!isCurrent(job))return;edit({...edits,titles:[...(edits.titles??[]),{id:Math.max(0,...(edits.titles??[]).map(title=>title.id))+1,start,end:Math.min(duration,start+3),text:"Your title",style:{...DEFAULT_CAPTION_STYLE,size:7,bold:true,position:"top"}}]},"Add title");setProjectProgress("");}catch(error){if(isCurrent(job))setErrorMessage(error instanceof Error?error.message:"Title could not be added.");}finally{if(isCurrent(job)){operation.current=null;setProjectWorking(false);}}};
  const addImage=async(selected:File)=>{
    if(busy||!metadata)return;const job=beginOperation();setProjectWorking(true);setProjectProgress("Decoding local image…");setErrorMessage(null);
    try{
      const start=await overlayStart();
      if((edits.images?.length??0)>=5)throw new Error("Use no more than five image overlays.");
      if(!selected.size||selected.size>2*1024*1024)throw new Error("Use an image up to 2 MB.");
      const mime=await imageMime(selected);
      if(!mime)throw new Error("Choose an actual PNG, JPEG or WebP image.");
      const image=new File([selected],selected.name,{type:mime}),bitmap=await createImageBitmap(image);let dimensions:{width:number;height:number};
      try{if(bitmap.width>4096||bitmap.height>4096||bitmap.width*bitmap.height>8_388_608)throw new Error("Use an image up to 4096 pixels per edge and 8 megapixels.");dimensions={width:bitmap.width,height:bitmap.height};}finally{bitmap.close();}
      const fingerprint=await fingerprintSource(image,job.controller.signal);if(!isCurrent(job))return;
      const overlay:ImageOverlay={id:crypto.randomUUID(),assetId:"image:"+fingerprint,start,end:Math.min(duration,start+3),x:80,y:20,size:20,opacity:1,reference:{kind:"image",fileName:selected.name.slice(0,255),mime,bytes:image.size,fingerprint,algorithm:"sha256-chunks-4m-v1",metadata:dimensions}};
      setAssemblyMedia(previous=>({...previous,[fingerprint]:image}));edit({...edits,images:[...(edits.images??[]),overlay]},"Add image overlay");setProjectProgress("Local image verified and added.");
    }catch(error){if(isCurrent(job))setErrorMessage(error instanceof Error?error.message:"Image could not be added.");}
    finally{if(isCurrent(job)){operation.current=null;setProjectWorking(false);}}
  };
  const relinkImage=async(image:ImageOverlay,selected:File)=>{
    if(busy)return;const job=beginOperation();setProjectWorking(true);setProjectProgress("Verifying image contents…");setErrorMessage(null);
    try{await verifyImageRelink(image.reference,selected,job.controller.signal);if(isCurrent(job)){setAssemblyMedia(previous=>({...previous,[image.reference.fingerprint]:selected}));setSaveAttempt(value=>value+1);setProjectProgress("Image contents match; the layer is ready to render.");}}
    catch(error){if(isCurrent(job))setErrorMessage(error instanceof Error?error.message:"Image does not match.");}
    finally{if(isCurrent(job)){operation.current=null;setProjectWorking(false);}}
  };
  const addAssemblySource=async(selected:File,primary=false)=>{
    if(busy||!identity)return;
    const job=beginOperation();setProjectWorking(true);setErrorMessage(null);setProjectProgress("Reading assembly source metadata…");
    try{
      const source=await probeMedia(selected,job.controller.signal);
      const fingerprint=await fingerprintSource(selected,job.controller.signal,progress=>{if(isCurrent(job))setProjectProgress("Verifying local source… "+Math.round(progress*100)+"%");});
      if(!isCurrent(job))return;
      const previous=edits.assembly,existing=previous?.sources.find(s=>s.reference.fingerprint===fingerprint&&Boolean(s.primary)===primary),physical=previous?.sources.find(s=>s.reference.fingerprint===fingerprint);
      if(!existing&&(previous?.sources.length??0)>=4)throw new Error("Use no more than four assembly sources.");
      const id=existing?.id??crypto.randomUUID();
      const reference={fileName:selected.name.slice(0,255),mime:selected.type,bytes:selected.size,fingerprint,algorithm:"sha256-chunks-4m-v1" as const,kind:primary&&!identity.sourceAvailable?"saved-export" as const:"original" as const,metadata:source};
      const assetId=existing?.assetId??physical?.assetId??(primary?identity.sourceAssetId??identity.id:"media:"+fingerprint);
      const sources=existing?previous!.sources:[...(previous?.sources??[]),{primary,id,assetId,reference,captions:primary?structuredClone(captionCues):[],images:primary?structuredClone(edits.images??[]):[],titles:primary?structuredClone(edits.titles??[]):[],markers:primary?structuredClone(editorialMarkers):[],sceneMarkers:primary?[...sceneTimes]:[]}];
      const ranges=[...(previous?.ranges??[]),{id:crypto.randomUUID(),sourceId:id,start:primary?trimStart:0,end:primary?trimEnd:source.duration}];
      if(ranges.length>100)throw new Error("Keep no more than 100 assembly ranges.");
      setAssemblyMedia(previous=>({...previous,[fingerprint]:selected}));
      edit({...edits,assembly:{enabled:true,sources,ranges}},"Add assembly source");
      setProjectProgress("Source verified and added. Assembly export is now enabled.");
    }catch(error){if(isCurrent(job))setErrorMessage(error instanceof Error?error.message:"Source could not be added.");}
    finally{if(isCurrent(job)){operation.current=null;setProjectWorking(false);}}
  };
  const relinkAssemblySource=async(source:AssemblySource,selected:File)=>{
    if(busy)return;const job=beginOperation();setProjectWorking(true);setProjectProgress("Verifying missing source…");setErrorMessage(null);
    try{const actual=await probeMedia(selected,job.controller.signal);await verifyRelink({source:source.reference} as ProjectBackup,selected,actual,job.controller.signal);if(isCurrent(job)){setAssemblyMedia(previous=>({...previous,[source.reference.fingerprint]:selected}));setSaveAttempt(value=>value+1);setProjectProgress("Source matches and is ready to render.");}}
    catch(error){if(isCurrent(job))setErrorMessage(error instanceof Error?error.message:"Source does not match.");}
    finally{if(isCurrent(job)){operation.current=null;setProjectWorking(false);}}
  };
  const exportAssembly=async(previewOnly=false)=>{
    if(!edits.assembly||!metadata||!spec||busy)return;if(outputImageRender.some(image=>!image.blob)){setErrorMessage("Relink missing assembly images before rendering.");return;}const error=validateAssembly(edits.assembly);if(error){setErrorMessage(error);return;}
    if(burnCaptions&&!outputCues.length){setErrorMessage("No deliverable captions in the assembly. Add source subtitles or choose subtitle-file delivery.");return;}
    const job=beginOperation(),snapshotRevision=revision;setStatus("PROCESSING");setErrorMessage(null);setProgress("Preparing multiple-source assembly…");setSteps({upload:"complete",trimming:"working",sceneDetection:"skipped",captions:"skipped"});
    try{
      const blob=await processAssembly(structuredClone(edits.assembly),assemblyMedia,spec,message=>{if(isCurrent(job)){setProgress(message);setStepMessages(previous=>({...previous,trimming:message}));}},job.controller.signal,burnCaptions?{cues:outputCues,style:captionStyle}:undefined,outputTitles.length?outputTitles:undefined,outputImageRender,forceFFmpeg);
      const measured=await validateOutput(blob,{...metadata,width:spec.width,height:spec.height,hasAudio:spec.audio},sequenceLength,job.controller.signal);if(!isCurrent(job))return;
      const captions=outputCues.length?serializeCaptions(outputCues):null;
      if(previewOnly)setSequencePreview({url:URL.createObjectURL(blob),revision:snapshotRevision,captions:burnCaptions?null:captions});
      else setResult({videoUrl:URL.createObjectURL(blob),videoBlob:blob,artifactId:crypto.randomUUID(),revision:snapshotRevision,trimStart:0,trimEnd:sequenceLength,duration:measured.duration,metadata:measured,captionsVtt:captions,sceneMarkers:assemblyMarkers(edits.assembly).cuts,settings:{images:outputImageRender.map(({blob:_blob,...image})=>{void _blob;return image;}),titles:outputTitles,framing,audioAdjustments,width:spec.width,height:spec.height,audio:spec.audio,preferences:exportPreferences,timing:"source",captions:captionDelivery,captionStyle:burnCaptions?captionStyle:undefined,fileName:outputFileName(outputStem,exportPreferences),processor:forceFFmpeg?"ffmpeg":"automatic"}});
      setStatus(previewOnly?"IDLE":"COMPLETE");setSteps(previous=>({...previous,trimming:"complete"}));setProgress(previewOnly?"Assembly preview verified.":"Assembly export verified; original sources and decisions remain editable.");
    }catch(error){if(isCurrent(job)){setStatus("FAILED");setErrorMessage(error instanceof Error?error.message:"Assembly export failed; previous files are preserved.");setSteps(previous=>({...previous,trimming:"failed"}));}}
    finally{if(isCurrent(job))operation.current=null;}
  };
  const captureFrame=async(composed:boolean)=>{
    if(!file||!metadata||!spec||busy)return;
    const job=beginOperation();setProjectWorking(true);setProjectProgress("Decoding the selected source frame…");
    let input:import("mediabunny").Input|null=null;
    try{
      const {Input,BlobSource,ALL_FORMATS,CanvasSink}=await import("mediabunny");
      const {drawFramed}=await import("@/lib/adjustments");const {drawTitles}=await import("@/lib/title-tools");const {drawCaptions,loadCaptionFont}=await import("@/lib/caption-renderer");
      input=new Input({source:new BlobSource(file),formats:ALL_FORMATS});const abort=()=>input?.dispose();job.controller.signal.addEventListener("abort",abort,{once:true});
      try{
       const track=await input.getPrimaryVideoTrack();if(!track||!await track.canDecode())throw new Error("Source frame capture is unavailable for this codec.");
       const frame=await new CanvasSink(track,{poolSize:1}).getCanvas(videoRef.current?.currentTime??currentTime);if(!frame)throw new Error("No source frame is available at this time.");
       job.controller.signal.throwIfAborted();const canvas=document.createElement("canvas");canvas.width=composed?spec.width:frame.canvas.width;canvas.height=composed?spec.height:frame.canvas.height;const ctx=canvas.getContext("2d")!;
       if(composed){drawFramed(ctx,(context,x,y,w,h)=>context.drawImage(frame.canvas,x,y,w,h),frame.canvas.width,frame.canvas.height,canvas.width,canvas.height,framing);const imageLayers=await loadImageLayers(primaryImageRender);try{drawImageLayers(ctx,imageLayers,frame.timestamp,canvas.width,canvas.height);}finally{closeImageLayers(imageLayers);}await loadCaptionFont(captionStyle.font);for(const title of edits.titles??[])await loadCaptionFont(title.style.font);drawTitles(ctx,edits.titles??[],frame.timestamp,canvas.width,canvas.height);drawCaptions(ctx,captionCues,frame.timestamp,canvas.width,canvas.height,captionStyle);}else ctx.drawImage(frame.canvas,0,0);
       const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("The browser could not encode this image.")),"image/png"));
       if(!isCurrent(job))return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=outputStem+"-"+(composed?"composed":"source")+"-"+frame.timestamp.toFixed(3)+".png";a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setProjectProgress("Frame download started at decoded source time "+formatPreviewTime(frame.timestamp)+".");
      }finally{job.controller.signal.removeEventListener("abort",abort);}
    }catch(error){if(isCurrent(job))setErrorMessage(error instanceof Error?error.message:"Frame capture failed.");}
    finally{input?.dispose();if(isCurrent(job)){operation.current=null;setProjectWorking(false);}}
  };
  const exportClips=async()=>{
    if(!file||!metadata||busy)return;
    const clips=structuredClone(edits.clips?.filter(c=>c.selected)??[]),snapshot=structuredClone(edits),snapshotRevision=revision;
    if(!clips.length)return;
    const job=beginOperation();setProjectWorking(true);setErrorMessage(null);
    setClipOutputs(previous=>[...previous.filter(o=>!clips.some(c=>c.id===o.id)),...clips.map(c=>({...previous.find(o=>o.id===c.id),id:c.id,status:"waiting" as const,message:"Captured for export",revision:snapshotRevision}))]);
    const update=(id:string,value:Partial<ClipOutput>)=>{if(isCurrent(job))setClipOutputs(previous=>previous.map(o=>o.id===id?{...o,...value}:o));};
    try{for(const clip of clips){
      if(!isCurrent(job))break;
      const controller=new AbortController();clipJobRef.current=controller;
      const abort=()=>controller.abort();job.controller.signal.addEventListener("abort",abort,{once:true});
      update(clip.id,{status:"working",message:"Preparing clip"});
      try{
        const invalid=validateRange(clip.range.start,clip.range.end,duration,metadata.frameRate);if(invalid)throw new Error(invalid);
        const clipSpec=outputSpec(metadata.width,metadata.height,metadata.hasAudio,clip.preferences,clip.framing,snapshot.audioAdjustments??DEFAULT_AUDIO);
        if(metadata.hdr)throw new Error("Queued HDR re-encoding is unavailable; preserve the unchanged source instead.");
        const cues=mapCuesToOutput(snapshot.captions,[clip.range]).filter(c=>c.text.trim()&&isSubtitleInterval(c.start,c.end));
        if(snapshot.captionDelivery!=="sidecar"&&snapshot.captionDelivery!==undefined&&!cues.length)throw new Error("No deliverable captions in this clip. Choose subtitle-file delivery or revise the range.");
        const burn=snapshot.captionDelivery==="burned"||snapshot.captionDelivery==="both";
        const processed=await processLocally(file,clip.range.start,clip.range.end,(_phase,_status,message)=>{update(clip.id,{message});if(isCurrent(job))setProjectProgress(clip.name+": "+message);},{sourceDuration:duration,imageRender:bindImages(mapCuesToOutput(snapshot.images??[],[clip.range]),assemblyMedia),titleRender:mapCuesToOutput(snapshot.titles??[],[clip.range]),sceneDetection:false,captions:false,outputSpec:clipSpec,signal:controller.signal,forceFFmpeg,captionRender:burn?{cues,style:snapshot.captionStyle??DEFAULT_CAPTION_STYLE}:undefined});
        await validateOutput(processed.video,{...metadata,width:clipSpec.width,height:clipSpec.height,hasAudio:clipSpec.audio},clip.range.end-clip.range.start,controller.signal);
        if(!isCurrent(job))break;
        const old=clipUrlsRef.current.get(clip.id);if(old)URL.revokeObjectURL(old);
        const url=URL.createObjectURL(processed.video);clipUrlsRef.current.set(clip.id,url);
        update(clip.id,{status:"complete",exportRevision:snapshotRevision,message:"Playable output verified",url,fileName:outputFileName(projectFileStem(clip.name),clip.preferences),captions:cues.length?serializeCaptions(cues):undefined});
      }catch(error){update(clip.id,{status:controller.signal.aborted?"cancelled":"failed",message:error instanceof Error?error.message:"Clip export failed."});}
      finally{job.controller.signal.removeEventListener("abort",abort);if(clipJobRef.current===controller)clipJobRef.current=null;}
    }}finally{if(isCurrent(job)){operation.current=null;setProjectWorking(false);setProjectProgress("Clip queue finished. Review each result before delivery.");}}
  };
  const updateEditorialMarkers = useCallback((markers:EditorialMarker[],action:string,group?:string) => edit({...edits,editorialMarkers:markers},action,group),[edit,edits]);
  const detectSceneCuts = async (replace = false) => {
    if (!file || !metadata || !identity) return;
    if ((scenesDetected || edits.sceneAnalysis) && !window.confirm(replace ? "Replace all cuts and dismissed candidates in the scan area? Cuts outside the area and editorial notes remain. Undo can restore your reviewed cuts." : "Rescan this area? Unreviewed candidates will refresh; manual, confirmed and dismissed cuts will be preserved. Undo can restore the previous scan.")) return;
    const job = beginOperation();
    const start = sceneSettings.scope === "source" ? 0 : trimStart, end = sceneSettings.scope === "source" ? duration : trimEnd;
    setSceneScanStatus("working"); setSceneScanMessage("Preparing source scene scan…"); setErrorMessage(null);
    setSteps({ upload:"complete",trimming:"skipped",sceneDetection:"working",captions:"skipped" });
    try {
      const detected = await analyzeScenes(file,identity.id,duration,start,end,sceneSettings,message => {if(isCurrent(job)){setSceneScanMessage(message);setStepMessages(previous=>({...previous,sceneDetection:message}));}},job.controller.signal);
      if (!isCurrent(job)) return;
      const checkedEnd = detected.analysis.complete ? end : detected.analysis.coverageEnd;
      const cuts = mergeSceneScan(sceneCuts,detected.cuts,start,checkedEnd,replace,edits.dismissedCuts);
      edit({...edits,sceneMarkers:cuts.map(cut=>cut.time),sceneCuts:cuts,sceneAnalysis:detected.analysis,sceneSettings,
        dismissedCuts:replace?(edits.dismissedCuts??[]).filter(area=>area.start<start||area.end>=checkedEnd):edits.dismissedCuts,
        scenesDetected:true,includeSceneDetection:true},"Detect scene cuts");
      setSteps(previous=>({...previous,sceneDetection:"complete"}));setSceneScanStatus("complete");
      setSceneScanMessage(detected.cuts.length+" candidates found; "+cuts.length+" cuts retained. "+(detected.analysis.complete?"Sampled scan area completed.":"Partial scan; check the coverage record.")+" Review candidates before relying on them.");
    } catch(error) {
      if(isCurrent(job)){setSteps(previous=>({...previous,sceneDetection:"failed"}));setSceneScanStatus("failed");const message=error instanceof Error?error.message:"Scene analysis failed; previous cuts are preserved.";setSceneScanMessage(message);setErrorMessage(message);}
    } finally {if(isCurrent(job))operation.current=null;}
  };
  const generateCaptions = async () => {
    if (!file || !metadata) return;
    if (!metadata.hasAudio) { setProgress("This source has no audio track. Trimming and video export remain available."); return; }
    const captionStart = captionScope === "source" ? 0 : trimStart, captionEnd = captionScope === "source" ? duration : trimEnd;
    if (captionCues.length && !window.confirm("Replace current captions with a new transcription of " + (captionScope === "source" ? "the full source" : "the selection") + "? Undo can recover your corrections. Cancel to keep them.")) return;
    const job = beginOperation();
    setCaptionWorking(true); setErrorMessage(null); setProgress("Preparing captions…");
    setSteps({ upload: "complete", trimming: "skipped", sceneDetection: "skipped", captions: "working" });
    try {
      const vtt = await transcribeLocally(file, captionStart, captionEnd, (message) => {
        if (isCurrent(job)) { setProgress(message); setStepMessages((previous) => ({ ...previous, captions: message })); }
      }, job.controller.signal);
      if (!isCurrent(job)) return;
      const cues = parseCaptions(vtt).map((cue) => ({ ...cue, start: cue.start + captionStart, end: cue.end + captionStart }));
      edit({ ...edits, captions: cues }, "Generate captions");
      setSteps((previous) => ({ ...previous, captions: "complete" }));
      setProgress(cues.length + " captions ready to correct. Video export is a separate action.");
    } catch (error) {
      if (isCurrent(job)) {
        const message = error instanceof Error ? error.message : "Caption generation failed; your previous captions are preserved.";
        if (error instanceof Error && error.name === "NoSpeechError") { setProgress(message + " Existing captions are preserved."); setSteps((previous) => ({ ...previous, captions: "skipped" })); }
        else { setErrorMessage(message); setSteps((previous) => ({ ...previous, captions: "failed" })); }
      }
    } finally { if (isCurrent(job)) { setCaptionWorking(false); operation.current = null; void checkModelCache(); } }
  };
  const restoreProject = async (summary: SavedProjectSummary) => {
    cancelOperation(); cancelSeek(); reviewBounds.current = null; setPlaying(false); setReviewMode("source"); setLastContext(null); frameRequest.current++;
    setFrameMessage(""); setSnapToCuts(false); setForceFFmpeg(false);
    const ticket = generation.current;
    try {
      await saveQueue.current.catch(() => {});
      const project = await loadSavedProject(summary.id), sourceVideo = project.sourceVideo ?? project.video;
      if (!sourceVideo) throw new Error("This project has no stored media.");
      const sourceAvailable = Boolean(project.sourceVideo) && !project.sourceIsExport;
      const source = await probeMedia(sourceVideo);
      if (generation.current !== ticket || !mounted.current) return;
      const sourceTimebase = sourceAvailable || project.captionTimebase === "source";
      const start = sourceTimebase ? project.trimStart ?? 0 : 0, end = sourceTimebase ? project.trimEnd ?? source.duration : source.duration;
      const restoredRanges=project.ranges?.map(range=>({...range,sourceId:project.id}))??[{id:project.rangeId??project.id+"-range",sourceId:project.id,start,end}];
      const invalid = validateSequence(restoredRanges,project.id,source.duration,source.frameRate);
      if (invalid) throw new Error("This saved selection is incompatible with its stored media. " + invalid);
      const captionOffset = project.captionTimebase !== "source" && sourceAvailable ? project.exportTrimStart ?? project.trimStart ?? 0 : 0;
      const markerOffset = project.markerTimebase !== "source" && sourceAvailable ? project.exportTrimStart ?? project.trimStart ?? 0 : 0;
      const sourceFile = new File([sourceVideo], project.fileName, { type: sourceVideo.type });
      setAssemblyMedia(project.mediaAssets??{});setClipOutputs([]);setSequencePreview(null);setSelectedRange(0);setFile(sourceFile); setObjectUrl(URL.createObjectURL(sourceFile)); setMetadata(source);
      setIdentity({ id: project.id,sourceAssetId:project.sourceAssetId??project.id, createdAt: project.createdAt, sourceAvailable });
      dispatch({ type: "reset", revision: project.revision ?? 0, value: {
        images:project.images,titles:project.titles,assembly:project.assembly,clips:project.clips?.map(clip=>({...clip,range:{...clip.range,sourceId:project.id}})),framing:project.framing,audioAdjustments:project.audioAdjustments,projectTitle:project.title,
        ranges:restoredRanges,
        captions: project.captions ?? (project.captionsVtt ? parseCaptions(project.captionsVtt).map((cue) => ({ ...cue, start: cue.start + captionOffset, end: cue.end + captionOffset })) : []),
        sceneMarkers: project.sceneMarkers.map((time) => time + markerOffset),
        sceneCuts:project.sceneCuts,sceneAnalysis:project.sceneAnalysis,sceneSettings:project.sceneSettings,
        dismissedCuts:project.dismissedCuts,editorialMarkers:project.editorialMarkers,
        scenesDetected: project.sceneDetectionSucceeded ?? project.sceneMarkers.length > 0,
        captionStyle:project.captionStyle,captionDelivery:project.captionDelivery,exportPreferences:project.exportPreferences,
        captionGuidance: project.captionGuidance, includeSceneDetection: project.includeSceneDetection ?? false } });
      setResult(project.video ? { videoUrl: URL.createObjectURL(project.video), videoBlob: project.video, artifactId: project.exportId ?? project.id + "-legacy-export", settings: project.exportSettings ?? { width: source.width, height: source.height, audio: source.hasAudio, timing: "source", captions: "sidecar", processor: "automatic" }, sceneMarkers: [],
        revision: project.exportRevision ?? 0, trimStart: project.exportTrimStart ?? start, trimEnd: project.exportTrimEnd ?? end,
        captionsVtt: project.exportCaptionsVtt ?? null, duration: project.duration,metadata:project.exportMetadata } : null);
      setCurrentTime(0); setStatus("IDLE"); setErrorMessage(null); setHistoryMessage("");
      setSaveStatus("Saved in this browser"); setSceneScanStatus("waiting"); setSceneScanMessage("");
      setSteps({ upload: "complete", trimming: "waiting", sceneDetection: "skipped", captions: "skipped" });
      setProgress(sourceAvailable ? "Restored source and editable decisions." : "This older project only retained an exported video. The original source cannot be recovered; edits use the saved export.");
    } catch (error) { if (generation.current === ticket) setHistoryMessage(error instanceof Error ? error.message : "Could not reopen the saved project."); }
  };
  const downloadProject = async (includeSource:boolean) => {
    const snapshot=buildSavedProject();if(!snapshot||!file||!metadata)return;
    const job=beginOperation();setProjectWorking(true);setProjectProgress("Preparing project backup…");
    try{
      const backup=await createBackup(snapshot,edits,metadata,file,job.controller.signal,progress=>{if(isCurrent(job))setProjectProgress("Verifying source contents… "+Math.round(progress*100)+"%");});
      if(!isCurrent(job))return;
      const blob=backupBlob(backup,includeSource?file:undefined,assemblyMedia),url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=projectFileStem(backup.title)+(includeSource?".cutmark":".cutmark.json");document.body.append(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30000);
      setProjectProgress(includeSource?"Backup download started with source media. Previous rendered MP4s are separate downloads.":"Project file download started without media. Keep the matching source video for recovery.");
    }catch(error){if(isCurrent(job))setProjectProgress(error instanceof Error?error.message:"Backup failed. The open project is preserved.");}
    finally{if(isCurrent(job)){setProjectWorking(false);operation.current=null;}}
  };
  const duplicateProject = async () => {
    const snapshot=buildSavedProject();if(!snapshot)return;const job=beginOperation();setProjectWorking(true);setProjectProgress("Duplicating saved decisions…");
    try{await persist();if(!isCurrent(job))return;const duplicate=await duplicateSavedProject(snapshot.id);if(!isCurrent(job))return;await restoreProject(duplicate);await refreshHistory();}
    catch(error){if(isCurrent(job))setProjectProgress(error instanceof Error?error.message:"Duplication failed. Your project is preserved.");}
    finally{if(isCurrent(job)){setProjectWorking(false);operation.current=null;}}
  };
  const recoverBackup = async (backup:ProjectBackup,source:Blob,mediaAssets:Record<string,Blob>={}) => {
    const job=beginOperation();setProjectWorking(true);
    try{
      await persist();if(!isCurrent(job))throw new Error("Recovery cancelled; the open project is preserved.");
      const project=restoredProject(backup,source,mediaAssets),pending=saveQueue.current.catch(()=>{}).then(()=>{job.controller.signal.throwIfAborted();return saveProject(project,job.controller.signal);});saveQueue.current=pending;await pending;
      if(!isCurrent(job))throw new Error("Recovery cancelled. The validated project remains saved separately.");
      await restoreProject(project);await refreshHistory();
    }finally{if(isCurrent(job)){setProjectWorking(false);operation.current=null;}}
  };
  const removeSavedProject = async (project: SavedProjectSummary) => {
    setDeletingProjectId(project.id);
    try { await deleteSavedProject(project.id); setRecentProjects((projects) => projects.filter((item) => item.id !== project.id)); setProjectPendingDelete(null); setHistoryMessage(""); }
    catch (error) { setHistoryMessage(error instanceof Error ? error.message : "Could not delete this project."); }
    finally { setDeletingProjectId(null); }
  };
  const seek = useCallback((time: number) => {
    frameRequest.current++; reviewBounds.current = null; setReviewMode("source");
    videoRef.current?.pause(); queuedSeek(time);
  }, [setReviewMode,queuedSeek]);
  const seekPreviewTo = async (point: "beginning" | "left" | "right") => {
    if (point !== "right" || !file) { seek(point === "beginning" ? 0 : trimStart); return; }
    const ticket = ++frameRequest.current;
    const time = await lastIncludedFrame(file, trimEnd).catch(() => null);
    if (ticket !== frameRequest.current) return;
    seek(Math.max(trimStart, time ?? trimEnd - 1 / (metadata?.frameRate ?? 30)));
    setFrameMessage(time === null ? "Out-point inspection is approximate in this browser." : "Showing the last included source frame; the out point is excluded.");
  };
  const stepFrame = async (direction: -1 | 1) => {
    if (!file || !videoRef.current) return;
    videoRef.current.pause(); reviewBounds.current = null; setReviewMode("source"); cancelSeek();
    const time = videoRef.current.currentTime, ticket = ++frameRequest.current;
    const target = await adjacentFrame(file, time, direction).catch(() => null);
    if (ticket !== frameRequest.current) return;
    seek(target ?? time + direction / (metadata?.frameRate ?? 30));
    setFrameMessage(target === null ? "Approximate frame step; this browser cannot decode individual source timestamps." : "Stepped using decoded source frame timestamps.");
  };
  const jumpToCut = (direction: "previous" | "next") => {
    const time = videoRef.current?.currentTime ?? 0;
    const target = direction === "next" ? sceneTimes.find((value) => value > time + 0.000001) : [...sceneTimes].reverse().find((value) => value < time - 0.000001);
    if (target !== undefined) seek(target);
  };
  const playRange = (start: number, end: number, kind: "selection" | "context") => {
    const video = videoRef.current;
    if (!video || end <= start) return;
    cancelSeek(); frameRequest.current++; video.pause();
    reviewBounds.current = { start, end, kind }; setReviewMode(kind);
    video.currentTime = start;
    void video.play().catch(() => { reviewBounds.current = null; setErrorMessage("Playback could not start. Check that this browser supports the source codec."); });
  };
  const previewSelection = () => playRange(trimStart, trimEnd, "selection");
  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) { video.pause(); return; }
    cancelSeek();
    if (loopRef.current) { playRange(video.currentTime >= trimStart && video.currentTime < trimEnd ? video.currentTime : trimStart, trimEnd, "selection"); if (reviewBounds.current) reviewBounds.current.start = trimStart; return; }
    const bounds = reviewBounds.current;
    if (bounds && (video.currentTime < bounds.start || video.currentTime >= bounds.end - 0.00001)) video.currentTime = bounds.start;
    void video.play().catch(() => setErrorMessage("This source could not start playback in this browser."));
  };
  const reviewContext = (point: "left" | "right") => {
    const boundary = point === "left" ? trimStart : trimEnd;
    const context = { start: Math.max(0, boundary - contextSeconds), end: Math.min(duration, boundary + contextSeconds) };
    setLastContext(context); playRange(context.start, context.end, "context");
  };
  const handleVideoPlay = () => {
    setPlaying(true);
    const video = videoRef.current, bounds = reviewBounds.current;
    if (video && loopRef.current && !bounds) { reviewBounds.current = { start: trimStart, end: trimEnd, kind: "selection" }; setReviewMode("selection"); }
    const currentBounds = reviewBounds.current;
    if (video && currentBounds && (video.currentTime < currentBounds.start || video.currentTime >= currentBounds.end)) video.currentTime = currentBounds.start;
  };
  const handleVideoTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
    const video = videoRef.current, bounds = reviewBounds.current;
    if (video && bounds && time >= bounds.end && !video.paused) {
      if (bounds.kind === "selection" && loopRef.current) { video.currentTime = bounds.start; void video.play().catch(() => {}); }
      else { video.pause(); video.currentTime = Math.max(bounds.start, bounds.end - 0.000001); }
    }
  }, [setCurrentTime]);
  useEffect(() => {
    const bounds = reviewBounds.current;
    if (bounds?.kind !== "selection") return;
    bounds.start = trimStart; bounds.end = trimEnd;
    const video = videoRef.current;
    if (video && (video.currentTime < trimStart || video.currentTime >= trimEnd)) {
      if (loopRef.current && !video.paused) video.currentTime = trimStart;
      else video.pause();
    }
  }, [trimStart, trimEnd]);
  const handleVideoPause = () => {
    setPlaying(false);
    const video = videoRef.current, bounds = reviewBounds.current;
    if (video?.ended && bounds?.kind === "selection" && loopRef.current) { video.currentTime = bounds.start; void video.play().catch(() => {}); }
  };
  const fullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await videoRef.current?.parentElement?.requestFullscreen(); }
    catch { setFrameMessage("Fullscreen is unavailable. You can still use the source preview here."); }
  };
  const pictureInPicture = async () => {
    try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else { await videoRef.current?.requestPictureInPicture(); if(captionCues.length||edits.titles?.length||edits.images?.length||spec?.framing)setFrameMessage("Picture in picture shows the primary source. Use the composed preview or rendered MP4 to inspect framing, titles, images and styled captions."); } }
    catch { setFrameMessage("Picture in picture is unavailable for this source or browser."); }
  };
  const resetEditor = async () => {
    try { await persist(); } catch { return; }
    cancelOperation(); cancelSeek(); reviewBounds.current = null; setPlaying(false); setReviewMode("source"); setLastContext(null); frameRequest.current++;
    setAssemblyMedia({});setClipOutputs([]);setSequencePreview(null);setSelectedRange(0);setFile(null); setIdentity(null); setObjectUrl(null); setMetadata(null); setResult(null);
    dispatch({ type: "reset", value: empty }); setCurrentTime(0); setErrorMessage(null); setProgress(""); setHistoryMessage(""); setSaveStatus("Not saved yet");
  };
  const onWorkspaceKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.nativeEvent.isComposing || busy || target.closest("input, textarea, select, dialog, video, [contenteditable=true]")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); dispatch({ type: event.shiftKey ? "redo" : "undo" }); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); dispatch({ type: "redo" }); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (target.closest("button, a, [role=slider]")) return;
    if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); if (event.shiftKey) seek(currentTime + (event.key === "ArrowLeft" ? -1 : 1)); else void stepFrame(event.key === "ArrowLeft" ? -1 : 1); }
    if (event.key.toLowerCase() === "i" && !validateRange(currentTime, trimEnd, duration, metadata?.frameRate)) edit({ ...edits, ranges: edits.ranges.map((range,index)=>index===activeRangeIndex?{...range,start:currentTime}:range) }, "Set in point");
    if (event.key.toLowerCase() === "o" && !validateRange(trimStart, currentTime, duration, metadata?.frameRate)) edit({ ...edits, ranges: edits.ranges.map((range,index)=>index===activeRangeIndex?{...range,end:currentTime}:range) }, "Set out point");
  };

  return (
    <>
    <section tabIndex={0} onKeyDown={onWorkspaceKeyDown} aria-label="Editing workspace" data-editor-active={Boolean(file)} className="overflow-clip rounded-2xl border border-line bg-surface shadow-[0_20px_65px_rgba(0,0,0,0.24)]">
      <header className="flex min-h-[62px] flex-wrap items-center justify-between gap-3 border-b border-line bg-[#1B1C22] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="min-w-0"><p className="truncate text-[13px] font-semibold tracking-[-0.02em] text-ink">{file ? edits.projectTitle?.trim()||file.name : "New project"}</p><p className="mt-0.5 text-[10px] text-ink-faint">{file ? displayedSaveStatus : "Import a video to begin"}</p></div>
        </div>
        {statusCopy && <div className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-[#14151A] px-3 py-1.5 text-[10px] font-medium text-ink-muted" aria-live="polite">
          <span className={`size-1.5 rounded-full ${busy ? "animate-pulse bg-accent" : status === "FAILED" ? "bg-rose-400" : "bg-[#82C5A0]"}`} />
          <span>{statusCopy}</span>
        </div>}
      </header>

      {!file && <><UploadZone onFileSelected={handleFileSelected} /><div className="px-5 pb-5"><ProjectRecovery disabled={busy} onRestore={recoverBackup} onCancelRestore={cancelOperation}/></div></>}

      {file && previewSrc && (
        <div data-workspace-tool={tool} className="workspace">
          <nav aria-label="Editing tools" className="workspace-mobile-tabs flex gap-2 border-b border-line p-3">
            {(["trim", "captions", "details"] as const).map((name) => <button key={name} type="button" aria-pressed={tool === name} onClick={() => { setTool(name); if (name !== "trim") setInspector(name); }} className={"timeline-tool capitalize " + (tool === name ? "border-accent bg-accent-soft text-ink" : "")}>{name === "trim" ? "Trim" : name === "captions" ? "Captions" : "Details"}</button>)}
          </nav>
          <div className="workspace-grid grid min-w-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 p-4 sm:p-5">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs text-ink-muted"><span>Source preview</span><span className="font-mono">{formatPreviewTime(currentTime)}</span></div>
              <VideoPreview ref={videoRef} src={previewSrc} imageRender={primaryImageRender} onImageError={onImagePreviewError} titles={edits.titles} captionsUrl={sourceCaptionsUrl} cues={captionCues} captionStyle={captionStyle} outputWidth={spec?.width} outputHeight={spec?.height} framing={spec?.framing} disabled={busy} onFraming={framing=>edit({...edits,framing},"Reposition image")} nativeCaptions={nativeCaptionPreview} onCaptionError={onCaptionPreviewError} onTimeUpdate={handleVideoTimeUpdate} onPlay={handleVideoPlay} onPause={handleVideoPause}
                onRateChange={setPlaybackRate} onVolumeChange={setPreviewVolume} onError={() => setErrorMessage("This browser cannot preview the source codec. Your original file remains available to download.")} />
              {(captionCues.length>0||nativeCaptionPreview)&&<p className="mt-2 text-xs text-ink-muted">{nativeCaptionPreview?"Native source caption preview · render a sequence preview to inspect framing, titles and images":burnCaptions?"Styled preview · captions will be burned into the MP4":"Styled preview · MP4 has no added captions until burned-in delivery is selected"}</p>}
              <Transport playing={playing} disabled={busy || !metadata} loop={loopSelection} rate={playbackRate} volume={previewVolume} mode={reviewMode} contextSeconds={contextSeconds} replayAvailable={Boolean(lastContext)}
                onToggle={togglePlayback} onStep={(direction) => void stepFrame(direction)} onJump={(point) => void seekPreviewTo(point)} onSelection={previewSelection}
                onLoop={(value) => { setLoopSelection(value); loopRef.current = value; if (value && videoRef.current && !videoRef.current.paused) previewSelection(); }}
                onRate={(rate) => { if (videoRef.current) videoRef.current.playbackRate = rate; setPlaybackRate(rate); }}
                onVolume={(volume) => { if (videoRef.current) { videoRef.current.muted = false; videoRef.current.volume = volume; } setPreviewVolume(volume); }}
                onContext={reviewContext} onContextSeconds={setContextSeconds} onReplay={() => { if (lastContext) playRange(lastContext.start, lastContext.end, "context"); }} onFullscreen={() => void fullscreen()} onPip={() => void pictureInPicture()} pipSupported={pipSupported} />
              <AudioMeter videoRef={videoRef}/>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy || !history.past.length} onClick={() => dispatch({ type: "undo" })} title="Ctrl/⌘ Z" className="timeline-tool">Undo{history.past.length ? " · " + history.past[history.past.length - 1].action : ""}</button>
                <button type="button" disabled={busy || !history.future.length} onClick={() => dispatch({ type: "redo" })} title="Ctrl/⌘ Shift Z" className="timeline-tool">Redo</button>
                <details className="text-xs text-ink-muted"><summary className="cursor-pointer p-2">Shortcuts</summary><p className="p-2">Focus the workspace: Space plays/pauses; I/O set in/out; arrows step frames; Shift+arrows seek one second; Ctrl/⌘ Z undoes; Ctrl/⌘ Shift Z redoes. Text fields keep normal typing.</p></details>
              </div>
              {frameMessage && <p className="mt-2 text-xs text-ink-muted" role="status">{frameMessage}</p>}
              <div className="workspace-trim mt-4 rounded-xl border border-line bg-[#14151A] p-3 sm:p-4">
                <Timeline key={identity?.id + "-" + duration} file={file} duration={duration} frameRate={metadata?.frameRate} trimStart={trimStart} trimEnd={trimEnd} currentTime={currentTime} playing={playing} sceneMarkers={sceneTimes} editorialMarkers={editorialMarkers} snapToScenes={snapToCuts} disabled={busy || !metadata}
                  onChange={(start, end) => { if (!validateRange(start, end, duration, metadata?.frameRate)) changeRange(start,end,"Change trim"); }} onScrub={seek} />
                <ImagePanel images={edits.images??[]} media={assemblyMedia} duration={duration} frameRate={metadata?.frameRate} disabled={busy} onImport={image=>void addImage(image)} onRelink={(image,file)=>void relinkImage(image,file)} onChange={(images,action)=>edit({...edits,images},action)}/>
                <TitlePanel titles={edits.titles??[]} duration={duration} frameRate={metadata?.frameRate} disabled={busy} onAdd={()=>void addTitle()} onChange={(titles,action,group)=>edit({...edits,titles},action,group)}/>
                <AssemblyPanel assembly={edits.assembly} media={assemblyMedia} primaryAssetId={identity?.sourceAssetId??identity?.id??""} guidance={guidance} saveStatus={displayedSaveStatus} onGuidance={updateGuidance} onPrimaryCaptions={(cues,group,action)=>updateCaptionCues(cues,group,action??"Edit assembly primary captions")} onRelinkImage={(image,file)=>void relinkImage(image,file)} disabled={busy} onPrimary={()=>void addAssemblySource(file,true)} onImport={selected=>void addAssemblySource(selected)} onRelink={(source,selected)=>void relinkAssemblySource(source,selected)} onChange={(assembly,action,group)=>edit({...edits,assembly},action,group)} onPreview={()=>void exportAssembly(true)}/>
                <CleanupPanel key={identity?.id+"-cleanup"} file={file} duration={duration} gainDb={audioAdjustments.mute?-100:audioAdjustments.gainDb} disabled={busy} onReview={(start,end)=>playRange(start,end,"context")} onApply={pauses=>{let ranges=edits.ranges;for(const pause of pauses)ranges=subtractInterval(ranges,pause.start,pause.end,()=>crypto.randomUUID());const error=ranges.length>100?"Keep no more than 100 ranges.":validateSequence(ranges,identity?.id??"",duration,metadata?.frameRate);if(error)setErrorMessage(error);else{edit({...edits,ranges},"Remove reviewed pauses");setSelectedRange(0);}}}/>
                <ClipQueue file={file} clips={edits.clips??[]} outputs={clipOutputs} revision={revision} duration={duration} disabled={busy} onChange={(clips,action)=>edit({...edits,clips},action)} onAdd={()=>edit({...edits,clips:[...(edits.clips??[]),{id:crypto.randomUUID(),name:"Clip "+((edits.clips?.length??0)+1),range:{...activeRange,id:crypto.randomUUID()},preferences:{...exportPreferences},framing:{...framing},selected:true}]},"Add named clip")} onRun={()=>void exportClips()} onCancel={()=>clipJobRef.current?.abort()}/>
                <AdjustmentPanel framing={framing} audio={audioAdjustments} hasAudio={edits.assembly?.enabled?edits.assembly.sources.some(source=>source.reference.metadata.hasAudio):metadata?.hasAudio??false} disabled={busy} onChange={(framing,audioAdjustments,action,group)=>edit({...edits,framing,audioAdjustments},action,group)} onPreview={()=>void handleProcess(true)}/>
                <SequencePanel ranges={edits.ranges} selected={activeRangeIndex} duration={duration} frameRate={metadata?.frameRate} currentTime={currentTime} disabled={busy} onSelect={(index,time)=>{setSelectedRange(index);seek(time??edits.ranges[index]?.start??0);}} onChange={(ranges,action)=>edit({...edits,ranges},action)} onPreview={()=>void handleProcess(true)}/>
                {sequencePreview&&<div className="mt-3 rounded border border-line p-3"><p className="text-xs text-ink-muted">{sequencePreview.revision===revision?"Current":"Earlier"} rendered sequence preview</p><video onPlay={event=>pauseOtherPreviews(event.currentTarget)} aria-label="Rendered sequence preview" src={sequencePreview.url} controls className="mt-2 max-h-80 w-full">{sequencePreview.captions&&<track kind="captions" label="Sequence captions" srcLang="und" default src={"data:text/vtt;charset=utf-8,"+encodeURIComponent(sequencePreview.captions)}/>}</video></div>}
                <ScenePanel key={identity?.id+"-scenes"} file={file} sourceId={identity?.id??""} duration={duration} start={trimStart} end={trimEnd} currentTime={currentTime} cuts={sceneCuts} analysis={edits.sceneAnalysis} settings={sceneSettings}
                  disabled={busy||!metadata} message={sceneScanMessage} failed={sceneScanStatus==="failed"} snap={snapToCuts} onSnap={setSnapToCuts} onSeek={seek} onJump={jumpToCut}
                  onSettings={(settings)=>edit({...edits,sceneSettings:settings},"Change scene scan settings")} onScan={(replace)=>void detectSceneCuts(replace)} onCuts={updateSceneCuts}
                  onRange={(start,end)=>{if(!validateRange(start,end,duration,metadata?.frameRate))changeRange(start,end,"Select scene");}}/>
                <MarkerPanel key={identity?.id+"-markers"} markers={editorialMarkers} duration={duration} disabled={busy||!metadata} getPlayhead={getPlayhead} onSeek={seek} onChange={updateEditorialMarkers}/>
              </div>
              <div className="export-actions sticky bottom-2 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line-strong bg-surface-raised p-3 shadow-lg shadow-black/30">
                <button type="button" onClick={()=>void handleProcess()} disabled={busy || !metadata || Boolean(validateRange(trimStart, trimEnd, duration, metadata?.frameRate)) || Boolean(metadata?.hdr && (edits.ranges.length!==1 || trimStart !== 0 || trimEnd !== duration || forceFFmpeg || burnCaptions || outputTitles.length>0 || outputImageRender.length>0 || spec?.reencode))} className="min-h-11 rounded-md bg-accent px-4 text-sm font-semibold text-paper disabled:opacity-40">{status === "PROCESSING" ? "Exporting…" : result && result.revision !== revision ? "Export latest changes" : "Export video"}</button>
              {result && <a href={result.videoUrl} download={result.settings.fileName??projectFileStem(file.name.replace(/\.[^.]+$/, ""))+"-cutmark.mp4"} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-well focus-visible:outline-accent"><DownloadGlyph /> MP4</a>}
              {outputCues.length > 0 && <a href={"data:application/x-subrip;charset=utf-8," + encodeURIComponent(serializeSubRip(outputCues))} download={outputStem + "-selection.srt"} className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm text-ink-muted"><DownloadGlyph /> Current subtitles (.srt)</a>}
              {outputCues.length>0&&<a href={"data:text/vtt;charset=utf-8,"+encodeURIComponent(serializeCaptions(outputCues))} download={outputStem+"-selection.vtt"} className="rounded-md border border-line px-3 py-2 text-xs text-ink-muted">Current subtitles (.vtt)</a>}
              {result?.captionsVtt && <a href={"data:text/vtt;charset=utf-8," + encodeURIComponent(result.captionsVtt)} download="export-captions.vtt" className="rounded-md border border-line px-3 py-2 text-xs text-ink-muted">Export subtitles (.vtt)</a>}

                {busy && <button type="button" onClick={cancelOperation} className="timeline-tool">Cancel</button>}
                <button type="button" onClick={resetEditor} disabled={busy} className="timeline-tool ml-auto">New video</button>
              </div>
              {reviewIssues.length > 0 && <p className="mt-2 text-xs text-amber-200">{reviewIssues.length} caption timing or readability flags to review in Captions before delivery. Wording is preserved; subtitles use the selected range.</p>}
              {(progress || errorMessage) && <p className={"mt-3 border-l-2 px-3 py-2 text-xs leading-relaxed " + (errorMessage ? "border-rose-500 text-rose-300" : "border-line-strong text-ink-muted")} role={errorMessage ? "alert" : "status"}>{errorMessage ?? progress}</p>}
              {(status==="PROCESSING"||captionWorking||sceneScanStatus==="working") && <ProcessingSteps steps={steps} messages={stepMessages} elapsedSeconds={processingElapsed} />}
              {projectProgress&&<p className="mt-2 text-xs text-ink-muted" role="status">{projectProgress}</p>}
              {historyMessage && <p className="mt-3 text-xs text-amber-200" role="status">{historyMessage}</p>}
              {shortCaptionIntersections > 0 && <p className="mt-3 text-xs text-amber-200" role="status">{shortCaptionIntersections} caption intersections are too brief for millisecond subtitle timestamps and are omitted from the selected subtitle file. The source cues remain saved.</p>}
              <details className="mt-4 rounded-lg border border-line p-3 text-xs text-ink-muted"><summary className="cursor-pointer py-1">Export and storage details</summary>
                <details className="mt-3 rounded-lg border border-line p-3"><summary className="cursor-pointer py-1">Project name and backups</summary>
                  <label className="mt-3 block">Project title<input aria-label="Project title" maxLength={255} value={edits.projectTitle??file.name} disabled={busy} onChange={event=>edit({...edits,projectTitle:event.target.value},"Rename project","project-title")} className="mt-2 min-h-10 w-full rounded border border-line bg-well px-2 text-ink"/></label>
                  <p className="mt-2">The source filename stays unchanged. Duplicate creates independent decisions and shares stored source/export media until a new export is made.</p>
                  <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void duplicateProject()} className="timeline-tool">Duplicate project</button><button type="button" disabled={busy} onClick={()=>void downloadProject(false)} className="timeline-tool">Download project file</button><button type="button" disabled={busy} onClick={()=>void downloadProject(true)} className="timeline-tool">Download backup with source</button></div>
                  <p className="mt-2">Project files require the matching video. Bundles include that source without reading it all into memory. Both preserve editing decisions and exclude previous rendered MP4s; download those separately.</p>
                  {projectWorking&&<button type="button" onClick={cancelOperation} className="timeline-tool mt-2">Cancel project operation</button>}
                  <ProjectRecovery disabled={busy} onRestore={recoverBackup} onCancelRestore={cancelOperation}/>
                </details>
                <PresetPanel settings={{captionStyle,captionDelivery,captionGuidance:guidance,exportPreferences,framing,audioAdjustments}} disabled={busy} onApply={settings=>edit({...edits,...settings},"Apply output preset")}/>
                {spec&&<ExportSettings preferences={exportPreferences} spec={spec} disabled={busy} onChange={(preferences,action,group)=>edit({...edits,exportPreferences:preferences},action,group)}/>}
                <p className="mt-3">Export: {outputFileName(outputStem,exportPreferences)} · {formatPreviewTime(sequenceLength)} · {spec ? spec.width + " × " + spec.height + " · " + (spec.audio ? "source audio" : "no audio") : "Checking source"} · {outputTitles.length} timed title sections · source frame timing · {burnCaptions?"captions burned into video"+(captionDelivery==="both"?" and delivered as files":""):"captions delivered separately"}.</p>
                <details className="mt-3 rounded border border-line p-3"><summary className="cursor-pointer py-2">Frame capture and edit report</summary><p>Source captures preserve the decoded image. Composed captures include framing and the edited caption layer at that source frame; neither includes safe guides. Reports contain local editorial wording and notes.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void captureFrame(false)} className="timeline-tool">Capture source frame</button><button type="button" disabled={busy} onClick={()=>void captureFrame(true)} className="timeline-tool">Capture composed frame</button><a download={outputStem+"-edit-report.json"} href={"data:application/json;charset=utf-8,"+encodeURIComponent(JSON.stringify({format:"cutmark-edit-report",version:1,title:projectTitle,revision,source:{fileName:file.name,duration},sequenceDuration:sequenceLength,assembly:edits.assembly,assemblyMarkers:edits.assembly?assemblyMarkers(edits.assembly):undefined,ranges:edits.ranges,markers:editorialMarkers.map(marker=>({...marker,occurrences:sourceOccurrences(marker.time,identity?.id??"",edits.ranges)})),captions:outputCues,framing,audioAdjustments,images:outputImageRender.map(({blob:_blob,...image})=>{void _blob;return image;}),titles:outputTitles,exportPreferences,clips:edits.clips??[]},null,2))} className="timeline-tool">Download edit report</a></div></details>
                <label className="mt-3 flex min-h-10 items-center gap-2"><input type="checkbox" checked={forceFFmpeg} disabled={busy} onChange={(event) => setForceFFmpeg(event.target.checked)} />Use compatible processor for the next export</label>
                {result && <div className="mt-3 rounded-lg border border-line p-3"><p>{result.revision === revision ? "Latest export" : "Earlier export"} · {result.settings.captions==="sidecar"?"subtitle files":result.settings.captions==="burned"?"burned-in captions":"burned-in captions and files"} · revision {result.revision} · {(result.videoBlob.size / 1024 / 1024).toFixed(2)} MB · {formatPreviewTime(result.duration)} · {result.metadata?result.metadata.width+" × "+result.metadata.height+" · "+(result.metadata.hasAudio?"audio present":"no audio")+" · "+(result.metadata.videoCodec??"video"):(result.settings.width+" × "+result.settings.height)} · {result.settings.preferences?.quality??"legacy quality"}</p><details className="mt-2"><summary className="cursor-pointer py-2">Review exported video</summary><video onPlay={event=>pauseOtherPreviews(event.currentTarget)} src={result.videoUrl} controls preload="metadata" className="mt-2 max-h-80 w-full rounded-lg" /></details></div>}
                {saveStatus.startsWith("Save failed") && <button type="button" onClick={() => setSaveAttempt((value) => value + 1)} className="timeline-tool mt-3">Retry saving</button>}
            <details className="mt-3 rounded-lg border border-line p-3 text-xs text-ink-muted">
              <summary className="cursor-pointer">Manage saved projects</summary>
              <StoragePanel operationRef={storageOperation} projects={recentProjects} disabled={busy} onWorking={setStorageWorking} onCacheChange={()=>void checkModelCache()}/>
              <p className="mt-2">Projects remain until you delete them. Deleting a project removes only media no longer shared by another project; the current project stays open. Browser storage is not a backup.</p>
              <ul className="mt-2 max-h-48 space-y-1 overflow-auto">{recentProjects.map((project) => <li key={project.id} className="flex items-center justify-between gap-3 py-1">
                <span className="min-w-0 truncate">{project.title??project.fileName}{project.id === identity?.id ? " · Current project" : ""}</span>
                <button type="button" disabled={project.id === identity?.id || busy} aria-label={"Delete saved project " + (project.title??project.fileName)} onClick={() => setProjectPendingDelete(project)} className="shrink-0 rounded border border-line px-2 py-2 text-ink-muted hover:text-rose-300 disabled:opacity-40">Delete</button>
              </li>)}</ul>
            </details>
            <a href={objectUrl ?? undefined} download={file.name} className="mt-3 inline-block text-xs text-ink-muted underline">{identity?.sourceAvailable ? "Download original source" : "Download saved source export"}</a>
            {metadata?.hdr && <p className="mt-3 text-xs text-amber-200" role="status">This source has HDR or wide-color metadata. Export the unchanged full source to preserve its color; HDR trimming and re-encoding are currently unavailable.</p>}

              </details>
            </div>
            <aside aria-label="Project inspector" className="workspace-inspector min-w-0 border-t border-line bg-[#15161B] p-4 xl:border-l xl:border-t-0">
              <nav aria-label="Inspector tools" className="workspace-desktop-tabs mb-4 flex gap-2">
                {(["captions", "details"] as const).map((name) => <button key={name} type="button" aria-pressed={inspector === name} onClick={() => setInspector(name)} className={"timeline-tool capitalize " + (inspector === name ? "border-accent bg-accent-soft text-ink" : "")}>{name === "captions" ? "Captions" : "Details"}</button>)}
              </nav>
              <div className="workspace-captions" data-inspector-visible={inspector === "captions"}>
                <CaptionStylePanel style={captionStyle} delivery={captionDelivery} disabled={busy} nativePreview={nativeCaptionPreview} onNativePreview={setNativeCaptionPreview} onStyle={updateCaptionStyle} onDelivery={(delivery)=>edit({...edits,captionDelivery:delivery},"Change caption delivery")}/>
                <SubtitleImport key={identity?.id+"-subtitle-import"} cues={captionCues} duration={duration} start={trimStart} end={trimEnd} disabled={busy||!metadata} onChange={updateCaptionCues}/>
                <div className="mb-4 rounded-lg border border-line bg-well p-3">
                  <label className="mb-2 flex items-center gap-2 text-xs text-ink-muted">Transcribe<select aria-label="Caption transcription scope" disabled={busy} value={captionScope} onChange={(event) => setCaptionScope(event.target.value as "selection" | "source")} className="min-h-10 rounded border border-line bg-well px-2 text-ink"><option value="selection">Selection</option><option value="source">Full source</option></select></label>
                  <button type="button" onClick={generateCaptions} disabled={busy || !metadata?.hasAudio} className="timeline-tool">{(captionCues.length ? "Regenerate " : "Generate ") + (captionScope === "source" ? "full source" : "selection") + " captions"}</button>
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted">{metadata && !metadata.hasAudio ? "This source has no audio track." : "Whisper Tiny English recognizes speech locally. First use downloads model files. Captions are available before video export; review recognition before delivery."}</p>
                  <p className="mt-2 text-xs text-ink-muted">{modelCache}</p>
                </div>
                <TranscriptEditor key={identity?.id} cues={captionCues} duration={duration} disabled={busy} activeCueId={activeCueId} range={edits.ranges} guidance={guidance} onGuidance={updateGuidance} getPlayhead={getPlayhead} onSeek={seek} onChange={updateCaptionCues} onReviewPassage={(start,end)=>playRange(start,end,"context")} onPassage={(start,end,mode)=>{const ranges=mode==="keep"?[{...activeRange,id:crypto.randomUUID(),start,end}]:subtractInterval(edits.ranges,start,end,()=>crypto.randomUUID());const error=ranges.length>100?"Keep no more than 100 ranges.":validateSequence(ranges,identity?.id??"",duration,metadata?.frameRate);if(error)setErrorMessage(error);else{edit({...edits,ranges},mode==="keep"?"Keep transcript passage":"Remove transcript passage");setSelectedRange(0);}}} saveStatus={displayedSaveStatus} />
              </div>
              <div className="workspace-details" data-inspector-visible={inspector === "details"}>
                <SpecPanel fileName={file.name} fileSize={file.size} duration={duration} trimStart={trimStart} trimEnd={trimEnd} status={status} sceneCount={sceneTimes.length} captionCount={captionCues.length} />
              </div>
            </aside>
          </div>
        </div>
      )}
      {!file && <section className="border-t border-line bg-[#15161B] px-5 py-5 sm:px-6" aria-label="Recent project history">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">Recent projects</h2><p className="mt-1 text-[11px] text-ink-muted">Drafts and exports are saved in this browser. Projects stay until you delete them; browser storage is not a backup.</p></div>
          {historyMessage && <span className="text-[11px] text-amber-200">{historyMessage}</span>}
        </div>
        {recentProjects.length ? <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {recentProjects.map((project) => <li key={project.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-[#1A1B21] p-3 transition-colors duration-200 hover:border-line-strong">
            <span className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-[#14151A] text-ink-faint"><svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="m8 7 5 3-5 3V7Z" fill="currentColor"/></svg></span><span className="min-w-0"><span className="block truncate text-xs font-medium text-ink">{project.title??project.fileName}</span><span className="mt-1 block truncate text-[10px] text-ink-faint">{new Date(project.createdAt).toLocaleDateString()} · {project.exportRevision !== undefined ? "Export saved" : "Draft"} · {project.captionsVtt ? "Captions saved" : "No captions"}</span></span></span>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => restoreProject(project)} className="rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-[11px] font-medium text-ink-muted transition-colors hover:border-accent/50 hover:bg-[#2A2037] hover:text-ink">Open project</button>
              <button type="button" onClick={() => { setHistoryMessage(""); setProjectPendingDelete(project); }} aria-label={`Delete ${project.fileName} from recent projects`} title="Delete project" className="grid size-9 place-items-center rounded-lg border border-line text-ink-faint transition-colors hover:border-rose-500/40 hover:bg-rose-950/30 hover:text-rose-300 focus-visible:outline-accent">
                <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden="true"><path d="M4.5 6h11m-9.5 0 .6 9.2a1.25 1.25 0 0 0 1.25 1.17h4.3a1.25 1.25 0 0 0 1.25-1.17L14 6M8 6V4.75c0-.69.56-1.25 1.25-1.25h1.5C11.44 3.5 12 4.06 12 4.75V6m-3 2.5v5m2-5v5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </li>)}
        </ul> : <p className="mt-4 rounded-lg border border-dashed border-line px-3 py-4 text-xs text-ink-faint">Your saved drafts and exports will appear here.</p>}
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
