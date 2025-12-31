/**
 * PhyloCalculator.js
 * Phylogenetic Distance Calculator Module
 * 
 * Handles loading phylogenetic trees, computing distances between species,
 * and converting distances to similarity scores.
 */

import { SpeciesNormalizer } from './utils/SpeciesNormalizer.js';

export class PhylogeneticDistanceCalculator {
    constructor() {
        this.originalTree = null;
        this.activeTree = null;
        this.isLoaded = false;
        this.pendingAllowedSpecies = null;
        this.pendingTargetSpecies = null;
        this.allowedSpeciesSet = null;
        this.nodeIndex = new Map();
        this.maxPairwiseDistance = 0;
        this.minPairwiseDistance = 0;
        this.globalMaxPairwiseDistance = 0;
        this.currentTargetNode = null;
        this.targetMaxDistance = 0;
        this.targetMinPositiveDistance = 0;
        this.targetScaleFactor = 0;
        this.distanceCache = new Map();
        this.latestTreeSnapshot = null;

        // Distance transform mode: 'linear' or 'log'
        this.transformMode = 'linear';
        this.transformOptions = {};
        
        this.normalizer = new SpeciesNormalizer();
    }

    /**
     * Load a phylogenetic tree from a Newick file
     * @param {string} treePath - Path to the tree file
     * @param {string[]} allowedSpeciesList - Optional list of species to include
     */
    async loadTree(treePath, allowedSpeciesList = null) {
        try {
            console.log('Loading phylogenetic tree...');

            const response = await fetch(treePath);
            if (!response.ok) {
                throw new Error(`Failed to fetch tree file: ${response.status} ${response.statusText}`);
            }
            const newickString = await response.text();
            console.log(`Tree file loaded: ${newickString.length} characters`);

            if (typeof phylojs === 'undefined' || typeof phylojs.readNewick !== 'function') {
                throw new Error('PhyloJS library is not available.');
            }

            this.originalTree = phylojs.readNewick(newickString);
            if (!this.originalTree) {
                throw new Error('Unable to parse phylogenetic tree');
            }

            this.isLoaded = true;
            if (allowedSpeciesList && allowedSpeciesList.length > 0) {
                this.pendingAllowedSpecies = allowedSpeciesList;
            }

            this.applyAllowedSpecies();

            const indexedLeaves = this.activeTree ? this.activeTree.leafList.length : 0;
            console.log(`Phylogenetic tree ready. Indexed ${indexedLeaves} species after pruning.`);
        } catch (error) {
            console.error('Failed to load phylogenetic tree:', error);
            this.isLoaded = false;
        }
    }

    /**
     * Set the list of allowed species for the current game round
     * @param {string[]} rawNames - Species names to allow
     */
    setAllowedSpecies(rawNames) {
        this.pendingAllowedSpecies = rawNames?.length > 0 ? rawNames : null;

        if (this.isLoaded) {
            this.applyAllowedSpecies();
        }
    }

    /**
     * Configure a new game round with allowed species and target
     * @param {string[]} allowedSpeciesList - Species available for guessing
     * @param {string} targetSpecies - The target species scientific name
     */
    configureRound(allowedSpeciesList, targetSpecies) {
        this.pendingAllowedSpecies = allowedSpeciesList?.length > 0 ? allowedSpeciesList : null;
        this.pendingTargetSpecies = targetSpecies || null;

        if (this.isLoaded) {
            this.applyAllowedSpecies();
        }
    }

