import {WALLS,ORIGINS,dimensionsError,wallLength} from './room-plan.mjs';
import {reconcileSurvey} from './socket-editor.mjs';
const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export function newShaft(room,id){
  const last=(room.features||[]).filter(f=>f.kind==='shaft').at(-1),wall=last?.wall||'a';
  const width=600,offset=last&&last.offset+last.width+width<=wallLength(room,wall)?last.offset+last.width:0;
  return {id,kind:'shaft',wall,offset,elevation:0,width,height:room.height,projection:350,label:'Вентшахта',notes:''};
}
export class ShaftEditor{
  constructor(setup){
    this.setup=setup;this.heightInputs=new Map();this.root=el('section');this.root.id='room-shafts';
    this.root.append(el('h3','Вентшахты и выступы стен'),el('p','Шахта выступает от выбранной стены внутрь комнаты. По умолчанию — от пола до потолка. Ширина идёт вдоль стены, глубина — в комнату. Все размеры — в мм.'));
    this.list=el('div');this.root.append(this.list);
    const add=el('button','＋ Добавить вентшахту');add.type='button';add.id='room-shaft-add';add.onclick=()=>this.add();this.root.append(add);setup.dimensions.append(this.root);
  }
  add(){
    const s=this.setup,r=s.readDimensions(),error=dimensionsError(r);
    if(error){s.error(error);return;}if(r.features.length>=100){s.error('В комнате поддерживается до 100 объектов.');return;}
    const f=newShaft(r,'shaft-'+crypto.randomUUID());s.draft.features.push(f);reconcileSurvey(s.draft);
    s.error('');this.render(f.id);s.preview();this.list.lastElementChild?.scrollIntoView({block:'nearest'});
  }
  resizeRoomHeight(next){
    if(!Number.isInteger(next)||next<2000||next>5000)return;
    const r=this.setup.draft;if(!r)return;
    for(const f of r.features||[])if(f.kind==='shaft'&&f.elevation===0&&f.height===r.height){f.height=next;const input=this.heightInputs.get(f.id);if(input)input.value=String(next);}
    r.height=next;
  }
  render(openId){
    this.list.replaceChildren();this.heightInputs.clear();const s=this.setup,shafts=s.draft.features.filter(f=>f.kind==='shaft');
    if(!shafts.length)this.list.append(el('p','Вентшахты ещё не добавлены.'));
    for(const [index,f]of shafts.entries()){
      const card=el('details');card.className='room-socket-card room-shaft-card';card.open=f.id===openId;
      const title=el('summary');const updateTitle=()=>{title.textContent=`${index+1}. ${f.label||'Вентшахта'} · стена ${f.wall.toUpperCase()}`;};updateTitle();card.append(title);
      const grid=el('div');grid.className='room-feature-grid';card.append(grid);
      const wallLabel=el('label','Стена'),wall=el('select');wall.setAttribute('aria-label',`Стена вентшахты ${index+1}`);
      for(const [value,text]of Object.entries(WALLS)){const option=el('option',text);option.value=value;wall.append(option);}wall.value=f.wall;wallLabel.append(wall);grid.append(wallLabel);
      const nameLabel=el('label','Название'),name=el('input');name.value=f.label||'';name.maxLength=100;name.setAttribute('aria-label',`Название вентшахты ${index+1}`);name.oninput=()=>{f.label=name.value;updateTitle();};nameLabel.append(name);grid.append(nameLabel);
      let offsetLabel,offsetInput;
      for(const [key,label,min,max]of [['offset','Отступ от '+ORIGINS[f.wall],0,12000],['width','Ширина вдоль стены',1,12000],['projection','Глубина выступа в комнату',1,3000],['height','Высота от пола',1,5000]]){
        const l=el('label'),caption=el('span',label),input=el('input');if(key==='offset'){offsetLabel=caption;offsetInput=input;}if(key==='height')this.heightInputs.set(f.id,input);
        Object.assign(input,{type:'number',min:String(min),max:String(max),step:'1',value:String(f[key])});input.setAttribute('aria-label',`${label}, вентшахта ${index+1}`);
        input.oninput=()=>{f[key]=input.value===''?NaN:Number(input.value);s.preview();};l.append(caption,input);grid.append(l);
      }
      wall.onchange=()=>{f.wall=wall.value;offsetLabel.textContent='Отступ от '+ORIGINS[f.wall];offsetInput.setAttribute('aria-label',`${offsetLabel.textContent}, вентшахта ${index+1}`);updateTitle();s.preview();};
      const ceiling=el('button','До потолка');ceiling.type='button';ceiling.onclick=()=>{f.height=s.readDimensions().height;this.heightInputs.get(f.id).value=String(f.height);s.preview();};
      const remove=el('button','Удалить вентшахту');remove.type='button';remove.className='room-socket-remove';remove.onclick=()=>{s.draft.features=s.draft.features.filter(x=>x.id!==f.id);reconcileSurvey(s.draft);this.render();s.preview();};
      const actions=el('div');actions.className='room-inline-actions';actions.append(ceiling,remove);card.append(actions);this.list.append(card);
    }
  }
}
