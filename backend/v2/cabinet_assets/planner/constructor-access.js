/* Presentation follows the authenticated account; it never grants API access. */
'use strict';
(function(){
  const canUseProductionTools=account=>Boolean(account?.account_status==='active'&&
    account?.capabilities?.draft_create&&account.roles?.length===1&&
    ['admin','manager'].includes(account.roles[0]));
  const canUseAssistant=account=>Boolean(account?.account_status==='active'&&
    account?.email_verified&&account?.capabilities?.draft_create);
  const apply=account=>{
    const enabled=canUseProductionTools(account);
    document.body.dataset.constructorAudience=enabled?'staff':'client';
    for(const node of document.querySelectorAll('[data-production-only]'))node.hidden=!enabled;
    return enabled;
  };
  globalThis.MF_CONSTRUCTOR_ACCESS=Object.freeze({canUseProductionTools,canUseAssistant,apply});
})();
