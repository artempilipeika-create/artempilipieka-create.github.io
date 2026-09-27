// Project display settings only. Never import this into the production core.
export const ROOM_PRESETS=Object.freeze({
  studio:{label:'Светлая студия',wallColor:'#f0ede6',floorMaterial:'light-stone',lightingPreset:'daylight'},
  warm:{label:'Тёплый интерьер',wallColor:'#e5dccf',floorMaterial:'oak',lightingPreset:'warm'},
  showroom:{label:'Нейтральный шоурум',wallColor:'#eeeae2',floorMaterial:'concrete',lightingPreset:'neutral'}
});
export const FLOOR_OPTIONS=Object.freeze({'light-stone':'Светлый камень',oak:'Древесный пол',concrete:'Бетон'});
export const LIGHT_OPTIONS=Object.freeze({daylight:'Дневной',warm:'Тёплый',neutral:'Нейтральный'});
export function roomSettings(value={}){
  const environmentPreset=Object.hasOwn(ROOM_PRESETS,value.environmentPreset)?value.environmentPreset:'showroom';
  const base=ROOM_PRESETS[environmentPreset];
  return {environmentPreset,wallColor:/^#[\da-f]{6}$/i.test(value.wallColor||'')?value.wallColor:base.wallColor,
    floorMaterial:Object.hasOwn(FLOOR_OPTIONS,value.floorMaterial)?value.floorMaterial:base.floorMaterial,
    lightingPreset:Object.hasOwn(LIGHT_OPTIONS,value.lightingPreset)?value.lightingPreset:base.lightingPreset};
}
export const presetSettings=name=>roomSettings({environmentPreset:name});
export const LIGHTS=Object.freeze({
  daylight:{key:'#fffdf8',fill:'#f4f7ff',sky:'#ffffff',ground:'#cbc8c0',sun:1.8,fillPower:.65,hemi:.85,exposure:1,environment:.7},
  warm:{key:'#fff2e2',fill:'#faf8f4',sky:'#fffaf3',ground:'#c6bcac',sun:1.75,fillPower:.65,hemi:.85,exposure:1,environment:.7},
  neutral:{key:'#fffdf9',fill:'#ffffff',sky:'#ffffff',ground:'#c6c5c2',sun:1.95,fillPower:.5,hemi:.8,exposure:1,environment:.65}
});
