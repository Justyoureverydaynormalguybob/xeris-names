/**
 * XRS Names - Integration Library
 * 
 * Simple library to resolve .xrs names to addresses in your Xeris dApp or wallet
 * 
 * Usage:
 *   import { resolveXRS, reverseXRS, isXRSName } from './xrs-names-lib.js';
 *   
 *   const address = await resolveXRS('alice.xrs');
 *   const names = await reverseXRS('Xrs7d1e4f...');
 */

class XRSNames {
    constructor(apiUrl = 'https://your-xrs-names-service.com/api') {
        this.apiUrl = apiUrl;
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Check if a string is an XRS name
     */
    isXRSName(input) {
        return input && (input.endsWith('.xrs') || /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(input));
    }

    /**
     * Resolve XRS name to address
     * @param {string} name - Name like "alice.xrs" or "alice"
     * @returns {Promise<string|null>} - Address or null if not found
     */
    async resolve(name) {
        if (!name) return null;

        const cleanName = name.toLowerCase().replace('.xrs', '');
        const cacheKey = `name:${cleanName}`;

        // Check cache
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await fetch(`${this.apiUrl}/resolve/${cleanName}`);
            
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const address = data.address;

            // Cache result
            this._saveToCache(cacheKey, address);

            return address;
        } catch (error) {
            console.error('XRS Names resolve error:', error);
            return null;
        }
    }

    /**
     * Reverse lookup - get names for an address
     * @param {string} address - Xeris address
     * @returns {Promise<Array<string>>} - Array of names (empty if none found)
     */
    async reverse(address) {
        if (!address) return [];

        const cacheKey = `addr:${address}`;

        // Check cache
        const cached = this._getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const response = await fetch(`${this.apiUrl}/reverse/${address}`);
            
            if (!response.ok) {
                if (response.status === 404) return [];
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const names = data.names.map(n => n.name);

            // Cache result
            this._saveToCache(cacheKey, names);

            return names;
        } catch (error) {
            console.error('XRS Names reverse error:', error);
            return [];
        }
    }

    /**
     * Get primary name for an address (first registered)
     * @param {string} address - Xeris address
     * @returns {Promise<string|null>} - Primary name or null
     */
    async getPrimaryName(address) {
        const names = await this.reverse(address);
        return names.length > 0 ? names[0] : null;
    }

    /**
     * Smart resolver - accepts name or address, returns address
     * @param {string} input - Name or address
     * @returns {Promise<string>} - Always returns an address
     */
    async resolveToAddress(input) {
        if (!input) return '';

        // If it looks like an address, return as-is
        if (input.length > 32 && !input.includes('.')) {
            return input;
        }

        // If it's a name, resolve it
        if (this.isXRSName(input)) {
            const resolved = await this.resolve(input);
            return resolved || input; // Fallback to input if not found
        }

        return input;
    }

    /**
     * Smart display - shows name if available, otherwise shortened address
     * @param {string} address - Xeris address
     * @param {boolean} full - Return full address if no name found
     * @returns {Promise<string>} - Display string
     */
    async toDisplayString(address, full = false) {
        if (!address) return '';

        const name = await this.getPrimaryName(address);
        if (name) return name;

        if (full) return address;

        // Return shortened address: Xrs7d1e...ms6AK97
        return `${address.substring(0, 7)}...${address.substring(address.length - 7)}`;
    }

    /**
     * Check if name is available
     * @param {string} name - Name to check
     * @returns {Promise<boolean>} - True if available
     */
    async checkAvailability(name) {
        const cleanName = name.toLowerCase().replace('.xrs', '');

        try {
            const response = await fetch(`${this.apiUrl}/check/${cleanName}`);
            const data = await response.json();
            return data.available;
        } catch (error) {
            console.error('XRS Names availability check error:', error);
            return false;
        }
    }

    /**
     * Cache helpers
     */
    _getFromCache(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        const now = Date.now();
        if (now - item.timestamp > this.cacheTTL) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    _saveToCache(key, value) {
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
}

// Create default instance
const xrsNames = new XRSNames();

// Export functions
export const resolveXRS = (name) => xrsNames.resolve(name);
export const reverseXRS = (address) => xrsNames.reverse(address);
export const getPrimaryName = (address) => xrsNames.getPrimaryName(address);
export const resolveToAddress = (input) => xrsNames.resolveToAddress(input);
export const toDisplayString = (address, full) => xrsNames.toDisplayString(address, full);
export const checkAvailability = (name) => xrsNames.checkAvailability(name);
export const isXRSName = (input) => xrsNames.isXRSName(input);
export const clearCache = () => xrsNames.clearCache();

// Also export the class for advanced usage
export { XRSNames };

// For non-module usage (browser script tag)
if (typeof window !== 'undefined') {
    window.XRSNames = {
        resolve: resolveXRS,
        reverse: reverseXRS,
        getPrimaryName,
        resolveToAddress,
        toDisplayString,
        checkAvailability,
        isXRSName,
        clearCache,
        XRSNames // Export class
    };
}
