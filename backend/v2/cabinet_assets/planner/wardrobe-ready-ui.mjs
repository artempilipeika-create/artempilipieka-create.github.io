import {planReadyLayout,readyWardrobes,readySections,recommendWardrobe,layoutSourceKeys} from './wardrobe-ready-layouts.mjs';
import {wardrobeSpec} from './wardrobe-questionnaire.mjs';
import {buildCarcass} from './carcass-model.mjs';
import {wardrobeDrawing} from './wardrobe-drawing.mjs';
import {showroomSnapshot} from './questionnaire-showroom.mjs';

const el=(tag,label='')=>Object.assign(document.createElement(tag),{textContent:label});
const button=(label,onclick)=>Object.assign(el('button',label),{type:'button',onclick});
const folder='/account/planner/wardrobe-layout-images/';
export function imageFor(id,whole=false){
 const file=whole||['daily','deep'].includes(id)?id:'section-'+id;
 const img=el('img');img.alt='';img.loading='lazy';img.decoding='async';img.width=680;img.height=510;
 img.src=folder+file+'.webp?v=studio-pearl-1';return img;
}
function card(id,title,description,whole,choose){
 const b=button('',choose);b.className='ready-card';b.setAttribute('aria-label',title);b.setAttribute('aria-pressed','false');b.dataset.readyPick=id;
 const art=el('span');art.className='ready-card-art';art.append(imageFor(id,whole));b.append(art,el('strong',title));
 if(description)b.append(el('small',description));return b;
}
function accept(ui,plan,request){
 ui.fields=plan.fields;ui.sourceKeys=layoutSourceKeys(ui.sourceKeys,plan.targets,ui.fields.sections);
 const first=request.section??0;ui.activeSection=first;ui.nicheIndex=0;ui.column=0;ui.gapIndex=0;ui.rodId=null;ui.rodDraft=null;
 ui.shelfDrafts={};ui.shelfScopes={};ui.step=2;ui.view='sections';
 ui.interior=['daily','deep'].includes(plan.kinds[0])?'drawer':'cell';ui.wardrobeRoute=null;ui.readyPick=null;
 ui.railSnapshot=null;ui.railUpdates?.clear();ui.changed(true);
 const title=request.section==null?(request.name??readyWardrobes[request.id].name):readySections[request.id];
 ui.output.textContent='Применено наполнение «'+title+'». Каждый элемент можно изменить в секции.';
}
function preview(ui,host,request){
 host.replaceChildren();
 try{
  const plan=planReadyLayout(ui.fields,request),whole=request.section==null;
  const built=buildCarcass(wardrobeSpec(plan.fields),{idPrefix:'ready-preview'});
  const section=request.section??0;
  const title=whole?(request.name??readyWardrobes[request.id].name):readySections[request.id];
  const heading=el('h4',title);host.append(heading);
  const picture=el('div');picture.className='questionnaire-photo';host.append(picture);
  let open=true;
  const show=()=>{
   const snapshot=showroomSnapshot(built,ui,{open,section:whole?null:section});
   picture.replaceChildren(snapshot);
   if(open&&Object.hasOwn(whole?readyWardrobes:readySections,request.id)){
    const reference=imageFor(request.id,whole);
    reference.className='questionnaire-reference';reference.alt='Образец наполнения — '+title;
    picture.append(reference);
   }
  };
  show();
  if(built.doors.length||built.drawerBanks.some(Boolean)){
   const toggle=button('С фасадами',()=>{open=!open;toggle.textContent=open?'С фасадами':'Вид наполнения';show();});
   toggle.className='questionnaire-pose';host.append(toggle);
  }
  const visual=el('div');visual.className='ready-layout-figure';
  const {svg}=wardrobeDrawing(built,'sections',section,null,null,{dimensions:true});visual.innerHTML=svg;host.append(visual);
  const spec=el('ul');spec.className='ready-layout-spec';
  plan.kinds.forEach((kind,i)=>{const s=whole?i:section;spec.append(el('li','Секция '+(s+1)+' · '+plan.widths[s]+' мм в свету · '+readySections[kind]));});host.append(spec);
  for(const note of plan.notes)host.append(el('p',note));
  if(plan.changes.length)host.append(el('small','Текущее наполнение к замене. '+plan.changes.join('. ')+'.'));
  const apply=button(whole?'Применить к шкафу':'Применить к секции',()=>{
   // Values may be edited after opening the card. Always apply the freshly validated design.
   try{accept(ui,planReadyLayout(ui.fields,request),request);}catch(error){host.append(el('p',error.message));}
  });apply.className='assistant-primary';host.append(apply);
 }catch(error){host.append(el('p',error.message));}
}
function quiz(ui,wrapper,select){
 const q=ui.wardrobeAnswers??={room:'bedroom',people:'one',things:[],garmentLength:null};
 const fieldset=el('fieldset');fieldset.className='ready-quiz';wrapper.append(fieldset);
 function invalidate(){ui.readyPick=null;select(null);}
 ui.select(fieldset,'Куда ставим шкаф?',[['bedroom','В спальню'],['hall','В прихожую'],['utility','В хозяйственную зону']],q.room,v=>{q.room=v;invalidate();});
 ui.select(fieldset,'Кто будет пользоваться?',[['one','Один человек'],['two','Двое']],q.people,v=>{q.people=v;invalidate();});
 const choices=el('fieldset');choices.append(el('legend','Что будете хранить?'));choices.className='ready-things';fieldset.append(choices);
 let lengthField;
 for(const [key,label] of [['long','Пальто и платья'],['shirts','Рубашки'],['linen','Бельё и футболки'],['knit','Свитеры и джинсы'],['suits','Брюки и аксессуары'],['shoes','Обувь'],['cleaning','Пылесос и доска']]){
  const row=el('label'),input=el('input');input.type='checkbox';input.checked=q.things.includes(key);
  input.onchange=()=>{q.things=q.things.filter(t=>t!==key);if(input.checked)q.things.push(key);if(lengthField)lengthField.hidden=!q.things.includes('long');invalidate();};
  row.append(input,document.createTextNode(label));choices.append(row);
 }
 lengthField=el('label','Длина самой длинной вещи на плечиках, мм');const length=el('input');length.type='number';length.min='1';length.max='3500';length.step='1';length.placeholder='По желанию';length.value=q.garmentLength??'';
 length.oninput=()=>{q.garmentLength=length.value===''?null:length.valueAsNumber;invalidate();};lengthField.append(length);lengthField.hidden=!q.things.includes('long');fieldset.append(lengthField);
 fieldset.append(button('Показать подходящий шкаф',()=>{if(!lengthField.hidden&&!length.reportValidity())return;
  select({...recommendWardrobe(q),...(q.things.includes('long')&&q.garmentLength?{garmentLength:q.garmentLength}:{})});}));
}
export function startWardrobeControls(ui,parent){
 const box=el('fieldset');box.className='ready-entry';box.append(el('legend','Как собрать шкаф?'));parent.append(box);
 const controls=el('div');controls.className='ready-routes';box.append(controls);
 const route=ui.wardrobeRoute;
 for(const [mode,title] of [['manual','Собрать самому'],['quiz','Пройти опрос'],['catalog','Выбрать готовое наполнение']]){
  const pick=button(title,()=>{ui.readyPick=null;ui.wardrobeRoute=mode;
   if(mode==='manual'){ui.go(2);return;}ui.render();
   ui.form.querySelector('[data-wardrobe-route="'+mode+'"]')?.focus({preventScroll:true});});
  pick.dataset.wardrobeRoute=mode;pick.setAttribute('aria-pressed',String(mode===route));controls.append(pick);
 }
 if(route!=='quiz'&&route!=='catalog')return;
 const result=el('div');result.className='ready-result';result.setAttribute('aria-live','polite');
 const choose=req=>{ui.readyPick=req;for(const c of box.querySelectorAll('[data-ready-pick]'))c.setAttribute('aria-pressed',String(c.dataset.readyPick===req?.id));if(req)preview(ui,result,req);else result.replaceChildren();};
 if(route==='quiz')quiz(ui,box,choose);
 else{
  const cards=el('div');cards.className='ready-cards';box.append(cards);
  for(const [id,data] of Object.entries(readyWardrobes)){
   const choice=card(id,data.name,data.description,true,()=>choose({id}));choice.setAttribute('aria-pressed',String(id===ui.readyPick?.id));cards.append(choice);
  }
 }
 box.append(result);ui.refreshReady=()=>{if(ui.readyPick)preview(ui,result,ui.readyPick);};
}
export function readySectionControls(ui,parent,section){
 const box=el('details');box.className='ready-section-list';box.append(el('summary','Готовая секция целиком'));parent.append(box);
 const cards=el('div');cards.className='ready-cards';const result=el('div');result.className='ready-result';result.setAttribute('aria-live','polite');
 box.append(cards,result);
 for(const [id,title] of Object.entries(readySections))cards.append(card(id,title,'',false,()=>{
  for(const c of cards.children)c.setAttribute('aria-pressed',String(c.dataset.readyPick===id));
  preview(ui,result,{id,section});
 }));
}
