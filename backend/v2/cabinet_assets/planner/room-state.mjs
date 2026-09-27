// Project display settings only. Never import this into the production core.
export const ROOM_PRESETS=Object.freeze({
  studio:{label:'Светлая студия',wallColor:'#ecebe6',floorMaterial:'light-stone',lightingPreset:'daylight'},
  warm:{label:'Тёплый интерьер',wallColor:'#dfd6c6',floorMaterial:'oak',lightingPreset:'warm'},
  showroom:{label:'Нейтральный шоурум',wallColor:'#d4d1ca',floorMaterial:'concrete',lightingPreset:'neutral'}
});
export const FLOOR_OPTIONS=Object.freeze({'light-stone':'Светлый камень',oak:'Древесный пол',concrete:'Бетон'});
export const LIGHT_OPTIONS=Object.freeze({daylight:'Дневной',warm:'Тёплый',neutral:'Нейтральный'});
export function roomSettings(value={}){
  const environmentPreset=Object.hasOwn(ROOM_PRESETS,value.environmentPreset)?value.environmentPreset:'studio';
  const base=ROOM_PRESETS[environmentPreset];
  return {environmentPreset,wallColor:/^#[\da-f]{6}$/i.test(value.wallColor||'')?value.wallColor:base.wallColor,
    floorMaterial:Object.hasOwn(FLOOR_OPTIONS,value.floorMaterial)?value.floorMaterial:base.floorMaterial,
    lightingPreset:Object.hasOwn(LIGHT_OPTIONS,value.lightingPreset)?value.lightingPreset:base.lightingPreset};
}
export const presetSettings=name=>roomSettings({environmentPreset:name});
export const LIGHTS=Object.freeze({
  daylight:{key:'#fffaf0',fill:'#e6f0ff',sky:'#f8fbff',ground:'#bcb8af',sun:2.3,fillPower:.85,hemi:1.25,exposure:1.04,environment:.65},
  warm:{key:'#ffe3be',fill:'#f1efff',sky:'#fff2df',ground:'#b7a48e',sun:2.15,fillPower:.75,hemi:1.1,exposure:1.01,environment:.6},
  neutral:{key:'#fffdf9',fill:'#f0f4fa',sky:'#ffffff',ground:'#b1afa9',sun:2.15,fillPower:.9,hemi:1.2,exposure:1.02,environment:.62}
});
