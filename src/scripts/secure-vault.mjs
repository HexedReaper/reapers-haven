// src/scripts/secure-vault.mjs
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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
  background:rgb(38, 39, 57); /* Slightly lighter for the modal box */
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

const AUTO_LOGIN_SCRIPT = `
<script data-astro-rerun>
(function() {
  const STORAGE_KEY = 'reapers_haven_vault_token';
  let unlockTried = false;

  function init() {
    if (unlockTried) return;
    unlockTried = true;

    // CRITICAL FIX: PageCrypt caches the derived AES key in sessionStorage ('k').
    // Because each page uses a unique salt, this cached key from a previous page
    // is invalid and causes a decryption failure. We must clear it before
    // PageCrypt's DOMContentLoaded listener tries to use it.
    sessionStorage.removeItem('k');

    const passInput = document.querySelector('input[type="password"]');
    if (!passInput) return;

    // 1. Self-correcting save: store password as user types it manually
    passInput.addEventListener('input', () => {
      if (passInput.value.trim()) {
        localStorage.setItem(STORAGE_KEY, passInput.value);
      }
    });

    // 2. Auto-login if a saved password exists
    const savedPass = localStorage.getItem(STORAGE_KEY);
    if (!savedPass) return;

    // Use the native setter so any framework/listener overhead is bypassed
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value'
    ).set;
    nativeSetter.call(passInput, savedPass);

    // Dispatch every event type PageCrypt might be listening for
    passInput.dispatchEvent(new Event('input',  { bubbles: true }));
    passInput.dispatchEvent(new Event('change', { bubbles: true }));

    // 3. If DOMContentLoaded hasn't fired yet, PageCrypt will see the injected
    // password and submit automatically. We only need to manually submit
    // if the DOM is already completely loaded (e.g., Astro View Transitions).
    if (document.readyState === 'complete') {
      const form = passInput.closest('form');
      const submitBtn = document.querySelector('button[type="submit"], input[type="submit"]') || document.querySelector('button');
      function doSubmit() {
        if (form && typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else if (form) {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        } else if (submitBtn) {
          submitBtn.click();
        }
      }
      // Give PageCrypt's decryption engine a tiny moment to attach listeners
      setTimeout(doSubmit, 50);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already parsed (script is at the end of body)
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
        execSync(`npx pagecrypt "${file}" "${file}" "${PASSWORD}"`);

        let encryptedHtml = fs.readFileSync(file, 'utf8');
        
        // 1. Replace PageCrypt's black default <style> block with our seamless dark modal CSS
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

console.log(`Security layer applied successfully to ${secureCount} paths.`);