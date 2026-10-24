import {FEATURES,WALLS,ORIGINS,dimensionsError,wallLength} from './room-plan.mjs';
import {reconcileSurvey} from './socket-editor.mjs';

// Presentation envelopes, editable to match the measured appliance or opening.
export const EQUIPMENT=Object.freeze({
  window:{width:1400,height:1300,projection:180,elevation:900},
  radiator:{width:1000,height:600,projection:100,elevation:150},
  gas_cooker:{width:600,height:850,projection:600,elevation:0},
  gas_boiler:{width:420,height:720,projection:320,elevation:1400},
  water_heater:{width:450,height:850,projection:450,elevation:1300}
});
export function newEquipment(room,kind,id){
  if(!Object.hasOwn(EQUIPMENT,kind))throw Error('Unknown room equipment');
  const size={...EQUIPMENT[kind]},last=(room.features||[]).filter(f=>f.kind===kind).at(-1),wall=last?.wall||'a';
  size.elevation=Math.min(size.elevation,room.height-size.height);
  const next=last?last.offset+last.width+100:300;
  const offset=next+size.width<=wallLength(room,wall)?next:0;
  return {id,kind,wall,offset,...size,label:FEATURES[kind][0],notes:''};
}
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export class EquipmentEditor{
  constructor(setup){
    this.setup=setup;this.root=el('section');this.root.id='room-equipment';
    this.root.append(el('h3','Окна и оборудование'),el('p','Укажите размеры по замеру. Ширина идёт вдоль выбранной стены, глубина — в комнату, высота от пола — до нижнего края.'));
    const choices=el('div');choices.className='room-equipment-choices';
    for(const kind of Object.keys(EQUIPMENT)){const add=el('button','＋ '+FEATURES[kind][0]);add.type='button';add.setAttribute('aria-label','Добавить в комнату: '+FEATURES[kind][0]);add.onclick=()=>this.add(kind);choices.append(add);}
    this.root.append(choices);this.list=el('div');this.root.append(this.list);setup.dimensions.append(this.root);
  }
  add(kind){
    const s=this.setup,r=s.readDimensions(),error=dimensionsError(r);if(error){s.error(error);return;}
    if(r.features.length>=100){s.error('В комнате поддерживается до 100 объектов.');return;}
    const f=newEquipment(r,kind,kind+'-'+crypto.randomUUID());s.draft.features.push(f);reconcileSurvey(s.draft);
    s.error('');this.render(f.id);s.preview();this.list.lastElementChild?.scrollIntoView({block:'nearest'});
  }
  render(openId){
    this.list.replaceChildren();const s=this.setup,features=s.draft.features.filter(f=>Object.hasOwn(EQUIPMENT,f.kind));
    if(!features.length)this.list.append(el('p','Окна и оборудование ещё не добавлены.'));
    for(const [index,f]of features.entries()){
      const label=FEATURES[f.kind][0],card=el('details');card.className='room-socket-card room-equipment-card';card.open=f.id===openId;
      const title=el('summary'),updateTitle=()=>title.textContent=`${index+1}. ${f.label||label} · стена ${f.wall.toUpperCase()}`;updateTitle();card.append(title);
      const grid=el('div');grid.className='room-feature-grid';card.append(grid);
      const wallLabel=el('label','Стена'),wall=el('select');wall.setAttribute('aria-label',`Стена, ${label} ${index+1}`);
      for(const [value,text]of Object.entries(WALLS)){const option=el('option',text);option.value=value;wall.append(option);}wall.value=f.wall;wallLabel.append(wall);grid.append(wallLabel);
      const nameLabel=el('label','Название'),name=el('input');name.value=f.label||'';name.maxLength=100;name.setAttribute('aria-label',`Название, ${label} ${index+1}`);name.oninput=()=>{f.label=name.value;updateTitle();};nameLabel.append(name);grid.append(nameLabel);
      let offsetCaption,offsetInput;
      for(const [key,text,min,max]of [['offset','Отступ от '+ORIGINS[f.wall],0,12000],['elevation','Высота нижнего края от пола',0,5000],['width','Ширина',1,12000],['height','Высота',1,5000],['projection',f.kind==='window'?'Выступ подоконника':'Глубина',f.kind==='window'?0:1,3000]]){
        const l=el('label'),caption=el('span',text),input=el('input');if(key==='offset'){offsetCaption=caption;offsetInput=input;}
        Object.assign(input,{type:'number',min:String(min),max:String(max),step:'1',value:String(f[key])});input.setAttribute('aria-label',`${text}, ${label} ${index+1}`);
        if(key==='elevation'&&f.kind==='gas_cooker')input.disabled=true;
        input.oninput=()=>{f[key]=input.value===''?NaN:Number(input.value);s.preview();};l.append(caption,input);grid.append(l);
      }
      wall.onchange=()=>{f.wall=wall.value;offsetCaption.textContent='Отступ от '+ORIGINS[f.wall];offsetInput.setAttribute('aria-label',`${offsetCaption.textContent}, ${label} ${index+1}`);updateTitle();s.preview();};
      const noteLabel=el('label','Примечание'),note=el('textarea');note.value=f.notes||'';note.maxLength=500;note.setAttribute('aria-label',`Примечание, ${label} ${index+1}`);note.oninput=()=>f.notes=note.value;noteLabel.append(note);card.append(noteLabel);
      const remove=el('button','Удалить: '+label);remove.type='button';remove.className='room-socket-remove';remove.onclick=()=>{s.draft.features=s.draft.features.filter(x=>x.id!==f.id);reconcileSurvey(s.draft);this.render();s.preview();};card.append(remove);this.list.append(card);
    }
  }
}
