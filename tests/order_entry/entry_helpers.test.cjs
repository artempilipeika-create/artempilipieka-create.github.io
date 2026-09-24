const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('backend/v2/cabinet_assets/entry_helpers.js','utf8')+';this.helpers=MFEntry;',ctx);const h=ctx.helpers;
const rows=matrix=>matrix.map((r,i)=>({row:i+1,cells:Object.fromEntries(r.map((value,j)=>[String.fromCharCode(65+j),{value}]))}));
test('legacy block shape detects dimensions without swallowing company preamble',()=>{
 const result=h.detect(rows([['','Company'],['ЛДСП 621 PO','','','Количество','в','н','л','п','текстура','наименование'],['',600,400,2,1,0,1,0,'','Полка'],['',700,300,1,1,0,0,1,'','Боковина']]));
 assert.equal(result.start,2);assert.equal(result.end,2);assert.equal(result.mapping.length,'B');assert.equal(result.mapping.width,'C');assert.equal(result.mapping.L1,'E');assert.equal(result.blocks,true);
});
test('multirow Russian headers and side aliases remain independent',()=>{
 const result=h.detect(rows([['№','Материал','Длина','Ширина','Количество','Кромка','Кромка'],['','','','','','Х1','У2'],[1,'621 PO',600,400,2,1,1]]));
 assert.equal(result.end,2);assert.equal(result.mapping.L1,'F');assert.equal(result.mapping.W2,'G');assert.equal(result.mapping.material,'B');
});
test('edge hints require exact decor and sufficient width',()=>{
 const m={article:'621 PO',thickness:18};const edges=[{edge_id:'good',article:'621 РО',width:22},{edge_id:'wrong',article:'621 PE',width:22},{edge_id:'prefix',article:'1621 PO',width:22},{edge_id:'narrow',article:'621 PO',width:16}];
 assert.equal(h.edgeDefault(m,edges),'good');assert.equal(h.edgeDefault(m,[...edges,{edge_id:'wider',article:'621 PO',width:23}]),'good');
});
test('visible autocomplete ranks full codes first and also searches names and geometry',()=>{
 const materials=[{article:'1621 PO',name:'Дуб тёмный'},{article:'621 PE',name:'Белый',thickness:18,length:2440},{article:'621 PO',name:'Дуб светлый',thickness:18,length:2800}];
 assert.equal(h.materialMatches(materials,'621 РО')[0].article,'621 PO');
 assert.equal(h.materialMatches(materials,'дуб светлый 2800')[0].article,'621 PO');
 assert.equal(h.materialMatches(materials,'unknown').length,0);
});
test('v9-style exact material detection separates similar article codes',()=>{
 const materials=[{variant_id:'po',article:'621 PO',name:'Пепел PO',thickness:18},{variant_id:'pe',article:'621 PE',name:'Пепел PE',thickness:18},{variant_id:'h1180',article:'H1180 ST37',name:'Дуб',thickness:18},{variant_id:'h11800',article:'H11800 ST37',name:'Другой дуб',thickness:18}];
 assert.equal(h.exactMaterial(materials,'621 PE','').variant_id,'pe');
 assert.equal(h.exactMaterial(materials,'','ЛДСП EGGER H1180 ST37 Дуб 18 мм').variant_id,'h1180');
 assert.equal(h.exactMaterial(materials,'','ЛДСП H11800 ST37 Другой дуб').variant_id,'h11800');
 assert.equal(h.exactMaterial(materials,'621 PX',''),null);
});
test('edge designation matches a complete article, ranks sizes, rejects conflicting structure and brand',()=>{
 const m={article:'621 PO',thickness:18,manufacturer:'Test'};
 const edge=(id,designation,width=22,thickness=1,manufacturer='Test')=>({edge_id:id,article:id,designation,width,thickness,manufacturer});
 const edges=[edge('bad','621 POX'),edge('pe','621 PE'),edge('prefix','1621 PO'),edge('brand','621 PO',22,1,'Other'),edge('wide','621 PO',43),edge('thin','Для 621 РО, белый',22,.4),edge('best','Для 621 PO / 777 PE')];
 assert.equal(h.edgeCandidates(m,edges).map(e=>e.edge_id).join(','),'best,thin,wide');
 assert.equal(h.edgeDefault(m,edges),'best');
 assert.equal(h.edgeDefault({...m,family:'customer'},edges),null);
 assert.equal(h.edgeDefault({article:'()',thickness:18},edges),null);
});
test('group edge selection updates every marked side and preserves manual exceptions',()=>{
 const rows=[{edges:{L1:{edge_id:'old',selection_mode:'auto'},L2:{edge_id:'old',selection_mode:'manual'},W1:{edge_id:'special',selection_mode:'manual'},W2:{edge_id:null,selection_mode:'manual',unresolved:false}}},{edges:{L1:{edge_id:null,selection_mode:'auto',unresolved:true},L2:{edge_id:null,selection_mode:'manual',unresolved:false},W1:{edge_id:'old',selection_mode:'auto'}}}];
 const r=h.applyGroupEdgeSelection(rows,'old','new');
 assert.equal(r.changed,3);assert.equal(r.protectedSides,2);
 assert.equal(rows[0].edges.L1.edge_id,'new');assert.equal(rows[0].edges.L1.selection_mode,'auto');
 assert.equal(rows[0].edges.L2.edge_id,'old');assert.equal(rows[0].edges.L2.selection_mode,'manual');
 assert.equal(rows[0].edges.W1.edge_id,'special');assert.equal(rows[0].edges.W1.selection_mode,'manual');
 assert.equal(rows[0].edges.W2.edge_id,null);assert.equal(rows[0].edges.W2.selection_mode,'manual');
 assert.equal(rows[1].edges.L1.edge_id,'new');assert.equal(rows[1].edges.L1.unresolved,false);
 assert.equal(rows[1].edges.L2.edge_id,null);assert.equal(rows[1].edges.W1.edge_id,'new');
});
test('AUTO preserves manual SKU and explicit NONE',()=>{
 for(const previous of [{edge_id:'manual',selection_mode:'manual'},{edge_id:null,selection_mode:'manual'}])assert.equal(h.autoEdge(previous,'new'),previous);
 assert.equal(h.autoEdge({edge_id:'old',selection_mode:'auto'},'new').edge_id,'new');assert.equal(h.autoEdge(undefined,'new').selection_mode,'auto');
});
test('preview grouping separates physical variants and keeps zero quantities',()=>{
 const mk=(thickness,qty)=>({original:{values:{material:'621 PO',thickness,qty}},resolution:{}});
 const groups=h.previewGroups([mk(18,0),mk(18,2),mk(16,1)]);assert.equal(groups.length,2);assert.equal(groups[0].rows.length,2);assert.equal(groups[0].rows[0].original.values.qty,0);
});
