import test from 'node:test';
import assert from 'node:assert/strict';
import '../../backend/v2/cabinet_assets/planner/constructor-access.js';
const can=globalThis.MF_CONSTRUCTOR_ACCESS.canUseProductionTools;
const account=(roles,patch={})=>({roles,account_status:'active',capabilities:{draft_create:true},...patch});
test('assistant is available to verified project editors including clients, independent of production tools',()=>{
  const assistant=globalThis.MF_CONSTRUCTOR_ACCESS.canUseAssistant;
  for(const role of ['client','manager','admin'])assert.equal(assistant(account([role],{email_verified:true})),true);
  assert.equal(assistant(account(['client'],{email_verified:false})),false);
  assert.equal(assistant(account(['client'],{email_verified:true,account_status:'blocked'})),false);
  assert.equal(assistant(account(['client'],{email_verified:true,capabilities:{draft_create:false}})),false);
  assert.equal(assistant(null),false);
});
test('client presentation does not expose production tools, including mixed roles',()=>{
  for(const roles of [['client'],['viewer'],['accounting'],['production'],['service_agent'],['client','admin'],[]])assert.equal(can(account(roles)),false);
  assert.equal(can(null),false);assert.equal(can({}),false);
});
test('staff tools require an active authenticated staff account and existing constructor permission',()=>{
  for(const role of ['admin','manager']){
    assert.equal(can(account([role])),true);
    assert.equal(can(account([role],{account_status:'blocked'})),false);
    assert.equal(can(account([role],{capabilities:{draft_create:false}})),false);
  }
});
