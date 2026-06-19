// ../src/scripts/search.js
//grab list lazily from API
const search_modal = document.querySelector('#search-modal');
const base = search_modal?.dataset.base || '/';
let search_list = [];
let searchLoaded = false;

// Must match the key in secure-vault.mjs AUTO_LOGIN_SCRIPT
const STORAGE_KEY = 'reapers_haven_vault_token';

async function loadSearchData() {
  if (searchLoaded) return search_list;
  
  // Read from sessionStorage instead of localStorage
  const savedPass = sessionStorage.getItem(STORAGE_KEY);
  if (!savedPass) {
    console.error("Vault password not found in session. Search disabled.");
    const searchBtn = document.querySelector('#open-search-btn');
    if (searchBtn) searchBtn.style.display = 'none';
    return search_list;
  }

  try {
    // Fetch the encrypted file instead of the plaintext JSON
    const res = await fetch(`${base}search-index.enc`);
    if (!res.ok) {
       console.error("Failed to fetch encrypted search index.");
       const searchBtn = document.querySelector('#open-search-btn');
       if (searchBtn) searchBtn.style.display = 'none';
       return search_list;
    }
    
    const payload = await res.text();
    const parts = payload.split(':');
    if (parts.length !== 4) throw new Error("Invalid payload format");
    
    const salt = new Uint8Array(parts[0].match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const iv = new Uint8Array(parts[1].match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const authTag = new Uint8Array(parts[2].match(/.{1,2}/g).map(b => parseInt(b, 16)));
    const ciphertext = new Uint8Array(parts[3].match(/.{1,2}/g).map(b => parseInt(b, 16)));
    
    // WebCrypto expects the authTag appended to the ciphertext for AES-GCM
    const combinedCipher = new Uint8Array(ciphertext.length + authTag.length);
    combinedCipher.set(ciphertext);
    combinedCipher.set(authTag, ciphertext.length);
    
    // Use PBKDF2 to derive the key in the browser
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(savedPass), { name: 'PBKDF2' }, false, ['deriveKey']);
    const cryptoKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      cryptoKey,
      combinedCipher
    );
    
    const decryptedText = new TextDecoder().decode(decryptedBuffer);
    search_list = JSON.parse(decryptedText);
    searchLoaded = true;
    
  } catch (e) {
    console.error("Failed to load or decrypt search data", e);
    const searchBtn = document.querySelector('#open-search-btn');
    if (searchBtn) searchBtn.style.display = 'none';
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
// URL NORMALIZATION
// ===============================================================================
function normalizeSearchUrl(rawUrl) {
  let url = (rawUrl || '').trim();

  //strip query and hash. add owm ?highlight= later
  url = url.split('?')[0].split('#')[0];

  //handle full URLs: https://reapers-haven.pages.dev/tutorials/... → /tutorials/...
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      url = new URL(url).pathname;
    } catch (e) {
      url = url.replace(/^https?:\/\//, '');
      const slashIdx = url.indexOf('/');
      url = slashIdx !== -1 ? url.substring(slashIdx) : '/' + url;
    }
  }

  //handle leading //
  if (url.startsWith('//')) {
    const afterSlashes = url.substring(2);
    const firstSegment = afterSlashes.split('/')[0];
    if (firstSegment.includes('.')) {
      const slashIdx = afterSlashes.indexOf('/');
      url = slashIdx !== -1 ? afterSlashes.substring(slashIdx) : '/';
    } else {
      //double-slash bug — just collapse to single slash
      url = '/' + afterSlashes;
    }
  }

  //ensure leading slash (root-relative)
  if (!url.startsWith('/')) {
    url = '/' + url;
  }

  //if deployed at a subpath (base ≠ '/'), prefix it
  if (base !== '/' && !url.startsWith(base)) {
    const cleanBase = base.replace(/\/+$/, '');
    url = cleanBase + url;
  }

  //ensure trailing slash for directory-style URLs (no file extension).
  //without this, server redirects /path → /path/ and drops ?highlight=
  if (!/\.\w+$/.test(url)) {
    url = url.replace(/\/?$/, '/');
  }

  return url;
}

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

    const secureUrl = normalizeSearchUrl(element.url);
    const highlightUrl = secureUrl + '?highlight=' + encodeURIComponent(query);

    const li = document.createElement('li');
    li.className = 'search-result-item';

    const headerDiv = document.createElement('div');
    headerDiv.className = 'result-header';

    const badge = document.createElement('span');
    badge.className = `result-badge badge-${collection}`;
    badge.textContent = collection;
    headerDiv.appendChild(badge);

    const link = document.createElement('a');
    link.href = highlightUrl;
    link.className = 'result-title';
    link.textContent = element.title;
    headerDiv.appendChild(link);

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
        // XSS-safe DOM manipulation:
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        const parts = snippet.text.split(regex);

        parts.forEach(part => {
          if (regex.test(part)) {
            regex.lastIndex = 0; // Reset regex index for global flag
            const mark = document.createElement('mark');
            mark.className = 'search-snippet-highlight';
            mark.textContent = part; // Safe from XSS
            snippetP.appendChild(mark);
          } else if (part) {
            snippetP.appendChild(document.createTextNode(part)); // Safe from XSS
          }
        });
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

document.querySelector('#search-results')?.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (link) {
    search_modal?.close();
  }
});

