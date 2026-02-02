/**
 * MammalMysteryGame.js
 * Main game class that orchestrates all modules
 */

import { PhylogeneticDistanceCalculator } from './PhyloCalculator.js';
import { 
    loadMammalData, 
    MammalLookup, 
    weightedSample, 
    calculateTaxonomicScore,
    getPrimaryImageUrl 
} from './MammalData.js';
import { UIRenderer } from './UIRenderer.js';
import { ChartRenderer } from './ChartRenderer.js';

// Configuration
const CONFIG = {
    TREE_FILE: './FBD-tree.tre',
    DATA_FILE: './mammal_data.json',
    MAX_GUESSES: 10,
    OPTIONS_COUNT: 45,
    TRANSFORM_MODE: 'log'
};

/**
 * Main game class
 */
export class MammalMysteryGame {
    constructor() {
        // Game state
        this.currentTarget = null;
        this.gameOptions = [];
        this.guesses = [];
        this.currentGuess = 1;
        this.gameState = 'home'; // 'home', 'playing', 'finished'
        this.guessedIds = new Set();
        this.optionButtons = new Map();
        this.postResultModeActive = false;

        // Modules
        this.mammalLookup = new MammalLookup();
        this.phyloCalculator = new PhylogeneticDistanceCalculator();
        this.ui = new UIRenderer();
        this.chartRenderer = new ChartRenderer();

        // Configure transform mode
        try {
            this.phyloCalculator.setTransformMode(CONFIG.TRANSFORM_MODE);
        } catch (e) {
            console.warn('Failed to set transform mode:', e);
        }
    }

