import * as THREE from './vendor/three.module.js';
import {featureBox} from './room-plan.mjs';
import {roomById} from './render-rooms/catalogue.mjs';

// Projected fill on the measured room surfaces only. Window openings, furniture
// colours and shadow maps still come from the scene itself.
export function roomDaylight(room,settings){
  const width=room.width/1000,depth=room.depth/1000;
  const window=(room.features||[]).filter(f=>f.kind==='window').sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  const wall=window?.wall??(roomById(settings.renderRoomId)?.side==='R'?'b':'d');
  const inward={a:[0,1],b:[-1,0],c:[0,-1],d:[1,0]}[wall]||[1,0];
  const b=window?featureBox({...window,projection:0},room):null;
  const source=b?new THREE.Vector2(b.x/1000,b.z/1000):new THREE.Vector2((wall==='b'?1:-1)*width/2,depth*.37);
  const lightWidth=window?Math.max(.55,window.width/1000):Math.max(1.9,depth*.74);
  return {source,direction:new THREE.Vector2(...inward),width:lightWidth,measured:Boolean(window),
    strength:settings.lightingPreset==='warm'?.40:settings.lightingPreset==='daylight'?.58:.47};
}

export function daylightKey(light,scheme,rotation=0){
  if(light.measured)return new THREE.Vector3(-4*light.direction.x+light.direction.y,5,-4*light.direction.y-light.direction.x);
  if(scheme)return new THREE.Vector3(scheme.side==='R'?4.4:-4.4,4.3,3.4);
  return new THREE.Vector3(-4.2,5.4,4.1).applyAxisAngle(THREE.Object3D.DEFAULT_UP,rotation);
}

export function daylightSurface(material,light,kind){
  const floor=kind==='floor';
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{
      mfLightSource:{value:light.source},mfLightDirection:{value:light.direction},
      mfLightWidth:{value:light.width},mfLightPower:{value:light.strength},mfWindow:{value:Number(light.measured)}
    });
    shader.vertexShader='varying vec3 mfRoomPoint;\n'+shader.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nmfRoomPoint = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader='varying vec3 mfRoomPoint;\nuniform vec2 mfLightSource,mfLightDirection;\nuniform float mfLightWidth,mfLightPower,mfWindow;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec2 fromLight=mfRoomPoint.xz-mfLightSource;
      float reach=dot(fromLight,mfLightDirection);
      float across=dot(fromLight,vec2(-mfLightDirection.y,mfLightDirection.x));
      float along=(across+reach*.57-mfRoomPoint.y*.58)/mfLightWidth;
      float spread=.62+.080*max(reach,0.);
      float daylight=1.-smoothstep(spread*.38,spread+.40,abs(along));
      float frame=1.-smoothstep(.015,.13+.012*max(reach,0.),abs(along-.08));
      daylight*=1.-frame*.51*mfWindow;
      // A large side source gives an empty wall a readable light-to-shade transition.
      float beamWidth=mix(.85,.55,mfWindow);
      float beam=1.-smoothstep(beamWidth,beamWidth+.48,abs(across+.46*reach-.67*mfRoomPoint.y-.36));
      float bounce=exp(-max(reach,0.)*.19);
      float contact=mix(.72,1.,smoothstep(0.,.42,mfRoomPoint.y));
      vec3 shade=vec3(.85,.91,.96);
      vec3 lightTint=vec3(1.25,1.115,.98);
      vec3 surface=mix(shade,lightTint,daylight*mfLightPower*1.55);
      surface*=mix(vec3(.91,.94,.98),vec3(1.28,1.18,1.075),beam*bounce*mix(.28,1.,mfWindow));
      diffuseColor.rgb*=surface * ${floor?'1.0':'contact'};
    `);
  };
  material.customProgramCacheKey=()=>floor?'mf-daylight-floor':'mf-daylight-wall';
}

// The wall has one continuous painted face. Only true opening and perimeter
// edges get returns; touching partition rectangles must not leave a dark seam.
export function wallShell(length,panels){
  const vertices=[],front=0,back=-.02;
  const xs=[...new Set(panels.flatMap(p=>[p.offset,p.offset+p.width]))].sort((a,b)=>a-b);
  const ys=[...new Set(panels.flatMap(p=>[p.elevation,p.elevation+p.height]))].sort((a,b)=>a-b);
  const filled=xs.map(()=>new Uint8Array(ys.length));
  const quad=(a,b,c,d)=>vertices.push(...a,...b,...c,...a,...c,...d);
  const point=(x,y,z)=>[(x-length/2)*.001,y*.001,z];
  for(const p of panels){
    const left=p.offset,right=left+p.width,bottom=p.elevation,top=bottom+p.height;
    quad(point(left,bottom,front),point(right,bottom,front),point(right,top,front),point(left,top,front));
    quad(point(right,bottom,back),point(left,bottom,back),point(left,top,back),point(right,top,back));
    for(let x=xs.indexOf(left);xs[x]<right;x++)filled[x].fill(1,ys.indexOf(bottom),ys.indexOf(top));
  }
  for(let x=0;x<xs.length-1;x++)for(let y=0;y<ys.length-1;y++){
    if(!filled[x][y])continue;
    const l=xs[x],r=xs[x+1],b=ys[y],t=ys[y+1];
    if(!filled[x-1]?.[y])quad(point(l,b,back),point(l,b,front),point(l,t,front),point(l,t,back));
    if(!filled[x+1]?.[y])quad(point(r,b,front),point(r,b,back),point(r,t,back),point(r,t,front));
    if(!filled[x][y-1])quad(point(l,b,back),point(r,b,back),point(r,b,front),point(l,b,front));
    if(!filled[x][y+1])quad(point(l,t,front),point(r,t,front),point(r,t,back),point(l,t,back));
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  const uv=[];
  for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]+vertices[i+2],vertices[i+1]);
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.computeVertexNormals();return geometry;
}
