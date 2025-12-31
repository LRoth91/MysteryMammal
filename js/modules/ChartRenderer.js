/**
 * ChartRenderer.js
 * Module for D3-based chart visualization
 */

/**
 * ChartRenderer class handles D3 histogram visualization
 */
export class ChartRenderer {
    constructor() {
        this.d3Loaded = false;
    }

    /**
     * Ensure D3 is loaded
     * @returns {Promise<void>}
     */
    async ensureD3Loaded() {
        if (window.d3) {
            this.d3Loaded = true;
            return;
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://d3js.org/d3.v7.min.js';
            script.onload = () => {
                this.d3Loaded = true;
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load D3.js'));
            document.head.appendChild(script);
        });
    }

    /**
     * Render a distance histogram for the round
     * @param {Object} params - Rendering parameters
     * @param {Object[]} params.gameOptions - Available game options
     * @param {Object} params.target - Target mammal
     * @param {Set} params.guessedIds - Set of guessed mammal IDs
     * @param {Object[]} params.guesses - Array of guesses
     * @param {Function} params.getDistance - Function to get phylogenetic distance
     * @param {Function} params.distanceToScore - Function to convert distance to score
     * @param {Function} params.onBarClick - Click handler for bars
     * @param {HTMLElement} container - Container element
     */
    async renderDistanceHistogram(params, container) {
        const { gameOptions, target, guessedIds, guesses, getDistance, distanceToScore, onBarClick } = params;

        if (!container || !target || !gameOptions) {
            this.showEmptyMessage(container, 'Distance data is still loading. Please try again in a moment.');
            return;
        }

        // Build species data
        const speciesData = this.buildSpeciesData(gameOptions, target, guessedIds, guesses, getDistance, distanceToScore);
        
        if (speciesData.length === 0) {
            this.showEmptyMessage(container, 'No distance data available.');
            return;
        }

        // Ensure D3 is loaded
        await this.ensureD3Loaded();

        // Sort by score descending
        const sorted = speciesData
            .filter(x => x.dist !== null)
            .sort((a, b) => b.dist - a.dist);

        this.drawHistogram(sorted, container, onBarClick);
    }

    /**
     * Build species data array for the histogram
     */
    buildSpeciesData(gameOptions, target, guessedIds, guesses, getDistance, distanceToScore) {
        const speciesData = [];
        const guessedSet = new Set(guessedIds || []);

        // Add game options
        for (const mammal of gameOptions) {
            if (!mammal || !mammal.scientific_name) continue;
            
            const metrics = getDistance(target.scientific_name, mammal.scientific_name);
            const score = metrics ? distanceToScore(metrics.effective) : null;
            
            speciesData.push({
                name: mammal.common_name || mammal.scientific_name,
                id: mammal.id,
                dist: score,
                isTarget: mammal.id === target.id,
                isGuessed: guessedSet.has(mammal.id)
            });
        }

        // Add target if not present
        if (!speciesData.find(x => x.isTarget)) {
            speciesData.push({
                name: target.common_name || target.scientific_name,
                id: target.id,
                dist: 100,
                isTarget: true,
                isGuessed: false
            });
        }

        // Add any guessed species not in options
        if (Array.isArray(guesses)) {
            for (const g of guesses) {
                if (!g?.mammal?.id) continue;
                
                if (!speciesData.find(x => x.id === g.mammal.id)) {
                    let dist = null;
                    try {
                        const metrics = getDistance(target.scientific_name, g.mammal.scientific_name);
                        dist = metrics ? distanceToScore(metrics.effective) : null;
                    } catch (e) {
                        dist = null;
                    }
                    
                    speciesData.push({
                        name: g.mammal.common_name || g.mammal.scientific_name,
                        id: g.mammal.id,
                        dist: dist,
                        isTarget: g.mammal.id === target.id,
                        isGuessed: true
                    });
                }
            }
        }

        // Mark guessed entries
        speciesData.forEach(s => {
            s.isGuessed = guessedSet.has(s.id) || s.isGuessed;
        });

        return speciesData;
    }

