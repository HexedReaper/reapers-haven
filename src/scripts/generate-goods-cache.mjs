// src/scripts/generate-goods-cache.mjs
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const OVERRIDES_PATH = path.resolve('src/scripts/goods-overrides.json');
const CACHE_PATH = path.resolve('src/data/goods-history.json');

const VAULTS = [
  { path: 'src/content/goods', collectionName: 'goods' },
  { path: 'src/content/tutorials', collectionName: 'tutorials' }
];

// ---------- Security helpers ----------

const HASH_RE = /^[0-9a-f]{7,40}$/;

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 50 * 1024 * 1024  // 50 MB cap
  });
}

function sanitizePath(p) {
  // Strip traversal sequences and null bytes
  return p.replace(/\.\./g, '').replace(/\0/g, '').replace(/\/+/g, '/');
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeLogEntry(entry) {
  if (typeof entry !== 'object' || entry === null) return entry;
  for (const key of ['message', 'name', 'sectionTitle', 'collectionName', 'commitMessage', 'url', 'pageUrl']) {
    if (typeof entry[key] === 'string') {
      // Cap length to prevent oversized payloads
      if (entry[key].length > 2000) entry[key] = entry[key].substring(0, 2000);
      // HTML-escape to prevent stored XSS if rendered with set:html
      entry[key] = escapeHtml(entry[key]);
    }
  }
  // Sanitize pageUrl to prevent path traversal / javascript: URLs
  if (entry.pageUrl) {
    entry.pageUrl = sanitizePath(entry.pageUrl);
    if (!entry.pageUrl.startsWith('/')) entry.pageUrl = '/' + entry.pageUrl;
  }
  return entry;
}

// ---------- Main ----------

function computeGoodsHistory() {
  let allCommits = [];

  VAULTS.forEach(vault => {
    const vaultPath = path.resolve(vault.path);
    if (!fs.existsSync(vaultPath)) return;

    try {
      runGit(['status'], vaultPath); // Verify it's a git repo

      const logOutput = runGit(
        ['log', '--no-merges', '--format=%H|%at|%s'],
        vaultPath
      );

      if (logOutput.trim()) {
        const commits = logOutput.trim().split('\n').map(line => {
          const [hash, timestamp, ...subjectParts] = line.split('|');
          const subject = (subjectParts.join('|').trim() || "No commit message").slice(0, 500);

          // Validate hash format before use
          if (!HASH_RE.test(hash)) return null;

          const date = new Date(parseInt(timestamp, 10) * 1000);
          if (isNaN(date.getTime())) return null;

          return {
            hash,
            date,
            vault,
            subject
          };
        }).filter(Boolean);

        allCommits.push(...commits);
      }
    } catch (e) {
      console.warn(`Could not read git history for vault: ${vault.collectionName}`);
    }
  });

  allCommits.sort((a, b) => b.date - a.date);

  const commitsByDate = {};
  allCommits.forEach(commit => {
    const formattedDate = commit.date.toISOString().split('T')[0];
    if (!commitsByDate[formattedDate]) {
      commitsByDate[formattedDate] = [];
    }
    commitsByDate[formattedDate].push(commit);
  });

  let historyLog = [];

  Object.keys(commitsByDate)
    .sort((a, b) => new Date(b) - new Date(a))
    .forEach(date => {
      let dateLogs = [];

      commitsByDate[date].forEach(commit => {
        try {
          let diffOutput = '';
          const vaultDir = path.resolve(commit.vault.path);

          try {
            // Use arg array — no shell interpolation
            diffOutput = runGit(
              ['diff', `${commit.hash}~1`, commit.hash],
              vaultDir
            );
          } catch (parentErr) {
            diffOutput = runGit(
              ['diff-tree', '--root', '-p', '--no-commit-id', commit.hash],
              vaultDir
            );
          }

          if (diffOutput.trim()) {
            const logs = parseCommitDiff(diffOutput, commit.vault.collectionName, commit.subject);
            dateLogs.push(...logs);
          }
        } catch (err) {
          console.warn(`Could not process diff for commit ${commit.hash}`);
        }
      });

      if (dateLogs.length > 0) {
        historyLog.push({ date: date, logs: dateLogs });
      }
    });

  // Apply Overrides
  if (fs.existsSync(OVERRIDES_PATH)) {
    try {
      const overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
      historyLog.forEach(block => {
        block.logs.forEach(item => {
          if (typeof item === "object" && item !== null) {
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

  // Sanitize all output entries
  historyLog.forEach(block => {
    block.logs = block.logs.map(sanitizeLogEntry);
  });

  return historyLog;
}

// ---------- Helpers (unchanged logic) ----------

function isListItem(str) {
  if (str.startsWith('- ') || str.startsWith('* ')) return true;
  if (/^\d+\.\s/.test(str)) return true;
  return false;
}

function stripQuotes(filepath) {
  if (filepath.startsWith('"') && filepath.endsWith('"')) {
    return filepath.slice(1, -1);
  }
  return filepath;
}

// ---------- Parser (unchanged logic) ----------

function parseCommitDiff(diffText, explicitCollection, commitMessage) {
  const lines = diffText.split('\n');
  let currentCollection = explicitCollection;
  let currentSection = "Global";
  let currentFilePath = '';
  let currentFileIsMarkdown = false;
  let inCodeBlock = false;
  let fileLines = [];

  for (let line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      const match = line.match(/[ab]\/([^\s"]+\.md)/);
      if (match) {
        const filePath = stripQuotes(match[1]);
        const parts = filePath.split('/');
        if (parts.length > 1) {
          currentCollection = `${explicitCollection}/${parts[0]}`;
        } else {
          currentCollection = explicitCollection;
        }
        currentFilePath = filePath.replace(/\.md$/, '');
        currentFileIsMarkdown = true;
      } else {
        currentFileIsMarkdown = false;
      }
      currentSection = "Global";
      inCodeBlock = false;
      continue;
    }

    if (line.startsWith('rename from ') || line.startsWith('rename to ')) {
      continue;
    }

    const cleanLineForFence = line.replace(/^[+\-\s]/, '').trim();
    if (cleanLineForFence.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    if (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-')) {
      const cleanLine = line.substring(1).trim();
      if (cleanLine.startsWith('#')) {
        currentSection = cleanLine.replace(/^#+\s+/, '').trim() || "Global";
        continue;
      }
    }

    if (!currentFileIsMarkdown) continue;

    if (line.startsWith('+') && !line.startsWith('+++')) {
      const rawContent = line.substring(1);
      const isIndented = rawContent.startsWith('  ') || rawContent.startsWith('\t');
      const content = rawContent.trim();

      if (isListItem(content) && !isIndented) {
        fileLines.push({
          type: 'added',
          content,
          section: currentSection,
          collection: currentCollection,
          filePath: currentFilePath
        });
      }
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      const rawContent = line.substring(1);
      const isIndented = rawContent.startsWith('  ') || rawContent.startsWith('\t');
      const content = rawContent.trim();

      if (isListItem(content) && !isIndented) {
        fileLines.push({
          type: 'removed',
          content,
          section: currentSection,
          collection: currentCollection,
          filePath: currentFilePath
        });
      }
    }
  }

  return formatCommitLogs(fileLines, commitMessage, explicitCollection);
}

// ---------- Log Formatter (unchanged logic) ----------

function formatCommitLogs(changes, commitMessage, explicitCollection) {
  const added = changes.filter(c => c.type === 'added');
  const removed = changes.filter(c => c.type === 'removed');
  const processedRemoved = new Set();
  const outputLogs = [];

  function findMatch(addedItem, skipSet) {
    const itemName = extractSiteName(addedItem.content);
    const itemUrl = extractSiteUrl(addedItem.content);

    const candidates = [];
    for (let i = 0; i < removed.length; i++) {
      if (skipSet.has(i) || removed[i].collection !== addedItem.collection) continue;
      candidates.push({ idx: i, item: removed[i] });
    }

    if (itemUrl) {
      for (const c of candidates) {
        const rUrl = extractSiteUrl(c.item.content);
        if (rUrl && rUrl === itemUrl) return c.idx;
      }
    }

    if (itemName) {
      for (const c of candidates) {
        const rName = extractSiteName(c.item.content);
        if (rName === itemName && c.item.section === addedItem.section && c.item.filePath === addedItem.filePath) return c.idx;
      }
      for (const c of candidates) {
        const rName = extractSiteName(c.item.content);
        if (rName === itemName && c.item.section === addedItem.section) return c.idx;
      }
      for (const c of candidates) {
        const rName = extractSiteName(c.item.content);
        if (rName === itemName && c.item.filePath === addedItem.filePath && itemName !== "") return c.idx;
      }
      for (const c of candidates) {
        const rName = extractSiteName(c.item.content);
        if (rName === itemName && itemName !== "") return c.idx;
      }
    }

    if (itemName && itemName.length > 4) {
      for (const c of candidates) {
        const rName = extractSiteName(c.item.content);
        if (rName.length > 4 && Math.abs(rName.length - itemName.length) <= 3) {
          if (calculateLevenshtein(rName, itemName) <= 3) return c.idx;
        }
      }
    }

    return -1;
  }

  added.forEach((addedItem) => {
    const itemName = extractSiteName(addedItem.content);
    const itemUrl = extractSiteUrl(addedItem.content);
    const itemType = getItemType(addedItem.content, addedItem.section);
    let msg = "";
    let actionType = "added";

    const matchIndex = findMatch(addedItem, processedRemoved);
    const isTutorial = addedItem.collection.startsWith('tutorials');

    if (matchIndex !== -1) {
      processedRemoved.add(matchIndex);
      const oldItem = removed[matchIndex];
      const oldItemName = extractSiteName(oldItem.content);

      if (oldItem.section !== addedItem.section || oldItem.filePath !== addedItem.filePath) {
        actionType = "moved";
        const fromLoc = oldItem.filePath && oldItem.filePath !== addedItem.filePath
          ? `${oldItem.section} (${oldItem.filePath})`
          : oldItem.section;
        const toLoc = addedItem.section;

        if (itemType === 'plugin') {
          msg = `plugin ${itemName} moved from ${fromLoc} to ${toLoc}`;
        } else if (itemType === 'list_entry') {
          msg = `list entry ${itemName} moved from ${fromLoc} to ${toLoc}`;
        } else {
          msg = `${isTutorial ? 'tutorial note' : 'site'} ${itemName} moved from ${fromLoc} to ${toLoc}`;
        }
      } else {
        actionType = "updated";
        const displayName = itemName !== oldItemName && oldItemName !== ""
          ? `${oldItemName} → ${itemName}`
          : itemName;

        if (itemType === 'plugin') {
          msg = `plugin ${displayName} updated in section ${addedItem.section}`;
        } else if (itemType === 'list_entry') {
          msg = `list entry ${displayName} updated in ${isTutorial ? 'tutorial' : 'list'} ${addedItem.section}`;
        } else {
          msg = `${isTutorial ? 'tutorial note' : 'site'} ${displayName} updated in section ${addedItem.section}`;
        }
      }
    } else {
      if (itemType === 'plugin') {
        msg = `New plugin ${itemName} added to section ${addedItem.section}`;
      } else if (itemType === 'list_entry') {
        msg = `list entry ${itemName} added to ${isTutorial ? 'tutorial' : 'list'} ${addedItem.section}`;
      } else {
        msg = `New ${isTutorial ? 'tutorial note' : 'site'} ${itemName} added to section ${addedItem.section}`;
      }
    }

    // Sanitize pageUrl to prevent path traversal
    const rawPath = addedItem.filePath ? `/${explicitCollection}/${addedItem.filePath}` : '';
    const pageUrl = rawPath ? sanitizePath(rawPath) : '';

    outputLogs.push({
      message: msg,
      action: actionType,
      type: itemType,
      name: itemName,
      url: itemUrl,
      pageUrl: pageUrl,
      sectionTitle: addedItem.section,
      collectionName: addedItem.collection,
      commitMessage: commitMessage
    });
  });

  removed.forEach((removedItem, idx) => {
    if (processedRemoved.has(idx)) return;

    const itemName = extractSiteName(removedItem.content);
    const itemUrl = extractSiteUrl(removedItem.content);
    const itemType = getItemType(removedItem.content, removedItem.section);
    const isTutorial = removedItem.collection.startsWith('tutorials');

    let msg = "";
    if (itemType === 'plugin') {
      msg = `plugin ${itemName} removed from section ${removedItem.section}`;
    } else if (itemType === 'list_entry') {
      msg = `list entry ${itemName} removed from ${isTutorial ? 'tutorial' : 'list'} ${removedItem.section}`;
    } else {
      msg = `${isTutorial ? 'tutorial note' : 'site'} ${itemName} removed from section ${removedItem.section}`;
    }

    const rawPath = removedItem.filePath ? `/${explicitCollection}/${removedItem.filePath}` : '';
    const pageUrl = rawPath ? sanitizePath(rawPath) : '';

    outputLogs.push({
      message: msg,
      action: "removed",
      type: itemType,
      name: itemName,
      url: itemUrl,
      pageUrl: pageUrl,
      sectionTitle: removedItem.section,
      collectionName: removedItem.collection,
      commitMessage: commitMessage
    });
  });

  return outputLogs;
}

// ---------- Type / Name / URL Extractors (unchanged) ----------

function getItemType(content, section) {
  const clean = content.replace(/^([-*]|\d+\.)\s+/, '').trim();
  const isNumbered = /^\d+\.\s/.test(content);
  if (section.toLowerCase().includes('plugin') || clean.startsWith('**')) return 'plugin';
  if (isNumbered || (!clean.startsWith('[') && (clean.includes(' - ') || clean.includes(' : ')))) return 'list_entry';
  return 'site';
}

function extractSiteName(markdownLine) {
  const clean = markdownLine.replace(/^([-*]|\d+\.)\s+/, '').trim();
  const noBold = clean.replace(/\*\*/g, '');
  const linkMatch = noBold.match(/^\[([^\]]+)\]/);
  if (linkMatch) return linkMatch[1].trim();
  return noBold.split(' - ')[0].split(' : ')[0].trim();
}

function extractSiteUrl(markdownLine) {
  const clean = markdownLine.replace(/^([-*]|\d+\.)\s+/, '').trim();
  const linkMatch = clean.match(/\((https?:\/\/[^\s\)]+)/);
  if (linkMatch) return linkMatch[1].trim();
  const rawUrlMatch = clean.match(/(https?:\/\/[^\s]+)/);
  if (rawUrlMatch) {
    return rawUrlMatch[1].replace(/[.,;!?]+$/, '').trim();
  }
  return "";
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