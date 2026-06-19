// src/scripts/secure-vault.mjs
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import crypto from 'crypto';

const PASSWORD = fs.readFileSync(path.resolve('.vaultpass'), 'utf8').trim();
const TARGET_DIRS = ['dist'];

const CUSTOM_STYLE = `
<style>
/* Custom Dark Mode Modal Styles */
*,:before,:after{box-sizing:border-box;border:0;margin:0;padding:0}
html,body{
  background:rgb(28, 29, 47);
  color:rgb(192, 251, 226);
  font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;
  height:100vh;
  width:100vw;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
}
.box{
  max-width:380px;
  width:calc(100% - 2rem);
  background:rgb(38, 39, 57);
  border:1px solid rgba(192, 251, 226, 0.15);
  border-radius:8px;
  padding:2rem;
  height:auto;
  box-shadow:0 8px 24px rgba(0,0,0,0.5);
  display:block;
}
#load{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:.75rem;
  color:rgb(135, 185, 165);
}
.spinner{
  width:1.25rem;
  height:1.25rem;
  border:2px solid rgba(192, 251, 226, 0.15);
  border-top-color:rgb(96, 247, 129);
  border-radius:50%;
  animation:spin .8s linear infinite;
}
#load p:last-child{font-size:1rem}
header{
  align-items:center;
  margin-bottom:1.5rem;
  gap:1rem;
  flex-direction:column;
  display:flex;
}
#locked{
  width:2rem;
  height:2rem;
  color:rgb(96, 247, 129);
}
#msg{
  font-size:.9rem;
  min-height:1.2rem;
  color:rgb(135, 185, 165);
}
.red{color:rgb(248, 81, 73) !important}
#pwd{
  font-weight:300;
  border-radius:6px;
  background:rgb(28, 29, 47);
  border:1px solid rgba(192, 251, 226, 0.15);
  padding:.75rem 1rem;
  width:100%;
  color:rgb(192, 251, 226);
  font-size:.95rem;
  outline:none;
}
#pwd:focus{
  border-color:rgb(96, 247, 129);
  box-shadow:0 0 0 3px rgba(96, 247, 129, 0.3);
}
[type=submit]{
  border-radius:6px;
  color:rgb(28, 29, 47);
  background:rgb(96, 247, 129);
  width:100%;
  padding:.75rem 0;
  margin-top:1rem;
  cursor:pointer;
  font-weight:600;
  font-size:.95rem;
  border:none;
}
[type=submit]:hover{background:rgb(126, 255, 159)}
.hidden{display:none!important}
.flex{display:flex !important}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
`;

// =====================================================================
// AUTO-LOGIN SCRIPT
// =====================================================================
const AUTO_LOGIN_SCRIPT = `
<script data-astro-rerun>
(function() {
  var STORAGE_KEY = 'reapers_haven_vault_token';

  // ============================================================
  // 1. Preserve ?highlight= in sessionStorage BEFORE PageCrypts
  // document.write() can destroy it. sessionStorage persists
  // across document.open()/write()/close() within the same tab.
  // ============================================================
  try {
    var params = new URLSearchParams(window.location.search);
    var hl = params.get('highlight');
    if (hl) sessionStorage.setItem('rh_highlight_query', hl);
  } catch(e) {
    try {
      var m = window.location.search.match(/[?&]highlight=([^&]+)/);
      if (m) sessionStorage.setItem('rh_highlight_query', decodeURIComponent(m[1]));
    } catch(e2) {}
  }

  // ============================================================
  // 2. Auto-unlock
  // ============================================================
  var unlockTried = false;

  function attemptUnlock(passInput) {
    if (unlockTried || !passInput) return;
    unlockTried = true;

    //clear PageCrypt's cached AES key. stale keys break rederivation
    sessionStorage.removeItem('k');

    //Read from sessionStorage instead of localStorage
    var savedPass = sessionStorage.getItem(STORAGE_KEY);
    if (!savedPass) return;

    //use native setter to bypass React/Astro input wrappers
    var nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value'
    ).set;
    nativeSetter.call(passInput, savedPass);

    passInput.dispatchEvent(new Event('input',  { bubbles: true }));
    passInput.dispatchEvent(new Event('change', { bubbles: true }));

    function doSubmit() {
      var form = passInput.closest('form');
      var submitBtn = document.querySelector('button[type="submit"], input[type="submit"]') || document.querySelector('button');
      if (form && typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      } else if (submitBtn) {
        submitBtn.click();
      }
    }

    setTimeout(doSubmit, 50);

    //After auto-login, check for "wrong password" error
    //If decryption succeeds, document.write() destroys this context before the timeout fires.
    //If decryption fails, PageCrypt shows #msg.red, and clean up
    setTimeout(function() {
      var msgEl = document.getElementById('msg');
      if (msgEl && msgEl.classList.contains('red')) {
        // Clean up sessionStorage on failure
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem('k');
        unlockTried = false;
      }
    }, 1500);
  }
  // ============================================================
  // 3. Save password to sessionStorage so auto-login works next time.
  // listen on the 'input' event (fires on every keystroke)
  // ============================================================
  function setupPasswordSaving() {
    var passInput = document.querySelector('input[type="password"]');
    if (!passInput) return;

    passInput.addEventListener('input', function() {
      if (passInput.value) {
        //Save to sessionStorage instead of localStorage
        sessionStorage.setItem(STORAGE_KEY, passInput.value);
      }
    });

    // Belt-and-suspenders: also save on form submit if it fires
    var form = document.querySelector('form');
    if (form) {
      form.addEventListener('submit', function() {
        if (passInput.value) {
          sessionStorage.setItem(STORAGE_KEY, passInput.value);
        }
      });
    }
  }

  // ============================================================
  // 4. Init
  // ============================================================
  function init() {
    setupPasswordSaving();

    var savedPass = sessionStorage.getItem(STORAGE_KEY);
    if (!savedPass) return;

    // Check if password input already exists
    var existingInput = document.querySelector('input[type="password"]');
    if (existingInput) {
      attemptUnlock(existingInput);
      return;
    }

    //wait for PageCrypt to inject the input
    var observer = new MutationObserver(function(mutations, obs) {
      var passInput = document.querySelector('input[type="password"]');
      if (passInput) {
        obs.disconnect();
        attemptUnlock(passInput);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(function() { observer.disconnect(); }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
</script>
`;

