import assert from 'node:assert/strict';
import test from 'node:test';

const {assignCabinetBlocks,wardrobeNames,nextCabinetName}=await import(process.env.MF_BLOCK_EXPORTER || new URL('../../backend/v2/cabinet_assets/planner/wardrobe-blocks.mjs',import.meta.url));
const part=(group,key,name,props={})=>({
 item_id:group+':'+key,name,assistant_carcass:{group_id:group,spec:{sections:1}},...props
});
const board=it=>({blank_item_id:it.item_id,name:it.name});
test('preserves hand-written part labels and gives generated fronts their tier and handing',()=>{
 const g='stable/id:9',name='Прихожая · Модуль';
 const raw=[
  part(g,'left',name+' · Боковина левая'),
  part(g,'right',name+' · Боковина правая'),
  ...['upper','lower'].flatMap(row=>['left','right'].map(side=>part(g,'door-'+row+'-'+side,name+' · Фасад '+(row==='upper'?'верхний':'нижний')+' · петли '+(side==='left'?'слева':'справа')))),
  part(g,'shelf-0-0',name+' · Полка 1'),
  part(g,'door-left',name+' · Роспись · №1'),
  part(g,'shelf-0-1','Полка для воска · 2 ячейки'),
  part(g,'drawer-0-0-face',name+' · Фасад · шуфляда 1 · секция 1'),
  part(g,'drawer-33-0-face',name+' · Фасад · шуфляда 1 · секция 1'),
 ];
 raw.forEach(p=>{p.assistant_carcass.name=name;p.assistant_carcass.spec.nicheSplits=[{section:0,level:0,kind:'drawers'}];});
 const rows=raw.map(board);
 rows.push({wardrobe_handle:true,article:'67698',name:'Ручка · '+raw[9].name,host_blank_id:raw[9].item_id,joined_panel_id:raw[9].item_id});
 assert.equal(assignCabinetBlocks(rows,raw),rows.length);
 assert.deepEqual(rows.slice(2,6).map(x=>x.name),['Фасад верхний левый','Фасад верхний правый','Фасад нижний левый','Фасад нижний правый']);
 assert.deepEqual(rows.slice(6,9).map(x=>x.name),['Полка 1',name+' · Роспись · №1','Полка для воска · 2 ячейки']);
 assert.equal(rows[9].cabinet_block.drawer_key,'0-0');
 assert.equal(rows[10].cabinet_block.drawer_key,'33-0');
 assert.match(rows[9].cabinet_block.drawer_name,/слева/);
 assert.match(rows[10].cabinet_block.drawer_name,/справа/);
 assert.equal(rows[11].cabinet_block.drawer_key,'0-0');
 assert.equal(rows[11].name,'Ручка · 67698');
 const saved=structuredClone(rows);
 assignCabinetBlocks(rows,raw);
 assert.deepEqual(rows,saved);
});

test('shared plinth, cross-unit connection, mixed stand-alone entities and unbound modules stay on model level',()=>{
 const raw=[
  part('a','left','Корпус ИИ · Боковина левая'),part('b','left','Корпус ИИ · Боковина левая'),
  part('a','plinth','Корпус ИИ · Цоколь',{blank_plinth_run:['a','b']}),{item_id:'free',name:'Корпусная панель'},
  part('a','drawer-0-0-side-left','Корпус ИИ · Левая боковина · шуфляда 1 · секция 1')
 ];
 const rows=[
  ...raw.map(board),{name:'Шкант · '+raw[0].name,host_blank_id:raw[0].item_id,joined_panel_id:raw[1].item_id},
  {name:'Кронштейн · '+raw[0].name,host_blank_id:raw[0].item_id,joined_panel_id:'free'},
  {name:'Мойка'}, {name:'Шуруп',host_blank_id:raw[2].item_id},
  {name:'Направляющая',host_blank_id:raw[0].item_id,joined_panel_id:raw[4].item_id,aks_kind:'rail'}
 ];
 const stable=raw.map(r=>r?JSON.stringify(r):r);
 assert.deepEqual([...wardrobeNames(raw)],[['a','Шкаф 01'],['b','Шкаф 02']]);
 assert.equal(nextCabinetName(raw),'Шкаф 03');
 assert.equal(assignCabinetBlocks(rows,raw),4);
 assert.deepEqual(stable,raw.map(r=>JSON.stringify(r)));
 assert.deepEqual(rows.slice(2,4).map(r=>r.name),['Общий цоколь','Корпусная панель']);
 for(const i of [2,3,5,6,7,8])assert.equal(rows[i].cabinet_block,undefined);
 assert.equal(rows[9].cabinet_block.name,'Шкаф 01');
 assert.equal(rows[9].cabinet_block.drawer_key,undefined);
 rows[9].joined_panel_id=raw[1].item_id;
 assignCabinetBlocks(rows,raw);
 assert.equal(rows[9].cabinet_block,undefined);
});