    /**
     * Initialize the game
     */
    async init() {
        try {
            // Load mammal data
            const mammals = await loadMammalData(CONFIG.DATA_FILE);
            this.mammalLookup.initialize(mammals);
            console.log(`Loaded ${mammals.length} mammals`);

            // Load phylogenetic tree in background
            const allSpeciesNames = this.mammalLookup.getAllScientificNames();
            this.phyloCalculator.loadTree(CONFIG.TREE_FILE, allSpeciesNames)
                .then(() => console.log('Phylogenetic tree loaded successfully!'))
                .catch(error => console.warn('Failed to load phylogenetic tree:', error));

            // Setup UI
            this.setupEventListeners();
            this.populateGallery();
            this.populateFilterDropdowns();

        } catch (error) {
            console.error('Error initializing game:', error);
            this.ui.showModal('error-modal');
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Play again button
        document.getElementById('playAgainBtn')?.addEventListener('click', () => this.resetGame());

        // Gallery search
        document.getElementById('gallery-search')?.addEventListener('input', () => this.filterGallery());

        // Gallery filters
        document.getElementById('order-filter')?.addEventListener('change', () => {
            this.updateFamilyFilter();
            this.filterGallery();
        });
        document.getElementById('family-filter')?.addEventListener('change', () => this.filterGallery());

        // Modal close on background click
        window.addEventListener('click', (e) => {
            if (e.target.id === 'resultModal') {
                this.resetGame();
            }
            if (e.target.id === 'result-modal') {
                this.ui.hideModal('result-modal');
            }
            if (e.target.id === 'round-tree-modal') {
                this.ui.hideModal('round-tree-modal');
            }
        });

        // Tree modal close button
        document.getElementById('round-tree-close')?.addEventListener('click', () => {
            this.ui.hideModal('round-tree-modal');
        });

        // Start logo animation
        this.startLogoCardAnimation();
    }

    /**
     * Start a new game
     */
    startNewGame() {
        // Reset state
        this.guesses = [];
        this.currentGuess = 1;
        this.gameState = 'playing';
        this.guessedIds.clear();
        this.optionButtons.clear();
        this.exitPostResultMode();

        // Select target and options
        this.currentTarget = this.selectWeightedTarget();
        this.gameOptions = weightedSample(this.mammalLookup.getAll(), CONFIG.OPTIONS_COUNT);

        // Ensure target is in options
        if (!this.gameOptions.find(m => m.id === this.currentTarget.id)) {
            const replaceIndex = Math.floor(Math.random() * this.gameOptions.length);
            this.gameOptions[replaceIndex] = this.currentTarget;
        }

        // Configure phylogenetic calculator for this round
        if (this.phyloCalculator) {
            const allowedNames = this.gameOptions
                .map(m => m.scientific_name)
                .filter(Boolean);
            this.phyloCalculator.configureRound(allowedNames, this.currentTarget.scientific_name);
        }

        // Update UI
        this.ui.updateGuessCounter(this.currentGuess, CONFIG.MAX_GUESSES);
        this.ui.clearGuessDisplays(CONFIG.MAX_GUESSES);
        this.populateOptions();

        console.log('New game started. Target:', this.currentTarget.common_name);
    }

    /**
     * Select a weighted random target
     */
    selectWeightedTarget() {
        const [mammal] = weightedSample(this.mammalLookup.getAll(), 1);
        return mammal || this.mammalLookup.getAll()[Math.floor(Math.random() * this.mammalLookup.getAll().length)];
    }

    /**
     * Make a guess
     * @param {Object} mammal - Guessed mammal
     */
    makeGuess(mammal) {
        if (this.gameState !== 'playing' || this.currentGuess > CONFIG.MAX_GUESSES) {
            return;
        }

        // Prevent duplicate guesses
        if (this.guessedIds.has(mammal.id)) {
            return;
        }

        this.guessedIds.add(mammal.id);

        // Calculate similarity
        const similarity = this.calculateSimilarity(mammal, this.currentTarget);

        const guess = {
            mammal,
            ...similarity,
            guessNumber: this.currentGuess
        };

        this.guesses.push(guess);
        this.removeOptionFromPool(mammal.id);

        // Update UI
        this.ui.updateGuessDisplay(
            this.currentGuess,
            mammal,
            similarity.score,
            (m) => this.ui.showPreview(m),
            (m) => this.ui.showMammalInfo(m)
        );

        // Check win condition
        if (mammal.id === this.currentTarget.id) {
            this.endGame(true);
            return;
        }

        // Check lose condition
        if (this.currentGuess >= CONFIG.MAX_GUESSES) {
            this.endGame(false);
            return;
        }

        this.currentGuess++;
        this.ui.updateGuessCounter(this.currentGuess, CONFIG.MAX_GUESSES);
    }

    /**
     * Calculate similarity between two mammals
     */
    calculateSimilarity(mammal1, mammal2) {
        if (mammal1.id === mammal2.id) {
            return { distance: 0, score: 100, source: 'exact' };
        }

        // Try phylogenetic distance first
        if (this.phyloCalculator?.isLoaded) {
            const species1 = mammal1.scientific_name;
            const species2 = mammal2.scientific_name;

            if (species1 && species2) {
                const metrics = this.phyloCalculator.getPhylogeneticDistance(species1, species2);
                if (metrics !== null) {
                    const score = this.phyloCalculator.distanceToScore(metrics.raw);
                    console.log(`Phylogenetic: ${species1} ↔ ${species2}: raw=${metrics.raw.toFixed(4)}, score=${score}`);
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

        // Fallback to taxonomic similarity
        const score = calculateTaxonomicScore(mammal1, mammal2);
        return { distance: null, rawDistance: null, edgeCount: null, score, source: 'taxonomic' };
    }

    /**
     * End the game
     */
    endGame(won) {
        this.gameState = 'finished';

        setTimeout(() => {
            this.showResultModal(won);
        }, 500);
    }

    /**
     * Show the result modal
     */
    showResultModal(won) {
        this.ui.showResultModal(won, this.currentTarget, this.guesses, {
            onTargetClick: () => this.ui.showMammalInfo(this.currentTarget),
            onPlayAgain: () => {
                this.ui.hideModal('result-modal');
                this.startNewGame();
            },
            onViewGraph: () => this.showRoundTreeModal(),
            onMainMenu: () => {
                this.ui.hideModal('result-modal');
                this.ui.showScreen('home-screen');
            },
            onGuessClick: (mammal) => {
                this.ui.showMammalInfo(mammal);
                // Ensure info modal appears above result modal
                const infoModal = document.getElementById('mammal-info-modal');
                if (infoModal) infoModal.style.zIndex = '1300';
            }
        });

        this.enterPostResultMode();
    }

    /**
     * Show the round tree/histogram modal
     */
    showRoundTreeModal() {
        const modal = document.getElementById('round-tree-modal');
        const container = document.getElementById('round-tree-svg');
        if (!modal || !container) return;

        container.innerHTML = '';

        this.chartRenderer.renderDistanceHistogram({
            gameOptions: this.gameOptions,
            target: this.currentTarget,
            guessedIds: this.guessedIds,
            guesses: this.guesses,
            getDistance: (s1, s2) => this.phyloCalculator.getPhylogeneticDistance(s1, s2),
            distanceToScore: (d) => this.phyloCalculator.distanceToScore(d),
            onBarClick: (id) => {
                const mammal = this.mammalLookup.getById(id);
                if (mammal) this.ui.showMammalInfo(mammal);
            }
        }, container);

        modal.style.display = 'flex';
    }

    /**
     * Populate game options
     */
    populateOptions() {
        this.ui.preloadImages(this.gameOptions);

        this.optionButtons = this.ui.populateOptions(
            this.gameOptions,
            this.guessedIds,
            {
                onHover: (mammal) => this.ui.showPreview(mammal),
                onLeave: () => this.ui.hidePreview(),
                onClick: (mammal) => {
                    if (this.gameState === 'playing') {
                        this.makeGuess(mammal);
                    }
                }
            }
        );
    }

    /**
     * Remove an option from the pool
     */
    removeOptionFromPool(mammalId) {
        this.gameOptions = this.gameOptions.filter(o => o.id !== mammalId);
        this.ui.removeOption(mammalId, this.optionButtons);
    }

    /**
     * Enter post-result mode
     */
    enterPostResultMode() {
        if (this.postResultModeActive) return;
        this.postResultModeActive = true;

        this.ui.enterPostResultMode({
            onPlayAgain: () => {
                this.ui.hideModal('result-modal');
                this.startNewGame();
            },
            onViewGraph: () => this.showRoundTreeModal(),
            onMainMenu: () => {
                this.ui.hideModal('result-modal');
                this.ui.showScreen('home-screen');
            },
            onViewResults: () => this.ui.showModal('result-modal')
        });
    }

    /**
     * Exit post-result mode
     */
    exitPostResultMode() {
        if (!this.postResultModeActive) return;
        this.postResultModeActive = false;
        this.ui.exitPostResultMode();
    }

    /**
     * Reset and start a new game
     */
    resetGame() {
        this.ui.clearGuessDisplays(CONFIG.MAX_GUESSES);
        this.ui.hidePreview();
        this.ui.hideModal('resultModal');
        this.ui.hideModal('result-modal');
        this.startNewGame();
    }

    // ==================== Gallery Methods ====================

    populateGallery() {
        const grouped = this.mammalLookup.getGroupedByOrder();
        this.ui.populateGallery(grouped, (mammal) => this.ui.showMammalInfo(mammal));
    }

    populateFilterDropdowns() {
        const orders = this.mammalLookup.getUniqueOrders();
        const families = this.mammalLookup.getUniqueFamilies();
        this.ui.populateFilterDropdowns(orders, families);
    }

    updateFamilyFilter() {
        const orderFilter = document.getElementById('order-filter');
        const familyFilter = document.getElementById('family-filter');
        if (!orderFilter || !familyFilter) return;

        const selectedOrder = orderFilter.value;
        const currentFamily = familyFilter.value;
        const families = this.mammalLookup.getUniqueFamilies(selectedOrder || null);

        this.ui.updateFamilyFilter(families, currentFamily);
    }

    filterGallery() {
        const searchInput = document.getElementById('gallery-search');
        const orderFilter = document.getElementById('order-filter');
        const familyFilter = document.getElementById('family-filter');

        const searchTerm = searchInput?.value.toLowerCase() || '';
        const selectedOrder = orderFilter?.value || '';
        const selectedFamily = familyFilter?.value || '';

        this.ui.filterGallery(searchTerm, selectedOrder, selectedFamily);
    }

    // ==================== Hints ====================

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
            alert(`Hint: ${hints[availableHints - 1]}`);
        } else {
            alert('Make a guess first to unlock hints!');
        }
    }

    // ==================== Logo Animation ====================

    startLogoCardAnimation() {
        const logoSvg = document.querySelector('.logo-svg');
        if (!logoSvg || logoSvg.tagName.toLowerCase() === 'img') return;

        const injectAnimationStyles = (svgDoc) => {
            if (svgDoc.getElementById('card-flip-styles')) return;

            const style = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'style');
            style.id = 'card-flip-styles';
            // Use scaleX-based flip animation instead of 3D rotateY for better
            // cross-browser SVG compatibility (Chrome handles perspective() poorly in SVG)
            style.textContent = `
                @keyframes cardFlip {
                    0% { 
                        transform: scaleX(1);
                    }
                    50% { 
                        transform: scaleX(-1);
                    }
                    100% { 
                        transform: scaleX(1);
                    }
                }
                @keyframes showBack {
                    0%, 24% { 
                        opacity: 0;
                    }
                    25%, 75% { 
                        opacity: 1;
                    }
                    76%, 100% { 
                        opacity: 0;
                    }
                }
                @keyframes showFront {
                    0%, 24% { 
                        opacity: 1;
                    }
                    25%, 75% { 
                        opacity: 0;
                    }
                    76%, 100% { 
                        opacity: 1;
                    }
                }
                .card-flipping {
                    animation: cardFlip 1.6s ease-in-out;
                    transform-origin: center center;
                    transform-box: fill-box;
                    will-change: transform;
                }
                .card-flipping .card-front {
                    animation: showFront 1.6s ease-in-out;
                }
                .card-flipping .card-back {
                    animation: showBack 1.6s ease-in-out;
                }
            `;
            svgDoc.documentElement.appendChild(style);
        };

        const animateRandomCard = () => {
            if (!logoSvg.contentDocument) return;

            const svgDoc = logoSvg.contentDocument;
            const cardGroups = Array.from(svgDoc.querySelectorAll('g[id]'))
                .filter(g => g.id?.toLowerCase().includes('card'));

            if (cardGroups.length === 0) return;

            const card = cardGroups[Math.floor(Math.random() * cardGroups.length)];
            card.classList.add('card-flipping');

            setTimeout(() => card.classList.remove('card-flipping'), 1600);
        };

        const startAnimation = () => {
            const svgDoc = logoSvg.contentDocument;
            if (!svgDoc) return;

            injectAnimationStyles(svgDoc);
            setTimeout(animateRandomCard, 1500);
            setInterval(animateRandomCard, 2000 + Math.random() * 1000);
        };

        logoSvg.addEventListener('load', startAnimation);
        if (logoSvg.contentDocument) startAnimation();
    }
}
