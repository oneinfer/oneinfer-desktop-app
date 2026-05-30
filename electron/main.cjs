const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const si = require('systeminformation');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const appId = 'com.oneinfer.desktop';
let mainWindow = null;
let machineSyncInFlight = null;
let lastMachineSyncAt = 0;
const localModelDeployments = new Map();
const localModelDeploymentsInFlight = new Map();
const localRouteDeployments = new Map();
const MACHINE_SYNC_DEBOUNCE_MS = 15000;
let updaterConfigured = false;
let updateState = {
  phase: 'idle',
  message: 'Updates are idle.',
  version: null,
  progressPercent: null,
};

const CLAUDE_SETTINGS_SCHEMA_URL = 'https://json.schemastore.org/claude-code-settings.json';
const OPENCODE_CONFIG_SCHEMA_URL = 'https://opencode.ai/config.json';
const KILO_CODE_CONFIG_SCHEMA_URL = 'https://app.kilo.ai/config.json';
const DEFAULT_ONEINFER_MODEL = 'MiniMax-M2.7';
const DEFAULT_ONEINFER_CODE_MODEL = 'glm-5.1';
const DEFAULT_KILOCODE_MODEL = 'MiniMax-M2.7';
const DEFAULT_CLAUDE_MODEL = 'haiku';

function readEnvFileValue(name) {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '.env.local'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '.env.local'),
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      if (key !== name) {
        continue;
      }

      return trimmedLine
        .slice(separatorIndex + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
    }
  }

  return '';
}

const CLAUDE_CODE_SETUP_DOCS_URL = 'https://docs.anthropic.com/en/docs/claude-code/setup';
const OPENCODE_SETUP_DOCS_URL = 'https://opencode.ai/docs/';
const WINDOWS_VLLM_VERSION = '0.21.0';
const WINDOWS_VLLM_WHEEL_URL = `https://github.com/SystemPanic/vllm-windows/releases/download/v${WINDOWS_VLLM_VERSION}/vllm-${WINDOWS_VLLM_VERSION}%2Bcu132-cp312-cp312-win_amd64.whl`;
const WINDOWS_VLLM_TORCH_INDEX_URL = 'https://download.pytorch.org/whl/cu130';
const KILO_CODE_SETUP_DOCS_URL = 'https://kilo.ai/docs/code-with-ai/platforms/cli';
const ONEINFER_CODE_MODELS = {
  'MiniMax-M2.7': {
    name: 'MiniMax M2.7',
    limit: {
      context: 128000,
      output: 32000,
    },
  },
  'glm-5.1': {
    name: 'GLM 5.1',
    limit: {
      context: 128000,
      output: 32000,
    },
  },
};

if (process.platform === 'win32') {
  app.setAppUserModelId(appId);
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

function broadcastUpdateState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('app:update-status', updateState);
}

function setUpdateState(patch) {
  updateState = {
    ...updateState,
    ...patch,
  };

  broadcastUpdateState();
}

function sendDeploymentProgress(progress) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send('app:deployment-progress', {
    level: 'info',
    timestamp: Date.now(),
    ...progress,
  });
}

