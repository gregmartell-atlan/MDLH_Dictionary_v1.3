/**
 * LRU (Least Recently Used) Cache Implementation
 * 
 * A bounded cache with time-to-live (TTL) support to prevent unbounded memory growth.
 * Used for caching query results, table metadata, and other frequently accessed data.
 */

export class LRUCache {
  /**
   * Create a new LRU cache
   * @param {number} maxSize - Maximum number of entries (default: 100)
   * @param {number} ttlMs - Time-to-live in milliseconds (default: 5 minutes)
   */
  constructor(maxSize = 100, ttlMs = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  /**
   * Get a value from the cache
   * @param {string} key - Cache key
   * @returns {*} The cached value or undefined if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Check if entry has expired
    if (this.ttlMs > 0 && Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.value;
  }

  /**
   * Set a value in the cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   */
  set(key, value) {
    // Delete existing entry to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Check if a key exists in the cache (without updating access time)
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check expiration
    if (this.ttlMs > 0 && Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete a key from the cache
   * @param {string} key - Cache key
   * @returns {boolean} True if the key was deleted
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get the current size of the cache
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Get all keys in the cache (for debugging)
   * @returns {string[]}
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * Remove all expired entries
   * @returns {number} Number of entries removed
   */
  prune() {
    if (this.ttlMs <= 0) return 0;
    
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    return removed;
  }
}

/**
 * Create a cache with preset configurations
 */
export const createCache = {
  /**
   * Small cache for frequently changing data (short TTL)
   */
  small: () => new LRUCache(50, 60 * 1000), // 50 entries, 1 min TTL

  /**
   * Medium cache for general use
   */
  medium: () => new LRUCache(100, 5 * 60 * 1000), // 100 entries, 5 min TTL

  /**
   * Large cache for stable data (long TTL)
   */
  large: () => new LRUCache(500, 30 * 60 * 1000), // 500 entries, 30 min TTL

  /**
   * Session cache (no TTL, cleared on refresh)
   */
  session: () => new LRUCache(200, 0), // 200 entries, no expiration
};

export default LRUCache;

