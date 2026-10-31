# SAP-1

An interactive visualizer of the SAP-1 ("Simple-As-Possible") computer from Albert Malvino and Jerald Brown's *Digital Computer Electronics* (chapter 10). Toggle a program into memory on a 1970s-style front panel, step the clock through each T state and watch the control signals and buses, or switch to the textbook block diagram and click any part to zoom into it. Built with Vite, React and Tailwind; it runs entirely in the browser.

```sh
npm install
npm run dev     # dev server at http://localhost:5173
npm run build   # static site in dist/
```

## Deploy

Pushes to `main` build and deploy automatically to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`). The live site is at https://reservetempo.github.io/sap-computer/.