    /**
     * Apply the pending allowed species filter to create the active tree
     */
    applyAllowedSpecies() {
        if (!this.originalTree) return;

        const allowedSet = this.buildAllowedSet(this.pendingAllowedSpecies);
        
        const rootCopy = this.originalTree.root.copy();
        const workingTree = new phylojs.Tree(rootCopy);
        console.log(`Original tree leaves before pruning: ${workingTree.leafList.length}`);

        if (allowedSet && allowedSet.size > 0) {
            this.pruneTreeToAllowed(workingTree, allowedSet);
        }

        if (!workingTree.root || workingTree.leafList.length === 0) {
            console.warn('Phylogenetic tree empty after pruning');
            this.resetActiveTreeState(allowedSet);
            return;
        }

        workingTree.clearCaches();
        workingTree.computeNodeHeights();
        workingTree.reassignNodeIDs();

        this.activeTree = workingTree;
        this.allowedSpeciesSet = allowedSet;
        this.buildSpeciesIndex();
        this.refreshActiveTreeSnapshot();
        
        const leafCount = this.activeTree.leafList.length;
        const shouldPrecompute = allowedSet && allowedSet.size > 0 && leafCount <= 400;

        this.distanceCache.clear();
        if (shouldPrecompute) {
            this.computeDistanceStats();
            console.log(`Distance stats -> max: ${this.maxPairwiseDistance.toFixed(4)}, min: ${this.minPairwiseDistance.toFixed(4)}`);
        } else {
            this.maxPairwiseDistance = 0;
            this.minPairwiseDistance = 0;
        }

        console.log(`Phylogenetic tree ready. Indexed ${leafCount} species after pruning.`);

        if (this.pendingTargetSpecies) {
            this.applyTargetSpecies();
        } else {
            this.resetTargetState();
        }
    }

    /**
     * Reset active tree state when no species match
     */
    resetActiveTreeState(allowedSet) {
        this.activeTree = null;
        this.allowedSpeciesSet = allowedSet;
        this.nodeIndex.clear();
        this.maxPairwiseDistance = 0;
        this.minPairwiseDistance = 0;
        this.resetTargetState();
    }

    /**
     * Reset target-related state
     */
    resetTargetState() {
        this.currentTargetNode = null;
        this.targetMaxDistance = 0;
        this.targetMinPositiveDistance = 0;
        this.targetScaleFactor = 0;
    }

    /**
     * Build a Set of allowed species name variants
     */
    buildAllowedSet(rawNames) {
        if (!rawNames || rawNames.length === 0) return null;

        const allowedSet = new Set();
        rawNames.forEach(name => {
            if (!name) return;
            this.normalizer.getVariants(name).forEach(variant => allowedSet.add(variant));
        });
        return allowedSet;
    }

    /**
     * Prune tree to only include allowed species
     */
    pruneTreeToAllowed(tree, allowedSet) {
        if (!tree.root) return;

        const nodes = tree.root.applyPostOrder(node => node);
        for (const node of nodes) {
            if (!node) continue;

            if (node.isLeaf()) {
                if (!this.isSpeciesAllowed(node.label, allowedSet) && node.parent) {
                    node.parent.removeChild(node);
                }
            } else {
                node.children = node.children.filter(child => child && child.parent === node);
                if (node.children.length === 0 && node.parent) {
                    node.parent.removeChild(node);
                }
            }
        }

        // Promote single-child roots
        while (tree.root && !tree.root.isLeaf() && tree.root.children.length === 1 && 
               !this.isSpeciesAllowed(tree.root.label, allowedSet)) {
            const child = tree.root.children[0];
            child.parent = undefined;
            tree.root = child;
        }

        if (tree.root && tree.root.isLeaf() && !this.isSpeciesAllowed(tree.root.label, allowedSet)) {
            tree.root = null;
        }
    }

    /**
     * Build an index mapping species name variants to tree nodes
     */
    buildSpeciesIndex() {
        this.nodeIndex.clear();
        if (!this.activeTree) return;

        this.activeTree.leafList.forEach(node => {
            if (!node.label) return;
            const variants = this.normalizer.getVariants(node.label);
            variants.forEach(variant => {
                if (!this.nodeIndex.has(variant)) {
                    this.nodeIndex.set(variant, node);
                }
            });
        });
    }

    /**
     * Check if a species name is in the allowed set
     */
    isSpeciesAllowed(name, allowedSet) {
        if (!allowedSet || allowedSet.size === 0) return true;
        if (!name) return false;
        return this.normalizer.getVariants(name).some(variant => allowedSet.has(variant));
    }

    /**
     * Look up a tree node by species name
     */
    lookupSpecies(name) {
        if (!name) return null;

        const variants = this.normalizer.getVariants(name);
        for (const variant of variants) {
            const match = this.nodeIndex.get(variant);
            if (match) return match;
        }
        return null;
    }

