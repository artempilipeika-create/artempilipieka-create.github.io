import './furniture-core.js';
export const {FACADE_GAP_MM,MM_TO_WORLD,PILOT_PRODUCTION,WALL_PRODUCTION,SPECIAL_BASE_PRODUCTION,PRODUCTION_MODELS,dimensionError,DRAWER_SLIDE_RULE,KITCHEN_DEFAULTS,drawerSlideLengthMm,productionShelves,productionHardware,isKitchenModule,kitchenGroup,scopeMatches,kitchenSettings,normalizeKitchen,kitchenRuns,kitchenLegs,productionParts,heights,rightAnchoredWidth,dimensionPatch,facadeCells,legacyFrontSpec,elevation,tier,rotateXZ,bounds,overlaps,placementError}=globalThis.MF_FURNITURE_CORE;
export const clone=value=>JSON.parse(JSON.stringify(value));
export const roundMm=value=>Math.round(value);
