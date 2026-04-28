# PDS Lite React Template Builder

This prototype is now a React app built with Vite.

## Local run

Double-click `Run PDS Lite.command`.

The launcher will:

- install dependencies with `npm install` if `node_modules` is missing
- start the React dev server on `http://127.0.0.1:4173/`
- open the app in your browser

This workspace includes a project-local Node.js runtime under `.tools`, so you do not need a global Node install for this prototype. If the launcher says Node is missing, ask Codex to reinstall the local Node runtime.

## Deploy to Railway

This app now includes:

- the React frontend
- the Node/Express backend
- server-side PDF generation
- local file storage for generated PDFs

### 1. Push the repo to GitHub

From the project folder:

```bash
git add .
git commit -m "Prepare PDS Lite for deployment"
git push
```

### 2. Create a Railway project

- Sign in to [Railway](https://railway.app/)
- Create a new project from your GitHub repo

Railway will detect the app automatically.

### 3. Build and start commands

These are already configured in the repo:

- Build command: `npm run build`
- Start command: `npm start`

The Railway deployment config is in:

- [railway.json](./railway.json)

### 4. Add a persistent volume

Generated PDFs are written to the server filesystem, so attach a Railway volume and mount it to:

```text
/app/generated-pdfs
```

Railway exposes the mount path automatically as `RAILWAY_VOLUME_MOUNT_PATH`, and the app is already set up to use it.

### 5. Set environment variables

Add this in Railway:

```text
PUBLIC_BASE_URL=https://your-public-domain.com
```

Use your actual deployed domain here. This is what the app uses when it returns PDF URLs.

Optional:

```text
GENERATED_PDF_DIR=/app/generated-pdfs
```

You usually will not need this if you are using the Railway volume mount path directly, but it is supported.

### 6. Add your domain

In Railway, attach your preferred public hostname, for example:

```text
pds.yourcompany.com
```

Then point DNS to Railway as instructed in their dashboard.

### 7. Test after deployment

Once live, test this full flow:

1. open the app
2. enter the startup password
3. load channels/products from PIM
4. generate a PDF
5. open the generated PDF URL
6. upload the generated PDF to PIM

### Health check

The app exposes:

```text
/api/health
```

Railway uses that path as the deployment health check.

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
