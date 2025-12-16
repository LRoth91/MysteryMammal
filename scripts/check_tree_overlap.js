const fs = require('fs');

function canonical(name) {
  if (!name) return null;
  let cleaned = name.trim();
  if (!cleaned) return null;
  cleaned = cleaned.replace(/^_+/, '').replace(/['"]/g, '');
  const parts = cleaned.split(/_+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]}_${parts[1]}`;
  }
  return cleaned;
}

function main() {
  const mammals = JSON.parse(fs.readFileSync('mammal_data.json', 'utf8'));
  const allowed = new Set();
  mammals.forEach(m => {
    const c = canonical(m.scientific_name.replace(/\s+/g, '_'));
    if (c) {
      allowed.add(c.toLowerCase());
    }
  });

  const tree = fs.readFileSync('FBD-tree.tre', 'utf8');
  const tokens = tree.split(/[^A-Za-z0-9_]+/).filter(Boolean);
  const labelSet = new Set(tokens);

  let matches = 0;
  labelSet.forEach(label => {
    const canon = canonical(label);
    if (canon && allowed.has(canon.toLowerCase())) {
      matches += 1;
    }
  });

  console.log(`Tree labels: ${labelSet.size}`);
  console.log(`Dataset species: ${allowed.size}`);
  console.log(`Overlap matches: ${matches}`);
}

main();
