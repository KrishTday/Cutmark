export function escapeSubtitleText(text:string):string{return text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
export function decodeSubtitleText(text:string):string{
  return text.replace(/&(?:amp|lt|gt|nbsp|quot|apos|#\d+|#x[0-9a-f]+);/gi,entity=>{
    const named:Record<string,string>={"&amp;":"&","&lt;":"<","&gt;":">","&nbsp;":" ","&quot;":'"',"&apos;":"'"};
    if(named[entity.toLowerCase()])return named[entity.toLowerCase()];
    const code=entity[2].toLowerCase()==="x"?parseInt(entity.slice(3,-1),16):Number(entity.slice(2,-1));
    return code>0&&code<=0x10ffff&&(code<0xd800||code>0xdfff)?String.fromCodePoint(code):entity;
  });
}
