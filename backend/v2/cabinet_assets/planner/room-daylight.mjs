import * as THREE from './vendor/three.module.js';
import {featureBox} from './room-plan.mjs';

// Projected fill on the measured room surfaces only. Window openings, furniture
// colours and shadow maps still come from the scene itself.
export function roomDaylight(room,settings){
  const width=room.width/1000,depth=room.depth/1000;
  const window=(room.features||[]).filter(f=>f.kind==='window').sort((a,b)=>b.width*b.height-a.width*a.height)[0];
  const wall=window?.wall??'d';
  const inward={a:[0,1],b:[-1,0],c:[0,-1],d:[1,0]}[wall]||[1,0];
  const b=window?featureBox({...window,projection:0},room):null;
  const source=b?new THREE.Vector2(b.x/1000,b.z/1000):new THREE.Vector2(-width/2,depth*.37);
  const lightWidth=window?Math.max(.55,window.width/1000):Math.max(1.9,depth*.74);
  return {source,direction:new THREE.Vector2(...inward),width:lightWidth,measured:Boolean(window),
    strength:settings.lightingPreset==='warm'?.40:settings.lightingPreset==='daylight'?.58:.47};
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
      surface*=mix(vec3(.91,.94,.98),vec3(1.28,1.18,1.075),beam*bounce);
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
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();return geometry;
}

export function studioBackdrop(){
  const width=8,height=192,data=new Uint8Array(width*height*4);
  const zenith=new THREE.Color('#afc4c5'),horizon=new THREE.Color('#edf0e8'),base=new THREE.Color('#d2d7cf'),c=new THREE.Color();
  for(let y=0;y<height;y++){
    const t=y/(height-1);
    if(t<.45)c.copy(base).lerp(horizon,THREE.MathUtils.smoothstep(t,0,.45));
    else c.copy(horizon).lerp(zenith,THREE.MathUtils.smoothstep(t,.45,1));
    c.convertLinearToSRGB();
    for(let x=0;x<width;x++)data.set([c.r*255,c.g*255,c.b*255,255],(y*width+x)*4);
  }
  const map=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
  map.colorSpace=THREE.SRGBColorSpace;map.magFilter=map.minFilter=THREE.LinearFilter;map.needsUpdate=true;return map;
}

// Broad grounding under the cutaway. Nothing outside the room is pickable.
export function studioGround(width,depth){
  const material=new THREE.ShaderMaterial({
    uniforms:{halfRoom:{value:new THREE.Vector2(width/2,depth/2)},nearTone:{value:new THREE.Color('#b0b9b1')},farTone:{value:new THREE.Color('#e7ece5')}},
    vertexShader:'varying vec2 groundXZ; void main(){vec4 world=modelMatrix*vec4(position,1.);groundXZ=world.xz;gl_Position=projectionMatrix*viewMatrix*world;}',
    fragmentShader:`varying vec2 groundXZ;uniform vec2 halfRoom;uniform vec3 nearTone,farTone;
      void main(){vec2 edge=max(abs(groundXZ)-halfRoom,vec2(0.));float d=length(edge);
        vec3 col=mix(nearTone,farTone,smoothstep(0.,2.65,d));
        gl_FragColor=vec4(col*(.72+.28*smoothstep(0.,.28,d)),1.);
        #include <colorspace_fragment>
      }`
  });
  const m=new THREE.Mesh(new THREE.PlaneGeometry(150,150),material);
  m.rotation.x=-Math.PI/2;m.position.y=-.025;m.raycast=()=>{};m.userData={ownMaterial:true,visualOnly:true};return m;
}