test('uses explicit cabinet name, honours legacy custom prefixes and reserves existing sequential names',()=>{
 const raw=[part('a','left','Корпус ИИ · Боковина левая'),part('b','left','Корпус ИИ · Боковина левая'),part('c','left','Спальня  · Боковина левая')];
 raw[1].assistant_carcass.name='Шкаф 01';
 assert.deepEqual([...wardrobeNames(raw).values()].slice(0,2),['Шкаф 02','Шкаф 01']);
 assert.equal(nextCabinetName(raw),'Шкаф 03');
});

test('right and left native trims stay separate across cupboards and detached return geometry cannot silently move',async()=>{
 const {buildCarcass,placeCarcass}=await import('../../backend/v2/cabinet_assets/planner/carcass-model.mjs');
 const {nativeTrimRows}=await import('../../backend/v2/cabinet_assets/planner/wardrobe-trim-native.mjs');
 const lookup=id=>({name:id,thickness:18});
 const surround={right:{kind:'filler',width:87,heightMode:'full'},left:{kind:'end',depth:150,projection:20}};
 const boards=['a','b'].flatMap((id,i)=>{
  const built=buildCarcass({recipe:'shelves',width:1000,height:1900,depth:600,surround},
   {idPrefix:id,name:id,frontMaterialId:'front',bodyMaterialId:'body'});
  return placeCarcass(built,{x:500+i*1200,z:765,elevation_mm:31,rotation:i*180})
   .map(p=>({...p,assistant_carcass:{group_id:id,name:id,spec:built.spec}}));
 });
 const rows=[...nativeTrimRows(boards,lookup).values()].filter(Boolean);
 assert.deepEqual(rows.map(p=>p.source_file),['MF_Trim_End.fr3d','MF_Trim_Left.fr3d','MF_Trim_End.fr3d','MF_Trim_Left.fr3d']);
 assignCabinetBlocks(rows,boards);
 assert.deepEqual(rows.map(p=>p.cabinet_block.name),['a','a','b','b']);
 assert.equal(rows[1].wardrobe_trim.expected_pairs,4);
 assert.throws(()=>nativeTrimRows(boards.filter(p=>p.item_id!=='b:trim-right-return'),lookup),/неполный комплект/);
 const second=boards.find(p=>p.item_id==='b:trim-right-return');second.z+=2;
 assert.throws(()=>nativeTrimRows(boards,lookup),/взаимное положение/);
});

