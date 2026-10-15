export interface ImageReference {kind:"image";fileName:string;mime:string;bytes:number;fingerprint:string;algorithm:"sha256-chunks-4m-v1";metadata:{width:number;height:number}}
export interface ImageOverlay {id:string;start:number;end:number;assetId:string;reference:ImageReference;x:number;y:number;size:number;opacity:number}
export interface RenderImage extends ImageOverlay {blob?:Blob}
export interface LoadedImage {overlay:RenderImage;bitmap:ImageBitmap}
export function bindImages(overlays:ImageOverlay[],media:Record<string,Blob>):RenderImage[]{return overlays.map(overlay=>({...overlay,blob:media[overlay.reference.fingerprint]}));}
export async function loadImageLayers(overlays:RenderImage[]):Promise<LoadedImage[]>{
 const unique=new Map(overlays.map(overlay=>[overlay.reference.fingerprint,overlay.reference.metadata.width*overlay.reference.metadata.height]));if([...unique.values()].reduce((sum,pixels)=>sum+pixels,0)>16_777_216)throw new Error("Combined image layers exceed 16 megapixels. Use smaller images or fewer layers.");
 const decoded=new Map<Blob,ImageBitmap>();const layers:LoadedImage[]=[];
 try{
  for(const overlay of overlays){
   if(!overlay.blob)throw new Error("Relink missing image: "+overlay.reference.fileName);
   if(overlay.blob.size>2*1024*1024||await imageMime(overlay.blob)!==overlay.reference.mime)throw new Error("This image does not match a supported saved image format.");
   let bitmap=decoded.get(overlay.blob);if(!bitmap){bitmap=await createImageBitmap(overlay.blob);decoded.set(overlay.blob,bitmap);if(bitmap.width!==overlay.reference.metadata.width||bitmap.height!==overlay.reference.metadata.height||bitmap.width>4096||bitmap.height>4096||bitmap.width*bitmap.height>8_388_608)throw new Error("Image dimensions are invalid or too large. Use an image up to 4096 pixels per edge and 8 megapixels.");}
   layers.push({overlay,bitmap});
  }
  return layers;
 }catch(error){decoded.forEach(bitmap=>bitmap.close());throw error;}
}
export function closeImageLayers(layers:LoadedImage[]){new Set(layers.map(layer=>layer.bitmap)).forEach(bitmap=>bitmap.close());}
export function drawImageLayers(context:CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D,layers:LoadedImage[],time:number,width:number,height:number){
 for(const {overlay,bitmap}of layers){if(time<overlay.start||time>=overlay.end)continue;const scale=Math.min(width*overlay.size/100/bitmap.width,height*.9/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale,x=Math.max(0,Math.min(width-w,width*overlay.x/100-w/2)),y=Math.max(0,Math.min(height-h,height*overlay.y/100-h/2));context.save();context.globalAlpha=overlay.opacity;context.drawImage(bitmap,x,y,w,h);context.restore();}
}

export async function imageMime(blob:Blob):Promise<"image/png"|"image/jpeg"|"image/webp"|null>{const h=new Uint8Array(await blob.slice(0,12).arrayBuffer());return h.slice(0,8).join(",")==="137,80,78,71,13,10,26,10"?"image/png":h[0]===255&&h[1]===216&&h[2]===255?"image/jpeg":String.fromCharCode(...h.slice(0,4))==="RIFF"&&String.fromCharCode(...h.slice(8,12))==="WEBP"?"image/webp":null;}
