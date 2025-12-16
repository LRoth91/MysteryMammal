# Mammal Mystery - The Phylogenetic Guessing Game

A web-based educational game where players guess mystery mammals using phylogenetic similarity scores based on evolutionary relationships.

## 🎮 Play Now

Visit: [https://YOUR-USERNAME.github.io/MammalGuessGame](https://YOUR-USERNAME.github.io/MammalGuessGame)

*(Replace YOUR-USERNAME with your GitHub username after deployment)*

## 📖 About

Mammal Mystery is an interactive guessing game that teaches players about mammalian evolution and phylogenetic relationships. Players have 10 tries to guess a mystery mammal, receiving similarity scores based on how closely related their guesses are to the target species on the evolutionary tree.

### Features

- **45 Mammal Species** from diverse orders and families
- **Phylogenetic Scoring** based on real evolutionary relationships
- **Interactive Visualizations** including distance histograms
- **Mammal Gallery** with search and filtering by taxonomic groups
- **Educational Content** about evolutionary trees and relationships
- **Vintage Typewriter Aesthetic** for a unique gaming experience

## 🎯 How to Play

1. Click "Start Game" to begin
2. Select mammals from the grid to make your guesses
3. Each guess shows a similarity percentage based on evolutionary distance
4. Use the similarity scores to narrow down your next guesses
5. Find the exact match within 10 tries to win!

### Scoring Guide

- 🟢 **80-100%**: Very close evolutionary relationship (same family or nearby)
- 🟡 **50-79%**: Moderate evolutionary relationship (same order)
- 🔴 **0-49%**: Distant evolutionary relationship (different orders)

## 🛠️ Technology

- Pure HTML, CSS, and JavaScript (no build process required)
- [phylotree.js](https://github.com/veg/phylotree.js/) for tree visualization
- [D3.js](https://d3js.org/) for interactive distance charts
- Phylogenetic data from scientific research

## 📁 Project Structure

```
MammalGuessGame/
├── index.html              # Main game page
├── game_embedded.js        # Game logic and functionality
├── styles.css              # All styling
├── mammal_data.json        # Mammal species data
├── mammals.json            # Alternative data format
├── PhylotreeMammals.tre    # Phylogenetic tree data
├── FBD-tree.tre           # Alternative tree format
├── mystery-mammal-logo.svg # Game logo
├── *.png                   # Texture images
└── scripts/               # Utility scripts
    ├── annotate_family_counts.js
    ├── check_tree_overlap.js
    ├── convert_nexus_tree.js
    └── prune_tree_to_dataset.js
```

## 🚀 Local Development

1. Clone this repository
2. Open `index.html` in a web browser
3. Or use a local server:
   ```bash
   python -m http.server 8000
   ```
   Then visit `http://localhost:8000`

## 📝 Data Sources

- Mammal images from Wikimedia Commons
- Phylogenetic relationships based on scientific literature
- Tree topology from mammalian phylogenomic studies

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs or suggest features via Issues
- Submit pull requests for improvements
- Add more species or update taxonomic data

## 📄 License

This project is open source and available for educational purposes.

## 🙏 Acknowledgments

- Phylotree.js developers
- D3.js community
- Wikimedia Commons contributors for mammal images
- Scientific community for phylogenetic research

---

**Created with educational goals in mind to make learning about mammalian evolution fun and interactive!**
