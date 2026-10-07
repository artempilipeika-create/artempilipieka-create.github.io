import './corner-variants.js';
import './furniture-core.js';
export const {CORNER_FAMILY,CORNER_VARIANTS,cornerVariantInfo,cornerVariant}=globalThis.MF_FURNITURE_CORE;
export const {DOOR_FAMILIES,doorFamilyById,doorFamily,doorVariant}=globalThis.MF_FURNITURE_CORE;
export const {FACADE_GAP_MM,MM_TO_WORLD,PILOT_PRODUCTION,WALL_PRODUCTION,SPECIAL_BASE_PRODUCTION,CORNER_PRODUCTION,PRODUCTION_MODELS,cornerSpec,cornerReturnPlacement,dimensionError,DRAWER_SLIDE_RULE,KITCHEN_DEFAULTS,drawerSlideLengthMm,productionShelves,productionHardware,isKitchenModule,kitchenGroup,scopeMatches,kitchenSettings,normalizeKitchen,kitchenRuns,kitchenLegs,productionParts,heights,rightAnchoredWidth,dimensionPatch,facadeCells,legacyFrontSpec,elevation,tier,rotateXZ,bounds,overlaps,placementError}=globalThis.MF_FURNITURE_CORE;
export const clone=value=>JSON.parse(JSON.stringify(value));
export const roundMm=value=>Math.round(value);
