// Software drawing for devices without WebGL. Cameras, meshes, raycasts and
// editing still belong to PlannerScene; this class only produces the pixels.
import * as THREE from './vendor/three.module.js';

const light = new THREE.Vector3(-.38, .82, .53).normalize();
const unit = value => Math.max(0, Math.min(1, value));
const channel = (hex, shift) => (hex >> shift) & 255;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

function texturePixels(texture, cache) {
  const image = texture?.image;
  if (!image?.width || !image.height) return null;
  if (cache.has(image)) return cache.get(image);
  let pixels = null;
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 512 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d', {willReadFrequently:true});
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  } catch { /* Cross-origin or compressed textures retain their material colour. */ }
  cache.set(image, pixels);
  return pixels;
}

function nearIntersection(a, b) {
  const da = a.z + a.w, db = b.z + b.w;
  const t = da / (da - db);
  const lerp = key => a[key] + (b[key] - a[key]) * t;
  return {x:lerp('x'), y:lerp('y'), z:lerp('z'), w:lerp('w'), u:lerp('u'), v:lerp('v')};
}

function screen(vertex, frame) {
  const inv = 1 / vertex.w;
  return {x:(1 + vertex.x * inv) * frame.width / 2, y:(1 - vertex.y * inv) * frame.height / 2,
    z:vertex.z * inv, inv, u:vertex.u * inv, v:vertex.v * inv};
}

function paint(frame, pixel, depth, ink, illumination, u, v) {
  if (depth < -1.00001 || depth > 1 || (ink.depthTest && depth > frame.depth[pixel] + 1e-7)) return;
  let alpha = ink.opacity, r = ink.r * illumination, g = ink.g * illumination, b = ink.b * illumination;
  if (ink.pixels) {
    const tex = ink.pixels, m = ink.uvMatrix;
    let x = m[0] * u + m[3] * v + m[6], y = m[1] * u + m[4] * v + m[7];
    x = ink.repeatX ? x - Math.floor(x) : unit(x);
    y = ink.repeatY ? y - Math.floor(y) : unit(y);
    if (ink.flipY) y = 1 - y;
    const p = (Math.min(tex.height-1, Math.floor(y*tex.height)) * tex.width + Math.min(tex.width-1, Math.floor(x*tex.width))) * 4;
    r *= tex.data[p] / 255; g *= tex.data[p+1] / 255; b *= tex.data[p+2] / 255; alpha *= tex.data[p+3] / 255;
  }
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

function triangle(frame, a, b, c, ink, shade, mirrored) {
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
    for (let i=1; i+1<clipped.length; i++) fillTriangle(frame, first, screen(clipped[i],frame), screen(clipped[i+1],frame), ink, shade, mirrored);
    return;
  }
  fillTriangle(frame, screen(a,frame), screen(b,frame), screen(c,frame), ink, shade, mirrored);
}

