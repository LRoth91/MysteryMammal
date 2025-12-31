/**
 * Mammal Mystery Game - Module Index
 * 
 * This file exports all modules for easy importing.
 */

export { PhylogeneticDistanceCalculator } from './PhyloCalculator.js';
export { 
    loadMammalData, 
    clearMammalCache,
    getPrimaryImageUrl, 
    getAllImageUrls,
    MammalLookup,
    getFamilyWeight,
    weightedSample,
    calculateTaxonomicScore 
} from './MammalData.js';
export { UIRenderer } from './UIRenderer.js';
export { ChartRenderer } from './ChartRenderer.js';
export { MammalMysteryGame } from './MammalMysteryGame.js';
export { SpeciesNormalizer } from './utils/SpeciesNormalizer.js';
