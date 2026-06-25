// src/scripts/secure-vault.mjs
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// =====================================================================
// PASSWORD VALIDATION & PERMISSION CHECK
// =====================================================================
const PASSWORD_PATH = path.resolve('.vaultpass');

if (!fs.existsSync(PASSWORD_PATH)) {
  console.error('❌ FATAL: .vaultpass not found.');
  process.exit(1);
}

// Check file permissions on Unix — auto-fix if group/world readable
if (process.platform !== 'win32') {
  const stats = fs.statSync(PASSWORD_PATH);
  const mode = stats.mode & 0o777;
  if (mode & 0o077) {
    console.warn(`⚠️  .vaultpass is group/world-readable (mode ${mode.toString(8)}). Fixing...`);
    fs.chmodSync(PASSWORD_PATH, 0o600);
  }
}

const PASSWORD = fs.readFileSync(PASSWORD_PATH, 'utf8').trim();

// Validate password strength
if (PASSWORD.length < 12) {
  console.error('❌ FATAL: Vault password must be at least 12 characters. Current:', PASSWORD.length);
  process.exit(1);
}
if (PASSWORD.length > 1024) {
  console.error('❌ FATAL: Vault password too long (max 1024 chars).');
  process.exit(1);
}

// =====================================================================
// CONFIG
// =====================================================================
const PBKDF2_ITERATIONS = 1000000;         //OWASP 2023: ≥600K for SHA-256; we go higher
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; //Auto-clear password after 30 min
const VISIBILITY_TIMEOUT_MS = 5 * 60 * 1000; //clear if tab hidden for 5 min
const TARGET_DIRS = ['dist'];

// =====================================================================
// DYNAMIC CSP (Fork-ready)
// =====================================================================
// Read worker URL from environment variable. Fork users will set this
// to their own worker. If empty, the issue reporter is locked down.
const REPORT_WORKER_URL = process.env.VAULT_REPORT_URL || '';

let connectSrc = "'self'";
if (REPORT_WORKER_URL) {
  try {
    const workerOrigin = new URL(REPORT_WORKER_URL).origin;
    connectSrc += ` ${workerOrigin}`;
  } catch (e) {
    console.warn(`⚠️ Invalid VAULT_REPORT_URL format. Ignoring for CSP.`);
  }
}

const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `connect-src ${connectSrc}`,
  "img-src 'self' data:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join('; ');

