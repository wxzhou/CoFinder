# V1.2 UI mockup — static previews

This folder holds **supplementary** static assets for comparing V1.2 visual directions. **Full-fidelity review** should use the live mockup in the app.

## Live mockup (recommended)

1. Run `npm run dev`.
2. Either:
   - Open the renderer URL with the mockup flag, for example:  
     `http://localhost:5173/?mockup=v12`  
     (If port 5173 is busy, Vite may use another port; keep `?mockup=v12` on the URL.)
   - Or launch Electron with:  
     `COFINDER_V12_MOCKUP=1 npm run dev`  
     so the dev window loads `/?mockup=v12` automatically.

The mockup loads **only in development** (`import.meta.env.DEV`). Production builds always load the normal `App`.

## SVG summaries

- `preview-option-a.svg` — schematic for **Option A** (native, restrained).
- `preview-option-b.svg` — schematic for **Option B** (structured dual-pane).
- `preview-option-c.svg` — schematic for **Option C** (modern, airy).

These are **not pixel-perfect screenshots** of the React page; they summarize layout and hierarchy for docs and GitHub.

## Optional: capture real screenshots

From the live mockup page, use macOS **Screenshot** (e.g. `Cmd+Shift+4`) or your preferred tool, then drop PNGs into this folder if you want repo-hosted captures.
