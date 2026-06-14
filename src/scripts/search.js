//grab list lazily from API
const search_modal = document.querySelector('#search-modal');
const base = search_modal?.dataset.base || '/';
let search_list = [];
let searchLoaded = false;

async function loadSearchData() {
  if (searchLoaded) return search_list;
  try {
    const res = await fetch(`${base}search-index.json`);
    if (res.ok) {
      search_list = await res.json();
      searchLoaded = true;
    }
  } catch (e) {
    console.error("Failed to load search data", e);
  }
  return search_list;
}

// Get multiple non-overlapping snippets from content
function getSnippets(content, query, maxSnippets = 3) {
  if (!content) return [];
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const snippets = [];
  let searchFrom = 0;
  const contextRadius = 55;

  while (snippets.length < maxSnippets) {
    const matchIndex = lowerContent.indexOf(lowerQuery, searchFrom);
    if (matchIndex === -1) break;

    let start = Math.max(0, matchIndex - contextRadius);
    let end = Math.min(content.length, matchIndex + query.length + contextRadius);

    if (start > 0) {
      const wordStart = content.lastIndexOf(' ', start);
      if (wordStart !== -1 && wordStart > start - 25) start = wordStart + 1;
    }
    if (end < content.length) {
      const wordEnd = content.indexOf(' ', end);
      if (wordEnd !== -1 && wordEnd < end + 25) end = wordEnd;
    }

    const overlaps = snippets.some(s => {
      return (start >= s.rawStart - 20 && start <= s.rawEnd + 20) ||
             (end >= s.rawStart - 20 && end <= s.rawEnd + 20) ||
             (start <= s.rawStart && end >= s.rawEnd);
    });

    if (!overlaps) {
      const snippetText = content.substring(start, end);
      const prefix = start > 0 ? '...' : '';
      const suffix = end < content.length ? '...' : '';
      snippets.push({
        text: prefix + snippetText + suffix,
        rawStart: start,
        rawEnd: end
      });
    }
    searchFrom = matchIndex + query.length;
  }
  return snippets;
}

// Escape HTML and highlight query within snippet
function highlightSnippet(snippetText, query) {
  let text = snippetText;
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  text = text.replace(regex, '<mark class="search-snippet-highlight">$1</mark>');
  return text;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(func, timeout = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}

const search_btn = document.querySelector('#open-search-btn');
const close_search_btn = document.querySelector('#close-search-btn');
const searcbox = document.querySelector('#search-input');
const result_count = document.querySelector('#result-count');

// ===============================================================================
// SEARCH INPUT HANDLER (Debounced)
// ===============================================================================
const handleSearchInput = async (event) => {
  const query = event.target.value.trim();
  const search_returns = document.querySelector('#search-results');

  if (!search_returns) return;
  search_returns.innerHTML = "";

  if (!query) {
    if (result_count) result_count.textContent = '';
    return;
  }

  await loadSearchData();

  const filtered_results = search_list.filter((item) => {
    return (item.title && item.title.toLowerCase().includes(query))
        || (item.content && item.content.toLowerCase().includes(query));
  });

  if (result_count) {
    result_count.textContent = `${filtered_results.length}`;
  }

  if (filtered_results.length === 0) {
    const emptyLi = document.createElement('li');
    emptyLi.className = 'search-empty';
    emptyLi.innerHTML = '<span class="empty-icon">∅</span> no results found';
    search_returns.appendChild(emptyLi);
    return;
  }

  filtered_results.forEach(element => {
    const snippets = getSnippets(element.content, query);
    const collection = element.url.includes('/tutorials/') ? 'tutorial' : 'goods';

    const secureUrl = (element.url.startsWith('http://') || element.url.startsWith('https://') || element.url.startsWith('/'))
      ? element.url : '#';
    const highlightUrl = secureUrl + (secureUrl.includes('?') ? '&' : '?') + 'highlight=' + encodeURIComponent(query);

    const li = document.createElement('li');
    li.className = 'search-result-item';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'result-header';
    headerDiv.innerHTML = `
      <span class="result-badge badge-${collection}">${collection}</span>
      <a href="${highlightUrl}" class="result-title">${escapeHtml(element.title)}</a>
    `;
    li.appendChild(headerDiv);

    if (snippets.length > 0) {
      const contextDiv = document.createElement('div');
      contextDiv.className = 'result-context';

      snippets.forEach((snippet, idx) => {
        const snippetDiv = document.createElement('div');
        snippetDiv.className = 'result-snippet';

        if (snippets.length > 1) {
          const indicator = document.createElement('span');
          indicator.className = 'snippet-indicator';
          indicator.textContent = `${idx + 1}`;
          snippetDiv.appendChild(indicator);
        }

        const snippetP = document.createElement('p');
        snippetP.className = 'snippet-text';
        snippetP.innerHTML = highlightSnippet(snippet.text, query);
        snippetDiv.appendChild(snippetP);

        contextDiv.appendChild(snippetDiv);
      });

      li.appendChild(contextDiv);
    }

    search_returns.appendChild(li);
  });
};

searcbox?.addEventListener('input', debounce(handleSearchInput));

// ===============================================================================
// BUTTON & KEY LISTENERS
// ===============================================================================
search_btn?.addEventListener('click', () => {
  search_modal?.showModal();
  loadSearchData();
  searcbox?.focus();
});

close_search_btn?.addEventListener('click', () => {
  search_modal?.close();
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key === 'k') {
    event.preventDefault();
    search_modal?.showModal();
    loadSearchData();
    searcbox?.focus();
  }
  if (event.key === 'Escape' && search_modal?.open) {
    search_modal.close();
  }
});

