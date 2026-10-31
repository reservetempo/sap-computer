# Plan

## Shared context (include in every subagent prompt)

- This repo (`C:\Users\DomPC\Desktop\websites\sap-computer`) is a new standalone website for the SAP-1 visualizer, moved out of the user's personal Next.js site at `C:\Users\DomPC\Desktop\websites\dominic_my_website` (source files in `app/sap1/`: `Sap1Visualizer.jsx`, `GamePanel.jsx`, `gameParts.jsx`, `Tour.jsx`, `tourSteps.js`, `sap1Sim.js`, `sap1Parts.js`, `theme.js`, `signalTypes.js`, `sigText.jsx`, `page.jsx`). The old site keeps its copy until the new site is live; don't edit anything there.
- What the visualizer is: an interactive SAP-1 computer (Malvino & Brown, *Digital Computer Electronics*, ch. 10), dark only, with two modes: **Game** (default; a 1970s Altair-style front panel in SVG with period-colored lamps, switches to program the RAM, animations, a 12-mission guided tour) and **Textbook** (a simple light-on-dark block diagram). Click-to-zoom drill-down uses the URL hash. Mode and tour progress live in `localStorage`.
- User decisions: **Vite + React** static site with **Tailwind** (use Tailwind 3.4 so the ported classes work unchanged); git branch `main`, remote `origin` = the public GitHub repo `reservetempo/sap-computer`; an **about/credits footer** crediting Malvino & Brown and linking back to the main site (URL not known yet: keep it as one placeholder constant and hide the link while it's empty); on phones the tour's mission card should be **sticky or collapsible** near the panel; **no landing section, no deploy config**.
- Checking: the preview tool in this session still reads the old site's launch config, so `preview_start {name: "vite-dev"}` won't work. The Vite dev server is already running in a Terminal tab on port 5173: open it with `preview_start {url: "http://localhost:5173"}` and don't start another server. `.claude/launch.json` (`vite-dev`) is there for future sessions in this repo. Also run `npm run build` for anything that touches code (stop the dev server first only if the build complains).
- Git: pull with `git pull --rebase`, push with `git push`.

## Next

4. **Final check** (any file; also check the live GitHub Pages site once 3b is done). `npm run build` clean; check both modes at desktop and 375px (no sideways page scroll), the footer, the sticky tour card, keyboard access (Tab, Enter/Space, Esc), and a full tour run from a fresh visit (clear `localStorage`). Make sure the README is accurate. Also look into this: at 375px, one real (pointer) click on the panel's CLEAR button didn't register while a scripted click did; check that the panel's buttons and levers respond to real clicks and taps at phone size (pointer events, touch-action, the tour card or dimming overlay sitting on top, hit areas). Check that the live site at https://reservetempo.github.io/sap-computer/ has the latest commit after your push (the workflow deploys on push; `gh run list --limit 2`). Fix small issues; report anything bigger as leftover work.

## After Next

- Back in `C:\Users\DomPC\Desktop\websites\dominic_my_website`, task 11 of its plan (remove `/sap1`, point the homepage link at the new site) waits for the user to confirm the new site's URL; it's live at https://reservetempo.github.io/sap-computer/. Fill `MAIN_SITE_URL` here at the same time if they give the main site's URL.

## Done
- Task 1, scaffold and port: fd58d35. Vite 5.4 + React 18.3 + Tailwind 3.4 site; all 10 SAP-1 files copied to `src/sap1/` (removed `"use client"` and the home link); metadata, favicon and dark background in `index.html`; `vite-dev` launch config; README. Build passes. Not yet checked in a browser.
- Task 2, credits footer: 89f08f8. `src/Footer.jsx` credits Malvino & Brown and links to GitHub. `src/config.js` has `MAIN_SITE_URL` (empty, so the link stays hidden) and `REPO_URL`. The footer uses fixed neutral greys because the visualizer sets its `--sap-*` variables only inside its own wrapper.
- Task 3, sticky tour card on phones: b924b30. Below `lg` the current mission is a collapsible card fixed to the bottom (state saved as `sap1-tour-dock`), sharing its logic with the desktop quest log; the first-visit invite shows there too; the page gets matching bottom padding. Expanded, the card can cover up to about 38% of the screen.
- Task 3b, GitHub Pages deploy: 70cdf21. Builds use `base` `/sap-computer/`; `.github/workflows/deploy.yml` deploys every push to `main`; Pages source set to workflow. Live at https://reservetempo.github.io/sap-computer/ (first run succeeded).
