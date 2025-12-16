'use strict';

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'mammal_data.json');

function loadMammals(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeMammals(filePath, data) {
  const formatted = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, formatted, 'utf8');
}

function annotateFamilyCounts(mammals) {
  const familyCounts = mammals.reduce((acc, mammal) => {
    const family = (mammal.family || '').trim().toLowerCase();
    if (!family) {
      return acc;
    }
    acc[family] = (acc[family] || 0) + 1;
    return acc;
  }, {});

  return mammals.map(mammal => {
    const family = (mammal.family || '').trim().toLowerCase();
    const count = family ? familyCounts[family] || 1 : 1;
    return {
      ...mammal,
      family_member_count: count
    };
  });
}

function main() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error('Cannot find mammal_data.json at', DATA_PATH);
    process.exit(1);
  }

  const mammals = loadMammals(DATA_PATH);
  const annotated = annotateFamilyCounts(mammals);
  writeMammals(DATA_PATH, annotated);
  console.log(`Annotated ${annotated.length} mammals with family_member_count`);
}

if (require.main === module) {
  main();
}
