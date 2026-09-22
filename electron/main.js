/* electron/main.js — 윈도우 전시용 실행파일. index.html을 전체화면 키오스크 창으로 띄운다. */
const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');

const KIOSK = !process.argv.includes('--window'); // "--window" 인자로 켜면 일반 창(개발·점검용)

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800,
    kiosk: KIOSK, fullscreen: KIOSK, autoHideMenuBar: true,
    backgroundColor: '#fbf9f4',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(1);
    win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {}); // 핀치 줌 금지
  });
  // 페이지 안 링크·새 창은 열지 않는다
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
}

app.whenReady().then(() => {
  // 카메라·마이크 등 권한 요청은 모두 거절(전시 PC 보호)
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(false));
  createWindow();
});
// 마지막 창이 닫히면(관리자 창의 '전시 종료' 포함) 프로그램 종료
app.on('window-all-closed', () => app.quit());
