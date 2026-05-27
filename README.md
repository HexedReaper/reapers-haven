# Reaper's Haven - Collection with all kinds of useful stuff

## Website:
https://lordacid.codeberg.page/reapers-haven

## Contribute
So you have some new cool website to add, awesome idea for collection, or you want to write a whole new tutorial? Or maybe you just see something that can be improved, fixed, deleted, updated? That is amazing! Contributions are always welcome.

### Issues
There is an issue reporter system, implemented right on the website. It is manual, nothing is being "tracked" automatically. 
How issue tracker works? You select text, and you can press the little button `[!]`. It will open reporter menu. Now, you can choose the type of issue to report, and also send some details. That information will be sent to cloudflare worker, which then will create an issue on this codeberg repo using my account and `issues read and write permission`. 

It will use provided information:
- selection
- context (wider, so it is easier to find the issue)
- details (if provided)
- type of issue

If you wish to disable reporter button, you can use the new global toggle button in the website's navigation bar.

### BIGGER IMPROVEMENTS

#### Requirements
To run this thing locally or build it, you just need a few basic tools installed on your machine:
- Node.js (v18 or higher recommended)
- pnpm (package manager used for handling dependencies and deployment scripts)

If you have those, just run `pnpm install` in the root directory to grab all needed packages like Astro and Sharp, and you are ready to go.

#### How to contribute step by step
1. Fork the repository
Go to Codeberg and press that fork button. This will create a copy of the repo under your own account so you can play with code safely.

2. Clone it and create a new branch
Clone your fork to your machine. Always make a new branch for your changes, something like `collection-ABC` or `fix-broken-whatever-it-is`. **Keep it clean**
(`git clone ...`, `git checkout -b new_branch_name`)

3. Make some changes
If you adding a new website or tool, make sure it **fits the topic and website's style**.
If it is a new tutorial, write it clearly so others can follow easily.

4. Test your stuff locally
Before you push anything, run the local server to see if everything builds perfectly and nothing is broken. 
(`pnpm build` `pnpm preview`)


5. Create pull request
Push your branch to your fork and open a pull request **back to the main repository**. 
Tell me what you added or changed and why it is useful. I will look into it as soon as possible!
(`git add .`, `git commit`, `git push -u origin branch_name`)

> Please note, if you just found some typo, broken code block on page or some small mistake while reading, you don't need to do all this git workflow. For those small things, just highlight the text and use the little popup button to report it instantly. This section is only for big improvements, new pages, and content ideas!

## Project
This project built using Astro with a simple layout. You don't need to touch `dist` folder, it is just generated static output after building.

All actual content files are located inside `src content` directory. "Goods" files are right inside `src content goods`, and "tutorials" separated into categories like **android** or **linux** inside `src content tutorials`.

> If you are adding new content, you just need to create markdown file in **the correct folder** and fill the frontmatter parameters at the top before writing text.

### For a new tutorial, use these frontmatter rules
```markdown
title: "Your title here"
date: YYYY-MM-DD
description: "Short description"
tags: ["tag1", "tag2"]
category: "main-category"
subcategory: "sub-category"
```

### For adding new goods, frontmatter is simpler:

```markdown
title: "Your goods title"
description: "Short description of what it is"
```

> if you just want to add some new sites to already existing collection, just **edit** the correct markdown. make sure it is close to actual format. (e.g. same list, or adding some heading, bolding text, etc.)