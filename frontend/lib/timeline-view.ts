export interface TimelineView { start: number; span: number }
export function fitView(start: number, span: number, duration: number, minimum = 0.05): TimelineView {
  const safeDuration = Math.max(0.000001, duration);
  const safeSpan = Math.min(safeDuration, Math.max(Math.min(minimum, safeDuration), span));
  return { start: Math.max(0, Math.min(safeDuration - safeSpan, start)), span: safeSpan };
}
export function zoomView(view: TimelineView, factor: number, anchor: number, duration: number, minimum = 0.05): TimelineView {
  const fraction = Math.max(0, Math.min(1, (anchor - view.start) / view.span));
  const span = Math.min(duration, Math.max(Math.min(minimum, duration), view.span / factor));
  return fitView(anchor - fraction * span, span, duration, minimum);
}
export function snapInView(time: number, markers: number[], span: number, width: number, bypass = false): { time: number; target?: number } {
  if (bypass || width <= 0 || !markers.length) return { time };
  const nearest = markers.reduce((best, value) => Math.abs(value - time) < Math.abs(best - time) ? value : best, markers[0]);
  return Math.abs(nearest - time) <= 10 * span / width ? { time: nearest, target: nearest } : { time };
}
export function buildPeakPyramid(base: Float32Array): Float32Array[] {
  const levels = [base];
  while (levels[levels.length - 1].length > 1) {
    const previous = levels[levels.length - 1], next = new Float32Array(Math.ceil(previous.length / 2));
    for (let index = 0; index < next.length; index++) next[index] = Math.max(previous[index * 2], previous[index * 2 + 1] ?? 0);
    levels.push(next);
  }
  return levels;
}
export function peakAtPixel(levels: Float32Array[], binSeconds: number, from: number, to: number): number {
  if (!levels.length || binSeconds <= 0) return 0;
  // Query aligned pyramid blocks only when entirely inside the displayed interval.
  // Using overlapping coarse blocks can borrow a transient from a nearby pause.
  let index = Math.max(0, Math.floor(from / binSeconds));
  const end = Math.min(levels[0].length, Math.ceil(to / binSeconds));
  let peak = 0;
  while (index < end) {
    let level = 0;
    while (level + 1 < levels.length && index % (2 ** (level + 1)) === 0 && index + 2 ** (level + 1) <= end) level++;
    peak = Math.max(peak, levels[level][Math.floor(index / 2 ** level)]);
    index += 2 ** level;
  }
  return peak;
}