function configureAutoUpdater() {
  if (updaterConfigured) {
    return;
  }

  updaterConfigured = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    setUpdateState({
      phase: 'checking',
      message: 'Checking for updates...',
      progressPercent: null,
    });
  });

  autoUpdater.on('update-available', (info) => {
    setUpdateState({
      phase: 'available',
      version: info?.version || null,
      message: info?.version
        ? `Update ${info.version} is available. Download started.`
        : 'An update is available. Download started.',
      progressPercent: 0,
    });
  });

  autoUpdater.on('update-not-available', () => {
    setUpdateState({
      phase: 'not-available',
      version: app.getVersion(),
      message: 'You already have the latest version.',
      progressPercent: null,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    const progressPercent = Number.isFinite(progress?.percent)
      ? Math.round(progress.percent)
      : null;

    setUpdateState({
      phase: 'downloading',
      message: progressPercent === null
        ? 'Downloading update...'
        : `Downloading update... ${progressPercent}%`,
      progressPercent,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState({
      phase: 'downloaded',
      version: info?.version || null,
      message: info?.version
        ? `Update ${info.version} downloaded. Restart to install.`
        : 'Update downloaded. Restart to install.',
      progressPercent: 100,
    });
  });

  autoUpdater.on('error', (error) => {
    setUpdateState({
      phase: 'error',
      message: error?.message || 'Update check failed.',
      progressPercent: null,
    });
  });
}

function getStateFilePath() {
  return path.join(app.getPath('userData'), 'desktop-state.json');
}

function getMachineIdFilePath() {
  return path.join(app.getPath('userData'), 'machine-id.txt');
}

function readState() {
  const filePath = getStateFilePath();
  let state = { settings: {}, session: null };
  if (fs.existsSync(filePath)) {
    try {
      state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {}
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    state = { settings: {}, session: null };
  }
  if (!state.settings || typeof state.settings !== 'object' || Array.isArray(state.settings)) {
    state.settings = {};
  }
  if (state.settings.claudeCodeProvider !== 'oneinfer' && state.settings.claudeCodeProvider !== 'anthropic') {
    state.settings.claudeCodeProvider = 'anthropic';
  }

  try {
    const devSessionPath = path.join(os.homedir(), '.oneinfer', 'developer_session.json');
    if (fs.existsSync(devSessionPath)) {
      const devSession = JSON.parse(fs.readFileSync(devSessionPath, 'utf8'));
      if (devSession && devSession.access_token && devSession.developer_id) {
        state.session = {
          accessToken: devSession.access_token,
          developerId: devSession.developer_id,
          email: devSession.email || '',
        };
      }
    } else {
      state.session = null;
    }
  } catch (err) {
    console.error('[state] failed to read developer_session.json', err);
  }

  return state;
}

function writeState(nextState) {
  const filePath = getStateFilePath();
  const normalizedState = nextState && typeof nextState === 'object' && !Array.isArray(nextState)
    ? { ...nextState }
    : { settings: {}, session: null };
  normalizedState.settings = normalizedState.settings && typeof normalizedState.settings === 'object' && !Array.isArray(normalizedState.settings)
    ? { ...normalizedState.settings }
    : {};
  if (normalizedState.settings.claudeCodeProvider !== 'oneinfer' && normalizedState.settings.claudeCodeProvider !== 'anthropic') {
    normalizedState.settings.claudeCodeProvider = 'anthropic';
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalizedState, null, 2), 'utf8');

  try {
    const devSessionPath = path.join(os.homedir(), '.oneinfer', 'developer_session.json');
    if (normalizedState && normalizedState.session) {
      const sessionData = {
        access_token: normalizedState.session.accessToken,
        developer_id: normalizedState.session.developerId,
        email: normalizedState.session.email
      };
      fs.mkdirSync(path.dirname(devSessionPath), { recursive: true });
      fs.writeFileSync(devSessionPath, JSON.stringify(sessionData, null, 2), 'utf8');
    } else if (fs.existsSync(devSessionPath)) {
      fs.unlinkSync(devSessionPath);
    }
  } catch (err) {
    console.error('[state] failed to sync developer_session.json', err);
  }

  return normalizedState;
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

function readClaudeSettings() {
  const settingsFilePath = getClaudeSettingsFilePath();
  const existingSettings = readJsonFile(settingsFilePath, {});
  if (!existingSettings || typeof existingSettings !== 'object' || Array.isArray(existingSettings)) {
    throw new Error('Claude settings.json must contain a top-level JSON object.');
  }

  return {
    settingsFilePath,
    existingSettings,
  };
}

function getClaudeSettingsEnv(existingSettings) {
  return existingSettings.env && typeof existingSettings.env === 'object' && !Array.isArray(existingSettings.env)
    ? existingSettings.env
    : {};
}

function getOpenCodeConfigDirectory() {
  return process.env.OPENCODE_CONFIG_DIR
    ? path.resolve(process.env.OPENCODE_CONFIG_DIR)
    : path.join(os.homedir(), '.config', 'opencode');
}

function getOpenCodeConfigFilePath() {
  if (process.env.OPENCODE_CONFIG) {
    return path.resolve(process.env.OPENCODE_CONFIG);
  }

  return path.join(getOpenCodeConfigDirectory(), 'opencode.json');
}

function readOpenCodeConfig() {
  const configFilePath = getOpenCodeConfigFilePath();
  const existingConfig = readJsonFile(configFilePath, {});
  if (!existingConfig || typeof existingConfig !== 'object' || Array.isArray(existingConfig)) {
    throw new Error('OpenCode opencode.json must contain a top-level JSON object.');
  }

  return {
    configFilePath,
    existingConfig,
  };
}

function getKiloCodeConfigDirectory() {
  return process.env.KILO_CONFIG_DIR
    ? path.resolve(process.env.KILO_CONFIG_DIR)
    : path.join(os.homedir(), '.config', 'kilo');
}

function getKiloCodeConfigFilePath() {
  if (process.env.KILO_CONFIG) {
    return path.resolve(process.env.KILO_CONFIG);
  }

  return path.join(getKiloCodeConfigDirectory(), 'kilo.json');
}

function getLegacyKiloCodeConfigFilePath() {
  return path.join(getKiloCodeConfigDirectory(), 'opencode.json');
}

function readKiloCodeConfig() {
  const configFilePath = getKiloCodeConfigFilePath();
  const legacyConfigFilePath = process.env.KILO_CONFIG ? null : getLegacyKiloCodeConfigFilePath();
  const sourceFilePath = fs.existsSync(configFilePath)
    ? configFilePath
    : legacyConfigFilePath && fs.existsSync(legacyConfigFilePath)
      ? legacyConfigFilePath
      : configFilePath;
  const existingConfig = readJsonFile(sourceFilePath, {});
  if (!existingConfig || typeof existingConfig !== 'object' || Array.isArray(existingConfig)) {
    throw new Error('Kilo Code config must contain a top-level JSON object.');
  }

  return {
    configFilePath,
    legacyConfigFilePath,
    existingConfig,
  };
}

function removeLegacyKiloCodeConfig(configFilePath, legacyConfigFilePath) {
  if (!legacyConfigFilePath || path.resolve(configFilePath) === path.resolve(legacyConfigFilePath)) {
    return;
  }

  if (!fs.existsSync(legacyConfigFilePath)) {
    return;
  }

  try {
    fs.unlinkSync(legacyConfigFilePath);
  } catch (error) {
    console.warn('[kilocode] failed to remove legacy config', error);
  }
}

function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...options,
    });
    let stdout = '';
    let stderr = '';
    let timeoutId = null;

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out: ${command}`));
      }, options.timeoutMs);
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (options.onStdout) {
        options.onStdout(text);
      }
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (options.onStderr) {
        options.onStderr(text);
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (code === 0) {
        resolve({ stdout, stderr, code });
        return;
      }

      const error = new Error((stderr || stdout || `Command failed: ${command}`).trim());
      error.code = code;
      reject(error);
    });
  });
}

function stripAnsi(value) {
  return String(value || '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '\n')
    .trim();
}

function formatCommandError(error) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  return stripAnsi(rawMessage);
}

async function commandExists(command) {
  try {
    if (process.platform === 'win32') {
      await runCommand('where.exe', [command], { timeoutMs: 10000 });
    } else {
      await runCommand('sh', ['-lc', `command -v ${command}`], { timeoutMs: 10000 });
    }

    return true;
  } catch {
    return false;
  }
}

function isMacOS() {
  return process.platform === 'darwin' || os.type() === 'Darwin';
}

function getMacOllamaCommandPath() {
  if (!isMacOS()) {
    return null;
  }

  const candidates = [
    '/opt/homebrew/bin/ollama',
    '/usr/local/bin/ollama',
    '/Applications/Ollama.app/Contents/Resources/ollama',
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function getWindowsOllamaCommandPath() {
  if (process.platform !== 'win32') {
    return null;
  }

  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Ollama', 'ollama.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Ollama', 'ollama.exe'),
  ];

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function getWindowsVllmRuntimeDirectory() {
  return path.join(app.getPath('userData'), 'runtimes', 'vllm-windows');
}

function getWindowsVllmPythonPath() {
  return path.join(getWindowsVllmRuntimeDirectory(), 'Scripts', 'python.exe');
}

function getWindowsVllmCommandPath() {
  return path.join(getWindowsVllmRuntimeDirectory(), 'Scripts', 'vllm.exe');
}

async function hasWindowsPython312() {
  try {
    await runCommand('py', ['-3.12', '--version'], { timeoutMs: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function ensureWindowsPython312() {
  if (await hasWindowsPython312()) {
    return;
  }

  if (await commandExists('winget')) {
    await runCommand('winget', [
      'install',
      '--id',
      'Python.Python.3.12',
      '--exact',
      '--accept-package-agreements',
      '--accept-source-agreements',
    ], { timeoutMs: 20 * 60 * 1000 });
  }

  if (!await hasWindowsPython312()) {
    throw new Error('OneInfer Windows vLLM requires Python 3.12. Install Python 3.12 with the py launcher enabled, then try installing vLLM again.');
  }
}

async function getPythonPipCommand() {
  const candidates = [
    { command: 'py', args: ['-3.12', '-m', 'pip'] },
    { command: 'py', args: ['-3.11', '-m', 'pip'] },
    { command: 'py', args: ['-3.10', '-m', 'pip'] },
    { command: 'python3', args: ['-m', 'pip'] },
    { command: 'python', args: ['-m', 'pip'] },
    { command: '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3', args: ['-m', 'pip'] },
    { command: '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3', args: ['-m', 'pip'] },
    { command: '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3', args: ['-m', 'pip'] },
    { command: '/opt/homebrew/bin/python3', args: ['-m', 'pip'] },
    { command: '/usr/local/bin/python3', args: ['-m', 'pip'] },
    { command: '/usr/bin/python3', args: ['-m', 'pip'] },
    { command: 'pip3', args: [] },
    { command: 'pip', args: [] },
    { command: '/Library/Frameworks/Python.framework/Versions/3.11/bin/pip3', args: [] },
    { command: '/Library/Frameworks/Python.framework/Versions/3.12/bin/pip3', args: [] },
    { command: '/Library/Frameworks/Python.framework/Versions/3.13/bin/pip3', args: [] },
    { command: '/opt/homebrew/bin/pip3', args: [] },
    { command: '/usr/local/bin/pip3', args: [] },
  ];

  for (const candidate of candidates) {
    try {
      await runCommand(candidate.command, [...candidate.args, '--version'], { timeoutMs: 10000 });
      return candidate;
    } catch {
      // Try the next pip entry point.
    }
  }

  return null;
}

async function isWindowsManagedVllmInstalled() {
  if (process.platform !== 'win32') {
    return false;
  }

  const pythonPath = getWindowsVllmPythonPath();
  if (!fs.existsSync(pythonPath)) {
    return false;
  }

  try {
    await runCommand(pythonPath, ['-c', 'import vllm'], { timeoutMs: 30000 });
    return true;
  } catch {
    return false;
  }
}

async function installWindowsManagedVllm() {
  await ensureWindowsPython312();

  const runtimeDir = getWindowsVllmRuntimeDirectory();
  const pythonPath = getWindowsVllmPythonPath();

  try {
    if (!fs.existsSync(pythonPath)) {
      fs.mkdirSync(path.dirname(runtimeDir), { recursive: true });
      await runCommand('py', ['-3.12', '-m', 'venv', runtimeDir], {
        timeoutMs: 5 * 60 * 1000,
        onStdout: (text) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:library-install-log', { name: 'vllm', text });
          }
        },
        onStderr: (text) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:library-install-log', { name: 'vllm', text, isError: true });
          }
        }
      });
    }

    await runCommand(pythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip'], {
      timeoutMs: 10 * 60 * 1000,
      onStdout: (text) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:library-install-log', { name: 'vllm', text });
        }
      },
      onStderr: (text) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:library-install-log', { name: 'vllm', text, isError: true });
        }
      }
    });

    await runCommand(pythonPath, [
      '-m',
      'pip',
      'install',
      '--force-reinstall',
      WINDOWS_VLLM_WHEEL_URL,
      '--extra-index-url',
      WINDOWS_VLLM_TORCH_INDEX_URL,
    ], {
      timeoutMs: 45 * 60 * 1000,
      onStdout: (text) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:library-install-log', { name: 'vllm', text });
        }
      },
      onStderr: (text) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('app:library-install-log', { name: 'vllm', text, isError: true });
        }
      }
    });

    if (!await isWindowsManagedVllmInstalled()) {
      throw new Error('OneInfer installed the Windows vLLM runtime, but vLLM could not be imported. Check that the machine has a CUDA 13-compatible NVIDIA driver and try again.');
    }

    return 'installed';
  } catch (error) {
    try {
      const { Notification } = require('electron');
      if (Notification.isSupported()) {
        new Notification({
          title: 'OneInfer Edge',
          body: 'Failed to install Windows vLLM runtime. Check the logs for details.',
        }).show();
      }
    } catch (err) {
      console.error('Failed to show system notification', err);
    }
    throw error;
  }
}

async function isClaudeCodeInstalled() {
  try {
    return await commandExists('claude');
  } catch {
    return false;
  }
}

function getClaudeCodeInstallCommand() {
  if (process.platform === 'win32') {
    return {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'irm https://claude.ai/install.ps1 | iex',
      ],
      label: 'Windows PowerShell installer',
    };
  }

  if (process.platform === 'darwin' || process.platform === 'linux') {
    return {
      command: 'sh',
      args: [
        '-lc',
        'curl -fsSL https://claude.ai/install.sh | bash',
      ],
      label: 'Claude Code shell installer',
    };
  }

  throw new Error(`Claude Code installation is not supported automatically on ${process.platform}. See ${CLAUDE_CODE_SETUP_DOCS_URL}`);
}

async function ensureClaudeCodeInstalled() {
  if (await isClaudeCodeInstalled()) {
    return 'already-installed';
  }

  const installCommand = getClaudeCodeInstallCommand();
  try {
    await runCommand(installCommand.command, installCommand.args, {
      timeoutMs: 10 * 60 * 1000,
    });
    return 'installed';
  } catch (error) {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
    throw new Error(`Claude Code was not found and automatic installation failed via the ${installCommand.label}.${detail} See ${CLAUDE_CODE_SETUP_DOCS_URL}`);
  }
}

async function isOpenCodeInstalled() {
  try {
    return await commandExists('opencode');
  } catch {
    return false;
  }
}

async function getOpenCodeInstallCommands() {
  if (process.platform === 'win32') {
    const commands = [];

    if (await commandExists('npm')) {
      commands.push({
        command: 'npm.cmd',
        args: ['install', '-g', 'opencode-ai@latest'],
        label: 'npm global installer',
      });
    }

    if (await commandExists('choco')) {
      commands.push({
        command: 'choco',
        args: ['install', 'opencode', '-y'],
        label: 'Chocolatey installer',
      });
    }

    if (await commandExists('scoop')) {
      commands.push({
        command: 'powershell.exe',
        args: [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          'scoop install opencode',
        ],
        label: 'Scoop installer',
      });
    }

    if (await commandExists('mise')) {
      commands.push({
        command: 'mise',
        args: ['use', '-g', 'github:anomalyco/opencode'],
        label: 'Mise global installer',
      });
    }

    return commands;
  }

  const commands = [];

  if (await commandExists('brew')) {
    commands.push({
      command: 'brew',
      args: ['install', 'anomalyco/tap/opencode'],
      label: 'Homebrew installer',
    });
  }

  if (await commandExists('npm')) {
    commands.push({
      command: 'npm',
      args: ['install', '-g', 'opencode-ai@latest'],
      label: 'npm global installer',
    });
  }

  if (await commandExists('pnpm')) {
    commands.push({
      command: 'pnpm',
      args: ['install', '-g', 'opencode-ai@latest'],
      label: 'pnpm global installer',
    });
  }

  if (await commandExists('yarn')) {
    commands.push({
      command: 'yarn',
      args: ['global', 'add', 'opencode-ai@latest'],
      label: 'Yarn global installer',
    });
  }

  if (await commandExists('bun')) {
    commands.push({
      command: 'bun',
      args: ['install', '-g', 'opencode-ai@latest'],
      label: 'Bun global installer',
    });
  }

  if (await commandExists('curl')) {
    commands.push({
      command: 'sh',
      args: ['-lc', 'curl -fsSL https://opencode.ai/install | bash'],
      label: 'OpenCode shell installer',
    });
  }

  return commands;
}

async function ensureOpenCodeInstalled() {
  if (await isOpenCodeInstalled()) {
    return 'already-installed';
  }

  const installCommands = await getOpenCodeInstallCommands();
  if (installCommands.length === 0) {
    throw new Error(`OpenCode was not found and no supported installer was available on this ${process.platform} system. See ${OPENCODE_SETUP_DOCS_URL}`);
  }

  let lastError = null;

  for (const installCommand of installCommands) {
    try {
      await runCommand(installCommand.command, installCommand.args, {
        timeoutMs: 10 * 60 * 1000,
      });

      if (await isOpenCodeInstalled()) {
        return 'installed';
      }
    } catch (error) {
      lastError = {
        label: installCommand.label,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const detail = lastError ? ` Last attempt via ${lastError.label} failed: ${lastError.message}` : '';
  throw new Error(`OpenCode was not found and automatic installation failed.${detail} See ${OPENCODE_SETUP_DOCS_URL}`);
}

async function isKiloCodeInstalled() {
  try {
    return await commandExists('kilo') || await commandExists('kilocode');
  } catch {
    return false;
  }
}

async function getKiloCodeInstallCommands() {
  if (process.platform === 'win32') {
    const commands = [];

    if (await commandExists('npm')) {
      commands.push({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'npm install -g @kilocode/cli'],
        label: 'npm global installer via cmd.exe',
      });
    }

    return commands;
  }

  const commands = [];

  if (await commandExists('npm')) {
    commands.push({
      command: 'npm',
      args: ['install', '-g', '@kilocode/cli'],
      label: 'npm global installer',
    });
  }

  return commands;
}

async function ensureKiloCodeInstalled() {
  if (await isKiloCodeInstalled()) {
    return 'already-installed';
  }

  const installCommands = await getKiloCodeInstallCommands();
  if (installCommands.length === 0) {
    throw new Error(`Kilo Code was not found and no supported installer was available on this ${process.platform} system. See ${KILO_CODE_SETUP_DOCS_URL}`);
  }

  let lastError = null;

  for (const installCommand of installCommands) {
    try {
      await runCommand(installCommand.command, installCommand.args, {
        timeoutMs: 10 * 60 * 1000,
        shell: process.platform === 'win32' && installCommand.command.endsWith('.cmd'),
      });

      if (await isKiloCodeInstalled()) {
        return 'installed';
      }
    } catch (error) {
      lastError = {
        label: installCommand.label,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const detail = lastError ? ` Last attempt via ${lastError.label} failed: ${lastError.message}` : '';
  throw new Error(`Kilo Code was not found and automatic installation failed.${detail} See ${KILO_CODE_SETUP_DOCS_URL}`);
}

function normalizeServingLibraryName(name) {
  const normalized = String(name || '').trim().toLowerCase().replace(/[-.\s]+/g, '_');
  const aliases = {
    llama: 'llama_cpp',
    llamacpp: 'llama_cpp',
    llama_cpp: 'llama_cpp',
    llama_cpp_python: 'llama_cpp',
    tensorrt_llm: 'tensorrt',
    tensor_rt: 'tensorrt',
    tensor_rt_llm: 'tensorrt',
    torch: 'pytorch',
    transformer: 'transformers',
  };
  return aliases[normalized] || normalized;
}

let lastLibraryErrors = {};

async function isLibraryInstalled(name) {
  name = normalizeServingLibraryName(name);
  try {
    if (name === 'vllm') {
      if (process.platform === 'win32') {
        if (await isWindowsManagedVllmInstalled()) return true;
        if (!await commandExists('vllm')) return false;

        try {
          await runCommand('vllm', ['--version'], { timeoutMs: 30000 });
          return true;
        } catch {
          return false;
        }
      }

      // First try standard command
      if (await commandExists('vllm')) return true;
      // Then try python import
      const pyCmd = await getPythonCommandForModule('vllm');
      if (pyCmd) return true;

      // Fallback to pip check
      try {
        const pipCommand = await getPythonPipCommand();
        if (!pipCommand) return false;
        const { stdout } = await runCommand(pipCommand.command, [...pipCommand.args, 'show', 'vllm'], { timeoutMs: 5000 });
        return stdout.includes('Name: vllm');
      } catch {
        return false;
      }
    }
    
    if (name === 'ollama') {
      if (await commandExists('ollama')) return true;
      if (isMacOS()) {
        return Boolean(getMacOllamaCommandPath());
      }
      if (process.platform === 'win32') {
        return Boolean(getWindowsOllamaCommandPath());
      }
    }

    if (name === 'sglang') {
      if (await commandExists('sglang')) return true;
      const pyCmd = await getPythonCommandForModule('sglang');
      return !!pyCmd;
    }

    if (name === 'tensorrt') {
      if (await commandExists('trtllm-serve')) return true;
      if (await commandExists('tensorrt_llm')) return true;
      const pyCmd = await getPythonCommandForModule('tensorrt', 'import tensorrt; import tensorrt_llm');
      return !!pyCmd;
    }

    if (name === 'pytorch') {
      const pyCmd = await getPythonCommandForModule('torch');
      return !!pyCmd;
    }

    if (name === 'llama_cpp') {
      if (await commandExists('llama-server')) return true;
      if (await commandExists('llama-cli')) return true;
      const pyCmd = await getPythonCommandForModule('llama_cpp');
      return !!pyCmd;
    }

    if (name === 'transformers') {
      const pyCmd = await getPythonCommandForModule('transformers');
      return !!pyCmd;
    }

    if (name === 'dynamo') {
      if (await commandExists('dynamo')) return true;
      const pyCmd = await getPythonCommandForModule('dynamo');
      return !!pyCmd;
    }

    return await commandExists(name);
  } catch {
    return false;
  }
}


async function installLibrary(name) {
  name = normalizeServingLibraryName(name);
  if (name === 'vllm') {
    if (process.platform === 'win32') {
      return await installWindowsManagedVllm();
    }

    const pipCommand = await getPythonPipCommand();
    if (!pipCommand) {
      throw new Error('pip is not installed. Please install Python and pip first.');
    }
    await runCommand(pipCommand.command, [...pipCommand.args, 'install', 'vllm'], { timeoutMs: 15 * 60 * 1000 });
    return 'installed';
  }

  if (name === 'ollama') {
    if (process.platform === 'win32') {
      if (await isLibraryInstalled('ollama')) {
        return 'installed';
      }

      try {
        await runCommand('powershell.exe', [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          'irm https://ollama.com/install.ps1 | iex',
        ], { timeoutMs: 15 * 60 * 1000 });

        if (await isLibraryInstalled('ollama')) {
          return 'installed';
        }
      } catch {
        // Fall back to WinGet below.
      }

      if (await commandExists('winget')) {
        await runCommand('winget', [
          'install',
          '--id',
          'Ollama.Ollama',
          '--exact',
          '--accept-package-agreements',
          '--accept-source-agreements',
        ], { timeoutMs: 15 * 60 * 1000 });

        if (await isLibraryInstalled('ollama')) {
          return 'installed';
        }

        throw new Error('Ollama installer completed, but the ollama command was not found yet. Restart OneInfer Edge or sign out and back in so Windows refreshes PATH.');
      }

      throw new Error('WinGet is not available on this Windows machine. Install Ollama from https://ollama.com/download/windows, then restart OneInfer Edge.');
    }

    if (isMacOS()) {
      if (await isLibraryInstalled('ollama')) {
        return 'installed';
      }

      if (await commandExists('brew')) {
        await runCommand('brew', ['install', 'ollama'], { timeoutMs: 15 * 60 * 1000 });
        return 'installed';
      }

      throw new Error('Automatic Ollama installation on macOS requires Homebrew. Install Ollama from https://ollama.com/download/mac or run "brew install ollama", then restart OneInfer Edge.');
    }

    await runCommand('sh', ['-lc', 'curl -fsSL https://ollama.com/install.sh | sh'], { timeoutMs: 15 * 60 * 1000 });
    return 'installed';
  }

  const pipInstallPackages = {
    sglang: ['sglang'],
    tensorrt: ['tensorrt-llm'],
    llama_cpp: ['llama-cpp-python'],
    pytorch: ['torch'],
    transformers: ['torch', 'transformers>=4.45.0', 'accelerate', 'safetensors', 'sentencepiece', 'protobuf', 'huggingface_hub', 'tokenizers', 'numpy<2', 'scipy>=1.10,<1.14', 'scikit-learn>=1.3,<1.5', 'pillow'],
    dynamo: ['ai-dynamo'],
  };

  if (Object.prototype.hasOwnProperty.call(pipInstallPackages, name)) {
    if (process.platform === 'win32' && ['sglang', 'tensorrt', 'dynamo'].includes(name)) {
      throw new Error(`${name} is not supported for native Windows installs in OneInfer Edge yet.`);
    }

    if (isMacOS() && ['tensorrt', 'dynamo'].includes(name)) {
      throw new Error(`${name} requires a Linux NVIDIA runtime in OneInfer Edge.`);
    }

    const pipCommand = await getPythonPipCommand();
    if (!pipCommand) {
      throw new Error('pip is not installed. Please install Python and pip first.');
    }

    try {
      await runCommand(pipCommand.command, [...pipCommand.args, 'install', '--upgrade', ...pipInstallPackages[name]], {
        timeoutMs: 15 * 60 * 1000,
        onStdout: (text) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:library-install-log', { name, text });
          }
        },
        onStderr: (text) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('app:library-install-log', { name, text, isError: true });
          }
        }
      });
      return 'installed';
    } catch (error) {
      try {
        const { Notification } = require('electron');
        if (Notification.isSupported()) {
          new Notification({
            title: 'OneInfer Edge',
            body: `Failed to install library "${name}". Check the logs for details.`,
          }).show();
        }
      } catch (err) {
        console.error('Failed to show system notification', err);
      }
      throw error;
    }
  }

  throw new Error(`Automatic installation for "${name}" is not supported.`);
}

function normalizeHfRepoId(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    throw new Error('Hugging Face model URL or repo id is required.');
  }

  let candidate = rawValue;
  if (/^https?:\/\//i.test(candidate)) {
    const parsedUrl = new URL(candidate);
    const normalizedHost = parsedUrl.hostname.replace(/^www\./i, '').toLowerCase();
    if (normalizedHost !== 'huggingface.co') {
      throw new Error('Only huggingface.co model URLs are supported for local deployment.');
    }

    const parts = parsedUrl.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      throw new Error('Hugging Face URL must include an owner and model name.');
    }

    candidate = `${parts[0]}/${parts[1]}`;
  }

  const repoIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
  if (!repoIdPattern.test(candidate)) {
    throw new Error('Hugging Face model must be in owner/model format.');
  }

  return candidate;
}

function normalizeLocalModelId(value, runtime = 'vllm') {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    throw new Error('Local model id is required.');
  }

  if (runtime === 'ollama') {
    if (/^https?:\/\//i.test(rawValue)) {
      return normalizeHfRepoId(rawValue);
    }

    return rawValue;
  }

  return normalizeHfRepoId(rawValue);
}

function getHfAuthenticatedEnv(accessToken) {
  const token = String(accessToken || '').trim();
  if (!token) {
    return process.env;
  }

  return {
    ...process.env,
    HF_TOKEN: token,
    HUGGING_FACE_HUB_TOKEN: token,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createCancellationError(repoId) {
  const error = new Error(`Deployment cancelled for ${repoId}.`);
  error.cancelled = true;
  return error;
}

function assertDeploymentNotCancelled(repoId) {
  const inFlight = localModelDeploymentsInFlight.get(repoId);
  if (inFlight?.cancelled) {
    throw createCancellationError(repoId);
  }
}

function stopProcessTree(pid) {
  if (!pid) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    }

    process.kill(pid, 'SIGTERM');
  } catch {
    // The process may already have exited.
  }
}

function createEmptyLocalModelMetrics(endpointUrl, patch = {}) {
  return {
    endpointUrl,
    healthy: false,
    modelCount: 0,
    uptimeSeconds: null,
    requestsRunning: null,
    requestsWaiting: null,
    requestSuccessTotal: null,
    promptTokensTotal: null,
    generationTokensTotal: null,
    gpuCacheUsagePercent: null,
    lastCheckedAt: new Date().toISOString(),
    ...patch,
  };
}

function readPrometheusMetric(metricsText, metricNames) {
  const names = Array.isArray(metricNames) ? metricNames : [metricNames];
  const lines = String(metricsText || '').split(/\r?\n/);

  for (const name of names) {
    let total = 0;
    let found = false;
    for (const line of lines) {
      if (!line || line.startsWith('#')) {
        continue;
      }

      if (line.startsWith(`${name} `) || line.startsWith(`${name}{`)) {
        const rawValue = line.trim().split(/\s+/).pop();
        const numericValue = Number(rawValue);
        if (Number.isFinite(numericValue)) {
          total += numericValue;
          found = true;
        }
      }
    }

    if (found) {
      return total;
    }
  }

  return null;
}

function getMetricsBaseUrl(endpointUrl) {
  const parsedUrl = new URL(endpointUrl);
  parsedUrl.pathname = parsedUrl.pathname.replace(/\/v1\/?$/i, '') || '/';
  parsedUrl.search = '';
  parsedUrl.hash = '';
  return parsedUrl.toString().replace(/\/+$/, '');
}

async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function findAvailablePort(preferredPort = 8000) {
  const numericPreferredPort = Number(preferredPort);
  const startPort = Number.isInteger(numericPreferredPort) && numericPreferredPort > 0
    ? numericPreferredPort
    : 8000;

  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No available local port found starting at ${startPort}.`);
}

async function waitForOpenAiEndpoint(endpointUrl, timeoutMs = 10 * 60 * 1000, onProgress = () => {}, shouldCancel = () => false) {
  const startedAt = Date.now();
  const modelsUrl = `${endpointUrl.replace(/\/+$/, '')}/models`;
  let lastError = null;
  let attempt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    if (shouldCancel()) {
      throw createCancellationError(endpointUrl);
    }

    attempt += 1;
    onProgress({
      stage: 'health-check',
      message: `Checking local server readiness (attempt ${attempt})...`,
      detail: modelsUrl,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(modelsUrl, { signal: controller.signal });
      if (response.ok) {
        onProgress({
          stage: 'ready',
          message: 'Local model server is responding.',
          detail: modelsUrl,
          level: 'success',
        });
        return;
      }
      lastError = new Error(`Health check returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeoutId);
    }

    await wait(2500);
  }

  throw new Error(`Timed out waiting for local model server at ${modelsUrl}.${lastError?.message ? ` Last error: ${lastError.message}` : ''}`);
}

async function waitForOpenAiEndpointOrProcessExit(endpointUrl, child, timeoutMs, onProgress = () => {}, shouldCancel = () => false) {
  let exitState = null;
  child.once('exit', (code, signal) => {
    exitState = { code, signal };
  });

  return waitForOpenAiEndpoint(endpointUrl, timeoutMs, onProgress, () => {
    if (shouldCancel()) {
      return true;
    }

    if (exitState) {
      throw new Error(`Local model server exited before it became ready. Exit code: ${exitState.code ?? 'none'}${exitState.signal ? `, signal: ${exitState.signal}` : ''}.`);
    }

    return false;
  });
}

function getVllmLogPath(repoId) {
  const safeId = repoId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logsDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return path.join(logsDir, `vllm-${safeId}-${timestamp}.log`);
}

function getTransformersLogPath(repoId) {
  const safeId = repoId.replace(/[^a-zA-Z0-9._-]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logsDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return path.join(logsDir, `transformers-${safeId}-${timestamp}.log`);
}

function readLogTail(logPath, maxLines = 40) {
  try {
    if (!logPath || !fs.existsSync(logPath)) {
      return '';
    }

    const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.slice(-maxLines).join('\n');
  } catch {
    return '';
  }
}

function compactDeploymentLogTail(logTail, maxLines = 18) {
  const lines = String(logTail || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.includes('<oneinfer-transformers-server>'))
    .filter((line) => !/^# (HELP|TYPE) oneinfer_/i.test(line))
    .filter((line) => !/^oneinfer_[a-z0-9_]+\s+/i.test(line))
    .filter((line) => !/^(import |from |def |class |try:|except |return |if |else:|with |print\(|ThreadingHTTPServer|self\.|raw =|body =|length =|payload =|content =|outputs =|scores =|generation_args|input_ids|tokenizer|model\b)/.test(line));

  return lines.slice(-maxLines).join('\n');
}

const PYTHON_CHECK_TIMEOUT_MS = 45000;

async function getPythonCommandForModule(moduleName, importScript = null) {
  const script = importScript || `import ${moduleName}`;
  const basicCandidates = process.platform === 'win32'
    ? [
        { command: 'python', prefixArgs: [] },
        { command: 'py', prefixArgs: ['-3'] }
      ]
    : [
        { command: 'python3', prefixArgs: [] },
        { command: 'python', prefixArgs: [] }
      ];

  let lastRunError = null;

  for (const candidate of basicCandidates) {
    try {
      if (!await commandExists(candidate.command)) {
        continue;
      }
      await runCommand(candidate.command, [...candidate.prefixArgs, '-c', script], { timeoutMs: PYTHON_CHECK_TIMEOUT_MS });
      // Clear error on success
      const key = moduleName === 'torch' ? 'pytorch' : moduleName;
      delete lastLibraryErrors[key];
      return {
        command: candidate.command,
        prefixArgs: candidate.prefixArgs,
      };
    } catch (err) {
      lastRunError = err.message || String(err);
    }
  }

  // Next, check candidates based on the same list of Python/pip entry points that getPythonPipCommand uses
  const pipCandidates = [
    { command: 'py', args: ['-3.12', '-m', 'pip'] },
    { command: 'py', args: ['-3.11', '-m', 'pip'] },
    { command: 'py', args: ['-3.10', '-m', 'pip'] },
    { command: 'python3', args: ['-m', 'pip'] },
    { command: 'python', args: ['-m', 'pip'] },
    { command: '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3', args: ['-m', 'pip'] },
    { command: '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3', args: ['-m', 'pip'] },
    { command: '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3', args: ['-m', 'pip'] },
    { command: '/opt/homebrew/bin/python3', args: ['-m', 'pip'] },
    { command: '/usr/local/bin/python3', args: ['-m', 'pip'] },
    { command: '/usr/bin/python3', args: ['-m', 'pip'] },
  ];

  for (const candidate of pipCandidates) {
    try {
      const prefixArgs = [];
      for (const arg of candidate.args) {
        if (arg === '-m') break;
        prefixArgs.push(arg);
      }
      await runCommand(candidate.command, [...prefixArgs, '-c', script], { timeoutMs: PYTHON_CHECK_TIMEOUT_MS });
      // Clear error on success
      const key = moduleName === 'torch' ? 'pytorch' : moduleName;
      delete lastLibraryErrors[key];
      return {
        command: candidate.command,
        prefixArgs,
      };
    } catch (err) {
      lastRunError = err.message || String(err);
    }
  }

  // Store the diagnostic error if we failed completely
  const key = moduleName === 'torch' ? 'pytorch' : moduleName;
  if (lastRunError) {
    lastLibraryErrors[key] = lastRunError;
  } else {
    lastLibraryErrors[key] = 'No python or pip environment could be found on the system.';
  }

  return null;
}

async function removeTorchvisionIfBroken(pipCommand, python, onProgress = () => {}) {
  try {
    await runCommand(python.command, [...python.prefixArgs, '-c', 'import torchvision'], { timeoutMs: 10000 });
    return false;
  } catch {
    onProgress({
      stage: 'preparing',
      message: 'Removing broken TorchVision package...',
      detail: 'TorchVision is not required for text router models, and the installed copy is incompatible with PyTorch.',
    });
    await runCommand(pipCommand.command, [...pipCommand.args, 'uninstall', '-y', 'torchvision'], { timeoutMs: 5 * 60 * 1000 }).catch(() => undefined);
    return true;
  }
}


function getOllamaCommand() {
  return getMacOllamaCommandPath() || getWindowsOllamaCommandPath() || 'ollama';
}

function getOllamaModelName(repoId) {
  const value = String(repoId || '').trim();
  const normalized = value.toLowerCase();
  const mappings = new Map([
    ['qwen/qwen2.5-0.5b-instruct', 'qwen2.5:0.5b'],
    ['qwen/qwen2.5-1.5b-instruct', 'qwen2.5:1.5b'],
    ['qwen/qwen2.5-3b-instruct', 'qwen2.5:3b'],
    ['qwen/qwen2.5-7b-instruct', 'qwen2.5:7b'],
    ['meta-llama/llama-3.2-1b-instruct', 'llama3.2:1b'],
    ['meta-llama/llama-3.2-3b-instruct', 'llama3.2:3b'],
  ]);

  if (mappings.has(normalized)) {
    return mappings.get(normalized);
  }

  if (value.includes(':') || normalized.startsWith('hf.co/')) {
    return value;
  }

  return `hf.co/${value}`;
}

async function ensureOllamaServer(endpointUrl, onProgress = () => {}, options = {}) {
  try {
    await waitForOpenAiEndpoint(endpointUrl, 3000, onProgress, () => false);
    return null;
  } catch {
    // Ollama is not responding yet. Start the local server below.
  }

  const command = getOllamaCommand();
  onProgress({
    stage: 'starting',
    message: 'Starting Ollama local server...',
    detail: command,
  });

  const child = spawn(command, ['serve'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: {
      ...getHfAuthenticatedEnv(options.hfAccessToken),
      OLLAMA_HOST: '127.0.0.1:11434',
    },
  });

  child.once('error', (error) => {
    onProgress({
      stage: 'error',
      message: 'Failed to start Ollama.',
      detail: error.message,
      level: 'error',
    });
  });

  child.unref();
  await waitForOpenAiEndpoint(endpointUrl, 30000, onProgress, () => false);
  return child;
}

async function startOllamaModel(repoId, onProgress = () => {}, options = {}) {
  if (!await isLibraryInstalled('ollama')) {
    throw new Error('Ollama is not installed. Install Ollama before deploying on macOS.');
  }

  const endpointUrl = 'http://127.0.0.1:11434/v1';
  const modelName = getOllamaModelName(repoId);

  const child = await ensureOllamaServer(endpointUrl, onProgress, options);
  onProgress({
    stage: 'loading',
    message: `Pulling Ollama model ${modelName}...`,
    detail: modelName.startsWith('hf.co/') ? 'Ollama can pull Hugging Face GGUF models with hf.co/... names.' : undefined,
  });
  try {
    await runCommand(getOllamaCommand(), ['pull', modelName], {
      timeoutMs: 30 * 60 * 1000,
      env: getHfAuthenticatedEnv(options.hfAccessToken),
    });
  } catch (error) {
    const message = formatCommandError(error);
    if (message.includes('Repository is not GGUF') || message.includes('not compatible with llama.cpp')) {
      throw new Error(`${repoId} cannot be deployed with Ollama because the Hugging Face repository is not GGUF/llama.cpp compatible. Use vLLM for this Transformers-format model, or choose a GGUF model repository for Ollama.`);
    }

    throw new Error(message || 'Ollama failed to pull the model.');
  }

  onProgress({
    stage: 'ready',
    message: `${modelName} is available in Ollama.`,
    detail: endpointUrl,
    level: 'success',
  });

  return {
    child,
    endpointUrl,
    modelName,
  };
}

async function startVllmServer(repoId, port, onProgress = () => {}, options = {}) {
  let command = 'vllm';
  let args = ['serve', repoId, '--host', '127.0.0.1', '--port', String(port)];

  onProgress({
    stage: 'preparing',
    message: 'Checking vLLM installation...',
    detail: 'Looking for vllm command or Python module.',
  });

  if (process.platform === 'win32' && await isWindowsManagedVllmInstalled()) {
    command = getWindowsVllmCommandPath();
    args = ['serve', repoId, '--host', '127.0.0.1', '--port', String(port)];
  }

  if (command === 'vllm' && !await commandExists('vllm')) {
    if (!await commandExists('python')) {
      throw new Error('vLLM is not available and Python was not found. Install vLLM before deploying.');
    }

    try {
      await runCommand('python', ['-c', 'import vllm'], { timeoutMs: 10000 });
    } catch {
      throw new Error('vLLM is not installed. Install vLLM from the analysis dialog before deploying.');
    }

    command = 'python';
    args = ['-m', 'vllm.entrypoints.openai.api_server', '--model', repoId, '--host', '127.0.0.1', '--port', String(port)];
  }

  const logPath = getVllmLogPath(repoId);
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  function writeLog(line) {
    const ts = new Date().toISOString();
    logStream.write(`[${ts}] ${line}\n`);
  }

  writeLog(`Starting vLLM: ${command} ${args.join(' ')}`);

  onProgress({
    stage: 'starting',
    message: `Starting vLLM for ${repoId}...`,
    detail: `Logs: ${logPath}`,
  });

  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: getHfAuthenticatedEnv(options.hfAccessToken),
  });
  const recentOutput = [];

  function rememberOutput(line) {
    recentOutput.push(line);
    if (recentOutput.length > 80) {
      recentOutput.shift();
    }
  }

  const pipeOutput = (stream, level) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      lines
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          rememberOutput(line);
          writeLog(line);
        });
      lines
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-8)
        .forEach((line) => {
          onProgress({
            stage: 'loading',
            message: level === 'error' ? 'vLLM reported output.' : 'vLLM is loading the model...',
            detail: line,
            level,
          });
        });
    });
  };

  pipeOutput(child.stdout, 'info');
  pipeOutput(child.stderr, 'info');

  child.once('error', (error) => {
    writeLog(`ERROR: ${error.message}`);
    logStream.end();
    onProgress({
      stage: 'error',
      message: 'Failed to start vLLM.',
      detail: error.message,
      level: 'error',
    });
  });

  child.once('exit', (code, signal) => {
    writeLog(`Process exited — code: ${code}, signal: ${signal}`);
    logStream.end();
    if (code !== null && code !== 0) {
      const outputDetail = getVllmExitDetail(recentOutput.join('\n'));
      onProgress({
        stage: 'error',
        message: outputDetail.message || `vLLM exited with code ${code}. Logs saved to: ${logPath}`,
        detail: outputDetail.detail || (signal ? `Signal: ${signal}` : undefined),
        level: 'error',
      });
    }
  });

  child.unref();
  return child;
}

const TRANSFORMERS_OPENAI_SERVER_SCRIPT = String.raw`
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

repo_id = sys.argv[1]
port = int(sys.argv[2])
serve_role = sys.argv[3] if len(sys.argv) > 3 else "model"

print(f"Loading Transformers model {repo_id}", flush=True)
import torch
from transformers import AutoModelForCausalLM, AutoModelForSequenceClassification, AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained(repo_id, trust_remote_code=True)
model = None
model_kind = "causal-lm"
device = "cuda" if torch.cuda.is_available() and torch.cuda.mem_get_info()[0] > 4 * 1024 * 1024 * 1024 else "cpu"
dtype = torch.float16 if device == "cuda" else torch.float32
print(f"Using device={device}, dtype={dtype}", flush=True)
try:
    model = AutoModelForCausalLM.from_pretrained(repo_id, trust_remote_code=True, torch_dtype=dtype)
    print("Loaded model as causal-lm", flush=True)
except Exception as causal_error:
    print(f"Causal LM load failed: {causal_error}", flush=True)
    if serve_role != "router":
        raise
    model_kind = "sequence-classification"
    model = AutoModelForSequenceClassification.from_pretrained(repo_id, trust_remote_code=True, torch_dtype=dtype)
    print("Loaded model as sequence-classification", flush=True)

model.eval()
if hasattr(model, "to"):
    try:
        model.to(device)
    except RuntimeError as cuda_error:
        if device == "cuda":
            print(f"CUDA load failed, falling back to CPU: {cuda_error}", flush=True)
            device = "cpu"
            model.to(device)
        else:
            raise

def response_payload(content, request_id):
    return {
        "id": request_id,
        "object": "chat.completion",
        "created": int(time.time()),
        "model": repo_id,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": content},
            "finish_reason": "stop",
        }],
    }

def prompt_from_messages(payload):
    messages = payload.get("messages") or []
    return "\n".join([str(item.get("content", "")) for item in messages if isinstance(item, dict)]).strip()

def build_generation_inputs(prompt, payload, device):
    messages = payload.get("messages") or []
    if messages and hasattr(tokenizer, "apply_chat_template") and getattr(tokenizer, "chat_template", None):
        try:
            input_ids = tokenizer.apply_chat_template(
                messages,
                add_generation_prompt=True,
                return_tensors="pt",
                truncation=True,
            ).to(device)
            return {"input_ids": input_ids}
        except Exception as template_error:
            print(f"Chat template formatting failed, using plain prompt: {template_error}", flush=True)

    inputs = tokenizer(prompt, return_tensors="pt", truncation=True)
    return {key: value.to(device) for key, value in inputs.items()}

def run_model(prompt, payload):
    if not prompt:
        prompt = str(payload.get("prompt") or "")
    if not prompt:
        prompt = "Route this request."

    device = next(model.parameters()).device
    inputs = build_generation_inputs(prompt, payload, device)

    with torch.no_grad():
        if model_kind == "causal-lm":
            max_new_tokens = max(1, min(int(payload.get("max_tokens") or 128), 512))
            temperature = float(payload.get("temperature") or 0)
            eos_token_id = tokenizer.eos_token_id
            pad_token_id = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else eos_token_id
            generation_args = {
                **inputs,
                "max_new_tokens": max_new_tokens,
                "repetition_penalty": float(payload.get("repetition_penalty") or 1.12),
                "no_repeat_ngram_size": int(payload.get("no_repeat_ngram_size") or 4),
                "eos_token_id": eos_token_id,
                "pad_token_id": pad_token_id,
            }
            if temperature > 0:
                generation_args.update({
                    "do_sample": True,
                    "temperature": temperature,
                    "top_p": float(payload.get("top_p") or 0.9),
                })
            else:
                generation_args["do_sample"] = False

            output_ids = model.generate(
                **generation_args,
            )
            generated = output_ids[0][inputs["input_ids"].shape[-1]:]
            return tokenizer.decode(generated, skip_special_tokens=True).strip() or "ok"

        outputs = model(**inputs)
        scores = torch.softmax(outputs.logits[0], dim=-1)
        index = int(torch.argmax(scores).item())
        label = getattr(model.config, "id2label", {}).get(index, str(index))
        return json.dumps({"label": label, "score": float(scores[index].item())})

class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.rstrip("/") == "/v1/models":
            self.send_json(200, {"object": "list", "data": [{"id": repo_id, "object": "model", "owned_by": "oneinfer"}]})
            return
        if self.path.rstrip("/") == "/metrics":
            raw = "\n".join([
                "# HELP oneinfer_transformers_requests_total Total requests handled by the local Transformers server.",
                "# TYPE oneinfer_transformers_requests_total counter",
                "oneinfer_transformers_requests_total 0",
                "# HELP oneinfer_transformers_server_ready Whether the local Transformers server is ready.",
                "# TYPE oneinfer_transformers_server_ready gauge",
                "oneinfer_transformers_server_ready 1",
                "",
            ]).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; version=0.0.4")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
            return
        self.send_json(404, {"error": {"message": "Not found"}})

    def do_POST(self):
        if self.path.rstrip("/") not in ["/v1/chat/completions", "/v1/completions"]:
            self.send_json(404, {"error": {"message": "Not found"}})
            return

        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            payload = json.loads(body or "{}")
            prompt = prompt_from_messages(payload)
            content = run_model(prompt, payload)
            self.send_json(200, response_payload(content, f"chatcmpl-{int(time.time() * 1000)}"))
        except Exception as error:
            self.send_json(500, {"error": {"message": str(error)}})

    def log_message(self, format, *args):
        print(format % args, flush=True)

print(f"Transformers OpenAI-compatible server ready on 127.0.0.1:{port}", flush=True)
ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
`;

async function startTransformersServer(repoId, port, onProgress = () => {}, options = {}) {
  onProgress({
    stage: 'preparing',
    message: 'Checking PyTorch and Transformers installation...',
    detail: 'Looking for a Python environment that can import transformers and torch.',
  });

  const python = await getPythonCommandForModule('transformers');
  if (!python) {
    throw new Error('Transformers is not installed in an available Python environment.');
  }

  const transformersPreflight = 'import torch; import transformers; import numpy; from packaging.version import Version; assert Version(transformers.__version__) >= Version("4.45.0"), transformers.__version__; from transformers import AutoTokenizer; from transformers.models.qwen2.modeling_qwen2 import Qwen2ForCausalLM';
  try {
    await runCommand(python.command, [...python.prefixArgs, '-c', transformersPreflight], { timeoutMs: 20000 });
  } catch {
    const pipCommand = await getPythonPipCommand();
    if (!pipCommand) {
      throw new Error('PyTorch and Transformers are required, but pip is not available to repair the Python environment.');
    }

    onProgress({
      stage: 'preparing',
      message: 'Repairing PyTorch, Transformers, NumPy, SciPy, and scikit-learn...',
      detail: 'Fixing the Python runtime used by local Transformers models.',
    });
    await removeTorchvisionIfBroken(pipCommand, python, onProgress);
    await runCommand(pipCommand.command, [...pipCommand.args, 'install', '--upgrade', '--force-reinstall', 'torch', 'transformers>=4.45.0', 'accelerate', 'safetensors', 'sentencepiece', 'protobuf', 'huggingface_hub', 'tokenizers', 'numpy<2', 'scipy>=1.10,<1.14', 'scikit-learn>=1.3,<1.5', 'pillow'], { timeoutMs: 20 * 60 * 1000 });
    await removeTorchvisionIfBroken(pipCommand, python, onProgress);
    await runCommand(python.command, [...python.prefixArgs, '-c', transformersPreflight], { timeoutMs: 20000 });
  }

  const logPath = getTransformersLogPath(repoId);
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const serveRole = options.role === 'router' ? 'router' : 'model';
  const args = [...python.prefixArgs, '-u', '-c', TRANSFORMERS_OPENAI_SERVER_SCRIPT, repoId, String(port), serveRole];

  function writeLog(line) {
    const ts = new Date().toISOString();
    logStream.write(`[${ts}] ${line}\n`);
  }

  writeLog(`Starting Transformers server: ${python.command} ${python.prefixArgs.join(' ')} -u -c <oneinfer-transformers-server> ${repoId} ${port} ${serveRole}`.replace(/\s+/g, ' ').trim());
  onProgress({
    stage: 'starting',
    message: `Starting Transformers ${serveRole === 'router' ? 'router' : 'model'} server for ${repoId}...`,
    detail: `Logs: ${logPath}`,
  });

  const child = spawn(python.command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: getHfAuthenticatedEnv(options.hfAccessToken),
  });
  child.oneinferLogPath = logPath;

  const pipeOutput = (stream, level) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      lines
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          writeLog(line);
          const isHttpProbe = /^"GET \/(v1\/models|metrics) HTTP\/1\.[01]" \d{3}/.test(line);
          if (isHttpProbe) {
            return;
          }
          onProgress({
            stage: 'loading',
            message: level === 'error' ? 'Transformers reported output.' : 'Transformers is loading the local model...',
            detail: line,
            level,
          });
        });
    });
  };

  pipeOutput(child.stdout, 'info');
  pipeOutput(child.stderr, 'info');

  child.once('error', (error) => {
    writeLog(`ERROR: ${error.message}`);
    logStream.end();
    onProgress({
      stage: 'error',
      message: 'Failed to start Transformers.',
      detail: error.message,
      level: 'error',
    });
  });

  child.once('exit', (code, signal) => {
    writeLog(`Process exited - code: ${code}, signal: ${signal}`);
    logStream.end();
    if (code !== null && code !== 0) {
      onProgress({
        stage: 'error',
        message: `Transformers server exited with code ${code}.`,
        detail: signal ? `Signal: ${signal}` : undefined,
        level: 'error',
      });
    }
  });

  child.unref();
  return child;
}

function getVllmExitDetail(output) {
  if (output.includes('operator torchvision::nms does not exist')) {
    return {
      message: 'vLLM failed because TorchVision is incompatible with the installed PyTorch runtime.',
      detail: process.platform === 'win32'
        ? 'Windows vLLM needs a matching Windows build of torch, torchvision, CUDA, and vLLM. Use a OneInfer-managed Windows vLLM runtime or reinstall matching Windows wheels in an isolated environment.'
        : 'Reinstall torch and torchvision from the same PyTorch wheel channel, then restart deployment.',
    };
  }

  if (output.includes("Could not import module 'ProcessorMixin'")) {
    return {
      message: 'vLLM failed while importing the model processor dependencies.',
      detail: 'Check the vLLM log for the first Python import error; processor import errors are usually caused by a lower-level dependency crash.',
    };
  }

  return {
    message: null,
    detail: null,
  };
}

function getTransformersFailureDetail(errorMessage, logTail) {
  const output = `${errorMessage || ''}\n${logTail || ''}`;
  const unknownModelTypeMatch = output.match(/model type [`'"]([^`'"]+)[`'"][\s\S]{0,240}Transformers does not recognize/i)
    || output.match(/KeyError:\s*['"]([^'"]+)['"]/i);
  if (unknownModelTypeMatch) {
    const modelType = unknownModelTypeMatch[1];
    return {
      message: `Transformers does not recognize model type "${modelType}".`,
      detail: 'This Hugging Face repo uses a custom or newer architecture that the installed Transformers runtime cannot load with AutoModel. Choose a standard text-generation model, a GGUF model with Ollama, or add a custom runtime for this architecture.',
    };
  }

  if (/Timed out waiting for local model server/i.test(output)) {
    return {
      message: 'Timed out while loading the Transformers model.',
      detail: 'The model did not finish loading before the local server health check expired. This usually means the model is too large for this machine, is loading on CPU, or is still downloading large weights. Use a much smaller model, a GPU-capable runtime, or a quantized/GGUF model.',
    };
  }

  if (/out of memory|cuda memory|allocation|paging file|not enough memory/i.test(output)) {
    return {
      message: 'Transformers ran out of memory while loading the model.',
      detail: 'Select a smaller model, use a quantized model, or deploy on a machine with enough VRAM/RAM.',
    };
  }

  const missingTokenizerMatch = output.match(/Tokenizer class\s+([A-Za-z0-9_]+)\s+does not exist/i);
  if (missingTokenizerMatch) {
    const tokenizerClass = missingTokenizerMatch[1];
    return {
      message: `Transformers cannot load tokenizer class "${tokenizerClass}".`,
      detail: 'This Hugging Face repo uses a tokenizer implementation that is not available in the installed Transformers runtime. Choose a standard text-generation model, ask the model publisher for a compatible tokenizer, or deploy a GGUF/Ollama-compatible version if available.',
    };
  }

  if (/Tokenizer class[\s\S]{0,160}does not exist|AutoTokenizer\.from_pretrained/i.test(output) && /ValueError|Traceback/i.test(output)) {
    return {
      message: 'Transformers could not load this model tokenizer.',
      detail: 'The model repository tokenizer configuration is not compatible with the installed local Transformers runtime. Use a different model/runtime or update the model repo tokenizer files.',
    };
  }

  return { message: null, detail: null };
}

