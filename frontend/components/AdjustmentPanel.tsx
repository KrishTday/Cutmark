"use client";
import NumericField from "./NumericField";
import CommitSlider from "./CommitSlider";
import {DEFAULT_FRAMING,DEFAULT_AUDIO,type Framing,type AudioAdjustments} from "@/lib/adjustments";
export default function AdjustmentPanel({framing,audio,hasAudio,disabled,onChange,onPreview}:{framing:Framing;audio:AudioAdjustments;hasAudio:boolean;disabled:boolean;onChange:(f:Framing,a:AudioAdjustments,action:string,group?:string)=>void;onPreview:()=>void}){
 const f=(value:Partial<Framing>,action="Change framing")=>onChange({...framing,...value},audio,action,value.background!==undefined?"framing-background":undefined);
 const a=(value:Partial<AudioAdjustments>)=>onChange(framing,{...audio,...value},"Change exported audio");
 return <details className="mt-3 rounded-lg border border-line p-3 text-xs text-ink-muted"><summary className="cursor-pointer py-2">Framing and audio · {framing.ratio} · {audio.mute?"muted":audio.gainDb+" dB"}</summary>
 <p className="mt-2">Framing changes the output canvas. Fill crops the image; Fit preserves it with a solid background. Positive gain may clip. Listening volume is separate; render a preview to hear exported gain and fades across the whole sequence.</p>
 <fieldset disabled={disabled} className="mt-3 grid grid-cols-2 gap-3"><legend className="font-semibold text-ink">Framing</legend>
 <label>Output aspect ratio<select aria-label="Output aspect ratio" value={framing.ratio} onChange={e=>f({ratio:e.target.value as Framing["ratio"]})} className="mt-1 min-h-10 w-full rounded bg-well p-2">{["original","16:9","9:16","1:1","4:5","custom"].map(value=><option key={value}>{value}</option>)}</select></label>
 <label>Fit or fill<select aria-label="Fit or fill" value={framing.fit} onChange={e=>f({fit:e.target.value as Framing["fit"]})} className="mt-1 min-h-10 w-full rounded bg-well p-2"><option value="fit">Fit complete image</option><option value="fill">Fill with crop</option></select></label>
 {framing.ratio==="custom"&&(["customWidth","customHeight"] as const).map(key=><label key={key}>Custom ratio {key==="customWidth"?"width":"height"}<NumericField label={"Custom ratio "+(key==="customWidth"?"width":"height")} min={1} max={100} value={framing[key]} onCommit={value=>f({[key]:value})}/></label>)}
 {(["x","y","zoom"] as const).map(key=><label key={key}>{key==="x"?"Horizontal position":key==="y"?"Vertical position":"Image scale"} · {framing[key]}<CommitSlider label={key==="x"?"Horizontal position":key==="y"?"Vertical position":"Image scale"} min={key==="zoom"?1:0} max={key==="zoom"?3:100} step={key==="zoom"?.05:1} value={framing[key]} onCommit={value=>f({[key]:value})}/><NumericField label={(key==="x"?"Horizontal position":key==="y"?"Vertical position":"Image scale")+" value"} min={key==="zoom"?1:0} max={key==="zoom"?3:100} value={framing[key]} onCommit={value=>f({[key]:value})}/></label>)}
 <label>Background<input aria-label="Framing background" type="color" value={framing.background} onChange={e=>f({background:e.target.value})} className="mt-1 min-h-10 w-full rounded bg-well"/></label>
 <label>Rotation<select aria-label="Output rotation" value={framing.rotation} onChange={e=>f({rotation:Number(e.target.value) as Framing["rotation"]})} className="mt-1 min-h-10 w-full rounded bg-well p-2">{[0,90,180,270].map(value=><option key={value} value={value}>{value}°</option>)}</select></label>
 <div>{(["flipX","flipY"] as const).map(key=><label key={key} className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={framing[key]} onChange={e=>f({[key]:e.target.checked})}/>{key==="flipX"?"Flip horizontally":"Flip vertically"}</label>)}</div>
 <button type="button" onClick={()=>onChange(DEFAULT_FRAMING,audio,"Reset framing")} className="timeline-tool">Reset framing</button>
 </fieldset>
 <fieldset disabled={disabled||!hasAudio} className="mt-4 grid grid-cols-2 gap-3"><legend className="font-semibold text-ink">Exported audio {hasAudio?"":"· no source track"}</legend>
 <label className="flex min-h-10 items-center gap-2"><input aria-label="Mute exported audio" type="checkbox" checked={audio.mute} onChange={e=>a({mute:e.target.checked})}/>Mute signal (keep track)</label>
 <label>Gain · {audio.gainDb} dB<CommitSlider label="Exported gain" min={-24} max={12} value={audio.gainDb} onCommit={value=>a({gainDb:value})}/></label>
 {(["fadeIn","fadeOut"] as const).map(key=><label key={key}>{key==="fadeIn"?"Fade in":"Fade out"} (seconds)<NumericField label={key==="fadeIn"?"Export fade in":"Export fade out"} min={0} max={10} value={audio[key]} onCommit={value=>a({[key]:value})}/></label>)}
 <button type="button" onClick={()=>onChange(framing,DEFAULT_AUDIO,"Reset exported audio")} className="timeline-tool">Reset audio</button>
 </fieldset>
 {audio.gainDb>0&&!audio.mute&&<p className="mt-2 text-amber-200">Gain above 0 dB may exceed the signal ceiling. Inspect the rendered preview before delivery.</p>}
 <button type="button" disabled={disabled} onClick={onPreview} className="timeline-tool mt-3">Render adjusted preview</button></details>;
}
