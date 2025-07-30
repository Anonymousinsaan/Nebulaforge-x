const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Core modules
const CodeCore = require('./core/CodeCore');
const LogicBrain = require('./core/LogicBrain');
const DataStorage = require('./core/DataStorage');

let mainWindow;
let codeCore;
let logicBrain;
let dataStorage;

// Initialize core systems
async function initializeCoreSystems() {
  try {
    console.log('🚀 Initializing AURORA IDE Core Systems...');
    
    // Initialize data storage
    dataStorage = new DataStorage();
    await dataStorage.initialize();
    
    // Initialize LogicBrain (AI routing system)
    logicBrain = new LogicBrain(dataStorage);
    await logicBrain.initialize();
    
    // Initialize CodeCore (editor and execution environment)
    codeCore = new CodeCore(logicBrain, dataStorage);
    await codeCore.initialize();
    
    console.log('✅ Core systems initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize core systems:', error);
    app.quit();
  }
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    title: 'AURORA IDE - Advanced Universal Reasoning & Operation Resourceful Assistant',
    show: false
  });

  // Load the main UI
  mainWindow.loadFile('ui/index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('🌟 AURORA IDE is ready!');
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Development tools
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// App event handlers
app.whenReady().then(async () => {
  await initializeCoreSystems();
  createWindow();
  
  // Set up application menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('new-project');
          }
        },
        {
          label: 'Open Project',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow.webContents.send('open-project');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'AURORA',
      submenu: [
        {
          label: 'LogicBrain Console',
          click: () => {
            mainWindow.webContents.send('open-logicbrain');
          }
        },
        {
          label: 'Auralite Compiler',
          click: () => {
            mainWindow.webContents.send('open-auralite');
          }
        },
        {
          label: 'System Status',
          click: () => {
            mainWindow.webContents.send('system-status');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for core system communication
ipcMain.handle('codecore-execute', async (event, code) => {
  return await codeCore.execute(code);
});

ipcMain.handle('logicbrain-process', async (event, prompt) => {
  return await logicBrain.processPrompt(prompt);
});

ipcMain.handle('storage-save', async (event, data) => {
  return await dataStorage.save(data);
});

ipcMain.handle('storage-load', async (event, key) => {
  return await dataStorage.load(key);
});

// Graceful shutdown
app.on('before-quit', async () => {
  console.log('🔄 Shutting down AURORA IDE...');
  if (dataStorage) {
    await dataStorage.close();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});