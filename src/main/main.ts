import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { initDatabase } from './services/db.js';
import { registerAllHandlers } from './ipc/index.js';
import { logger, initFileLogger } from './utils/logger.js';
import { createScheduler, getScheduler as getSchedulerRef } from './services/schedulerService.js';

let mainWindow: BrowserWindow | null = null;

function getPreloadPath(): string {
  // Try multiple possible paths for the preload script
  const candidates = [
    join(__dirname, '../preload/preload.js'),
    join(__dirname, '..', 'preload', 'preload.js'),
    join(app.getAppPath(), 'dist-electron', 'preload', 'preload.js'),
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      logger.info('Preload script found', { path: p });
      return p;
    }
  }

  // Fallback — use first candidate even if not found (let Electron report error)
  logger.warn('Preload script not found, using default path', { candidates });
  return candidates[0];
}

function createWindow(): void {
  const preloadPath = getPreloadPath();

  mainWindow = new BrowserWindow({
    title: 'Supover App',
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#030712',
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    logger.info('Main window shown');
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Initialize file logger (app.getPath available after ready)
  initFileLogger();

  logger.info('App ready, initializing...');

  // Initialize database
  const db = initDatabase();
  logger.info('Database initialized');

  // Register IPC handlers
  registerAllHandlers(db);

  // Start scheduler for automatic crawling
  const scheduler = createScheduler(db);
  scheduler.start();
  logger.info('Scheduler started');

  // Create window
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

app.on('before-quit', () => {
  try {
    const scheduler = getSchedulerRef();
    if (scheduler) scheduler.stop();
  } catch { /* ignore */ }
  logger.info('App quitting');
});