// Close modal when clicking a result link
document.querySelector('#search-results')?.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (link) {
    search_modal?.close();
  }
});

// ===============================================================================
// PAGE HIGHLIGHT - Highlight search terms when arriving from search results
// ===============================================================================
function highlightSearchTermOnPage() {
  const params = new URLSearchParams(window.location.search);
  const highlightQuery = params.get('highlight');
  if (!highlightQuery) return;

  // Clean URL
  window.history.replaceState({}, '', window.location.pathname);

  const container = document.querySelector('.main-content') || document.querySelector('.goods-content') || document.body;
  let firstMark = null;

  function processTextNodes(element) {
    const childNodes = Array.from(element.childNodes);
    for (const child of childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent;
        const lowerText = text.toLowerCase();
        const lowerQuery = highlightQuery.toLowerCase();

        if (!lowerText.includes(lowerQuery)) continue;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let searchIndex = 0;
        let matchCount = 0;
        const maxMatches = 20;

        while (matchCount < maxMatches) {
          const idx = lowerText.indexOf(lowerQuery, searchIndex);
          if (idx === -1) break;

          if (idx > lastIndex) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex, idx)));
          }

          const mark = document.createElement('mark');
          mark.className = 'search-destination-highlight';
          mark.textContent = text.substring(idx, idx + highlightQuery.length);
          fragment.appendChild(mark);

          if (!firstMark) firstMark = mark;
          lastIndex = idx + highlightQuery.length;
          searchIndex = lastIndex;
          matchCount++;
        }

        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }

        child.parentNode.replaceChild(fragment, child);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName;
        if (tag !== 'SCRIPT' && tag !== 'STYLE' && tag !== 'MARK' &&
            tag !== 'TEXTAREA' && tag !== 'INPUT' && tag !== 'CODE' &&
            tag !== 'PRE') {
          processTextNodes(child);
        }
      }
    }
  }

  processTextNodes(container);

  if (firstMark) {
    setTimeout(() => {
      firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', highlightSearchTermOnPage);
} else {
  highlightSearchTermOnPage();
}

// ===============================================================================
// ISSUE REPORTER
// ===============================================================================
let currentTrigger = null;
let currentPanel = null;
let cachedSelectedText = "";
let cachedContext = "";

const clearReportingUI = () => {
  if (currentTrigger) { currentTrigger.remove(); currentTrigger = null; }
  if (currentPanel) { currentPanel.remove(); currentPanel = null; }
};

const handleSelectionEnd = (event) => {
  const target = event.target;
  const isTouch = event.type === 'touchend';

  if (localStorage.getItem('telemetry_disabled') === 'true') return;

  setTimeout(() => {
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea') {
      clearReportingUI();
      return;
    }
    if (currentPanel && currentPanel.contains(target)) return;
    if (currentTrigger && currentTrigger.contains(target)) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (!selectedText || selectedText.length <= 1 || selectedText.length > 250) {
      clearReportingUI();
      return;
    }

    if (currentTrigger || currentPanel) return;

    cachedSelectedText = selectedText;
    const range = selection.getRangeAt(0);
    cachedContext = (range.commonAncestorContainer.textContent || '').substring(0, 300);
    const rect = range.getBoundingClientRect();

    const trigger = document.createElement('button');
    trigger.className = 'typo-indicator-trigger';
    trigger.innerText = '[!]';

    let triggerLeft = rect.left + window.scrollX + (rect.width / 2) - 15;
    let triggerTop = isTouch ? (rect.bottom + window.scrollY + 15) : (rect.top + window.scrollY - 32);

    if (!isTouch && (rect.top - 32 < 0)) {
      triggerTop = rect.bottom + window.scrollY + 10;
    }

    trigger.style.left = `${triggerLeft}px`;
    trigger.style.top = `${triggerTop}px`;

    document.body.appendChild(trigger);
    currentTrigger = trigger;

    const executeExpansion = (e) => {
      e.stopPropagation();
      e.preventDefault();

      trigger.remove();
      currentTrigger = null;

      const panel = document.createElement('div');
      panel.className = 'typo-reporter-panel';

      const isMobile = window.innerWidth < 600;

      if (isMobile) {
        panel.classList.add('panel-mobile-bottom');
      } else {
        const panelWidth = 300;
        const paddingOffset = 10;
        let targetLeft = rect.left + window.scrollX + (rect.width / 2) - (panelWidth / 2);

        if (targetLeft + panelWidth > window.innerWidth + window.scrollX - paddingOffset) {
          targetLeft = window.innerWidth + window.scrollX - panelWidth - paddingOffset;
        }
        if (targetLeft < window.scrollX + paddingOffset) {
          targetLeft = window.scrollX + paddingOffset;
        }

        const panelEstimatedHeight = 280;
        let targetTop = rect.top + window.scrollY - panelEstimatedHeight;

        if (rect.top - panelEstimatedHeight < 0) {
          targetTop = rect.bottom + window.scrollY + 12;
        }

        panel.style.left = `${targetLeft}px`;
        panel.style.top = `${targetTop}px`;
        panel.style.width = `${panelWidth}px`;
      }

      const truncatedText = cachedSelectedText.length > 80 ? cachedSelectedText.substring(0, 80) + '...' : cachedSelectedText;

      panel.innerHTML = `
        <div class="panel-header">
          <span class="panel-title">[ ISSUE REPORT ]</span>
          <button class="panel-close-btn">[X]</button>
        </div>
        <div class="panel-preview">
          <span class="preview-label">SELECTED:</span>
          <div class="preview-text">"${truncatedText}"</div>
        </div>
        <div class="typo-action-row">
            <button class="typo-flag-btn active" data-type="typo">Typo</button>
            <button class="typo-flag-btn" data-type="error">Bug</button>
            <button class="typo-flag-btn" data-type="update">Outdated</button>
        </div>
        <textarea id="telemetry-note" rows="2" placeholder="Details (Optional)"></textarea>
        <button class="typo-submit-btn">SEND REPORT</button>
      `;

      document.body.appendChild(panel);
      currentPanel = panel;

      panel.querySelector('.panel-close-btn').addEventListener('click', (ev) => {
        ev.stopPropagation();
        clearReportingUI();
      });

      let selectedType = 'typo';
      const flagButtons = panel.querySelectorAll('.typo-flag-btn');
      const noteArea = panel.querySelector('#telemetry-note');
      const submitBtn = panel.querySelector('.typo-submit-btn');

      noteArea.addEventListener('mouseup', (noteEvent) => noteEvent.stopPropagation());
      noteArea.addEventListener('touchend', (noteEvent) => noteEvent.stopPropagation());

      flagButtons.forEach(btn => {
        const handleBtnSelect = (optEvent) => {
          optEvent.preventDefault();
          optEvent.stopPropagation();
          flagButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          selectedType = btn.getAttribute('data-type');
        };
        btn.addEventListener('click', handleBtnSelect);
        btn.addEventListener('touchstart', handleBtnSelect);
      });

      const handleFormSubmit = (submitEvent) => {
        submitEvent.stopPropagation();
        submitEvent.preventDefault();

        submitBtn.innerText = 'TRANSMITTING...';
        submitBtn.disabled = true;
        panel.classList.add('panel-sending');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        fetch("https://reapers-haven-typo-proxy.kranych.workers.dev/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            text: cachedSelectedText,
            context: cachedContext,
            url: window.location.href,
            type: selectedType,
            note: noteArea.value || ''
          })
        })
        .then(res => {
          clearTimeout(timeoutId);
          if (res.ok) {
            submitBtn.innerText = 'LOGGED OK.';
            panel.classList.remove('panel-sending');
            panel.classList.add('panel-success');
            setTimeout(clearReportingUI, 1500);
          } else {
            submitBtn.innerText = 'ERR: REFUSAL';
            panel.classList.remove('panel-sending');
            panel.classList.add('panel-error');
            setTimeout(clearReportingUI, 2000);
          }
        })
        .catch(() => {
          clearTimeout(timeoutId);
          submitBtn.innerText = 'ERR: TIMEOUT';
          panel.classList.remove('panel-sending');
          panel.classList.add('panel-error');
          setTimeout(clearReportingUI, 2000);
        });

        const globalSelection = window.getSelection();
        globalSelection.removeAllRanges();
      };

      submitBtn.addEventListener('click', handleFormSubmit);
      submitBtn.addEventListener('touchstart', handleFormSubmit);
    };

    trigger.addEventListener('touchstart', executeExpansion);
    trigger.addEventListener('click', executeExpansion);
  }, 10);
};

