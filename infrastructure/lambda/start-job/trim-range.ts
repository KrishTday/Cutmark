export function isValidTrimRange(trimStart: number, trimEnd: number): boolean {
  return Number.isFinite(trimStart) && Number.isFinite(trimEnd) && trimStart >= 0 && trimEnd > trimStart;
}