async function deployHfModel(payload = {}) {
  const runtime = payload.runtime || 'vllm';
  const repoId = normalizeLocalModelId(payload.repoId, runtime);
  const hfAccessToken = String(payload.hfAccessToken || payload.hfToken || '').trim();
  const progressId = String(payload.progressId || `${repoId}-${Date.now()}`);
  const progress = (patch) => sendDeploymentProgress({ id: progressId, ...patch });
  const shouldCancel = () => Boolean(localModelDeploymentsInFlight.get(repoId)?.cancelled);

  if (!['vllm', 'ollama', 'transformers'].includes(runtime)) {
    throw new Error(`Unsupported local deployment runtime: ${runtime}`);
  }

  if (localModelDeploymentsInFlight.has(repoId)) {
    throw new Error(`Deployment is already running for ${repoId}.`);
  }

  localModelDeploymentsInFlight.set(repoId, {
    cancelled: false,
    child: null,
    endpointUrl: null,
    progressId,
    repoId,
    startedAt: Date.now(),
  });

  progress({
    stage: 'preparing',
    message: `Preparing local deployment for ${repoId}.`,
    detail: `Runtime: ${runtime === 'ollama' ? 'Ollama' : runtime === 'transformers' ? 'Transformers' : 'vLLM'}`,
  });

  const existingDeployment = localModelDeployments.get(repoId);
  if (existingDeployment) {
    try {
      progress({
        stage: 'health-check',
        message: 'Found an existing local server. Verifying it is still healthy...',
        detail: existingDeployment.endpointUrl,
      });
      await waitForOpenAiEndpoint(existingDeployment.endpointUrl, 15000, progress, shouldCancel);
      localModelDeploymentsInFlight.delete(repoId);
      return existingDeployment;
    } catch {
      progress({
        stage: 'preparing',
        message: 'Existing local server did not respond. Starting a fresh deployment...',
      });
      localModelDeployments.delete(repoId);
    }
  }

  if (runtime === 'ollama') {
    try {
      assertDeploymentNotCancelled(repoId);
      const ollamaDeployment = await startOllamaModel(repoId, progress, { hfAccessToken });
      const activeDeployment = localModelDeploymentsInFlight.get(repoId);
      if (activeDeployment) {
        activeDeployment.child = ollamaDeployment.child;
        activeDeployment.endpointUrl = ollamaDeployment.endpointUrl;
      }

      const deployment = {
        endpointUrl: ollamaDeployment.endpointUrl,
        modelId: ollamaDeployment.modelName,
        pid: ollamaDeployment.child?.pid || null,
        runtime,
        startedAt: Date.now(),
      };

      localModelDeployments.set(repoId, deployment);
      localModelDeploymentsInFlight.delete(repoId);
      progress({
        stage: 'ready',
        message: `${ollamaDeployment.modelName} is ready for OpenAI-compatible requests.`,
        detail: ollamaDeployment.endpointUrl,
        level: 'success',
      });
      return deployment;
    } catch (error) {
      const activeDeployment = localModelDeploymentsInFlight.get(repoId);
      stopProcessTree(activeDeployment?.child?.pid);
      localModelDeploymentsInFlight.delete(repoId);
      progress({
        stage: 'error',
        message: error?.cancelled ? 'Local deployment cancelled.' : 'Ollama deployment failed.',
        detail: error instanceof Error ? error.message : String(error),
        level: 'error',
      });
      throw error;
    }
  }

  const requestedPort = payload.port || 8000;
  const port = payload.exactPort ? Number(requestedPort) : await findAvailablePort(requestedPort);
  if (payload.exactPort) {
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`Invalid local port: ${requestedPort}.`);
    }

    if (!await isPortAvailable(port)) {
      throw new Error(`Local port ${port} is already in use. Stop the existing process or update the saved endpoint URL.`);
    }
  }
  assertDeploymentNotCancelled(repoId);
  const endpointUrl = `http://127.0.0.1:${port}/v1`;
  const inFlight = localModelDeploymentsInFlight.get(repoId);
  if (inFlight) {
    inFlight.endpointUrl = endpointUrl;
  }

  progress({
    stage: 'preparing',
    message: `Reserved local port ${port}.`,
    detail: endpointUrl,
  });

  const child = runtime === 'transformers'
    ? await startTransformersServer(repoId, port, progress, { role: payload.role, hfAccessToken })
    : await startVllmServer(repoId, port, progress, { hfAccessToken });
  const activeDeployment = localModelDeploymentsInFlight.get(repoId);
  if (activeDeployment) {
    activeDeployment.child = child;
  }

  const deployment = {
    endpointUrl,
    modelId: repoId,
    pid: child.pid || null,
    runtime,
    startedAt: Date.now(),
  };

  try {
    const healthTimeoutMs = payload.healthTimeoutMs || (runtime === 'transformers' ? 20 * 60 * 1000 : 2 * 60 * 1000);
    await waitForOpenAiEndpointOrProcessExit(endpointUrl, child, healthTimeoutMs, progress, shouldCancel);
    localModelDeployments.set(repoId, deployment);
    localModelDeploymentsInFlight.delete(repoId);
    progress({
      stage: 'ready',
      message: `${repoId} is ready for OpenAI-compatible requests.`,
      detail: endpointUrl,
      level: 'success',
    });
    return deployment;
  } catch (error) {
    stopProcessTree(child.pid);
    localModelDeploymentsInFlight.delete(repoId);
    const logTail = readLogTail(child.oneinferLogPath);
    const runtimeDetail = runtime === 'transformers'
      ? getTransformersFailureDetail(error instanceof Error ? error.message : String(error), logTail)
      : { message: null, detail: null };
    const userLogTail = compactDeploymentLogTail(logTail);
    const errorDetail = [
      runtimeDetail.message,
      runtimeDetail.detail,
      error instanceof Error ? error.message : String(error),
      child.oneinferLogPath ? `Logs: ${child.oneinferLogPath}` : '',
      userLogTail ? `Last log lines:\n${userLogTail}` : '',
    ].filter(Boolean).join('\n');

    progress({
      stage: 'error',
      message: error?.cancelled ? 'Local deployment cancelled.' : 'Local deployment failed.',
      detail: errorDetail,
      level: 'error',
    });
    throw new Error(errorDetail);
  }
}

