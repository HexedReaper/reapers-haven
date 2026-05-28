//grab list directly from HTML element's data attribute
const search_modal = document.querySelector('#search-modal');
const search_list = JSON.parse(search_modal?.dataset.searchlist || '[]');
const searchPayloadNode = document.querySelector('#search-data-payload');

//function to form snippet for result found in content ==========================
function getSnippet(content, query){
  var match_index = content.toLowerCase().indexOf(query.toLowerCase());
  if (match_index === -1) {
      return "";            
  }

  var begin_cut = Math.max(0, match_index - 40);
  var end_cut = match_index+query.length + 40;
  
  //find start of a word, so i dont jst cut in the middle and get some sus results......
  var real_begin = content.lastIndexOf(" ", begin_cut);
  
  if (real_begin === -1){
      real_begin = 0;
  }
  //same for end
  var real_end = content.indexOf(" ", end_cut);
  
  if (real_end === -1){
      real_end = content.length;
  }

  var snippet = content.substring(real_begin, real_end);

  //will look like this: ...i love cats...
  return "..." + snippet + "...";
}


var search_btn = document.querySelector('#open-search-btn');
var close_search_btn = document.querySelector('#close-search-btn') 

var searcbox = document.querySelector('#search-input');

// ===============================================================================
// SEARCHBOX INPUT LISTENER
searcbox?.addEventListener('input', (event) => {
  //query is what user types in input
  var query = event.target.value.toLowerCase();

  //.filter() checks if search_list contains query:
  //it can return both title and content
  var filetered_results = search_list.filter((item)=> {
      return item.title.toLowerCase().includes(query) 
      || item.content.toLowerCase().includes(query);
  });

  //console.log(filetered_results);
  //search-results is for <ul>, where soon will be found results 
  // in forms of link + title OR also snippet for where found in content
  var search_returns = document.querySelector('#search-results');
  
  if (!search_returns) return;
  search_returns.innerHTML = "";
  
  var formed_tags = "";
  //loop through each element of results.
  filetered_results.forEach(element => {
    var snippet_text = getSnippet(element.content, query);
    
    const li = document.createElement('li');
    const anchor = document.createElement('a');
    
    //safely assign text content and attributes
    anchor.textContent = element.title;
    
    //security check: block 'javascript:' or 'data:' URI schemes
    const secureUrl = (element.url.startsWith('http://') || element.url.startsWith('https://') || element.url.startsWith('/')) 
      ? element.url 
      : '#';
    anchor.setAttribute('href', secureUrl);
    li.appendChild(anchor);

    if (snippet_text !== "") {
      const details = document.createElement('details');
      details.style.cssText = "margin-top: 5px; font-size: 0.9em; opacity: 0.8;";
      
      const summary = document.createElement('summary');
      summary.style.cssText = "cursor: pointer; color: var(--accent);";
      summary.textContent = "[+] Expand Context";
      
      const p = document.createElement('p');
      p.style.cssText = "padding-left: 15px; border-left: 1px dashed var(--accent); margin-top: 5px;";
      
      //using textContent guarantees that HTML entities aren't parsed as active nodes
      p.textContent = snippet_text; 
      
      details.appendChild(summary);
      details.appendChild(p);
      li.appendChild(details);
    }
    
    search_returns.appendChild(li);
  });

});

// ===============================================================================
// BTN CLICK LISTENERS
search_btn?.addEventListener('click', (event) => {
  search_modal?.showModal();
});

close_search_btn?.addEventListener('click', (event) => {
  search_modal?.close();
});
// ===============================================================================
// KEYDOWN LISTENER
document.addEventListener('keydown', (event) => {
  //if CTRL+K => open modal and focus on searchbox
  if(event.ctrlKey && event.key === 'k'){
    event.preventDefault();
    search_modal?.showModal();
    searcbox?.focus();
  }
});

// ===============================================================================
// issue reporter
// ===============================================================================
let currentTrigger = null;
let currentPanel = null;

//caching variables to preserve values when focus is dropped or changed
let cachedSelectedText = "";
let cachedContext = "";

const clearReportingUI = () => {
  if (currentTrigger) { currentTrigger.remove(); currentTrigger = null; }
  if (currentPanel) { currentPanel.remove(); currentPanel = null; }
};

