import {roomById} from './render-rooms/catalogue.mjs';

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
// Old projects carry explicit floor/light choices. A new project follows its palette
// until the manager chooses a specific surface or light.
export function finishSettings(display={}){
  const settings=roomSettings(display),scheme=roomById(display.renderRoomId);
  return {...settings,renderRoomId:scheme?.n??null,wallFinishes:display.wallFinishes||{},
    floorMaterial:scheme&&display.usePaletteFloor?scheme.floor:settings.floorMaterial,
    lightingPreset:scheme&&display.usePaletteLight?scheme.lighting:settings.lightingPreset};
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
  daylight:{key:'#fffaf4',fill:'#f0f4fb',sky:'#fffdfa',ground:'#c5bfb7',sun:2.35,fillPower:.67,hemi:.79,exposure:1.02,environment:.75},
  warm:{key:'#fff2e2',fill:'#faf8f4',sky:'#fffaf3',ground:'#c6bcac',sun:2.35,fillPower:.53,hemi:.63,exposure:1.04,environment:.72},
  neutral:{key:'#fffdf9',fill:'#ffffff',sky:'#ffffff',ground:'#c6c5c2',sun:2.45,fillPower:.59,hemi:.65,exposure:1.04,environment:.73}
});