    /**
     * Compute pairwise distance statistics for all species
     */
    computeDistanceStats() {
        if (!this.activeTree) {
            this.maxPairwiseDistance = 0;
            this.minPairwiseDistance = 0;
            this.distanceCache.clear();
            return;
        }

        const leaves = this.activeTree.leafList;
        if (!leaves || leaves.length < 2) {
            this.maxPairwiseDistance = 0;
            this.minPairwiseDistance = 0;
            this.distanceCache.clear();
            return;
        }

        let maxDistance = 0;
        let minPositiveDistance = Number.POSITIVE_INFINITY;

        this.distanceCache.clear();

        for (let i = 0; i < leaves.length; i++) {
            for (let j = i + 1; j < leaves.length; j++) {
                const metrics = this.getDistanceForNodes(leaves[i], leaves[j]);
                if (!metrics || !Number.isFinite(metrics.effective)) continue;

                const effective = metrics.effective;
                if (effective > maxDistance) maxDistance = effective;
                if (effective > 0 && effective < minPositiveDistance) {
                    minPositiveDistance = effective;
                }
            }
        }

        this.maxPairwiseDistance = maxDistance;
        this.minPairwiseDistance = Number.isFinite(minPositiveDistance) ? minPositiveDistance : 0;
        
        if (maxDistance > this.globalMaxPairwiseDistance) {
            this.globalMaxPairwiseDistance = maxDistance;
        }
    }

    /**
     * Compute distance between two tree nodes
     */
    computeDistanceBetweenNodes(node1, node2) {
        if (!this.activeTree || !node1 || !node2) return null;

        const mrca = this.activeTree.getMRCA([node1, node2]);
        if (!mrca) return null;

        const rawDistance = this.distanceToAncestor(node1, mrca) + this.distanceToAncestor(node2, mrca);
        const edgeCount = this.edgeCountToAncestor(node1, mrca) + this.edgeCountToAncestor(node2, mrca);
        const effectiveDistance = this.applyDistanceTransform(rawDistance);

        return {
            raw: rawDistance,
            edges: edgeCount,
            effective: effectiveDistance
        };
    }

    /**
     * Get cached distance or compute it
     */
    getDistanceForNodes(node1, node2) {
        const key = `${node1.id}|${node2.id}`;
        if (this.distanceCache.has(key)) {
            return this.distanceCache.get(key);
        }

        const metrics = this.computeDistanceBetweenNodes(node1, node2);
        if (metrics && Number.isFinite(metrics.effective)) {
            // Cache both directions
            this.distanceCache.set(key, metrics);
            this.distanceCache.set(`${node2.id}|${node1.id}`, metrics);
            
            if (metrics.effective > this.globalMaxPairwiseDistance) {
                this.globalMaxPairwiseDistance = metrics.effective;
            }
        }

        return metrics;
    }

    /**
     * Calculate branch length from node to ancestor
     */
    distanceToAncestor(node, ancestor) {
        let distance = 0;
        let cursor = node;

        while (cursor && cursor !== ancestor) {
            distance += cursor.branchLength ?? 0;
            cursor = cursor.parent;
        }

        return distance;
    }

    /**
     * Count edges from node to ancestor
     */
    edgeCountToAncestor(node, ancestor) {
        let edges = 0;
        let cursor = node;

        while (cursor && cursor !== ancestor) {
            edges += 1;
            cursor = cursor.parent;
        }

        return edges;
    }

