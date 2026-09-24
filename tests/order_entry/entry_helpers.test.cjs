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
 assert.equal(h.edgeDefault(m,edges),'good');assert.equal(h.edgeDefault(m,[...edges,{edge_id:'ambiguous',article:'621 PO',width:23}]),null);
});
test('AUTO preserves manual SKU and explicit NONE',()=>{
 for(const previous of [{edge_id:'manual',selection_mode:'manual'},{edge_id:null,selection_mode:'manual'}])assert.equal(h.autoEdge(previous,'new'),previous);
 assert.equal(h.autoEdge({edge_id:'old',selection_mode:'auto'},'new').edge_id,'new');assert.equal(h.autoEdge(undefined,'new').selection_mode,'auto');
});
test('preview grouping separates physical variants and keeps zero quantities',()=>{
 const mk=(thickness,qty)=>({original:{values:{material:'621 PO',thickness,qty}},resolution:{}});
 const groups=h.previewGroups([mk(18,0),mk(18,2),mk(16,1)]);assert.equal(groups.length,2);assert.equal(groups[0].rows.length,2);assert.equal(groups[0].rows[0].original.values.qty,0);
});
