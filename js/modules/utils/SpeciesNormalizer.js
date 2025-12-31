/**
 * SpeciesNormalizer.js
 * Utility class for normalizing and matching species names
 */

export class SpeciesNormalizer {
    /**
     * Get the canonical species label (Genus_species format)
     * @param {string} name - Species name in any format
     * @returns {string|null}
     */
    getCanonical(name) {
        if (!name) return null;
        
        let cleaned = name.trim();
        if (!cleaned) return null;
        
        cleaned = cleaned.replace(/^_+/, '').replace(/['"]/g, '');
        const parts = cleaned.split('_').filter(Boolean);
        
        if (parts.length >= 2) {
            return `${parts[0]}_${parts[1]}`;
        }
        return cleaned;
    }

    /**
     * Get all name variants for matching
     * @param {string} name - Species name
     * @returns {string[]} Array of name variants
     */
    getVariants(name) {
        if (!name) return [];
        
        const trimmed = name.trim();
        if (!trimmed) return [];

        const underscore = trimmed.replace(/\s+/g, '_');
        const spaced = trimmed.replace(/_/g, ' ');
        
        const variants = new Set([
            trimmed,
            trimmed.toLowerCase(),
            underscore,
            underscore.toLowerCase(),
            spaced,
            spaced.toLowerCase(),
        ]);

        const canonical = this.getCanonical(trimmed);
        if (canonical && canonical !== trimmed) {
            const canonicalSpaced = canonical.replace(/_/g, ' ');
            variants.add(canonical);
            variants.add(canonical.toLowerCase());
            variants.add(canonicalSpaced);
            variants.add(canonicalSpaced.toLowerCase());
        }

        return Array.from(variants);
    }

    /**
     * Normalize a tree label to lowercase underscore format
     * @param {string} name - Species name
     * @returns {string|null}
     */
    normalizeTreeLabel(name) {
        if (!name) return null;
        return name.trim().toLowerCase().replace(/\s+/g, '_');
    }

    /**
     * Check if two species names match
     * @param {string} name1 - First species name
     * @param {string} name2 - Second species name
     * @returns {boolean}
     */
    matches(name1, name2) {
        if (!name1 || !name2) return false;
        
        const variants1 = new Set(this.getVariants(name1));
        const variants2 = this.getVariants(name2);
        
        return variants2.some(v => variants1.has(v));
    }
}
