import type {ImageOverlay} from "./image-tools";
import type {TitleCue} from "./title-tools";
import type {Assembly} from "./assembly";
import type {ClipDefinition} from "./clip-tools";
import type {Framing,AudioAdjustments} from "./adjustments";
import type { SourceRange } from "./timing";
import type { MediaMetadata } from "./media";
import type { ExportPreferences } from "./output-spec";
import type { CaptionStyle, CaptionDelivery } from "./caption-renderer";
import type { SceneAnalysis, SceneCut, SceneSettings, EditorialMarker } from "./scene-tools";
import type { CaptionGuidance } from "./caption-editing";
import type { CaptionCue } from "./captions";
export interface SavedProject {
  id: string; sourceBytes?:number; outputBytes?:number; title?:string; sourceAssetId?:string; outputAssetId?:string; fileName: string; createdAt: number; updatedAt?: number;
  schemaVersion?: 2; revision?: number; exportRevision?: number; exportId?: string;
  exportMetadata?:MediaMetadata;
  exportSettings?: {images?:ImageOverlay[];titles?:TitleCue[]; width: number; height: number; audio: boolean;framing?:Framing;audioAdjustments?:AudioAdjustments; preferences?:ExportPreferences; timing: "source"; captions: CaptionDelivery; captionStyle?:CaptionStyle; fileName?:string; processor: "automatic" | "ffmpeg" };
  video?: Blob; sourceVideo?: Blob; sourceIsExport?: boolean;
  ranges?:SourceRange[]; sourceDuration?: number; trimStart?: number; trimEnd?: number; rangeId?: string; captions?: CaptionCue[];
  images?:ImageOverlay[];titles?:TitleCue[];assembly?:Assembly;mediaAssets?:Record<string,Blob>;clips?:ClipDefinition[];framing?:Framing;audioAdjustments?:AudioAdjustments; captionGuidance?: CaptionGuidance;
  captionStyle?:CaptionStyle; captionDelivery?:CaptionDelivery; exportPreferences?:ExportPreferences;
  sceneCuts?: SceneCut[]; sceneAnalysis?: SceneAnalysis; sceneSettings?: SceneSettings;
  dismissedCuts?: {start:number;end:number}[]; editorialMarkers?: EditorialMarker[];
  includeSceneDetection?: boolean; includeCaptions?: boolean; sceneDetectionSucceeded?: boolean;
  captionsVtt: string | null; captionTimebase?: "source" | "output";
  exportCaptionsVtt?: string | null; exportTrimStart?: number; exportTrimEnd?: number;
  captionError?: string; sceneMarkers: number[]; markerTimebase?: "source" | "output"; duration: number;
}
export type SavedProjectSummary = Omit<SavedProject, "video" | "sourceVideo" | "mediaAssets">;
const DB_NAME = "splice-projects";
const META = "projects", ASSETS = "assets", LEGACY = "recent";
function referencedAssets(project:SavedProjectSummary){return [...(project.assembly?.sources??[]),...(project.images??[]),...(project.assembly?.sources.flatMap(source=>source.images??[])??[])];}
function assetSignature(project:SavedProjectSummary){return [...new Set(referencedAssets(project).map(asset=>asset.assetId))].sort().join("\n");}
export function projectSummary(project: SavedProject): SavedProjectSummary {
  const { video: _video, sourceVideo: _sourceVideo,mediaAssets:_mediaAssets, ...metadata } = project;
  void _video; void _sourceVideo;void _mediaAssets;
  return metadata;
}
/** Legacy captions and markers were output-relative; only shift when original source exists. */
export function migrateProject(project: SavedProject): SavedProject {
  if (project.schemaVersion === 2) return project;
  const sourceAvailable = Boolean(project.sourceVideo) && !project.sourceIsExport;
  return { ...project, schemaVersion: 2, updatedAt: project.createdAt, revision: 0,
    sourceBytes:project.sourceVideo?.size??project.video?.size,outputBytes:project.video?.size,
    exportRevision: project.video ? 0 : undefined, captionTimebase: "output", markerTimebase: "output",
    exportCaptionsVtt: project.captionsVtt, exportTrimStart: project.trimStart ?? 0,
    exportTrimEnd: project.trimEnd ?? project.duration, sourceIsExport: !sourceAvailable };
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Local saving is unavailable in this browser. Keep this tab open and download your work.")); return; }
    const request = indexedDB.open(DB_NAME, 7);
    request.onupgradeneeded = () => {
      const db = request.result, transaction = request.transaction!;
      if(!db.objectStoreNames.contains(META))db.createObjectStore(META, { keyPath: "id" });
      if(!db.objectStoreNames.contains(ASSETS))db.createObjectStore(ASSETS, { keyPath: "id" });
      if (db.objectStoreNames.contains(LEGACY)) {
        const legacy = transaction.objectStore(LEGACY);
        const cursor = legacy.openCursor();
        cursor.onsuccess = () => {
          const entry = cursor.result;
          if (!entry) { db.deleteObjectStore(LEGACY); return; }
          const project = migrateProject(entry.value as SavedProject);
          transaction.objectStore(META).put(projectSummary(project));
          transaction.objectStore(ASSETS).put({ id: project.id, sourceVideo: project.sourceVideo, video: project.video });
          entry.continue();
        };
      }
    };
    let blocked = false;
    request.onsuccess = () => { if (blocked) { request.result.close(); return; } request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error?.name==="VersionError"?new Error("Project storage was upgraded by another Cutmark tab. Reload this tab before saving; your open video and downloads remain available."):request.error ?? new Error("Could not open local projects."));
    request.onblocked = () => { blocked = true; reject(new Error("Close other Cutmark tabs, then retry saving.")); };
  });
}
function completed(transaction: IDBTransaction, failure?: () => unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = transaction.onabort = () => {
      const error = failure?.() ?? transaction.error;
      reject(error instanceof Error && error.name === "QuotaExceededError" ? new Error("Browser storage is full. Your open project and downloads remain available; remove an unneeded saved project or free site storage and retry.") : error ?? new Error("Saving failed. Browser storage may be full; your open project and downloads remain available."));
    };
  });
}
export async function listSavedProjects(): Promise<SavedProjectSummary[]> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(META, "readonly"), done = completed(transaction);
    const request = transaction.objectStore(META).getAll();
    await done;
    const values = request.result as SavedProjectSummary[];
    return values.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
  } finally { db.close(); }
}
export async function loadSavedProject(id: string): Promise<SavedProject> {
  const db=await openDatabase();
  try{
    const transaction=db.transaction([META,ASSETS],"readonly"),done=completed(transaction);
    const request=transaction.objectStore(META).get(id);
    let metadata:SavedProjectSummary|undefined,source:IDBRequest|undefined,output:IDBRequest|undefined;const additional:{fingerprint:string;request:IDBRequest}[]=[];
    request.onsuccess=()=>{metadata=request.result;if(!metadata)return;
      source=transaction.objectStore(ASSETS).get(metadata.sourceAssetId??id);
      output=transaction.objectStore(ASSETS).get(metadata.outputAssetId??id);
      for(const asset of referencedAssets(metadata))additional.push({fingerprint:asset.reference.fingerprint,request:transaction.objectStore(ASSETS).get(asset.assetId)});
    };
    await done;if(!metadata)throw new Error("This saved project is no longer available.");
    return {...metadata,mediaAssets:Object.fromEntries(additional.filter(entry=>entry.request.result?.sourceVideo).map(entry=>[entry.fingerprint,entry.request.result.sourceVideo])),sourceVideo:source?.result?.sourceVideo??(metadata.sourceIsExport?source?.result?.video:undefined),video:output?.result?.video};
  }finally{db.close();}
}
function collectUnusedAssets(transaction:IDBTransaction){
  const request=transaction.objectStore(META).getAll();
  request.onsuccess=()=>{
    const used=new Set<string>();
    for(const project of request.result as SavedProjectSummary[]){
      used.add(String(project.sourceAssetId??project.id));for(const source of referencedAssets(project))used.add(source.assetId);
      if(project.exportRevision!==undefined||project.exportId)used.add(String(project.outputAssetId??project.id));
    }
    const cursor=transaction.objectStore(ASSETS).openKeyCursor();
    cursor.onsuccess=()=>{const entry=cursor.result;if(!entry)return;if(!used.has(String(entry.key)))transaction.objectStore(ASSETS).delete(entry.key);entry.continue();};
  };
}
export async function duplicateSavedProject(id:string):Promise<SavedProjectSummary>{
  const db=await openDatabase();
  try{
    const transaction=db.transaction([META],"readwrite"),done=completed(transaction),store=transaction.objectStore(META),request=store.get(id);
    let duplicate:SavedProjectSummary|undefined;
    request.onsuccess=()=>{const original=request.result as SavedProjectSummary|undefined;if(!original){transaction.abort();return;}
      duplicate={...original,id:crypto.randomUUID(),title:(original.title??original.fileName).slice(0,250).replace(/[\uD800-\uDBFF]$/u,"")+" copy",createdAt:Date.now(),updatedAt:Date.now(),sourceAssetId:original.sourceAssetId??id,outputAssetId:original.outputAssetId??id};
      if(duplicate.sceneAnalysis)duplicate.sceneAnalysis={...duplicate.sceneAnalysis,sourceId:duplicate.id};
      store.put(duplicate);
    };
    await done;if(!duplicate)throw new Error("The project could not be duplicated.");return duplicate;
  }finally{db.close();}
}
export async function saveProject(project: SavedProject, signal?:AbortSignal): Promise<void> {
  signal?.throwIfAborted();const db = await openDatabase();
  let abort:(()=>void)|undefined;
  try {
    let writeError: unknown;
    const transaction = db.transaction([META, ASSETS], "readwrite"), done = completed(transaction, () => writeError);
    abort=()=>{try{transaction.abort();}catch{}};signal?.addEventListener("abort",abort,{once:true});if(signal?.aborted){abort();await done;return;}
    const store = transaction.objectStore(META);
    const request = store.get(project.id);
    request.onsuccess = () => {
      try {
      const previous = request.result as SavedProjectSummary | undefined;
      // An older asynchronous autosave must not replace a newer revision.
      if (previous && (previous.revision ?? 0) > (project.revision ?? 0)) return;
      const sourceAssetId=previous?.sourceAssetId??project.id;
      const outputAssetId=project.video?(previous&&previous.exportId===project.exportId?(previous.outputAssetId??project.id):"export:"+(project.exportId??crypto.randomUUID())):undefined;
      store.put({...projectSummary(project),sourceAssetId,outputAssetId});
      const ensureAsset=(id:string,blob:Blob|undefined)=>{if(!blob)return;const check=transaction.objectStore(ASSETS).getKey(id);check.onsuccess=()=>{try{if(check.result===undefined)transaction.objectStore(ASSETS).put({id,sourceVideo:blob});}catch(error){writeError=error;transaction.abort();}};};
      ensureAsset(sourceAssetId,project.sourceVideo);
      for(const source of new Map(referencedAssets(project).map(asset=>[asset.assetId,asset])).values()){if(source.assetId!==sourceAssetId)ensureAsset(source.assetId,project.mediaAssets?.[source.reference.fingerprint]);}
      if(project.video&&(!previous||previous.exportId!==project.exportId))transaction.objectStore(ASSETS).put({id:outputAssetId,video:project.video});
      if(previous&&(previous.exportId!==project.exportId||assetSignature(previous)!==assetSignature(project)))collectUnusedAssets(transaction);
      } catch (error) { writeError = error; transaction.abort(); }
    };
    await done;
  } finally { if(abort)signal?.removeEventListener("abort",abort);db.close(); }
}
export async function deleteSavedProject(id: string): Promise<void> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction([META, ASSETS], "readwrite"), done = completed(transaction);
    transaction.objectStore(META).delete(id); collectUnusedAssets(transaction);
    await done;
  } finally { db.close(); }
}