async function cancelHfDeployment(payload = {}) {
  const repoId = normalizeLocalModelId(payload.repoId, payload.runtime || 'vllm');
  const inFlight = localModelDeploymentsInFlight.get(repoId);
  if (!inFlight) {
    return { cancelled: false, message: `No active deployment found for ${repoId}.` };
  }

  inFlight.cancelled = true;
  stopProcessTree(inFlight.child?.pid);
  localModelDeploymentsInFlight.delete(repoId);
  sendDeploymentProgress({
    id: inFlight.progressId,
    stage: 'cancelled',
    message: `Cancelled deployment for ${repoId}.`,
    detail: inFlight.endpointUrl || undefined,
    level: 'error',
  });

  return { cancelled: true, message: `Cancelled deployment for ${repoId}.` };
}

function normalizeOpenAiBaseUrl(endpointUrl) {
  const normalized = String(endpointUrl || '').trim().replace(/\/+$/, '');
  if (!normalized) return '';
  if (/\/v1$/i.test(normalized)) return normalized;
  if (/\/v1\/chat\/completions$/i.test(normalized)) return normalized.replace(/\/chat\/completions$/i, '');
  return `${normalized}/v1`;
}

async function readJsonRequest(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8') || '{}';
  return JSON.parse(rawBody);
}