    /**
     * Apply the configured transform to a raw distance
     */
    applyDistanceTransform(rawDistance) {
        if (!Number.isFinite(rawDistance) || rawDistance <= 0) {
            return rawDistance;
        }

        const mode = this.transformMode || 'linear';
        const min = Number.isFinite(this.minPairwiseDistance) ? this.minPairwiseDistance : 0;
        const max = (Number.isFinite(this.globalMaxPairwiseDistance) && this.globalMaxPairwiseDistance > 0)
            ? this.globalMaxPairwiseDistance
            : this.maxPairwiseDistance;

        if (!Number.isFinite(max) || max <= Math.max(0, min)) {
            return rawDistance;
        }

        const denomLinear = Math.max(1e-12, max - min);
        const normLinear = Math.max(0, Math.min(1, (rawDistance - min) / denomLinear));

        if (mode === 'linear') {
            return min + normLinear * (max - min);
        }

        if (mode === 'log') {
            const amin = Math.log1p(Math.max(0, min));
            const amax = Math.log1p(Math.max(0, max));
            const a = Math.log1p(Math.max(0, rawDistance));
            const denomLog = Math.max(1e-12, amax - amin);
            const normLog = Math.max(0, Math.min(1, (a - amin) / denomLog));

            const strength = typeof this.transformOptions.strength === 'number'
                ? Math.max(0, Math.min(1, this.transformOptions.strength))
                : 0.6;

            const norm = (1 - strength) * normLinear + strength * normLog;
            return min + norm * (max - min);
        }

        return rawDistance;
    }

    /**
     * Set the distance transform mode
     */
    setTransformMode(mode) {
        if (!mode) return;
        const m = String(mode).toLowerCase();
        
        if (m === 'linear' || m === 'log') {
            this.transformMode = m;
            if (m === 'log' && typeof this.transformOptions.strength !== 'number') {
                this.transformOptions.strength = 0.6;
            }
            console.log(`PhyloDistance transform mode set to: ${m}`);
            
            this.distanceCache.clear();
            if (this.activeTree) {
                this.computeDistanceStats();
                this.computeTargetDistanceStats();
                this.refreshActiveTreeSnapshot();
            }
        }
    }

    /**
     * Set the transform strength for log mode
     */
    setTransformStrength(value) {
        const v = Number(value);
        if (!Number.isFinite(v)) return;
        
        this.transformOptions.strength = Math.max(0, Math.min(1, v));
        
        this.distanceCache.clear();
        if (this.activeTree) {
            this.computeDistanceStats();
            this.computeTargetDistanceStats();
            this.refreshActiveTreeSnapshot();
        }
    }

    /**
     * Create a snapshot of the active tree for visualization
     */
    refreshActiveTreeSnapshot() {
        if (!this.activeTree || !this.activeTree.root) {
            this.latestTreeSnapshot = null;
            return;
        }
        this.latestTreeSnapshot = this.cloneNodeForSnapshot(this.activeTree.root, true);
    }

    /**
     * Clone a node for snapshot
     */
    cloneNodeForSnapshot(node, isRoot = false) {
        if (!node) return null;

        const branchLength = isRoot ? 0 : (node.branchLength ?? 0);
        const clonedChildren = Array.isArray(node.children)
            ? node.children.map(child => this.cloneNodeForSnapshot(child, false)).filter(Boolean)
            : [];

        return {
            label: node.label || '',
            branchLength,
            children: clonedChildren
        };
    }

    /**
     * Get a copy of the active tree snapshot
     */
    getActiveTreeSnapshot() {
        if (!this.latestTreeSnapshot) return null;

        const clone = node => ({
            label: node.label,
            branchLength: node.branchLength,
            children: (node.children || []).map(child => clone(child))
        });

        return clone(this.latestTreeSnapshot);
    }

    /**
     * Get phylogenetic distance between two species by name
     */
    getPhylogeneticDistance(species1, species2) {
        if (!this.isLoaded || !this.activeTree) {
            console.warn('Phylogenetic tree not ready');
            return null;
        }

        const node1 = this.lookupSpecies(species1);
        const node2 = this.lookupSpecies(species2);

        if (!node1 || !node2) {
            console.warn(`Species not found in tree: ${species1} or ${species2}`);
            return null;
        }

        if (node1 === node2) {
            return { raw: 0, edges: 0, effective: 0 };
        }

        return this.getDistanceForNodes(node1, node2);
    }

