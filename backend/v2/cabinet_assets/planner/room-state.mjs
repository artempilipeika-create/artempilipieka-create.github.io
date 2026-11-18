// Project display settings only. Never import this into the production core.
export const ROOM_PRESETS=Object.freeze({
  graphite:{label:'Графит',wallColor:'#878e90',floorMaterial:'oak',lightingPreset:'neutral'},
  'warm-oak':{label:'Тёплый дуб',wallColor:'#c9c1b1',floorMaterial:'oak',lightingPreset:'neutral'},
  classic:{label:'Светлая классика',wallColor:'#bbc1bb',floorMaterial:'oak',lightingPreset:'neutral'},
  studio:{label:'Светлая студия',wallColor:'#f0ede6',floorMaterial:'light-stone',lightingPreset:'daylight'},
  warm:{label:'Тёплый интерьер',wallColor:'#e5dccf',floorMaterial:'oak',lightingPreset:'warm'},
  showroom:{label:'Дневной шоурум',wallColor:'#d3ddd4',floorMaterial:'oak',lightingPreset:'neutral'}
});
export const FLOOR_OPTIONS=Object.freeze({oak:'Дубовый пол',marble:'Плитка под мрамор', 'light-stone':'Светлый камень',concrete:'Бетон'});
export const LIGHT_OPTIONS=Object.freeze({daylight:'Дневной',warm:'Тёплый',neutral:'Нейтральный'});
export function roomSettings(value={}){
  const environmentPreset=Object.hasOwn(ROOM_PRESETS,value.environmentPreset)?value.environmentPreset:'graphite';
  const base=ROOM_PRESETS[environmentPreset];
  return {environmentPreset,wallColor:/^#[\da-f]{6}$/i.test(value.wallColor||'')?value.wallColor:base.wallColor,
    floorMaterial:Object.hasOwn(FLOOR_OPTIONS,value.floorMaterial)?value.floorMaterial:base.floorMaterial,
    lightingPreset:Object.hasOwn(LIGHT_OPTIONS,value.lightingPreset)?value.lightingPreset:base.lightingPreset};
}
export const presetSettings=name=>roomSettings({environmentPreset:name});
export const designedInterior=name=>['graphite','warm-oak','classic'].includes(name);
export function selectInterior(current,name){
  const next=presetSettings(name),previous=roomSettings(current);
  next.floorMaterial=previous.floorMaterial;
  if(designedInterior(name))next.lightingPreset=previous.lightingPreset;
  return next;
}
export const LIGHTS=Object.freeze({
  daylight:{key:'#fffdf8',fill:'#f4f7ff',sky:'#ffffff',ground:'#cbc8c0',sun:2.55,fillPower:.65,hemi:.70,exposure:1.04,environment:.75},
  warm:{key:'#fff2e2',fill:'#faf8f4',sky:'#fffaf3',ground:'#c6bcac',sun:2.35,fillPower:.53,hemi:.63,exposure:1.04,environment:.72},
  neutral:{key:'#fffdf9',fill:'#ffffff',sky:'#ffffff',ground:'#c6c5c2',sun:2.45,fillPower:.59,hemi:.65,exposure:1.04,environment:.73}
});
