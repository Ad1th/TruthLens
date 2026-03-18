# TruthLens Chrome Extension

This folder contains the Chrome extension source code for TruthLens.

- `src/` — TypeScript/React source files
- `dist/` — Built extension files (output by webpack)
- `manifest.json` — Chrome extension manifest
- `webpack.config.js` — Build configuration

## Build

1. Install dependencies: `npm install`
2. Build: `npx webpack`
3. Load `dist/` as unpacked extension in Chrome
