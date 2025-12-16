// Prune phylogenetic tree to only include species in the dataset

const fs = require('fs');
const phylotree = require('phylotree');

// Load the dataset
const datasetPath = './mammal_data.json';
const treePath = './FBD-tree.tre';
const outputPath = './FBD-tree-pruned.tre';

console.log('Loading dataset...');
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

console.log('Loading tree...');
const treeString = fs.readFileSync(treePath, 'utf8');
const tree = new phylotree.phylotree(treeString);

// Extract canonical species labels from dataset
const datasetLabels = new Set();
dataset.forEach(mammal => {
    const scientificName = mammal.scientific_name.replace(/\s+/g, '_');
    datasetLabels.add(scientificName);
});

// Function to get canonical label (strip family/order suffixes)
function getCanonicalLabel(label) {
    if (!label || !label.name) return null;
    const name = label.name;
    const parts = name.split('_');
    if (parts.length >= 2) {
        return `${parts[0]}_${parts[1]}`;
    }
    return name;
}

const tips = tree.getTips();
console.log(`Dataset contains ${datasetLabels.size} species`);
console.log(`Tree contains ${tips.length} leaves`);

// Find tips to remove (those not in dataset)
const tipsToRemove = [];
tips.forEach(tip => {
    const canonical = getCanonicalLabel(tip.data);
    if (!datasetLabels.has(canonical)) {
        tipsToRemove.push(tip);
    }
});

console.log(`Removing ${tipsToRemove.length} tips not in dataset...`);

// Remove tips one by one
tipsToRemove.forEach((tip, index) => {
    if (index % 100 === 0) {
        console.log(`Processed ${index}/${tipsToRemove.length}...`);
    }
    tree.deleteANode(tip);
});

const remainingTips = tree.getTips();
console.log(`Pruned tree contains ${remainingTips.length} leaves`);

// Convert back to Newick
const prunedNewick = tree.getNewick();

console.log(`Writing pruned tree to ${outputPath}...`);
fs.writeFileSync(outputPath, prunedNewick, 'utf8');

console.log('Done!');
console.log(`Original tree: ${tips.length} species`);
console.log(`Pruned tree: ${remainingTips.length} species`);
console.log(`Reduction: ${((1 - remainingTips.length / tips.length) * 100).toFixed(1)}%`);
