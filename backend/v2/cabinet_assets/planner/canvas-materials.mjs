import * as THREE from './vendor/three.module.js';

// Cache by decoded image. Materials with different real-world UV scales share the pixels.
function imageLevel(image) {
  if (image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray) {
    if (image.data.length === image.width * image.height * 4) return image;
    return null;
  }
  const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d', {willReadFrequently:true});
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

export function textureSampler(texture, cache, relief=false) {
  const image = texture?.image;
  if (!image?.width || !image.height) return null;
  if (!cache.has(image)) {
    let first;
    try { first = imageLevel(image); } catch { /* Keep the assigned fallback colour until a readable texture exists. */ }
    cache.set(image, first ? {levels:[first]} : null);
  }
  const pyramid = cache.get(image);
  if (!pyramid) return null;
  if (texture.matrixAutoUpdate) texture.updateMatrix();
  return {pyramid, level:pyramid.levels[0], matrix:texture.matrix.elements, flipY:texture.flipY,
    repeatX:texture.wrapS === THREE.RepeatWrapping, repeatY:texture.wrapT === THREE.RepeatWrapping, relief};
}

function smaller(source) {
  const width=Math.max(1,Math.ceil(source.width/2)), height=Math.max(1,Math.ceil(source.height/2));
  const data=new Uint8ClampedArray(width*height*4);
  for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
    const a=(2*y*source.width+2*x)*4, b=a+(2*x+1<source.width?4:0);
    const down=2*y+1<source.height?source.width*4:0, dst=(y*width+x)*4;
    for (let c=0; c<4; c++) data[dst+c]=(source.data[a+c]+source.data[b+c]+source.data[a+down+c]+source.data[b+down+c])/4;
  }
  return {width,height,data};
}

// The shorter screen derivative preserves brushed metal and wood grain at grazing angles.
export function chooseLevel(sampler, ux, vx, uy, vy) {
  if (!sampler) return;
  const levels=sampler.pyramid.levels, base=levels[0], m=sampler.matrix;
  const dx=Math.hypot((m[0]*ux+m[3]*vx)*base.width,(m[1]*ux+m[4]*vx)*base.height);
  const dy=Math.hypot((m[0]*uy+m[3]*vy)*base.width,(m[1]*uy+m[4]*vy)*base.height);
  const footprint=Math.max(Math.min(dx,dy),Math.max(dx,dy)/4,1);
  const lod=Math.min(Math.floor(Math.log2(footprint)),Math.ceil(Math.log2(Math.max(base.width,base.height))));
  while (levels.length<=lod) levels.push(smaller(levels[levels.length-1]));
  sampler.level=levels[lod];
  if (sampler.relief && !sampler.level.slopes) {
    const {width,height,data}=sampler.level, slopes=new Float32Array(width*height);
    for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
      const left=(y*width+(x+width-1)%width)*4, right=(y*width+(x+1)%width)*4;
      const up=(((y+height-1)%height)*width+x)*4, down=(((y+1)%height)*width+x)*4;
      slopes[y*width+x]=((data[left]-data[right])*.6+(data[up]-data[down])*.4)/255;
    }
    sampler.level.slopes=slopes;
  }
}

export function sample(sampler,u,v,out) {
  const {width,height,data,slopes}=sampler.level, m=sampler.matrix;
  let x=m[0]*u+m[3]*v+m[6], y=m[1]*u+m[4]*v+m[7];
  if (sampler.flipY) y=1-y;
  x=sampler.repeatX?(x-Math.floor(x))*width-.5:Math.min(width-1,Math.max(0,x*width-.5));
  y=sampler.repeatY?(y-Math.floor(y))*height-.5:Math.min(height-1,Math.max(0,y*height-.5));
  let x0=Math.floor(x), y0=Math.floor(y);
  const fx=x-x0, fy=y-y0;
  if (x0<0) x0+=width;
  if (y0<0) y0+=height;
  const x1=x0+1<width?x0+1:sampler.repeatX?0:x0, y1=y0+1<height?y0+1:sampler.repeatY?0:y0;
  const a=y0*width+x0, b=y0*width+x1, c=y1*width+x0, d=y1*width+x1;
  const wa=(1-fx)*(1-fy), wb=fx*(1-fy), wc=(1-fx)*fy, wd=fx*fy;
  if (sampler.relief) return slopes[a]*wa+slopes[b]*wb+slopes[c]*wc+slopes[d]*wd;
  for (let k=0; k<4; k++) out[k]=(data[a*4+k]*wa+data[b*4+k]*wb+data[c*4+k]*wc+data[d*4+k]*wd)/255;
}
