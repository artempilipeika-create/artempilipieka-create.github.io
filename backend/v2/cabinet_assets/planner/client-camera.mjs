// Perspective fit in camera coordinates. Room dimensions never enter this solver.
// x/y are right/up; z points towards the camera, relative to the kitchen centre.
export function clientFrame(points,width,height,viewport,fov=40){
  const focal=height/(2*Math.tan(fov*Math.PI/360));
  const measure=distance=>{
    const xs=points.map(p=>width/2+p.x*focal/(distance-p.z));
    const ys=points.map(p=>height/2-p.y*focal/(distance-p.z));
    return {left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
  };
  const fits=b=>b.right-b.left<=viewport.width*.76&&b.bottom-b.top<=viewport.height*.82;
  let low=Math.max(...points.map(p=>p.z))+.05,high=low+1;
  while(!fits(measure(high)))high*=2;
  for(let i=0;i<48;i++){const middle=(low+high)/2;if(fits(measure(middle)))high=middle;else low=middle;}
  const bounds=measure(high),cx=viewport.left+viewport.width/2,cy=viewport.top+viewport.height*.5;
  const offsetX=(bounds.left+bounds.right)/2-cx,offsetY=(bounds.top+bounds.bottom)/2-cy;
  return {distance:high,offsetX,offsetY,widthFraction:(bounds.right-bounds.left)/viewport.width,
    heightFraction:(bounds.bottom-bounds.top)/viewport.height,
    bounds:{left:bounds.left-offsetX,right:bounds.right-offsetX,top:bounds.top-offsetY,bottom:bounds.bottom-offsetY}};
}