const handleSelectionEnd = (event) => {
  const target = event.target;
  const isTouch = event.type === 'touchend';

  //exit instantly if the user disabled reporting
  if (localStorage.getItem('telemetry_disabled') === 'true') return;

  // 10ms delay allows mobile OS to finish native text highlighting before read it
  setTimeout(() => {
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea') {
      clearReportingUI();
      return;
    }
    //ignore clicks inside panel so don't recalculate or drop layout nodes
    if (currentPanel && currentPanel.contains(target)) return;
    if (currentTrigger && currentTrigger.contains(target)) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    //clean up if selection is cleared or out of limits
    if (!selectedText || selectedText.length <= 1 || selectedText.length > 250) {
      clearReportingUI();
      return;
    }

    if (currentTrigger || currentPanel) return;

    //cache string payload parameters immediately to prevent input focus data loss
    cachedSelectedText = selectedText;

    const range = selection.getRangeAt(0);
    cachedContext = (range.commonAncestorContainer.textContent || '').substring(0, 300);
    const rect = range.getBoundingClientRect();

    //1. Render trigger indicator [!]
    const trigger = document.createElement('button');
    trigger.className = 'typo-indicator-trigger';
    trigger.innerText = '[!]';
    
    let triggerLeft = rect.left + window.scrollX + (rect.width / 2) - 15;
    
    // Push below text on mobile so it avoids Android's native Copy/Share menu
    let triggerTop = isTouch ? (rect.bottom + window.scrollY + 15) : (rect.top + window.scrollY - 32);
    
    if (!isTouch && (rect.top - 32 < 0)) {
      triggerTop = rect.bottom + window.scrollY + 10; //flip below if clipping top screen
    }

    trigger.style.left = `${triggerLeft}px`;
    trigger.style.top = `${triggerTop}px`;

    document.body.appendChild(trigger);
    currentTrigger = trigger;

    //2. Expand panel interface (Using touchstart for immediate execution on mobile viewports)
    const executeExpansion = (e) => {
      e.stopPropagation();
      e.preventDefault();
      
      trigger.remove();
      currentTrigger = null;

      const panel = document.createElement('div');
      panel.className = 'typo-reporter-panel';

      const panelWidth = 280;
      const paddingOffset = 10;
      
      let targetLeft = rect.left + window.scrollX + (rect.width / 2) - (panelWidth / 2);
      
      //check horizontal edge collisions
      if (targetLeft + panelWidth > window.innerWidth + window.scrollX - paddingOffset) {
        targetLeft = window.innerWidth + window.scrollX - panelWidth - paddingOffset;
      }
      if (targetLeft < window.scrollX + paddingOffset) {
        targetLeft = window.scrollX + paddingOffset;
      }

      const panelEstimatedHeight = 195;
      let targetTop = rect.top + window.scrollY - panelEstimatedHeight;

      if (rect.top - panelEstimatedHeight < 0) {
        targetTop = rect.bottom + window.scrollY + 12;
        panel.style.borderTop = '1px solid var(--border-glass)';
        panel.style.borderBottom = '3px solid var(--accent-alt)';
      }

      panel.style.left = `${targetLeft}px`;
      panel.style.top = `${targetTop}px`;

      panel.innerHTML = `
        <div class="typo-action-row">
            <button class="typo-flag-btn active" data-type="typo">Typo</button>
            <button class="typo-flag-btn" data-type="error">Bug</button>
            <button class="typo-flag-btn" data-type="update">Outdated</button>
        </div>
        <textarea id="telemetry-note" rows="3" placeholder="Some details (Optional)"></textarea>
        <button class="typo-submit-btn">Send!</button>
      `;

      document.body.appendChild(panel);
      currentPanel = panel;

      let selectedType = 'typo';
      const flagButtons = panel.querySelectorAll('.typo-flag-btn');
      const noteArea = panel.querySelector('#telemetry-note');
      const submitBtn = panel.querySelector('.typo-submit-btn');

      // Prevent mobile touch gestures from collapsing the input canvas window
      noteArea.addEventListener('mouseup', (noteEvent) => noteEvent.stopPropagation());
      noteArea.addEventListener('touchend', (noteEvent) => noteEvent.stopPropagation());

      flagButtons.forEach(btn => {
        const handleBtnSelect = (optEvent) => {
          optEvent.preventDefault(); //prevents the subsequent click event on mobile
          optEvent.stopPropagation();
          optEvent.preventDefault();
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
        
        submitBtn.innerText = 'sending...';
        submitBtn.disabled = true;

        fetch("https://reapers-haven-typo-proxy.kranych.workers.dev/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: cachedSelectedText,
            context: cachedContext,
            url: window.location.href,
            type: selectedType,
            note: noteArea.value || ''
          })
        })
        .then(res => {
          if (res.ok) {
            submitBtn.innerText = 'LOGGED OK.';
            setTimeout(clearReportingUI, 1000);
          } else {
            submitBtn.innerText = 'ERR: REFUSAL';
            setTimeout(clearReportingUI, 2000);
          }
        })
        .catch(() => {
          submitBtn.innerText = 'ERR: TIMEOUT';
          setTimeout(clearReportingUI, 2000);
        });

        const globalSelection = window.getSelection();
        globalSelection.removeAllRanges();
      };

      submitBtn.addEventListener('click', handleFormSubmit);
      submitBtn.addEventListener('touchstart', handleFormSubmit);
    };

    // Fast mobile touch binding + standard desktop cursor fallback
    trigger.addEventListener('touchstart', executeExpansion);
    trigger.addEventListener('click', executeExpansion);
  }, 10);
};

// Bind for both PC (mouse) and Mobile (touch)
document.addEventListener('mouseup', handleSelectionEnd);
document.addEventListener('touchend', handleSelectionEnd);

//mobile viewport selection listener adjustments
document.addEventListener('selectionchange', () => {
  if (localStorage.getItem('telemetry_disabled') === 'true') return;
  const selection = window.getSelection();
  const text = selection.toString().trim();
  
  //do not clear components if user typing inside the box
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
  //sync button view layout with saved local preference state on boot
  if (localStorage.getItem('telemetry_disabled') === 'true') {
    toggleBtn.innerText = '[ISSUE REPORT: OFF]';
    toggleBtn.classList.add('disabled');
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    
    const isDisabled = localStorage.getItem('telemetry_disabled') === 'true';
    
    if (isDisabled) {
      //re-enable state
      localStorage.removeItem('telemetry_disabled');
      toggleBtn.innerText = '[ISSUE REPORT: ON]';
      toggleBtn.classList.remove('disabled');
    } else {
      //disabling state: save state and scrub active UI artifacts off-screen
      localStorage.setItem('telemetry_disabled', 'true');
      toggleBtn.innerText = '[ISSUE REPORT: OFF]';
      toggleBtn.classList.add('disabled');
      clearReportingUI();
    }
  });
}