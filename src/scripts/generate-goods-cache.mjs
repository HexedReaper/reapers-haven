// src/scripts/generate-goods-cache.mjs
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const OVERRIDES_PATH = path.resolve('src/scripts/goods-overrides.json');
const CACHE_PATH = path.resolve('src/data/goods-history.json');

const VAULTS = [
  { path: 'src/content/goods', collectionName: 'goods' },
  { path: 'src/content/tutorials', collectionName: 'tutorials' }
];

function computeGoodsHistory() {
  let allCommits = [];

  // 1. Fetch commits from both sovereign vault repositories
  VAULTS.forEach(vault => {
    const vaultPath = path.resolve(vault.path);
    if (!fs.existsSync(vaultPath)) return;

    try {
      // Check if it's actually a git repo
      execSync('git status', { cwd: vaultPath, stdio: 'ignore' });
      
      const logOutput = execSync(`git log --format="%H|%at"`, { cwd: vaultPath, encoding: 'utf8' });
      if (logOutput.trim()) {
        const commits = logOutput.trim().split('\n').map(line => {
          const [hash, timestamp] = line.split('|');
          return { 
            hash, 
            date: new Date(parseInt(timestamp) * 1000), 
            vault: vault 
          };
        }).filter(c => !isNaN(c.date.getTime()));
        
        allCommits.push(...commits);
      }
    } catch (e) {
      console.warn(`Could not read git history for vault: ${vault.collectionName}`);
    }
  });

  // Sort all merged commits chronologically
  allCommits.sort((a, b) => b.date - a.date);

  let historyLog = [];

  // 2. Diff parsing per commit inside its respective vault
  allCommits.forEach(commit => {
    try {
      let diffOutput = '';
      const vaultDir = path.resolve(commit.vault.path);
      
      try {
        diffOutput = execSync(`git diff ${commit.hash}~1 ${commit.hash}`, { cwd: vaultDir, encoding: 'utf8' });
      } catch (parentErr) {
        // Fallback for root commits: use git diff-tree which handles missing parents natively
        diffOutput = execSync(`git diff-tree --root -p --no-commit-id ${commit.hash}`, { cwd: vaultDir, encoding: 'utf8' });
      }

      if (diffOutput.trim()) {
        const formattedDate = commit.date.toISOString().split('T')[0];
        // Pass the collection name directly since the paths inside the vault won't include 'src/content/...'
        const logs = parseCommitDiff(diffOutput, commit.vault.collectionName);
        if (logs.length > 0) {
          historyLog.push({ date: formattedDate, logs: logs });
        }
      }
    } catch (err) {
      console.warn(`Could not process diff for commit ${commit.hash}`);
    }
  });

  // 3. Apply Overrides
  if (fs.existsSync(OVERRIDES_PATH)) {
    try {
      const overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
      historyLog.forEach(block => {
        block.logs.forEach(item => {
          if (typeof item === 'object' && item !== null) {
            const itemLookupKey = `${item.collectionName}:${item.name}`;
            const sectionLookupKey = `${item.collectionName}:${item.sectionTitle}`;
            if (overrides[sectionLookupKey]) {
              const sectionFix = overrides[sectionLookupKey];
              if (sectionFix.sectionTitle) item.sectionTitle = sectionFix.sectionTitle;
            }
            if (overrides[itemLookupKey]) {
              const itemFix = overrides[itemLookupKey];
              if (itemFix.sectionTitle) item.sectionTitle = itemFix.sectionTitle;
              if (itemFix.name) item.name = itemFix.name;
              if (itemFix.message) item.message = itemFix.message;
            }
          }
        });
      });
    } catch (jsonErr) {
      console.warn("Failed to parse goods-overrides.json:", jsonErr.message);
    }
  }

  return historyLog;
}

// ---------- Parsers ----------

