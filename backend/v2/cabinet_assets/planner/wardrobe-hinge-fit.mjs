// Bounds of the separate cup, arm and mounting plate measured on the installed
// AKS H0 meshes, in mm from the host face and the back of the closed door.
const arms={
 '112595':[22.8,8,8], '112644':[26.5,8,9], '112643':[26.5,8,9],
 '112650':[36.5,8,8], '113408':[37.6,8,8], '112649':[37.6,8,8]
};
const cupReach={overlay:23.6,half:33.6,inset:41.1};
const allowance=1,flange=3.5;
const mirrored=(lo,hi,side)=>side==='left'?[lo,hi]:[-hi,-lo];

export function plateSpan(fit,side){
 return mirrored(fit.series==='PRIME 3D'?-25:-26,26,side);
}

export function spacerReachesHinge(fit,hingeZ,front){
 return front>=hingeZ-(fit.kind==='inset'?71.5:75.1)-2;
}

export function gapAxisRange(fit,side,bottom,top){
 const [,below,above]=arms[fit.mesh],[low,high]=mirrored(-below,above,side);
 return {low:bottom-low+allowance,high:top-high-allowance,center:(bottom+top)/2};
}

export function drawerHingeSpan(fit,side,clear,setback,pivot,doorDepth,slides){
 const [reach,below,above]=arms[fit.mesh];
 let low=0,high=0;
 if(clear<reach+allowance)[low,high]=mirrored(-below,above,side);
 if(clear<8+allowance)[low,high]=plateSpan(fit,side);
 // The cup opens forwards. Until it clears the front in depth its outer
 // corner is bounded by its circle about the vertical door pivot.
 const radius2=(cupReach[fit.kind]-pivot)**2+(doorDepth+flange)**2;
 const closedReach=setback<=flange+allowance?
  pivot+Math.sqrt(Math.max(0,radius2-(doorDepth+Math.max(0,setback-allowance))**2)):-Infinity;
 const openReach=slides?pivot+doorDepth+flange:-Infinity; // drawer passing the open leaf at 90°
 if(clear<Math.max(closedReach,openReach)+allowance)return [-31.8,31.8];
 return high?[low-allowance,high+allowance]:null;
}

export function railSeat(bank,box){
 const ball=bank.railFamily!=='concealed',push=bank.opening==='push';
 const base=box.elevation_mm+(ball?17.5:push?-20:-17);
 // The 300 mm Push rail has a taller fixed flange than the longer lengths.
 return {bottom:base+(!ball&&push?1:0),top:base+(ball?45:push?(box.depth===290?51:47):46),
  screw:base+(ball?22.5:push?41:37.5)};
}
