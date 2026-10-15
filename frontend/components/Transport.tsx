"use client";
interface Props {
  playing: boolean; disabled: boolean; loop: boolean; rate: number; volume: number; mode: "source" | "selection" | "context"; contextSeconds: number; replayAvailable: boolean;
  onToggle: () => void; onStep: (direction: -1 | 1) => void; onJump: (point: "left" | "right") => void; onSelection: () => void;
  onLoop: (value: boolean) => void; onRate: (value: number) => void; onVolume: (value: number) => void;
  onContext: (point: "left" | "right") => void; onContextSeconds: (value: number) => void; onReplay: () => void;
  onFullscreen: () => void; onPip: () => void; pipSupported: boolean;
}
export default function Transport(props: Props) {
  return <section aria-label="Editor transport" className="mt-3 space-y-2">
    <div className="transport-primary flex flex-wrap items-center gap-2">
      <button type="button" onClick={props.onToggle} disabled={props.disabled} aria-label={props.playing ? "Pause preview" : "Play preview"} title="Space when the workspace has focus" className="min-h-11 rounded-md bg-accent px-4 text-sm font-semibold text-paper disabled:opacity-40">{props.playing ? "Pause" : "Play"}</button>
      <button type="button" disabled={props.disabled} onClick={() => props.onStep(-1)} className="timeline-tool" title="Left arrow">Previous frame</button>
      <button type="button" disabled={props.disabled} onClick={() => props.onStep(1)} className="timeline-tool" title="Right arrow">Next frame</button>
      <button type="button" disabled={props.disabled} onClick={props.onSelection} className="timeline-tool">Preview selection</button>
    </div>
    <details className="playback-options"><summary>Playback options</summary>
    <div className="transport-secondary flex flex-wrap items-center gap-3 text-xs text-ink-muted">      <button type="button" disabled={props.disabled} onClick={() => props.onJump("left")} className="timeline-tool">In point</button>
      <button type="button" disabled={props.disabled} onClick={() => props.onJump("right")} className="timeline-tool">Last included frame</button>

      <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={props.loop} disabled={props.disabled} onChange={(event) => props.onLoop(event.target.checked)} />Loop selection</label>
      <label className="flex items-center gap-2">Preview speed<select aria-label="Preview playback speed" value={props.rate} disabled={props.disabled} onChange={(event) => props.onRate(Number(event.target.value))} className="min-h-10 rounded border border-line bg-well px-2 text-ink">{[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
      <label className="flex items-center gap-2">Preview volume<input type="range" aria-label="Preview volume" min={0} max={1} step={0.01} value={props.volume} disabled={props.disabled} onChange={(event) => props.onVolume(Number(event.target.value))} className="min-h-10 w-24 accent-accent" /></label>
      <details><summary className="cursor-pointer px-2 py-2">Review a cut</summary><div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-line p-2">
        <label className="flex items-center gap-2">Before and after<input type="number" aria-label="Cut context seconds" min={0.1} max={5} step={0.1} value={props.contextSeconds} onChange={(event) => { const value = Number(event.target.value); if (value >= 0.1 && value <= 5) props.onContextSeconds(value); }} className="min-h-10 w-16 rounded border border-line bg-well px-2 text-ink" /><span>seconds</span></label>
        <button type="button" disabled={props.disabled} onClick={() => props.onContext("left")} className="timeline-tool">Review in point</button>
        <button type="button" disabled={props.disabled} onClick={() => props.onContext("right")} className="timeline-tool">Review out point</button>
        <button type="button" disabled={props.disabled || !props.replayAvailable} onClick={props.onReplay} className="timeline-tool">Replay cut context</button>
      </div></details>
      <details><summary className="cursor-pointer px-2 py-2">Display</summary><div className="mt-2 flex gap-2"><button type="button" disabled={props.disabled} onClick={props.onFullscreen} className="timeline-tool">Fullscreen</button><button type="button" disabled={props.disabled || !props.pipSupported} title={props.pipSupported ? "Open the preview in a separate video window" : "Picture in picture is unavailable in this browser"} onClick={props.onPip} className="timeline-tool">Picture in picture</button></div></details>
    </div>
    </details>
    <p className={"text-xs " + (props.mode === "context" ? "text-amber-200" : "text-ink-muted")} role="status">{props.mode === "context" ? "Cut context review · includes footage outside your output selection." : props.mode === "selection" ? "Selected output review · the out point is excluded." : "Source review · speed and volume affect preview only."}</p>
  </section>;
}