test('independent native trim segments keep their quarter-millimetre cuts, labels, materials and workshop joints',async()=>{
 const {buildCarcass,placeCarcass}=await import('../../backend/v2/cabinet_assets/planner/carcass-model.mjs');
 const {nativeTrimRows}=await import('../../backend/v2/cabinet_assets/planner/wardrobe-trim-native.mjs');
 const lookup=id=>({name:id,thickness:18});
 for(const rotation of [0,90,180,270]){
  const boards=[];
  const heights=[100,800.25,400.25];
  for(const [owner,fillerSide] of [['A','left'],['B','right']]){
   const endSide=fillerSide==='left'?'right':'left';
   const surround={[fillerSide]:{kind:'filler',width:112},[endSide]:{kind:'end',depth:150,projection:20}};
   const built=buildCarcass({recipe:'shelves',width:1000,height:1900,depth:600,surround},
    {idPrefix:owner,name:owner,frontMaterialId:'F',bodyMaterialId:'B'});
   const originals=placeCarcass(built,{x:owner==='A'?500:1700,z:765,elevation_mm:31,rotation});
   for(const original of originals.filter(p=>p.item_id.includes(':trim-'))){
    const [,side,role]=original.item_id.split(':trim-')[1].match(/^(left|right)-(face|return|end)$/);
    let bottom=32.5;
    for(const [i,height] of heights.entries()){
     const ordinal=i+1,stem=(side==='left'?'Левая':'Правая')+(role==='end'?' торцевая стойка':' фальшпланка');
     const name=stem+' · часть '+ordinal+({face:' · глухой фасад',return:' · боковая проставка',end:''})[role];
     const key='trim-'+side+(i?'-'+ordinal:'')+'-'+role;
     boards.push({...original,item_id:owner+':'+key,name:owner+' · '+name,height,
      [role==='face'?'blank_width_mm':'blank_length_mm']:height,elevation_mm:bottom,
      body_variant_id:owner+key,production_note:'Метка '+owner+key,assistant_carcass:{group_id:owner,name:owner,spec:built.spec}});
     bottom+=height;
    }
   }
  }
  const rows=[...nativeTrimRows(boards,lookup).values()].filter(Boolean);
  assert.equal(rows.length,12);assert.equal(assignCabinetBlocks(rows,boards),12);
  for(const row of rows){
   const ref=boards.find(p=>p.item_id===row.host_blank_id);
   const [,side,label,role]=ref.item_id.split(':trim-')[1].match(/^(left|right)(?:-(\d))?-(face|end)$/);
   const index=Number(label||1)-1,owner=ref.assistant_carcass.group_id,trim=row.wardrobe_trim;
   assert.equal(row.cabinet_block.name,owner);
   assert.equal(row.target.height,heights[index]);assert.equal(row.position.y,[32.5,132.5,932.75][index]);
   assert.equal(row.rotation,rotation);assert.match(row.name,new RegExp('часть '+(index+1)+'$'));
   assert.equal(row.source_file,role==='end'?'MF_Trim_End.fr3d':side==='left'?'MF_Trim_Right.fr3d':'MF_Trim_Left.fr3d');
   assert.equal(trim.expected_pairs,role==='end'?0:[1,3,2][index]);
   assert.deepEqual(trim.panels.map(p=>p.role),role==='end'?['end']:['face','return']);
   for(const p of trim.panels){
    const board=boards.find(it=>it.item_id===p.blank_item_id);
    assert.equal(p.name,board.name.slice((owner+' · ').length));
    assert.equal(p.material.name,board.body_variant_id);
    assert.equal(p.production_note,board.production_note);assert.ok(row.production_note.includes(board.production_note));
   }
  }
  const incomplete=boards.filter(p=>p.item_id!=='A:trim-left-2-return');
  assert.throws(()=>nativeTrimRows(incomplete,lookup),/часть 2 — неполный комплект/);
  const unsafe=boards.map(p=>p.item_id==='A:trim-left-face'?{...p,height:99.75}:p);
  assert.throws(()=>nativeTrimRows(unsafe,lookup),/часть 1 — высота одной детали.*100/);
  const shifted=boards.map(p=>p.item_id==='A:trim-left-2-return'?{...p,elevation_mm:p.elevation_mm+.25}:p);
  assert.throws(()=>nativeTrimRows(shifted,lookup),/часть 2.*взаимное положение/);
 }
});