function sendJsonResponse(res, status, payload) {
  const raw = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': raw.length,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(raw);
}

async function postOpenAiChatCompletion(endpointUrl, payload, headers = {}) {
  const targetUrl = `${normalizeOpenAiBaseUrl(endpointUrl)}/chat/completions`;
  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(headers.authorization ? { Authorization: headers.authorization } : {}),
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    const message = typeof parsed === 'string'
      ? parsed
      : parsed?.error?.message || parsed?.detail || response.statusText;
    throw new Error(`Candidate endpoint ${targetUrl} returned HTTP ${response.status}: ${message}`);
  }

  return parsed;
}

async function chooseLocalRouteCandidate(route, requestPayload) {
  const candidates = route.candidates.filter((candidate) => candidate.endpointUrl);
  if (candidates.length === 0) {
    throw new Error('This local route has no callable local/OpenAI-compatible candidate endpoint URLs.');
  }

  if (candidates.length === 1 || !route.routerEndpointUrl) {
    route.nextIndex = (route.nextIndex + 1) % candidates.length;
    return candidates[0];
  }

  const routerPrompt = [
    'Select the best endpoint for this request.',
    'Return only the endpoint id, name, or index.',
    route.description ? `Route goal: ${route.description}` : '',
    `Endpoints:\n${candidates.map((candidate, index) => formatRouteCandidateForPrompt(candidate, index)).join('\n')}`,
    `Request: ${JSON.stringify(requestPayload.messages || requestPayload.prompt || requestPayload).slice(0, 4000)}`,
  ].filter(Boolean).join('\n');

  try {
    const routerResponse = await postOpenAiChatCompletion(route.routerEndpointUrl, {
      model: route.routerModelId || 'router',
      messages: [{ role: 'user', content: routerPrompt }],
      max_tokens: 64,
    });
    const content = String(routerResponse?.choices?.[0]?.message?.content || routerResponse?.choices?.[0]?.text || '').toLowerCase();
    const matched = candidates.find((candidate, index) => {
      const id = String(candidate.id || '').toLowerCase();
      const name = String(candidate.name || '').toLowerCase();
      return content.includes(String(index)) || (id && content.includes(id)) || (name && content.includes(name));
    });
    if (matched) {
      return matched;
    }
  } catch (error) {
    console.warn('[local-route] router selection failed, falling back to round-robin', error);
  }

  const selected = candidates[route.nextIndex % candidates.length];
  route.nextIndex = (route.nextIndex + 1) % candidates.length;
  return selected;
}

async function startLocalRoute(payload = {}) {
  const routeId = String(payload.routeId || payload.name || crypto.randomUUID());
  const existingRoute = localRouteDeployments.get(routeId);
  if (existingRoute?.endpointUrl) {
    return {
      endpointUrl: existingRoute.endpointUrl,
      port: existingRoute.port,
      routeId,
    };
  }

  const routerEndpointUrl = normalizeOpenAiBaseUrl(payload.routerEndpointUrl || '');
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates
        .map((candidate) => ({
          id: String(candidate.endpoint_id || candidate.id || candidate.endpointUrl || ''),
          name: String(candidate.endpoint_name || candidate.name || candidate.model_id || candidate.modelId || candidate.endpointUrl || 'endpoint'),
          modelId: String(candidate.model_id || candidate.modelId || candidate.name || ''),
          description: String(candidate.model_description || candidate.modelDescription || candidate.description || ''),
          contextLength: String(candidate.model_context_length || candidate.modelContextLength || ''),
          parameters: String(candidate.model_parameters || candidate.modelParameters || ''),
          tags: Array.isArray(candidate.model_tags)
            ? candidate.model_tags.map((tag) => String(tag)).filter(Boolean)
            : Array.isArray(candidate.tags)
              ? candidate.tags.map((tag) => String(tag)).filter(Boolean)
              : [],
          endpointUrl: normalizeOpenAiBaseUrl(candidate.endpoint_url || candidate.endpointUrl || ''),
          authorization: candidate.authorization || candidate.api_key ? `Bearer ${candidate.api_key}` : undefined,
        }))
        .filter((candidate) => candidate.endpointUrl)
        .filter((candidate) => candidate.endpointUrl !== routerEndpointUrl)
    : [];

  if (candidates.length === 0) {
    throw new Error('Cannot start a fully local route because none of the attached candidate endpoints include a callable URL different from the router model URL. Attach deployed model endpoints, not the router endpoint.');
  }

  const port = await findAvailablePort(payload.port || 8500);
  const route = {
    routeId,
    name: String(payload.name || routeId),
    description: String(payload.description || ''),
    routerEndpointUrl,
    routerModelId: String(payload.routerModelId || ''),
    candidates,
    nextIndex: 0,
    port,
    endpointUrl: `http://127.0.0.1:${port}/v1`,
  };

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      sendJsonResponse(res, 204, {});
      return;
    }

    if (req.method === 'GET' && req.url.replace(/\/+$/, '') === '/v1/models') {
      sendJsonResponse(res, 200, {
        object: 'list',
        data: candidates.map((candidate) => ({ id: candidate.modelId || candidate.name, object: 'model', owned_by: 'oneinfer-local-route' })),
      });
      return;
    }

    if (req.method !== 'POST' || !['/v1/chat/completions', '/v1/completions'].includes(req.url.replace(/\/+$/, ''))) {
      sendJsonResponse(res, 404, { error: { message: 'Not found' } });
      return;
    }

    try {
      const requestPayload = await readJsonRequest(req);
      const candidate = await chooseLocalRouteCandidate(route, requestPayload);
      const responsePayload = await postOpenAiChatCompletion(candidate.endpointUrl, {
        ...requestPayload,
        model: requestPayload.model && requestPayload.model !== 'route' ? requestPayload.model : candidate.modelId || requestPayload.model,
      }, { authorization: candidate.authorization || req.headers.authorization });
      sendJsonResponse(res, 200, {
        ...responsePayload,
        oneinfer_route: {
          route_id: route.routeId,
          selected_endpoint_id: candidate.id,
          selected_endpoint_name: candidate.name,
          selected_endpoint_url: candidate.endpointUrl,
        },
      });
    } catch (error) {
      sendJsonResponse(res, 500, { error: { message: error instanceof Error ? error.message : String(error) } });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  server.unref();
  route.server = server;
  localRouteDeployments.set(routeId, route);

  return {
    endpointUrl: route.endpointUrl,
    port,
    routeId,
  };
}

function formatRouteCandidateForPrompt(candidate, index) {
  const parts = [
    `${index}: ${candidate.name || candidate.id}`,
    `model=${candidate.modelId || 'unknown'}`,
    candidate.description ? `description=${candidate.description.slice(0, 800)}` : '',
    candidate.tags?.length ? `tags=${candidate.tags.join(', ')}` : '',
    candidate.parameters ? `parameters=${candidate.parameters}` : '',
    candidate.contextLength ? `context_length=${candidate.contextLength}` : '',
  ].filter(Boolean);

  return `- ${parts.join('; ')}`;
}

async function stopLocalRoute(payload = {}) {
  const routeId = String(payload.routeId || '').trim();
  const endpointUrl = normalizeOpenAiBaseUrl(payload.endpointUrl || '');
  const candidateEndpointUrl = normalizeOpenAiBaseUrl(payload.candidateEndpointUrl || '');
  const stoppedRouteIds = [];

  for (const [existingRouteId, route] of [...localRouteDeployments.entries()]) {
    const routeMatches = (routeId && existingRouteId === routeId)
      || (endpointUrl && route.endpointUrl === endpointUrl)
      || (candidateEndpointUrl && route.candidates.some((candidate) => candidate.endpointUrl === candidateEndpointUrl));

    if (!routeMatches) {
      continue;
    }

    await new Promise((resolve) => {
      route.server?.close?.(() => resolve());
      setTimeout(resolve, 1000);
    });
    localRouteDeployments.delete(existingRouteId);
    stoppedRouteIds.push(existingRouteId);
  }

  return {
    stopped: stoppedRouteIds.length > 0,
    routeIds: stoppedRouteIds,
    message: stoppedRouteIds.length > 0 ? 'Local route stopped.' : 'No matching local route was running.',
  };
}

