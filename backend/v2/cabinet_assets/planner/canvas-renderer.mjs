// Software drawing for devices without WebGL. Cameras, meshes, raycasts and
// editing still belong to PlannerScene; this class only produces the pixels.
import * as THREE from './vendor/three.module.js';

import {textureSampler, chooseLevel, sample} from './canvas-materials.mjs';

const studioKey = new THREE.Vector3(-.46, .67, .64).normalize();
const fill = new THREE.Vector3(.78, .19, .35).normalize();
const channel = (hex, shift) => (hex >> shift) & 255;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

function nearIntersection(a, b) {
  const da = a.z + a.w, db = b.z + b.w;
  const t = da / (da - db);
  const lerp = key => a[key] + (b[key] - a[key]) * t;
  return {x:lerp('x'), y:lerp('y'), z:lerp('z'), w:lerp('w'), u:lerp('u'), v:lerp('v'), shade:lerp('shade'), gloss:lerp('gloss')};
}

function screen(vertex, frame) {
  const inv = 1 / vertex.w;
  return {x:(1 + vertex.x * inv) * frame.width / 2, y:(1 - vertex.y * inv) * frame.height / 2,
    z:vertex.z * inv, inv, u:vertex.u * inv, v:vertex.v * inv, shade:vertex.shade, gloss:vertex.gloss};
}

function paint(frame, pixel, depth, ink, illumination, gloss, u, v) {
  if (depth < -1.00001 || depth > 1 || (ink.depthTest && depth > frame.depth[pixel] + 1e-7)) return;
  if (ink.relief) illumination += sample(ink.relief,u,v,ink.sample)*ink.bumpStrength;
  let alpha=ink.opacity, r=ink.r*illumination, g=ink.g*illumination, b=ink.b*illumination;
  if (ink.map) {
    sample(ink.map,u,v,ink.sample);
    r*=ink.sample[0]; g*=ink.sample[1]; b*=ink.sample[2]; alpha*=ink.sample[3];
  }
  if (ink.mask) { sample(ink.mask,u,v,ink.sample); alpha*=ink.sample[1]; }
  r+=gloss; g+=gloss; b+=gloss;
  if (alpha <= .002 || alpha < ink.alphaTest) return;
  const offset = pixel * 4, dst = frame.image.data;
  if (alpha >= .999) {
    dst[offset] = r; dst[offset+1] = g; dst[offset+2] = b;
  } else {
    dst[offset] = r*alpha + dst[offset]*(1-alpha);
    dst[offset+1] = g*alpha + dst[offset+1]*(1-alpha);
    dst[offset+2] = b*alpha + dst[offset+2]*(1-alpha);
  }
  if (ink.depthWrite) frame.depth[pixel] = depth;
}

function triangle(frame, a, b, c, ink, mirrored) {
  // Clip at the near plane before dividing by w, including walls crossing the eye.
  const behind = [a.z < -a.w, b.z < -b.w, c.z < -c.w];
  if (behind.some(Boolean)) {
    if (behind.every(Boolean)) return;
    const clipped = [], vertices = [a,b,c];
    for (let i=0; i<3; i++) {
      const j = (i+1)%3;
      if (!behind[i]) clipped.push(vertices[i]);
      if (behind[i] !== behind[j]) clipped.push(nearIntersection(vertices[i], vertices[j]));
    }
    const first = screen(clipped[0], frame);
    for (let i=1; i+1<clipped.length; i++) fillTriangle(frame, first, screen(clipped[i],frame), screen(clipped[i+1],frame), ink, mirrored);
    return;
  }
  fillTriangle(frame, screen(a,frame), screen(b,frame), screen(c,frame), ink, mirrored);
}