// =====================================================================
// CUSTOM STYLE (unchanged from original)
// =====================================================================
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
  width:100%; /* FIX Bug3: Use 100% width with max-width for perfect centering */
  margin:0 auto; /* FIX Bug3: Explicitly center the box */
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
  box-sizing:border-box; /* FIX Bug3: Ensure padding doesn't affect width */
  margin:0 auto; /* FIX Bug3: Center input */
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
// AUTO-LOGIN SCRIPT — hardened with session timeout + visibility lock
// =====================================================================
const AUTO_LOGIN_SCRIPT = `
<script data-astro-rerun>
(function() {
  var STORAGE_KEY = 'reapers_haven_vault_token';
  var SESSION_TIMEOUT_MS = ${SESSION_TIMEOUT_MS};
  var VISIBILITY_TIMEOUT_MS = ${VISIBILITY_TIMEOUT_MS};

  // --- Session timeout helpers ---
  function isSessionExpired() {
    try {
      var ts = parseInt(sessionStorage.getItem(STORAGE_KEY + '_ts') || '0', 10);
      return ts > 0 && (Date.now() - ts > SESSION_TIMEOUT_MS);
    } catch(e) { return true; }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY + '_ts');
      sessionStorage.removeItem(STORAGE_KEY + '_hidden_ts');
      sessionStorage.removeItem('k');
    } catch(e) {}
  }

  // Expire on load
  if (isSessionExpired()) clearSession();

  // --- Visibility-based auto-lock ---
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      try { sessionStorage.setItem(STORAGE_KEY + '_hidden_ts', Date.now().toString()); } catch(e) {}
    } else {
      try {
        var hiddenTs = parseInt(sessionStorage.getItem(STORAGE_KEY + '_hidden_ts') || '0', 10);
        if (hiddenTs > 0 && Date.now() - hiddenTs > VISIBILITY_TIMEOUT_MS) {
          clearSession();
        }
        sessionStorage.removeItem(STORAGE_KEY + '_hidden_ts');
      } catch(e) {}
    }
  });

  // --- Preserve ?highlight= across PageCrypt's document.write() ---
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

  // --- Auto-unlock ---
  var unlockTried = false;

  function attemptUnlock(passInput) {
    if (unlockTried || !passInput) return;
    if (isSessionExpired()) { clearSession(); return; }

    unlockTried = true;
    sessionStorage.removeItem('k');

    var savedPass = sessionStorage.getItem(STORAGE_KEY);
    if (!savedPass) { unlockTried = false; return; }

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

    // If decryption fails, PageCrypt shows #msg.red — clean up
    setTimeout(function() {
      var msgEl = document.getElementById('msg');
      if (msgEl && msgEl.classList.contains('red')) {
        clearSession();
        unlockTried = false;
      }
    }, 1500);
  }

  // --- Save password on input (with timestamp) ---
  function setupPasswordSaving() {
    var passInput = document.querySelector('input[type="password"]');
    if (!passInput) return;

    passInput.addEventListener('input', function() {
      if (passInput.value && passInput.value.length >= 12) {
        sessionStorage.setItem(STORAGE_KEY, passInput.value);
        sessionStorage.setItem(STORAGE_KEY + '_ts', Date.now().toString());
      }
    });

    var form = document.querySelector('form');
    if (form) {
      form.addEventListener('submit', function() {
        if (passInput.value && passInput.value.length >= 12) {
          sessionStorage.setItem(STORAGE_KEY, passInput.value);
          sessionStorage.setItem(STORAGE_KEY + '_ts', Date.now().toString());
        }
      });
    }
  }

  // --- Init ---
  function init() {
    setupPasswordSaving();

    if (isSessionExpired()) { clearSession(); return; }

    var savedPass = sessionStorage.getItem(STORAGE_KEY);
    if (!savedPass) return;

    var existingInput = document.querySelector('input[type="password"]');
    if (existingInput) {
      attemptUnlock(existingInput);
      return;
    }

    var observer = new MutationObserver(function(mutations, obs) {
      var passInput = document.querySelector('input[type="password"]');
      if (passInput) {
        obs.disconnect();
        attemptUnlock(passInput);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
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

// =====================================================================
// FILE WALKER
// =====================================================================
function getAllHtmlFiles(dirPath, fileList = []) {
  if (!fs.existsSync(dirPath)) return fileList;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllHtmlFiles(filePath, fileList);
    } else if (file === 'index.html') {
      fileList.push(filePath);
    }
  }
  return fileList;
}

// =====================================================================
// ENCRYPTION PIPELINE
// =====================================================================
console.log('🔒 Starting vault encryption pipeline...\n');

// Dynamically import pagecrypt Node.js API (avoids password in process args)
let pagecryptEncrypt;
try {
  const pagecrypt = await import('pagecrypt');
  pagecryptEncrypt = pagecrypt.encrypt;
} catch (e) {
  console.error('❌ FATAL: pagecrypt package not found.');
  console.error('   Install it:  pnpm add -D pagecrypt');
  console.error('   The CLI (npx pagecrypt) leaks the password via `ps aux`.');
  process.exit(1);
}

let secureCount = 0;
const failedFiles = [];

for (const dir of TARGET_DIRS) {
  const absolutePath = path.resolve(dir);
  if (!fs.existsSync(absolutePath)) continue;

  const htmlFiles = getAllHtmlFiles(absolutePath);

  for (const file of htmlFiles) {
    try {
      // 1. Encrypt the file in-place using the Node.js API
      //(Signature: inputPath, outputPath, password)
      // PageCrypt defaults to 600,000 PBKDF2 iterations internally.
      await pagecryptEncrypt(file, file, PASSWORD);

      // 2. Read the newly encrypted file to apply our custom patches
      let modifiedHtml = fs.readFileSync(file, 'utf8');

      // 3a. Replace PageCrypt's default style
      modifiedHtml = modifiedHtml.replace(
        /<style>[\s\S]*?<\/style>/,
        CUSTOM_STYLE
      );

      // 3b. Inject CSP meta tag (belt-and-suspenders alongside _headers)
      const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${CSP_DIRECTIVES}">`;
      modifiedHtml = modifiedHtml.replace(
        '</head>',
        `  ${cspMeta}\n</head>`
      );

      // 3c. Inject auto-login script before </body>
      modifiedHtml = modifiedHtml.replace(
        '</body>',
        AUTO_LOGIN_SCRIPT + '\n</body>'
      );

      // 4. Write the final patched HTML back to disk
      fs.writeFileSync(file, modifiedHtml, 'utf8');

      console.log(`  ✓ Secured: ${path.relative(process.cwd(), file)}`);
      secureCount++;
    } catch (err) {
      console.error(`  ❌ Failed: ${path.relative(process.cwd(), file)} — ${err.message}`);
      failedFiles.push(file);
    }
  }
}

