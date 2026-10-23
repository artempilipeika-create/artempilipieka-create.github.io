import * as THREE from './vendor/three.module.js';

// Render-only resources. No cabinet transforms, project data or BAZIS payloads.
export function studioEnvironment(renderer){
  const width=256,height=128,data=new Float32Array(width*height*4);
  const smooth=(a,b,v)=>{const t=THREE.MathUtils.clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const theta=(y+.5)/height*Math.PI,phi=(x+.5)/width*Math.PI*2;
    const nx=Math.sin(theta)*Math.cos(phi),ny=Math.cos(theta),nz=Math.sin(theta)*Math.sin(phi);
    const sky=.13+.28*smooth(-.15,.85,ny);
    // A broad window and a weaker opposite softbox produce readable reflections.
    const window=smooth(.36,.48,nz)*smooth(-.85,-.72,nx)*(1-smooth(-.18,-.08,nx))*smooth(-.1,0,ny)*(1-smooth(.78,.88,ny));
    const fill=Math.pow(Math.max(0,nx*.8+ny*.4+nz*.25),14)*.85;
    const i=(y*width+x)*4;
    data[i]=sky+window*4.6+fill;data[i+1]=sky+window*4.55+fill*.98;data[i+2]=sky+window*4.4+fill*.95;data[i+3]=1;
  }
  const source=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.FloatType);
  source.mapping=THREE.EquirectangularReflectionMapping;source.needsUpdate=true;
  const generator=new THREE.PMREMGenerator(renderer);
  try{return generator.fromEquirectangular(source);}finally{source.dispose();generator.dispose();}
}

// Unbranded plaster/stone micro-relief. Never used as a manufacturer's decor.
export function roomSurfaceTexture(widthM,depthM){
  const size=128,data=new Uint8Array(size*size*4);let seed=71023;
  for(let i=0;i<size*size;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const v=118+(seed>>>27);data[i*4]=data[i*4+1]=data[i*4+2]=v;data[i*4+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(widthM*3,depthM*3);
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}
