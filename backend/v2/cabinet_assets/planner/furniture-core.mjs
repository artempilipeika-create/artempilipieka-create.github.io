import './furniture-core.js';
export const {FACADE_GAP_MM,MM_TO_WORLD,heights,dimensionPatch,facadeCells,legacyFrontSpec,elevation,tier,rotateXZ,bounds,overlaps,placementError}=globalThis.MF_FURNITURE_CORE;
export const clone=value=>JSON.parse(JSON.stringify(value));
export const roundMm=value=>Math.round(value);
