const definitions=[['countertop','Столешницы','countertop-card'],['wall','Скинали','wall-finish-card'],['plinth','Цоколь','plinth-card']];
export class FinishCatalogue{
 constructor(app){
  this.app=app;this.root=document.createElement('section');this.root.id='kitchen-finishes-menu';this.root.hidden=true;
  const title=document.createElement('h2');title.textContent='Отделка кухни';
  const hint=document.createElement('p');hint.className='studio-hint';hint.textContent='Столешницы, скинали и единый цоколь — всё для завершения кухни.';
  this.nav=document.createElement('div');this.nav.className='finish-menu-tabs';this.nav.setAttribute('role','tablist');this.nav.setAttribute('aria-label','Отделка кухни');
  this.root.append(title,hint,this.nav);document.getElementById('module-catalogue').before(this.root);
  for(const [key,label,id]of definitions){const b=document.createElement('button');b.type='button';b.dataset.finishTab=key;b.id='finish-tab-'+key;b.textContent=label;b.setAttribute('role','tab');b.setAttribute('aria-controls',id);this.nav.append(b);
   const card=document.getElementById(id);card.setAttribute('role','tabpanel');card.setAttribute('aria-labelledby',b.id);this.root.append(card);app.listen(b,'click',()=>this.select(key));
   app.listen(b,'keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const index=definitions.findIndex(x=>x[0]===key),next=e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowRight'?1:2))%3;this.select(definitions[next][0]);this.nav.children[next].focus();});
  }
  this.select('countertop');
 }
 select(key){for(const [value,,id]of definitions){const selected=value===key,b=this.nav.querySelector('[data-finish-tab='+value+']');b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;document.getElementById(id).hidden=!selected;}this.selected=key;}
 open(key){globalThis.MF3D_STUDIO.showPane('catalog');document.querySelector('[data-module-filter=finishes]').click();this.select(key);this.app.workspace.panel('left',true,{manual:true,focus:true});this.root.scrollIntoView({block:'start',behavior:'smooth'});}
}
