/**
 * ChartRenderer.js
 * Simple renderer for end-of-round ranking UI
 */

/**
 * ChartRenderer renders the end-of-round ranking list.
 */
export class ChartRenderer {
    constructor() {
    }

    /**
     * Render the end-of-round ranked list (target at top, unranked).
     * @param {Object} params
     * @param {Array} params.roundRanking - Array of { id, mammal, distance, source }
     * @param {Object} params.target
     * @param {Set} params.guessedIds
     * @param {Function} params.onItemClick
     * @param {HTMLElement} container
     */
    renderRoundRankingList(params, container) {
        const { roundRanking, target, guessedIds, onItemClick } = params || {};

        if (!container || !target || !Array.isArray(roundRanking) || roundRanking.length === 0) {
            this.showEmptyMessage(container, 'Ranking data is still loading. Please try again in a moment.');
            return;
        }

        const guessedSet = new Set(guessedIds || []);
        const totalRanks = Math.max(0, roundRanking.length - 1);

        container.innerHTML = '';

        const list = document.createElement('div');
        list.className = 'result-guesses round-ranking-guesses';

        roundRanking.forEach((row, index) => {
            const mammal = row?.mammal;
            const id = row?.id;
            if (!mammal || !id) return;

            const rank = (typeof row?.rank === 'number' && row.rank > 0) ? row.rank : (index + 1);
            const tieSize = (typeof row?.tieSize === 'number' && row.tieSize > 1) ? row.tieSize : 1;
            const isTarget = id === target.id;
            const isGuessed = guessedSet.has(id);

            const item = document.createElement('div');
            item.className = 'result-guess';
            if (isTarget) item.classList.add('is-target');
            if (isGuessed) item.classList.add('is-guessed');

            const name = mammal.common_name || mammal.scientific_name || '(unknown)';
            item.innerHTML = `
                <span class="round-ranking-name">${name}</span>
                <span class="round-ranking-rank">${isTarget ? 'Target' : `#${rank}${tieSize > 1 ? ' (tied)' : ''}`}</span>
            `;

            item.style.cursor = 'pointer';
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                if (onItemClick) onItemClick(id);
            });

            list.appendChild(item);
        });

        container.appendChild(list);
    }

    getRankClass(rank, totalRanks) {
        const color = this.getRankColorClass(rank, totalRanks);
        if (rank === 1) return 'perfect-match';
        if (color === 'green') return 'close-match';
        if (color === 'yellow') return 'medium-match';
        return 'distant-match';
    }

    getRankColorClass(rank, total) {
        if (rank === 1) return 'green';
        if (rank === null || rank === undefined) return 'yellow';

        const t = (typeof total === 'number' && total > 0) ? total : 0;
        if (!t) return 'yellow';

        const greenMax = Math.ceil(t / 3);
        const yellowMax = Math.ceil((2 * t) / 3);

        if (rank <= greenMax) return 'green';
        if (rank <= yellowMax) return 'yellow';
        return 'red';
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
}