function fillTriangle(frame, a, b, c, ink, mirrored) {
  const bx = b.x - a.x, by = b.y - a.y, cx = c.x - a.x, cy = c.y - a.y;
  const area = cross(bx, by, cx, cy);
  if (Math.abs(area) < .02) return;
  const front = mirrored ? area > 0 : area < 0;
  if ((ink.side === THREE.FrontSide && !front) || (ink.side === THREE.BackSide && front)) return;
  const left = Math.max(0, Math.ceil(Math.min(a.x,b.x,c.x)-.5)), right = Math.min(frame.width-1, Math.floor(Math.max(a.x,b.x,c.x)-.5));
  const top = Math.max(0, Math.ceil(Math.min(a.y,b.y,c.y)-.5)), bottom = Math.min(frame.height-1, Math.floor(Math.max(a.y,b.y,c.y)-.5));
  if (left>right || top>bottom) return;
  const stepB = cy/area, stepC = -by/area;
  if (ink.textured) {
    // UV gradients at the centroid are perspective-correct. Select a mip for this face.
    const inv=(a.inv+b.inv+c.inv)/3, u=(a.u+b.u+c.u)/(3*inv), v=(a.v+b.v+c.v)/(3*inv);
    const grad=(p,q,r,center,step1,step2)=>((q-p)*step1+(r-p)*step2-center*((b.inv-a.inv)*step1+(c.inv-a.inv)*step2))/inv;
    const ux=grad(a.u,b.u,c.u,u,stepB,stepC), vx=grad(a.v,b.v,c.v,v,stepB,stepC);
    const uy=grad(a.u,b.u,c.u,u,-cx/area,bx/area), vy=grad(a.v,b.v,c.v,v,-cx/area,bx/area);
    chooseLevel(ink.map,ux,vx,uy,vy); chooseLevel(ink.mask,ux,vx,uy,vy); chooseLevel(ink.relief,ux,vx,uy,vy);
  }
  for (let y=top; y<=bottom; y++) {
    let wb = cross(left+.5-a.x, y+.5-a.y, cx, cy)/area;
    let wc = cross(bx, by, left+.5-a.x, y+.5-a.y)/area;
    for (let x=left; x<=right; x++, wb+=stepB, wc+=stepC) {
      const wa = 1-wb-wc;
      if (wa < -1e-8 || wb < -1e-8 || wc < -1e-8) continue;
      const depth = wa*a.z + wb*b.z + wc*c.z;
      const pixel = y*frame.width+x;
      if (ink.depthTest && depth > frame.depth[pixel]+1e-7) continue;
      let u=0, v=0;
      if (ink.textured) {
        const inv = 1/(wa*a.inv+wb*b.inv+wc*c.inv);
        u=(wa*a.u+wb*b.u+wc*c.u)*inv; v=(wa*a.v+wb*b.v+wc*c.v)*inv;
      }
      paint(frame,pixel,depth,ink,wa*a.shade+wb*b.shade+wc*c.shade,wa*a.gloss+wb*b.gloss+wc*c.gloss,u,v);
    }
  }
}

function line(frame, a, b, ink) {
  if (a.z < -a.w && b.z < -b.w) return;
  if (a.z < -a.w) a=nearIntersection(a,b);
  if (b.z < -b.w) b=nearIntersection(b,a);
  a=screen(a,frame); b=screen(b,frame);
  const steps=Math.max(1,Math.min(4*(frame.width+frame.height),Math.ceil(Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y)))));
  for (let i=0; i<=steps; i++) {
    const t=i/steps, x=Math.floor(a.x+(b.x-a.x)*t), y=Math.floor(a.y+(b.y-a.y)*t);
    if (x>=0 && y>=0 && x<frame.width && y<frame.height) paint(frame,y*frame.width+x,a.z+(b.z-a.z)*t-1e-6,ink,1,0,0,0);
  }
}

const contactDirections=[[1,0],[-1,0],[0,1],[0,-1],[.7,.7],[-.7,.7],[.7,-.7],[-.7,-.7]];
const shadowSteps=[.018,.046,.09,.16,.26];