async function deleteLocalModel(payload = {}) {
  const endpointUrl = String(payload.endpointUrl || '').trim();
  const modelId = String(payload.modelId || '').trim();
  const runtime = String(payload.runtime || '').trim().toLowerCase();

  if (!endpointUrl && !modelId) {
    throw new Error('Local endpoint URL or model id is required.');
  }

  const entries = [...localModelDeployments.entries()];
  const matchedEntry = entries.find(([repoId, deployment]) => {
    return deployment.endpointUrl === endpointUrl
      || deployment.modelId === modelId
      || repoId === modelId;
  });

  if (matchedEntry) {
    const [repoId, deployment] = matchedEntry;
    stopProcessTree(deployment.pid);
    localModelDeployments.delete(repoId);
  }

  if (endpointUrl) {
    await stopLocalRoute({ candidateEndpointUrl: endpointUrl });
  }

  if (runtime === 'ollama' && modelId && await isLibraryInstalled('ollama')) {
    try {
      await runCommand(getOllamaCommand(), ['rm', modelId], { timeoutMs: 2 * 60 * 1000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const normalizedMessage = message.toLowerCase();
      const alreadyMissing = normalizedMessage.includes('not found')
        || normalizedMessage.includes('does not exist')
        || normalizedMessage.includes('no such model')
        || normalizedMessage.includes('model not found');
      if (!alreadyMissing) {
        throw error;
      }
    }
  }

  return {
    deleted: true,
    message: matchedEntry ? 'Local deployment stopped and removed.' : 'Local deployment registration removed.',
  };
}

async function getLocalModelMetrics(payload = {}) {
  const endpointUrl = String(payload.endpointUrl || '').trim();
  if (!endpointUrl) {
    throw new Error('Local endpoint URL is required.');
  }

  const metrics = createEmptyLocalModelMetrics(endpointUrl);
  const modelsUrl = `${endpointUrl.replace(/\/+$/, '')}/models`;
  const baseUrl = getMetricsBaseUrl(endpointUrl);
  const metricsUrl = `${baseUrl}/metrics`;

  try {
    const modelsResponse = await fetchWithTimeout(modelsUrl, 5000);
    metrics.healthy = modelsResponse.ok;
    if (modelsResponse.ok) {
      const payload = await modelsResponse.json().catch(() => null);
      metrics.modelCount = Array.isArray(payload?.data) ? payload.data.length : 0;
      metrics.modelIds = Array.isArray(payload?.data)
        ? payload.data.map((model) => String(model?.id ?? model?.model ?? '')).filter(Boolean)
        : [];
    }
  } catch (error) {
    metrics.error = error instanceof Error ? error.message : String(error);
  }

  try {
    const metricsResponse = await fetchWithTimeout(metricsUrl, 5000);
    if (metricsResponse.ok) {
      const metricsText = await metricsResponse.text();
      metrics.requestsRunning = readPrometheusMetric(metricsText, ['vllm:num_requests_running', 'vllm_num_requests_running']);
      metrics.requestsWaiting = readPrometheusMetric(metricsText, ['vllm:num_requests_waiting', 'vllm_num_requests_waiting']);
      metrics.requestSuccessTotal = readPrometheusMetric(metricsText, ['vllm:request_success_total', 'vllm_request_success_total']);
      metrics.promptTokensTotal = readPrometheusMetric(metricsText, ['vllm:prompt_tokens_total', 'vllm_prompt_tokens_total']);
      metrics.generationTokensTotal = readPrometheusMetric(metricsText, ['vllm:generation_tokens_total', 'vllm_generation_tokens_total']);

      const gpuCacheUsage = readPrometheusMetric(metricsText, ['vllm:gpu_cache_usage_perc', 'vllm_gpu_cache_usage_perc']);
      metrics.gpuCacheUsagePercent = gpuCacheUsage === null ? null : gpuCacheUsage * 100;
    }
  } catch (error) {
    metrics.error = metrics.error || (error instanceof Error ? error.message : String(error));
  }

  const deployment = [...localModelDeployments.values()].find((item) => item.endpointUrl === endpointUrl);
  if (deployment?.startedAt) {
    metrics.uptimeSeconds = Math.max(0, Math.floor((Date.now() - deployment.startedAt) / 1000));
  }

  return metrics;
}


function getDefaultGitBashPath() {
  if (process.platform !== 'win32') {
    return null;
  }

  const candidates = [
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe'),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function getClaudeModel(existingSettings, fallbackModel = DEFAULT_CLAUDE_MODEL) {
  const existingEnv = getClaudeSettingsEnv(existingSettings);

  return toTrimmedString(existingSettings.model)
    || toTrimmedString(existingEnv.ANTHROPIC_MODEL)
    || fallbackModel;
}

function normalizeApiBaseUrl(value) {
  const trimmedValue = trimTrailingSlash(value);
  if (!trimmedValue) {
    return trimmedValue;
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    const normalizedHostname = parsedUrl.hostname.replace(/^www\./i, '').toLowerCase();
    const normalizedPathname = parsedUrl.pathname.replace(/\/+$/, '');

    if (normalizedHostname === 'oneinfer.ai') {
      parsedUrl.hostname = 'api.oneinfer.ai';
    }

    if (!normalizedPathname || normalizedPathname === '/') {
      parsedUrl.pathname = '/v1';
    }

    parsedUrl.search = '';
    parsedUrl.hash = '';
    return trimTrailingSlash(parsedUrl.toString());
  } catch {
    return trimmedValue;
  }
}

function deriveClaudeBaseUrl(apiBaseUrl) {
  const trimmedBaseUrl = normalizeApiBaseUrl(apiBaseUrl);
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

function createOpenCodeApiKeyName() {
  const hostname = (os.hostname() || 'device').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 16) || 'device';
  return `OpenCode-${hostname}-${Date.now().toString(36)}`;
}

function createKiloCodeApiKeyName() {
  const hostname = (os.hostname() || 'device').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 16) || 'device';
  return `KiloCode-${hostname}-${Date.now().toString(36)}`;
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

function getOneInferConfigFilePath() {
  return path.join(os.homedir(), '.oneinfer', 'config.json');
}

function readOneInferConfig() {
  return readJsonFile(getOneInferConfigFilePath(), {});
}

function writeOneInferConfig(nextConfig) {
  const filePath = getOneInferConfigFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(nextConfig, null, 2), 'utf8');
}

function resolveOneInferApiBaseUrl(value, consumerLabel = 'OneInfer') {
  const baseUrl = normalizeApiBaseUrl(value);
  if (baseUrl) {
    return baseUrl;
  }

  throw new Error(`API base URL is required to configure ${consumerLabel}.`);
}

function createNetworkFetchError(action, baseUrl, error) {
  const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
  return new Error(`${action} failed because OneInfer could not be reached at ${baseUrl}.${detail}`);
}

async function fetchApiKeysWithMeta(payload) {
  const baseUrl = normalizeApiBaseUrl(payload?.apiBaseUrl);
  const session = payload?.session || {};

  if (!baseUrl || !session.developerId || !session.accessToken) {
    return {
      apiKeys: [],
      resolvedBaseUrl: baseUrl,
      reachable: false,
      networkError: null,
    };
  }

  const requestUrl = new URL(`${baseUrl}/developer/${session.developerId}/get-api-keys`);
  try {
    const response = await fetch(requestUrl.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    });

    if (!response.ok) {
      return {
        apiKeys: [],
        resolvedBaseUrl: baseUrl,
        reachable: true,
        networkError: null,
      };
    }

    const responsePayload = await readResponsePayload(response);
    const data = extractResponseData(responsePayload);

    if (Array.isArray(data)) {
      return {
        apiKeys: data,
        resolvedBaseUrl: baseUrl,
        reachable: true,
        networkError: null,
      };
    }

    if (data && typeof data === 'object') {
      const nestedArray = Object.values(data).find(item => Array.isArray(item));
      if (Array.isArray(nestedArray)) {
        return {
          apiKeys: nestedArray,
          resolvedBaseUrl: baseUrl,
          reachable: true,
          networkError: null,
        };
      }

      return {
        apiKeys: Object.values(data).filter(item => Boolean(item && typeof item === 'object')),
        resolvedBaseUrl: baseUrl,
        reachable: true,
        networkError: null,
      };
    }
  } catch (error) {
    return {
      apiKeys: [],
      resolvedBaseUrl: baseUrl,
      reachable: false,
      networkError: createNetworkFetchError('Fetching OneInfer API keys', baseUrl, error),
    };
  }

  return {
    apiKeys: [],
    resolvedBaseUrl: baseUrl,
    reachable: true,
    networkError: null,
  };
}

async function fetchApiKeys(payload) {
  const result = await fetchApiKeysWithMeta(payload);
  if (!result.reachable && result.networkError) {
    console.warn('[api-keys] failed to fetch api keys', result.networkError);
  }

  return result.apiKeys;
}

async function createOneInferApiKey(payload, apiKeyName, consumerLabel) {
  const baseUrl = resolveOneInferApiBaseUrl(payload?.apiBaseUrl, consumerLabel);
  const session = payload?.session || {};

  if (!session.developerId || !session.accessToken) {
    throw new Error(`A signed-in OneInfer session is required to enable ${consumerLabel}.`);
  }

  const requestUrl = new URL(`${baseUrl}/developer/${session.developerId}/create-api-key`);
  requestUrl.searchParams.set('api_key_name', apiKeyName);
  requestUrl.searchParams.set('environment', 'production');

  try {
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
      throw new Error(`OneInfer did not return a usable API key for ${consumerLabel}.`);
    }

    return {
      apiKey,
      apiKeyName,
      apiBaseUrl: baseUrl,
    };
  } catch (error) {
    if (error instanceof Error && error.message && !/^fetch failed$/i.test(error.message.trim())) {
      throw error;
    }

    throw createNetworkFetchError(`Creating a OneInfer API key for ${consumerLabel}`, baseUrl, error);
  }
}

function configureClaudeCodeSettings(payload) {
  const apiBaseUrl = normalizeApiBaseUrl(payload?.apiBaseUrl);
  const authToken = toTrimmedString(payload?.authToken);

  if (!apiBaseUrl) {
    throw new Error('API base URL is required to configure Claude Code.');
  }

  if (!authToken) {
    throw new Error('Claude Code authentication token is missing.');
  }

  const { settingsFilePath, existingSettings } = readClaudeSettings();
  const existingEnv = getClaudeSettingsEnv(existingSettings);

  const anthropicBaseUrl = deriveClaudeBaseUrl(apiBaseUrl);
  const anthropicModel =
    toTrimmedString(payload?.anthropicModel)
    || getClaudeModel(existingSettings, DEFAULT_ONEINFER_MODEL)
    || DEFAULT_ONEINFER_MODEL;
  const configuredGitBashPath = toTrimmedString(existingEnv.CLAUDE_CODE_GIT_BASH_PATH);
  const gitBashPath = configuredGitBashPath && fs.existsSync(configuredGitBashPath)
    ? configuredGitBashPath
    : getDefaultGitBashPath();
  const nextEnv = {
    ...existingEnv,
    ANTHROPIC_BASE_URL: anthropicBaseUrl,
    ANTHROPIC_AUTH_TOKEN: authToken,
    ANTHROPIC_MODEL: anthropicModel,
  };
  if (gitBashPath) {
    nextEnv.CLAUDE_CODE_GIT_BASH_PATH = gitBashPath;
  } else {
    delete nextEnv.CLAUDE_CODE_GIT_BASH_PATH;
  }

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

async function createClaudeCodeApiKey(payload) {
  return createOneInferApiKey(payload, createClaudeCodeApiKeyName(), 'Claude Code');
}

async function createOpenCodeApiKey(payload) {
  return createOneInferApiKey(payload, createOpenCodeApiKeyName(), 'OpenCode');
}

async function createKiloCodeApiKey(payload) {
  return createOneInferApiKey(payload, createKiloCodeApiKeyName(), 'Kilo Code');
}

function isClaudeCodeUsingOneInfer(existingSettings, apiBaseUrl) {
  const existingEnv = getClaudeSettingsEnv(existingSettings);
  const existingBaseUrl = trimTrailingSlash(toTrimmedString(existingEnv.ANTHROPIC_BASE_URL));
  const existingToken = toTrimmedString(existingEnv.ANTHROPIC_AUTH_TOKEN);
  const expectedBaseUrl = deriveClaudeBaseUrl(apiBaseUrl);

  return Boolean(existingBaseUrl && existingToken && existingBaseUrl === expectedBaseUrl);
}

function resetClaudeCodeSettings(payload) {
  const { settingsFilePath, existingSettings } = readClaudeSettings();
  const anthropicModel =
    toTrimmedString(payload?.anthropicModel)
    || getClaudeModel(existingSettings)
    || DEFAULT_CLAUDE_MODEL;
  const existingEnv = getClaudeSettingsEnv(existingSettings);
  const nextEnv = { ...existingEnv };
  delete nextEnv.ANTHROPIC_BASE_URL;
  delete nextEnv.ANTHROPIC_AUTH_TOKEN;
  delete nextEnv.ANTHROPIC_MODEL;

  const nextSettings = {
    ...existingSettings,
    model: anthropicModel,
  };
  delete nextSettings.env;
  if (Object.keys(nextEnv).length > 0) {
    nextSettings.env = nextEnv;
  }

  fs.mkdirSync(path.dirname(settingsFilePath), { recursive: true });
  fs.writeFileSync(settingsFilePath, `${JSON.stringify(nextSettings, null, 2)}\n`, 'utf8');

  return {
    alreadyConfigured: !toTrimmedString(existingEnv.ANTHROPIC_BASE_URL)
      && !toTrimmedString(existingEnv.ANTHROPIC_AUTH_TOKEN)
      && toTrimmedString(existingSettings.model) === anthropicModel,
    anthropicBaseUrl: null,
    anthropicModel,
    apiKeyName: null,
    claudeCodeInstallState: 'not-required',
    provider: 'anthropic',
    settingsPath: settingsFilePath,
  };
}

async function enableClaudeCode(payload) {
  const provider = payload?.provider === 'anthropic' ? 'anthropic' : 'oneinfer';

  if (provider === 'anthropic') {
    return resetClaudeCodeSettings(payload);
  }

  const claudeCodeInstallState = await ensureClaudeCodeInstalled();

  const { existingSettings } = readClaudeSettings();
  const isAlreadyUsingOneInfer = isClaudeCodeUsingOneInfer(existingSettings, payload?.apiBaseUrl);

  const config = readOneInferConfig();
  const savedApiKey = config.claudeApiKey;
  const savedApiKeyName = config.claudeApiKeyName;

  const apiKeysFetchResult = await fetchApiKeysWithMeta(payload);

  if (savedApiKey && savedApiKeyName) {
    const keyExists = apiKeysFetchResult.apiKeys.some(k => 
      k.api_key_name === savedApiKeyName || k.id === savedApiKeyName || k.name === savedApiKeyName
    );

    if (keyExists || !apiKeysFetchResult.reachable) {
      const configResult = configureClaudeCodeSettings({
        apiBaseUrl: payload?.apiBaseUrl,
        authToken: savedApiKey,
      });

      return {
        alreadyConfigured: isAlreadyUsingOneInfer,
        ...configResult,
        apiKeyName: savedApiKeyName,
        provider: 'oneinfer',
        claudeCodeInstallState,
        ...(isAlreadyUsingOneInfer ? {} : { reusedExistingKey: true }),
      };
    }
  }

  const { apiKey, apiKeyName } = await createClaudeCodeApiKey(payload);
  
  writeOneInferConfig({
    ...config,
    claudeApiKey: apiKey,
    claudeApiKeyName: apiKeyName,
  });

  const configResult = configureClaudeCodeSettings({
    apiBaseUrl: payload?.apiBaseUrl,
    authToken: apiKey,
  });

  return {
    alreadyConfigured: false,
    ...configResult,
    apiKeyName,
    provider: 'oneinfer',
    claudeCodeInstallState,
  };
}

function getOpenCodeProvider(existingConfig, providerId = 'oneinfer') {
  const provider = existingConfig?.provider;
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
    return null;
  }

  const providerConfig = provider[providerId];
  if (!providerConfig || typeof providerConfig !== 'object' || Array.isArray(providerConfig)) {
    return null;
  }

  return providerConfig;
}

