# Reaper's Haven

## A private collection and archive of FOSS apps, guides, bug fixes, and notes. (Encrypted): [reapers-haven.pages.dev](https://reapers-haven.pages.dev/)

## What does "Private" mean?
This website's content is end-to-end encrypted before it is ever deployed. The content consists mostly of private logs, project tracking, bug fixes, and personal notes.
Because the entire dist/ output is encrypted via PageCrypt, public access is not supported.

## </> What is this repository useful for?
This repository contains the core logic, Astro configuration, and automation scripts to build an encrypted static site. You can use this repository as an engine to create your own private notes website that only you have access to.
The main code and automation features are hosted here on the main branch. The actual encrypted HTML files (the /dist folder) are strictly kept out of version control

## (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧ Build Your Personal, Encrypted Digital Haven
Looking for a way to stash your notes, tasks, and guides without third-party prying eyes? You’ve come to the right place. Here’s how you can spin up your own private vault.

The Initial Setup:
1. Fork and Clone: Start by forking this repo and getting a local copy running on your machine
2. Organize Your Content: By default, the Astro engine scans src/content/goods and src/content/tutorials. To keep your sensitive data tucked away safely outside the public repository, try this:
        1. Create separate, independent local git repositories for your content anywhere you like (e.g., ../my-private-vault).
        2. Use a symbolic link to point the Astro project to your private folders:
            ```shell
            ln -s /path/to/your/private/goods ./src/content/goods
            ln -s /path/to/your/private/tutorials ./src/content/tutorials
            ```
3. Lock It Down: Define your access credentials by creating a file named `.vaultpass` in the project root. Drop your password right into that file.
    (ಠ_ಠ) Security Check: Immediately make sure `.vaultpass` is included in your `.gitignore` file. You definitely don’t want to accidentally push your password to a public GitHub repo!
4. Build the Site
    Whenever you make changes to your private markdown files, the internal `goods-tracker.js` will automatically generate a `src/data/goods-history.json` file for your Updates tracker page.
    To build the site, run:
    ```bash
    npm install
    npm run build   # or pnpm build / yarn build
    ```
5. Encrypt the Output
    Once Astro finishes building the static site into the `/dist` folder, run the security pipeline to encrypt all the HTML files:
        ```bash
        node src/scripts/secure-vault.mjs
        ```
6. Deploy
    Your /dist folder is now a fully encrypted, client-side application. You can safely deploy this folder to Cloudflare Pages, GitHub Pages, Codeberg, or any other static host.

# License & Usage Terms
This engine operates under the **[CC BY-NC-SA 4.0 license](https://creativecommons.org/licenses/by-nc-sa/4.0/) (CC BY-NC-SA 4.0)**. Here is breakdown:

**What this means:**
- Adaptable
    Feel free to fork, hack, and modify this to perfectly suit your vault needs.
- Keep it Open
    If you share or build upon this, your version must remain under same license. No closing source code.
- Non-Commercial Only
    This is strictly for personal use. Selling template, injecting ads, paywalling content, or soliciting donations based on this code is strictly prohibited.
- **Mandatory Attribution Requirement**
    I require credit as the main developer of projects core functions and base engine. If you fork, modify, or use this repository to build your own vault, you are legally required to provide visible credit.
    You can fulfill this requirement by keeping original LICENSE file intact and adding following statement to your project's `README.md` and/or website footer:

> *"Core vault engine, encryption pipeline, and original architecture developed by [HexedReaper](https://github.com/HexedReaper)."*

## ZERO Liability & "As-Is" Disclaimer
This engine is provided **strictly as-is**. By using, forking, or deploying this code, you accept 100% responsibility for your own data. 

* **No Data Recovery:** If you encrypt your vault and lose your `.vaultpass`, your data is gone. I cannot help you. PageCrypt cannot help you. 
* **No Tech Support:** I am not responsible for broken builds, misconfigured symlinks, or accidental deletions of your private repositories. 
* **Zero Liability:** Under no circumstances will the author be held liable for any data loss, security breaches, server costs, or damages arising from use of this engine. 

**Back up your unencrypted `src/` files securely.** You have been warned. (ಠ_ಠ)


# Disclaimers & Community Code
This repository is the engine for a private, encrypted vault. By interacting with this project - whether through issues, pull requests, or forks—you agree to abide by these rules:

## 1. NO Corporate/Monetization BS
This is passion project built strictly on FOSS principles. Dont open issues requesting monetization methods and dont submit pull requests that introduce telemetry, tracking, paywalls, or "premium" features. Any attempts to commercialize this engine will be rejected, and asociated user will be blocked. Refer to LICENSE for details.

## 2. Respect Privacy Context
The live deployment of Reaper's Haven is end-to-end encrypted by design. To maintain this integrity:
* Do not request the vault password.
* Do not solicit access to my private, personal collections.
* Do not submit PRs that attempt to weaken or bypass PageCrypt security pipeline.

## 3. Contributing to the Core
We welcome contributions that improve the engine's performance or security. If you find ways to optimize Astro build, make better encryption script, or enhance search efficiency, feel free to contribute:
* Ensure your code is clean and well-documented.
* Provide a clear explanation of why your PR improves core architecture.
* Note that all contributions are subject to projects CC BY-NC-SA 4.0 license.

## 4. Forking & Personal Responsibility
You are encouraged to fork this project to build your own Haven. However, please understand that I am not responsible for troubleshooting your custom setups. Support is limited strictly to core engine architecture - if your build fails due to modifications in your private markdown files or local configuration, that falls under your own management.

## 5. Community Conduct
Keep all interactions in issues tab focused, technical, and constructive. Harassment, spam, and toxic behavior are not tolerated. Let’s respect FOSS and keep project environment healthy and productive.

# ♥ Acknowledgments & Credits
This project stands on shoulders of some incredible open-source tools:
* **[Astro](https://astro.build/):** Powers the core build, providing speed and flexibility needed for static site engine.
* **[PageCrypt (by Greenheart)](https://github.com/Greenheart/pagecrypt):** Provides essential client-side AES-GCM encryption that makes "Vault" functionality possible. This project wouldn't have this level of automated piping without Samuel Plumppu’s specialized CLI rewrite.
* **[Original PageCrypt](https://github.com/lupine-dev/PageCrypt):** Acknowledgment goes to Max Laumeister for pioneering original browser-based encryption concept that laid groundwork for this approach