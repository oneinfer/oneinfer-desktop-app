# OneInfer Edge

OneInfer Edge is an Electron app for managing OneInfer developer workflows from one place: account access, GPU instances, API keys, model routing, local self-hosting, and coding-tool setup.

OneInfer Edge provides one focused workspace for AI infrastructure. It helps developers manage GPU instances, developer keys, credits, models, and routing from a Edge edge app.

## What It Does

- Sign in with email OTP
- Manage credits, plans, API keys, routes, and GPU instances
- Deploy local models and expose local inference endpoints
- Build routes across local and cloud targets
- Configure Edge coding tools to use OneInfer models

## Product Areas

- GPU Control: launch, inspect, and manage GPU instances.
- Routing Studio: route requests across local and cloud endpoints.
- Quantization: explore model formats, memory, and latency tradeoffs.
- Model Evals: compare quality, cost, latency, and reliability.
- Training & Finetuning: prepare datasets and track model improvement runs.
- Kernel Optimizations: tune inference paths for better hardware efficiency.

## Authentication

The Edge app uses a developer login flow:

1. Enter the developer email address.
2. Request an OTP from OneInfer.
3. Complete verification to access the workspace.

## Tech Stack

Electron, React 18, Vite, TypeScript, CSS, `lucide-react`, `systeminformation`, and `electron-builder`.

## Requirements

- Node.js 20+
- npm
- Python only for local model/runtime flows and helper scripts
- Native OS build environment for platform-specific packaging

## Setup

```bash
npm install
npm run dev
```

Useful scripts:

```bash
npm run lint          # TypeScript checks
npm run build         # Generate assets and build renderer
npm run preview       # Preview Vite build
npm run dist          # Build Edge installer/package
npm run dist:win      # Windows package
npm run dist:linux    # Linux AppImage
npm run dist:mac      # macOS DMG
```

## Config

Default API backend:

```text
https://api.oneinfer.ai/v1
```

Common environment variables:

- `VITE_ONEINFER_API_BASE_URL`
- `ONEINFER_API_BASE_URL`
- `CLAUDE_CONFIG_DIR`
- `OPENCODE_CONFIG_DIR` / `OPENCODE_CONFIG`
- `KILO_CONFIG_DIR` / `KILO_CONFIG`

Example `.env`:

```bash
VITE_ONEINFER_API_BASE_URL=https://api.oneinfer.ai/v1
ONEINFER_GOOGLE_Edge_CLIENT_ID=your-google-Edge-client-id
ONEINFER_GOOGLE_Edge_CLIENT_SECRET=your-google-Edge-client-secret
```

## Structure

```text
electron/              Electron main and preload processes
src/                   React app, API client, pages, components, helpers, styles
scripts/               Asset generation and packaging helpers
.github/workflows/     Edge release workflow
developer_*.py         API helper scripts
get_gpus.py            GPU/provider helper script
package.json           scripts, dependencies, Electron Builder config
```

## Packaging

Generated artifacts are written under `release/`.

- Windows: NSIS installer
- Linux: AppImage
- macOS: DMG

For upload-ready artifact names after a local build:

```bash
npm run prepare:upload
```

Linux packaging should run on Linux or WSL2. When using WSL2, keep the repo under `/home/<user>/...` for best packaging reliability.
