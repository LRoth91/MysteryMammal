/**
 * MammalData.js
 * Module for loading and managing mammal data
 */

import { SpeciesNormalizer } from './utils/SpeciesNormalizer.js';

// Cache for loaded mammal data
let mammalDataCache = null;

/**
 * Load mammal data from JSON file
 * @param {string} dataPath - Path to the mammal data JSON file
 * @returns {Promise<Object[]>}
 */
export async function loadMammalData(dataPath = './mammal_data.json') {
    if (mammalDataCache) {
        return mammalDataCache;
    }

    try {
        const response = await fetch(dataPath);
        if (!response.ok) {
            throw new Error(`Failed to load mammal data: ${response.status} ${response.statusText}`);
        }
        mammalDataCache = await response.json();
        return mammalDataCache;
    } catch (error) {
        console.error('Unable to load mammal data:', error);
        throw error;
    }
}

/**
 * Clear the mammal data cache
 */
export function clearMammalCache() {
    mammalDataCache = null;
}

/**
 * Get the primary image URL for a mammal
 * @param {Object} mammal - Mammal object
 * @returns {string|null}
 */
export function getPrimaryImageUrl(mammal) {
    if (!mammal || !Array.isArray(mammal.img_urls)) {
        return null;
    }
    return mammal.img_urls.length > 0 ? mammal.img_urls[0] : null;
}

/**
 * Get all image URLs for a mammal
 * @param {Object} mammal - Mammal object
 * @returns {string[]}
 */
export function getAllImageUrls(mammal) {
    if (!mammal || !Array.isArray(mammal.img_urls)) {
        return [];
    }
    return mammal.img_urls;
}

/**
 * MammalLookup class for fast species lookup
 */
export class MammalLookup {
    constructor() {
        this.mammals = [];
        this.byLabel = new Map();
        this.byId = new Map();
        this.normalizer = new SpeciesNormalizer();
    }

    /**
     * Initialize with mammal data
     * @param {Object[]} mammals - Array of mammal objects
     */
    initialize(mammals) {
        this.mammals = mammals;
        this.byLabel.clear();
        this.byId.clear();

        mammals.forEach(mammal => {
            if (!mammal) return;
            
            // Index by ID
            if (mammal.id) {
                this.byId.set(mammal.id, mammal);
            }

            // Index by name variants
            if (mammal.scientific_name) {
                const normalized = mammal.scientific_name.trim().toLowerCase();
                const underscored = normalized.replace(/\s+/g, '_');
                
                this.byLabel.set(normalized, mammal);
                this.byLabel.set(underscored, mammal);
                
                const canonical = this.normalizer.getCanonical(underscored);
                if (canonical) {
                    this.byLabel.set(canonical.toLowerCase(), mammal);
                }
            }
        });
    }

    /**
     * Find a mammal by tree label
     * @param {string} label - Tree node label
     * @returns {Object|null}
     */
    getByTreeLabel(label) {
        if (!label) return null;
        
        const normalized = this.normalizer.normalizeTreeLabel(label);
        const canonical = this.normalizer.getCanonical(label);
        
        return this.byLabel.get(normalized)
            || this.byLabel.get(normalized?.replace(/_/g, ' '))
            || (canonical ? this.byLabel.get(canonical.toLowerCase()) : null);
    }

    /**
     * Find a mammal by ID
     * @param {*} id - Mammal ID
     * @returns {Object|null}
     */
    getById(id) {
        return this.byId.get(id) || null;
    }

    /**
     * Get all mammals
     * @returns {Object[]}
     */
    getAll() {
        return this.mammals;
    }

    /**
     * Get all scientific names
     * @returns {string[]}
     */
    getAllScientificNames() {
        return this.mammals
            .map(m => m.scientific_name)
            .filter(Boolean);
    }

    /**
     * Get mammals grouped by order
     * @returns {Object}
     */
    getGroupedByOrder() {
        return this.mammals.reduce((groups, mammal) => {
            const order = mammal.order || 'Unknown';
            if (!groups[order]) groups[order] = [];
            groups[order].push(mammal);
            return groups;
        }, {});
    }

    /**
     * Get unique orders
     * @returns {string[]}
     */
    getUniqueOrders() {
        const orders = new Set();
        this.mammals.forEach(m => {
            if (m.order) orders.add(m.order);
        });
        return Array.from(orders).sort();
    }

    /**
     * Get unique families, optionally filtered by order
     * @param {string} order - Optional order filter
     * @returns {string[]}
     */
    getUniqueFamilies(order = null) {
        const families = new Set();
        this.mammals.forEach(m => {
            if (m.family && (!order || m.order === order)) {
                families.add(m.family);
            }
        });
        return Array.from(families).sort();
    }
}

/**
 * Calculate family weight for weighted selection
 * (Smaller families get higher weight)
 * @param {Object} mammal - Mammal object
 * @returns {number}
 */
export function getFamilyWeight(mammal) {
    if (!mammal || !mammal.family) return 1;
    
    const familySize = Number(mammal.family_member_count);
    if (!Number.isFinite(familySize) || familySize <= 0) {
        return 1;
    }

    // Apply exponent to down-weight very large families
    const biasPower = 1.35;
    const adjusted = Math.pow(familySize, biasPower);
    return adjusted > 0 ? 1 / adjusted : 1;
}

/**
 * Weighted random sample from mammal list
 * @param {Object[]} mammalList - List of mammals to sample from
 * @param {number} count - Number of samples
 * @returns {Object[]}
 */
export function weightedSample(mammalList, count) {
    const pool = mammalList.filter(Boolean);
    const weights = pool.map(m => getFamilyWeight(m));
    const selections = [];
    const targetCount = Math.min(count, pool.length);

    while (selections.length < targetCount && pool.length > 0) {
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        
        if (totalWeight <= 0) {
            selections.push(pool.shift());
            weights.shift();
            continue;
        }

        let threshold = Math.random() * totalWeight;
        let index = 0;
        
        while (index < weights.length && threshold > weights[index]) {
            threshold -= weights[index];
            index++;
        }

        if (index >= pool.length) {
            index = pool.length - 1;
        }

        selections.push(pool.splice(index, 1)[0]);
        weights.splice(index, 1);
    }

    return selections;
}

/**
 * Calculate taxonomic similarity score between two mammals
 * @param {Object} mammal1 
 * @param {Object} mammal2 
 * @returns {number}
 */
export function calculateTaxonomicScore(mammal1, mammal2) {
    let score = 10; // baseline for very distant relation

    if (mammal1.order && mammal2.order && mammal1.order === mammal2.order) {
        score += 35;

        if (mammal1.family && mammal2.family && mammal1.family === mammal2.family) {
            score += 25;

            const genus1 = mammal1.genus || mammal1.scientific_name?.split(' ')[0];
            const genus2 = mammal2.genus || mammal2.scientific_name?.split(' ')[0];

            if (genus1 && genus2 && genus1 === genus2) {
                score += 20;
            }
        }
    }

    // Add small random jitter
    score += (Math.random() * 10) - 5;

    return Math.max(5, Math.min(95, Math.round(score)));
}