// =====================================================================
// FAIL-SAFE: If any HTML file failed to encrypt, DELETE all unencrypted
// HTML to prevent accidental deployment of plaintext content.
// =====================================================================
if (failedFiles.length > 0) {
  console.error(`\n⚠️  ${failedFiles.length} file(s) failed encryption. Cleaning up ALL HTML to prevent plaintext leak...`);
  for (const dir of TARGET_DIRS) {
    const absolutePath = path.resolve(dir);
    if (!fs.existsSync(absolutePath)) continue;
    const allHtml = getAllHtmlFiles(absolutePath);
    for (const file of allHtml) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        // If the file doesn't contain PageCrypt's encrypted payload marker, delete it
        if (!content.includes('__pagecrypt') && !content.includes('AES-GCM')) {
          fs.unlinkSync(file);
          console.log(`  🗑  Deleted unencrypted: ${path.relative(process.cwd(), file)}`);
        }
      } catch (e) { }
    }
  }
  console.error('Aborting. Fix encryption errors before deploying.');
  process.exit(1);
}

// =====================================================================
// ENCRYPT SEARCH INDEX (PBKDF2 + AES-256-GCM)
// =====================================================================
const searchIndexPath = path.resolve('dist/search-index.json');
const searchIndexEncPath = path.resolve('dist/search-index.enc');

if (fs.existsSync(searchIndexPath)) {
  try {
    const plaintext = fs.readFileSync(searchIndexPath, 'utf8');

    // Generate random salt + IV per build
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);

    // Derive key with PBKDF2 (must match search.js)
    const key = crypto.pbkdf2Sync(PASSWORD, salt, PBKDF2_ITERATIONS, 32, 'sha256');

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    // Format: salt:iv:authTag:ciphertext
    const payload = [
      salt.toString('hex'),
      iv.toString('hex'),
      authTag,
      encrypted
    ].join(':');

    // Write encrypted file FIRST, then delete plaintext
    fs.writeFileSync(searchIndexEncPath, payload);
    fs.unlinkSync(searchIndexPath);

    console.log(`\n  ✓ Encrypted search-index.json → search-index.enc (PBKDF2 ${PBKDF2_ITERATIONS.toLocaleString()} iters)`);
  } catch (err) {
    console.error('\n  ❌ Failed to encrypt search index:', err.message);

    // FAIL-SAFE: Always delete plaintext, even on failure
    try { fs.unlinkSync(searchIndexPath); } catch (_) { }
    try { fs.unlinkSync(searchIndexEncPath); } catch (_) { }

    console.error('  🗑  Deleted plaintext search-index.json to prevent leak.');
    process.exit(1);
  }
}

// =====================================================================
// SUMMARY
// =====================================================================
console.log(`\n✅ Security layer applied to ${secureCount} page(s).`);
console.log(`   CSP: enforced (script: self+inline, connect: self+worker, frame: none)`);
console.log(`   Search index: AES-256-GCM + PBKDF2 (${PBKDF2_ITERATIONS.toLocaleString()} iterations)`);
console.log(`   Session timeout: ${SESSION_TIMEOUT_MS / 60000} min | Visibility lock: ${VISIBILITY_TIMEOUT_MS / 60000} min`);