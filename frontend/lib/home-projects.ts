import type {SavedProjectSummary} from "./project-history";

export function projectEditedAt(project: SavedProjectSummary): number {
  for (const value of [project.updatedAt, project.createdAt]) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 8.64e15) return value;
  }
  return 0;
}
export function recentProjects(projects: SavedProjectSummary[]): SavedProjectSummary[] {
  return [...projects].sort((a,b)=>projectEditedAt(b)-projectEditedAt(a)||a.id.localeCompare(b.id));
}
export function projectExportLabel(project: SavedProjectSummary): string {
  const exported = project.exportRevision !== undefined || Boolean(project.exportId || project.exportMetadata) || (project.outputBytes ?? 0) > 0;
  if (!exported) return project.outputAssetId ? "Export status unknown" : "Draft · no export yet";
  if (Number.isInteger(project.revision) && Number.isInteger(project.exportRevision) && (project.revision??-1)>=0 && (project.exportRevision??-1)>=0) {
    return project.revision === project.exportRevision ? "Export up to date" : "Changes since export";
  }
  return "Export saved · revision unknown";
}
export function projectDuration(project: SavedProjectSummary): {seconds:number;label:string}|null {
  const ranges=project.assembly?.enabled?project.assembly.ranges:project.ranges;
  if (ranges?.length && ranges.every(range=>Number.isFinite(range.start)&&Number.isFinite(range.end)&&range.start>=0&&range.end>range.start)) {
    return {seconds:ranges.reduce((total,range)=>total+range.end-range.start,0),label:"Edited"};
  }
  if (typeof project.sourceDuration==="number" && Number.isFinite(project.sourceDuration) && project.sourceDuration>0) return {seconds:project.sourceDuration,label:"Source"};
  if (Number.isFinite(project.duration)&&project.duration>0) return {seconds:project.duration,label:project.sourceIsExport?"Saved video":"Saved duration"};
  return null;
}