    /**
     * Convert a phylogenetic distance to a similarity score (0-100)
     */
    distanceToScore(distance) {
        if (distance === null || distance === undefined) return null;
        if (distance <= 0) return 100;

        const perTargetMax = (this.currentTargetNode && Number.isFinite(this.targetMaxDistance) && this.targetMaxDistance > 0)
            ? this.targetMaxDistance
            : null;
        const baselineMax = Number.isFinite(this.globalMaxPairwiseDistance) && this.globalMaxPairwiseDistance > 0
            ? this.globalMaxPairwiseDistance
            : this.maxPairwiseDistance;
        const maxDistance = perTargetMax || baselineMax;

        if (!Number.isFinite(maxDistance) || maxDistance <= 0) {
            const fallbackScore = Math.max(5, Math.round(100 / (1 + distance)));
            return Math.min(95, fallbackScore);
        }

        const perTargetMin = (this.currentTargetNode && Number.isFinite(this.targetMinPositiveDistance) && this.targetMinPositiveDistance > 0)
            ? this.targetMinPositiveDistance
            : 0;

        const clampedDistance = Math.min(distance, maxDistance);
        const normalized = Math.max(0, Math.min(1, (clampedDistance - perTargetMin) / Math.max(1e-9, maxDistance - perTargetMin)));

        // Ease-out curve for better score distribution
        const eased = 1 - Math.pow(normalized, 0.65);
        const score = Math.round(1 + eased * 98);
        return Math.max(1, Math.min(100, score));
    }

    /**
     * Set the target species for scoring
     */
    setTargetSpecies(scientificName) {
        this.pendingTargetSpecies = scientificName || null;

        if (this.isLoaded && this.activeTree && this.pendingTargetSpecies) {
            this.applyTargetSpecies();
        }
    }

    /**
     * Apply the target species, rerooting the tree
     */
    applyTargetSpecies() {
        if (!this.activeTree || !this.pendingTargetSpecies) return;

        const targetNode = this.lookupSpecies(this.pendingTargetSpecies);
        if (!targetNode) {
            console.warn('Target species not found:', this.pendingTargetSpecies);
            this.resetTargetState();
            return;
        }

        if (typeof this.activeTree.reroot === 'function') {
            try {
                this.activeTree.reroot(targetNode);
            } catch (error) {
                console.warn('Failed to reroot tree:', error);
            }
        }

        this.activeTree.clearCaches();
        this.activeTree.computeNodeHeights();
        this.activeTree.reassignNodeIDs();
        this.buildSpeciesIndex();
        this.distanceCache.clear();

        const refreshedTarget = this.lookupSpecies(this.pendingTargetSpecies);
        if (!refreshedTarget) {
            this.resetTargetState();
            return;
        }

        this.currentTargetNode = refreshedTarget;
        this.computeDistanceStats();
        this.computeTargetDistanceStats();
        this.refreshActiveTreeSnapshot();
    }

    /**
     * Compute distance statistics from the target to all other species
     */
    computeTargetDistanceStats() {
        if (!this.activeTree || !this.currentTargetNode) {
            this.targetMaxDistance = 0;
            this.targetMinPositiveDistance = 0;
            this.targetScaleFactor = 0;
            return;
        }

        const leaves = this.activeTree.leafList;
        if (!leaves || leaves.length < 2) {
            this.targetMaxDistance = 0;
            this.targetMinPositiveDistance = 0;
            this.targetScaleFactor = 0;
            return;
        }

        let maxDistance = 0;
        let minPositiveDistance = Number.POSITIVE_INFINITY;

        for (const leaf of leaves) {
            if (leaf === this.currentTargetNode) continue;

            const metrics = this.getDistanceForNodes(this.currentTargetNode, leaf);
            if (!metrics || !Number.isFinite(metrics.effective)) continue;

            const effective = metrics.effective;
            if (effective > maxDistance) maxDistance = effective;
            if (effective > 0 && effective < minPositiveDistance) {
                minPositiveDistance = effective;
            }
        }

        this.targetMaxDistance = maxDistance;
        this.targetMinPositiveDistance = Number.isFinite(minPositiveDistance) ? minPositiveDistance : 0;
        
        const denom = Math.max(1e-6, maxDistance - this.targetMinPositiveDistance);
        this.targetScaleFactor = maxDistance > this.targetMinPositiveDistance 
            ? Math.log(99) / denom 
            : 0;
            
        console.log(`Target distance stats -> max: ${maxDistance.toFixed(4)}, min: ${this.targetMinPositiveDistance.toFixed(4)}`);
    }
}
