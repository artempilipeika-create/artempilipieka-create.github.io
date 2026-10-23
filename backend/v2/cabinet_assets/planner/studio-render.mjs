import * as THREE from './vendor/three.module.js';

// Three r180's fixed PCF kernel cannot make contact-hardening area shadows.
// Keep its public shadow API, but widen the disk only as receiver/blocker separation grows.
let shadowsInstalled=false;
function installStudioShadows(){
  if(shadowsInstalled)return;
  const source=THREE.ShaderChunk.shadowmap_pars_fragment;
  const start=source.indexOf('#if defined( SHADOWMAP_TYPE_PCF )',source.indexOf('float getShadow('));
  const end=source.indexOf('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )',start);
  if(start<0||end<0)return;
  THREE.ShaderChunk.shadowmap_pars_fragment=source.slice(0,start)+`
    #if defined( SHADOWMAP_TYPE_PCF )
      vec2 texelSize=1.0/shadowMapSize;
      float blockerSum=0.0,blockers=0.0;
      for(int i=0;i<12;i++){
        float a=float(i)*2.39996323;
        vec2 offset=vec2(cos(a),sin(a))*sqrt((float(i)+.5)/12.0)*shadowRadius*texelSize;
        float sampleDepth=unpackRGBAToDepth(texture2D(shadowMap,shadowCoord.xy+offset));
        if(sampleDepth<shadowCoord.z){blockerSum+=sampleDepth;blockers+=1.0;}
      }
      if(blockers>0.0){
        float separation=max(0.0,shadowCoord.z-blockerSum/blockers);
        float penumbra=clamp(separation*shadowRadius*12.0,1.25,shadowRadius);
        shadow=0.0;
        for(int i=0;i<24;i++){
          float a=float(i)*2.39996323;
          vec2 offset=vec2(cos(a),sin(a))*sqrt((float(i)+.5)/24.0)*penumbra*texelSize;
          shadow+=texture2DCompare(shadowMap,shadowCoord.xy+offset,shadowCoord.z);
        }
        shadow/=24.0;
      }
    `+source.slice(end);
  shadowsInstalled=true;
}

// Presentation only: colour + depth from the real scene, never proxy cabinet geometry.
// One scene draw and one bounded 16-tap pass; no temporal history or render loop.
export class StudioRender{
  constructor(renderer){
    this.renderer=renderer;
    installStudioShadows();
    this.available=renderer.extensions.has('EXT_color_buffer_float');
    if(!this.available)return;
    this.target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,
      minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
      depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType),
      samples:Math.min(4,renderer.capabilities.maxSamples)});
    this.material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,
      uniforms:{colour:{value:this.target.texture},depth:{value:this.target.depthTexture},
        inverseProjection:{value:new THREE.Matrix4()},projection:{value:new THREE.Matrix4()},
        texel:{value:new THREE.Vector2()},radius:{value:.16},strength:{value:1.45}},
      vertexShader:`varying vec2 vUv;
        void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
      fragmentShader:`
        uniform sampler2D colour,depth;
        uniform mat4 inverseProjection,projection;
        uniform vec2 texel;
        uniform float radius,strength;
        varying vec2 vUv;
        vec3 positionAt(vec2 uv){
          vec4 p=inverseProjection*vec4(uv*2.0-1.0,texture2D(depth,uv).x*2.0-1.0,1.0);
          return p.xyz/p.w;
        }
        void main(){
          vec3 rgb=texture2D(colour,vUv).rgb;
          float d=texture2D(depth,vUv).x;
          if(d<.99999){
            vec3 p=positionAt(vUv);
            // Choose the nearest depth derivative to avoid silhouette halos.
            vec3 l=p-positionAt(vUv-vec2(texel.x,0.0));
            vec3 r=positionAt(vUv+vec2(texel.x,0.0))-p;
            vec3 b=p-positionAt(vUv-vec2(0.0,texel.y));
            vec3 t=positionAt(vUv+vec2(0.0,texel.y))-p;
            vec3 n=normalize(cross(abs(l.z)<abs(r.z)?l:r,abs(b.z)<abs(t.z)?b:t));
            if(dot(n,-p)<0.0)n=-n;
            vec2 reach=vec2(projection[0][0],projection[1][1])*radius/max(.1,-p.z)*.5;
            float occlusion=0.0;
            for(int i=0;i<16;i++){
              float a=float(i)*2.39996323;
              float ring=sqrt((float(i)+.5)/16.0);
              vec2 uv=vUv+vec2(cos(a),sin(a))*reach*ring;
              if(uv.x<=0.0||uv.x>=1.0||uv.y<=0.0||uv.y>=1.0)continue;
              if(texture2D(depth,uv).x>=.99999)continue;
              vec3 delta=positionAt(uv)-p;
              float distance=length(delta);
              float horizon=max(0.0,dot(n,delta)/max(distance,.0001)-.08);
              occlusion+=horizon*(1.0-smoothstep(radius*.2,radius*1.6,distance))*smoothstep(.001,.006,distance);
            }
            float ao=clamp(1.0-occlusion*strength/8.0,.48,1.0);
            rgb*=ao;
          }
          // Very slight optical falloff, applied in linear light before tone mapping.
          vec2 edge=vUv-.5;
          rgb*=1.0-.075*dot(edge,edge);
          gl_FragColor=vec4(rgb,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`});
    this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);this.quad.frustumCulled=false;this.scene.add(this.quad);
  }
  render(scene,camera){
    const r=this.renderer;
    // Screenshots/catalogue render targets and technical orthographic views retain their own path.
    if(!this.available||r.getRenderTarget()||!camera.isPerspectiveCamera){r.render(scene,camera);return;}
    const size=r.getDrawingBufferSize(new THREE.Vector2()),scale=Math.min(1,2100/Math.max(size.x,size.y));
    const w=Math.max(1,Math.round(size.x*scale)),h=Math.max(1,Math.round(size.y*scale));
    if(this.target.width!==w||this.target.height!==h)this.target.setSize(w,h);
    const u=this.material.uniforms;u.texel.value.set(1/w,1/h);
    u.inverseProjection.value.copy(camera.projectionMatrixInverse);u.projection.value.copy(camera.projectionMatrix);
    try{
      r.setRenderTarget(this.target);r.render(scene,camera);
      r.setRenderTarget(null);r.render(this.scene,this.camera);
    }finally{r.setRenderTarget(null);}
  }
  dispose(){this.target?.dispose();this.material?.dispose();this.quad?.geometry.dispose();}
}
