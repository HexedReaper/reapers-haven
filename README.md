# 🌌 Reaper's Haven

> A private, end-to-end encrypted vault for FOSS apps, guides, bug fixes, and personal notes. Live deployment: [reapers-haven.pages.dev](https://reapers-haven.pages.dev/)

## 🔒 What is "Private"?
This isn't just a website with a login screen. The entire dist/ output is encrypted locally via PageCrypt before it ever touches a server. The content consists of private logs, project tracking, and notes that only I can read. Public access is not supported.

## </> What is this Repository?
This repo is the engine. It contains the core logic, Astro configuration, and automation scripts to build an encrypted static site. The actual encrypted HTML files (the /dist folder) and my private notes are strictly kept out of version control. 
You can use this repository as the foundation to create your own private, client-side encrypted notes website.

## (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧ Build Your Own Digital Haven
Looking to stash your notes, tasks, and guides without third-party prying eyes? Here’s how to spin up your own vault.

1. **Fork and Clone** 
    Grab the engine and get a local copy running on your machine.

2. **Organize Your Content**
    - By default, the Astro engine scans `src/content/goods` and `src/content/tutorials`. 
    - To keep your sensitive data tucked away safely outside of this public repo, use symbolic links
    - Create separate, independent local git repositories for your content

3. Make symbolic links:
    ```bash
    ln -s /path/to/your/private/goods ./src/content/goodsln -s /path/to/your/private/tutorials ./src/content/tutorials
    ```

4. Lock It Down!
    Define your access credentials by creating a file named `.vaultpass` in the project root. Drop your password right into that file.

### (ಠ_ಠ) Security Check: Immediately make sure `.vaultpass` is included in your `.gitignore` file. You definitely don’t want to accidentally push your password to a public GitHub repo!


5. Build the Site
    Whenever you make changes to your private markdown files, the internal `goods-tracker.js` will automatically map your git history and generate a `src/data/goods-history.json` file for your Updates tracker page.
    ```bash
    npm install
    npm run build   # or pnpm build / yarn build
    ```

6. Encrypt the Output!
    Once Astro finishes building the static site into the `/dist` folder, run the security pipeline to encrypt all the HTML files and search indexes:
    ```bash
    node src/scripts/secure-vault.mjs
    ```

7. Deploy
    Your `/dist` folder is now a fully encrypted, client-side application. You can safely deploy this folder to Cloudflare Pages, GitHub Pages, Codeberg, or any other static host.

# ⚖️ License & Usage Terms
This engine operates under the **[CC BY-NC-SA 4.0 license](https://creativecommons.org/licenses/by-nc-sa/4.0/).
- *Adaptable*: Feel free to fork, hack, and modify this to perfectly suit your vault needs.
- *Keep it Open*: If you share or build upon this, your version must remain under the same license. No closing the source code.
- *Non-Commercial Only*: This is strictly for personal use. Selling the template, injecting ads, paywalling content, or soliciting donations based on this code is strictly prohibited.
- *Mandatory Attribution*: I require credit as the main developer of the core functions and base engine. If you fork, modify, or use this repository, you are legally required to provide visible credit. Keep the original LICENSE file intact and add the following statement to your project's `README.md` and/or website footer:
    > *"Core vault engine, encryption pipeline, and original architecture developed by [HexedReaper](https://github.com/HexedReaper)."*

## ⚠️ ZERO Liability & "As-Is" Disclaimer
This engine is provided strictly **as-is**. By using, forking, or deploying this code, you accept 100% responsibility for your own data.

- **No Data Recovery**: If you encrypt your vault and lose your .vaultpass, your data is gone. I cannot help you. PageCrypt cannot help you.
- **No Tech Support**: I am not responsible for broken builds, misconfigured symlinks, or accidental deletions of your private repositories. 
- **Zero Liability**: Under no circumstances will the author be held liable for any data loss, security breaches, server costs, or damages arising from the use of this engine.

### Back up your unencrypted src/ files securely. You have been warned. (ಠ_ಠ)


# 🛡️ Disclaimers & Community Code
This repository is the engine for a private, encrypted vault. By interacting with this project—whether through issues, pull requests, or forks—you agree to abide by these rules:

1. **NO Corporate/Monetization BS**
This is a passion project built strictly on FOSS principles. Don't open issues requesting monetization methods and don't submit PRs that introduce telemetry, tracking, paywalls, or "premium" features. Any attempts to commercialize this engine will be rejected, and the associated user will be blocked.

2. **Respect Privacy Context**
The live deployment of Reaper's Haven is end-to-end encrypted by design. To maintain this integrity:
- Do not request the vault password.
- Do not solicit access to my private, personal collections.
- Do not submit PRs that attempt to weaken or bypass the PageCrypt security pipeline.

3. **Contributing to the Core**
I welcome contributions that improve the engine's performance or security. If you find ways to optimize the Astro build, make a better encryption script, or enhance search efficiency, feel free to contribute:
- Ensure your code is clean and well-documented.
- Provide a clear explanation of why your PR improves the core architecture.
- Note that all contributions are subject to the project's CC BY-NC-SA 4.0 license.

4. Forking & Personal Responsibility
You are highly encouraged to fork this project to build your own Haven. However, please understand that I am not responsible for troubleshooting your custom setups. Support is limited strictly to the core engine architecture—if your build fails due to modifications in your private markdown files or local configuration, that falls under your own management.

5. Community Conduct
Keep all interactions in the issues tab focused, technical, and constructive. Harassment, spam, and toxic behavior are not tolerated. Let’s respect FOSS and keep the project environment healthy and productive.

# ♥ Acknowledgments & Credits
This project stands on the shoulders of some incredible open-source tools:
* **[Astro](https://astro.build/):** Powers the core build, providing the speed and flexibility needed for a static site engine.
* **[PageCrypt (by Greenheart)](https://github.com/Greenheart/pagecrypt):** Provides the essential client-side AES-GCM encryption that makes the "Vault" functionality possible. This project wouldn't have this level of automated piping without Samuel Plumppu’s specialized CLI rewrite.
* **[Original PageCrypt](https://github.com/lupine-dev/PageCrypt):** Acknowledgment goes to Max Laumeister for pioneering the original browser-based encryption concept that laid the groundwork for this approach.