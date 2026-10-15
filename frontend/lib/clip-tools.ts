import type {SourceRange} from "./timing";
import type {ExportPreferences} from "./output-spec";
import type {Framing} from "./adjustments";
export interface ClipDefinition {id:string;name:string;range:SourceRange;preferences:ExportPreferences;framing:Framing;selected:boolean}
export interface ClipOutput {id:string;status:"waiting"|"working"|"complete"|"failed"|"cancelled";message:string;revision:number;exportRevision?:number;url?:string;fileName?:string;captions?:string}
