import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const OVERRIDES_PATH = path.resolve('src/scripts/goods-overrides.json');

export function getGoodsHistory() {
  try {
    //get root commit hash to know where the repo started
    const firstCommit = execSync('git rev-list --max-parents=0 HEAD', { encoding: 'utf8' }).trim();
    if (!firstCommit) {
      console.log("Could not find the initial commit repository root.");
      return [];
    }

    //fetch all commits from newest to oldest with their timestamp dates
    const logOutput = execSync(`git log ${firstCommit}..HEAD --format="%H|%at" -- src/content/goods/`, { encoding: 'utf8' });
    if (!logOutput.trim()) {
      console.log("No historical modifications caught in goods directory.");
      return [];
    }

    const commits = logOutput.trim().split('\n')
      .map(line => {
        const [hash, timestamp] = line.split('|');
        const parsedDate = new Date(parseInt(timestamp) * 1000);
        return { hash, date: parsedDate };
      })
      //drop any commits where the date failed to parse
      .filter(commit => !isNaN(commit.date.getTime()));

    let historyLog = [];

    //process each commit block one by one (already ordered newest -> oldest by git log)
    commits.forEach(commit => {
      try {
        let diffOutput = '';
        try {
          //run diff strictly against its immediate parent commit version
          diffOutput = execSync(`git diff ${commit.hash}~1 ${commit.hash} -- src/content/goods/`, { encoding: 'utf8' });
        } catch (parentErr) {
          //fallback if the commit has no parents (e.g. commit containing new files)
          const emptyTreeHash = '4b825dc642cb6eb9a0ea8e4eed6a8740dbe145e7';
          diffOutput = execSync(`git diff ${emptyTreeHash} ${commit.hash} -- src/content/goods/`, { encoding: 'utf8' });
        }

        if (diffOutput.trim()) {
          const formattedDate = commit.date.toISOString().split('T')[0];
          const logs = parseCommitDiff(diffOutput);

          if (logs.length > 0) {
            historyLog.push({
              date: formattedDate,
              logs: logs
            });
          }
        }
      } catch (err) {
        console.warn(`Could not process diff for commit ${commit.hash}, skipping.`);
      }
    });
    // --- APPLY PERSONAL OVERRIDES START ---
    if (fs.existsSync(OVERRIDES_PATH)) {
      try {
        const overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));

        historyLog.forEach(block => {
          block.logs.forEach(item => {
            if (typeof item === 'object' && item !== null) {
              const itemLookupKey = `${item.collectionName}:${item.name}`;
              const sectionLookupKey = `${item.collectionName}:${item.sectionTitle}`;

              //check if the entire section has an override rule
              if (overrides[sectionLookupKey]) {
                const sectionFix = overrides[sectionLookupKey];
                if (sectionFix.sectionTitle) item.sectionTitle = sectionFix.sectionTitle;
              }

              //apply individual item fixes if they exist
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
    // ------

    return historyLog;

  } catch (error) {
    console.error("Error executing repository log analysis:", error.message);
    return [];
  }
}

function parseCommitDiff(diffText) {
  const lines = diffText.split('\n');
  let currentCollection = "";
  let currentSection = "Global";
  let fileLines = [];

  for (let line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      const match = line.match(/[ab]\/src\/content\/goods\/(.+)\.md/);
      currentCollection = match ? match[1] : currentCollection;
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
      //allow lines starting with either a hyphen or an asterisk
      if (content.startsWith('-') || content.startsWith('*') || /^\d+\./.test(content)) {
        fileLines.push({ type: 'added', content, section: currentSection, collection: currentCollection });
      }
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      const content = line.substring(1).trim();
      //allow lines starting with either a hyphen or an asterisk
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
    let actionType = "added"; //used for visual tag color schemes

    //checks name matching, URL destination paths, or string text similarity
    const matchIndex = removed.findIndex((removedItem, idx) => {
      //early return if already processed or from a different collection
      if (processedIndices.has(idx) || removedItem.collection !== addedItem.collection) return false;

      //extract details before doing any length comparisons
      const removedName = extractSiteName(removedItem.content);
      const removedUrl = extractSiteUrl(removedItem.content);

      const lenDiff = Math.abs(removedName.length - itemName.length);

      //only calculate typo distance if strings are relatively similar in length,
      //are not massive paragraphs and are longer than 4 characters
      if (lenDiff <= 3 && removedName.length > 4 && itemName.length > 4 && itemName.length < 100) {
        if (calculateLevenshtein(removedName, itemName) <= 3) return true;
      }

      //strict label name equivalence
      if (removedName === itemName && itemName !== "") return true;

      //direct URL endpoint convergence (catches changing raw URLs to structured text)
      if (removedUrl === itemUrl && itemUrl !== "") return true;

      //fuzzy character similarity threshold (catches minor typos)
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

//helper checker to figure out if it's a URL link, a plugin, or a sub-list item
function getItemType(content, section) {
  const clean = content.replace(/^[-*]\s+/, '').trim();

  //if it's list entry under sections containing "plugin" or explicitly styled with **bold**
  if (section.toLowerCase().includes('plugin') || clean.startsWith('**')) {
    return 'plugin';
  }

  //if it's ordered numbered instruction or doesn't have a markdown link [name](url)
  if (/^\d+\./.test(clean) || (!clean.startsWith('[') && (clean.includes(' - ') || clean.includes(' : ')))) {
    return 'list_entry';
  }

  return 'site';
}

//helper validation checker to isolate raw text description lines
function isSubListBullet(markdownLine) {
  //normalize line by stripping out both leading hyphens, asterisks, and numbers
  const clean = markdownLine.replace(/^([-*]|\d+\.)\s+/, '').trim();

  //if it's an item entry block (link, bold plugin name, or clean description title), pass it through
  if (clean.startsWith('[') || clean.startsWith('**') || clean.includes(' - ') || clean.includes(' : ') || clean.startsWith('http')) {
    return false;
  }

  return true;
}

function extractSiteName(markdownLine) {
  //normalize line by stripping out both leading hyphens, asterisks, and numbers
  const clean = markdownLine.replace(/^([-*]|\d+\.)\s+/, '').trim();

  //strip markdown bold tags if present
  const noBold = clean.replace(/\*\*/g, '');

  const linkMatch = noBold.match(/^\[([^\]]+)\]/);
  if (linkMatch) return linkMatch[1];

  return noBold.split(' - ')[0].split(' : ')[0].trim();
}

//helper to isolate link values for change tracking convergence mapping rules
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