(function(root){
 'use strict';
 root.MF_WALL_SPECIAL_UI={sync(it){const box=document.getElementById('wall-special-controls'),U=root.MF_WALL_SPECIAL,v=U.info(it);if(!box)return;box.hidden=!v;if(!v)return;
 box.querySelector('h3').textContent=U.family(v).label;
 for(const group of box.querySelectorAll('[data-wall-special-group]')){const key=group.dataset.wallSpecialGroup;group.hidden=key==='opening'?v.door_count===2:key==='execution'?v.family!=='corner':v.family==='corner';}
 for(const b of box.querySelectorAll('[data-wall-special-option]')){const key=b.dataset.wallSpecialOption,value=b.dataset.wallSpecialValue,n=U.available(v,{[key]:value});b.disabled=!n;b.setAttribute('aria-pressed',String(v[key]===value));}
 box.querySelector('#wall-special-note').textContent=U.brief(it).split('Сохранены родные')[0]+' Глубина 250–600 мм.'+(v.family==='corner'&&it.width-374>600?' Фасад '+(it.width-374)+' мм; для ограничения 600 мм задайте корпус 974 мм.':'');
 }};
})(globalThis);