function contactShadows(frame,camera,key) {
  // Estimate short-range occlusion in metres, independently of the camera zoom.
  const step=3, width=Math.ceil(frame.width/step), height=Math.ceil(frame.height/step);
  if (width<3 || height<3) return;
  if (!frame.distances) {
    frame.distances=new Float32Array(width*height);
    frame.contact=new Float32Array(width*height);
  }
  const dist=frame.distances, contact=frame.contact, proj=camera.projectionMatrix.elements;
  const focal=frame.height*proj[5]/(2*step);
  const centerX=frame.width*(1-proj[8])/(2*step), centerY=frame.height*(1+proj[9])/(2*step);
  for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
    const d=frame.depth[Math.min(frame.height-1,y*step+1)*frame.width+Math.min(frame.width-1,x*step+1)];
    dist[y*width+x]=Number.isFinite(d)?proj[14]/(d+proj[10]):Infinity;
  }
  contact.fill(1);
  for (let y=1; y<height-1; y++) for (let x=1; x<width-1; x++) {
    const i=y*width+x, z=dist[i];
    if (!Number.isFinite(z)) continue;
    const left=z-dist[i-1], right=dist[i+1]-z, up=z-dist[i-width], down=dist[i+width]-z;
    const dx=Math.abs(left)<Math.abs(right)?left:right, dy=Math.abs(up)<Math.abs(down)?up:down;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    const radius=Math.min(20,Math.max(1,Math.round(focal*.075/z)));
    let shadow=0;
    for (let k=0; k<contactDirections.length; k++) {
      const direction=contactDirections[k], reach=k<4?radius*.48:radius;
      const sx=Math.round(reach*direction[0]), sy=Math.round(reach*direction[1]);
      if (x+sx<0 || x+sx>=width || y+sy<0 || y+sy>=height) continue;
      const sampleZ=dist[i+sy*width+sx], delta=z-sampleZ;
      if (Math.abs(delta)>.12) continue;
      const obstruction=delta+dx*sx+dy*sy-.0018;
      if (obstruction>0) shadow+=Math.min(1,obstruction/.022)*Math.max(0,1-Math.abs(delta)/.12);
    }
    // Trace short rays towards the room's own key light. Only nearby depth intersections
    // cast a shadow, keeping objects across the room out of a handle or shelf's shadow.
    let cast=0;
    if (key) {
      const rayX=focal*key.x+(x-centerX)*key.z, rayY=-focal*key.y+(y-centerY)*key.z;
      for (const reach of shadowSteps) {
        const rayDepth=z-reach*key.z;
        if (rayDepth<=camera.near) break;
        const sx=Math.round(reach*rayX/rayDepth), sy=Math.round(reach*rayY/rayDepth);
        if (x+sx<0 || x+sx>=width || y+sy<0 || y+sy>=height) break;
        const blocker=dist[i+sy*width+sx], gap=rayDepth-blocker;
        if (gap<=.0025 || gap>.08+reach*.25 || z+dx*sx+dy*sy-blocker<.005) continue;
        cast=Math.max(cast,Math.min(1,(gap-.0025)/.015)*(1-reach/.34));
      }
    }
    contact[i]=(1-.42*shadow/contactDirections.length)*(1-.24*cast);
  }
  const data=frame.image.data;
  for (let y=0; y<frame.height; y++) {
    const gy=Math.max(0,(y-1)/step), y0=Math.floor(gy), y1=Math.min(height-1,y0+1), fy=gy-y0;
    for (let x=0; x<frame.width; x++) {
      const pixel=y*frame.width+x;
      if (frame.depth[pixel]===Infinity) continue;
      const gx=Math.max(0,(x-1)/step), x0=Math.floor(gx), x1=Math.min(width-1,x0+1), fx=gx-x0;
      const a=contact[y0*width+x0],b=contact[y0*width+x1],c=contact[y1*width+x0],d=contact[y1*width+x1];
      if (a+b+c+d===4) continue;
      const shade=(a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy, offset=pixel*4;
      data[offset]*=shade; data[offset+1]*=shade; data[offset+2]*=shade;
    }
  }
}

