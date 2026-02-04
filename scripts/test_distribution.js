/**
 * Test script to verify the stratified sampling distribution
 * Run with: node scripts/test_distribution.js
 */

const fs = require('fs');
const path = require('path');

// Load mammal data
const dataPath = path.join(__dirname, '..', 'mammal_data.json');
const mammals = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log(`Total mammals in dataset: ${mammals.length}`);

// Count by order in full dataset
const fullOrderCounts = {};
mammals.forEach(m => {
    const order = m.order || 'Unknown';
    fullOrderCounts[order] = (fullOrderCounts[order] || 0) + 1;
});

console.log('\n=== Full Dataset Distribution ===');
Object.entries(fullOrderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([order, count]) => {
        const pct = ((count / mammals.length) * 100).toFixed(1);
        console.log(`${order}: ${count} (${pct}%)`);
    });

// Simulate the stratified sampling
function getOrderWeight(orderSize) {
    if (!Number.isFinite(orderSize) || orderSize <= 0) return 1;
    // Use log scaling: large orders still get more picks, but the advantage is dampened
    return Math.log(orderSize + 1);
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function stratifiedSample(mammalList, count) {
    const pool = mammalList.filter(Boolean);
    const targetCount = Math.min(count, pool.length);
    
    if (targetCount <= 0) return [];

    const byOrder = new Map();
    pool.forEach(m => {
        const order = m.order || 'Unknown';
        if (!byOrder.has(order)) byOrder.set(order, []);
        byOrder.get(order).push(m);
    });

    const orderWeights = new Map();
    byOrder.forEach((mammals, order) => {
        orderWeights.set(order, getOrderWeight(mammals.length));
    });

    const orderPools = new Map();
    byOrder.forEach((mammals, order) => {
        const byFamily = new Map();
        mammals.forEach(m => {
            const family = m.family || 'Unknown';
            if (!byFamily.has(family)) byFamily.set(family, []);
            byFamily.get(family).push(m);
        });
        
        byFamily.forEach((species) => shuffleArray(species));
        
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
        let mammal = null;
        let attempts = 0;
        const maxAttempts = orderData.familyKeys.length;
        
        while (!mammal && attempts < maxAttempts) {
            const familyKey = orderData.familyKeys[orderData.currentFamilyIndex];
            const familyPool = orderData.families.get(familyKey);
            
            orderData.currentFamilyIndex = (orderData.currentFamilyIndex + 1) % orderData.familyKeys.length;
            
            if (familyPool && familyPool.length > 0) {
                mammal = familyPool.pop();
                orderData.totalRemaining--;
                
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

// Run multiple simulations
const NUM_SIMULATIONS = 1000;
const SAMPLE_SIZE = 45;

const orderTotals = {};
const familyTotals = {};

for (let i = 0; i < NUM_SIMULATIONS; i++) {
    const sample = stratifiedSample([...mammals], SAMPLE_SIZE);
    
    sample.forEach(m => {
        const order = m.order || 'Unknown';
        const family = m.family || 'Unknown';
        orderTotals[order] = (orderTotals[order] || 0) + 1;
        familyTotals[family] = (familyTotals[family] || 0) + 1;
    });
}

console.log(`\n=== Stratified Sampling Distribution (${NUM_SIMULATIONS} simulations, ${SAMPLE_SIZE} per game) ===`);
console.log('\nTop 15 Orders:');
Object.entries(orderTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([order, count]) => {
        const avgPerGame = (count / NUM_SIMULATIONS).toFixed(1);
        const pct = ((count / (NUM_SIMULATIONS * SAMPLE_SIZE)) * 100).toFixed(1);
        const datasetPct = ((fullOrderCounts[order] / mammals.length) * 100).toFixed(1);
        console.log(`${order}: avg ${avgPerGame}/game (${pct}% of selections, was ${datasetPct}% of data)`);
    });

console.log('\nTop 15 Families:');
Object.entries(familyTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([family, count]) => {
        const avgPerGame = (count / NUM_SIMULATIONS).toFixed(1);
        const pct = ((count / (NUM_SIMULATIONS * SAMPLE_SIZE)) * 100).toFixed(1);
        console.log(`${family}: avg ${avgPerGame}/game (${pct}%)`);
    });

// Show improvement for Rodentia and Chiroptera
console.log('\n=== Key Improvements ===');
const rodentiaPct = ((orderTotals['RODENTIA'] || 0) / (NUM_SIMULATIONS * SAMPLE_SIZE) * 100).toFixed(1);
const chiropteraPct = ((orderTotals['CHIROPTERA'] || 0) / (NUM_SIMULATIONS * SAMPLE_SIZE) * 100).toFixed(1);
console.log(`RODENTIA: was 28.7% of data, now ${rodentiaPct}% of selections`);
console.log(`CHIROPTERA: was 16.6% of data, now ${chiropteraPct}% of selections`);
