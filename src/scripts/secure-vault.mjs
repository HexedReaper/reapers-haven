// src/scripts/secure-vault.mjs
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const require = createRequire(import.meta.url);

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
const PBKDF2_ITERATIONS = 2000000;         // Increased to 2M to satisfy pagecrypt v6+ security warnings
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; //Auto-clear password after 30 min
const VISIBILITY_TIMEOUT_MS = 5 * 60 * 1000; //clear if tab hidden for 5 min
const TARGET_DIRS = ['dist'];

// =====================================================================
// DYNAMIC CSP (Fork-ready)
// =====================================================================
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
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
  // frame-ancestors removed: Not supported in <meta> tags, must be handled by _headers
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
  width:100%; 
  margin:0 auto; 
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
  box-sizing:border-box; 
  margin:0 auto; 
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

      sessionStorage.removeItem(STORAGE_KEY);

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
// ASSET INLINER (Prevents plaintext image/font leaks)
// =====================================================================
function inlineAssets(html, distDir, currentFileDir) {
  const DEBUG = true; // Turn on debugging
  const mimeTypes = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '.avif': 'image/avif', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.otf': 'font/otf', '.eot': 'application/vnd.ms-fontobject',
    '.css': 'text/css'
  };

  function toDataUri(rawUrl) {
    try {
      if (rawUrl.startsWith('data:') || rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('//')) {
        return null;
      }

      const cleanUrl = rawUrl.split('?')[0].split('#')[0];
      const ext = path.extname(cleanUrl).toLowerCase();
      
      if (!ext || !mimeTypes[ext]) {
        return null;
      }

      let filePath;

      if (cleanUrl.startsWith('file://')) {
        filePath = decodeURIComponent(cleanUrl.replace(/^file:\/\//, ''));
      } else if (cleanUrl.startsWith('/')) {
        filePath = path.join(distDir, cleanUrl);
      } else {
        filePath = path.resolve(currentFileDir, cleanUrl);
      }

      if (DEBUG) console.log(`  🔍 Eval: ${rawUrl} -> ${filePath}`);

      if (fs.existsSync(filePath)) {
        const mime = mimeTypes[ext];
        let fileContent = fs.readFileSync(filePath);
        
        if (ext === '.css') {
          let cssText = fileContent.toString('utf8');
          cssText = inlineAssets(cssText, distDir, path.dirname(filePath));
          fileContent = Buffer.from(cssText, 'utf8');
        }
        
        const base64 = fileContent.toString('base64');
        if (DEBUG) console.log(`    ✅ Inlined successfully.`);
        return `data:${mime};base64,${base64}`;
      } else {
        if (DEBUG) console.warn(`    ❌ FILE NOT FOUND.`);
      }
    } catch (e) {
      if (DEBUG) console.error(`    ❌ ERROR: ${e.message}`);
    }
    return null;
  }

  // 1. Match src="..." and href="..."
  html = html.replace(/(\s(?:src|href)\s*=\s*")([^"]+)(")/gi, (match, prefix, url, suffix) => {
    const dataUri = toDataUri(url);
    return dataUri ? `${prefix}${dataUri}${suffix}` : match;
  });

  // 2. Match srcset="..."
  html = html.replace(/(\ssrcset\s*=\s*")([^"]+)(")/gi, (match, prefix, srcset, suffix) => {
    const parts = srcset.split(',').map(part => {
      const p = part.trim();
      const spaceIdx = p.indexOf(' ');
      const url = spaceIdx === -1 ? p : p.substring(0, spaceIdx);
      const descriptor = spaceIdx === -1 ? '' : p.substring(spaceIdx);
      const dataUri = toDataUri(url);
      return dataUri ? `${dataUri}${descriptor}` : p;
    });
    return `${prefix}${parts.join(', ')}${suffix}`;
  });

  // 3. Match CSS url(...) 
  html = html.replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote, url) => {
    const dataUri = toDataUri(url);
    return dataUri ? `url(${quote}${dataUri}${quote})` : match;
  });

  // 4. Sanitize ANY remaining file:// or protocol-relative // links
  html = html.replace(/(\s(?:src|href)\s*=\s*")([^"]*file:\/\/\/?[^"]*|\/\/[^"]+)(")/gi, '$1#$3');
  html = html.replace(/(\ssrcset\s*=\s*")([^"]+)(")/gi, (match, prefix, srcset, suffix) => {
    if (!srcset.includes('file://') && !srcset.match(/(^|,\s*)\/\//)) return match;
    const parts = srcset.split(',').map(p => p.trim()).filter(p => {
      const url = p.split(/\s+/)[0];
      return !url.startsWith('file://') && !url.startsWith('//');
    });
    return parts.length > 0 ? `${prefix}${parts.join(', ')}${suffix}` : `${prefix}${suffix}`;
  });
  html = html.replace(/url\((['"]?)(file:\/\/\/?[^'")]+|\/\/[^'")]+)\1\)/gi, 'url($1#$1)');

  // 5. NUCLEAR OPTION
  html = html.replace(/file:\/\/\/?[^\s"'<>()]+/gi, '#');

  return html;
}

// =====================================================================
// CLEANUP: Delete plaintext assets to prevent leaks
// =====================================================================
function deletePlaintextAssets(distDir) {
  let deletedCount = 0;
  const exts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.eot'];
  
  function deleteRecursively(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        deleteRecursively(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (exts.includes(ext)) {
          // Skip favicon.ico as browsers request it implicitly
          if (entry.name === 'favicon.ico') continue;
          fs.unlinkSync(fullPath);
          deletedCount++;
        }
      }
    }
  }

  deleteRecursively(distDir);
  return deletedCount;
}

// =====================================================================
// ENCRYPTION PIPELINE
// =====================================================================
console.log('🔒 Starting vault encryption pipeline...\n');

let pagecryptEncrypt;
let pagecryptVersion = '6.0.0';
try {
  const pagecrypt = await import('pagecrypt');
  pagecryptEncrypt = pagecrypt.encrypt;
  
  try {
    const pkg = require('pagecrypt/package.json');
    pagecryptVersion = pkg.version;
  } catch (_) { /* Fallback to default if package.json unreadable */ }
} catch (e) {
  console.error('❌ FATAL: pagecrypt package not found.');
  console.error('   Install it:  pnpm add -D pagecrypt');
  process.exit(1);
}

const majorVersion = parseInt(pagecryptVersion.split('.')[0], 10);

let secureCount = 0;
const failedFiles = [];

for (const dir of TARGET_DIRS) {
  const absolutePath = path.resolve(dir);
  if (!fs.existsSync(absolutePath)) continue;

  const htmlFiles = getAllHtmlFiles(absolutePath);

  for (const file of htmlFiles) {
    try {
      let originalHtml = fs.readFileSync(file, 'utf8');
      const fileDir = path.dirname(file);
      
      // INLINE ASSETS: Convert all local images/fonts to base64 data URIs
      originalHtml = inlineAssets(originalHtml, absolutePath, fileDir);

      // STRIP SOURCE MAPS: Prevents file:/// security errors and deprecated pragmas warnings
      originalHtml = originalHtml.replace(/\/\/[#@]\s*sourceMappingURL=[^\s]*/g, '');
      originalHtml = originalHtml.replace(/\/\*#\s*sourceMappingURL=[^\s]*\*\//g, '');

      // ✅ THE FIX: Write the modified HTML back to disk so pagecrypt v5/v6 reads the clean version!
      fs.writeFileSync(file, originalHtml, 'utf8');

      let encryptedHtml;
      const iters = PBKDF2_ITERATIONS;

      if (majorVersion >= 7) {
        encryptedHtml = await pagecryptEncrypt(originalHtml, PASSWORD, { hint: "", iterations: iters });
      } else if (majorVersion === 6) {
        await pagecryptEncrypt(file, file, PASSWORD, iters);
        encryptedHtml = fs.readFileSync(file, 'utf8');
      } else if (majorVersion === 5) {
        await pagecryptEncrypt(file, file, PASSWORD, "", iters);
        encryptedHtml = fs.readFileSync(file, 'utf8');
      } else {
        await pagecryptEncrypt(file, file, PASSWORD, iters);
        encryptedHtml = fs.readFileSync(file, 'utf8');
      }

      if (!encryptedHtml || typeof encryptedHtml !== 'string') {
        throw new Error('pagecrypt returned no encrypted HTML');
      }

      encryptedHtml = encryptedHtml.replace(/<style>[\s\S]*?<\/style>/, CUSTOM_STYLE);

      const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${CSP_DIRECTIVES}">`;
      encryptedHtml = encryptedHtml.replace('</head>', `  ${cspMeta}\n</head>`);

      encryptedHtml = encryptedHtml.replace('</body>', AUTO_LOGIN_SCRIPT + '\n</body>');

      fs.writeFileSync(file, encryptedHtml, 'utf8');

      console.log(`  ✓ Secured: ${path.relative(process.cwd(), file)}`);
      secureCount++;
    } catch (err) {
      console.error(`  ❌ Failed: ${path.relative(process.cwd(), file)} — ${err.message}`);
      failedFiles.push(file);
    }
  }
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

    const key = crypto.pbkdf2Sync(PASSWORD, salt, PBKDF2_ITERATIONS, 32, 'sha512');

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
const deletedAssets = deletePlaintextAssets(path.resolve('dist'));
if (deletedAssets > 0) {
  console.log(`  🗑  Deleted ${deletedAssets} plaintext image/font asset(s) from dist to prevent leaks.`);
}

console.log(`\n✅ Security layer applied to ${secureCount} page(s).`);
console.log(`   CSP: enforced (script: self+inline, connect: self+worker, frame: none)`);
console.log(`   Search index: AES-256-GCM + PBKDF2 (${PBKDF2_ITERATIONS.toLocaleString()} iterations)`);
console.log(`   Session timeout: ${SESSION_TIMEOUT_MS / 60000} min | Visibility lock: ${VISIBILITY_TIMEOUT_MS / 60000} min`);