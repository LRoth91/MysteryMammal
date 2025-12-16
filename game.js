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
        
        this.init();
    }

    async init() {
        try {
            // Load mammal data
            const response = await fetch('mammals.json');
            this.mammals = await response.json();
            
            // Process mammals to add image_url property for backward compatibility
            this.mammals.forEach(mammal => {
                // Use first available image from image_urls array
                if (mammal.image_urls && mammal.image_urls.length > 0) {
                    mammal.image_url = mammal.image_urls[0];
                } else {
                    mammal.image_url = null;
                }
            });
            
            console.log(`Loaded ${this.mammals.length} mammals`);
            console.log(`Mammals with images: ${this.mammals.filter(m => m.image_url).length}`);
            
            // Initialize UI
            this.setupEventListeners();
            this.populateGallery();
            
        } catch (error) {
            console.error('Error loading mammal data:', error);
            // Fallback to sample data
            try {
                const sampleResponse = await fetch('mammals_sample.json');
                this.mammals = await sampleResponse.json();
                console.log(`Loaded sample data: ${this.mammals.length} mammals`);
                this.setupEventListeners();
                this.populateGallery();
            } catch (sampleError) {
                console.error('Error loading sample data:', sampleError);
                this.showError('Failed to load mammal data');
            }
        }
    }

    setupEventListeners() {
        // Search functionality
        const mammalSearch = document.getElementById('mammal-search');
        const gallerySearch = document.getElementById('gallery-search');
        
        if (mammalSearch) {
            mammalSearch.addEventListener('input', (e) => this.filterOptions(e.target.value));
        }
        
        if (gallerySearch) {
            gallerySearch.addEventListener('input', (e) => this.filterGallery(e.target.value));
        }

        // Modal functionality
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });
    }

    startNewGame() {
        // Reset game state
        this.guesses = [];
        this.currentGuess = 1;
        this.gameState = 'playing';
        
        // Select random target mammal (prioritize those with images)
        const mammalsWithImages = this.mammals.filter(m => m.image_url);
        if (mammalsWithImages.length > 0) {
            this.currentTarget = mammalsWithImages[Math.floor(Math.random() * mammalsWithImages.length)];
        } else {
            this.currentTarget = this.mammals[Math.floor(Math.random() * this.mammals.length)];
        }
        
        // Select random options for guessing (ensure target is included)
        this.gameOptions = this.getRandomOptions(50);
        if (!this.gameOptions.find(m => m.id === this.currentTarget.id)) {
            this.gameOptions[Math.floor(Math.random() * this.gameOptions.length)] = this.currentTarget;
        }
        
        // Update UI
        this.updateGameUI();
        this.populateOptions();
        
        console.log('New game started. Target:', this.currentTarget.common_name);
    }

    getRandomOptions(count) {
        const shuffled = [...this.mammals].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }

    calculateSimilarity(mammal1, mammal2) {
        if (mammal1.id === mammal2.id) return 100;
        
        let score = 0;
        
        // Order similarity (highest weight)
        if (mammal1.order === mammal2.order) {
            score += 40;
            
            // Family similarity (if same order)
            if (mammal1.family === mammal2.family) {
                score += 30;
            }
        }
        
        // Add some randomness for related species within families
        if (mammal1.family === mammal2.family) {
            score += Math.random() * 20;
        } else if (mammal1.order === mammal2.order) {
            score += Math.random() * 15;
        } else {
            score += Math.random() * 10;
        }
        
        return Math.min(Math.round(score), 99); // Cap at 99% (only exact match is 100%)
    }

    makeGuess(mammal) {
        if (this.gameState !== 'playing' || this.currentGuess > this.maxGuesses) {
            return;
        }

        const similarity = this.calculateSimilarity(mammal, this.currentTarget);
        
        const guess = {
            mammal: mammal,
            similarity: similarity,
            guessNumber: this.currentGuess
        };
        
        this.guesses.push(guess);
        
        // Check for win condition
        if (similarity === 100) {
            this.endGame(true);
            return;
        }
        
        // Check for lose condition
        if (this.currentGuess >= this.maxGuesses) {
            this.endGame(false);
            return;
        }
        
        this.currentGuess++;
        this.updateGameUI();
        this.addGuessToUI(guess);
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
        
        // Clear previous guesses
        const guessesGrid = document.getElementById('guesses-grid');
        if (guessesGrid) {
            guessesGrid.innerHTML = '';
        }
    }

    addGuessToUI(guess) {
        const guessesGrid = document.getElementById('guesses-grid');
        if (!guessesGrid) return;
        
        const guessCard = document.createElement('div');
        guessCard.className = `guess-card ${this.getSimilarityClass(guess.similarity)}`;
        
        guessCard.innerHTML = `
            <div class="guess-number">#${guess.guessNumber}</div>
            <div class="guess-image">
                <img src="${guess.mammal.image_url || 'placeholder.jpg'}" 
                     alt="${guess.mammal.common_name}"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><text y=\".9em\" font-size=\"90\">🦌</text></svg>'">
            </div>
            <div class="guess-info">
                <div class="guess-name">${guess.mammal.common_name}</div>
                <div class="guess-scientific">${guess.mammal.scientific_name}</div>
                <div class="guess-similarity">${guess.similarity}% similar</div>
            </div>
        `;
        
        guessCard.addEventListener('click', () => {
            this.showMammalInfo(guess.mammal);
        });
        
        guessesGrid.appendChild(guessCard);
        
        // Animate in
        setTimeout(() => {
            guessCard.classList.add('animate-in');
        }, 100);
    }

    getSimilarityClass(similarity) {
        if (similarity >= 80) return 'high-similarity';
        if (similarity >= 50) return 'medium-similarity';
        return 'low-similarity';
    }

    populateOptions() {
        const optionsGrid = document.getElementById('options-grid');
        if (!optionsGrid) return;
        
        optionsGrid.innerHTML = '';
        
        // Sort options alphabetically by common name
        const sortedOptions = [...this.gameOptions].sort((a, b) => 
            a.common_name.localeCompare(b.common_name)
        );
        
        sortedOptions.forEach(mammal => {
            const optionCard = document.createElement('div');
            optionCard.className = 'option-card';
            
            optionCard.innerHTML = `
                <div class="option-image">
                    <img src="${mammal.image_url || 'placeholder.jpg'}" 
                         alt="${mammal.common_name}"
                         loading="lazy"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><text y=\".9em\" font-size=\"90\">🦌</text></svg>'">
                </div>
                <div class="option-info">
                    <div class="option-name">${mammal.common_name}</div>
                    <div class="option-scientific">${mammal.scientific_name}</div>
                    <div class="option-family">${mammal.family}</div>
                </div>
            `;
            
            optionCard.addEventListener('click', () => {
                if (this.gameState === 'playing') {
                    this.makeGuess(mammal);
                }
            });
            
            optionsGrid.appendChild(optionCard);
        });
    }

    filterOptions(searchTerm) {
        const optionsGrid = document.getElementById('options-grid');
        if (!optionsGrid) return;
        
        const cards = optionsGrid.querySelectorAll('.option-card');
        
        cards.forEach(card => {
            const text = card.textContent.toLowerCase();
            const matches = text.includes(searchTerm.toLowerCase());
            card.style.display = matches ? 'block' : 'none';
        });
    }

    populateGallery() {
        const galleryContent = document.getElementById('gallery-content');
        if (!galleryContent) return;
        
        galleryContent.innerHTML = '';
        
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
                
                mammalCard.innerHTML = `
                    <div class="gallery-mammal-image">
                        <img src="${mammal.image_url || 'placeholder.jpg'}" 
                             alt="${mammal.common_name}"
                             loading="lazy"
                             onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><text y=\".9em\" font-size=\"90\">🦌</text></svg>'">
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

    filterGallery(searchTerm) {
        const galleryContent = document.getElementById('gallery-content');
        if (!galleryContent) return;
        
        const cards = galleryContent.querySelectorAll('.gallery-mammal-card');
        const sections = galleryContent.querySelectorAll('.gallery-order-section');
        
        cards.forEach(card => {
            const text = card.textContent.toLowerCase();
            const matches = text.includes(searchTerm.toLowerCase());
            card.style.display = matches ? 'block' : 'none';
        });
        
        // Hide empty sections
        sections.forEach(section => {
            const visibleCards = section.querySelectorAll('.gallery-mammal-card[style*="block"], .gallery-mammal-card:not([style])');
            const hasMatches = searchTerm === '' || visibleCards.length > 0;
            section.style.display = hasMatches ? 'block' : 'none';
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
                    <img src="${mammal.image_url || 'placeholder.jpg'}" 
                         alt="${mammal.common_name}"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><text y=\".9em\" font-size=\"90\">🦌</text></svg>'">
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
                    ${mammal.gbif_id ? `
                    <div class="info-row">
                        <strong>GBIF ID:</strong> ${mammal.gbif_id}
                    </div>
                    ` : ''}
                    <div class="external-links">
                        ${mammal.gbif_id ? `<a href="https://www.gbif.org/species/${mammal.gbif_id}" target="_blank" class="external-link">View on GBIF</a>` : ''}
                        ${mammal.inaturalist_id ? `<a href="https://www.inaturalist.org/taxa/${mammal.inaturalist_id}" target="_blank" class="external-link">View on iNaturalist</a>` : ''}
                    </div>
                </div>
            </div>
        `;
        
        modal.style.display = 'block';
    }

    showResultModal(won) {
        const modal = document.getElementById('result-modal');
        const content = document.getElementById('result-content');
        
        if (!modal || !content) return;
        
        const target = this.currentTarget;
        
        content.innerHTML = `
            <div class="result-header">
                <div class="result-icon">${won ? '🎉' : '😔'}</div>
                <h2>${won ? 'Congratulations!' : 'Game Over'}</h2>
                <p>${won ? `You found the mystery mammal in ${this.currentGuess - 1} guesses!` : 'Better luck next time!'}</p>
            </div>
            
            <div class="result-target">
                <div class="result-target-image">
                    <img src="${target.image_url || 'placeholder.jpg'}" 
                         alt="${target.common_name}"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><text y=\".9em\" font-size=\"90\">🦌</text></svg>'">
                </div>
                <div class="result-target-info">
                    <h3>${target.common_name}</h3>
                    <p><em>${target.scientific_name}</em></p>
                    <p>Family: ${target.family}</p>
                    <p>Order: ${target.order}</p>
                </div>
            </div>
            
            ${this.guesses.length > 0 ? `
            <div class="result-summary">
                <h4>Your Guesses:</h4>
                <div class="result-guesses">
                    ${this.guesses.map(guess => `
                        <div class="result-guess ${this.getSimilarityClass(guess.similarity)}">
                            <span>${guess.mammal.common_name}</span>
                            <span>${guess.similarity}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            <div class="result-actions">
                <button class="btn btn-primary" onclick="game.startNewGame(); hideModal('result-modal'); showScreen('game-screen');">
                    Play Again
                </button>
                <button class="btn btn-secondary" onclick="hideModal('result-modal'); showScreen('home-screen');">
                    Main Menu
                </button>
                <button class="btn btn-tertiary" onclick="game.showMammalInfo(game.currentTarget);">
                    Learn More
                </button>
            </div>
        `;
        
        modal.style.display = 'block';
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
}

// Global functions for UI interaction
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    document.getElementById(screenId).classList.add('active');
    
    if (screenId === 'game-screen' && game.gameState !== 'playing') {
        game.startNewGame();
    }
}

function showModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function hideModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Initialize game when page loads
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new MammalMysteryGame();
});