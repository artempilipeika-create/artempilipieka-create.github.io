/* Project and per-module manufacturing brief. A standard niche never certifies a particular appliance. */
(function(root){
  'use strict';
  const trimmed=(value,max=2500)=>String(value||'').trim().slice(0,max);
  const typeName={oven:'Духовой шкаф',microwave:'Микроволновка'};
  function family(item){
    const core=root.MF_FURNITURE_CORE;
    const v=core&&core.tallVariantInfo&&core.tallVariantInfo(item);
    return v&&v.family==='appliance'?v:null;
  }
  function appliance(item,kind){
    const raw=(item&&item.appliance_details&&item.appliance_details[kind])||{};
    return {mode:raw.mode==='model'?'model':'standard',
      manufacturer:trimmed(raw.manufacturer,160),model:trimmed(raw.model,200),
      article:trimmed(raw.article,200),documentation_url:trimmed(raw.documentation_url,500)};
  }
  function deviceLine(item,kind){
    const d=appliance(item,kind),label=typeName[kind];
    if(d.mode==='standard')return label+': СТАНДАРТНАЯ НИША ('+(kind==='oven'?'564 × 595':'564 × 380')+' мм). Модель и монтажную схему уточнить до производства.';
    return label+': '+[d.manufacturer,d.model,d.article?'арт. '+d.article:''].filter(Boolean).join(' · ')+(d.documentation_url?'\nДокументация: '+d.documentation_url:'')+'. Проверить монтаж, вентиляцию и опоры по инструкции.';
  }
  function moduleText(item){
    const v=family(item),lines=[];
    if(v){
      lines.push('ТЕХНИКА ПЕНАЛА '+(item.name||item.item_id||''));
      lines.push(deviceLine(item,'oven'));
      if(v.microwave)lines.push(deviceLine(item,'microwave'));
      const remarks=trimmed(item.appliance_details&&item.appliance_details.remarks,1500);
      if(remarks)lines.push('Указания по технике: '+remarks);
    }
    const note=trimmed(item.production_note,2000);
    if(note)lines.push('Заметка по модулю '+(item.name||item.item_id||'')+': '+note);
    return lines.join('\n');
  }
  function projectText(scene){
    const lines=[];
    const note=trimmed(scene&&scene.production_note,2500);
    if(note)lines.push('ОБЩИЕ УКАЗАНИЯ ДИЗАЙНЕРА:\n'+note);
    for(const item of (scene&&scene.items)||[]){
      const brief=moduleText(item);
      if(brief)lines.push(brief);
    }
    return lines.join('\n\n');
  }
  function httpUrl(value){
    if(!value)return true;
    try{const u=new URL(value);return (u.protocol==='https:'||u.protocol==='http:')&&Boolean(u.hostname);}
    catch(_){return false;}
  }
  function validate(scene){
    for(const item of (scene&&scene.items)||[]){
      const v=family(item);if(!v)continue;
      for(const kind of (v.microwave?['oven','microwave']:['oven'])){
        const d=appliance(item,kind);
        if(d.mode==='model'&&!d.model&&!d.article)
          return (item.name||'Пенал')+': для '+typeName[kind].toLowerCase()+' укажите модель или артикул либо выберите стандартную нишу.';
        if(!httpUrl(d.documentation_url))
          return (item.name||'Пенал')+': ссылка на '+typeName[kind].toLowerCase()+' должна начинаться с https:// или http://.';
      }
    }
    return '';
  }
  root.MF_PRODUCTION_NOTES=Object.freeze({family,appliance,moduleText,projectText,validate});
})(globalThis);
