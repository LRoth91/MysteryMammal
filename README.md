# Mammal Mystery - The Phylogenetic Guessing Game

A web-based educational game where players guess mystery mammals using phylogenetic similarity (evolutionary relatedness).

## 🚀 Quick Start (Development)

**Important:** This app uses ES6 modules and must be served via HTTP (not opened as a file).

```bash
# Navigate to the project directory
cd MammalGuessGame

# Start a local server (choose one):
python -m http.server 8000        # Python
# OR
npx http-server -p 8000           # Node.js

# Open your browser to:
# http://localhost:8000
```

## 🎮 Play Online

Visit: [https://YOUR-USERNAME.github.io/MammalGuessGame](https://YOUR-USERNAME.github.io/MammalGuessGame)

*(Replace YOUR-USERNAME with your GitHub username after deployment)*

## 📖 About

Mammal Mystery is an interactive guessing game that teaches players about mammalian evolution and phylogenetic relationships. Players have 10 tries to guess a mystery mammal, using phylogenetic similarity feedback to narrow down the target.

### Features

- **45 Mammal Species** from diverse orders and families
- **Phylogenetic Similarity Feedback** based on evolutionary relationships
- **Round Summary** showing all species ranked by proximity to the target
- **Mammal Gallery** with search and filtering by taxonomic groups
- **Educational Content** about evolutionary trees and relationships
- **Vintage Typewriter Aesthetic** for a unique gaming experience

## 🎯 How to Play

1. Click "Start Game" to begin
2. Select mammals from the grid to make your guesses
3. After each guess, you’ll see:
     - A **rank** (e.g., `#12`) showing how close that guess is to the target compared to the other options
     - A simple **getting closer / farther** indicator compared to your previous guess
4. Use that feedback to refine your next guesses
5. Find the exact match within 10 tries to win!

Tip: After the round ends, use **View Round Graph** to see every species ranked by proximity (with the target highlighted).

## 🧠 What the Feedback Means (Less Technical)

- Lower rank numbers mean “more similar / more closely related to the target.”
- The color feedback is relative to your *previous* guess:
    - **Green** = you got closer
    - **Red** = you got farther
    - **Neutral** = first guess (or no comparable data)

## 🔬 How Similarity Is Calculated (More Technical)

Under the hood, the game compares each guessed species to the target using phylogenetic distance information where available (and falls back to taxonomy-based similarity when needed). It then:

- Computes a per-round ordering from closest → farthest
- Assigns **tie-aware ranks** (so multiple species can share the same rank when distances are equal)
- Uses “closer/farther” colors by comparing your current guess distance to your previous guess distance

## 🛠️ Technology

- Pure HTML, CSS, and JavaScript (no build process required)
- [phylojs](https://www.npmjs.com/package/phylojs) for phylogenetic distance calculations
- Phylogenetic data from scientific research

## 📁 Project Structure

```
MammalGuessGame/
├── index.html              # Main game page
├── styles.css              # All styling
├── mammal_data.json        # Mammal species data (750+ species)
├── FBD-tree.tre            # Phylogenetic tree (Newick format)
├── mystery-mammal-logo.svg # Game logo
├── *.png                   # Texture images
├── js/
│   ├── main.js             # Entry point
│   └── modules/            # ES6 modules
│       ├── MammalMysteryGame.js  # Main game orchestration
│       ├── MammalData.js         # Data loading & lookup
│       ├── PhyloCalculator.js    # Phylogenetic distance calculations
│       ├── UIRenderer.js         # UI rendering
│       ├── ChartRenderer.js      # Result charts
│       └── utils/
│           └── SpeciesNormalizer.js
├── files/SVG/              # UI icons
└── scripts/                # Development utilities (Node.js)
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
