/**
 * main.js
 * Entry point for the Mammal Mystery Game
 * 
 * This file initializes the game and exposes global functions for HTML event handlers.
 */

import { MammalMysteryGame } from './modules/MammalMysteryGame.js';

// Global game instance
let game = null;

/**
 * Ensure the game is initialized
 */
function ensureGameInitialized() {
    if (!game) {
        game = new MammalMysteryGame();
        game.init();
    }
    return game;
}

// ==================== Global Functions for HTML ====================

/**
 * Show a specific screen
 * @param {string} screenId - ID of the screen to show
 */
window.showScreen = function(screenId) {
    const g = ensureGameInitialized();
    
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('active');
    }
    
    if (screenId === 'game-screen' && g.gameState !== 'playing') {
        g.startNewGame();
    }
};

/**
 * Show a modal
 * @param {string} modalId - ID of the modal
 */
window.showModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
};

/**
 * Hide a modal
 * @param {string} modalId - ID of the modal
 */
window.hideModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
};

/**
 * Show mammal info modal by ID (used by D3 chart)
 * @param {*} id - Mammal ID
 */
window.showInfoModal = function(id) {
    const g = ensureGameInitialized();
    const mammal = g.mammalLookup.getById(id);
    if (mammal) {
        g.ui.showMammalInfo(mammal);
    }
};

// ==================== Expose game instance ====================

// Make game accessible globally for debugging and HTML onclick handlers
Object.defineProperty(window, 'game', {
    get: () => ensureGameInitialized()
});

// ==================== Initialize on DOM Ready ====================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureGameInitialized);
} else {
    ensureGameInitialized();
}

export { game };
