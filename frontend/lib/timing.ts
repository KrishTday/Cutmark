/** All times are seconds. A source range is [start, end): out is excluded. */
export type SourceSeconds = number;
export type SequenceSeconds = number;
export type ExportSeconds = number;
export interface SourceRange { id: string; sourceId: string; start: SourceSeconds; end: SourceSeconds }

export function parseTime(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(text) && !/^\d+:\d{2}(?:\.\d+)?$/.test(text) && !/^\d+:\d{2}:\d{2}(?:\.\d+)?$/.test(text)) return null;
  const parts = text.split(":").map(Number);
  if (parts.length > 1 && parts[parts.length - 1] >= 60) return null;
  if (parts.length === 3 && parts[1] >= 60) return null;
  const result = parts.reduce((total, part) => total * 60 + part, 0);
  return Number.isFinite(result) ? result : null;
}

export function formatTime(seconds: number, precision = 3): string {
  const factor = 10 ** precision;
  const ticks = Math.round(Math.max(0, Number.isFinite(seconds) ? seconds : 0) * factor);
  const hours = Math.floor(ticks / (3600 * factor));
  const minutes = Math.floor(ticks / (60 * factor)) % 60;
  const wholeSeconds = Math.floor(ticks / factor) % 60;
  const fraction = precision ? "." + String(ticks % factor).padStart(precision, "0") : "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}${fraction}`;
}

/** Microsecond precision is shared with WebCodecs; don't impose a 100ms minimum. */
export function minimumSelection(duration: number, frameRate?: number | null): number { return Math.min(duration, frameRate && Number.isFinite(frameRate) && frameRate > 0 ? 1 / frameRate : 0.000001); }
export function validateRange(start: number, end: number, duration: number, frameRate?: number | null): string | null {
  if (![start, end, duration].every(Number.isFinite) || duration <= 0) return "Wait for readable video metadata.";
  if (start < 0 || end > duration) return "The selection must stay within the source.";
  if (end <= start) return "The out point must be later than the in point.";
  if (end - start + 0.0000001 < minimumSelection(duration, frameRate)) return "Select at least one source frame.";
  return null;
}

export function sourceToSequence(time: SourceSeconds, ranges: SourceRange[]): SequenceSeconds | null {
  let offset = 0;
  for (const range of ranges) {
    if (time >= range.start && time < range.end) return offset + time - range.start;
    offset += range.end - range.start;
  }
  return null;
}
export function sequenceToSource(time: SequenceSeconds, ranges: SourceRange[]): SourceSeconds | null {
  if (!Number.isFinite(time) || time < 0) return null;
  let offset = 0;
  for (const range of ranges) {
    if (time < offset + range.end - range.start) return range.start + time - offset;
    offset += range.end - range.start;
  }
  return null;
}
export function mapCuesToOutput<T extends { start: number; end: number }>(cues: T[], ranges: SourceRange[]): T[] {
  let offset = 0;
  const mapped: T[] = [];
  for (const range of ranges) {
    for (const cue of cues) {
      const start = Math.max(range.start, cue.start), end = Math.min(range.end, cue.end);
      if (end > start) mapped.push({ ...cue, start: offset + start - range.start, end: offset + end - range.start });
    }
    offset += range.end - range.start;
  }
  return mapped.sort((a, b) => a.start - b.start);
}

/** Repeated source ranges intentionally yield multiple sequence positions. */
export interface SequenceOccurrence {
  rangeId: string; sourceId: string; rangeIndex: number;
  sourceTime: SourceSeconds; sequenceTime: SequenceSeconds;
}
export function validateSequence(ranges: SourceRange[], sourceId: string, duration: number, frameRate?: number | null): string | null {
  if (!ranges.length) return "Add at least one source range.";
  const ids = new Set<string>();
  for (const range of ranges) {
    if (!range.id || ids.has(range.id)) return "Each source range needs a unique identifier.";
    ids.add(range.id);
    if (range.sourceId !== sourceId) return "Every range must reference the open source.";
    const error = validateRange(range.start, range.end, duration, frameRate);
    if (error) return error;
  }
  return null;
}
/** Only use with validated ranges. Order and repetitions are preserved. */
export function sequenceDuration(ranges: SourceRange[]): SequenceSeconds {
  return ranges.reduce((total, range) => total + range.end - range.start, 0);
}
export function sourceOccurrences(time: SourceSeconds, sourceId: string, ranges: SourceRange[]): SequenceOccurrence[] {
  if (!Number.isFinite(time)) return [];
  const hits: SequenceOccurrence[] = [];
  let offset = 0;
  ranges.forEach((range, rangeIndex) => {
    if (range.sourceId === sourceId && time >= range.start && time < range.end)
      hits.push({ rangeId: range.id, sourceId, rangeIndex, sourceTime: time, sequenceTime: offset + time - range.start });
    offset += range.end - range.start;
  });
  return hits;
}
/** Joins belong to the following range; total duration is excluded. */
export function sequenceOccurrence(time: SequenceSeconds, ranges: SourceRange[]): SequenceOccurrence | null {
  if (!Number.isFinite(time) || time < 0) return null;
  let offset = 0;
  for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex++) {
    const range = ranges[rangeIndex], end = offset + range.end - range.start;
    if (time < end) return { rangeId: range.id, sourceId: range.sourceId, rangeIndex, sourceTime: range.start + time - offset, sequenceTime: time };
    offset = end;
  }
  return null;
}
