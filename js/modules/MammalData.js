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
 * Get order-level weight for balanced sampling.
 * Uses log scaling to soften the dominance of very large orders while
 * still allowing them more representation than very small orders.
 * 
 * @param {number} orderSize - Number of species in the order
 * @returns {number}
 */
function getOrderWeight(orderSize) {
    if (!Number.isFinite(orderSize) || orderSize <= 0) return 1;
    // Use log scaling: large orders still get more picks, but the advantage is dampened
    // log(607) ≈ 6.4, log(3) ≈ 1.1, so Rodentia gets ~6x weight vs tiny orders, not 200x
    return Math.log(orderSize + 1);
}

/**
 * Stratified sample from mammal list for balanced order/family representation.
 * This uses a two-level stratified approach:
 * 1. Allocate slots across orders using log-scaled weights (large orders get more, but dampened)
 * 2. Within each order, round-robin through families to ensure family diversity
 * 3. Within families, random selection
 * 
 * @param {Object[]} mammalList - List of mammals to sample from
 * @param {number} count - Number of samples
 * @returns {Object[]}
 */
export function weightedSample(mammalList, count) {
    const pool = mammalList.filter(Boolean);
    const targetCount = Math.min(count, pool.length);
    
    if (targetCount <= 0) return [];

    // Group mammals by order
    const byOrder = new Map();
    pool.forEach(m => {
        const order = m.order || 'Unknown';
        if (!byOrder.has(order)) {
            byOrder.set(order, []);
        }
        byOrder.get(order).push(m);
    });

    // Calculate order weights based on original pool size
    const orderWeights = new Map();
    byOrder.forEach((mammals, order) => {
        orderWeights.set(order, getOrderWeight(mammals.length));
    });

    // Build working pools: for each order, group by family for round-robin selection
    const orderPools = new Map();
    byOrder.forEach((mammals, order) => {
        // Group by family within order
        const byFamily = new Map();
        mammals.forEach(m => {
            const family = m.family || 'Unknown';
            if (!byFamily.has(family)) {
                byFamily.set(family, []);
            }
            byFamily.get(family).push(m);
        });
        
        // Shuffle each family's species list
        byFamily.forEach((species, family) => {
            shuffleArray(species);
        });
        
        orderPools.set(order, {
            families: byFamily,
            familyKeys: shuffleArray([...byFamily.keys()]),
            currentFamilyIndex: 0,
            totalRemaining: mammals.length
        });
    });

    const selections = [];
    const selectedIds = new Set();

    while (selections.length < targetCount) {
        // Calculate total weight of orders that still have mammals
        let totalWeight = 0;
        const activeOrders = [];
        
        orderPools.forEach((orderData, order) => {
            if (orderData.totalRemaining > 0) {
                const weight = orderWeights.get(order) || 1;
                totalWeight += weight;
                activeOrders.push({ order, weight, data: orderData });
            }
        });

        if (activeOrders.length === 0) break;

        // Weighted random selection of order
        let threshold = Math.random() * totalWeight;
        let selectedOrder = activeOrders[activeOrders.length - 1];
        
        for (const item of activeOrders) {
            threshold -= item.weight;
            if (threshold <= 0) {
                selectedOrder = item;
                break;
            }
        }

        const orderData = selectedOrder.data;
        
        // Round-robin through families in this order
        let mammal = null;
        let attempts = 0;
        const maxAttempts = orderData.familyKeys.length;
        
        while (!mammal && attempts < maxAttempts) {
            const familyKey = orderData.familyKeys[orderData.currentFamilyIndex];
            const familyPool = orderData.families.get(familyKey);
            
            // Move to next family for next time (round-robin)
            orderData.currentFamilyIndex = (orderData.currentFamilyIndex + 1) % orderData.familyKeys.length;
            
            if (familyPool && familyPool.length > 0) {
                mammal = familyPool.pop();
                orderData.totalRemaining--;
                
                // Remove family if exhausted
                if (familyPool.length === 0) {
                    orderData.families.delete(familyKey);
                    orderData.familyKeys = orderData.familyKeys.filter(k => k !== familyKey);
                    if (orderData.familyKeys.length > 0) {
                        orderData.currentFamilyIndex = orderData.currentFamilyIndex % orderData.familyKeys.length;
                    }
                }
            }
            
            attempts++;
        }

        if (mammal && !selectedIds.has(mammal.id)) {
            selections.push(mammal);
            selectedIds.add(mammal.id);
        }
    }

    return selections;
}

/**
 * Fisher-Yates shuffle (in-place)
 * @param {Array} array
 * @returns {Array} - The same array, shuffled
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Calculate family weight for weighted selection (legacy/backup)
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
