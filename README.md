# Reaper's Haven

## A private collection and archive of FOSS apps, guides, bug fixes, and notes. [❖] Live (Encrypted): [reapers-haven.pages.dev](https://reapers-haven.pages.dev/)

## [x] What does "Private" mean?
This website's content is end-to-end encrypted before it is ever deployed. The content consists mostly of private logs, project tracking, bug fixes, and personal notes.
Because the entire dist/ output is encrypted via PageCrypt, public access is not supported.

## </> What is this repository useful for?
This repository contains the core logic, Astro configuration, and automation scripts to build an encrypted static site. You can use this repository as an engine to create your own private notes website that only you have access to.
The main code and automation features are hosted here on the main branch. The actual encrypted HTML files (the /dist folder) are strictly kept out of version control

## (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧ Build Your Own Private Vault
Want to create your own encrypted vault of notes, to-do lists, and guides without worrying about unauthorized access? Follow these steps:

1. Fork and Clone
    Fork this repository and clone it to your local machine.
2. Set Up Your Content Directories - By default, the Astro site looks for markdown files in `src/content/goods` and `src/content/tutorials`.
    To keep your private markdown files separate from the public site engine:
        1. Create separate local git repositories for your content anywhere on your machine (e.g., `../my-private-goods`).
        2. Symlink those private directories into the cloned Astro project:
            ```shell
            ln -s /path/to/your/private/goods ./src/content/goods
            ln -s /path/to/your/private/tutorials ./src/content/tutorials
            ```
3. Create Your Vault Password
    You need to set the password that will lock your website.
    Create a file named `.vaultpass` in the root of the project and paste your desired password inside it.
    [!] (ಠ_ಠ) CRITICAL: Ensure `.vaultpass` is in your `.gitignore` so you do not accidentally publish your password to GitHub!
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

## License & Usage
This project and its underlying engine are licensed under the **[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-nc-sa/4.0/) (CC BY-NC-SA 4.0)**.

**What this means:**
* **[✓] Share & Adapt:** You are free to fork, copy, and modify this repository to build your own private vault.
* **[✓] ShareAlike (Stays Open):** If you alter, build upon, or distribute this framework, you MUST release your version under this exact same license. You cannot make your modified engine closed-source.
* **[✗] NO Monetization (NonCommercial):** You may NOT use this code, layout, or logic for commercial purposes. This explicitly forbids selling the template, placing advertisements, locking features behind paywalls, or accepting donations based on this codebase. 

**[!] Mandatory Attribution Requirement:**
I require credit as the main developer of the project's core functions and base engine. If you fork, modify, or use this repository to build your own vault, you are legally required to provide visible credit.

You can fulfill this requirement by keeping the original LICENSE file intact and adding the following statement to your project's `README.md` and/or website footer:

> *"Core vault engine, encryption pipeline, and original architecture developed by [HexedReaper](https://github.com/HexedReaper)."*


# [!] Rules of the Haven (Code of Conduct)

This repository provides the engine for a strictly private, encrypted vault. If you are interacting with this repository (opening issues, submitting pull requests, or forking), you are expected to follow these fundamental rules. 

## 1. [✗] NO Corporate/Monetization BS
This is a passion project built on the FOSS ethos. 
Do not open issues asking how to monetize this. Do not submit pull requests that add telemetry, ad-tracking, paywalls, or "premium" features. Any attempt to commercialize this engine will be immediately rejected and the user blocked. Read the `LICENSE`.

## 2. [🔒] Respect Privacy Context
The live version of Reaper's Haven is end-to-end encrypted for a reason. 
* Do **not** open issues asking for the vault password.
* Do **not** ask for access to my personal private collections.
* Do **not** submit PRs attempting to bypass or weaken the PageCrypt security pipeline.

## 3. [✓] Core Engine Contributions are Welcome
If you have a way to make the Astro build faster, the encryption script more secure, or the search script more efficient—we want it! (ﾉ◕ヮ◕)ﾉ*:･ﾟ✧
* Keep your code clean.
* Explain *why* your PR improves the base engine.
* Understand that any code you contribute will be bound by the same **CC BY-NC-SA 4.0** license.

## 4. [❖] Forking & Independence
You are highly encouraged to fork this and build your own Haven. However, if your build breaks because of something you added to your private markdown files, that is on you. Support is only provided for the core engine architecture, not for your personal vault management.

## 5. Be a Decent Human
No harassment, no spamming, no toxic behavior in the issues tab. Keep it technical, keep it focused, and respect the FOSS spirit. (⌐■_■)