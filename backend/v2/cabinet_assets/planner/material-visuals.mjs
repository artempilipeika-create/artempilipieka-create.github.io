// Physical UV units are metres. Texture dimensions describe the manufacturer's scan.
const local=value=>typeof value==='string'&&/^\/(?!\/)[\w/.-]+\.(?:png|jpe?g|webp)$/i.test(value)&&!value.includes('..')?value:null;
const hex=value=>typeof value==='string'&&/^#[\da-f]{6}$/i.test(value)?value:null;
export const SURFACE_FINISHES=Object.freeze({auto:'По материалу',matte:'Матовая',satin:'Полуматовая',gloss:'Глянцевая'});
export function materialAppearance(value={}){
  return {scale:Number.isFinite(value?.scale)?Math.max(.25,Math.min(4,value.scale)):1,
    rotation:[0,90,180,270].includes(value?.rotation)?value.rotation:0,
    finish:Object.hasOwn(SURFACE_FINISHES,value?.finish)?value.finish:'auto'};
}
export function materialVisual(data,appearance){
  const v=data?.visual||{};
  const a=materialAppearance(appearance);
  const texture=local(v.texture_url)||local(data?.renderTexture)||local(data?.texture_preview);
  const preview=local(v.preview_url)||local(data?.preview_url)||local(data?.preview);
  const color=hex(v.render_color)||hex(data?.renderColor)||hex(data?.preview_color)||hex(data?.color_hex)||hex(data?.color);
  const size=v.texture_size_mm;
  const sample=Boolean(preview&&v.visual_status==='USER_PREVIEW'),mapped=v.map_to_surface!==false&&!sample;
  return {url:mapped?(texture||preview):null,color,source:mapped&&texture?'texture':mapped&&preview?'preview':color?'color':'fallback',
    status:texture?(v.visual_status==='USER_TEXTURE'?'USER_TEXTURE':'EXACT_TEXTURE'):sample?'USER_PREVIEW':preview?'OFFICIAL_PREVIEW':color?'COLOR_ONLY':'MISSING_VISUAL',
    size:(Array.isArray(size)&&size.length===2&&size.every(x=>Number.isFinite(x)&&x>0)?size:[1000,1000]).map(n=>n*a.scale),
    rotation:(Number.isFinite(v.rotation_deg)?v.rotation_deg:0)+a.rotation,
    grain:v.grain_direction||'length',finish:a.finish,
    roughness:a.finish==='auto'?(Number.isFinite(v.roughness)?Math.max(.15,Math.min(1,v.roughness)):.85):({matte:.86,satin:.48,gloss:.18})[a.finish]};
}
// Optical display presets, not manufacturer measurements. All sheet decor remains dielectric.
export function surfaceFinish(visual,role,hasMaterial){
  const roughness=hasMaterial?visual.roughness:role==='counter'?.58:null;
  const glossy=hasMaterial&&roughness<=.35,satin=visual.finish==='satin';
  return {roughness,clearcoat:glossy?.55:satin?.1:!hasMaterial&&role==='counter'?.16:0,
    clearcoatRoughness:glossy?.14:.38,ior:1.48};
}
export function physicalPanelUV(geometry,size,grainAxis){
  const p=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv,axes=['x','y','z'];
  const read=(a,i,axis)=>a.getComponent(i,axes.indexOf(axis));
  for(let i=0;i<p.count;i++){
    // Keep the original box face through its bevel: averaged corner normals must not flip UV planes.
    const face=geometry.userData.uvFaceAxes?.[i]||axes.reduce((a,b)=>Math.abs(read(n,i,a))>=Math.abs(read(n,i,b))?a:b);
    const plane=axes.filter(a=>a!==face),v=plane.includes(grainAxis)?grainAxis:plane[1],u=plane.find(a=>a!==v);
    uv.setXY(i,read(p,i,u)+size[u]/2000,read(p,i,v)+size[v]/2000);
  }
  uv.needsUpdate=true;
}
