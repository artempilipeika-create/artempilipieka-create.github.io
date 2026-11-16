import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {feetCatalogue} from '../../backend/v2/cabinet_assets/planner/wardrobe-feet.mjs';
import {fittings} from '../../backend/v2/cabinet_assets/planner/shelf-choices.mjs';
import {primeHinge} from '../../backend/v2/cabinet_assets/planner/wardrobe-fronts.mjs';
import {fittingPhotoUrl,productionHingeArticles} from '../../backend/v2/cabinet_assets/planner/hardware-photos.mjs';

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
