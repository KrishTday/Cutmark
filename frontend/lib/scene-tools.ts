export type SceneSensitivity = "fewer" | "balanced" | "more";
export interface SceneSettings { mode: "quick" | "refined"; sensitivity: SceneSensitivity; scope: "source" | "selection" }
export interface SceneCut { id: string; time: number; origin: "detected" | "manual" | "legacy"; confirmed: boolean; refined?: boolean; score?: number; bracket?: {start:number;end:number} }
export interface EditorialMarker { id: string; time: number; name: string; note: string; color: "lavender" | "gold" | "green" | "rose" }
export interface SceneAnalysis {
  sourceId: string; start: number; end: number; settings: SceneSettings; algorithm: "pixel-difference-v1";
  createdAt: number; samplesChecked: number; plannedSamples: number; interval: number; coverageEnd: number;
  complete: boolean; refinedCount: number; reason?: string;
}
export interface SceneSample { from: number; time: number; score: number }
export function pixelDifference(left: Uint8ClampedArray, right: Uint8ClampedArray): number {
  if (left.length !== right.length || !left.length) return 0;
  let sum = 0;
  for (let index = 0; index < left.length; index += 4) sum += Math.abs(left[index] - right[index]) + Math.abs(left[index + 1] - right[index + 1]) + Math.abs(left[index + 2] - right[index + 2]);
  return sum / (left.length / 4 * 3 * 255);
}
export function findSceneCandidates(samples: SceneSample[], sensitivity: SceneSensitivity): SceneSample[] {
  const threshold = sensitivity === "fewer" ? .26 : sensitivity === "more" ? .11 : .18;
  const candidates = samples.filter((sample, index) => {
    if (sample.score < threshold) return false;
    const nearby = [-2,-1,1,2].map(offset => samples[index + offset]?.score).filter((score): score is number => score !== undefined);
    const baseline = nearby.length ? nearby.reduce((sum, score) => sum + score, 0) / nearby.length : 0;
    return sample.score >= (samples[index - 1]?.score ?? 0) && sample.score >= (samples[index + 1]?.score ?? 0) && sample.score >= baseline * 1.8 + .045;
  });
  return candidates.reduce<SceneSample[]>((kept, sample) => {
    const previous = kept[kept.length - 1];
    if (previous && sample.time - previous.time < .12) { if (sample.score > previous.score) kept[kept.length - 1] = sample; }
    else kept.push(sample);
    return kept;
  }, []);
}
export function cutsFromLegacy(times: number[]): SceneCut[] {
  return times.map((time,index) => ({id:"legacy-cut-" + index + "-" + time,time,origin:"legacy",confirmed:false}));
}
export function mergeSceneScan(previous: SceneCut[], detected: SceneCut[], start: number, end: number, replace: boolean, dismissed: {start:number;end:number}[] = []): SceneCut[] {
  const kept = previous.filter(cut => cut.time < start || cut.time >= end || (!replace && (cut.origin !== "detected" || cut.confirmed)));
  for (const candidate of detected) {
    if (candidate.time <= start || candidate.time >= end || !Number.isFinite(candidate.time)) continue;
    if (!replace && dismissed.some(area => candidate.time >= area.start && candidate.time <= area.end)) continue;
    if (kept.some(cut => Math.abs(cut.time - candidate.time) <= .15 || Boolean(cut.confirmed && cut.bracket && candidate.time >= cut.bracket.start && candidate.time <= cut.bracket.end))) continue;
    kept.push(candidate);
  }
  return kept.sort((a,b) => a.time - b.time);
}
export function sceneBetween(time: number, cuts: SceneCut[], duration: number): { start: number; end: number } {
  const boundaries = [0,...cuts.map(cut=>cut.time).filter(value=>value>0&&value<duration),duration].sort((a,b)=>a-b);
  const index = Math.max(0,boundaries.findIndex((value,index)=>index>0 && time<value)-1);
  if (time >= duration) return {start:boundaries[boundaries.length-2],end:duration};
  return {start:boundaries[index],end:boundaries[index+1]};
}
export function analysisMatches(analysis: SceneAnalysis | undefined, sourceId: string, start: number, end: number, settings: SceneSettings): boolean {
  return Boolean(analysis?.complete && analysis.sourceId===sourceId && analysis.start===start && analysis.end===end && analysis.settings.mode===settings.mode && analysis.settings.scope===settings.scope && analysis.settings.sensitivity===settings.sensitivity);
}
