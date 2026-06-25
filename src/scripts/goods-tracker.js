// ..src/scripts/goods-tracker.js
import path from 'path';
import fs from 'fs';

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
    // FIX: validate structure before returning
    if (!raw || !Array.isArray(raw.history)) {
      console.warn('⚠ goods-history.json has invalid structure. Regenerate cache.');
      return [];
    }
    return raw.history;
  } catch (e) {
    console.error('Failed to read goods history cache:', e.message);
    return [];
  }
}