function getOpenCodeModelId(existingConfig, providerId = 'oneinfer') {
  const configuredModel = toTrimmedString(existingConfig?.model);
  if (configuredModel && configuredModel.startsWith(`${providerId}/`)) {
    return configuredModel.slice(providerId.length + 1);
  }

  const providerConfig = getOpenCodeProvider(existingConfig, providerId);
  const providerModels =
    providerConfig?.models && typeof providerConfig.models === 'object' && !Array.isArray(providerConfig.models)
      ? providerConfig.models
      : {};
  const firstModelId = Object.keys(providerModels).find((modelId) => toTrimmedString(modelId));
  return firstModelId || DEFAULT_ONEINFER_CODE_MODEL;
}

function buildOneInferCodeModels(existingOneInferModels) {
  const nextModels = {
    ...existingOneInferModels,
  };

  for (const [modelId, modelConfig] of Object.entries(ONEINFER_CODE_MODELS)) {
    const existingModelConfig =
      nextModels[modelId] && typeof nextModels[modelId] === 'object' && !Array.isArray(nextModels[modelId])
        ? nextModels[modelId]
        : {};
    const existingLimit =
      existingModelConfig.limit && typeof existingModelConfig.limit === 'object' && !Array.isArray(existingModelConfig.limit)
        ? existingModelConfig.limit
        : {};

    nextModels[modelId] = {
      ...existingModelConfig,
      name: toTrimmedString(existingModelConfig.name) || modelConfig.name,
      limit: {
        ...modelConfig.limit,
        ...existingLimit,
      },
    };
  }

  return nextModels;
}