document.addEventListener('mouseup', handleSelectionEnd);
document.addEventListener('touchend', handleSelectionEnd);

document.addEventListener('selectionchange', () => {
  if (localStorage.getItem('telemetry_disabled') === 'true') return;
  const selection = window.getSelection();
  const text = selection.toString().trim();
  if (document.activeElement && (document.activeElement.id === 'telemetry-note')) return;
  if (!text && !currentPanel) {
    clearReportingUI();
  }
});

// ===============================================================================
// ISSUE REPORTING TOGGLE
// ===============================================================================
const toggleBtn = document.querySelector('#toggle-telemetry-btn');
if (toggleBtn) {
  if (localStorage.getItem('telemetry_disabled') === 'true') {
    toggleBtn.innerText = '[ISSUE REPORT: OFF]';
    toggleBtn.classList.add('disabled');
  }
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isDisabled = localStorage.getItem('telemetry_disabled') === 'true';
    if (isDisabled) {
      localStorage.removeItem('telemetry_disabled');
      toggleBtn.innerText = '[ISSUE REPORT: ON]';
      toggleBtn.classList.remove('disabled');
    } else {
      localStorage.setItem('telemetry_disabled', 'true');
      toggleBtn.innerText = '[ISSUE REPORT: OFF]';
      toggleBtn.classList.add('disabled');
      clearReportingUI();
    }
  });
}