    /**
     * Show empty/loading message
     */
    showEmptyMessage(container, message) {
        if (!container) return;
        container.innerHTML = '';
        
        const p = document.createElement('p');
        p.className = 'round-tree-empty';
        p.textContent = message;
        container.appendChild(p);
    }

    /**
     * Draw the D3 histogram
     */
    drawHistogram(data, container, onBarClick) {
        const d3 = window.d3;
        
        // Calculate dimensions
        const containerWidth = container?.clientWidth || 1000;
        const width = Math.min(1200, Math.max(640, containerWidth - 40));
        const margin = { 
            top: 40, 
            right: 60, 
            bottom: 40, 
            left: Math.max(220, Math.min(360, Math.floor(width * 0.34))) 
        };
        const barHeight = 28;
        const height = data.length * barHeight + margin.top + margin.bottom;

        // Clear container
        d3.select(container).selectAll('svg').remove();

        // Create SVG
        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height);

        // Scales
        const x = d3.scaleLinear()
            .domain([0, 100])
            .range([margin.left, width - margin.right]);

        const y = d3.scaleBand()
            .domain(data.map(d => d.name))
            .range([margin.top, height - margin.bottom])
            .padding(0.15);

        // Color function
        const barColor = (d) => {
            if (d.isTarget) return 'rgba(255,99,132,0.85)';
            if (d.value === 100) return 'rgba(255,99,132,0.7)';
            if (d.value >= 70) return 'rgba(76,175,80,0.7)';
            if (d.value >= 40) return 'rgba(255,193,7,0.7)';
            return 'rgba(244,67,54,0.7)';
        };

        // Draw bars
        svg.selectAll('.bar')
            .data(data)
            .enter()
            .append('rect')
            .attr('class', d => d.isGuessed ? 'bar guessed' : 'bar')
            .attr('x', x(0))
            .attr('y', d => y(d.name))
            .attr('width', d => x(d.dist) - x(0))
            .attr('height', y.bandwidth())
            .attr('fill', d => barColor({ ...d, value: d.dist }))
            .attr('stroke', d => d.isGuessed ? 'rgba(33,150,243,0.85)' : 'none')
            .attr('stroke-width', d => d.isGuessed ? 1.2 : 0)
            .attr('cursor', 'pointer')
            .style('pointer-events', 'all')
            .on('click', function(event, d) {
                event.stopPropagation();
                if (onBarClick) onBarClick(d.id);
            })
            .on('mouseover', function() {
                d3.select(this).attr('fill', 'orange');
            })
            .on('mouseout', function(event, d) {
                d3.select(this).attr('fill', barColor({ ...d, value: d.dist }));
            });

        // Draw labels
        svg.selectAll('.label')
            .data(data)
            .enter()
            .append('text')
            .attr('class', d => d.isGuessed ? 'label guessed-label' : 'label')
            .attr('x', margin.left - 8)
            .attr('y', d => y(d.name) + y.bandwidth() * 0.62)
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
                if (onBarClick) onBarClick(d.id);
            });

        // Draw score labels
        svg.selectAll('.score-label')
            .data(data)
            .enter()
            .append('text')
            .attr('class', 'score-label')
            .attr('x', d => {
                const rawX = x(d.dist) + 6;
                const maxX = width - margin.right - 12;
                return rawX > maxX ? maxX : rawX;
            })
            .attr('y', d => y(d.name) + y.bandwidth() / 2)
            .attr('alignment-baseline', 'middle')
            .attr('font-size', '14px')
            .attr('fill', '#333')
            .attr('text-anchor', d => (x(d.dist) + 6 > width - margin.right - 40) ? 'end' : 'start')
            .text(d => `${d.dist}%`);

        // X-axis
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

        // Title
        svg.append('text')
            .attr('x', width / 2)
            .attr('y', margin.top - 18)
            .attr('text-anchor', 'middle')
            .attr('font-size', '20px')
            .attr('font-weight', 'bold')
            .text('Similarity Scores to Target Species');
    }
}
