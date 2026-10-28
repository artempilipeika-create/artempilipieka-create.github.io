import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const source=fs.readFileSync(new URL('../../backend/v2/cabinet_assets/planner/kitchen-album-ui.mjs',import.meta.url),'utf8');
const photo='data:image/jpeg;base64,cGFpZC1waG90bw==',view='data:image/png;base64,dmlldw==';
function harness({existing={state:'none'},pdfFails=false,renderPending=false,preflightFails=false}={}){
  let dialog,paid=0,pdfAttempts=0,current=existing,version=1,timers=new Map(),serial=0;
  const exports=[],requests=[],state={id:'project',version:1,user:'owner',scene:{width:600,albumSettings:{order_number:"QA-125"}}};
  class Element{
    constructor(){this.hidden=false;this.disabled=false;this.checked=false;this.parent={};this.elements=new Map();}
    set innerHTML(html){this.html=html;for(const match of html.matchAll(/<[^>]+\b(data-[\w-]+)[^>]*>/g)){
      const e=new Element();e.hidden=/\bhidden\b/.test(match[0]);e.disabled=/\bdisabled\b/.test(match[0]);this.elements.set(`[${match[1]}]`,e);
    }}
    querySelector(selector){assert.ok(this.elements.has(selector),selector);return this.elements.get(selector);}
    closest(){return this.parent;}
    setAttribute(){} addEventListener(){} showModal(){} close(){} remove(){dialog=null;}
    scrollIntoView(){this.scrolled=true;}
    getContext(){return {fillRect(){},drawImage(){}};}
  }
  const context=vm.createContext({Blob,Uint8Array,atob,structuredClone,crypto:{randomUUID},
    URL:{createObjectURL:()=>`blob:${++serial}`,revokeObjectURL(){}},
    document:{createElement:()=>new Element(),body:{append:d=>{dialog=d;}},getElementById:()=>dialog},
    createImageBitmap:async()=>({width:1536,height:1024,close(){}}),
    setTimeout:fn=>{const id=++serial;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    fetch:async(url,opts)=>{assert.match(url,/sales-album.pdf$/);const body=JSON.parse(opts.body);exports.push(body);pdfAttempts++;
      return {ok:!pdfFails||pdfAttempts>1,json:async()=>({}),blob:async()=>new Blob(['PDF'])};}
  });
  vm.runInContext(source.replace('export async function','async function'),context);
  const options={setOrderNumber:value=>{state.scene.albumSettings={order_number:value};},save:async()=>{state.version=++version;},snapshot:()=>structuredClone(state),capture:async()=>({hero:view,detail:view}),
    request:async(path,method='GET',body)=>{requests.push({path,method,body});
      if(path==='/3d-sales-capabilities')return {automatic_render:true};
      if(path.endsWith('/sales-album/preflight')){
        if(preflightFails)throw Error('Список модулей не помещается на странице.');
        return {ok:true};
      }
      if(path.endsWith('/reuse')||method==='GET')return current;
      assert.match(path,/sales-photo$/);paid++;assert.equal(body.render_style,'lived_in');
      current=renderPending?{state:'pending'}:{state:'ready',image_data_url:photo};return current;
    }};
  return {open:()=>context.openKitchenAlbum(options),get d(){return dialog;},q:s=>dialog.querySelector(s),exports,requests,
    get paid(){return paid;},state,setResult:r=>current=r,tick:async()=>{const f=[...timers.values()][0];assert.ok(f);timers.clear();await f();}};
}
test('One consent creates one photo and automatically uses the original in the four-page PDF',async()=>{
  const h=harness();await h.open();assert.equal(h.paid,0);
  h.q('[data-consent]').checked=true;h.q('[data-consent]').onchange();
  await Promise.all([h.q('[data-create]').onclick(),h.q('[data-create]').onclick()]);
  assert.equal(h.paid,1);assert.equal(h.exports.length,1);
  assert.ok(h.requests.findIndex(r=>r.path.endsWith('/sales-album/preflight'))<h.requests.findIndex(r=>r.path.endsWith('/sales-photo')));
  assert.equal(h.exports[0].detail_data_url,undefined);assert.equal(h.exports[0].hero_data_url,photo);assert.equal(h.exports[0].layout,'client');assert.equal(h.exports[0].photo,true);
  assert.equal(h.q('[data-pdf]').hidden,false);assert.doesNotMatch(h.d.html,/data-technical|data-new|data-reviewed|data-hero|type="file"/);
  h.q('[data-close]').onclick();await h.open();
  assert.equal(h.paid,1);assert.equal(h.exports.length,2);assert.equal(h.exports[1].hero_data_url,photo);
  assert.equal(h.q('[data-create]').hidden,true);
});
test('Rebuilding a failed PDF never calls the paid provider again',async()=>{
  const h=harness({existing:{state:'ready',image_data_url:photo},pdfFails:true});await h.open();
  assert.equal(h.q('[data-build]').hidden,false);assert.equal(h.q('[data-pdf]').hidden,true);
  assert.equal(h.q('[data-message]').scrolled,true);
  assert.ok(h.d.html.indexOf('data-message')>h.d.html.indexOf('data-preview'));
  await h.q('[data-build]').onclick();assert.equal(h.paid,0);assert.equal(h.q('[data-pdf]').hidden,false);
});
test('Layout failure is visible and blocks charging before the paid image request',async()=>{
  const h=harness({preflightFails:true});await h.open();
  assert.match(h.q('[data-message]').textContent,/Список модулей/);
  assert.equal(h.q('[data-message]').scrolled,true);
  h.q('[data-consent]').checked=true;h.q('[data-consent]').onchange();
  assert.equal(h.q('[data-create]').disabled,true);
  await h.q('[data-create]').onclick();assert.equal(h.paid,0);
});
test('Pending render is checked automatically using GET and then inserted into PDF',async()=>{
  const h=harness({renderPending:true});await h.open();h.q('[data-consent]').checked=true;
  await h.q('[data-create]').onclick();assert.equal(h.paid,1);assert.equal(h.exports.length,0);
  h.setResult({state:'ready',image_data_url:photo});await h.tick();
  assert.equal(h.paid,1);assert.equal(h.exports[0].detail_data_url,undefined);assert.equal(h.exports[0].hero_data_url,photo);
  assert.equal(h.requests.at(-1).method,'GET');
});
test('Uncertain existing charge is blocked and a changed project cannot download stale PDF',async()=>{
  const h=harness({existing:{state:'uncertain',message:'Check provider'}});await h.open();
  assert.equal(h.q('[data-create]').hidden,true);assert.equal(h.paid,0);
  h.setResult({state:'ready',image_data_url:photo});await h.q('[data-check]').onclick();
  h.state.scene.width=700;let prevented=false;h.q('[data-pdf]').onclick({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(h.paid,0);
});
test('Changing the saved order number rebuilds the PDF with the same paid photo',async()=>{
  const h=harness({existing:{state:'ready',image_data_url:photo}});await h.open();
  h.q('[data-order]').value='МФ-2026-126';await h.q('[data-order]').onchange();
  assert.equal(h.state.scene.albumSettings.order_number,'МФ-2026-126');
  assert.equal(h.paid,0);assert.equal(h.exports.length,2);
  assert.equal(h.exports[1].hero_data_url,photo);
  assert.equal(h.exports[1].version,h.state.version);
});
test('A missing order number blocks payment and PDF until it has been saved',async()=>{
  const h=harness();h.state.scene.albumSettings.order_number='';await h.open();
  h.q('[data-consent]').checked=true;h.q('[data-consent]').onchange();
  assert.equal(h.q('[data-create]').disabled,true);await h.q('[data-create]').onclick();assert.equal(h.paid,0);
  h.q('[data-order]').value='МФ-127';await h.q('[data-order]').onchange();
  assert.equal(h.q('[data-create]').disabled,false);await h.q('[data-create]').onclick();
  assert.equal(h.paid,1);assert.equal(h.exports.length,1);
});
