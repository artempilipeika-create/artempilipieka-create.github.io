import {overlayFronts} from './wardrobe-fronts.mjs';

export const swingNames={left:'Петли слева',right:'Петли справа',pair:'Две створки · петли по краям'};
const n=value=>Number(value.toFixed(2));

// Front elevation with an outward opening arc at the lower edge of each leaf.
export function doorLeaves(spec,swing,left,bottom,scale,maxDrop,leaves=null,selection=null){
  const sides=swing==='pair'?['left','right']:[swing];
  return (leaves??overlayFronts(spec,sides.length)).map((leaf,i)=>{
    const side=leaf.side??sides[i],w=leaf.width*scale,h=leaf.height*scale;
    const pivot=left+(leaf.left+(side==='right'?leaf.width:0))*scale;
    const drop=Math.min(maxDrop,w*.65),tipX=w*.26,tipY=drop*.966;
    const head=Math.min(5,drop*.28),y=bottom-leaf.bottom*scale;
    const pick=selection?' role="button" tabindex="0" aria-label="'+(side==='left'?'Левая':'Правая')+' дверь"':'';
    return `<g data-hinge="${side}"${pick} transform="translate(${n(pivot)} ${n(y)}) scale(${side==='right'?-1:1} 1)" stroke-linejoin="round">
      <rect x="0" y="${n(-h)}" width="${n(w)}" height="${n(h)}" fill="${selection?.door===side?'#c2dcf4':'#e8e0d2'}" stroke="#495b54" stroke-width="1"/>
      <path d="M${n(w)} ${n(-h)} L0 ${n(-h/2)} L${n(w)} 0" fill="none" stroke="#688278" stroke-width="1" stroke-dasharray="4 4"/>
      <path d="M0 ${n(-h*.91)} V${n(-h*.09)}" stroke="#19664f" stroke-width="2.4"/>
      <path d="M${n(w)} 0 A${n(w)} ${n(drop)} 0 0 1 ${n(tipX)} ${n(tipY)}" fill="none" stroke="#19664f" stroke-width="1.7" stroke-dasharray="3 2"/>
      <path d="M${n(tipX+head)} ${n(tipY-head*.7)} L${n(tipX)} ${n(tipY)} l${n(head*1.1)} ${n(head*.5)}" fill="none" stroke="#19664f" stroke-width="1.7"/>
      <path d="M0 0 L${n(tipX)} ${n(tipY)}" stroke="#19664f" stroke-width="2.6"/>
      <circle r="2.7" fill="#19664f" stroke="#fff" stroke-width=".9"/>
    </g>`;
  }).join('');
}

export function doorOptionDrawing(swing){
  const spec={width:600,height:455};
  return '<svg class="door-opening-picture" viewBox="0 0 140 112" aria-hidden="true">'+doorLeaves(spec,swing,19,82,.17,22)+'</svg>';
}
