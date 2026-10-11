import * as THREE from './vendor/three.module.js';

// Render-only treatment of the existing four-millimetre glass geometry.
// Alpha blending retains every shelf behind the facade (no screen-space
// transmission pass, which cannot resolve nested transparent panes).
export function glassVertices(geometry,size){
  const thin=size.indexOf(Math.min(...size)),n=geometry.attributes.normal,colors=new Float32Array(n.count*4);
  for(let i=0;i<n.count;i++){
    const edge=1-Math.abs(n.getComponent(i,thin));
    colors.set([1-.36*edge,1-.18*edge,1-.28*edge,.55+2.25*edge],i*4);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,4));
}

export function glassFinish(material){
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      float mfFresnel=pow(1.0-abs(dot(normal,normalize(vViewPosition))),5.0);
      diffuseColor.a=min(0.78,diffuseColor.a+0.3*mfFresnel);
    `);
  };
  material.customProgramCacheKey=()=> 'mf-glass-edge-fresnel-v1';
}

export function vitrineLightSpec(it,part){
  if(!part||!['body','back','shelf'].includes(part.role))return null;
  const v=globalThis.MF_VITRINE?.info(it);
  if(!v)return null;
  return {
    center:[part.position.x,part.position.y,part.position.z].map(n=>n/1000),
    // The luminous strip shares the actual groove axis at Z = 9 mm.
    enclosure:[(it.width/2-18)/1000,(it.depth/2-18)/1000],
    ends:[.118,(it.height-18)/1000],
    sides:[v.lighting!=='right'?1:0,v.lighting!=='left'?1:0]
  };
}

// Finite vertical line irradiance in cabinet-local coordinates. Two bounded
// evaluations per fragment; no scene lights, extra draws or light leaking
// through a neighbouring cabinet. This is an illustrative light, not photometry.
export function lightVitrineSurface(material,spec){
  const previous=material.onBeforeCompile,program=material.customProgramCacheKey();
  const uniforms={
    mfVitrineCenter:{value:new THREE.Vector3(...spec.center)},
    mfVitrineEnclosure:{value:new THREE.Vector2(...spec.enclosure)},
    mfVitrineEnds:{value:new THREE.Vector2(...spec.ends)},
    mfVitrineSides:{value:new THREE.Vector2(...spec.sides)},
    mfVitrineStrength:{value:.115}
  };
  material.userData.vitrineLight=spec;
  material.userData.vitrineUniforms=uniforms;
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      uniform vec3 mfVitrineCenter;
      varying vec3 mfVitrinePoint;
      varying vec3 mfVitrineNormal;
    `).replace('#include <begin_vertex>',`#include <begin_vertex>
      mfVitrinePoint=transformed+mfVitrineCenter;
      mfVitrineNormal=normal;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 mfVitrinePoint;
      varying vec3 mfVitrineNormal;
      uniform vec2 mfVitrineEnclosure;
      uniform vec2 mfVitrineEnds;
      uniform vec2 mfVitrineSides;
      uniform float mfVitrineStrength;
      float mfStripLight(float side,vec3 p,vec3 n){
        vec2 delta=vec2(side*(mfVitrineEnclosure.x-0.001)-p.x,0.009-p.z);
        float r2=max(dot(delta,delta),0.0016);
        float a=mfVitrineEnds.x-p.y,b=mfVitrineEnds.y-p.y;
        float horizontal=dot(n.xz,delta);
        // Integrate only the emitting segment above a shelf's top face (or
        // below its underside); opposite hemispheres must not cancel out.
        if(n.y>0.001)a=max(a,-horizontal/n.y);
        else if(n.y< -0.001)b=min(b,-horizontal/n.y);
        if(b<=a)return 0.0;
        float ra=inversesqrt(r2+a*a),rb=inversesqrt(r2+b*b);
        float irradiance=horizontal*(b*rb-a*ra)/r2+n.y*(ra-rb);
        return max(0.0,irradiance);
      }
    `).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      vec3 mfP=mfVitrinePoint;
      if(abs(mfP.x)<=mfVitrineEnclosure.x+0.0005 &&
         mfP.y>=mfVitrineEnds.x-0.0005 && mfP.y<=mfVitrineEnds.y+0.0005 &&
         mfP.z>=-mfVitrineEnclosure.y-0.0005){
        vec3 mfN=normalize(mfVitrineNormal)*(gl_FrontFacing?1.0:-1.0);
        float mfEnergy=mfVitrineSides.x*mfStripLight(-1.0,mfP,mfN)
                      +mfVitrineSides.y*mfStripLight(1.0,mfP,mfN);
        reflectedLight.indirectDiffuse+=diffuseColor.rgb*vec3(1.0,0.88,0.69)
          *min(1.8,mfVitrineStrength*mfEnergy);
      }
    `);
  };
  material.customProgramCacheKey=()=>program+'|mf-vitrine-line-v1';
  return material;
}
