import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {feetCatalogue} from '../../backend/v2/cabinet_assets/planner/wardrobe-feet.mjs';
import {fittings} from '../../backend/v2/cabinet_assets/planner/shelf-choices.mjs';
import {primeHinge} from '../../backend/v2/cabinet_assets/planner/wardrobe-fronts.mjs';
import {fittingPhotoUrl,productionHingeArticles} from '../../backend/v2/cabinet_assets/planner/hardware-photos.mjs';
import {aksPushProductControls} from '../../backend/v2/cabinet_assets/planner/wardrobe-push-product-ui.mjs';
import {pushProducts} from '../../backend/v2/cabinet_assets/planner/wardrobe-push-layout.mjs';

const sources=JSON.parse(readFileSync(new URL('../../docs/hardware-photos-20261116/sources.json',import.meta.url)));
test('every wardrobe foot, shelf support and hinge has a catalogue photograph mapped to its SKU',()=>{
  for(const {article} of [...feetCatalogue,...fittings,primeHinge]){
    const record=sources[article],pictured=record?.picturedArticle||article;
    assert.ok(record?.source.startsWith('https://'),article);
    assert.equal(fittingPhotoUrl(article).split('?')[0],'/account/planner/shelf-images/'+pictured+'.webp');
    const image=readFileSync(new URL('../../backend/v2/cabinet_assets/planner/shelf-images/'+pictured+'.webp',import.meta.url));
    assert.equal(image.toString('ascii',8,12),'WEBP',article);
  }
  assert.equal(sources['85881'].picturedArticle,'112445');assert.equal(sources['85881'].selectedHeightMm,150);
});
test('kitchen hinge photographs match actual unique hardware articles, including the nickel Blum hinge',()=>{
  const hardware={hinge_article:'112602',items:[{article:'112602'},{article:'70T950A.TLMB V50 NI'},{article:'95388'}]};
  assert.deepEqual(productionHingeArticles(hardware),['112602','70T950A.TLMB V50 NI']);
  assert.deepEqual(productionHingeArticles(null),[]);
});

test('push series and finishes select the article shown in the supplier photograph and keep installation settings',t=>{
 const element=()=>({children:[],dataset:{},append(...children){this.children.push(...children);},setAttribute(k,v){this[k]=v;}});
 const original=globalThis.document;
 t.after(()=>{if(original===undefined)delete globalThis.document;else globalThis.document=original;});
 globalThis.document={createElement:element};
 const controls=new Map(),ui={select(_,label,options,selected,onchange){controls.set(label,onchange);}};
 let value={article:'72255',mount:'auto',support:'bottom',heightMm:900},cards;
 function render(next){
  const section=element();value=next;aksPushProductControls(ui,section,value,render);cards=section.children[0].children;
  assert.equal(cards.find(b=>b['aria-pressed']==='true')?.dataset.pushArticle,value.article);
  for(const card of cards){
   const article=card.dataset.pushArticle,[img,caption]=card.children[0].children;
   assert.equal(img.src,'/account/planner/shelf-images/'+article+'.webp');assert.equal(img.dataset.source,pushProducts[article].photoSource);
   assert.ok(caption.textContent.includes(article));
   const image=readFileSync(new URL('../../backend/v2/cabinet_assets/planner/shelf-images/'+article+'.webp',import.meta.url));
   assert.equal(image.toString('ascii',8,12),'WEBP');
  }
 }
 render(value);
 assert.deepEqual(cards.map(card=>card.dataset.pushArticle),['73723','72255','74055']);
 cards[0].onclick();assert.equal(value.article,'73723');
 controls.get('Цвет типона')('серый');assert.equal(value.article,'70787');
 cards[1].onclick();assert.equal(value.article,'72258');
 controls.get('Наконечник')('rubber');assert.equal(value.article,'82723');
 controls.get('Монтаж типона')('bored');assert.equal(cards.length,1);
 assert.deepEqual(value,{article:'82723',mount:'bored',support:'bottom',heightMm:900});
});
