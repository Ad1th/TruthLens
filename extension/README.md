# TruthLens Chrome Extension

This folder contains the Chrome extension source code for TruthLens.

- src/ - TypeScript/React source files
- dist/ - Built extension files (output by webpack)
- manifest.json - Chrome extension manifest
- webpack.config.js - Build configuration

## Features

- Real enable/disable analysis toggle in popup
- Background debounce + cache for analysis requests
- Content-script highlighting and insight panel
- Options page for endpoint, sensitivity, heuristics-only mode, and backend health check
- Popup summary of last analysis (score, confidence, flags, provider)

## Build

1. Install dependencies: `npm install`
2. Build: `npx webpack`
3. Load `dist/` as unpacked extension in Chrome

## Backend connection

Default analyze endpoint:

http://127.0.0.1:8000/api/v1/analyze

Change it in Options if needed.
