import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectSafety} from '../../backend/v2/cabinet_assets/planner/project-safety.mjs';

test('order submission reports only the blocking reason without opening a project check',()=>{
 const item={item_id:'x'}, warning={severity:'warning',message:'Проверить размер'};
 const invalid={severity:'error',name:'Шкаф',message:'Выберите материал'};
 for(const [items,issues,expected] of [
   [[],[],'Добавьте мебель в проект.'],[[item],[warning,invalid],'Шкаф · Выберите материал'],[[item],[warning],'']
 ]){
   const safety=Object.assign(Object.create(ProjectSafety.prototype),{
     bridge:{state:()=>({items})},report:()=>({issues})
   });
   assert.equal(safety.orderError(),expected);
 }
});