function parseCommitDiff(diffText, explicitCollection) {
  const lines = diffText.split('\n');
  let currentCollection = explicitCollection;
  let currentSection = "Global";
  let fileLines = [];

  for (let line of lines) {
    // We adjust the regex because inside the vault, the diff path is just "a/android.md"
    if (line.startsWith('diff --git') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      const match = line.match(/[ab]\/(.+)\.md/);
      if (match) {
        // Build the simulated path so it matches your UI expectations (e.g. "goods/android")
        currentCollection = `${explicitCollection}/${match[1]}`;
      }
      currentSection = "Global";
      continue;
    }

    else if (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-')) {
      const cleanLine = line.substring(1).trim();
      if (cleanLine.startsWith('#')) {
        currentSection = cleanLine.replace(/#+\s+/, '');
        continue;
      }
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      const content = line.substring(1).trim();
      if (content.startsWith('-') || content.startsWith('*') || /^\d+\./.test(content)) {
        fileLines.push({ type: 'added', content, section: currentSection, collection: currentCollection });
      }
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      const content = line.substring(1).trim();
      if (content.startsWith('-') || content.startsWith('*') || /^\d+\./.test(content)) {
        fileLines.push({ type: 'removed', content, section: currentSection, collection: currentCollection });
      }
    }
  }

  return formatCommitLogs(fileLines);
}

function formatCommitLogs(changes) {
  const added = changes.filter(c => c.type === 'added');
  const removed = changes.filter(c => c.type === 'removed');
  const processedIndices = new Set();
  const outputLogs = [];

  added.forEach((addedItem) => {
    if (isSubListBullet(addedItem.content)) return;

    const itemName = extractSiteName(addedItem.content);
    const itemUrl = extractSiteUrl(addedItem.content);
    const itemType = getItemType(addedItem.content, addedItem.section);
    let msg = "";
    let actionType = "added";

    const matchIndex = removed.findIndex((removedItem, idx) => {
      if (processedIndices.has(idx) || removedItem.collection !== addedItem.collection) return false;
      const removedName = extractSiteName(removedItem.content);
      const removedUrl = extractSiteUrl(removedItem.content);
      const lenDiff = Math.abs(removedName.length - itemName.length);
      if (lenDiff <= 3 && removedName.length > 4 && itemName.length > 4 && itemName.length < 100) {
        if (calculateLevenshtein(removedName, itemName) <= 3) return true;
      }
      if (removedName === itemName && itemName !== "") return true;
      if (removedUrl === itemUrl && itemUrl !== "") return true;
      if (calculateLevenshtein(removedName, itemName) <= 3) return true;
      return false;
    });

    if (matchIndex !== -1) {
      processedIndices.add(matchIndex);
      actionType = "updated";
      const oldItemName = extractSiteName(removed[matchIndex].content);
      const displayName = itemName !== oldItemName && oldItemName !== "" ? `${oldItemName} → ${itemName}` : itemName;
      if (itemType === 'plugin') {
        msg = `notes for plugin ${displayName} updated in section ${addedItem.section} in collection ${addedItem.collection}`;
      } else if (itemType === 'list_entry') {
        msg = `list entry ${displayName} updated in list ${addedItem.section} in collection ${addedItem.collection}`;
      } else {
        msg = `notes for site ${displayName} updated in section ${addedItem.section} in collection ${addedItem.collection}`;
      }
    } else {
      if (itemType === 'plugin') {
        msg = `New plugin ${itemName} added to section ${addedItem.section} in collection ${addedItem.collection}`;
      } else if (itemType === 'list_entry') {
        msg = `list entry ${itemName} added to list ${addedItem.section} in collection ${addedItem.collection}`;
      } else {
        msg = `New site ${itemName} added to section ${addedItem.section} in collection ${addedItem.collection}`;
      }
    }

    outputLogs.push({
      message: msg,
      action: actionType,
      type: itemType,
      name: itemName,
      sectionTitle: addedItem.section,
      collectionName: addedItem.collection
    });
  });

  removed.forEach((removedItem, idx) => {
    if (isSubListBullet(removedItem.content)) return;
    if (!processedIndices.has(idx)) {
      const itemName = extractSiteName(removedItem.content);
      const itemType = getItemType(removedItem.content, removedItem.section);
      let msg = "";
      if (itemType === 'plugin') {
        msg = `plugin ${itemName} removed from section ${removedItem.section} in collection ${removedItem.collection}`;
      } else if (itemType === 'list_entry') {
        msg = `list entry ${itemName} removed from list ${removedItem.section} in collection ${removedItem.collection}`;
      } else {
        msg = `website ${itemName} removed from section ${removedItem.section} in collection ${removedItem.collection}`;
      }
      outputLogs.push({
        message: msg,
        action: "removed",
        type: itemType,
        name: itemName,
        sectionTitle: removedItem.section,
        collectionName: removedItem.collection
      });
    }
  });

  return outputLogs;
}

function getItemType(content, section) {
  const clean = content.replace(/^[-*]\s+/, '').trim();
  if (section.toLowerCase().includes('plugin') || clean.startsWith('**')) return 'plugin';
  if (/^\d+\./.test(clean) || (!clean.startsWith('[') && (clean.includes(' - ') || clean.includes(' : ')))) return 'list_entry';
  return 'site';
}

function isSubListBullet(markdownLine) {
  const clean = markdownLine.replace(/^([-*]|\d+\.)\s+/, '').trim();
  if (clean.startsWith('[') || clean.startsWith('**') || clean.includes(' - ') || clean.includes(' : ') || clean.startsWith('http')) return false;
  return true;
}

function extractSiteName(markdownLine) {
  const clean = markdownLine.replace(/^([-*]|\d+\.)\s+/, '').trim();
  const noBold = clean.replace(/\*\*/g, '');
  const linkMatch = noBold.match(/^\[([^\]]+)\]/);
  if (linkMatch) return linkMatch[1];
  return noBold.split(' - ')[0].split(' : ')[0].trim();
}

function extractSiteUrl(markdownLine) {
  const clean = markdownLine.replace(/^[-*]\s+/, '').trim();
  const linkMatch = clean.match(/\((https?:\/\/[^\)]+)\)/);
  if (linkMatch) return linkMatch[1].trim();
  const rawUrlMatch = clean.match(/(https?:\/\/[^\s\-\:]+)/);
  return rawUrlMatch ? rawUrlMatch[1].trim() : "";
}

function calculateLevenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
      }
    }
  }
  return matrix[b.length][a.length];
}

// ---------- Write cache ----------
const data = computeGoodsHistory();
fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
fs.writeFileSync(CACHE_PATH, JSON.stringify({ _cachedAt: Date.now(), history: data }, null, 2));
console.log(`✓ Vault history mapped & cached (${data.length} updates recorded) → ${CACHE_PATH}`);