function configureOpenCode(payload) {
  const apiBaseUrl = normalizeApiBaseUrl(payload?.apiBaseUrl);
  const apiKey = toTrimmedString(payload?.apiKey);

  if (!apiBaseUrl) {
    throw new Error('API base URL is required to configure OpenCode.');
  }

  if (!apiKey) {
    throw new Error('OpenCode API key is missing.');
  }

  const { configFilePath, existingConfig } = readOpenCodeConfig();
  const modelId = toTrimmedString(payload?.modelId) || getOpenCodeModelId(existingConfig);
  const existingProviders =
    existingConfig.provider && typeof existingConfig.provider === 'object' && !Array.isArray(existingConfig.provider)
      ? existingConfig.provider
      : {};
  const existingOneInferConfig = getOpenCodeProvider(existingConfig) || {};
  const existingOneInferOptions =
    existingOneInferConfig.options && typeof existingOneInferConfig.options === 'object' && !Array.isArray(existingOneInferConfig.options)
      ? existingOneInferConfig.options
      : {};
  const existingOneInferModels =
    existingOneInferConfig.models && typeof existingOneInferConfig.models === 'object' && !Array.isArray(existingOneInferConfig.models)
      ? existingOneInferConfig.models
      : {};
  const nextModels = buildOneInferCodeModels(existingOneInferModels);

  const nextConfig = {
    ...existingConfig,
    $schema: existingConfig.$schema || OPENCODE_CONFIG_SCHEMA_URL,
    model: `oneinfer/${modelId}`,
    provider: {
      ...existingProviders,
      oneinfer: {
        ...existingOneInferConfig,
        npm: '@ai-sdk/anthropic',
        name: 'OneInfer',
        options: {
          ...existingOneInferOptions,
          baseURL: apiBaseUrl,
          apiKey,
        },
        models: nextModels,
      },
    },
  };

  fs.mkdirSync(path.dirname(configFilePath), { recursive: true });
  fs.writeFileSync(configFilePath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');

  return {
    apiBaseUrl,
    configPath: configFilePath,
    model: nextConfig.model,
    providerId: 'oneinfer',
  };
}

function configureKiloCode(payload) {
  const apiBaseUrl = normalizeApiBaseUrl(payload?.apiBaseUrl);
  const apiKey = toTrimmedString(payload?.apiKey);

  if (!apiBaseUrl) {
    throw new Error('API base URL is required to configure Kilo Code.');
  }

  if (!apiKey) {
    throw new Error('Kilo Code API key is missing.');
  }

  const { configFilePath, legacyConfigFilePath, existingConfig } = readKiloCodeConfig();
  const modelId = toTrimmedString(payload?.modelId) || getOpenCodeModelId(existingConfig);
  const existingProviders =
    existingConfig.provider && typeof existingConfig.provider === 'object' && !Array.isArray(existingConfig.provider)
      ? existingConfig.provider
      : {};
  const existingOneInferConfig = getOpenCodeProvider(existingConfig) || {};
  const existingOneInferOptions =
    existingOneInferConfig.options && typeof existingOneInferConfig.options === 'object' && !Array.isArray(existingOneInferConfig.options)
      ? existingOneInferConfig.options
      : {};
  const existingOneInferModels =
    existingOneInferConfig.models && typeof existingOneInferConfig.models === 'object' && !Array.isArray(existingOneInferConfig.models)
      ? existingOneInferConfig.models
      : {};
  const nextModels = buildOneInferCodeModels(existingOneInferModels);

  const nextConfig = {
    ...existingConfig,
    $schema: existingConfig.$schema || KILO_CODE_CONFIG_SCHEMA_URL,
    model: `oneinfer/${modelId}`,
    provider: {
      ...existingProviders,
      oneinfer: {
        ...existingOneInferConfig,
        npm: '@ai-sdk/anthropic',
        name: 'OneInfer',
        options: {
          ...existingOneInferOptions,
          baseURL: apiBaseUrl,
          apiKey,
        },
        models: nextModels,
      },
    },
  };

  fs.mkdirSync(path.dirname(configFilePath), { recursive: true });
  fs.writeFileSync(configFilePath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
  removeLegacyKiloCodeConfig(configFilePath, legacyConfigFilePath);

  return {
    apiBaseUrl,
    configPath: configFilePath,
    model: nextConfig.model,
    providerId: 'oneinfer',
  };
}

function isOpenCodeUsingOneInfer(existingConfig, apiBaseUrl) {
  const oneinferConfig = getOpenCodeProvider(existingConfig);
  const options =
    oneinferConfig?.options && typeof oneinferConfig.options === 'object' && !Array.isArray(oneinferConfig.options)
      ? oneinferConfig.options
      : {};
  const existingBaseUrl = trimTrailingSlash(toTrimmedString(options.baseURL));
  const existingApiKey = toTrimmedString(options.apiKey);
  const expectedBaseUrl = trimTrailingSlash(normalizeApiBaseUrl(apiBaseUrl));

  return Boolean(existingBaseUrl && existingApiKey && existingBaseUrl === expectedBaseUrl);
}

function isKiloCodeUsingOneInfer(existingConfig, apiBaseUrl) {
  const oneinferConfig = getOpenCodeProvider(existingConfig);
  const options =
    oneinferConfig?.options && typeof oneinferConfig.options === 'object' && !Array.isArray(oneinferConfig.options)
      ? oneinferConfig.options
      : {};
  const existingBaseUrl = trimTrailingSlash(toTrimmedString(options.baseURL));
  const existingApiKey = toTrimmedString(options.apiKey);
  const expectedBaseUrl = trimTrailingSlash(normalizeApiBaseUrl(apiBaseUrl));

  return Boolean(existingBaseUrl && existingApiKey && existingBaseUrl === expectedBaseUrl);
}

async function enableOpenCode(payload) {
  const opencodeInstallState = await ensureOpenCodeInstalled();
  const { existingConfig } = readOpenCodeConfig();
  const config = readOneInferConfig();
  const savedApiKey = toTrimmedString(config.opencodeApiKey);
  const savedApiKeyName = toTrimmedString(config.opencodeApiKeyName);

  const isAlreadyUsingOneInfer = isOpenCodeUsingOneInfer(existingConfig, payload?.apiBaseUrl);

  const apiKeyFetchResult = await fetchApiKeysWithMeta(payload);

  if (savedApiKey && savedApiKeyName) {
    const keyExists = apiKeyFetchResult.apiKeys.some((k) =>
      k.api_key_name === savedApiKeyName || k.id === savedApiKeyName || k.name === savedApiKeyName
    );

    if (keyExists || !apiKeyFetchResult.reachable) {
      writeOneInferConfig({
        ...config,
        opencodeApiKey: savedApiKey,
        opencodeApiKeyName: savedApiKeyName,
        opencodeApiBaseUrl: normalizeApiBaseUrl(payload?.apiBaseUrl),
      });

      return {
        alreadyConfigured: isAlreadyUsingOneInfer,
        ...configureOpenCode({
          apiBaseUrl: payload?.apiBaseUrl,
          apiKey: savedApiKey,
          modelId: DEFAULT_ONEINFER_CODE_MODEL,
        }),
        apiKeyName: savedApiKeyName,
        opencodeInstallState,
        providerId: 'oneinfer',
        ...(isAlreadyUsingOneInfer ? {} : { reusedExistingKey: true }),
      };
    }
  }

  const { apiKey, apiKeyName, apiBaseUrl } = await createOpenCodeApiKey(payload);

  writeOneInferConfig({
    ...config,
    opencodeApiKey: apiKey,
    opencodeApiKeyName: apiKeyName,
    opencodeApiBaseUrl: apiBaseUrl,
  });

  return {
    alreadyConfigured: false,
    ...configureOpenCode({
      apiBaseUrl,
      apiKey,
      modelId: DEFAULT_ONEINFER_CODE_MODEL,
    }),
    apiKeyName,
    opencodeInstallState,
    providerId: 'oneinfer',
  };
}

async function enableKiloCode(payload) {
  const kilocodeInstallState = await ensureKiloCodeInstalled();
  const { existingConfig } = readKiloCodeConfig();
  const config = readOneInferConfig();
  const savedApiKey = toTrimmedString(config.kilocodeApiKey);
  const savedApiKeyName = toTrimmedString(config.kilocodeApiKeyName);

  const isAlreadyUsingOneInfer = isKiloCodeUsingOneInfer(existingConfig, payload?.apiBaseUrl);
  const apiKeyFetchResult = await fetchApiKeysWithMeta(payload);

  if (savedApiKey && savedApiKeyName) {
    const keyExists = apiKeyFetchResult.apiKeys.some((k) =>
      k.api_key_name === savedApiKeyName || k.id === savedApiKeyName || k.name === savedApiKeyName
    );

    if (keyExists || !apiKeyFetchResult.reachable) {
      writeOneInferConfig({
        ...config,
        kilocodeApiKey: savedApiKey,
        kilocodeApiKeyName: savedApiKeyName,
        kilocodeApiBaseUrl: normalizeApiBaseUrl(payload?.apiBaseUrl),
      });

      return {
        alreadyConfigured: isAlreadyUsingOneInfer,
        ...configureKiloCode({
          apiBaseUrl: payload?.apiBaseUrl,
          apiKey: savedApiKey,
          modelId: DEFAULT_KILOCODE_MODEL,
        }),
        apiKeyName: savedApiKeyName,
        kilocodeInstallState,
        providerId: 'oneinfer',
        ...(isAlreadyUsingOneInfer ? {} : { reusedExistingKey: true }),
      };
    }
  }

  const { apiKey, apiKeyName, apiBaseUrl } = await createKiloCodeApiKey(payload);

  writeOneInferConfig({
    ...config,
    kilocodeApiKey: apiKey,
    kilocodeApiKeyName: apiKeyName,
    kilocodeApiBaseUrl: apiBaseUrl,
  });

  return {
    alreadyConfigured: false,
    ...configureKiloCode({
      apiBaseUrl,
      apiKey,
      modelId: DEFAULT_KILOCODE_MODEL,
    }),
    apiKeyName,
    kilocodeInstallState,
    providerId: 'oneinfer',
  };
}

async function isOpenClawInstalled() {
  try {
    return await commandExists('openclaw');
  } catch {
    return false;
  }
}

async function getOpenClawInstallCommands() {
  if (process.platform === 'win32') {
    const commands = [];
    if (await commandExists('npm')) {
      commands.push({
        command: 'npm.cmd',
        args: ['install', '-g', 'openclaw'],
        label: 'npm global installer',
      });
    }
    return commands;
  }

  const commands = [];
  if (await commandExists('npm')) {
    commands.push({
      command: 'npm',
      args: ['install', '-g', 'openclaw'],
      label: 'npm global installer',
    });
  }
  return commands;
}

async function ensureOpenClawInstalled() {
  if (await isOpenClawInstalled()) {
    return 'already-installed';
  }

  const installCommands = await getOpenClawInstallCommands();
  if (installCommands.length === 0) {
    throw new Error(`OpenClaw was not found and no supported installer was available on this ${process.platform} system.`);
  }

  let lastError = null;
  for (const installCommand of installCommands) {
    try {
      await runCommand(installCommand.command, installCommand.args, {
        timeoutMs: 10 * 60 * 1000,
        shell: process.platform === 'win32',
      });

      if (await isOpenClawInstalled()) {
        return 'installed';
      }
    } catch (error) {
      lastError = {
        label: installCommand.label,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const detail = lastError ? ` Last attempt via ${lastError.label} failed: ${lastError.message}` : '';
  throw new Error(`OpenClaw was not found and automatic installation failed.${detail}`);
}

function createOpenClawApiKeyName() {
  const hostname = (os.hostname() || 'device').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 16) || 'device';
  return `OpenClaw-${hostname}-${Date.now().toString(36)}`;
}

async function createOpenClawApiKey(payload) {
  return createOneInferApiKey(payload, createOpenClawApiKeyName(), 'OpenClaw');
}

async function enableOpenClaw(payload) {
  const openclawInstallState = await ensureOpenClawInstalled();
  const config = readOneInferConfig();
  const savedApiKey = toTrimmedString(config.openclawApiKey);
  const savedApiKeyName = toTrimmedString(config.openclawApiKeyName);

  const apiKeyFetchResult = await fetchApiKeysWithMeta(payload);
  
  let keyToUse = null;
  let keyNameToUse = savedApiKeyName;
  let baseUrlToUse = normalizeApiBaseUrl(payload?.apiBaseUrl);
  let reusedExistingKey = false;

  if (savedApiKey && savedApiKeyName) {
    const keyExists = apiKeyFetchResult.apiKeys.some((k) =>
      k.api_key_name === savedApiKeyName || k.id === savedApiKeyName || k.name === savedApiKeyName
    );

    if (keyExists || !apiKeyFetchResult.reachable) {
      keyToUse = savedApiKey;
      reusedExistingKey = true;
    }
  }

  if (!keyToUse) {
    const { apiKey, apiKeyName, apiBaseUrl } = await createOpenClawApiKey(payload);
    keyToUse = apiKey;
    keyNameToUse = apiKeyName;
    baseUrlToUse = apiBaseUrl;

    writeOneInferConfig({
      ...config,
      openclawApiKey: apiKey,
      openclawApiKeyName: apiKeyName,
      openclawApiBaseUrl: apiBaseUrl,
    });
  }

  const batchFilePath = path.join(os.homedir(), '.oneinfer', 'openclaw.json');
  const batchContent = [
    {
      "path": "models.providers.oneinfer",
      "value": {
        "baseUrl": baseUrlToUse,
        "apiKey": keyToUse,
        "api": "anthropic-messages",
        "auth": "api-key",
        "models": [
          { "id": "MiniMax-M2.7", "name": "MiniMax M2.7" },
          { "id": "glm-5.1", "name": "GLM 5.1" }
        ]
      }
    },
    {
      "path": "agents.defaults.model.primary",
      "value": "oneinfer/MiniMax-M2.7"
    }
  ];

  fs.mkdirSync(path.dirname(batchFilePath), { recursive: true });
  fs.writeFileSync(batchFilePath, JSON.stringify(batchContent, null, 2), 'utf8');

  try {
    const cmdStr = process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw';
    await runCommand(cmdStr, ['config', 'set', '--batch-file', batchFilePath], { shell: true });
  } catch (error) {
    console.error('Failed to set openclaw config:', error);
    throw new Error(`Failed to apply OpenClaw configuration: ${error.message}`);
  } finally {
    try {
      if (fs.existsSync(batchFilePath)) {
        fs.unlinkSync(batchFilePath);
      }
    } catch (err) {
      console.warn('Failed to delete temporary openclaw.json file:', err);
    }
  }

  try {
    const cmdStr = process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw';
    await runCommand(cmdStr, ['gateway', 'restart'], { shell: true });
  } catch (error) {
    console.error('Failed to restart openclaw gateway:', error);
  }

  return {
    alreadyConfigured: false,
    apiKeyName: keyNameToUse,
    openclawInstallState,
    providerId: 'oneinfer',
    ...(reusedExistingKey ? { reusedExistingKey: true } : {}),
  };
}

async function isCodexInstalled() {
  try {
    return await commandExists('codex');
  } catch {
    return false;
  }
}

async function getCodexInstallCommands() {
  const commands = [];
  if (await commandExists('npm')) {
    commands.push({
      command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      args: ['install', '-g', 'codex-ai'],
      label: 'npm global installer',
    });
  }
  return commands;
}

async function ensureCodexInstalled() {
  if (await isCodexInstalled()) {
    return 'already-installed';
  }

  const installCommands = await getCodexInstallCommands();
  if (installCommands.length === 0) {
    throw new Error(`Codex was not found and no supported installer was available on this ${process.platform} system.`);
  }

  let lastError = null;
  for (const installCommand of installCommands) {
    try {
      await runCommand(installCommand.command, installCommand.args, {
        timeoutMs: 10 * 60 * 1000,
        shell: process.platform === 'win32',
      });

      if (await isCodexInstalled()) {
        return 'installed';
      }
    } catch (error) {
      lastError = {
        label: installCommand.label,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const detail = lastError ? ` Last attempt via ${lastError.label} failed: ${lastError.message}` : '';
  throw new Error(`Codex was not found and automatic installation failed.${detail}`);
}

function createCodexApiKeyName() {
  const hostname = (os.hostname() || 'device').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 16) || 'device';
  return `Codex-${hostname}-${Date.now().toString(36)}`;
}

async function createCodexApiKey(payload) {
  return createOneInferApiKey(payload, createCodexApiKeyName(), 'Codex');
}

async function enableCodex(payload) {
  const codexInstallState = await ensureCodexInstalled();
  const config = readOneInferConfig();
  const savedApiKey = toTrimmedString(config.codexApiKey);
  const savedApiKeyName = toTrimmedString(config.codexApiKeyName);

  let baseUrlToUse = normalizeApiBaseUrl(payload?.apiBaseUrl);
  const isLocalUrl = typeof baseUrlToUse === 'string' && (
    baseUrlToUse.includes('127.0.0.1') ||
    baseUrlToUse.includes('localhost') ||
    baseUrlToUse.includes('0.0.0.0')
  );

  let keyToUse = null;
  let keyNameToUse = savedApiKeyName;
  let reusedExistingKey = false;

  if (isLocalUrl) {
    keyToUse = savedApiKey || 'local';
    keyNameToUse = savedApiKeyName || 'local';
    reusedExistingKey = true;
  } else {
    const apiKeyFetchResult = await fetchApiKeysWithMeta(payload);
    
    if (savedApiKey && savedApiKeyName) {
      const keyExists = apiKeyFetchResult.apiKeys.some((k) =>
        k.api_key_name === savedApiKeyName || k.id === savedApiKeyName || k.name === savedApiKeyName
      );

      if (keyExists || !apiKeyFetchResult.reachable) {
        keyToUse = savedApiKey;
        reusedExistingKey = true;
      }
    }

    if (!keyToUse) {
      const { apiKey, apiKeyName, apiBaseUrl } = await createCodexApiKey(payload);
      keyToUse = apiKey;
      keyNameToUse = apiKeyName;
      baseUrlToUse = apiBaseUrl;

      writeOneInferConfig({
        ...config,
        codexApiKey: apiKey,
        codexApiKeyName: apiKeyName,
        codexApiBaseUrl: apiBaseUrl,
      });
    }
  }

  const configDir = path.join(os.homedir(), '.config', 'codex');
  const configFilePath = path.join(configDir, 'codex.json');
  const modelId = toTrimmedString(payload?.modelId) || 'MiniMax-M2.7';

  const codexConfig = {
    baseUrl: baseUrlToUse,
    apiKey: keyToUse,
    model: isLocalUrl ? modelId : `oneinfer/${modelId}`
  };

  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(configFilePath, JSON.stringify(codexConfig, null, 2), 'utf8');

  return {
    alreadyConfigured: false,
    apiKeyName: keyNameToUse,
    codexInstallState,
    configPath: configFilePath,
    model: isLocalUrl ? modelId : `oneinfer/${modelId}`,
    providerId: 'oneinfer',
    ...(reusedExistingKey ? { reusedExistingKey: true } : {}),
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

function parseCapacityToMb(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // systeminformation normally reports controller.vram in MB, but some
    // platform-specific fields are exposed as bytes.
    return value > 1024 * 1024 ? value / (1024 * 1024) : value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const match = value.trim().match(/^([\d.]+)\s*(b|bytes|kb|mb|mib|gb|gib)?$/i);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }

  const unit = (match[2] || 'mb').toLowerCase();
  if (unit === 'gb' || unit === 'gib') return amount * 1024;
  if (unit === 'kb') return amount / 1024;
  if (unit === 'b' || unit === 'bytes') return amount / (1024 * 1024);
  return amount;
}

function getControllerVramMb(controller) {
  const candidates = [
    controller.vram,
    controller.memoryTotal,
    controller.memoryTotalMb,
    controller.memory,
    controller.ram,
  ];

  for (const candidate of candidates) {
    const parsedMb = parseCapacityToMb(candidate);
    if (parsedMb !== null && parsedMb > 0) {
      return Math.round(parsedMb);
    }
  }

  return null;
}

function isAppleGpuController(controller, resolvedCpu) {
  const text = [
    controller.vendor,
    controller.name,
    controller.model,
    controller.deviceName,
    resolvedCpu.brand,
    resolvedCpu.manufacturer,
  ].filter(Boolean).join(' ').toLowerCase();

  return process.platform === 'darwin'
    && (os.arch() === 'arm64' || text.includes('apple'))
    && text.includes('apple');
}

function isAppleUnifiedMemoryGpu(controller, resolvedCpu) {
  if (process.platform !== 'darwin' || os.arch() !== 'arm64') {
    return false;
  }

  const text = [
    controller.vendor,
    controller.name,
    controller.model,
    controller.deviceName,
    controller.bus,
    resolvedCpu.brand,
    resolvedCpu.manufacturer,
  ].filter(Boolean).join(' ').toLowerCase();

  return text.includes('apple')
    || text.includes('integrated')
    || text.includes('apple silicon')
    || text.includes('m1')
    || text.includes('m2')
    || text.includes('m3')
    || text.includes('m4');
}

function getConservativeUnifiedGpuMemoryBytes(totalMemoryBytes) {
  if (typeof totalMemoryBytes !== 'number' || !Number.isFinite(totalMemoryBytes) || totalMemoryBytes <= 0) {
    return null;
  }

  return Math.round(totalMemoryBytes * 0.75);
}

function toNullableInteger(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
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

async function openExternalUrl(payload = {}) {
  const url = String(payload.url || '').trim();
  if (!/^https:\/\/oneinfer\.ai\//i.test(url)) {
    throw new Error('Only OneInfer links can be opened from this action.');
  }

  await shell.openExternal(url);
  return { opened: true, url };
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

  const graphicsControllers = Array.isArray(graphics.controllers) ? graphics.controllers : [];
  const normalizedGraphicsControllers = graphicsControllers.length > 0
    ? graphicsControllers
    : process.platform === 'darwin' && os.arch() === 'arm64'
      ? [{
        name: resolvedCpu.brand || 'Apple GPU',
        vendor: 'Apple',
        model: resolvedCpu.brand || 'Apple Silicon',
        bus: 'integrated',
      }]
      : [];

  const gpus = normalizedGraphicsControllers.map((controller) => {
    const reportedVramMb = getControllerVramMb(controller);
    const isAppleUnifiedGpu = isAppleUnifiedMemoryGpu(controller, resolvedCpu) || isAppleGpuController(controller, resolvedCpu);
    const unifiedMemoryBytes = isAppleUnifiedGpu
      ? getConservativeUnifiedGpuMemoryBytes(resolvedMemory.total)
      : null;
    const vramBytes = unifiedMemoryBytes !== null
      ? unifiedMemoryBytes
      : reportedVramMb !== null
        ? Math.round(reportedVramMb * 1024 * 1024)
        : null;
    const vramMb = vramBytes !== null ? Math.round(vramBytes / (1024 * 1024)) : null;

    return {
      name: toTrimmedString(controller.name) || toTrimmedString(controller.model),
      vendor: toTrimmedString(controller.vendor),
      model: toTrimmedString(controller.model) || toTrimmedString(controller.name),
      gpuType: controller.bus ? String(controller.bus).toLowerCase() : null,
      memoryKind: isAppleUnifiedGpu ? 'unified' : 'dedicated',
      memorySource: unifiedMemoryBytes !== null ? 'macos-unified-memory' : 'systeminformation',
      vramBytes,
      vramMb,
      vramGb: vramBytes !== null ? toGb(vramBytes) : null,
      reportedVramMb,
      unifiedMemoryBytes,
      unifiedMemoryGb: toGb(unifiedMemoryBytes),
      driverVersion: toTrimmedString(controller.driverVersion),
      temperatureC: toNullableNumber(controller.temperatureGpu),
      utilizationPercent: toNullableNumber(controller.utilizationGpu),
      bus: toTrimmedString(controller.bus),
      pciBus: toTrimmedString(controller.pciBus),
      deviceName: toTrimmedString(controller.deviceName),
    };
  });

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
      totalBytes: toNullableInteger(resolvedMemory.total),
      availableBytes: toNullableInteger(resolvedMemory.available),
      usedBytes: toNullableInteger(resolvedMemory.used),
      freeBytes: toNullableInteger(resolvedMemory.free),
      totalGb: toGb(resolvedMemory.total),
      availableGb: toGb(resolvedMemory.available),
      usedGb: toGb(resolvedMemory.used),
      swapTotalBytes: toNullableInteger(resolvedMemory.swaptotal),
      swapUsedBytes: toNullableInteger(resolvedMemory.swapused),
    },
    memoryLayout: Array.isArray(memLayout) ? memLayout.map((entry) => ({
      sizeBytes: toNullableInteger(entry.size),
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
      totalBytes: toNullableInteger(entry.size),
      usedBytes: toNullableInteger(entry.used),
      freeBytes: typeof entry.size === 'number' && typeof entry.used === 'number' ? Math.max(Math.round(entry.size - entry.used), 0) : null,
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
  const baseUrl = normalizeApiBaseUrl(payload?.baseUrl);
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
  const windowOptions = {
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#0a1016',
    icon: iconPath,
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (process.platform === 'darwin') {
    windowOptions.titleBarStyle = 'hiddenInset';
  }

  mainWindow = new BrowserWindow(windowOptions);

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
    setUpdateState({
      phase: 'idle',
      version: app.getVersion(),
      message: 'Auto-update is disabled in development mode.',
      progressPercent: null,
    });
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  if (!isDev) {
    configureAutoUpdater();
  }

  ipcMain.handle('app:get-state', () => {
    const state = readState();
    triggerMachineSyncFromState(state);
    return state;
  });
  ipcMain.handle('app:save-state', (_event, payload) => {
    const state = writeState(payload);
    triggerMachineSyncFromState(state);
    return state;
  });
  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('app:get-update-status', () => ({ ...updateState }));
  ipcMain.handle('app:check-for-updates', async () => {
    if (isDev) {
      setUpdateState({
        phase: 'idle',
        version: app.getVersion(),
        message: 'Auto-update is disabled in development mode.',
        progressPercent: null,
      });
      return { ...updateState };
    }

    configureAutoUpdater();
    await autoUpdater.checkForUpdates();
    return { ...updateState };
  });
  ipcMain.handle('app:install-update', async () => {
    if (updateState.phase !== 'downloaded') {
      return { ...updateState };
    }

    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });

    return { ...updateState };
  });
  ipcMain.handle('app:open-external-url', async (_event, payload) => openExternalUrl(payload));
  ipcMain.handle('app:get-machine-details', async () => collectMachineDetails());
  ipcMain.handle('app:sync-machine-details', async (_event, payload) => syncMachineDetails(payload, { force: true }));
  ipcMain.handle('app:enable-claude-code', async (_event, payload) => enableClaudeCode(payload));
  ipcMain.handle('app:enable-opencode', async (_event, payload) => enableOpenCode(payload));
  ipcMain.handle('app:enable-kilocode', async (_event, payload) => enableKiloCode(payload));
  ipcMain.handle('app:enable-openclaw', async (_event, payload) => enableOpenClaw(payload));
  ipcMain.handle('app:enable-codex', async (_event, payload) => enableCodex(payload));
  ipcMain.handle('app:check-library', async (_event, name) => isLibraryInstalled(name));
  ipcMain.handle('app:install-library', async (_event, name) => installLibrary(name));
  ipcMain.handle('app:get-library-error', async (_event, name) => {
    name = normalizeServingLibraryName(name);
    return lastLibraryErrors[name] || null;
  });
  ipcMain.handle('app:install-vc-redist', async () => {
    if (process.platform !== 'win32') {
      throw new Error('Visual C++ Redistributable is only required on Windows systems.');
    }
    const psScript = "Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile 'vc_redist.x64.exe'; Start-Process 'vc_redist.x64.exe' -ArgumentList '/passive /norestart' -Wait; Remove-Item 'vc_redist.x64.exe'";
    await runCommand('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], { timeoutMs: 10 * 60 * 1000 });
    return 'installed';
  });
  ipcMain.handle('app:deploy-hf-model', async (_event, payload) => deployHfModel(payload));
  ipcMain.handle('app:start-local-route', async (_event, payload) => startLocalRoute(payload));
  ipcMain.handle('app:stop-local-route', async (_event, payload) => stopLocalRoute(payload));
  ipcMain.handle('app:cancel-hf-deployment', async (_event, payload) => cancelHfDeployment(payload));
  ipcMain.handle('app:delete-local-model', async (_event, payload) => deleteLocalModel(payload));
  ipcMain.handle('app:get-local-model-metrics', async (_event, payload) => getLocalModelMetrics(payload));
  ipcMain.handle('app:git-pull', async () => {
    try {
      const projectRoot = path.join(__dirname, '..');
      const { stdout, stderr } = await runCommand('git', ['pull'], {
        cwd: projectRoot,
        timeoutMs: 60000,
      });
      return { success: true, message: (stdout || stderr || 'Already up to date.').trim() };
    } catch (error) {
      console.error('Git pull failed:', error);
      return { success: false, error: error.message || String(error) };
    }
  });

  createWindow();

  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((error) => {
        console.error('[updater] startup check failed', error);
      });
    }, 4000);
  }

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
