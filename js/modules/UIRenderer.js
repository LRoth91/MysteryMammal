/**
 * UIRenderer.js
 * Module for UI rendering and DOM manipulation
 */

import { getPrimaryImageUrl } from './MammalData.js';

/**
 * UIRenderer class handles all DOM manipulation and UI updates
 */
export class UIRenderer {
    constructor() {
        this.previewTimeout = null;
    }

    // ==================== Screen Management ====================

    /**
     * Show a specific screen
     * @param {string} screenId - ID of the screen to show
     */
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
        }
    }

    // ==================== Modal Management ====================

    /**
     * Show a modal
     * @param {string} modalId - ID of the modal
     */
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    /**
     * Hide a modal
     * @param {string} modalId - ID of the modal
     */
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Show mammal info in a modal
     * @param {Object} mammal - Mammal data object
     */
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

    // ==================== Image Preview ====================

    /**
     * Show image preview on hover
     * @param {Object} mammal - Mammal data
     */
    showPreview(mammal) {
        const imageContainer = document.getElementById('imagecontainer');
        if (!imageContainer) return;
        
        imageContainer.classList.add('loading');
        const imageUrl = getPrimaryImageUrl(mammal);
        const fallbackDataUrl = "url('placeholder.jpg')";
        
        if (!imageUrl) {
            imageContainer.style.backgroundImage = fallbackDataUrl;
            imageContainer.classList.remove('loading');
            return;
        }
        
        const img = new Image();
        
        img.onload = () => {
            imageContainer.style.backgroundImage = `url('${imageUrl}')`;
            imageContainer.classList.remove('loading');
        };
        
        img.onerror = () => {
            imageContainer.style.backgroundImage = fallbackDataUrl;
            imageContainer.classList.remove('loading');
        };
        
        img.src = imageUrl;
    }

    /**
     * Hide image preview
     */
    hidePreview() {
        const imageContainer = document.getElementById('imagecontainer');
        if (!imageContainer) return;
        
        imageContainer.style.backgroundImage = '';
        imageContainer.classList.remove('loading');
    }

    /**
     * Preload images for better performance
     * @param {Object[]} mammals - Array of mammals
     * @param {number} count - Number of images to preload
     */
    preloadImages(mammals, count = 20) {
        const imagesToPreload = mammals.slice(0, count);
        
        imagesToPreload.forEach(mammal => {
            const imageUrl = getPrimaryImageUrl(mammal);
            if (imageUrl) {
                const img = new Image();
                img.src = imageUrl;
            }
        });
    }

    // ==================== Game UI ====================

    /**
     * Update the guess counter and progress bar
     * @param {number} currentGuess 
     * @param {number} maxGuesses 
     */
    updateGuessCounter(currentGuess, maxGuesses) {
        const guessCounter = document.getElementById('guess-counter');
        const progressFill = document.getElementById('progress-fill');
        
        if (guessCounter) {
            guessCounter.textContent = `Guess ${currentGuess} of ${maxGuesses}`;
        }
        
        if (progressFill) {
            const progress = ((currentGuess - 1) / maxGuesses) * 100;
            progressFill.style.width = `${progress}%`;
        }
    }

    /**
     * Clear all guess displays
     * @param {number} maxGuesses 
     */
    clearGuessDisplays(maxGuesses) {
        for (let i = 1; i <= maxGuesses; i++) {
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

    /**
     * Update a guess display slot
     * @param {number} guessNumber 
     * @param {Object} mammal 
     * @param {number} score 
     * @param {Function} onHover 
     * @param {Function} onClick 
     */
    updateGuessDisplay(guessNumber, mammal, score, onHover, onClick) {
        const guessElement = document.getElementById(`try${guessNumber}`);
        const distanceElement = document.getElementById(`distance${guessNumber}`);
        
        if (guessElement) {
            guessElement.innerHTML = '';
            
            const mammalCard = document.createElement('div');
            mammalCard.className = 'guessed-mammal-card';
            mammalCard.textContent = mammal.common_name;
            mammalCard.style.cursor = 'pointer';
            mammalCard.title = `Click to view ${mammal.common_name} details`;
            
            if (onHover) {
                mammalCard.addEventListener('mouseenter', () => onHover(mammal));
                mammalCard.addEventListener('mouseleave', () => this.hidePreview());
            }
            
            if (onClick) {
                mammalCard.addEventListener('click', () => onClick(mammal));
            }
            
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
    }

    /**
     * Populate the options grid with mammal buttons
     * @param {Object[]} options - Array of mammal options
     * @param {Set} guessedIds - Set of already guessed IDs
     * @param {Object} callbacks - Callback functions { onHover, onLeave, onClick }
     * @returns {Map} Map of mammal ID to button element
     */
    populateOptions(options, guessedIds, callbacks) {
        const optionsGrid = document.getElementById('options-grid');
        if (!optionsGrid) return new Map();
        
        optionsGrid.innerHTML = '';
        const buttonMap = new Map();
        
        const sortedOptions = [...options].sort((a, b) => 
            a.common_name.localeCompare(b.common_name)
        );
        
        sortedOptions.forEach(mammal => {
            const button = document.createElement('button');
            button.textContent = mammal.common_name;
            buttonMap.set(mammal.id, button);
            
            if (guessedIds.has(mammal.id)) {
                button.disabled = true;
                button.classList.add('used-option');
            }
            
            if (callbacks.onHover) {
                button.addEventListener('mouseenter', () => callbacks.onHover(mammal));
            }
            if (callbacks.onLeave) {
                button.addEventListener('mouseleave', callbacks.onLeave);
            }
            if (callbacks.onClick) {
                button.addEventListener('click', () => callbacks.onClick(mammal));
            }
            
            optionsGrid.appendChild(button);
        });
        
        return buttonMap;
    }

    /**
     * Remove an option button from the grid
     * @param {*} mammalId 
     * @param {Map} buttonMap 
     */
    removeOption(mammalId, buttonMap) {
        const button = buttonMap.get(mammalId);
        if (button) {
            button.disabled = true;
            button.classList.add('used-option');
            button.remove();
            buttonMap.delete(mammalId);
        }
    }

    /**
     * Enter post-result mode (show action buttons instead of options)
     * @param {Object} callbacks - Button click callbacks
     */
    enterPostResultMode(callbacks) {
        const optionsGrid = document.getElementById('options-grid');
        if (!optionsGrid) return;

        optionsGrid.classList.add('post-result-mode');
        optionsGrid.innerHTML = `
            <p class="post-result-note">Round complete! Choose what you would like to do next.</p>
            <div class="post-result-grid">
                <button class="btn btn-primary" id="post-play-again">Play Again</button>
                <button class="btn btn-secondary" id="post-view-graph">View Round Graph</button>
                <button class="btn btn-secondary" id="post-main-menu">Main Menu</button>
                <button class="btn btn-secondary view-results-btn" id="post-view-results">View Results</button>
            </div>
        `;

        // Attach callbacks
        if (callbacks.onPlayAgain) {
            document.getElementById('post-play-again')?.addEventListener('click', callbacks.onPlayAgain);
        }
        if (callbacks.onViewGraph) {
            document.getElementById('post-view-graph')?.addEventListener('click', callbacks.onViewGraph);
        }
        if (callbacks.onMainMenu) {
            document.getElementById('post-main-menu')?.addEventListener('click', callbacks.onMainMenu);
        }
        if (callbacks.onViewResults) {
            document.getElementById('post-view-results')?.addEventListener('click', callbacks.onViewResults);
        }
    }

    /**
     * Exit post-result mode
     */
    exitPostResultMode() {
        const optionsGrid = document.getElementById('options-grid');
        if (optionsGrid) {
            optionsGrid.classList.remove('post-result-mode');
        }
    }

    // ==================== Result Modal ====================

    /**
     * Show the game result modal
     * @param {boolean} won - Whether the player won
     * @param {Object} target - Target mammal
     * @param {Object[]} guesses - Array of guesses
     * @param {Object} callbacks - Callback functions
     */
    showResultModal(won, target, guesses, callbacks) {
        const modal = document.getElementById('result-modal');
        const content = document.getElementById('result-content');
        const title = document.getElementById('result-modal-title');
        
        if (!modal || !content || !title) return;

        if (won) {
            title.textContent = 'Congratulations!';
            content.innerHTML = `
                <div class="result-header">
                    <p>You found the mystery mammal in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}!</p>
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
                <div class="result-target-image info-link" role="button" tabindex="0" id="result-target-image">
                    <img src="${getPrimaryImageUrl(target) || 'placeholder.jpg'}" 
                        alt="${target.common_name}"
                        onerror="this.onerror=null; this.src='placeholder.jpg';">
                </div>
                <div class="result-target-info">
                    <h3 class="info-link" role="button" tabindex="0" id="result-target-name">
                        ${target.common_name}
                    </h3>
                    <p><em>${target.scientific_name}</em></p>
                    <p>Family: ${target.family}</p>
                    <p>Order: ${target.order}</p>
                </div>
            </div>
            
            ${guesses.length > 0 ? `
            <div class="result-summary">
                <h4>Your Guesses:</h4>
                <div class="result-guesses">
                    ${guesses.map((guess, index) => `
                        <div class="result-guess ${this.getScoreClass(guess.score)}" 
                             data-guess-index="${index}" 
                             style="cursor: pointer;">
                            <span>${guess.mammal.common_name}</span>
                            <span>${guess.score}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            <div class="result-actions">
                <button class="btn btn-primary" id="result-play-again">Play Again</button>
                <button class="btn btn-secondary" id="result-view-graph">View Round Graph</button>
                <button class="btn btn-secondary" id="result-main-menu">Main Menu</button>
            </div>
        `;
        
        modal.style.display = 'flex';
        
        // Attach event listeners
        if (callbacks.onTargetClick) {
            document.getElementById('result-target-image')?.addEventListener('click', callbacks.onTargetClick);
            document.getElementById('result-target-name')?.addEventListener('click', callbacks.onTargetClick);
        }
        
        if (callbacks.onPlayAgain) {
            document.getElementById('result-play-again')?.addEventListener('click', callbacks.onPlayAgain);
        }
        if (callbacks.onViewGraph) {
            document.getElementById('result-view-graph')?.addEventListener('click', callbacks.onViewGraph);
        }
        if (callbacks.onMainMenu) {
            document.getElementById('result-main-menu')?.addEventListener('click', callbacks.onMainMenu);
        }
        
        // Attach click handlers to guesses
        if (callbacks.onGuessClick) {
            document.querySelectorAll('.result-guess[data-guess-index]').forEach(element => {
                element.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const index = parseInt(element.dataset.guessIndex, 10);
                    if (!isNaN(index) && guesses[index]) {
                        callbacks.onGuessClick(guesses[index].mammal);
                    }
                });
            });
        }
    }

    /**
     * Get CSS class for a score
     * @param {number} score 
     * @returns {string}
     */
    getScoreClass(score) {
        if (score === null || score === undefined) return 'medium-match';
        if (score === 100) return 'perfect-match';
        if (score >= 70) return 'close-match';
        if (score >= 40) return 'medium-match';
        return 'distant-match';
    }

    // ==================== Gallery ====================

    /**
     * Populate the gallery with mammals grouped by order
     * @param {Object} groupedMammals - Mammals grouped by order
     * @param {Function} onClick - Click handler for mammal cards
     */
    populateGallery(groupedMammals, onClick) {
        const galleryContent = document.getElementById('gallery-content');
        if (!galleryContent) return;
        
        galleryContent.innerHTML = '';
        
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
                
                mammalCard.addEventListener('click', () => onClick(mammal));
                mammalGrid.appendChild(mammalCard);
            });
            
            orderSection.appendChild(mammalGrid);
            galleryContent.appendChild(orderSection);
        });
    }

    /**
     * Populate filter dropdowns
     * @param {string[]} orders - Unique orders
     * @param {string[]} families - Unique families
     */
    populateFilterDropdowns(orders, families) {
        const orderFilter = document.getElementById('order-filter');
        const familyFilter = document.getElementById('family-filter');
        
        if (orderFilter) {
            orderFilter.innerHTML = '<option value="">All Orders</option>';
            orders.forEach(order => {
                const option = document.createElement('option');
                option.value = order;
                option.textContent = order;
                orderFilter.appendChild(option);
            });
        }
        
        if (familyFilter) {
            familyFilter.innerHTML = '<option value="">All Families</option>';
            families.forEach(family => {
                const option = document.createElement('option');
                option.value = family;
                option.textContent = family;
                familyFilter.appendChild(option);
            });
        }
    }

    /**
     * Update family filter based on selected order
     * @param {string[]} families - Families for the selected order
     * @param {string} currentFamily - Currently selected family
     */
    updateFamilyFilter(families, currentFamily) {
        const familyFilter = document.getElementById('family-filter');
        if (!familyFilter) return;
        
        familyFilter.innerHTML = '<option value="">All Families</option>';
        families.forEach(family => {
            const option = document.createElement('option');
            option.value = family;
            option.textContent = family;
            familyFilter.appendChild(option);
        });
        
        if (currentFamily && families.includes(currentFamily)) {
            familyFilter.value = currentFamily;
        }
    }

    /**
     * Filter gallery cards
     * @param {string} searchTerm 
     * @param {string} selectedOrder 
     * @param {string} selectedFamily 
     */
    filterGallery(searchTerm, selectedOrder, selectedFamily) {
        const galleryContent = document.getElementById('gallery-content');
        if (!galleryContent) return;
        
        const cards = galleryContent.querySelectorAll('.gallery-mammal-card');
        const sections = galleryContent.querySelectorAll('.gallery-order-section');
        
        cards.forEach(card => {
            const commonName = card.dataset.commonName || '';
            const scientificName = card.dataset.scientificName || '';
            const order = card.dataset.order || '';
            const family = card.dataset.family || '';
            
            const matchesSearch = searchTerm === '' || 
                                  commonName.includes(searchTerm) || 
                                  scientificName.includes(searchTerm);
            const matchesOrder = selectedOrder === '' || order === selectedOrder;
            const matchesFamily = selectedFamily === '' || family === selectedFamily;
            
            card.style.display = (matchesSearch && matchesOrder && matchesFamily) ? 'block' : 'none';
        });
        
        // Hide empty sections
        sections.forEach(section => {
            const visibleCards = Array.from(section.querySelectorAll('.gallery-mammal-card'))
                .filter(card => card.style.display !== 'none');
            section.style.display = visibleCards.length > 0 ? 'block' : 'none';
        });
    }
}
