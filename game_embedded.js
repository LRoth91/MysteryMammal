// Mammal Mystery Game - Modern JavaScript Implementation with Embedded Data

const PHYLO_TREE_FILE = './FBD-tree.tre';

// Phylogenetic Distance Calculator
class PhylogeneticDistanceCalculator {
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

        // Distance transform mode controls how raw distances are turned into "effective" distances
        // Supported modes: 'linear' (default), 'log' (logarithmic compression that preserves min/max range)
        this.transformMode = 'linear';
        this.transformOptions = {};
    }

    getCanonicalSpeciesLabel(name) {
        if (!name) {
            return null;
        }
        let cleaned = name.trim();
        if (!cleaned) {
            return null;
        }
        cleaned = cleaned.replace(/^_+/, '').replace(/['"]/g, '');
        const parts = cleaned.split('_').filter(Boolean);
        if (parts.length >= 2) {
            return `${parts[0]}_${parts[1]}`;
        }
        return cleaned;
    }

    async loadTree(allowedSpeciesList = null) {
        try {
            console.log('Loading phylogenetic tree...');

            const response = await fetch(PHYLO_TREE_FILE);
            if (!response.ok) {
                throw new Error(`Failed to fetch tree file: ${response.status} ${response.statusText}`);
            }
            const newickString = await response.text();
            console.log(`Tree file loaded: ${newickString.length} characters`);

            if (typeof phylojs === 'undefined' || typeof phylojs.readNewick !== 'function') {
                throw new Error('PhyloJS library is not available. Ensure phylojs is loaded before game_embedded.js.');
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

    setAllowedSpecies(rawNames) {
        if (rawNames && rawNames.length > 0) {
            this.pendingAllowedSpecies = rawNames;
        } else {
            this.pendingAllowedSpecies = null;
        }

        if (this.isLoaded) {
            this.applyAllowedSpecies();
        }
    }

    configureRound(allowedSpeciesList, targetSpecies) {
        this.pendingAllowedSpecies = allowedSpeciesList && allowedSpeciesList.length > 0
            ? allowedSpeciesList
            : null;
        this.pendingTargetSpecies = targetSpecies || null;

        if (this.isLoaded) {
            this.applyAllowedSpecies();
        }
    }

    applyAllowedSpecies() {
        if (!this.originalTree) {
            return;
        }

        const allowedSet = this.buildAllowedSet(this.pendingAllowedSpecies);
        if (allowedSet) {
            console.log(`Allowed species variants recorded: ${allowedSet.size}`);
        } else {
            console.log('Allowed species set not provided (null)');
        }
        const rootCopy = this.originalTree.root.copy();
        const workingTree = new phylojs.Tree(rootCopy);
        console.log(`Original tree leaves before pruning: ${workingTree.leafList.length}`);

        if (allowedSet && allowedSet.size > 0) {
            this.pruneTreeToAllowed(workingTree, allowedSet);
        }

        if (!workingTree.root || workingTree.leafList.length === 0) {
            console.warn('Phylogenetic tree does not contain any allowed species after pruning');
            this.activeTree = null;
            this.allowedSpeciesSet = allowedSet;
            this.nodeIndex.clear();
            this.maxPairwiseDistance = 0;
            this.minPairwiseDistance = 0;
            this.currentTargetNode = null;
            this.targetMaxDistance = 0;
            this.targetMinPositiveDistance = 0;
            this.targetScaleFactor = 0;
            return;
        }

        workingTree.clearCaches();
        workingTree.computeNodeHeights();
        workingTree.reassignNodeIDs();

        this.activeTree = workingTree;
        this.allowedSpeciesSet = allowedSet;
        this.buildSpeciesIndex();
    this.refreshActiveTreeSnapshot();
        const leafCount = this.activeTree ? this.activeTree.leafList.length : 0;
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
        console.log(`Distance transform mode: ${this.transformMode}`);

        if (this.pendingTargetSpecies) {
            this.applyTargetSpecies();
        } else {
            this.currentTargetNode = null;
            this.targetMaxDistance = 0;
            this.targetMinPositiveDistance = 0;
            this.targetScaleFactor = 0;
        }
    }

    buildAllowedSet(rawNames) {
        if (!rawNames || rawNames.length === 0) {
            return null;
        }

        const allowedSet = new Set();
        rawNames.forEach(name => {
            if (!name) return;
            this.normalizeSpeciesVariants(name).forEach(variant => allowedSet.add(variant));
        });
        return allowedSet;
    }

    pruneTreeToAllowed(tree, allowedSet) {
        if (!tree.root) return;

        const nodes = tree.root.applyPostOrder(node => node);
        for (const node of nodes) {
            if (!node) {
                continue;
            }

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

        // Promote single-child roots created by pruning to keep tree compact
        while (tree.root && !tree.root.isLeaf() && tree.root.children.length === 1 && !this.isSpeciesAllowed(tree.root.label, allowedSet)) {
            const child = tree.root.children[0];
            child.parent = undefined;
            tree.root = child;
        }

        if (tree.root && tree.root.isLeaf() && !this.isSpeciesAllowed(tree.root.label, allowedSet)) {
            tree.root = null;
        }
    }

    buildSpeciesIndex() {
        this.nodeIndex.clear();
        if (!this.activeTree) {
            return;
        }

        this.activeTree.leafList.forEach(node => {
            if (!node.label) return;
            const variants = this.normalizeSpeciesVariants(node.label);
            variants.forEach(variant => {
                if (!this.nodeIndex.has(variant)) {
                    this.nodeIndex.set(variant, node);
                }
            });
        });
    }

    normalizeSpeciesVariants(name) {
        if (!name) return [];
        const trimmed = name.trim();
        if (!trimmed) return [];

        const underscore = trimmed.replace(/\s+/g, '_');
        const spaced = trimmed.replace(/_/g, ' ');
        const variants = new Set([
            trimmed,
            trimmed.toLowerCase(),
            underscore,
            underscore.toLowerCase(),
            spaced,
            spaced.toLowerCase(),
        ]);

        const canonical = this.getCanonicalSpeciesLabel(trimmed);
        if (canonical && canonical !== trimmed) {
            const canonicalSpaced = canonical.replace(/_/g, ' ');
            variants.add(canonical);
            variants.add(canonical.toLowerCase());
            variants.add(canonicalSpaced);
            variants.add(canonicalSpaced.toLowerCase());
        }

        return Array.from(variants);
    }

    isSpeciesAllowed(name, allowedSet) {
        if (!allowedSet || allowedSet.size === 0) {
            return true;
        }

        if (!name) {
            return false;
        }

        return this.normalizeSpeciesVariants(name).some(variant => allowedSet.has(variant));
    }

    lookupSpecies(name) {
        if (!name) {
            return null;
        }

        const variants = this.normalizeSpeciesVariants(name);
        for (const variant of variants) {
            const match = this.nodeIndex.get(variant);
            if (match) {
                return match;
            }
        }
        return null;
    }

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
        let maxPairI = -1;
        let maxPairJ = -1;

        this.distanceCache.clear();

        for (let i = 0; i < leaves.length; i++) {
            const node1 = leaves[i];
            for (let j = i + 1; j < leaves.length; j++) {
                const node2 = leaves[j];
                const metrics = this.getDistanceForNodes(node1, node2);
                if (!metrics || !Number.isFinite(metrics.effective)) {
                    continue;
                }

                const effective = metrics.effective;

                if (effective > maxDistance) {
                    maxDistance = effective;
                    maxPairI = i;
                    maxPairJ = j;
                }
                if (effective > 0 && effective < minPositiveDistance) {
                    minPositiveDistance = effective;
                }
            }
        }

        if (!Number.isFinite(minPositiveDistance)) {
            minPositiveDistance = 0;
        }

        this.maxPairwiseDistance = maxDistance;
        this.minPairwiseDistance = minPositiveDistance;
        if (maxPairI >= 0 && maxPairJ >= 0) {
            try {
                const a = leaves[maxPairI] && leaves[maxPairI].label ? leaves[maxPairI].label : String(maxPairI);
                const b = leaves[maxPairJ] && leaves[maxPairJ].label ? leaves[maxPairJ].label : String(maxPairJ);
                console.log(`Distance stats max pair: ${a} ↔ ${b} = ${maxDistance.toFixed(4)}`);
            } catch (e) {
                // ignore
            }
        }
        if (maxDistance > this.globalMaxPairwiseDistance) {
            this.globalMaxPairwiseDistance = maxDistance;
        }
    }

    computeDistanceBetweenNodes(node1, node2) {
        if (!this.activeTree || !node1 || !node2) {
            return null;
        }

        const mrca = this.activeTree.getMRCA([node1, node2]);
        if (!mrca) {
            return null;
        }

        const rawDistance = this.distanceToAncestor(node1, mrca) + this.distanceToAncestor(node2, mrca);
        const edgeCount = this.edgeCountToAncestor(node1, mrca) + this.edgeCountToAncestor(node2, mrca);
        // Apply configured transform (linear by default). This allows logarithmic compression
        // that preserves the overall min/max scale while compressing larger distances.
        const effectiveDistance = this.applyDistanceTransform(rawDistance);

        return {
            raw: rawDistance,
            edges: edgeCount,
            effective: effectiveDistance
        };
    }

    buildCacheKey(node1, node2) {
        return `${node1.id}|${node2.id}`;
    }

    cacheDistance(node1, node2, metrics) {
        const keyForward = this.buildCacheKey(node1, node2);
        const keyReverse = this.buildCacheKey(node2, node1);
        this.distanceCache.set(keyForward, metrics);
        this.distanceCache.set(keyReverse, metrics);
    }

    getDistanceForNodes(node1, node2) {
        const key = this.buildCacheKey(node1, node2);
        if (this.distanceCache.has(key)) {
            return this.distanceCache.get(key);
        }

        const metrics = this.computeDistanceBetweenNodes(node1, node2);
        if (metrics && Number.isFinite(metrics.effective)) {
            this.cacheDistance(node1, node2, metrics);
            if (metrics.effective > this.globalMaxPairwiseDistance) {
                this.globalMaxPairwiseDistance = metrics.effective;
            }
        }

        return metrics;
    }

    distanceToAncestor(node, ancestor) {
        let distance = 0;
        let cursor = node;

        while (cursor && cursor !== ancestor) {
            distance += cursor.branchLength ?? 0;
            cursor = cursor.parent;
        }

        return distance;
    }

    edgeCountToAncestor(node, ancestor) {
        let edges = 0;
        let cursor = node;

        while (cursor && cursor !== ancestor) {
            edges += 1;
            cursor = cursor.parent;
        }

        return edges;
    }

    // Apply the configured transform to a raw phylogenetic distance and return an effective distance
    applyDistanceTransform(rawDistance) {
        if (!Number.isFinite(rawDistance) || rawDistance <= 0) {
            return rawDistance;
        }

        const mode = this.transformMode || 'linear';
        // Determine min/max baseline for normalization
        const min = Number.isFinite(this.minPairwiseDistance) ? this.minPairwiseDistance : 0;
        const max = (Number.isFinite(this.globalMaxPairwiseDistance) && this.globalMaxPairwiseDistance > 0)
            ? this.globalMaxPairwiseDistance
            : this.maxPairwiseDistance;

        if (!Number.isFinite(max) || max <= Math.max(0, min)) {
            return rawDistance;
        }

        // Linear normalized value in [0,1]
        const denomLinear = Math.max(1e-12, max - min);
        const normLinear = Math.max(0, Math.min(1, (rawDistance - min) / denomLinear));

        if (mode === 'linear') {
            return min + normLinear * (max - min);
        }

        if (mode === 'log') {
            // Compute log-normalized value in [0,1]
            const amin = Math.log1p(Math.max(0, min));
            const amax = Math.log1p(Math.max(0, max));
            const a = Math.log1p(Math.max(0, rawDistance));
            const denomLog = Math.max(1e-12, amax - amin);
            const normLog = Math.max(0, Math.min(1, (a - amin) / denomLog));

            // Blend linear and log norms to avoid excessive clumping at one end
            const strength = (typeof this.transformOptions.strength === 'number')
                ? Math.max(0, Math.min(1, this.transformOptions.strength))
                : 0.6; // default strength (0 = linear, 1 = pure log)

            const norm = (1 - strength) * normLinear + strength * normLog;
            return min + norm * (max - min);
        }

        // Unknown mode -> return raw
        return rawDistance;
    }

    setTransformMode(mode) {
        if (!mode) return;
        const m = String(mode).toLowerCase();
        if (m === 'linear' || m === 'log') {
            this.transformMode = m;
            // Set a conservative default strength for log mode to avoid collapse if not provided
            if (m === 'log' && typeof this.transformOptions.strength !== 'number') {
                this.transformOptions.strength = 0.6;
            }
            console.log(`PhyloDistance transform mode set to: ${m} (strength=${this.transformOptions.strength})`);
            // If the tree is already loaded, clear caches and recompute stats so the new
            // effective distances and related scaling reflect the mode change.
            try {
                this.distanceCache.clear();
                if (this.activeTree) {
                    this.computeDistanceStats();
                    this.computeTargetDistanceStats();
                    this.refreshActiveTreeSnapshot();
                }
            } catch (e) {
                // ignore errors during recompute
            }
        } else {
            console.warn(`Unknown transform mode: ${mode} - keeping '${this.transformMode}'`);
        }
    }

    getTransformMode() {
        return this.transformMode;
    }

    setTransformStrength(value) {
        const v = Number(value);
        if (!Number.isFinite(v)) {
            console.warn('Invalid transform strength:', value);
            return;
        }
        this.transformOptions.strength = Math.max(0, Math.min(1, v));
        console.log('PhyloDistance transform strength set to', this.transformOptions.strength);
        // recompute stats if tree loaded
        try {
            this.distanceCache.clear();
            if (this.activeTree) {
                this.computeDistanceStats();
                this.computeTargetDistanceStats();
                this.refreshActiveTreeSnapshot();
            }
        } catch (e) {
            // ignore
        }
    }

    // Debug helper: print a small sample of raw vs transformed distances and computed scores
    debugDistanceDistribution(options = {}) {
        if (!this.activeTree) {
            console.warn('Active tree not ready for debugDistanceDistribution');
            return;
        }

        const sample = Math.max(1, Math.min(200, Number(options.sample) || 20));
        const targetMode = !!options.target;
        const leaves = this.activeTree.leafList;
        const rows = [];

        if (targetMode && this.currentTargetNode) {
            for (const leaf of leaves) {
                if (leaf === this.currentTargetNode) continue;
                const metrics = this.getDistanceForNodes(this.currentTargetNode, leaf);
                if (!metrics) continue;
                const raw = metrics.raw;
                const effective = metrics.effective;
                // compute normalized using same logic as distanceToScore
                const perTargetMin = (this.currentTargetNode && Number.isFinite(this.targetMinPositiveDistance) && this.targetMinPositiveDistance > 0)
                    ? this.targetMinPositiveDistance
                    : 0;
                const maxDistance = Math.max( perTargetMin, this.targetMaxDistance );
                const clamped = Math.min(effective, maxDistance);
                const normalized = (maxDistance - perTargetMin) > 0 ? (clamped - perTargetMin) / (maxDistance - perTargetMin) : 0;
                const score = this.distanceToScore(effective);
                rows.push({ a: this.currentTargetNode.label || 'target', b: leaf.label || '', raw: raw, effective: effective, normalized: normalized, score: score });
                if (rows.length >= sample) break;
            }
        } else {
            // pairwise among first N leaves
            for (let i = 0; i < leaves.length && rows.length < sample; i++) {
                for (let j = i + 1; j < leaves.length && rows.length < sample; j++) {
                    const n1 = leaves[i];
                    const n2 = leaves[j];
                    const metrics = this.getDistanceForNodes(n1, n2);
                    if (!metrics) continue;
                    const raw = metrics.raw;
                    const effective = metrics.effective;
                    const perTargetMin = 0;
                    const baselineMax = Number.isFinite(this.globalMaxPairwiseDistance) && this.globalMaxPairwiseDistance > 0
                        ? this.globalMaxPairwiseDistance
                        : this.maxPairwiseDistance;
                    const maxDistance = baselineMax;
                    const clamped = Math.min(effective, maxDistance);
                    const normalized = (maxDistance - perTargetMin) > 0 ? (clamped - perTargetMin) / (maxDistance - perTargetMin) : 0;
                    const score = this.distanceToScore(effective);
                    rows.push({ a: n1.label || '', b: n2.label || '', raw: raw, effective: effective, normalized: normalized, score: score });
                }
            }
        }

        try {
            console.table(rows.slice(0, 200));
        } catch (e) {
            console.log(rows.slice(0, 200));
        }
    }

    refreshActiveTreeSnapshot() {
        if (!this.activeTree || !this.activeTree.root) {
            this.latestTreeSnapshot = null;
            return;
        }
        this.latestTreeSnapshot = this.cloneNodeForSnapshot(this.activeTree.root, true);
    }

    cloneNodeForSnapshot(node, isRoot = false) {
        if (!node) {
            return null;
        }

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

    getActiveTreeSnapshot() {
        if (!this.latestTreeSnapshot) {
            return null;
        }

        const clone = node => ({
            label: node.label,
            branchLength: node.branchLength,
            children: (node.children || []).map(child => clone(child))
        });

        return clone(this.latestTreeSnapshot);
    }

    getPhylogeneticDistance(species1, species2) {
        if (!this.isLoaded || !this.activeTree) {
            console.warn('Phylogenetic tree not ready, falling back to taxonomic similarity');
            return null;
        }

        const node1 = this.lookupSpecies(species1);
        const node2 = this.lookupSpecies(species2);

        if (!node1 || !node2) {
            console.warn(`Species not found in tree: ${species1} or ${species2}`);
            return null;
        }

        if (node1 === node2) {
            return {
                raw: 0,
                edges: 0,
                effective: 0
            };
        }

        const metrics = this.getDistanceForNodes(node1, node2);
        return metrics === null ? null : metrics;
    }

    distanceToScore(distance) {
        if (distance === null || distance === undefined) {
            return null;
        }

        if (distance <= 0) {
            return 100;
        }

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

        // Ease-out curve keeps near relatives high while pushing distant taxa toward the floor
        const eased = 1 - Math.pow(normalized, 0.65);
        const score = Math.round(1 + eased * 98);
        return Math.max(1, Math.min(100, score));
    }

    setTargetSpecies(scientificName) {
        if (scientificName) {
            this.pendingTargetSpecies = scientificName;
        } else {
            this.pendingTargetSpecies = null;
        }

        if (this.isLoaded && this.activeTree && this.pendingTargetSpecies) {
            this.applyTargetSpecies();
        }
    }

    applyTargetSpecies() {
        if (!this.activeTree || !this.pendingTargetSpecies) {
            return;
        }

        const targetNode = this.lookupSpecies(this.pendingTargetSpecies);
        if (!targetNode) {
            console.warn('Target species not found in active tree:', this.pendingTargetSpecies);
            this.currentTargetNode = null;
            this.targetMaxDistance = 0;
            this.targetMinPositiveDistance = 0;
            this.targetScaleFactor = 0;
            return;
        }

        if (typeof this.activeTree.reroot === 'function') {
            try {
                this.activeTree.reroot(targetNode);
            } catch (error) {
                console.warn('Failed to reroot tree on target species:', error);
            }
        }

        this.activeTree.clearCaches();
        this.activeTree.computeNodeHeights();
        this.activeTree.reassignNodeIDs();
        this.buildSpeciesIndex();
        this.distanceCache.clear();

        const refreshedTarget = this.lookupSpecies(this.pendingTargetSpecies);
        if (!refreshedTarget) {
            this.currentTargetNode = null;
            this.targetMaxDistance = 0;
            this.targetMinPositiveDistance = 0;
            this.targetScaleFactor = 0;
            return;
        }

        this.currentTargetNode = refreshedTarget;
        this.computeDistanceStats();
        this.computeTargetDistanceStats();
        this.refreshActiveTreeSnapshot();
    }

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
        let maxLeafLabel = null;
        const distances = [];

        for (const leaf of leaves) {
            if (leaf === this.currentTargetNode) {
                continue;
            }

            const metrics = this.getDistanceForNodes(this.currentTargetNode, leaf);
            if (!metrics || !Number.isFinite(metrics.effective)) {
                continue;
            }

            const effective = metrics.effective;
            if (Number.isFinite(effective)) {
                distances.push(effective);
            }

            if (effective > maxDistance) {
                maxDistance = effective;
                maxLeafLabel = leaf && leaf.label ? leaf.label : null;
            }
            if (effective > 0 && effective < minPositiveDistance) {
                minPositiveDistance = effective;
            }
        }

        if (!Number.isFinite(minPositiveDistance)) {
            minPositiveDistance = 0;
        }

        this.targetMaxDistance = maxDistance;
        this.targetMinPositiveDistance = minPositiveDistance;
        // (No winsorization cap - revert to original behavior)
        if (maxLeafLabel) {
            console.log(`Target distance max leaf: ${maxLeafLabel} = ${maxDistance.toFixed(4)} (target ${this.pendingTargetSpecies})`);
        }
        const denom = Math.max(1e-6, maxDistance - minPositiveDistance);
        if (maxDistance > minPositiveDistance) {
            this.targetScaleFactor = Math.log(99) / denom;
        } else {
            this.targetScaleFactor = 0;
        }
        console.log(`Target distance stats -> max: ${maxDistance.toFixed(4)}, min: ${minPositiveDistance.toFixed(4)} (${this.pendingTargetSpecies})`);
    }
}

// Mammal data is loaded dynamically from an external JSON file to keep this bundle light
let mammalDataCache = null;

async function loadMammalData() {
    if (mammalDataCache) {
        return mammalDataCache;
    }

    try {
        const response = await fetch('./mammal_data.json');
        if (!response.ok) {
            throw new Error(`Failed to load mammal data: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        mammalDataCache = data;
        return mammalDataCache;
    } catch (error) {
        console.error('Unable to load mammal data:', error);
        throw error;
    }
}

function getPrimaryImageUrl(mammal) {
    if (!mammal || !Array.isArray(mammal.img_urls)) {
        return null;
    }
    return mammal.img_urls.length > 0 ? mammal.img_urls[0] : null;
}

function getAllImageUrls(mammal) {
    if (!mammal || !Array.isArray(mammal.img_urls)) {
        return [];
    }
    return mammal.img_urls;
}


// Mammal Mystery Game - Modern JavaScript Implementation
class MammalMysteryGame {
    constructor() {
        this.mammals = [];
        this.currentTarget = null;
        this.gameOptions = [];
        this.guesses = [];
        this.maxGuesses = 10;
        this.currentGuess = 1;
        this.gameState = 'home'; // 'home', 'playing', 'finished'
        
        // Initialize phylogenetic distance calculator
        this.phyloCalculator = new PhylogeneticDistanceCalculator();
        // Try the logarithmic distance transform by default for compressed large distances / expanded small distances
        // Toggle this via `this.phyloCalculator.setTransformMode('linear')` or 'log' as needed for experimentation
        try {
            this.phyloCalculator.setTransformMode('log');
        } catch (e) {
            // ignore - setTransformMode is best-effort
        }

        // Track whether the post-result action panel has replaced the option grid
        this.postResultModeActive = false;

        // Track rendered option buttons to disable choices after guessing
        this.optionButtons = new Map();
        this.guessedIds = new Set();
        this.mammalByLabel = new Map();
        this.roundTreeSnapshot = null;
        
        this.init();
    }

    async init() {
        try {
            // Load mammal data from the external JSON file
            this.mammals = await loadMammalData();
            console.log(`Loaded ${this.mammals.length} mammals from external data file`);
            this.buildMammalLookup();

            const allSpeciesNames = this.mammals
                .map(mammal => mammal.scientific_name)
                .filter(Boolean);

            // Load phylogenetic tree in background
            this.phyloCalculator.loadTree(allSpeciesNames).then(() => {
                console.log('Phylogenetic tree loaded successfully!');
            }).catch(error => {
                console.warn('Failed to load phylogenetic tree, using taxonomic similarity fallback:', error);
            });
            
            // Initialize UI
            this.setupEventListeners();
            this.populateGallery();
            
        } catch (error) {
            console.error('Error initializing game:', error);
            this.showError('Failed to initialize game');
        }
    }

    setupEventListeners() {
        // Play again button
        const playAgainBtn = document.getElementById('playAgainBtn');
        if (playAgainBtn) {
            playAgainBtn.addEventListener('click', () => this.resetGame());
        }
        
        // Gallery search
        const gallerySearch = document.getElementById('gallery-search');
        if (gallerySearch) {
            gallerySearch.addEventListener('input', (e) => {
                this.filterGallery();
            });
        }
        
        // Gallery filters
        const orderFilter = document.getElementById('order-filter');
        const familyFilter = document.getElementById('family-filter');
        if (orderFilter) {
            orderFilter.addEventListener('change', () => {
                this.updateFamilyFilter();
                this.filterGallery();
            });
        }
        if (familyFilter) {
            familyFilter.addEventListener('change', () => this.filterGallery());
        }
        
        // Modal functionality
        window.addEventListener('click', (e) => {
            const legacyModal = document.getElementById('resultModal');
            if (legacyModal && e.target === legacyModal) {
                this.resetGame();
            }

            const enhancedModal = document.getElementById('result-modal');
            if (enhancedModal && e.target === enhancedModal) {
                hideModal('result-modal');
            }

            const treeModal = document.getElementById('round-tree-modal');
            if (treeModal && e.target === treeModal) {
                hideModal('round-tree-modal');
            }
        });

        const treeCloseButton = document.getElementById('round-tree-close');
        if (treeCloseButton) {
            treeCloseButton.addEventListener('click', () => hideModal('round-tree-modal'));
        }
        
        // Start logo card flip animation
        this.startLogoCardAnimation();
    }

    startLogoCardAnimation() {
        const injectAnimationStyles = (svgDoc) => {
            // Check if styles already injected
            if (svgDoc.getElementById('card-flip-styles')) return;
            
            const style = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'style');
            style.id = 'card-flip-styles';
            style.textContent = `
                @keyframes cardFlip {
                    0% {
                        transform: perspective(400px) rotateY(0deg);
                    }
                    50% {
                        transform: perspective(400px) rotateY(180deg);
                    }
                    100% {
                        transform: perspective(400px) rotateY(360deg);
                    }
                }
                .card-flipping {
                    animation: cardFlip 1.6s ease-in-out;
                    transform-origin: center;
                    transform-box: fill-box;
                }
                .card-front {
                    opacity: 1;
                    transition: opacity 0s;
                }
                .card-flipping .card-front {
                    animation: hideFront 1.6s ease-in-out;
                }
                .card-back {
                    opacity: 0;
                    transition: opacity 0s;
                }
                .card-flipping .card-back {
                    animation: showBack 1.6s ease-in-out;
                }
                @keyframes hideFront {
                    0%, 25% {
                        opacity: 1;
                    }
                    26%, 74% {
                        opacity: 0;
                    }
                    75%, 100% {
                        opacity: 1;
                    }
                }
                @keyframes showBack {
                    0%, 25% {
                        opacity: 0;
                    }
                    26%, 74% {
                        opacity: 1;
                    }
                    75%, 100% {
                        opacity: 0;
                    }
                }
            `;
            svgDoc.documentElement.appendChild(style);
        };
        
        const animateRandomCard = () => {
            const logoSvg = document.querySelector('.logo-svg');
            if (!logoSvg || !logoSvg.contentDocument) return;
            
            // Get all groups in the SVG with "card" in their ID
            const svgDoc = logoSvg.contentDocument;
            const allGroups = svgDoc.querySelectorAll('g[id]');
            const cardGroups = Array.from(allGroups).filter(g => 
                g.id && g.id.toLowerCase().includes('card')
            );
            
            if (cardGroups.length === 0) {
                console.log('No card groups found in SVG');
                return;
            }
            
            // Pick a random card
            const randomIndex = Math.floor(Math.random() * cardGroups.length);
            const card = cardGroups[randomIndex];
            
            console.log('Animating card:', card.id);
            
            // Apply flip animation using class
            card.classList.add('card-flipping');
            
            // Remove animation after it completes
            setTimeout(() => {
                card.classList.remove('card-flipping');
            }, 1600);
        };
        
        // Wait for SVG to load, then start animating
        const logoSvg = document.querySelector('.logo-svg');
        if (logoSvg) {
            // Handle both object and img tags
            if (logoSvg.tagName.toLowerCase() === 'img') {
                console.log('SVG is loaded as img tag - switching to object tag recommended');
                return;
            }
            
            const startAnimation = () => {
                const svgDoc = logoSvg.contentDocument;
                if (!svgDoc) return;
                
                // Inject animation styles into SVG
                injectAnimationStyles(svgDoc);
                
                console.log('SVG loaded, starting card animations');
                // Animate first card after a short delay
                setTimeout(animateRandomCard, 1500);
                
                // Then animate random cards every 2-3 seconds
                setInterval(() => {
                    animateRandomCard();
                }, 2000 + Math.random() * 1000);
            };
            
            logoSvg.addEventListener('load', startAnimation);
            
            // If already loaded, start immediately
            if (logoSvg.contentDocument) {
                startAnimation();
            }
        }
    }

    buildMammalLookup() {
        this.mammalByLabel.clear();
        this.mammals.forEach(mammal => {
            if (!mammal || !mammal.scientific_name) {
                return;
            }
            const normalized = mammal.scientific_name.trim().toLowerCase();
            const underscored = normalized.replace(/\s+/g, '_');
            this.mammalByLabel.set(normalized, mammal);
            this.mammalByLabel.set(underscored, mammal);
            const canonical = this.getCanonicalSpeciesLabel(underscored);
            if (canonical) {
                this.mammalByLabel.set(canonical.toLowerCase(), mammal);
            }
        });
    }

    normalizeTreeLabel(name) {
        if (!name) {
            return null;
        }
        return name.trim().toLowerCase().replace(/\s+/g, '_');
    }

    getCanonicalSpeciesLabel(name) {
        if (!name) {
            return null;
        }
        let cleaned = name.trim().replace(/^_+/, '');
        if (!cleaned) {
            return null;
        }
        cleaned = cleaned.replace(/['"]/g, '');
        const tokens = cleaned.split(/_+/).filter(Boolean);
        if (tokens.length >= 2) {
            return `${tokens[0]}_${tokens[1]}`;
        }
        return tokens.join('_');
    }

    getMammalForTreeLabel(label) {
        if (!label) {
            return null;
        }
        const normalized = this.normalizeTreeLabel(label);
        const canonical = this.getCanonicalSpeciesLabel(label);
        return this.mammalByLabel.get(normalized)
            || this.mammalByLabel.get(normalized.replace(/_/g, ' '))
            || (canonical ? this.mammalByLabel.get(canonical.toLowerCase()) : null);
    }

    captureRoundTreeSnapshot() {
        if (this.phyloCalculator && typeof this.phyloCalculator.getActiveTreeSnapshot === 'function') {
            const snapshot = this.phyloCalculator.getActiveTreeSnapshot();
            if (snapshot) {
                this.roundTreeSnapshot = snapshot;
            }
        }
    }

    startNewGame() {
        // Reset game state
        this.guesses = [];
        this.currentGuess = 1;
        this.gameState = 'playing';
        this.optionButtons.clear();
        this.guessedIds.clear();
        this.clearGuessDisplays();
        this.exitPostResultMode();
    this.roundTreeSnapshot = null;
        
        // Select weighted target mammal (families with fewer members get higher odds)
        this.currentTarget = this.selectWeightedTarget();
        
        // Select random options for guessing (ensure target is included)
        this.gameOptions = this.getWeightedRandomOptions(45);
        if (!this.gameOptions.find(m => m.id === this.currentTarget.id)) {
            this.gameOptions[Math.floor(Math.random() * this.gameOptions.length)] = this.currentTarget;
        }

        if (this.phyloCalculator) {
            const allowedNames = this.gameOptions
                .map(mammal => mammal.scientific_name)
                .filter(Boolean);
            this.phyloCalculator.configureRound(allowedNames, this.currentTarget.scientific_name);
            this.captureRoundTreeSnapshot();
            setTimeout(() => this.captureRoundTreeSnapshot(), 75);
        }
        
        // Update UI
        this.updateGameUI();
        this.populateOptions();
        
        console.log('New game started. Target:', this.currentTarget.common_name);
    }

    getFamilyWeight(mammal) {
        if (!mammal || !mammal.family) return 1;
        const familySize = Number(mammal.family_member_count);
        if (!Number.isFinite(familySize) || familySize <= 0) {
            return 1;
        }

        // Apply a modest exponent so very large families (e.g., bats, rodents) are further down-weighted
        const biasPower = 1.35;
        const adjusted = Math.pow(familySize, biasPower);
        return adjusted > 0 ? 1 / adjusted : 1;
    }

    weightedSample(mammalList, count) {
        const pool = mammalList.filter(Boolean);
        const weights = pool.map(m => this.getFamilyWeight(m));
        const selections = [];
        const targetCount = Math.min(count, pool.length);

        while (selections.length < targetCount && pool.length > 0) {
            const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
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

    selectWeightedTarget() {
        const [mammal] = this.weightedSample(this.mammals, 1);
        return mammal || this.mammals[Math.floor(Math.random() * this.mammals.length)];
    }

    getWeightedRandomOptions(count) {
        return this.weightedSample(this.mammals, count);
    }

    calculateSimilarity(mammal1, mammal2) {
        if (mammal1.id === mammal2.id) {
            return { distance: 0, score: 100, source: 'exact' };
        }

        if (this.phyloCalculator && this.phyloCalculator.isLoaded) {
            const species1 = mammal1.scientific_name;
            const species2 = mammal2.scientific_name;

            if (species1 && species2) {
                const metrics = this.phyloCalculator.getPhylogeneticDistance(species1, species2);
                if (metrics !== null) {
                    const distance = metrics.raw;
                    const score = this.phyloCalculator.distanceToScore(distance);
                    console.log(`Phylogenetic distance ${species1} ↔ ${species2}: raw=${metrics.raw.toFixed(4)}, edges=${metrics.edges} (score ${score})`);
                    return {
                        distance: metrics.effective,
                        rawDistance: metrics.raw,
                        edgeCount: metrics.edges,
                        score,
                        source: 'phylogenetic'
                    };
                }
            }
        }

        const score = this.calculateTaxonomicScore(mammal1, mammal2);
        return { distance: null, rawDistance: null, edgeCount: null, score, source: 'taxonomic' };
    }

    adjustDistanceWithTaxonomy(distance, mammal1, mammal2) {
        if (!Number.isFinite(distance) || distance <= 0) {
            return distance;
        }

        let scaleMultiplier = 1;

        const genus1 = this.getGenus(mammal1);
        const genus2 = this.getGenus(mammal2);
        if (genus1 && genus2 && genus1 === genus2) {
            scaleMultiplier *= 0.65;
        } else if (mammal1.family && mammal2.family && mammal1.family === mammal2.family) {
            scaleMultiplier *= 0.8;
        } else if (mammal1.order && mammal2.order && mammal1.order === mammal2.order) {
            scaleMultiplier *= 0.9;
        }

        const blendWeight = 0.3;
        const blendedScale = blendWeight + (1 - blendWeight) * scaleMultiplier;
        const scaledDistance = distance * blendedScale;

        const jitterBase = Math.min(distance * 0.08, 0.25);
        const jitter = this.getDeterministicJitter(`${mammal1.id}-${mammal2.id}`) * jitterBase;

        const minimumRetention = Math.max(distance * 0.15, 0.1);
        const adjusted = Math.max(minimumRetention, scaledDistance - jitter);
        return adjusted;
    }

    getGenus(mammal) {
        if (!mammal) return null;
        if (mammal.genus) return mammal.genus;
        if (mammal.scientific_name) {
            const parts = mammal.scientific_name.split(' ');
            if (parts.length > 0) {
                return parts[0];
            }
        }
        return null;
    }

    getDeterministicJitter(key) {
        if (!key) return 0;
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = ((hash << 5) - hash) + key.charCodeAt(i);
            hash |= 0; // convert to 32-bit int
        }
        const normalized = Math.abs(Math.sin(hash)) % 1;
        return normalized;
    }

    calculateTaxonomicScore(mammal1, mammal2) {
        let score = 10; // baseline for very distant relation

        if (mammal1.order && mammal2.order && mammal1.order === mammal2.order) {
            score += 35;

            if (mammal1.family && mammal2.family && mammal1.family === mammal2.family) {
                score += 25;

                const genus1 = mammal1.genus || (mammal1.scientific_name ? mammal1.scientific_name.split(' ')[0] : null);
                const genus2 = mammal2.genus || (mammal2.scientific_name ? mammal2.scientific_name.split(' ')[0] : null);

                if (genus1 && genus2 && genus1 === genus2) {
                    score += 20;
                }
            }
        }

        // Add a small random jitter to avoid identical scores for similar taxa
        score += (Math.random() * 10) - 5;

        return Math.max(5, Math.min(95, Math.round(score)));
    }

    showRoundTreeModal() {
    const modal = document.getElementById('round-tree-modal');
    const container = document.getElementById('round-tree-svg');
        if (!modal || !container) {
            return;
        }

        const freshSnapshot = this.phyloCalculator && typeof this.phyloCalculator.getActiveTreeSnapshot === 'function'
            ? this.phyloCalculator.getActiveTreeSnapshot()
            : null;
        if (freshSnapshot) {
            this.roundTreeSnapshot = freshSnapshot;
        }

        container.innerHTML = '';

        if (!this.roundTreeSnapshot) {
            const message = document.createElement('p');
            message.className = 'round-tree-empty';
            message.textContent = 'Round tree data is still loading. Please try again in a moment.';
            container.appendChild(message);
        } else {
            this.renderRoundTree(this.roundTreeSnapshot, container);
        }

        modal.style.display = 'flex';
    }

    renderRoundTree(treeData, container) {
        if (!container) return;
        container.innerHTML = '';

        // If no tree data, show loading message
        if (!treeData || !this.currentTarget || !Array.isArray(this.gameOptions) || this.gameOptions.length === 0) {
            const message = document.createElement('p');
            message.className = 'round-tree-empty';
            message.textContent = 'Distance data is still loading. Please try again in a moment.';
            container.appendChild(message);
            return;
        }

        // Prepare species names and normalized distances to target, including the target itself
        const target = this.currentTarget;
        const speciesData = [];
        for (const mammal of this.gameOptions) {
            if (!mammal || !mammal.scientific_name) continue;
            const metrics = this.phyloCalculator.getPhylogeneticDistance(target.scientific_name, mammal.scientific_name);
            let score = metrics ? this.phyloCalculator.distanceToScore(metrics.effective) : null;
            speciesData.push({
                name: mammal.common_name || mammal.scientific_name,
                id: mammal.id,
                dist: score,
                isTarget: mammal.id === target.id,
                isGuessed: false
            });
        }
        // If guessedIds is a Set, use it; otherwise fall back to guesses array
        const guessedIdsFromSet = (this.guessedIds && typeof this.guessedIds.has === 'function')
            ? new Set([...this.guessedIds])
            : (Array.isArray(this.guessedIds) ? new Set(this.guessedIds) : (Array.isArray(this.guesses) ? new Set(this.guesses.map(g => g.mammal && g.mammal.id).filter(Boolean)) : new Set()));
        // Add the target species itself if not present
        if (!speciesData.find(x => x.isTarget)) {
            speciesData.push({
                name: target.common_name || target.scientific_name,
                id: target.id,
                dist: 100,
                isTarget: true
            });
        }
        // Include any species that were guessed during the round but not in the original options
        // Mark existing entries as guessed where appropriate
        speciesData.forEach(s => { s.isGuessed = guessedIdsFromSet.has(s.id) || !!s.isGuessed; });
        if (Array.isArray(this.guesses)) {
            for (const g of this.guesses) {
                if (!g || !g.mammal || !g.mammal.id) continue;
                const id = g.mammal.id;
                if (!speciesData.find(x => x.id === id)) {
                    // compute distance for guessed species (if possible)
                    let dist = null;
                    try {
                        const metrics = this.phyloCalculator.getPhylogeneticDistance(target.scientific_name, g.mammal.scientific_name);
                        dist = metrics ? this.phyloCalculator.distanceToScore(metrics.effective) : null;
                    } catch (e) {
                        dist = null;
                    }
                    speciesData.push({
                        name: g.mammal.common_name || g.mammal.scientific_name,
                        id: id,
                        dist: dist,
                        isTarget: id === target.id,
                        isGuessed: true
                    });
                }
            }
        }

        // Debug: log the final speciesData and guesses to help diagnose missing guessed species
        console.log('Histogram final speciesData:', speciesData);
        try {
            console.log('Guessed IDs (set):', Array.isArray(this.guessedIds) ? this.guessedIds : (this.guessedIds && typeof this.guessedIds.has === 'function' ? [...this.guessedIds] : null));
            console.log('Guesses array:', this.guesses);
        } catch (e) {
            console.warn('Error logging guesses:', e);
        }
        // Sort by score descending (higher = closer)
        const sorted = speciesData.filter(x => x.dist !== null).sort((a, b) => b.dist - a.dist);
        const sortedSpecies = sorted.map(x => x.name);
        const sortedDistances = sorted.map(x => x.dist);
        const sortedIds = sorted.map(x => x.id);
        // Mark which species were guessed during the round
        const guessedSet = new Set(Array.isArray(this.guessedIds) ? this.guessedIds : (Array.isArray(this.guesses) ? this.guesses.map(g => g.mammal && g.mammal.id).filter(Boolean) : []));
        const sortedIsTarget = sorted.map(x => x.isTarget);
        const sortedIsGuessed = sorted.map(x => guessedSet.has(x.id));

        // Expose labels used for tree styling so phylotree/fallback can mark target/guess nodes
        this.latestTargetLabel = this.currentTarget ? this.normalizeTreeLabel(this.currentTarget.scientific_name) : null;
        const strongest = this.getStrongestGuess();
        this.latestBestGuessLabel = strongest && strongest.mammal ? this.normalizeTreeLabel(strongest.mammal.scientific_name) : null;

        // D3.js horizontal bar chart implementation
        // Remove any previous chart
        container.innerHTML = '';

        // Add D3.js if not present
        if (!window.d3) {
            const script = document.createElement('script');
            script.src = 'https://d3js.org/d3.v7.min.js';
            script.onload = () => this.drawD3DistanceHistogram(sortedSpecies, sortedDistances, sortedIds, sortedIsTarget, sortedIsGuessed, container);
            container.appendChild(script);
            return;
        }
        this.drawD3DistanceHistogram(sortedSpecies, sortedDistances, sortedIds, sortedIsTarget, sortedIsGuessed, container);
    }

    drawD3DistanceHistogram(species, distances, ids, isTargetArr, isGuessedArr, container) {
        // D3 horizontal bar chart with clickable bars and labels
        const d3 = window.d3;
        const data = species.map((name, i) => ({
            name,
            value: distances[i],
            id: ids[i],
            isTarget: isTargetArr[i],
            isGuessed: Array.isArray(isGuessedArr) ? !!isGuessedArr[i] : false
        }));
        // Increase left margin for longer labels and move chart right
        // Make width responsive to the modal/container to avoid overflow
        const maxWidth = 1200;
        const minWidth = 640;
        const containerWidth = (container && container.clientWidth) ? container.clientWidth : 1000;
        const width = Math.min(maxWidth, Math.max(minWidth, containerWidth - 40));
        // Give a bit more right margin so score labels don't run off the edge
        const margin = { top: 40, right: 60, bottom: 40, left: Math.max(220, Math.min(360, Math.floor(width * 0.34))) };
        const barHeight = 28;
        const height = data.length * barHeight + margin.top + margin.bottom;

        // Remove any previous SVG
        d3.select(container).selectAll('svg').remove();
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        // X scale (score)
        const x = d3.scaleLinear()
            .domain([0, 100])
            .range([margin.left, width - margin.right]);

        // Y scale (species)
        const y = d3.scaleBand()
            .domain(data.map(d => d.name))
            .range([margin.top, height - margin.bottom])
            .padding(0.15);

        // Color function
        function barColor(d) {
            // Target highlighted in red hues
            if (d.isTarget) return 'rgba(255,99,132,0.85)';
            // Otherwise color by similarity
            if (d.value === 100) return 'rgba(255,99,132,0.7)';
            if (d.value >= 70) return 'rgba(76,175,80,0.7)';
            if (d.value >= 40) return 'rgba(255,193,7,0.7)';
            return 'rgba(244,67,54,0.7)';
        }

        // Draw bars
        svg.selectAll('.bar')
            .data(data)
            .enter()
            .append('rect')
            .attr('class', d => d.isGuessed ? 'bar guessed' : 'bar')
            .attr('x', x(0))
            .attr('y', d => y(d.name))
            .attr('width', d => x(d.value) - x(0))
            .attr('height', y.bandwidth())
            .attr('fill', barColor)
            // Add a blue border for guessed bars while preserving fill colors
            .attr('stroke', d => d.isGuessed ? 'rgba(33,150,243,0.85)' : 'none')
            .attr('stroke-width', d => d.isGuessed ? 1.2 : 0)
            .attr('cursor', 'pointer')
            .style('pointer-events', 'all')
            .on('click', function(event, d) {
                event.stopPropagation();
                console.log('Bar clicked:', d.name, d.id, typeof window.showInfoModal);
                if (typeof window.showInfoModal === 'function') {
                    window.showInfoModal(d.id);
                }
            })
            .on('mouseover', function(event, d) {
                // subtle hover effect
                d3.select(this).attr('fill', 'orange');
            })
            .on('mouseout', function(event, d) {
                d3.select(this).attr('fill', barColor(d));
            });

        // Draw species labels (y-axis) with improved vertical alignment and left margin
        svg.selectAll('.label')
            .data(data)
            .enter()
            .append('text')
            .attr('class', d => d.isGuessed ? 'label guessed-label' : 'label')
            .attr('x', margin.left - 8)
            .attr('y', d => y(d.name) + y.bandwidth() * 0.62) // slightly lower for better alignment
            .attr('text-anchor', 'end')
            .attr('alignment-baseline', 'middle')
            .attr('font-size', '16px')
            .attr('font-weight', d => d.isTarget || d.isGuessed ? 'bold' : 'normal')
            .attr('fill', d => d.isTarget ? '#d32f2f' : (d.isGuessed ? '#1565c0' : 'inherit'))
            .attr('cursor', 'pointer')
            .style('pointer-events', 'all')
            .text(d => d.name)
            .on('click', function(event, d) {
                event.stopPropagation();
                console.log('Label clicked:', d.name, d.id, typeof window.showInfoModal);
                if (typeof window.showInfoModal === 'function') {
                    window.showInfoModal(d.id);
                }
            });

            // Ensure guessed labels are colored blue (handled above); no underline needed

        // Draw score labels on bars
        svg.selectAll('.score-label')
            .data(data)
            .enter()
            .append('text')
            .attr('class', 'score-label')
            .attr('x', d => {
                const rawX = x(d.value) + 6;
                const maxX = width - margin.right - 12;
                return rawX > maxX ? maxX : rawX;
            })
            .attr('y', d => y(d.name) + y.bandwidth() / 2)
            .attr('alignment-baseline', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#333')
            .attr('text-anchor', d => (x(d.value) + 6 > width - margin.right - 40) ? 'end' : 'start')
            .text(d => `${d.value}%`);

        // Draw x-axis
        const xAxis = d3.axisBottom(x)
            .ticks(8)
            .tickFormat(d => `${d}%`);
        svg.append('g')
            .attr('transform', `translate(0,${height - margin.bottom})`)
            .call(xAxis)
            .call(g => g.append('text')
                .attr('x', width - margin.right)
                .attr('y', 35)
                .attr('fill', '#333')
                .attr('text-anchor', 'end')
                .attr('font-size', '16px')
                .text('Similarity Score (%)'));

        // Draw chart title
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', margin.top - 18)
            .attr('text-anchor', 'middle')
            .attr('font-size', '20px')
            .attr('font-weight', 'bold')
            .text('Similarity Scores to Target Species');
    }

    renderRoundTreeWithPhylotree(treeData, container) {
        const newick = this.buildNewickFromSnapshot(treeData);
        if (!newick) {
            throw new Error('Unable to synthesise Newick string for round tree snapshot.');
        }

        const leafCount = this.countLeafNodes(treeData);
        const width = 600;
        const height = Math.max(leafCount * 25, 600);

        const tree = new window.phylotree.phylotree(newick);
        tree.render({
            container,
            width,
            height,
            'left-right-spacing': 'compact',
            'top-bottom-spacing': 'fit-to-size',
            'align-tips': false,
            'show-menu': false,
            'show-scale': false,
            collapsible: false,
            selectable: false,
            brush: false,
            reroot: false,
            hide: false,
            zoom: false,
            'font-size': 12,
            'maximum-per-node-spacing': 40,
            'node-styler': (selection, nodeData) => this.stylePhylotreeNode(selection, nodeData)
        });

        if (!tree.display || typeof tree.display.show !== 'function') {
            throw new Error('Phylotree render did not produce a display instance.');
        }

        const svgElement = tree.display.show();
        if (svgElement && svgElement instanceof SVGElement) {
            // Clear and append the SVG
            container.innerHTML = '';
            container.appendChild(svgElement);
        }

        return true;
    }

    stylePhylotreeNode(selection, nodeData) {
        if (!selection || !nodeData) {
            return;
        }

        const isLeaf = !nodeData.children || nodeData.children.length === 0;
        const group = selection;
        const targetLabel = this.latestTargetLabel || null;
        const bestLabel = this.latestBestGuessLabel || null;

        group.classed('round-tree-target', false);
        group.classed('round-tree-guess', false);

        const circleSelection = group.select('circle');
        if (!isLeaf) {
            const internalText = group.select('text');
            if (!internalText.empty()) {
                const rawInternal = nodeData.data && nodeData.data.name ? nodeData.data.name : '';
                internalText
                    .classed('round-tree-label', false)
                    .text(rawInternal.replace(/_/g, ' '))
                    .style('cursor', 'default')
                    .on('click', null);
            }

            if (!circleSelection.empty()) {
                circleSelection.on('click', null);
            }

            group.selectAll('title').remove();
            return;
        }

        const rawName = nodeData.data && nodeData.data.name ? nodeData.data.name : '';
        const normalized = this.normalizeTreeLabel(rawName);
        const mammal = this.getMammalForTreeLabel(rawName);
        const isGuessed = mammal && ( (this.guessedIds && this.guessedIds.has && this.guessedIds.has(mammal.id)) || (Array.isArray(this.guesses) && this.guesses.some(g => g.mammal && g.mammal.id === mammal.id)) );

        const textSelection = group.select('text');
        if (!textSelection.empty()) {
            textSelection.selectAll('tspan').remove();
            textSelection.classed('round-tree-label', true);

            if (mammal) {
                textSelection.text(mammal.common_name || mammal.scientific_name);
                textSelection.style('cursor', 'pointer');
                const self = this;
                textSelection.on('click', function(event) {
                    event.stopPropagation();
                    self.showMammalInfo(mammal);
                });
            } else {
                const fallback = rawName.replace(/_/g, ' ');
                textSelection.text(fallback);
                textSelection.style('cursor', 'default');
                textSelection.on('click', null);
            }

            const accessibleLabel = mammal ? mammal.scientific_name : rawName.replace(/_/g, ' ');
            textSelection.attr('aria-label', accessibleLabel);
        }

        if (!circleSelection.empty()) {
            if (mammal) {
                const self = this;
                circleSelection.on('click', function(event) {
                    event.stopPropagation();
                    self.showMammalInfo(mammal);
                });
                circleSelection.style('cursor', 'pointer');
            } else {
                circleSelection.on('click', null);
                circleSelection.style('cursor', 'default');
            }
        }

        let titleSelection = group.select('title');
        if (titleSelection.empty()) {
            titleSelection = group.append('title');
        }
        titleSelection.text(mammal ? mammal.scientific_name : rawName.replace(/_/g, ' '));

        if (targetLabel && normalized === targetLabel) {
            group.classed('round-tree-target', true);
        }
        // Mark best guess or any guessed nodes (but do not mark target as a guess)
        if (!(targetLabel && normalized === targetLabel) && ((bestLabel && normalized === bestLabel) || isGuessed)) {
            group.classed('round-tree-guess', true);
        }
    }

    getStrongestGuess() {
        if (!Array.isArray(this.guesses) || this.guesses.length === 0) {
            return null;
        }

        let best = this.guesses[0];
        for (let i = 1; i < this.guesses.length; i += 1) {
            const candidate = this.guesses[i];
            if (candidate && candidate.score > best.score) {
                best = candidate;
            }
        }

        return best;
    }

    buildNewickFromSnapshot(treeData) {
        const subtreeCache = new WeakMap();
        const leafCache = new Map();

        const convert = (node, isRoot = false) => {
            if (!node) {
                return '';
            }

            const sortedChildren = Array.isArray(node.children)
                ? [...node.children].sort((a, b) => this.compareSubtreesByTargetDistance(a, b, subtreeCache, leafCache))
                : [];
            const children = sortedChildren
                .map(child => convert(child, false))
                .filter(Boolean);

            const name = this.sanitizeNewickLabel(node.label || '');
            const branchLength = Number.isFinite(node.branchLength) ? Math.max(node.branchLength, 0) : 0;
            const lengthSegment = isRoot ? '' : `:${branchLength.toFixed(6)}`;

            if (children.length > 0) {
                return `(${children.join(',')})${name}${lengthSegment}`;
            }

            return `${name}${lengthSegment}`;
        };

        const body = convert(treeData, true);
        if (!body) {
            return null;
        }

        return `${body};`;
    }

    sanitizeNewickLabel(label) {
        if (!label) {
            return '';
        }

        return String(label).replace(/[\s:;,()]/g, '_');
    }

    countLeafNodes(node) {
        if (!node) {
            return 0;
        }

        if (!Array.isArray(node.children) || node.children.length === 0) {
            return 1;
        }

        return node.children.reduce((sum, child) => sum + this.countLeafNodes(child), 0);
    }

    renderRoundTreeFallback(treeData, container) {
        const clonedTree = JSON.parse(JSON.stringify(treeData));
        const nodes = [];
        const edges = [];
        let leafIndex = 0;
        let maxDepth = 0;
        const leafSpacing = 26;
        const subtreeCache = new WeakMap();
        const leafCache = new Map();

        const traverse = (node, depth) => {
            const layoutNode = {
                label: node.label || '',
                rawDepth: depth,
                branchLength: node.branchLength ?? 0,
                children: []
            };
            nodes.push(layoutNode);

            if (Array.isArray(node.children) && node.children.length > 0) {
                let yAccumulator = 0;
                const sortedChildren = [...node.children].sort((a, b) => this.compareSubtreesByTargetDistance(a, b, subtreeCache, leafCache));
                sortedChildren.forEach(child => {
                    const childDepth = depth + (child.branchLength ?? 0);
                    const childLayout = traverse(child, childDepth);
                    layoutNode.children.push(childLayout);
                    edges.push({ parent: layoutNode, child: childLayout });
                    yAccumulator += childLayout.rawY;
                });
                layoutNode.rawY = yAccumulator / layoutNode.children.length;
            } else {
                layoutNode.rawY = leafIndex * leafSpacing;
                leafIndex += 1;
            }

            maxDepth = Math.max(maxDepth, depth);
            return layoutNode;
        };

        traverse(clonedTree, 0);

        const padding = { top: 40, right: 40, bottom: 40, left: 210 };
        const canvasWidth = 900;
        const usableWidth = Math.max(canvasWidth - padding.left - padding.right, 200);
        const totalLeafSpan = Math.max(leafIndex - 1, 0) * leafSpacing;
        const canvasHeight = padding.top + padding.bottom + totalLeafSpan + (leafIndex === 0 ? leafSpacing : 0);
        const height = Math.max(canvasHeight, padding.top + padding.bottom + leafSpacing * 2);
        const scaleX = maxDepth > 0 ? usableWidth / maxDepth : usableWidth;
        const targetLabel = this.currentTarget ? this.normalizeTreeLabel(this.currentTarget.scientific_name) : null;
        const bestGuess = this.getStrongestGuess();
        const bestLabel = bestGuess ? this.normalizeTreeLabel(bestGuess.mammal.scientific_name) : null;
        const guessedSet = new Set(Array.isArray(this.guessedIds) ? this.guessedIds : (Array.isArray(this.guesses) ? this.guesses.map(g => g.mammal && g.mammal.id).filter(Boolean) : []));

        nodes.forEach(node => {
            node.x = padding.left + node.rawDepth * scaleX;
            node.y = padding.top + node.rawY;
            node.isLeaf = node.children.length === 0;
            const mammal = node.isLeaf ? this.getMammalForTreeLabel(node.label) : null;
            const fallbackLabel = node.label ? node.label.replace(/_/g, ' ') : '';
            node.displayLabel = mammal ? mammal.common_name : fallbackLabel;
            node.scientificLabel = mammal ? mammal.scientific_name : fallbackLabel;
            const normalizedNodeLabel = this.normalizeTreeLabel(node.label);
            node.isTarget = node.isLeaf && targetLabel && normalizedNodeLabel === targetLabel;
            const isBestGuess = node.isLeaf && bestLabel && normalizedNodeLabel === bestLabel;
            node.isBestGuess = isBestGuess && !(node.isTarget && targetLabel && bestLabel && targetLabel === bestLabel);
            node.isGuessed = node.isLeaf && mammal && guessedSet.has(mammal.id);
        });

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('width', String(canvasWidth));
        svg.setAttribute('height', String(height));
        svg.setAttribute('viewBox', `0 0 ${canvasWidth} ${height}`);

        edges.forEach(edge => {
            const parent = edge.parent;
            const child = edge.child;
            const path = document.createElementNS(svgNS, 'path');
            const d = `M ${parent.x} ${parent.y} H ${child.x} V ${child.y}`;
            path.setAttribute('d', d);
            path.setAttribute('class', 'round-tree-branch');
            svg.appendChild(path);
        });

        nodes.forEach(node => {
            const circle = document.createElementNS(svgNS, 'circle');
            circle.setAttribute('cx', String(node.x));
            circle.setAttribute('cy', String(node.y));
            circle.setAttribute('r', node.isLeaf ? '3.2' : '2.4');
            const circleClasses = ['round-tree-node'];
            if (node.isTarget) {
                circleClasses.push('target');
            }
            if (node.isBestGuess || node.isGuessed) {
                circleClasses.push('guess');
            }
            circle.setAttribute('class', circleClasses.join(' '));
            if (node.isLeaf && node.scientificLabel) {
                circle.setAttribute('data-name', node.scientificLabel);
            }
            svg.appendChild(circle);

            if (node.isLeaf) {
                const text = document.createElementNS(svgNS, 'text');
                text.setAttribute('x', String(node.x + 8));
                text.setAttribute('y', String(node.y - 3));
                const textClasses = ['round-tree-label'];
                if (node.isTarget) {
                    textClasses.push('target');
                }
                if (node.isBestGuess || node.isGuessed) {
                    textClasses.push('guess');
                }
                text.setAttribute('class', textClasses.join(' '));
                text.setAttribute('dominant-baseline', 'hanging');

                const commonTspan = document.createElementNS(svgNS, 'tspan');
                commonTspan.setAttribute('x', String(node.x + 8));
                commonTspan.setAttribute('dy', '0');
                commonTspan.textContent = node.displayLabel || node.scientificLabel;

                const sciTspan = document.createElementNS(svgNS, 'tspan');
                sciTspan.setAttribute('x', String(node.x + 8));
                sciTspan.setAttribute('dy', '14');
                sciTspan.setAttribute('class', 'round-tree-label scientific');
                sciTspan.textContent = node.scientificLabel;

                text.appendChild(commonTspan);
                text.appendChild(sciTspan);
                svg.appendChild(text);
            }
        });

        const scrollWrapper = document.createElement('div');
        scrollWrapper.className = 'round-tree-scroll';
        scrollWrapper.appendChild(svg);
        container.appendChild(scrollWrapper);
        return true;
    }

    appendRoundTreeLegend(container) {
        if (!container) {
            return;
        }

        const note = document.createElement('p');
        note.className = 'round-tree-note';
        note.textContent = 'Branch lengths reflect relative phylogenetic distances for this round and are scaled to fit the view.';

        container.appendChild(note);
    }

    compareSubtreesByTargetDistance(nodeA, nodeB, subtreeCache, leafCache) {
        const distanceA = this.computeSubtreeTargetDistance(nodeA, subtreeCache, leafCache);
        const distanceB = this.computeSubtreeTargetDistance(nodeB, subtreeCache, leafCache);

        const aFinite = Number.isFinite(distanceA);
        const bFinite = Number.isFinite(distanceB);

        if (aFinite && bFinite && distanceA !== distanceB) {
            return distanceA - distanceB;
        }

        if (aFinite && !bFinite) {
            return -1;
        }

        if (!aFinite && bFinite) {
            return 1;
        }

        const labelA = (nodeA && nodeA.label ? nodeA.label : '').toString();
        const labelB = (nodeB && nodeB.label ? nodeB.label : '').toString();
        return labelA.localeCompare(labelB);
    }

    computeSubtreeTargetDistance(node, subtreeCache, leafCache) {
        if (!node) {
            return Number.POSITIVE_INFINITY;
        }

        if (subtreeCache.has(node)) {
            return subtreeCache.get(node);
        }

        let minDistance = Number.POSITIVE_INFINITY;
        const rawChildren = Array.isArray(node.children) ? node.children : [];
        if (rawChildren.length > 0) {
            rawChildren.forEach(child => {
                const childDistance = this.computeSubtreeTargetDistance(child, subtreeCache, leafCache);
                if (childDistance < minDistance) {
                    minDistance = childDistance;
                }
            });
        } else {
            minDistance = this.getLeafDistanceToTarget(node.label, leafCache);
        }

        subtreeCache.set(node, minDistance);
        return minDistance;
    }

    getLeafDistanceToTarget(label, leafCache) {
        if (!label) {
            return Number.POSITIVE_INFINITY;
        }

        if (leafCache && leafCache.has(label)) {
            return leafCache.get(label);
        }

        let distance = Number.POSITIVE_INFINITY;
        if (this.currentTarget) {
            const mammal = this.getMammalForTreeLabel(label);
            if (mammal) {
                if (mammal.id === this.currentTarget.id) {
                    distance = 0;
                } else if (this.phyloCalculator && this.phyloCalculator.isLoaded) {
                    const metrics = this.phyloCalculator.getPhylogeneticDistance(
                        mammal.scientific_name,
                        this.currentTarget.scientific_name
                    );
                    if (metrics && Number.isFinite(metrics.effective)) {
                        distance = Math.max(metrics.effective, 0);
                    }
                }
            }
        }

        if (leafCache) {
            leafCache.set(label, distance);
        }

        return distance;
    }

    makeGuess(mammal) {
        if (this.gameState !== 'playing' || this.currentGuess > this.maxGuesses) {
            return;
        }

        // Prevent duplicate guesses when an option slips through
        if (this.guessedIds.has(mammal.id) || this.guesses.some(g => g.mammal.id === mammal.id)) {
            return;
        }

        this.guessedIds.add(mammal.id);

        const similarity = this.calculateSimilarity(mammal, this.currentTarget);
        const { distance, rawDistance, edgeCount, adjustedDistance, score } = similarity;
        
        const guess = {
            mammal: mammal,
            distance: distance,
            rawDistance: rawDistance,
            edgeCount: edgeCount,
            adjustedDistance: adjustedDistance,
            score: score,
            guessNumber: this.currentGuess
        };
        
        this.guesses.push(guess);
        this.removeOptionFromPool(mammal.id);
        
        // Update the guess display in the original layout
        const guessElement = document.getElementById(`try${this.currentGuess}`);
        const distanceElement = document.getElementById(`distance${this.currentGuess}`);
        
        if (guessElement) {
            // Clear previous content
            guessElement.innerHTML = '';
            
            // Create a hoverable element for the guessed mammal
            const mammalCard = document.createElement('div');
            mammalCard.className = 'guessed-mammal-card';
            mammalCard.textContent = mammal.common_name;
            
            // Add hover functionality with mammal image
            mammalCard.addEventListener('mouseenter', (e) => {
                this.showPreview(mammal);
            });
            
            mammalCard.addEventListener('mouseleave', () => {
                this.hidePreview();
            });
            
            // Add click functionality to show full info
            mammalCard.addEventListener('click', () => {
                this.showMammalInfo(mammal);
            });
            
            // Make it look clickable
            mammalCard.style.cursor = 'pointer';
            mammalCard.title = `Click to view ${mammal.common_name} details`;
            
            guessElement.appendChild(mammalCard);
        }
        
        if (distanceElement) {
            if (score === 100) {
                distanceElement.textContent = 'Perfect!';
            } else if (score !== null && score !== undefined) {
                distanceElement.textContent = `${score}% match`;
            } else {
                distanceElement.textContent = 'No data';
            }
            distanceElement.style.visibility = 'visible';
            
            // Color coding based on similarity score (larger = closer = better)
            distanceElement.classList.remove('green', 'yellow', 'red');
            if (score === null || score === undefined) {
                distanceElement.classList.add('yellow');
            } else if (score >= 70) {
                distanceElement.classList.add('green');
            } else if (score >= 40) {
                distanceElement.classList.add('yellow');
            } else {
                distanceElement.classList.add('red');
            }
        }
        
        // Check for win condition based on exact match
        if (mammal.id === this.currentTarget.id) {
            this.endGame(true);
            return;
        }
        
        // Check for lose condition
        if (this.currentGuess >= this.maxGuesses) {
            this.endGame(false);
            return;
        }
        
        this.currentGuess++;
    }

    endGame(won) {
        this.gameState = 'finished';
        
        setTimeout(() => {
            this.showResultModal(won);
        }, 500);
    }

    updateGameUI() {
        const guessCounter = document.getElementById('guess-counter');
        const progressFill = document.getElementById('progress-fill');
        
        if (guessCounter) {
            guessCounter.textContent = `Guess ${this.currentGuess} of ${this.maxGuesses}`;
        }
        
        if (progressFill) {
            const progress = ((this.currentGuess - 1) / this.maxGuesses) * 100;
            progressFill.style.width = `${progress}%`;
        }
        
        // Ensure visual guess slots are reset
        this.clearGuessDisplays();
    }

    clearGuessDisplays() {
        for (let i = 1; i <= this.maxGuesses; i++) {
            const guessElement = document.getElementById(`try${i}`);
            const distanceElement = document.getElementById(`distance${i}`);

            if (guessElement) {
                guessElement.innerHTML = '';
            }

            if (distanceElement) {
                distanceElement.textContent = '';
                distanceElement.style.visibility = 'hidden';
                distanceElement.classList.remove('green', 'yellow', 'red');
            }
        }

        const guessesGrid = document.getElementById('guesses-grid');
        if (guessesGrid) {
            guessesGrid.innerHTML = '';
        }
    }

    addGuessToUI(guess) {
        const guessesGrid = document.getElementById('guesses-grid');
        if (!guessesGrid) return;
        
        const guessCard = document.createElement('div');
        guessCard.className = `guess-card ${this.getScoreClass(guess.score)}`;
        const guessImage = getPrimaryImageUrl(guess.mammal) || 'placeholder.jpg';

        const scoreDisplay = guess.score === 100
            ? 'Perfect Match!'
            : `${guess.score}% similarity`;
        
        guessCard.innerHTML = `
            <div class="guess-number">#${guess.guessNumber}</div>
            <div class="guess-image">
             <img src="${guessImage}" 
                 alt="${guess.mammal.common_name}"
                 onerror="this.onerror=null; this.src='placeholder.jpg';">
            </div>
            <div class="guess-info">
                <div class="guess-name">${guess.mammal.common_name}</div>
                <div class="guess-scientific">${guess.mammal.scientific_name}</div>
                <div class="guess-similarity">${scoreDisplay}</div>
            </div>
        `;
        if (typeof guess.distance === 'number') {
            const details = [];
            details.push(`Effective distance: ${guess.distance.toFixed(3)}`);
            if (typeof guess.adjustedDistance === 'number') {
                details.push(`Adjusted: ${guess.adjustedDistance.toFixed(3)}`);
            }
            if (typeof guess.rawDistance === 'number') {
                details.push(`Raw: ${guess.rawDistance.toFixed(3)}`);
            }
            if (typeof guess.edgeCount === 'number') {
                details.push(`Edges: ${guess.edgeCount}`);
            }
            guessCard.title = details.join(' • ');
        }
        
        guessCard.addEventListener('click', () => {
            this.showMammalInfo(guess.mammal);
        });
        
        guessesGrid.appendChild(guessCard);
        
        // Animate in
        setTimeout(() => {
            guessCard.classList.add('animate-in');
        }, 100);
    }

    getScoreClass(score) {
        if (score === null || score === undefined) return 'medium-match';
        if (score === 100) return 'perfect-match';
        if (score >= 70) return 'close-match';
        if (score >= 40) return 'medium-match';
        return 'distant-match';
    }

    populateOptions() {
        const optionsGrid = document.getElementById('options-grid');
        if (!optionsGrid) return;
        
        optionsGrid.innerHTML = '';
        this.optionButtons.clear();
        
        // Sort options alphabetically by common name
        const sortedOptions = [...this.gameOptions].sort((a, b) => 
            a.common_name.localeCompare(b.common_name)
        );
        
        // Preload images for better performance
        this.preloadImages(sortedOptions);
        
        sortedOptions.forEach(mammal => {
            const button = document.createElement('button');
            button.textContent = mammal.common_name;
            this.optionButtons.set(mammal.id, button);
            if (this.guessedIds.has(mammal.id)) {
                button.disabled = true;
                button.classList.add('used-option');
            }
            
            // Add hover functionality for image preview
            button.addEventListener('mouseenter', () => {
                this.showPreview(mammal);
            });
            
            button.addEventListener('mouseleave', () => {
                this.hidePreview();
            });
            
            button.addEventListener('click', () => {
                if (this.gameState === 'playing') {
                    this.makeGuess(mammal);
                }
            });
            
            optionsGrid.appendChild(button);
        });
    }

    enterPostResultMode() {
        if (this.postResultModeActive) {
            return;
        }
        const optionsGrid = document.getElementById('options-grid');
        if (!optionsGrid) {
            return;
        }

        this.postResultModeActive = true;
        optionsGrid.classList.add('post-result-mode');
        optionsGrid.innerHTML = `
            <p class="post-result-note">Round complete! Choose what you would like to do next.</p>
            <div class="post-result-grid">
                <button class="btn btn-primary" onclick="game.startNewGame(); hideModal('result-modal'); showScreen('game-screen');">
                    Play Again
                </button>
                <button class="btn btn-secondary" onclick="game.showRoundTreeModal();">
                    View Round Graph
                </button>
                <button class="btn btn-secondary" onclick="hideModal('result-modal'); showScreen('home-screen');">
                    Main Menu
                </button>
                <button class="btn btn-secondary view-results-btn" onclick="showModal('result-modal');">
                    View Results
                </button>
            </div>
        `;
    }

    exitPostResultMode() {
        if (!this.postResultModeActive) {
            return;
        }
        this.postResultModeActive = false;
        const optionsGrid = document.getElementById('options-grid');
        if (optionsGrid) {
            optionsGrid.classList.remove('post-result-mode');
        }
    }

    removeOptionFromPool(mammalId) {
        this.gameOptions = this.gameOptions.filter(option => option.id !== mammalId);
        const button = this.optionButtons.get(mammalId);
        if (button) {
            button.disabled = true;
            button.classList.add('used-option');
            button.remove();
            this.optionButtons.delete(mammalId);
        }
    }

    preloadImages(mammals) {
        // Preload first 20 images for faster hover response
        const imagesToPreload = mammals.slice(0, 20);
        
        imagesToPreload.forEach(mammal => {
            const imageUrl = getPrimaryImageUrl(mammal);
            if (imageUrl) {
                const img = new Image();
                img.src = imageUrl;
            }
        });
    }

    showPreview(mammal) {
        const imageContainer = document.getElementById('imagecontainer');
        if (!imageContainer) return;
        
        // Add loading class
        imageContainer.classList.add('loading');
        const imageUrl = getPrimaryImageUrl(mammal);
    const fallbackDataUrl = "url('placeholder.jpg')";
        if (!imageUrl) {
            imageContainer.style.backgroundImage = fallbackDataUrl;
            imageContainer.classList.remove('loading');
            return;
        }
        
        // Create a new image to preload and check if it loads successfully
        const img = new Image();
        
        img.onload = () => {
            // Image loaded successfully, set as background
            imageContainer.style.backgroundImage = `url('${imageUrl}')`;
            imageContainer.classList.remove('loading');
        };
        
        img.onerror = () => {
            // Image failed to load, use fallback
            imageContainer.style.backgroundImage = fallbackDataUrl;
            imageContainer.classList.remove('loading');
        };
        
        // Start loading the image
        img.src = imageUrl;
    }

    hidePreview() {
        const imageContainer = document.getElementById('imagecontainer');
        if (!imageContainer) return;
        
        // Clear the background image and loading state
        imageContainer.style.backgroundImage = '';
        imageContainer.classList.remove('loading');
    }

    populateGallery() {
        const galleryContent = document.getElementById('gallery-content');
        if (!galleryContent) return;
        
        galleryContent.innerHTML = '';
        
        // Populate filter dropdowns
        this.populateFilterDropdowns();
        
        // Group mammals by order
        const groupedMammals = this.mammals.reduce((groups, mammal) => {
            const order = mammal.order || 'Unknown';
            if (!groups[order]) groups[order] = [];
            groups[order].push(mammal);
            return groups;
        }, {});
        
        // Sort orders alphabetically
        const sortedOrders = Object.keys(groupedMammals).sort();
        
        sortedOrders.forEach(order => {
            const orderSection = document.createElement('div');
            orderSection.className = 'gallery-order-section';
            orderSection.dataset.order = order;
            
            const orderHeader = document.createElement('h3');
            orderHeader.className = 'gallery-order-title';
            orderHeader.textContent = `Order: ${order}`;
            orderSection.appendChild(orderHeader);
            
            const mammalGrid = document.createElement('div');
            mammalGrid.className = 'gallery-mammal-grid';
            
            // Sort mammals within order by common name
            const sortedMammals = groupedMammals[order].sort((a, b) => 
                a.common_name.localeCompare(b.common_name)
            );
            
            sortedMammals.forEach(mammal => {
                const mammalCard = document.createElement('div');
                mammalCard.className = 'gallery-mammal-card';
                mammalCard.dataset.commonName = mammal.common_name.toLowerCase();
                mammalCard.dataset.scientificName = mammal.scientific_name.toLowerCase();
                mammalCard.dataset.order = mammal.order || '';
                mammalCard.dataset.family = mammal.family || '';
                
                const cardImage = getPrimaryImageUrl(mammal) || 'placeholder.jpg';
                
                mammalCard.innerHTML = `
                    <div class="gallery-mammal-image">
                    <img src="${cardImage}" 
                        alt="${mammal.common_name}"
                        loading="lazy"
                        onerror="this.onerror=null; this.src='placeholder.jpg';">
                    </div>
                    <div class="gallery-mammal-info">
                        <div class="gallery-mammal-name">${mammal.common_name}</div>
                        <div class="gallery-mammal-scientific">${mammal.scientific_name}</div>
                    </div>
                `;
                
                mammalCard.addEventListener('click', () => {
                    this.showMammalInfo(mammal);
                });
                
                mammalGrid.appendChild(mammalCard);
            });
            
            orderSection.appendChild(mammalGrid);
            galleryContent.appendChild(orderSection);
        });
    }

    populateFilterDropdowns() {
        const orderFilter = document.getElementById('order-filter');
        const familyFilter = document.getElementById('family-filter');
        
        if (!orderFilter || !familyFilter) return;
        
        // Get unique orders
        const orders = new Set();
        
        this.mammals.forEach(mammal => {
            if (mammal.order) orders.add(mammal.order);
        });
        
        // Clear and populate order filter
        orderFilter.innerHTML = '<option value="">All Orders</option>';
        
        Array.from(orders).sort().forEach(order => {
            const option = document.createElement('option');
            option.value = order;
            option.textContent = order;
            orderFilter.appendChild(option);
        });
        
        // Initially populate all families
        this.updateFamilyFilter();
    }

    updateFamilyFilter() {
        const orderFilter = document.getElementById('order-filter');
        const familyFilter = document.getElementById('family-filter');
        
        if (!orderFilter || !familyFilter) return;
        
        const selectedOrder = orderFilter.value;
        const currentFamily = familyFilter.value;
        
        // Get families based on selected order
        const families = new Set();
        
        this.mammals.forEach(mammal => {
            if (mammal.family && (!selectedOrder || mammal.order === selectedOrder)) {
                families.add(mammal.family);
            }
        });
        
        // Clear and repopulate family filter
        familyFilter.innerHTML = '<option value="">All Families</option>';
        
        Array.from(families).sort().forEach(family => {
            const option = document.createElement('option');
            option.value = family;
            option.textContent = family;
            familyFilter.appendChild(option);
        });
        
        // Restore previous selection if still available
        if (currentFamily && families.has(currentFamily)) {
            familyFilter.value = currentFamily;
        }
    }

    filterGallery() {
        const galleryContent = document.getElementById('gallery-content');
        const searchInput = document.getElementById('gallery-search');
        const orderFilter = document.getElementById('order-filter');
        const familyFilter = document.getElementById('family-filter');
        
        if (!galleryContent) return;
        
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const selectedOrder = orderFilter ? orderFilter.value : '';
        const selectedFamily = familyFilter ? familyFilter.value : '';
        
        const cards = galleryContent.querySelectorAll('.gallery-mammal-card');
        const sections = galleryContent.querySelectorAll('.gallery-order-section');
        
        cards.forEach(card => {
            const commonName = card.dataset.commonName || '';
            const scientificName = card.dataset.scientificName || '';
            const order = card.dataset.order || '';
            const family = card.dataset.family || '';
            
            // Check if card matches all filters
            const matchesSearch = searchTerm === '' || 
                                  commonName.includes(searchTerm) || 
                                  scientificName.includes(searchTerm);
            const matchesOrder = selectedOrder === '' || order === selectedOrder;
            const matchesFamily = selectedFamily === '' || family === selectedFamily;
            
            const matches = matchesSearch && matchesOrder && matchesFamily;
            card.style.display = matches ? 'block' : 'none';
        });
        
        // Hide empty sections
        sections.forEach(section => {
            const visibleCards = Array.from(section.querySelectorAll('.gallery-mammal-card'))
                .filter(card => card.style.display !== 'none');
            section.style.display = visibleCards.length > 0 ? 'block' : 'none';
        });
    }

    showMammalInfo(mammal) {
        const modal = document.getElementById('mammal-info-modal');
        const title = document.getElementById('mammal-info-title');
        const body = document.getElementById('mammal-info-body');
        
        if (!modal || !title || !body) return;
        
        title.textContent = mammal.common_name;
        
        body.innerHTML = `
            <div class="mammal-info-content">
                <div class="mammal-info-image">
                    <img src="${getPrimaryImageUrl(mammal) || 'placeholder.jpg'}" 
                         alt="${mammal.common_name}"
                         onerror="this.onerror=null; this.src='placeholder.jpg';">
                    ${mammal.image_source ? `<div class="image-credit">Image: ${mammal.image_source}</div>` : ''}
                </div>
                <div class="mammal-info-details">
                    <div class="info-row">
                        <strong>Scientific Name:</strong> <em>${mammal.scientific_name}</em>
                    </div>
                    <div class="info-row">
                        <strong>Family:</strong> ${mammal.family}
                    </div>
                    <div class="info-row">
                        <strong>Order:</strong> ${mammal.order}
                    </div>
                    <div class="external-links">
                        ${mammal.gbif_id ? `<a href="https://www.gbif.org/species/${mammal.gbif_id}" target="_blank" class="external-link">View on GBIF</a>` : ''}
                        ${mammal.inaturalist_id ? `<a href="https://www.inaturalist.org/taxa/${mammal.inaturalist_id}" target="_blank" class="external-link">View on iNaturalist</a>` : ''}
                    </div>
                </div>
            </div>
        `;
        
        modal.style.display = 'flex';
    }

    showResultModal(won) {
        const modal = document.getElementById('result-modal');
        const content = document.getElementById('result-content');
        const title = document.getElementById('result-modal-title');
        
        if (!modal || !content || !title) return;

        const target = this.currentTarget;

        if (won) {
            title.textContent = 'Congratulations!';
            content.innerHTML = `
                <div class="result-header">
                    <p>You found the mystery mammal in ${this.guesses.length} ${this.guesses.length === 1 ? 'guess' : 'guesses'}!</p>
                </div>
            `;
        } else {
            title.textContent = 'Better luck next time!';
            content.innerHTML = `
                <div class="result-header">
                    <p>The Mystery Mammal was…</p>
                </div>
            `;
        }
        
        content.innerHTML += `
            <div class="result-target">
                <div class="result-target-image info-link" role="button" tabindex="0"
                     onclick="game.showMammalInfo(game.currentTarget);"
                     onkeydown="if(event.key==='Enter'||event.key===' '){game.showMammalInfo(game.currentTarget);}">
                    <img src="${getPrimaryImageUrl(target) || 'placeholder.jpg'}" 
                        alt="${target.common_name}"
                        onerror="this.onerror=null; this.src='placeholder.jpg';">
                </div>
                <div class="result-target-info">
                    <h3 class="info-link" role="button" tabindex="0"
                        onclick="game.showMammalInfo(game.currentTarget);"
                        onkeydown="if(event.key==='Enter'||event.key===' '){game.showMammalInfo(game.currentTarget);}">
                        ${target.common_name}
                    </h3>
                    <p><em>${target.scientific_name}</em></p>
                    <p>Family: ${target.family}</p>
                    <p>Order: ${target.order}</p>
                </div>
            </div>
            
            ${this.guesses.length > 0 ? `
            <div class="result-summary">
                <h4>Your Guesses:</h4>
                <div class="result-guesses">
                    ${this.guesses.map((guess, index) => `
                        <div class="result-guess ${this.getScoreClass(guess.score)}" data-mammal-name="${guess.mammal.common_name}" style="cursor: pointer;">
                            <span>${guess.mammal.common_name}</span>
                            <span>${guess.score}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            <div class="result-actions">
                <button class="btn btn-primary" onclick="game.startNewGame(); hideModal('result-modal'); showScreen('game-screen');">
                    Play Again
                </button>
                <button class="btn btn-secondary" onclick="game.showRoundTreeModal();">
                    View Round Graph
                </button>
                <button class="btn btn-secondary" onclick="hideModal('result-modal'); showScreen('home-screen');">
                    Main Menu
                </button>
            </div>
        `;
        
        modal.style.display = 'flex';
        
        // Add click listeners to result guesses
        const self = this;
        const guessesData = this.guesses;
        setTimeout(() => {
            const guessElements = document.querySelectorAll('.result-guess[data-mammal-name]');
            guessElements.forEach((element, index) => {
                element.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const mammal = guessesData[index].mammal;
                    if (mammal) {
                        self.showMammalInfo(mammal);
                        // Increase z-index to show above result modal
                        document.getElementById('mammal-info-modal').style.zIndex = '1300';
                    }
                });
            });
        }, 0);

        this.enterPostResultMode();
    }

    showHint() {
        if (!this.currentTarget) return;
        
        const hints = [
            `This mammal belongs to the order ${this.currentTarget.order}`,
            `This mammal is from the family ${this.currentTarget.family}`,
            `The scientific name starts with "${this.currentTarget.scientific_name.charAt(0)}"`,
            `The common name contains ${this.currentTarget.common_name.length} characters`
        ];
        
        const usedGuesses = this.currentGuess - 1;
        const availableHints = Math.min(usedGuesses, hints.length);
        
        if (availableHints > 0) {
            const hint = hints[availableHints - 1];
            alert(`Hint: ${hint}`);
        } else {
            alert('Make a guess first to unlock hints!');
        }
    }

    showError(message) {
        alert(`Error: ${message}`);
    }

    resetGame() {
        this.clearGuessDisplays();
        
        // Clear image container
        const imageContainer = document.getElementById('imagecontainer');
        if (imageContainer) {
            imageContainer.style.backgroundImage = '';
        }
        
        // Hide any active modals
        const modalIds = ['resultModal', 'result-modal'];
        modalIds.forEach(id => {
            const modal = document.getElementById(id);
            if (modal) {
                modal.style.display = 'none';
            }
        });
        
        // Start new game
        this.startNewGame();
    }
}

// Global functions for UI interaction
function showScreen(screenId) {
    if (!game) {
        ensureGameInitialized();
    }

    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    document.getElementById(screenId).classList.add('active');
    
    if (screenId === 'game-screen' && game.gameState !== 'playing') {
        game.startNewGame();
    }
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Initialize game when page loads
let game;

function ensureGameInitialized() {
    if (!game) {
        game = new MammalMysteryGame();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureGameInitialized);
} else {
    ensureGameInitialized();
}

// Expose showMammalInfo as window.showInfoModal for D3 chart interactivity
window.showInfoModal = function(id) {
    // Find the mammal by id from loaded data
    if (!Array.isArray(game.mammals)) return;
    const mammal = game.mammals.find(m => m.id === id);
    if (mammal) {
        game.showMammalInfo(mammal);
    }
};