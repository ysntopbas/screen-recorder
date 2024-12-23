const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
require('@electron/remote/main').initialize();

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
        }
    });

    win.loadFile('src/index.html');
    require("@electron/remote/main").enable(win.webContents);

    // Content Security Policy'yi ayarla
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; " +
                    "script-src 'self'; " +
                    "style-src 'self' 'unsafe-inline'; " +
                    "img-src 'self' data: blob:; " +
                    "media-src 'self' blob:; " +
                    "connect-src 'self'"
                ]
            }
        });
    });

    // Ekran kayıt izinlerini otomatik olarak ver
    win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'display-capture'];
        if (allowedPermissions.includes(permission)) {
            callback(true);
        } else {
            callback(false);
        }
    });

    // Geliştirici konsolunu aç (hata ayıklama için)
    //win.webContents.openDevTools();
}

// Ekran kaynaklarını almak için IPC handler
ipcMain.handle('GET_SOURCES', async () => {
    return await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 400, height: 225 }
    });
});

app.whenReady().then(() => {
    createWindow();
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