function fillTriangle(frame, a, b, c, ink, shade, mirrored) {
  const bx = b.x - a.x, by = b.y - a.y, cx = c.x - a.x, cy = c.y - a.y;
  const area = cross(bx, by, cx, cy);
  if (Math.abs(area) < .02) return;
  const front = mirrored ? area > 0 : area < 0;
  if ((ink.side === THREE.FrontSide && !front) || (ink.side === THREE.BackSide && front)) return;
  const left = Math.max(0, Math.ceil(Math.min(a.x,b.x,c.x)-.5)), right = Math.min(frame.width-1, Math.floor(Math.max(a.x,b.x,c.x)-.5));
  const top = Math.max(0, Math.ceil(Math.min(a.y,b.y,c.y)-.5)), bottom = Math.min(frame.height-1, Math.floor(Math.max(a.y,b.y,c.y)-.5));
  const stepB = cy/area, stepC = -by/area;
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
      if (ink.pixels) {
        const inv = 1/(wa*a.inv+wb*b.inv+wc*c.inv);
        u=(wa*a.u+wb*b.u+wc*c.u)*inv; v=(wa*a.v+wb*b.v+wc*c.v)*inv;
      }
      paint(frame,pixel,depth,ink,shade,u,v);
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
    if (x>=0 && y>=0 && x<frame.width && y<frame.height) paint(frame,y*frame.width+x,a.z+(b.z-a.z)*t-1e-6,ink,1,0,0);
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
  setPixelRatio(ratio) { this.ratio=ratio; }
  getPixelRatio() { return this.ratio; }
  setSize(w,h,_updateStyle=false,fullResolution=false) {
    const scale=fullResolution?1:Math.min(this.ratio,1280/Math.max(w,h));
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
    const texture=material.map, pixels=texturePixels(texture,this.textures);
    if (pixels && texture.matrixAutoUpdate) texture.updateMatrix();
    const backup=texture && !pixels && material.userData.fallbackColor;
    const hex=backup ? new THREE.Color(backup).getHex() : material.color?.getHex() ?? 0xffffff;
    return {r:channel(hex,16),g:channel(hex,8),b:channel(hex,0),opacity:material.opacity,alphaTest:material.alphaTest,
      depthTest:material.depthTest,depthWrite:material.depthWrite,side:material.side,pixels,uvMatrix:texture?.matrix.elements,
      repeatX:texture?.wrapS===THREE.RepeatWrapping,repeatY:texture?.wrapT===THREE.RepeatWrapping,flipY:texture?.flipY};
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
      return {x:point.x,y:point.y,z:point.z,w:point.w,u,v};
    });
    triangle(frame,corners[0],corners[1],corners[2],ink,1,false);
    triangle(frame,corners[0],corners[2],corners[3],ink,1,false);
  }
  draw(frame, object, material, group) {
    const geometry=object.geometry, pos=geometry.attributes.position, uv=geometry.attributes.uv;
    const indexed=geometry.index, total=indexed?.count??pos.count;
    const start=Math.max(geometry.drawRange.start,group?.start??0);
    const end=Math.min(total,geometry.drawRange.start+geometry.drawRange.count,group?group.start+group.count:total);
    this.matrix.multiplyMatrices(this.viewProjection,object.matrixWorld);
    const m=this.matrix.elements, vertices=this.vertices;
    for (let i=0; i<pos.count; i++) {
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),v=vertices[i]??(vertices[i]={});
      v.x=m[0]*x+m[4]*y+m[8]*z+m[12]; v.y=m[1]*x+m[5]*y+m[9]*z+m[13];
      v.z=m[2]*x+m[6]*y+m[10]*z+m[14]; v.w=m[3]*x+m[7]*y+m[11]*z+m[15];
      v.u=uv?.getX(i)??0; v.v=uv?.getY(i)??0;
    }
    const ink=this.ink(material), index=i=>indexed?indexed.getX(i):i;
    if (object.isLine) {
      for (let i=start; i+1<end; i+=object.isLineSegments?2:1) line(frame,vertices[index(i)],vertices[index(i+1)],ink);
      return;
    }
    this.normalMatrix.getNormalMatrix(object.matrixWorld);
    const normals=geometry.attributes.normal, mirrored=object.matrixWorld.determinant()<0;
    for (let i=start; i+2<end; i+=3) {
      const a=index(i), b=index(i+1), c=index(i+2);
      let shade=1;
      if (normals && !material.isMeshBasicMaterial) {
        this.normal.fromBufferAttribute(normals,a).applyNormalMatrix(this.normalMatrix);
        shade=.77+.29*Math.max(0,this.normal.dot(light));
      }
      triangle(frame,vertices[a],vertices[b],vertices[c],ink,shade,mirrored);
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
    scene.traverseVisible(object=>{
      if (!object.layers.test(camera.layers) || (!object.isMesh && !object.isLine && !object.isSprite)) return;
      if (object.frustumCulled && !(object.isSprite?this.frustum.intersectsSprite(object):this.frustum.intersectsObject(object))) return;
      const add=(material,group)=>{
        if (!material?.visible || material.opacity<=0) return;
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
    for (const queue of [opaque,transparent]) for (const {object,material,group} of queue) {
      if (object.isSprite) this.drawSprite(frame,object,camera);
      else this.draw(frame,object,material,group);
    }
    if (!this.target) this.context.putImageData(frame.image,0,0);
  }
  dispose() { this.targets=new WeakMap(); this.textures=new WeakMap(); this.vertices=[]; }
}
