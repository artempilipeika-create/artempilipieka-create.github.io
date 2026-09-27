// Physical UV units are metres. Texture dimensions describe the manufacturer's scan.
const local=value=>typeof value==='string'&&/^\/(?!\/)[\w/.-]+\.(?:png|jpe?g|webp)$/i.test(value)&&!value.includes('..')?value:null;
const hex=value=>typeof value==='string'&&/^#[\da-f]{6}$/i.test(value)?value:null;
export function materialVisual(data){
  const v=data?.visual||{};
  const texture=local(v.texture_url)||local(data?.renderTexture)||local(data?.texture_preview);
  const preview=local(v.preview_url)||local(data?.preview_url)||local(data?.preview);
  const color=hex(v.render_color)||hex(data?.renderColor)||hex(data?.preview_color)||hex(data?.color_hex)||hex(data?.color);
  const size=v.texture_size_mm;
  return {url:texture||preview,color,source:texture?'texture':preview?'preview':color?'color':'fallback',
    status:texture?'EXACT_TEXTURE':preview?'OFFICIAL_PREVIEW':color?'COLOR_ONLY':'MISSING_VISUAL',
    size:Array.isArray(size)&&size.length===2&&size.every(x=>Number.isFinite(x)&&x>0)?size:[1000,1000],
    rotation:Number.isFinite(v.rotation_deg)?v.rotation_deg:0,
    grain:v.grain_direction||'length',roughness:Number.isFinite(v.roughness)?Math.max(.15,Math.min(1,v.roughness)):.85};
}
export function physicalPanelUV(geometry,size,grainAxis){
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv,axes=['x','y','z'];
  const read=(a,i,axis)=>a.getComponent(i,axes.indexOf(axis));
  for(let i=0;i<p.count;i++){
    const face=axes.reduce((a,b)=>Math.abs(read(n,i,a))>=Math.abs(read(n,i,b))?a:b);
    const plane=axes.filter(a=>a!==face),v=plane.includes(grainAxis)?grainAxis:plane[1],u=plane.find(a=>a!==v);
    uv.setXY(i,read(p,i,u)+size[u]/2000,read(p,i,v)+size[v]/2000);
  }
  uv.needsUpdate=true;
}
