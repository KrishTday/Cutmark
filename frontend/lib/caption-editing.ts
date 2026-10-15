import type { CaptionCue } from "./captions";
import { isSubtitleInterval } from "./captions";
import type { SourceRange } from "./timing";
export function splitCaption(cues: CaptionCue[], id: number, time: number, cursor: number): CaptionCue[] {
  const cue = cues.find((value) => value.id === id);
  if (!cue || cursor <= 0 || cursor >= cue.text.length || !isSubtitleInterval(cue.start, time) || !isSubtitleInterval(time, cue.end)) throw new Error("Place the playhead inside the cue and the text cursor between the words to split.");
  const nextId = Math.max(0, ...cues.map((value) => value.id)) + 1;
  return cues.flatMap((value) => value.id === id ? [{ ...value, end: time, text: value.text.slice(0, cursor), acknowledgedWarnings: [], reviewNote: "" }, { ...value, id: nextId, start: time, text: value.text.slice(cursor), acknowledgedWarnings: [], reviewNote: "" }] : [value]);
}
export function mergeCaptions(cues: CaptionCue[], ids: number[]): CaptionCue[] {
  const ordered = [...cues].sort((a, b) => a.start - b.start), indexes = ordered.flatMap((cue, index) => ids.includes(cue.id) ? [index] : []);
  if (indexes.length < 2 || indexes.some((value, index) => index > 0 && value !== indexes[index - 1] + 1)) throw new Error("Select two or more adjacent cues to merge.");
  const chosen = indexes.map((index) => ordered[index]), merged = { ...chosen[0], end: Math.max(...chosen.map((cue) => cue.end)), text: chosen.map((cue) => cue.text).join("\n"), acknowledgedWarnings: [], reviewNote: "" };
  return ordered.flatMap((cue) => cue.id === merged.id ? [merged] : ids.includes(cue.id) ? [] : [cue]);
}
export function shiftCaptions(cues: CaptionCue[], ids: number[], delta: number, duration: number): CaptionCue[] {
  if (!Number.isFinite(delta) || !ids.length) throw new Error("Select cues and enter a finite shift in seconds.");
  const shifted = cues.map((cue) => ids.includes(cue.id) ? { ...cue, start: cue.start + delta, end: cue.end + delta, acknowledgedWarnings: [], reviewNote: "" } : cue);
  if (shifted.some((cue) => ids.includes(cue.id) && (cue.start < 0 || cue.end > duration || !isSubtitleInterval(cue.start, cue.end)))) throw new Error("The shift would move a cue outside the source. No cues were changed.");
  return shifted;
}
export function replaceCaptionText(text: string, query: string, replacement: string): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "giu"), () => replacement);
}
export interface CaptionGuidance { lineLength: number; charactersPerSecond: number }
export interface CaptionIssue { cueId: number; key: string; code: "invalid" | "outside" | "overlap" | "line" | "speed"; message: string; acknowledged: boolean }
export function captionIssues(cues: CaptionCue[], range: SourceRange | SourceRange[] | undefined, guidance: CaptionGuidance): CaptionIssue[] {
  const ranges=range?Array.isArray(range)?range:[range]:[];
  const orderedRanges=[...ranges].sort((a,b)=>a.start-b.start);
  const issues: CaptionIssue[] = [];
  const ordered = [...cues].sort((a, b) => a.start - b.start);
  const add = (cue: CaptionCue, code: CaptionIssue["code"], message: string) => {
    const context = JSON.stringify([cue.start, cue.end, cue.text, ranges.length>1?ranges.map(r=>[r.start,r.end]):ranges[0]?.start, ranges.length>1?undefined:ranges[0]?.end, guidance.lineLength, guidance.charactersPerSecond,
      code === "overlap" ? ordered.filter((other) => other.id !== cue.id && other.start < cue.end && other.end > cue.start).map((other) => [other.id, other.start, other.end]) : undefined]);
    const key = code + ":" + context;
    issues.push({ cueId: cue.id, code, key, message, acknowledged: code !== "invalid" && Boolean(cue.reviewNote?.trim()) && Boolean(cue.acknowledgedWarnings?.includes(key)) });
  };
  for (let index = 0; index < ordered.length; index++) {
    const cue = ordered[index];
    if (!isSubtitleInterval(cue.start, cue.end)) add(cue, "invalid", "Invalid or unrepresentable cue interval.");
    let coverage=cue.start;
    for(const r of orderedRanges){if(r.start>coverage)break;if(r.end>coverage)coverage=r.end;}
    if (range && coverage<cue.end) add(cue, "outside", "Part or all of this cue is outside the selected output.");
    if (index && ordered.slice(0, index).some((previous) => previous.end > cue.start && previous.start < cue.end)) add(cue, "overlap", "Overlaps another cue.");
    if (cue.text.split("\n").some((line) => [...line].length > guidance.lineLength) || cue.text.split("\n").length > 2) add(cue, "line", "Long caption lines. Consider splitting this cue.");
    if (cue.end > cue.start && [...cue.text].length / (cue.end - cue.start) > guidance.charactersPerSecond) add(cue, "speed", "Fast reading pace. Review the duration or wording.");
  }
  return issues;
}