// ===============================================================================
// PAGE HIGHLIGHT
// ===============================================================================
function getHighlightQuery() {
  // 1.check URL query params (primary source)
  try {
    const params = new URLSearchParams(window.location.search);
    const val = params.get('highlight');
    if (val) return val;
  } catch (_) { /* URLSearchParams unsupported */ }

  // 2. Fallback: manual URL parse (older Android WebViews)
  try {
    const match = window.location.search.match(/[?&]highlight=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);
  } catch (_) { /* malformed */ }

  // 3.Fallback: sessionStorage (preserved by AUTO_LOGIN_SCRIPT across PageCrypts document.write() decryption)
  try {
    const stored = sessionStorage.getItem('rh_highlight_query');
    if (stored) return stored;
  } catch (_) { /* sessionStorage unavailable */ }

  return null;
}

function highlightSearchTermOnPage() {
  const highlightQuery = getHighlightQuery();
  if (!highlightQuery) {
    //no query => clear any stale sessionStorage
    try { sessionStorage.removeItem('rh_highlight_query'); } catch(_) {}
    return;
  }

  //persist to sessionStorage immediately so it survives document.write()
  try { sessionStorage.setItem('rh_highlight_query', highlightQuery); } catch(_) {}

  let highlightDone = false;
  let observer = null;

  function doHighlight() {
    if (highlightDone) return;

    //if PageCrypt password form is still visible, wait for decryption
    if (document.querySelector('input[type="password"]') || document.getElementById('pwd')) {
      return; //mutationObserver will retry when the form disappears
    }

    const container = document.querySelector('.main-content') ||
                      document.querySelector('.goods-content') ||
                      document.body;
    if (!container) return;

    let firstMark = null;
    let matchCount = 0;
    const maxMatches = 30;

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
      highlightDone = true;
      if (observer) {
        try { observer.disconnect(); } catch(_) {}
      }

      //scroll to first match. robust fallback chain for Android
      setTimeout(() => {
        try {
          if (typeof firstMark.scrollIntoView === 'function') {
            firstMark.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          }
        } catch (_) {
          try {
            firstMark.scrollIntoView(false);
          } catch (_2) {
            const y = firstMark.getBoundingClientRect().top + window.pageYOffset - (window.innerHeight / 2);
            window.scrollTo(0, Math.max(0, y));
          }
        }
      }, 500);
    }

    //clean URL and sessionStorage ONLY after highlighting attempt
    //(not before -the query must survive PageCrypt's document.write)
    try { window.history.replaceState({}, '', window.location.pathname); } catch(_) {}
    try { sessionStorage.removeItem('rh_highlight_query'); } catch(_) {}
  }

  //longer initial delay on mobile for render pipeline
  const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  setTimeout(doHighlight, isMobile ? 400 : 200);

  //catches content that loads after initial DOM
  //(Astro islands, PageCrypt decryption revealing the real content, etc.)
  observer = new MutationObserver((mutations, obs) => {
    if (highlightDone) {
      obs.disconnect();
      return;
    }
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        //small delay to let the new DOM settle
        setTimeout(doHighlight, 200);
        break;
      }
    }
  });

  try {
    observer.observe(document.body, { childList: true, subtree: true });
  } catch(_) { /* MutationObserver unsupported */ }

  // Hard stop after 10 seconds
  setTimeout(() => {
    if (observer) {
      try { observer.disconnect(); } catch(_) {}
    }
    if (!highlightDone) {
      doHighlight(); // one last try
    }
  }, 10000);
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
      const safeTruncatedText = escapeHtml(truncatedText); // FIX: Prevent XSS

      panel.innerHTML = `
        <div class="panel-header">
          <span class="panel-title">[ ISSUE REPORT ]</span>
          <button class="panel-close-btn">[X]</button>
        </div>
        <div class="panel-preview">
          <span class="preview-label">SELECTED:</span>
          <div class="preview-text">"${safeTruncatedText}"</div>
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

        // FIX: Strip query parameters to prevent leaking private search queries
        const safeUrl = window.location.origin + window.location.pathname;

        // Sending data to Cloudflare Worker. The Worker will encrypt it 
        // with AES-256-GCM and commit it to private GitLab.
        fetch("https://reapers-haven-typo-proxy.kranych.workers.dev/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            text: cachedSelectedText,
            context: cachedContext,
            url: safeUrl,
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
          } else if (res.status === 503) {
            //reporter is disabled on the server, hiding UI
            document.querySelectorAll('.typo-indicator-trigger, #toggle-telemetry-btn')
              .forEach(el => el.style.display = 'none');
            clearReportingUI();
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