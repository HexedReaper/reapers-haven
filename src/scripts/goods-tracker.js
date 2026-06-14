// src/scripts/goods-tracker.js
// Reads pre-generated cache. Zero git calls at render time.
import path from 'path';
import fs from 'fs';

// CWD-relative path, same pattern as the original OVERRIDES_PATH
const CACHE_PATH = path.resolve('src/data/goods-history.json');

export function getGoodsHistory() {
  try {
    if (!fs.existsSync(CACHE_PATH)) {
      console.warn(
        '⚠ goods-history.json not found. Run: node src/scripts/generate-goods-cache.mjs'
      );
      return [];
    }
    const raw = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    return raw.history || [];
  } catch (e) {
    console.error('Failed to read goods history cache:', e.message);
    return [];
  }
}