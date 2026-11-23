import * as THREE from './vendor/three.module.js';

// Depth from the real cabinet geometry as seen by the room light. A closed panel
// casts from its back faces so the face receiving the light cannot shadow itself.
export class CabinetShadows {
  constructor() {
    this.transform=new THREE.Matrix4();
    this.fromScreen=new THREE.Matrix4();
    this.vertices=new Float32Array(0);
    this.lightMatrix=new THREE.Matrix4();
    this.casters=[];
    this.casterMatrices=[];
  }
  build(light,casters,camera,size,dirty=true) {
    if (!casters.length) { this.casters=[];return null; }
    light.shadow.updateMatrices(light);
    this.fromScreen.copy(light.shadow.matrix).multiply(camera.matrixWorld).multiply(camera.projectionMatrixInverse);
    // An orbit changes the projection into the shadow map, not the light-space depth.
    if (!dirty && this.light===light && this.size===size && this.lightMatrix.equals(light.shadow.matrix)
      && casters.length===this.casters.length
      && casters.every((mesh,i)=>mesh===this.casters[i] && mesh.matrixWorld.equals(this.casterMatrices[i]))) return this;
    this.light=light;
    this.lightMatrix.copy(light.shadow.matrix);
    this.casters=casters.slice();
    this.casterMatrices.length=casters.length;
    if (this.size!==size) { this.size=size; this.depth=new Float32Array(size*size); }
    this.depth.fill(1);
    const view=light.shadow.camera;
    this.span=view.far-view.near;
    this.texel=Math.max(view.right-view.left,view.top-view.bottom)/size;
    this.bias=Math.max(.0008,this.texel*.65)/this.span;
    this.strength=Math.min(.45,(light.shadow.intensity??1)*.61);
    for (const [i,mesh] of casters.entries()) {
      (this.casterMatrices[i]??=new THREE.Matrix4()).copy(mesh.matrixWorld);
      const g=mesh.geometry, pos=g.attributes.position, index=g.index;
      if (!pos) continue;
      this.transform.multiplyMatrices(light.shadow.matrix,mesh.matrixWorld);
      const m=this.transform.elements, count=pos.count, mirrored=mesh.matrixWorld.determinant()<0;
      if (this.vertices.length<count*3) this.vertices=new Float32Array(count*3);
      for (let i=0; i<count; i++) {
        const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i), off=i*3;
        this.vertices[off]=(m[0]*x+m[4]*y+m[8]*z+m[12])*size;
        this.vertices[off+1]=(m[1]*x+m[5]*y+m[9]*z+m[13])*size;
        this.vertices[off+2]=m[2]*x+m[6]*y+m[10]*z+m[14];
      }
      const draw=(mat,start,count)=>{
        if (!mat?.visible || mat.opacity<.98) return;
        const begin=Math.max(start,g.drawRange.start),end=Math.min(start+count,g.drawRange.start+g.drawRange.count,index?.count??pos.count);
        for (let i=begin; i+2<end; i+=3) {
          this.triangle(index?index.getX(i):i,index?index.getX(i+1):i+1,index?index.getX(i+2):i+2,mirrored,mat.side===THREE.DoubleSide);
        }
      };
      if (Array.isArray(mesh.material)) for (const group of g.groups) draw(mesh.material[group.materialIndex],group.start,group.count);
      else draw(mesh.material,0,index?.count??count);
    }
    return this;
  }
  triangle(a,b,c,mirrored,doubleSided) {
    const v=this.vertices,n=this.size,ax=v[3*a],ay=v[3*a+1],az=v[3*a+2];
    const bx=v[3*b]-ax,by=v[3*b+1]-ay,bz=v[3*b+2]-az,cx=v[3*c]-ax,cy=v[3*c+1]-ay,cz=v[3*c+2]-az;
    const area=bx*cy-by*cx;
    if (Math.abs(area)<.02 || (!doubleSided && (mirrored?area<0:area>0))) return;
    const left=Math.max(0,Math.ceil(ax+Math.min(0,bx,cx)-.5)), right=Math.min(n-1,Math.floor(ax+Math.max(0,bx,cx)-.5));
    const top=Math.max(0,Math.ceil(ay+Math.min(0,by,cy)-.5)), bottom=Math.min(n-1,Math.floor(ay+Math.max(0,by,cy)-.5));
    const stepB=cy/area, stepC=-by/area;
    for (let y=top; y<=bottom; y++) {
      let wb=((left+.5-ax)*cy-(y+.5-ay)*cx)/area,wc=(bx*(y+.5-ay)-by*(left+.5-ax))/area;
      for (let x=left; x<=right; x++,wb+=stepB,wc+=stepC) {
        if (wb<0 || wc<0 || wb+wc>1) continue;
        const depth=az+wb*bz+wc*cz,i=y*n+x;
        if (depth>=0 && depth<this.depth[i]) this.depth[i]=depth;
      }
    }
  }
  visibility(nx,ny,nz) {
    const m=this.fromScreen.elements, inv=1/(m[3]*nx+m[7]*ny+m[11]*nz+m[15]), n=this.size;
    const x=((m[0]*nx+m[4]*ny+m[8]*nz+m[12])*inv)*n-.5;
    const y=((m[1]*nx+m[5]*ny+m[9]*nz+m[13])*inv)*n-.5;
    const z=(m[2]*nx+m[6]*ny+m[10]*nz+m[14])*inv-this.bias;
    if (x<9 || y<9 || x>n-10 || y>n-10 || z<0 || z>1) return 1;
    const nearest=this.depth[Math.round(y)*n+Math.round(x)], gap=Math.max(0,(z-nearest)*this.span);
    const radius=Math.max(1.25,Math.min(7,1.25+.20*gap/this.texel));
    let sum=0;
    for (let j=-1; j<=1; j++) for (let i=-1; i<=1; i++) {
      const sx=x+i*radius,sy=y+j*radius,ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
      const k=iy*n+ix,d=this.depth;
      const value=((z>d[k])*(1-fx)+(z>d[k+1])*fx)*(1-fy)+((z>d[k+n])*(1-fx)+(z>d[k+n+1])*fx)*fy;
      sum+=value*(i===0?2:1)*(j===0?2:1);
    }
    return 1-this.strength*sum/16;
  }
}