export class CanvasRenderer {
  constructor(canvas) {
    this.canvas=canvas;
    this.context=canvas.getContext('2d', {alpha:false});
    if (!this.context) throw new Error('2D canvas unavailable');
    this.capabilities={getMaxAnisotropy:()=>1, maxSamples:0, maxTextureSize:4096};
    this.shadowMap={};
    this.extensions={has:()=>false};
    this.ratio=1;
    this.moving=false;
    this.halfLight=new THREE.Vector3();
    this.keyDirection=new THREE.Vector3();
    this.viewLight=new THREE.Vector3();
    this.target=null;
    this.targets=new WeakMap();
    this.textures=new WeakMap();
    this.matrix=new THREE.Matrix4();
    this.viewProjection=new THREE.Matrix4();
    this.frustum=new THREE.Frustum();
    this.normalMatrix=new THREE.Matrix3();
    this.normal=new THREE.Vector3();
    this.vertices=[];
  }
  setMoving(moving) {
    if (moving===this.moving || this.target) return;
    this.moving=moving;
    if (this.cssWidth) this.setSize(this.cssWidth,this.cssHeight,false,this.fullResolution);
  }
  setPixelRatio(ratio) { this.ratio=ratio; }
  getPixelRatio() { return this.ratio; }
  setSize(w,h,_updateStyle=false,fullResolution=false) {
    this.cssWidth=w; this.cssHeight=h; this.fullResolution=fullResolution;
    const longSide=Math.max(w,h);
    const scale=fullResolution?1:this.moving?Math.min(this.ratio,1280/longSide)
      :Math.min(Math.max(1,this.ratio)*1.25,4096/longSide,Math.sqrt(5e6/(w*h)));
    const width=Math.max(1,Math.round(w*scale)), height=Math.max(1,Math.round(h*scale));
    if (width!==this.canvas.width || height!==this.canvas.height) { this.canvas.width=width; this.canvas.height=height; }
  }
  getRenderTarget() { return this.target; }
  setRenderTarget(target) { this.target=target; }
  frame() {
    const owner=this.target||this.canvas, {width,height}=owner;
    let frame=this.targets.get(owner);
    if (!frame || frame.width!==width || frame.height!==height) {
      const image=this.context.createImageData(width,height);
      frame={width,height,image,words:new Uint32Array(image.data.buffer),depth:new Float32Array(width*height)};
      this.targets.set(owner,frame);
    }
    return frame;
  }
  readRenderTargetPixels(target,x,y,width,height,dest) {
    const frame=this.targets.get(target);
    for (let row=0; row<height; row++) {
      const start=((frame.height-1-y-row)*frame.width+x)*4;
      dest.set(frame.image.data.subarray(start,start+width*4),row*width*4);
    }
  }
  ink(material) {
    const map=textureSampler(material.map,this.textures), mask=textureSampler(material.alphaMap,this.textures);
    const relief=textureSampler(material.bumpMap,this.textures,true);
    const backup=material.map && !map && material.userData.fallbackColor;
    const hex=backup ? new THREE.Color(backup).getHex() : material.color?.getHex() ?? 0xffffff;
    return {r:channel(hex,16),g:channel(hex,8),b:channel(hex,0),opacity:material.opacity,alphaTest:material.alphaTest,
      depthTest:material.depthTest,depthWrite:material.depthWrite,side:material.side,map,mask,relief,textured:map||mask||relief,
      sample:new Float32Array(4),bumpStrength:relief?Math.min(.65,material.bumpScale*material.bumpMap.repeat.x*relief.level.width):0};
  }
  drawSprite(frame, sprite, camera) {
    const material=sprite.material, ink=this.ink(material);
    const center=new THREE.Vector3().setFromMatrixPosition(sprite.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    const size=new THREE.Vector3().setFromMatrixScale(sprite.matrixWorld);
    if(camera.isPerspectiveCamera && !material.sizeAttenuation)size.multiplyScalar(-center.z);
    const cos=Math.cos(material.rotation), sin=Math.sin(material.rotation);
    const corners=[[0,0],[1,0],[1,1],[0,1]].map(([u,v])=>{
      const x=(u-sprite.center.x)*size.x, y=(v-sprite.center.y)*size.y;
      const point=new THREE.Vector4(center.x+x*cos-y*sin,center.y+x*sin+y*cos,center.z,1).applyMatrix4(camera.projectionMatrix);
      return {x:point.x,y:point.y,z:point.z,w:point.w,u,v,shade:1,gloss:0};
    });
    triangle(frame,corners[0],corners[1],corners[2],ink,false);
    triangle(frame,corners[0],corners[2],corners[3],ink,false);
  }
  draw(frame, object, material, group) {
    const geometry=object.geometry, pos=geometry.attributes.position, uv=geometry.attributes.uv;
    const indexed=geometry.index, total=indexed?.count??pos.count;
    const start=Math.max(geometry.drawRange.start,group?.start??0);
    const end=Math.min(total,geometry.drawRange.start+geometry.drawRange.count,group?group.start+group.count:total);
    this.matrix.multiplyMatrices(this.viewProjection,object.matrixWorld);
    const m=this.matrix.elements, vertices=this.vertices;
    const normals=geometry.attributes.normal, colors=material.vertexColors?geometry.attributes.color:null;
    const lit=normals && !material.isMeshBasicMaterial && !object.isLine;
    const metal=material.metalness||0, rough=material.roughness??1;
    const highlight=lit?metal*83+(1-rough)*(1-rough)*22:0;
    const power=8+(1-rough)*50;
    if (lit) this.normalMatrix.getNormalMatrix(object.matrixWorld);
    for (let i=0; i<pos.count; i++) {
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),v=vertices[i]??(vertices[i]={});
      v.x=m[0]*x+m[4]*y+m[8]*z+m[12]; v.y=m[1]*x+m[5]*y+m[9]*z+m[13];
      v.z=m[2]*x+m[6]*y+m[10]*z+m[14]; v.w=m[3]*x+m[7]*y+m[11]*z+m[15];
      v.u=uv?.getX(i)??0; v.v=uv?.getY(i)??0;
      v.shade=1; v.gloss=0;
      if (lit) {
        const n=this.normal.fromBufferAttribute(normals,i).applyNormalMatrix(this.normalMatrix);
        v.shade=.60+.10*(n.y*.5+.5)+.43*Math.max(0,n.dot(this.keyDirection))+.085*Math.max(0,n.dot(fill));
        if (highlight) v.gloss=highlight*Math.pow(Math.max(0,n.dot(this.halfLight)),power);
      }
      if (colors) v.shade*=Math.sqrt(Math.max(0,.213*colors.getX(i)+.715*colors.getY(i)+.072*colors.getZ(i)));
    }
    const ink=this.ink(material), index=i=>indexed?indexed.getX(i):i;
    if (object.isLine) {
      for (let i=start; i+1<end; i+=object.isLineSegments?2:1) line(frame,vertices[index(i)],vertices[index(i+1)],ink);
      return;
    }
    const mirrored=object.matrixWorld.determinant()<0;
    for (let i=start; i+2<end; i+=3) {
      triangle(frame,vertices[index(i)],vertices[index(i+1)],vertices[index(i+2)],ink,mirrored);
    }
  }
  render(scene,camera) {
    scene.updateMatrixWorld(); camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    const frame=this.frame(), bg=scene.background?.isColor?scene.background.getHex():0xefece6;
    frame.words.fill((0xff000000 | channel(bg,0)<<16 | channel(bg,8)<<8 | channel(bg,16))>>>0);
    frame.depth.fill(Infinity);
    const opaque=[], transparent=[];
    let key=null;
    scene.traverseVisible(object=>{
      if (object.isDirectionalLight && object.castShadow && object.intensity>0 && object.layers.test(camera.layers)) key=object;
      if (!object.layers.test(camera.layers) || (!object.isMesh && !object.isLine && !object.isSprite)) return;
      if (object.frustumCulled && !(object.isSprite?this.frustum.intersectsSprite(object):this.frustum.intersectsObject(object))) return;
      const add=(material,group)=>{
        if (!material?.visible || material.opacity<=0 || material.isShadowMaterial) return;
        const e=object.matrixWorld.elements,m=camera.matrixWorldInverse.elements;
        const distance=-(m[2]*e[12]+m[6]*e[13]+m[10]*e[14]+m[14]);
        (material.transparent?transparent:opaque).push({object,material,group,distance});
      };
      if (Array.isArray(object.material)) for (const group of object.geometry.groups) add(object.material[group.materialIndex],group);
      else add(object.material,null);
    });
    // Front-to-back opaque draws reduce texture work; glass and selection tints blend last.
    opaque.sort((a,b)=>a.object.renderOrder-b.object.renderOrder || a.distance-b.distance);
    transparent.sort((a,b)=>a.object.renderOrder-b.object.renderOrder || b.distance-a.distance);
    this.keyDirection.copy(studioKey);
    if (key) this.keyDirection.setFromMatrixPosition(key.matrixWorld).sub(this.viewLight.setFromMatrixPosition(key.target.matrixWorld)).normalize();
    camera.getWorldDirection(this.halfLight).negate().add(this.keyDirection).normalize();
    this.viewLight.copy(this.keyDirection).transformDirection(camera.matrixWorldInverse);
    for (const queue of [opaque,transparent]) {
      if (queue===transparent && camera.isPerspectiveCamera && (!this.moving || this.target)) contactShadows(frame,camera,key?this.viewLight:null);
      for (const {object,material,group} of queue) {
        if (object.isSprite) this.drawSprite(frame,object,camera);
        else this.draw(frame,object,material,group);
      }
    }
    if (!this.target) this.context.putImageData(frame.image,0,0);
  }
  dispose() { this.targets=new WeakMap(); this.textures=new WeakMap(); this.vertices=[]; }
}