function getAllHtmlFiles(dirPath, fileList = []) {
  if (!fs.existsSync(dirPath)) return fileList;
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllHtmlFiles(filePath, fileList);
    } else if (file === 'index.html') {
      fileList.push(filePath);
    }
  });
  return fileList;
}

console.log('🔒 Starting vault encryption pipeline...');

let secureCount = 0;
TARGET_DIRS.forEach((dir) => {
  const absolutePath = path.resolve(dir);
  if (fs.existsSync(absolutePath)) {
    const htmlFiles = getAllHtmlFiles(absolutePath);
    htmlFiles.forEach((file) => {
      try {
        // Use execFileSync to prevent shell injection and shell history logging
        execFileSync('npx', ['pagecrypt', file, file, PASSWORD], { stdio: 'pipe' });

        let encryptedHtml = fs.readFileSync(file, 'utf8');
        
        // 1. Replace PageCrypt's default style
        encryptedHtml = encryptedHtml.replace(/<style>[\s\S]*?<\/style>/, CUSTOM_STYLE);
        
        // 2. Inject the auto-login script before </body>
        encryptedHtml = encryptedHtml.replace(
          '</body>',
          AUTO_LOGIN_SCRIPT + '\n</body>'
        );
        
        fs.writeFileSync(file, encryptedHtml, 'utf8');

        console.log(`Secured & Patched: ${path.relative(process.cwd(), file)}`);
        secureCount++;
      } catch (err) {
        console.error(`!!Failed to secure: ${file}`, err.message);
      }
    });
  }
});

// =====================================================================
// ENCRYPT SEARCH INDEX (PBKDF2)
// =====================================================================
const searchIndexPath = path.resolve('dist/search-index.json');
if (fs.existsSync(searchIndexPath)) {
  try {
    const plaintext = fs.readFileSync(searchIndexPath, 'utf8');
    
    // 1. Generate a random salt for PBKDF2
    const salt = crypto.randomBytes(16);
    // 2. Derive key using PBKDF2 (600,000 iterations)
    const key = crypto.pbkdf2Sync(PASSWORD, salt, 600000, 32, 'sha256');
    
    const iv = crypto.randomBytes(12); 
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    
    //format: salt:iv:authTag:ciphertext
    const payload = salt.toString('hex') + ':' + iv.toString('hex') + ':' + authTag + ':' + encrypted;
    
    fs.writeFileSync(path.resolve('dist/search-index.enc'), payload);
    fs.unlinkSync(searchIndexPath); 
    console.log('Encrypted search-index.json to search-index.enc (PBKDF2)');
  } catch (err) {
    console.error('Failed to encrypt search index:', err.message);
  }
}

console.log(`Security layer applied successfully to ${secureCount} paths.`);