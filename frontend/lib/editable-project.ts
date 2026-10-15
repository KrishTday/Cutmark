import type {ImageOverlay} from "./image-tools";
import type {TitleCue} from "./title-tools";
import type {Assembly} from "./assembly";
import type {ClipDefinition} from "./clip-tools";
import type {Framing,AudioAdjustments} from "./adjustments";
import type { ExportPreferences } from "./output-spec";
import type { CaptionStyle, CaptionDelivery } from "./caption-renderer";
import type { SceneAnalysis, SceneCut, SceneSettings, EditorialMarker } from "./scene-tools";
import type { CaptionGuidance } from "./caption-editing";
import type { CaptionCue } from "./captions";
import type { SourceRange } from "./timing";

export interface EditDecisions {
  projectTitle?:string; images?:ImageOverlay[];titles?:TitleCue[];assembly?:Assembly;clips?:ClipDefinition[];framing?:Framing;audioAdjustments?:AudioAdjustments;
  ranges: SourceRange[];
  captions: CaptionCue[]; // source timestamps, never shifted by a trim
  sceneMarkers: number[]; // source timestamps
  scenesDetected: boolean;
  includeSceneDetection: boolean;
  captionGuidance?: CaptionGuidance;
  captionStyle?:CaptionStyle; captionDelivery?:CaptionDelivery; exportPreferences?:ExportPreferences;
  sceneCuts?: SceneCut[]; sceneAnalysis?: SceneAnalysis; sceneSettings?: SceneSettings;
  dismissedCuts?: {start:number;end:number}[]; editorialMarkers?: EditorialMarker[];
}
export interface EditHistory {
  present: EditDecisions;
  revision: number;
  past: { value: EditDecisions; action: string }[];
  future: { value: EditDecisions; action: string }[];
  lastEdit: { group?: string; at: number } | null;
}
export type EditAction =
  | { type: "reset"; value: EditDecisions; revision?: number }
  | { type: "edit"; value: EditDecisions; action: string; group?: string; at?: number }
  | { type: "undo" } | { type: "redo" };
/** Primary assembly sources follow current corrections atomically unless explicitly detached. */
export function synchronizePrimarySources(value:EditDecisions):EditDecisions {
 if(!value.assembly?.sources.some(source=>source.primary))return value;
 return {...value,assembly:{...value.assembly,sources:value.assembly.sources.map(source=>source.primary?{...source,captions:value.captions,titles:value.titles,images:value.images,markers:value.editorialMarkers,sceneMarkers:value.sceneMarkers}:source)}};
}
export function createHistory(value: EditDecisions, revision = 0): EditHistory {
  return { present: synchronizePrimarySources(value), revision, past: [], future: [], lastEdit: null };
}
export function editReducer(state: EditHistory, event: EditAction): EditHistory {
  if (event.type === "reset") return createHistory(event.value, event.revision);
  if (event.type === "undo" || event.type === "redo") {
    const from = event.type === "undo" ? state.past : state.future;
    const entry = from[from.length - 1];
    if (!entry) return state;
    const other = { value: state.present, action: entry.action };
    return { present: entry.value, revision: state.revision + 1,
      past: event.type === "undo" ? state.past.slice(0, -1) : [...state.past, other],
      future: event.type === "redo" ? state.future.slice(0, -1) : [...state.future, other], lastEdit: null };
  }
  const value=synchronizePrimarySources(event.value);
  if (JSON.stringify(state.present) === JSON.stringify(value)) return state;
  const at = event.at ?? Date.now();
  const coalesce = event.group && state.lastEdit?.group === event.group && at - state.lastEdit.at < 800 && !state.future.length;
  return { present: value, revision: state.revision + 1,
    past: coalesce ? state.past : [...state.past, { value: state.present, action: event.action }].slice(-100),
    future: [], lastEdit: { group: event.group, at } };
}
