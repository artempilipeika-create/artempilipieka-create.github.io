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
