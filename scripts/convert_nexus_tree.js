const fs = require('fs');
const path = require('path');

function parseTranslateBlock(content) {
    const lower = content.toLowerCase();
    const translateIndex = lower.indexOf('translate');
    if (translateIndex === -1) {
        throw new Error('Translate block not found in NEXUS file');
    }

    const afterKeyword = translateIndex + 'translate'.length;
    const endIndex = content.indexOf(';', afterKeyword);
    if (endIndex === -1) {
        throw new Error('Translate block terminator not found');
    }

    const block = content.slice(afterKeyword, endIndex).trim();
    const map = new Map();

    block.split(',').forEach(entry => {
        const cleaned = entry.replace(/\s+/g, ' ').trim().replace(/[;,]$/, '').trim();
        if (!cleaned) {
            return;
        }
        const parts = cleaned.split(' ');
        const id = parts.shift();
        const label = parts.join(' ').replace(/['"]/g, '').trim();
        if (id && label) {
            map.set(id, label);
        }
    });

    return {
        map,
        endIndex,
    };
}

function extractTreeString(content, startIndex) {
    const lower = content.toLowerCase();
    const treeIndex = lower.indexOf('tree', startIndex);
    if (treeIndex === -1) {
        throw new Error('Tree definition not found');
    }

    const equalsIndex = content.indexOf('=', treeIndex);
    if (equalsIndex === -1) {
        throw new Error('Tree definition missing "="');
    }

    const semicolonIndex = content.indexOf(';', equalsIndex);
    if (semicolonIndex === -1) {
        throw new Error('Tree definition missing terminating semicolon');
    }

    return {
        tree: content.slice(equalsIndex + 1, semicolonIndex).trim(),
        endIndex: semicolonIndex,
    };
}

function sanitizeTree(tree, translateMap) {
    // Remove optional [&...] prefix
    let cleaned = tree.replace(/^\s*\[&[^\]]*\]\s*/, '');
    // Remove inline annotations
    cleaned = cleaned.replace(/\[&[^\]]*\]/g, '');

    // Replace numeric tokens with translated labels
    cleaned = cleaned.replace(/(\(|,)\s*(\d+)/g, (match, prefix, id) => {
        const label = translateMap.get(id);
        if (!label) {
            throw new Error(`Missing translation for taxon id ${id}`);
        }
        return `${prefix}${label}`;
    });

    return cleaned;
}

function convertNexusToNewick(content) {
    const trimmed = content.trim();
    if (!trimmed.toUpperCase().startsWith('#NEXUS')) {
        return trimmed;
    }

    const { map, endIndex } = parseTranslateBlock(trimmed);
    const { tree } = extractTreeString(trimmed, endIndex);
    return sanitizeTree(tree, map);
}

function main() {
    const inputPath = process.argv[2];
    if (!inputPath) {
        console.error('Usage: node convert_nexus_tree.js <input-path> [output-path]');
        process.exit(1);
    }

    const outputPath = process.argv[3] || inputPath;
    const raw = fs.readFileSync(inputPath, 'utf8');
    const converted = convertNexusToNewick(raw);
    fs.writeFileSync(outputPath, `${converted.trim()}${converted.trim().endsWith(';') ? '' : ';'}\n`);
    console.log(`Converted tree written to ${path.resolve(outputPath)}`);
}

if (require.main === module) {
    main();
}

module.exports = { convertNexusToNewick };
