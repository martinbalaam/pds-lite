# PDS Lite React Template Builder

This prototype is now a React app built with Vite.

## Run

Double-click `Run PDS Lite.command`.

The launcher will:

- install dependencies with `npm install` if `node_modules` is missing
- start the React dev server on `http://127.0.0.1:4173/`
- open the app in your browser

This workspace includes a project-local Node.js runtime under `.tools`, so you do not need a global Node install for this prototype. If the launcher says Node is missing, ask Codex to reinstall the local Node runtime.

## Current Prototype

- Mock PIM product selector with thumbnail, product ID, name, and category.
- React drag-and-drop builder with product attributes and digital assets.
- A4 and Letter page sizing with portrait and landscape orientation.
- Template library with New, Save, and Clone.
- Brand kit with logo and color palette references.
- Element formatting controls for background, borders, corners, text color, and font size.
- Resize handles for selected elements.
- Image/logo elements behave like crop frames when stretched.
- Preview flow with browser print/save-to-PDF support.

Saved templates are stored in browser `localStorage`.
