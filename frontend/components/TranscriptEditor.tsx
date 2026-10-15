"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { isSubtitleInterval, type CaptionCue } from "@/lib/captions";
import { captionIssues, mergeCaptions, replaceCaptionText, shiftCaptions, splitCaption, type CaptionGuidance } from "@/lib/caption-editing";
import { formatTime, validateRange, type SourceRange } from "@/lib/timing";
import NumericField from "./NumericField";
import TimeField from "./TimeField";
interface Props {
  contextLabel?:string;cues: CaptionCue[]; duration: number; disabled?: boolean; activeCueId?: number; range?: SourceRange|SourceRange[]; saveStatus?: string; guidance: CaptionGuidance;
  onGuidance: (guidance: CaptionGuidance) => void; getPlayhead: () => number; onSeek: (time: number) => void;
  onPassage?:(start:number,end:number,mode:"keep"|"remove")=>void;onReviewPassage?:(start:number,end:number)=>void;
  onChange: (cues: CaptionCue[], group?: string, action?: string) => void;
}
function TranscriptEditor({ contextLabel,cues, duration, disabled, activeCueId, range, saveStatus, guidance, onGuidance, getPlayhead, onSeek, onChange, onPassage, onReviewPassage }: Props) {
  const [passagePadding,setPassagePadding]=useState(.15),[passageMode,setPassageMode]=useState<"keep"|"remove"|null>(null);
  const [query, setQuery] = useState(""), [replacement, setReplacement] = useState(""), [replaceOpen, setReplaceOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]), [shift, setShift] = useState("0"), [message, setMessage] = useState("");
  const chosen=cues.filter(c=>selected.includes(c.id));
  const passageStart=chosen.length?Math.max(0,Math.min(...chosen.map(c=>c.start))+(passageMode==="remove"?passagePadding:-passagePadding)):0;
  const passageEnd=chosen.length?Math.min(duration,Math.max(...chosen.map(c=>c.end))+(passageMode==="remove"?-passagePadding:passagePadding)):0;
  const [cursor, setCursor] = useState<{ id: number; position: number } | null>(null);
  const [autoScroll, setAutoScroll] = useState(true), [browsing, setBrowsing] = useState(false), [focusRequest, setFocusRequest] = useState<{ id: number; serial: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const issues = useMemo(() => captionIssues(cues, range, guidance), [cues, range, guidance]);
  const visible = useMemo(() => cues.filter((cue) => !query || cue.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => a.start - b.start), [cues, query]);
  const changes = useMemo(() => cues.flatMap((cue) => { const text = replaceCaptionText(cue.text, query, replacement); return text === cue.text ? [] : [{ id: cue.id, before: cue.text, after: text }]; }), [cues, query, replacement]);
  useEffect(() => {
    if (!autoScroll || browsing || activeCueId === undefined || list.current?.contains(document.activeElement)) return;
    const container = list.current, cue = container?.querySelector<HTMLElement>('[data-cue-id="' + activeCueId + '"]');
    if (!container || !cue) return;
    const panel = container.getBoundingClientRect(), box = cue.getBoundingClientRect();
    if (box.top < panel.top) container.scrollTop += box.top - panel.top;
    else if (box.bottom > panel.bottom) container.scrollTop += Math.min(box.top - panel.top, box.bottom - panel.bottom);
  }, [activeCueId, autoScroll, browsing]);
  useEffect(() => {
    if (focusRequest === null) return;
    const field = list.current?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Caption ' + focusRequest.id + ' text"]');
    field?.focus(); field?.scrollIntoView({ block: "nearest" });
  }, [focusRequest]);
  const changeCue = (id: number, update: Partial<CaptionCue>, group?: string, preserveReview = false) => onChange(cues.map((cue) => cue.id === id ? { ...cue, ...update, ...(preserveReview ? {} : { acknowledgedWarnings: [], reviewNote: "" }) } : cue), group, group ? "Edit caption text" : "Adjust caption");
  const addCue = () => {
    const start = Math.max(0, Math.min(Math.max(0, duration - 0.001), getPlayhead())), id = Math.max(0, ...cues.map((cue) => cue.id)) + 1;
    onChange([...cues, { id, start, end: Math.min(duration, start + 2), text: "New caption" }], undefined, "Add caption");
    setQuery(""); setFocusRequest((previous) => ({ id, serial: (previous?.serial ?? 0) + 1 })); setSelected([id]);
  };
  const operation = (callback: () => CaptionCue[], action: string) => {
    try { onChange(callback(), undefined, action); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No captions were changed."); }
  };
  const highlight = (text: string) => {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp("(" + escaped + ")", "giu"));
    return parts.map((part, index) => part.toLocaleLowerCase() === query.toLocaleLowerCase() ? <mark key={index} className="rounded bg-accent/30 px-0.5 text-ink">{part}</mark> : part);
  };
  return <section className="min-w-0" aria-label={contextLabel?"Caption transcript editor for "+contextLabel:"Caption transcript editor"}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-ink">Captions</h2><button type="button" onClick={addCue} disabled={disabled || duration <= 0} className="timeline-tool">Add caption</button></div>
    <p className="mt-2 text-xs text-ink-muted">Source timestamps · click a cue to seek. Edits save automatically.</p>
    {saveStatus && <p className="mt-1 text-xs text-ink-muted" role="status">{saveStatus}</p>}
    <div className="mt-3 flex gap-2"><input type="search" aria-label="Search captions" value={query} onChange={(event) => { setQuery(event.target.value); setBrowsing(true); }} placeholder="Find a word or name…" className="min-h-10 min-w-0 flex-1 rounded border border-line bg-well px-3 text-sm text-ink" /><button type="button" className="timeline-tool" aria-expanded={replaceOpen} onClick={() => setReplaceOpen((value) => !value)}>Replace</button></div>
    {replaceOpen && <div className="mt-2 rounded-lg border border-line p-3">
      <label className="text-xs text-ink-muted">Replace with<input aria-label="Replacement caption text" value={replacement} onChange={(event) => setReplacement(event.target.value)} className="mt-1 min-h-10 w-full rounded border border-line bg-well px-2 text-sm text-ink" /></label>
      <p className="mt-2 text-xs text-ink-muted">{changes.length} cues would change.</p>
      <div className="mt-2 max-h-32 space-y-2 overflow-auto text-xs text-ink-muted">{changes.map((change) => <p key={change.id}>{change.before}<br /><span className="text-ink">→ {change.after}</span></p>)}</div>
      <button type="button" disabled={disabled || !changes.length} onClick={() => operation(() => cues.map((cue) => { const text = replaceCaptionText(cue.text, query, replacement); return text === cue.text ? cue : { ...cue, text, acknowledgedWarnings: [], reviewNote: "" }; }), "Replace caption text")} className="timeline-tool mt-2">Apply replace</button>
    </div>}
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
      <label className="flex items-center gap-1.5"><input type="checkbox" checked={autoScroll} onChange={(event) => { setAutoScroll(event.target.checked); setBrowsing(false); }} />Follow active cue</label>
      {browsing && autoScroll && <button type="button" onClick={() => { setBrowsing(false); setQuery(""); }} className="timeline-tool">Resume cue follow</button>}
      <span className="ml-auto">{selected.filter((id) => cues.some((cue) => cue.id === id)).length} selected</span>
    </div>
    <details className="mt-3 rounded-lg border border-line px-3 py-2 text-xs text-ink-muted"><summary className="cursor-pointer">Cue operations</summary>
      <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={disabled || selected.length < 2} onClick={() => operation(() => mergeCaptions(cues, selected), "Merge captions")} className="timeline-tool">Merge adjacent</button><button type="button" disabled={disabled || !selected.length} onClick={() => operation(() => cues.filter((cue) => !selected.includes(cue.id)), "Delete captions")} className="timeline-tool">Delete selected</button></div>
      <label className="mt-3 flex flex-wrap items-center gap-2">Shift selected by<input type="text" aria-label="Shift selected captions in seconds" value={shift} onChange={(event) => setShift(event.target.value)} className="min-h-10 w-24 rounded border border-line bg-well px-2 text-sm text-ink" /><span>seconds</span><button type="button" disabled={disabled || !selected.length} onClick={() => operation(() => shiftCaptions(cues, selected, /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(shift.trim()) ? Number(shift) : NaN, duration), "Shift captions")} className="timeline-tool">Apply shift</button></label>
    </details>
    <details className="mt-2 rounded-lg border border-line px-3 py-2 text-xs text-ink-muted"><summary className="cursor-pointer">Readability guidance · {issues.filter((issue) => !issue.acknowledged).length} to review</summary>
      <label className="mt-2 flex items-center justify-between gap-2">Characters per line<NumericField label="Caption line length guidance" value={guidance.lineLength} min={10} max={100} disabled={disabled} onCommit={value=>onGuidance({...guidance,lineLength:value})}/></label>
      <label className="mt-2 flex items-center justify-between gap-2">Characters per second<NumericField label="Caption reading speed guidance" value={guidance.charactersPerSecond} min={5} max={60} disabled={disabled} onCommit={value=>onGuidance({...guidance,charactersPerSecond:value})}/></label>
      <p className="mt-2">Guidance flags issues without rewriting words. Add a reason when keeping an intentional exception.</p>
    </details>
    {message && <p className="mt-2 text-xs text-rose-300" role="alert">{message}</p>}
    <div ref={list} className="mt-3 max-h-[62dvh] space-y-3 overflow-auto pr-1" onWheel={() => setBrowsing(true)} onTouchStart={() => setBrowsing(true)} onPointerDown={() => setBrowsing(true)} onKeyDown={(event) => { if (["PageDown", "PageUp", "Home", "End"].includes(event.key)) setBrowsing(true); }}>
      {visible.map((cue) => {
        const warnings = issues.filter((issue) => issue.cueId === cue.id), active = activeCueId === cue.id;
        return <article key={cue.id} data-cue-id={cue.id} aria-label={"Caption cue " + cue.id} className={"rounded-lg border p-3 " + (active ? "border-accent bg-accent-soft" : "border-line bg-[#202127]")}>
          <div className="flex items-center justify-between gap-2"><label className="flex min-h-9 items-center gap-2 text-xs text-ink-muted"><input type="checkbox" aria-label={"Select caption " + cue.id} checked={selected.includes(cue.id)} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, cue.id] : previous.filter((id) => id !== cue.id))} />Cue {cue.id}{active ? " · Active" : ""}</label><button type="button" onClick={() => onSeek(cue.start)} aria-label={"Seek to caption " + cue.id} className="timeline-tool">{formatTime(cue.start, 2)}</button></div>
          {query && <p className="my-2 text-sm text-ink">{highlight(cue.text)}</p>}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-ink-muted">In<TimeField value={cue.start} label={"Caption " + cue.id + " start time"} disabled={disabled} validate={(start) => validateRange(start, cue.end, duration) ?? (isSubtitleInterval(start, cue.end) ? null : "Caption times must remain distinct at millisecond precision.")} onCommit={(start) => changeCue(cue.id, { start })} /></label>
            <label className="text-xs text-ink-muted">Out<TimeField value={cue.end} label={"Caption " + cue.id + " end time"} disabled={disabled} validate={(end) => validateRange(cue.start, end, duration) ?? (isSubtitleInterval(cue.start, end) ? null : "Caption times must remain distinct at millisecond precision.")} onCommit={(end) => changeCue(cue.id, { end })} /></label>
          </div>
          <label className="mt-2 block text-xs text-ink-muted">Text<textarea aria-label={"Caption " + cue.id + " text"} rows={3} disabled={disabled} value={cue.text} onChange={(event) => changeCue(cue.id, { text: event.target.value }, "caption-text-" + cue.id)} onSelect={(event) => setCursor({ id: cue.id, position: event.currentTarget.selectionStart })} className="mt-1 min-h-20 w-full resize-y rounded border border-line-strong bg-well px-3 py-2 text-sm leading-relaxed text-ink" /></label>
          <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={disabled || cursor?.id !== cue.id || !cursor.position || cursor.position >= cue.text.length || !active} onClick={() => operation(() => splitCaption(cues, cue.id, getPlayhead(), cursor?.position ?? 0), "Split caption")} className="timeline-tool" title="Split timing at the playhead and wording at your text cursor">Split at playhead</button><button type="button" disabled={disabled} onClick={() => operation(() => cues.filter((value) => value.id !== cue.id), "Remove caption")} aria-label={"Remove caption " + cue.id} className="timeline-tool">Remove</button></div>
          {warnings.length > 0 && <div className="mt-2 space-y-1 text-xs text-amber-200">{warnings.map((warning) => <p key={warning.code}>{warning.acknowledged ? "✓ Reviewed: " : "Review: "}{warning.message}</p>)}
            <label className="mt-2 block text-xs text-ink-muted">Reason for keeping an exception<input aria-label={"Caption " + cue.id + " review note"} value={cue.reviewNote ?? ""} disabled={disabled} onChange={(event) => changeCue(cue.id, { reviewNote: event.target.value }, "caption-note-" + cue.id, true)} className="mt-1 min-h-10 w-full rounded border border-line bg-well px-2 text-sm text-ink" /></label>
            <button type="button" disabled={disabled || !cue.reviewNote?.trim()} onClick={() => changeCue(cue.id, { acknowledgedWarnings: warnings.filter((warning) => warning.code !== "invalid").map((warning) => warning.key) }, undefined, true)} className="timeline-tool mt-2">Acknowledge guidance</button>
          </div>}
        </article>;
      })}
    </div>
    {onPassage&&<details className="mt-3 rounded-lg border border-line p-3 text-xs text-ink-muted"><summary className="cursor-pointer py-2">Edit video from selected cues</summary><p>Use source cue intervals from the first selected cue to the last. These are segment timings, not individual word boundaries. Kept passages gain padding; removal leaves padding inside both ends. Caption wording stays saved.</p><label className="mt-2 block">Speech padding (seconds)<NumericField label="Passage padding" value={passagePadding} min={0} max={2} disabled={disabled} onCommit={setPassagePadding}/></label><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={disabled||!chosen.length} onClick={()=>setPassageMode("keep")} className="timeline-tool">Propose keep passage</button><button type="button" disabled={disabled||!chosen.length} onClick={()=>setPassageMode("remove")} className="timeline-tool">Propose remove passage</button></div>{passageMode&&chosen.length>0&&<div className="mt-2"><p>{passageMode==="keep"?"Keep only":"Remove"} {formatTime(passageStart)} – {formatTime(passageEnd)}. Review before applying; gaps close automatically.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={disabled||passageEnd<=passageStart} onClick={()=>onReviewPassage?.(passageStart,passageEnd)} className="timeline-tool">Review passage</button><button type="button" disabled={disabled||passageEnd<=passageStart} onClick={()=>{onPassage(passageStart,passageEnd,passageMode);setPassageMode(null);}} className="timeline-tool">Apply passage edit</button><button type="button" onClick={()=>setPassageMode(null)} className="timeline-tool">Discard proposal</button></div></div>}</details>}
    {!visible.length && <p className="mt-3 text-sm text-ink-muted">{query ? "No matching captions." : "Generate captions or add a cue at the playhead."}</p>}
  </section>;
}
export default memo(TranscriptEditor);
