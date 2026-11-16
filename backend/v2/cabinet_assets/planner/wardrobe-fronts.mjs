import {cuttingSize} from './blanks-model.mjs';

// Closed overlay fronts, measured from the lower left corner of the carcass.
// Dimensions include finished edging on all four edges. Feet are below this datum.
export function overlayFronts({width,height},count){
  if(![1,2].includes(count))throw Error('Выберите одну или две створки.');
  if(![width,height].every(n=>Number.isInteger(n)&&n>=200))throw Error('Проверьте габариты корпуса.');
  const edgeGap=1.5,meetingGap=3;
  const leafWidth=(width-2*edgeGap-(count-1)*meetingGap)/count;
  const leafHeight=height-2*edgeGap;
  const edges='1111',edgeThickness=2;
  const cut=cuttingSize({length:leafHeight,partWidth:leafWidth,edges,blank_edge_thickness_mm:edgeThickness});
  return Array.from({length:count},(_,i)=>({
    left:edgeGap+i*(leafWidth+meetingGap),bottom:edgeGap,
    width:leafWidth,height:leafHeight,edges,edgeThickness,cut:{...cut}
  }));
}
