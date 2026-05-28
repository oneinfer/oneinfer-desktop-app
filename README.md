# OneInfer Edge

Cross-platform Electron and Vite desktop client for the OneInfer developer APIs.

## API Base URL

- Desktop app default: `https://api.oneinfer.ai/v1`
- Override the desktop app default at build time with `VITE_ONEINFER_API_BASE_URL`
- Override the Python helper scripts with `ONEINFER_API_BASE_URL`
- If `https://oneinfer.ai/` is provided, the app normalizes it to the API backend automatically.

## Build

Install dependencies and generate a local production build:

```bash
npm install
npm run build
```

Create installers on the target operating system:

```bash
npm run dist:win
npm run dist:linux
npm run dist:mac
```

Build each installer on its native operating system for the most reliable results:

- Windows: NSIS installer as `OneInfer Desktop windows.exe`
- Linux: single-file AppImage as `OneInfer Desktop linux.AppImage`
- macOS: DMG

Linux users cannot install a Windows `.exe`, so the Linux release artifact remains an AppImage with a Linux-specific name.

`npm run dist:win` now packages into a temporary output directory and then copies only `OneInfer Desktop windows.exe` back into `release/`, which avoids repeated-build failures caused by stale locks in `release/win-unpacked/`.

If you want fixed upload names after a local build, run:

```bash
npm run prepare:upload
```

That command creates upload-ready files in `release/` named `OneInfer Desktop windows.exe` and `OneInfer Desktop linux.AppImage` by copying the latest built installer and AppImage.

Linux packaging is intentionally blocked on native Windows because Electron Builder's Linux packaging flow uses symlink behavior that is unreliable there. Run `npm run dist:linux` from WSL2 Ubuntu or a Linux machine instead.

`npm run dist:linux` produces only the AppImage so the Linux upload stays as a single-file distribution.

The Linux packaging script reuses the existing production `dist/` output and generated icons from `build/` instead of rebuilding them inside WSL. Recommended flow:

```bash
# Windows PowerShell
npm run build

# WSL2 Ubuntu
npm run dist:linux
```

This avoids Linux-native optional dependency issues from packages such as `sharp` and Rollup when the workspace `node_modules` were originally installed on Windows.

Recommended WSL2 flow for Linux artifacts:

```bash
# inside WSL2 Ubuntu, preferably from /home/<user>/...
npm run dist:linux
```

If you open the repo through WSL but keep it under `/mnt/c/...`, the build may still work, but packaging is slower and more prone to filesystem edge cases than a repo stored under `/home/<user>/...`.

The asset pipeline generates `build/icon.png`, `build/icon.ico`, and `build/icon.icns` from `src/assets/oneinfer-logo.png`, so packaging no longer depends on machine-specific paths.
