const { app, BrowserWindow, ipcMain } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const si = require('systeminformation');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const appId = 'com.oneinfer.desktop';
let mainWindow = null;
let machineSyncInFlight = null;
let lastMachineSyncAt = 0;
const MACHINE_SYNC_DEBOUNCE_MS = 15000;

const CLAUDE_SETTINGS_SCHEMA_URL = 'https://json.schemastore.org/claude-code-settings.json';
const DEFAULT_ANTHROPIC_MODEL = 'MiniMax-M2.7';

if (process.platform === 'win32') {
  app.setAppUserModelId(appId);
}

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

function getStateFilePath() {
  return path.join(app.getPath('userData'), 'desktop-state.json');
}

function getMachineIdFilePath() {
  return path.join(app.getPath('userData'), 'machine-id.txt');
}

function readState() {
  const filePath = getStateFilePath();
  if (!fs.existsSync(filePath)) {
    return { settings: {}, session: null };
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { settings: {}, session: null };
  }
}

function writeState(nextState) {
  const filePath = getStateFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(nextState, null, 2), 'utf8');
}

function readJsonFile(filePath, fallbackValue = null) {
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${error.message}`);
  }
}

function getClaudeConfigDirectory() {
  return process.env.CLAUDE_CONFIG_DIR
    ? path.resolve(process.env.CLAUDE_CONFIG_DIR)
    : path.join(os.homedir(), '.claude');
}

function getClaudeSettingsFilePath() {
  return path.join(getClaudeConfigDirectory(), 'settings.json');
}

function deriveClaudeBaseUrl(apiBaseUrl) {
  const trimmedBaseUrl = trimTrailingSlash(apiBaseUrl);
  if (!trimmedBaseUrl) {
    throw new Error('API base URL is required to configure Claude Code.');
  }

  try {
    const parsedUrl = new URL(trimmedBaseUrl);
    const normalizedPath = parsedUrl.pathname.replace(/\/+$/, '');
    const serverRoot = normalizedPath.endsWith('/v1')
      ? normalizedPath.slice(0, -3)
      : normalizedPath;

    parsedUrl.pathname = serverRoot || '/';
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return trimTrailingSlash(parsedUrl.toString());
  } catch {
    return trimTrailingSlash(trimmedBaseUrl.replace(/\/v1$/i, ''));
  }
}

function createClaudeCodeApiKeyName() {
  const hostname = (os.hostname() || 'device').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 16) || 'device';
  return `ClaudeCode-${hostname}-${Date.now().toString(36)}`;
}

async function readResponsePayload(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  return response.text();
}

function extractResponseData(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (payload.dataResponse !== undefined) {
    return payload.dataResponse;
  }

  if (payload.data !== undefined) {
    return payload.data;
  }

  return payload;
}

function extractErrorMessage(payload, fallbackMessage) {
  const detail = extractResponseData(payload);

  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (detail && typeof detail === 'object') {
    return detail.message || detail.detail || fallbackMessage;
  }

  if (payload && typeof payload === 'object') {
    return payload?.message || payload?.detail || fallbackMessage;
  }

  return fallbackMessage;
}

async function createClaudeCodeApiKey(payload) {
  const baseUrl = trimTrailingSlash(payload?.apiBaseUrl);
  const session = payload?.session || {};

  if (!baseUrl) {
    throw new Error('API base URL is required to create a Claude Code key.');
  }

  if (!session.developerId || !session.accessToken) {
    throw new Error('A signed-in OneInfer session is required to enable Claude Code.');
  }

  const apiKeyName = createClaudeCodeApiKeyName();
  const requestUrl = new URL(`${baseUrl}/developer/${session.developerId}/create-api-key`);
  requestUrl.searchParams.set('api_key_name', apiKeyName);
  requestUrl.searchParams.set('environment', 'production');

  const response = await fetch(requestUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  const responsePayload = await readResponsePayload(response);
  if (!response.ok) {
    throw new Error(extractErrorMessage(responsePayload, response.statusText));
  }

  const responseData = extractResponseData(responsePayload);
  const apiKey = responseData?.api_key || responsePayload?.api_key;
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('OneInfer did not return a usable API key for Claude Code.');
  }

  return {
    apiKey,
    apiKeyName,
  };
}

function configureClaudeCodeSettings(payload) {
  const apiBaseUrl = trimTrailingSlash(payload?.apiBaseUrl);
  const authToken = toTrimmedString(payload?.authToken);

  if (!apiBaseUrl) {
    throw new Error('API base URL is required to configure Claude Code.');
  }

  if (!authToken) {
    throw new Error('Claude Code authentication token is missing.');
  }

  const settingsFilePath = getClaudeSettingsFilePath();
  const existingSettings = readJsonFile(settingsFilePath, {});
  if (!existingSettings || typeof existingSettings !== 'object' || Array.isArray(existingSettings)) {
    throw new Error('Claude settings.json must contain a top-level JSON object.');
  }

  const existingEnv = existingSettings.env && typeof existingSettings.env === 'object' && !Array.isArray(existingSettings.env)
    ? existingSettings.env
    : {};

  const anthropicBaseUrl = deriveClaudeBaseUrl(apiBaseUrl);
  const anthropicModel =
    toTrimmedString(payload?.anthropicModel)
    || toTrimmedString(existingEnv.ANTHROPIC_MODEL)
    || toTrimmedString(existingSettings.model)
    || DEFAULT_ANTHROPIC_MODEL;
  const nextEnv = {
    ...existingEnv,
    ANTHROPIC_BASE_URL: anthropicBaseUrl,
    ANTHROPIC_AUTH_TOKEN: authToken,
    ANTHROPIC_MODEL: anthropicModel,
  };
  delete nextEnv.CLAUDE_CODE_GIT_BASH_PATH;

  const nextSettings = {
    ...existingSettings,
    $schema: existingSettings.$schema || CLAUDE_SETTINGS_SCHEMA_URL,
    env: nextEnv,
  };
  delete nextSettings.model;

  fs.mkdirSync(path.dirname(settingsFilePath), { recursive: true });
  fs.writeFileSync(settingsFilePath, `${JSON.stringify(nextSettings, null, 2)}\n`, 'utf8');

  return {
    settingsPath: settingsFilePath,
    anthropicBaseUrl,
    anthropicModel,
  };
}

async function enableClaudeCode(payload) {
  const { apiKey, apiKeyName } = await createClaudeCodeApiKey(payload);
  const configResult = configureClaudeCodeSettings({
    apiBaseUrl: payload?.apiBaseUrl,
    authToken: apiKey,
  });

  return {
    ...configResult,
    apiKeyName,
  };
}

function getOrCreateMachineId() {
  const filePath = getMachineIdFilePath();

  try {
    if (fs.existsSync(filePath)) {
      const existingId = fs.readFileSync(filePath, 'utf8').trim();
      if (existingId) {
        return existingId;
      }
    }
  } catch (error) {
    console.warn('[machine-sync] failed to read persisted machine id', error);
  }

  const machineId = crypto.randomUUID().replace(/-/g, '');

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, machineId, 'utf8');
  } catch (error) {
    console.warn('[machine-sync] failed to persist machine id', error);
  }

  return machineId;
}

function trimTrailingSlash(value) {
  return typeof value === 'string' ? value.replace(/\/+$/, '') : '';
}

async function withTimeout(taskFactory, fallbackValue, label, timeoutMs = 4000) {
  let timeoutId;

  try {
    return await Promise.race([
      Promise.resolve().then(() => taskFactory()),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn(`[machine-sync] timed out while reading ${label}`);
          resolve(fallbackValue);
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    console.warn(`[machine-sync] failed while reading ${label}`, error);
    return fallbackValue;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function toGb(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) {
    return null;
  }

  return Number((bytes / (1024 ** 3)).toFixed(2));
}

function toNullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toTrimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getFastOsInfo() {
  return {
    hostname: os.hostname(),
    distro: os.type(),
    platform: process.platform,
    release: os.release(),
    kernel: typeof os.version === 'function' ? os.version() : os.release(),
    arch: os.arch(),
    build: os.release(),
    codename: os.release(),
  };
}

function getFastCpuInfo() {
  const cpus = os.cpus() || [];
  const primaryCpu = cpus[0] || {};
  const speedMhz = typeof primaryCpu.speed === 'number' ? primaryCpu.speed : null;

  return {
    brand: toTrimmedString(primaryCpu.model),
    manufacturer: null,
    physicalCores: null,
    cores: cpus.length || null,
    performanceCores: null,
    efficiencyCores: null,
    processors: 1,
    socket: null,
    speed: speedMhz !== null ? Number((speedMhz / 1000).toFixed(2)) : null,
    speedMax: speedMhz !== null ? Number((speedMhz / 1000).toFixed(2)) : null,
  };
}

function getFastMemoryInfo() {
  const total = os.totalmem();
  const free = os.freemem();

  return {
    total,
    available: free,
    used: total - free,
    free,
    swaptotal: null,
    swapused: null,
  };
}

function getFastNetworkInterfaces() {
  const interfaces = os.networkInterfaces();

  return Object.entries(interfaces).flatMap(([name, addresses]) => {
    const normalizedAddresses = Array.isArray(addresses) ? addresses : [];
    const ipv4 = normalizedAddresses.find((entry) => entry.family === 'IPv4');
    const ipv6 = normalizedAddresses.find((entry) => entry.family === 'IPv6');
    const mac = normalizedAddresses.find((entry) => entry.mac && entry.mac !== '00:00:00:00:00:00');

    return [{
      iface: name,
      ifaceName: name,
      name,
      ip4: ipv4?.address || null,
      ip6: ipv6?.address || null,
      mac: mac?.mac || null,
      internal: Boolean(ipv4?.internal || ipv6?.internal),
      speed: null,
      operstate: null,
      type: null,
    }];
  });
}

async function collectMachineDetails() {
  const fastOsInfo = getFastOsInfo();
  const fastCpu = getFastCpuInfo();
  const fastMemory = getFastMemoryInfo();
  const fastNetworkInterfaces = getFastNetworkInterfaces();

  const [
    system,
    bios,
    baseboard,
    chassis,
    osInfo,
    cpu,
    cpuTemperature,
    currentLoad,
    mem,
    memLayout,
    graphics,
    fsSize,
    networkInterfaces,
  ] = await Promise.all([
    withTimeout(() => si.system(), {}, 'system', 8000),
    withTimeout(() => si.bios(), {}, 'bios', 8000),
    withTimeout(() => si.baseboard(), {}, 'baseboard', 8000),
    withTimeout(() => si.chassis(), {}, 'chassis', 8000),
    withTimeout(() => si.osInfo(), {}, 'osInfo', 2500),
    withTimeout(() => si.cpu(), {}, 'cpu', 2500),
    withTimeout(() => si.cpuTemperature(), {}, 'cpuTemperature'),
    withTimeout(() => si.currentLoad(), {}, 'currentLoad'),
    withTimeout(() => si.mem(), {}, 'memory', 2500),
    withTimeout(() => si.memLayout(), [], 'memoryLayout'),
    withTimeout(() => si.graphics(), { controllers: [] }, 'graphics', 8000),
    withTimeout(() => si.fsSize(), [], 'fsSize', 3000),
    withTimeout(() => si.networkInterfaces(), [], 'networkInterfaces', 2500),
  ]);

  const resolvedOsInfo = Object.keys(osInfo).length > 0 ? osInfo : fastOsInfo;
  const resolvedCpu = Object.keys(cpu).length > 0 ? { ...fastCpu, ...cpu } : fastCpu;
  const resolvedMemory = Object.keys(mem).length > 0 ? { ...fastMemory, ...mem } : fastMemory;
  const resolvedNetworkInterfaces = Array.isArray(networkInterfaces) && networkInterfaces.length > 0
    ? networkInterfaces
    : fastNetworkInterfaces;

  const normalizedNetworkInterfaces = resolvedNetworkInterfaces.map((entry) => ({
    name: entry.iface || entry.ifaceName || entry.name || null,
    mac: toTrimmedString(entry.mac),
    ipv4: toTrimmedString(entry.ip4),
    ipv6: toTrimmedString(entry.ip6),
    internal: Boolean(entry.internal),
    speedMbps: typeof entry.speed === 'number' ? entry.speed : null,
    operstate: toTrimmedString(entry.operstate),
    type: toTrimmedString(entry.type),
  }));

  const gpus = Array.isArray(graphics.controllers) ? graphics.controllers.map((controller) => {
    const vramMb = toNullableNumber(controller.vram);
    const vramBytes = vramMb !== null ? Math.round(vramMb * 1024 * 1024) : null;

    return {
      name: toTrimmedString(controller.name) || toTrimmedString(controller.model),
      vendor: toTrimmedString(controller.vendor),
      model: toTrimmedString(controller.model) || toTrimmedString(controller.name),
      gpuType: controller.bus ? String(controller.bus).toLowerCase() : null,
      vramBytes,
      vramMb,
      vramGb: vramBytes !== null ? toGb(vramBytes) : null,
      driverVersion: toTrimmedString(controller.driverVersion),
      temperatureC: toNullableNumber(controller.temperatureGpu),
      utilizationPercent: toNullableNumber(controller.utilizationGpu),
      bus: toTrimmedString(controller.bus),
      pciBus: toTrimmedString(controller.pciBus),
      deviceName: toTrimmedString(controller.deviceName),
    };
  }) : [];

  return {
    machineId: getOrCreateMachineId(),
    hostname: resolvedOsInfo.hostname || os.hostname(),
    machineName: resolvedOsInfo.hostname || os.hostname(),
    osName: resolvedOsInfo.distro || resolvedOsInfo.platform || os.type(),
    osVersion: resolvedOsInfo.build || resolvedOsInfo.release || os.release(),
    osRelease: resolvedOsInfo.release || os.release(),
    kernelVersion: resolvedOsInfo.kernel || os.version(),
    platform: resolvedOsInfo.platform || process.platform,
    platformVersion: resolvedOsInfo.codename || resolvedOsInfo.release || os.release(),
    architecture: resolvedOsInfo.arch || os.arch(),
    system: {
      manufacturer: toTrimmedString(system.manufacturer),
      model: toTrimmedString(system.model),
      version: toTrimmedString(system.version),
      serial: toTrimmedString(system.serial),
      sku: toTrimmedString(system.sku),
      uuid: toTrimmedString(system.uuid),
      virtual: typeof system.virtual === 'boolean' ? system.virtual : null,
    },
    bios: {
      vendor: toTrimmedString(bios.vendor),
      version: toTrimmedString(bios.version),
      releaseDate: toTrimmedString(bios.releaseDate),
      revision: toTrimmedString(bios.revision),
    },
    baseboard: {
      manufacturer: toTrimmedString(baseboard.manufacturer),
      model: toTrimmedString(baseboard.model),
      version: toTrimmedString(baseboard.version),
      serial: toTrimmedString(baseboard.serial),
      assetTag: toTrimmedString(baseboard.assetTag),
    },
    chassis: {
      manufacturer: toTrimmedString(chassis.manufacturer),
      model: toTrimmedString(chassis.model),
      type: toTrimmedString(chassis.type),
      version: toTrimmedString(chassis.version),
      serial: toTrimmedString(chassis.serial),
      assetTag: toTrimmedString(chassis.assetTag),
    },
    cpu: {
      brand: toTrimmedString(resolvedCpu.brand),
      manufacturer: toTrimmedString(resolvedCpu.manufacturer),
      architecture: resolvedOsInfo.arch || os.arch(),
      physicalCores: toNullableNumber(resolvedCpu.physicalCores),
      logicalCores: toNullableNumber(resolvedCpu.cores),
      performanceCores: toNullableNumber(resolvedCpu.performanceCores),
      efficiencyCores: toNullableNumber(resolvedCpu.efficiencyCores),
      processors: toNullableNumber(resolvedCpu.processors),
      socket: toTrimmedString(resolvedCpu.socket),
      baseSpeedGhz: toNullableNumber(resolvedCpu.speed),
      maxSpeedGhz: toNullableNumber(resolvedCpu.speedMax),
      temperatureC: toNullableNumber(cpuTemperature.main),
      currentLoadPercent: toNullableNumber(currentLoad.currentLoad),
    },
    memory: {
      totalBytes: resolvedMemory.total,
      availableBytes: resolvedMemory.available,
      usedBytes: resolvedMemory.used,
      freeBytes: resolvedMemory.free,
      totalGb: toGb(resolvedMemory.total),
      availableGb: toGb(resolvedMemory.available),
      usedGb: toGb(resolvedMemory.used),
      swapTotalBytes: resolvedMemory.swaptotal,
      swapUsedBytes: resolvedMemory.swapused,
    },
    memoryLayout: Array.isArray(memLayout) ? memLayout.map((entry) => ({
      sizeBytes: entry.size,
      sizeGb: toGb(entry.size),
      bank: toTrimmedString(entry.bank),
      type: toTrimmedString(entry.type),
      clockSpeedMhz: toNullableNumber(entry.clockSpeed),
      formFactor: toTrimmedString(entry.formFactor),
      manufacturer: toTrimmedString(entry.manufacturer),
      partNum: toTrimmedString(entry.partNum),
      serialNum: toTrimmedString(entry.serialNum),
      voltageConfigured: toNullableNumber(entry.voltageConfigured),
    })) : [],
    gpus,
    disks: Array.isArray(fsSize) ? fsSize.map((entry) => ({
      name: toTrimmedString(entry.fs) || toTrimmedString(entry.mount),
      mount: toTrimmedString(entry.mount),
      fsType: toTrimmedString(entry.type),
      totalBytes: entry.size,
      usedBytes: entry.used,
      freeBytes: typeof entry.size === 'number' && typeof entry.used === 'number' ? Math.max(entry.size - entry.used, 0) : null,
      usePercent: toNullableNumber(entry.use),
    })) : [],
    networkInterfaces: normalizedNetworkInterfaces,
    collectedAt: new Date().toISOString(),
    rawPayload: {
      system,
      bios,
      baseboard,
      chassis,
      osInfo: resolvedOsInfo,
      cpu: resolvedCpu,
      cpuTemperature,
      currentLoad,
      mem: resolvedMemory,
      memLayout,
      graphics,
      fsSize,
      networkInterfaces: resolvedNetworkInterfaces,
    },
  };
}

async function performMachineSync(payload) {
  const baseUrl = trimTrailingSlash(payload?.baseUrl);
  const session = payload?.session || {};
  const developerId = session.developerId;
  const accessToken = session.accessToken;

  console.log('[machine-sync] starting', {
    baseUrl,
    developerId,
    hasToken: Boolean(accessToken),
  });

  if (!baseUrl) {
    throw new Error('API base URL is required for machine sync.');
  }

  if (!developerId || !accessToken) {
    throw new Error('Developer session is required for machine sync.');
  }

  const machineDetails = await collectMachineDetails();
  console.log('[machine-sync] collected hardware payload', {
    machineId: machineDetails.machineId,
    hostname: machineDetails.hostname,
    gpuCount: Array.isArray(machineDetails.gpus) ? machineDetails.gpus.length : 0,
  });

  const response = await fetch(`${baseUrl}/developer/${developerId}/machine-details`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(machineDetails),
  });

  let responsePayload = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    responsePayload = await response.json();
  } else {
    responsePayload = await response.text();
  }

  if (!response.ok) {
    const message = typeof responsePayload === 'string'
      ? responsePayload
      : responsePayload?.dataResponse?.message || responsePayload?.detail || response.statusText;
    const printableMessage = typeof message === 'string' ? message : JSON.stringify(message);
    console.error('[machine-sync] backend request failed', {
      status: response.status,
      message,
    });
    throw new Error(printableMessage);
  }

  console.log('[machine-sync] backend request succeeded');

  const responseData = extractResponseData(responsePayload);
  return responseData?.machine || responsePayload?.machine || machineDetails;
}

function syncMachineDetails(payload, options = {}) {
  const force = Boolean(options.force);
  const now = Date.now();

  if (!force && machineSyncInFlight) {
    console.log('[machine-sync] reusing in-flight sync');
    return machineSyncInFlight;
  }

  if (!force && now - lastMachineSyncAt < MACHINE_SYNC_DEBOUNCE_MS) {
    console.log('[machine-sync] skipping duplicate sync within debounce window');
    return Promise.resolve(null);
  }

  lastMachineSyncAt = now;
  machineSyncInFlight = performMachineSync(payload)
    .finally(() => {
      machineSyncInFlight = null;
    });

  return machineSyncInFlight;
}

function triggerMachineSyncFromState(state) {
  const baseUrl = state?.settings?.apiBaseUrl;
  const session = state?.session;

  if (!baseUrl || !session?.developerId || !session?.accessToken) {
    return;
  }

  void syncMachineDetails({ baseUrl, session }).catch((error) => {
    console.error('[machine-sync] automatic state-based sync failed', error);
  });
}

function createWindow() {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = path.join(__dirname, '..', 'build', iconFile);
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#0a1016',
    icon: iconPath,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[electron] window failed to load', {
      errorCode,
      errorDescription,
      validatedURL,
    });
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[electron] window finished load');
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('app:get-state', () => {
    const state = readState();
    triggerMachineSyncFromState(state);
    return state;
  });
  ipcMain.handle('app:save-state', (_event, payload) => {
    writeState(payload);
    triggerMachineSyncFromState(payload);
    return payload;
  });
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-machine-details', async () => collectMachineDetails());
  ipcMain.handle('app:sync-machine-details', async (_event, payload) => syncMachineDetails(payload, { force: true }));
  ipcMain.handle('app:enable-claude-code', async (_event, payload) => enableClaudeCode(payload));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});