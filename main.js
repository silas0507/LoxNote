const { app, BrowserWindow, Menu, dialog, ipcMain, globalShortcut, Tray, nativeImage, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const i18n = require('./i18n');

let mainWindow = null;
let settingsWindow = null;
let historyWindow = null;
let currentFilePath = null;
let isQuitting = false;
let pendingAction = null;
let tray = null;
let alwaysOnTop = false;
let windowOpacity = 1;
let currentFontSize = 14;
let wordWrapEnabled = true;
let closeBehavior = 'minimize';
let autoLaunch = false;
let currentTheme = 'light';
let customShortcuts = {};
let savedBounds = null; // 保存的窗口位置和大小
let saveBoundsTimer = null; // 窗口位置保存防抖定时器

// 开发环境使用独立的数据目录，避免影响打包后的应用
if (!app.isPackaged) {
  const devDataPath = path.join(__dirname, 'dev-data');
  if (!fs.existsSync(devDataPath)) fs.mkdirSync(devDataPath);
  app.setPath('userData', devDataPath);
}

// ==================== 窗口创建 ====================

function createWindow() {
  const windowOptions = {
    width: 800,
    height: 600,
    center: true,
    show: false,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  };

  // 恢复上次保存的窗口位置和大小
  if (savedBounds) {
    windowOptions.x = savedBounds.x;
    windowOptions.y = savedBounds.y;
    windowOptions.width = savedBounds.width;
    windowOptions.height = savedBounds.height;
    delete windowOptions.center; // 有具体坐标时不需要居中
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile('index.html');

  // 页面加载完成后才显示窗口，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 应用初始透明度与置顶状态
  mainWindow.setOpacity(windowOpacity);
  mainWindow.setAlwaysOnTop(alwaysOnTop);

  // 若没有保存的位置，则居中打开
  if (!savedBounds) {
    mainWindow.center();
  }

  // 监听窗口大小/位置变化并保存
  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);

  // 发送笔记存储路径和初始语言给渲染进程
  const notesPath = path.join(app.getPath('userData'), 'loxnote-notes.json');
  mainWindow.webContents.on('did-finish-load', function () {
    mainWindow.webContents.send('init-notes-path', notesPath);
    mainWindow.webContents.send('language-changed', i18n.getCurrentLang());
  });

  // 构建系统原生菜单
  buildMenu();

  // 拦截关闭事件，检查是否有未保存的修改
  mainWindow.on('close', (e) => {
    if (isQuitting) return; // 已确认退出，放行
    if (closeBehavior === 'minimize') {
      e.preventDefault();
      mainWindow.hide();
      return;
    }
    e.preventDefault();
    pendingAction = 'close';
    mainWindow.webContents.send('check-unsaved');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 保存窗口位置和大小（防抖处理）
function saveWindowBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      savedBounds = mainWindow.getBounds();
      saveSettings();
    }
  }, 300);
}

// ==================== 原生菜单 ====================

function buildMenu() {
  const t = i18n.t;
  const template = [
    {
      label: t('menu.file'),
      submenu: [
        {
          label: t('menu.new'),
          accelerator: 'CmdOrCtrl+N',
          click: () => { pendingAction = 'new'; mainWindow.webContents.send('check-unsaved'); }
        },
        {
          label: t('menu.open'),
          accelerator: 'CmdOrCtrl+O',
          click: () => { pendingAction = 'open'; mainWindow.webContents.send('check-unsaved'); }
        },
        {
          label: t('menu.save'),
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('trigger-save')
        },
        {
          label: t('menu.saveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('trigger-save-as')
        },
        { type: 'separator' },
        {
          label: t('menu.exportNotes'),
          submenu: [
            {
              label: t('menu.exportTxt'),
              click: () => mainWindow.webContents.send('export-notes-txt')
            },
            {
              label: t('menu.exportMd'),
              click: () => mainWindow.webContents.send('export-notes-md')
            },
            {
              label: t('menu.exportJson'),
              click: () => mainWindow.webContents.send('export-notes-json')
            },
            {
              label: t('menu.exportZip'),
              click: () => mainWindow.webContents.send('export-notes-zip')
            },
            { type: 'separator' },
            {
              label: t('menu.exportPdf'),
              click: () => mainWindow.webContents.send('export-note-pdf')
            },
            {
              label: t('menu.exportAllPdf'),
              click: () => mainWindow.webContents.send('export-all-pdf')
            },
            { type: 'separator' },
            {
              label: t('menu.exportHtml'),
              click: () => mainWindow.webContents.send('export-notes-html')
            },
            {
              label: t('menu.exportCurrentHtml'),
              click: () => mainWindow.webContents.send('export-note-html')
            }
          ]
        },
        { type: 'separator' },
        {
          label: t('menu.exit'),
          click: () => { pendingAction = 'close'; mainWindow.webContents.send('check-unsaved'); }
        }
      ]
    },
    {
      label: t('menu.edit'),
      submenu: [
        { label: t('menu.undo'), accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: t('menu.redo'), accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: t('menu.cut'), accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: t('menu.copy'), accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: t('menu.paste'), accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: t('menu.selectAll'), accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        { type: 'separator' },
        {
          label: t('menu.find'),
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow.webContents.send('menu-find')
        }
      ]
    },
    {
      label: t('menu.format'),
      submenu: [
        {
          label: t('menu.wordWrap'),
          type: 'checkbox',
          checked: true,
          click: (menuItem) => mainWindow.webContents.send('menu-word-wrap', menuItem.checked)
        },
        { type: 'separator' },
        {
          label: t('menu.increaseFont'),
          accelerator: 'CmdOrCtrl+=',
          click: () => mainWindow.webContents.send('menu-font-increase')
        },
        {
          label: t('menu.decreaseFont'),
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow.webContents.send('menu-font-decrease')
        }
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        {
          label: t('view.alwaysOnTop'),
          type: 'checkbox',
          checked: alwaysOnTop,
          accelerator: 'CmdOrCtrl+Alt+T',
          click: (menuItem) => setAlwaysOnTop(menuItem.checked)
        },
        { type: 'separator' },
        {
          label: t('view.increaseOpacity'),
          accelerator: 'CmdOrCtrl+Alt+=',
          click: () => changeOpacity(0.1)
        },
        {
          label: t('view.decreaseOpacity'),
          accelerator: 'CmdOrCtrl+Alt+-',
          click: () => changeOpacity(-0.1)
        },
        { type: 'separator' },
        {
          label: t('view.hideShow'),
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => toggleWindow()
        }
      ]
    },
    {
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.about'),
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: t('menu.about'),
              message: 'LoxNote v1.0.0',
              detail: t('dialog.aboutMessage')
            });
          }
        },
        { type: 'separator' },
        {
          label: t('menu.language'),
          submenu: [
            {
              label: t('menu.chinese'),
              type: 'radio',
              checked: i18n.getCurrentLang() === 'zh-CN',
              click: () => switchLanguage('zh-CN')
            },
            {
              label: t('menu.english'),
              type: 'radio',
              checked: i18n.getCurrentLang() === 'en',
              click: () => switchLanguage('en')
            }
          ]
        }
      ]
    },
    {
      label: t('menu.settings'),
      submenu: [
        {
          label: t('menu.openSettings'),
          accelerator: 'CmdOrCtrl+,',
          click: () => openSettingsWindow()
        },
        {
          label: '查看历史记录',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => openHistoryWindow()
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 切换语言
function switchLanguage(lang) {
  i18n.setLanguage(lang);
  i18n.saveLanguage();
  buildMenu();
  if (mainWindow) {
    mainWindow.webContents.send('language-changed', lang);
  }
}

// ==================== IPC 处理器 ====================

// 渲染进程响应未保存检查
ipcMain.on('unsaved-response', (event, data) => {
  const { isModified, content } = data;
  const action = pendingAction;
  pendingAction = null;

  if (isModified) {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: [i18n.t('dialog.save'), i18n.t('dialog.dontSave'), i18n.t('dialog.cancel')],
      defaultId: 0,
      cancelId: 2,
      message: i18n.t('dialog.saveChanges')
    });

    if (choice === 0) {
      // 用户选择保存
      if (currentFilePath) {
        try {
          fs.writeFileSync(currentFilePath, content, 'utf-8');
        } catch (err) {
          dialog.showErrorBox(i18n.t('dialog.saveError'), i18n.t('dialog.saveFailed') + ': ' + err.message);
          return;
        }
      } else {
        // 无当前路径，弹出另存为对话框
        const savePath = dialog.showSaveDialogSync(mainWindow, {
          filters: [{ name: i18n.t('dialog.textFiles'), extensions: ['txt'] }]
        });
        if (savePath) {
          try {
            fs.writeFileSync(savePath, content, 'utf-8');
            currentFilePath = savePath;
          } catch (err) {
            dialog.showErrorBox(i18n.t('dialog.saveError'), i18n.t('dialog.saveFailed') + ': ' + err.message);
            return;
          }
        } else {
          return; // 用户在另存为对话框中取消了
        }
      }
    } else if (choice === 2) {
      return; // 用户取消操作
    }
    // choice === 1: 不保存，继续执行
  }

  executeAction(action);
});

// 渲染进程请求保存文件
ipcMain.on('save-file', (event, content) => {
  if (currentFilePath) {
    try {
      fs.writeFileSync(currentFilePath, content, 'utf-8');
      mainWindow.webContents.send('file-saved', currentFilePath);
    } catch (err) {
      dialog.showErrorBox(i18n.t('dialog.saveError'), i18n.t('dialog.saveFailed') + ': ' + err.message);
    }
  } else {
    // 无当前路径，弹出另存为对话框
    const savePath = dialog.showSaveDialogSync(mainWindow, {
      filters: [{ name: i18n.t('dialog.textFiles'), extensions: ['txt'] }]
    });
    if (savePath) {
      try {
        fs.writeFileSync(savePath, content, 'utf-8');
        currentFilePath = savePath;
        mainWindow.webContents.send('file-saved', savePath);
      } catch (err) {
        dialog.showErrorBox(i18n.t('dialog.saveError'), i18n.t('dialog.saveFailed') + ': ' + err.message);
      }
    }
  }
});

// 渲染进程请求另存为
ipcMain.on('save-file-as', (event, content) => {
  const savePath = dialog.showSaveDialogSync(mainWindow, {
    filters: [{ name: i18n.t('dialog.textFiles'), extensions: ['txt'] }]
  });
  if (savePath) {
    try {
      fs.writeFileSync(savePath, content, 'utf-8');
      currentFilePath = savePath;
      mainWindow.webContents.send('file-saved', savePath);
    } catch (err) {
      dialog.showErrorBox(i18n.t('dialog.saveError'), i18n.t('dialog.saveFailed') + ': ' + err.message);
    }
  }
});

// ==================== 导出功能 ====================

// 导出为 TXT（每个笔记一个文件）
ipcMain.on('export-notes-txt', async (event, notes) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择导出文件夹'
  });

  if (result.canceled || result.filePaths.length === 0) return;

  const exportDir = result.filePaths[0];
  let successCount = 0;

  for (const note of notes) {
    try {
      const fileName = (note.title || '未命名') + '.txt';
      const filePath = path.join(exportDir, fileName);
      fs.writeFileSync(filePath, note.content || '', 'utf-8');
      successCount++;
    } catch (err) {
      console.error(`导出失败: ${note.title}`, err);
    }
  }

  mainWindow.webContents.send('export-complete', {
    success: true,
    count: successCount,
    type: 'txt'
  });
});

// 导出为 Markdown
ipcMain.on('export-notes-md', async (event, notes) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择导出文件夹'
  });

  if (result.canceled || result.filePaths.length === 0) return;

  const exportDir = result.filePaths[0];
  let successCount = 0;

  for (const note of notes) {
    try {
      const fileName = (note.title || '未命名') + '.md';
      const filePath = path.join(exportDir, fileName);
      fs.writeFileSync(filePath, note.content || '', 'utf-8');
      successCount++;
    } catch (err) {
      console.error(`导出失败: ${note.title}`, err);
    }
  }

  mainWindow.webContents.send('export-complete', {
    success: true,
    count: successCount,
    type: 'md'
  });
});

// 导出为 JSON（备份还原用）
ipcMain.on('export-notes-json', async (event, notes) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存备份文件',
    defaultPath: 'loxnote-backup.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (result.canceled) return;

  try {
    const backupData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      notes: notes
    };
    fs.writeFileSync(result.filePath, JSON.stringify(backupData, null, 2), 'utf-8');
    mainWindow.webContents.send('export-complete', {
      success: true,
      count: notes.length,
      type: 'json'
    });
  } catch (err) {
    mainWindow.webContents.send('export-complete', {
      success: false,
      error: err.message
    });
  }
});

// 导出为 ZIP（打包所有笔记）
ipcMain.on('export-notes-zip', async (event, notes) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '保存压缩包',
    defaultPath: 'loxnote-notes.zip',
    filters: [{ name: 'ZIP', extensions: ['zip'] }]
  });

  if (result.canceled) return;

  try {
    const archiverModule = await import('archiver');
    const archiver = archiverModule.default || archiverModule.archiver || archiverModule;
    const output = fs.createWriteStream(result.filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      mainWindow.webContents.send('export-complete', {
        success: true,
        count: notes.length,
        type: 'zip'
      });
    });

    archive.on('error', (err) => {
      mainWindow.webContents.send('export-complete', {
        success: false,
        error: err.message
      });
    });

    archive.pipe(output);

    for (const note of notes) {
      const fileName = (note.title || '未命名') + '.txt';
      archive.append(note.content || '', { name: fileName });
    }

    archive.finalize();
  } catch (err) {
    mainWindow.webContents.send('export-complete', {
      success: false,
      error: err.message
    });
  }
});

// 生成 PDF 的通用函数：接收 HTML，返回 PDF buffer
async function htmlToPdfBuffer(html) {
  const tmpDir = require('os').tmpdir();
  const tmpFile = path.join(tmpDir, `loxnote-pdf-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html, 'utf-8');

  const pdfWin = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  try {
    await pdfWin.loadFile(tmpFile);

    const pdfBuffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      marginsType: 0
    });
    pdfWin.destroy();
    // 清理临时文件
    try { fs.unlinkSync(tmpFile); } catch (e) { /* 忽略 */ }
    return pdfBuffer;
  } catch (err) {
    console.error('PDF 生成失败:', err);
    pdfWin.destroy();
    try { fs.unlinkSync(tmpFile); } catch (e) { /* 忽略 */ }
    throw err;
  }
}

// 把笔记渲染成带样式的 HTML
function noteToHtml(title, content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; padding: 48px; color: #222; }
  h1 { font-size: 24px; border-bottom: 2px solid #4a90d9; padding-bottom: 12px; margin-bottom: 24px; color: #333; }
  pre { white-space: pre-wrap; word-wrap: break-word; font-size: 14px; line-height: 1.8; font-family: inherit; }
</style></head><body>
<h1>${title || '未命名'}</h1>
<pre>${(content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</body></html>`;
}

// 导出当前笔记为 PDF
ipcMain.on('export-note-pdf', async (event, note) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出为 PDF',
    defaultPath: (note.title || '未命名') + '.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (result.canceled) return;
  try {
    const html = noteToHtml(note.title, note.content);
    const pdfBuffer = await htmlToPdfBuffer(html);
    fs.writeFileSync(result.filePath, pdfBuffer);
    mainWindow.webContents.send('export-complete', { success: true, count: 1, type: 'pdf' });
  } catch (err) {
    mainWindow.webContents.send('export-complete', { success: false, error: err.message });
  }
});

// 导出全部笔记为 PDF（每个笔记一个文件）
ipcMain.on('export-all-pdf', async (event, notes) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择 PDF 导出文件夹'
  });
  if (result.canceled || result.filePaths.length === 0) return;
  const exportDir = result.filePaths[0];
  let successCount = 0;
  for (const note of notes) {
    try {
      const html = noteToHtml(note.title, note.content);
      const pdfBuffer = await htmlToPdfBuffer(html);
      const fileName = (note.title || '未命名') + '.pdf';
      fs.writeFileSync(path.join(exportDir, fileName), pdfBuffer);
      successCount++;
    } catch (err) {
      console.error(`PDF 导出失败: ${note.title}`, err);
    }
  }
  mainWindow.webContents.send('export-complete', { success: true, count: successCount, type: 'pdf' });
});

// 导出全部笔记为单个 HTML（带样式，便于分享）
ipcMain.on('export-notes-html', async (event, notes) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出为单个 HTML',
    defaultPath: 'loxnote-notes.html',
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
  });
  if (result.canceled) return;

  try {
    const exportDate = new Date().toLocaleString();
    let notesHtml = '';
    notes.forEach(function (note, index) {
      const title = (note.title || '未命名').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const content = (note.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      notesHtml += `
      <section class="note-block">
        <h2 class="note-title">${title}</h2>
        <pre class="note-content">${content}</pre>
      </section>`;
      if (index < notes.length - 1) {
        notesHtml += '<hr class="note-divider">';
      }
    });

    const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LoxNote 笔记导出</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
    background: #f5f7fa;
    color: #2c3e50;
    line-height: 1.6;
    padding: 40px 20px;
  }
  .container {
    max-width: 860px;
    margin: 0 auto;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    padding: 48px;
  }
  .header {
    border-bottom: 3px solid #4a90d9;
    padding-bottom: 20px;
    margin-bottom: 32px;
  }
  .header h1 {
    font-size: 28px;
    color: #2c3e50;
    margin-bottom: 8px;
  }
  .header .meta {
    font-size: 13px;
    color: #95a5a6;
  }
  .note-block {
    margin-bottom: 8px;
  }
  .note-title {
    font-size: 20px;
    color: #34495e;
    padding: 12px 16px;
    background: #f0f6ff;
    border-left: 4px solid #4a90d9;
    border-radius: 4px;
    margin-bottom: 16px;
  }
  .note-content {
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: inherit;
    font-size: 15px;
    color: #2c3e50;
    padding: 0 4px 24px 4px;
  }
  .note-divider {
    border: none;
    border-top: 1px dashed #dfe6e9;
    margin: 32px 0;
  }
  .footer {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #ecf0f1;
    font-size: 12px;
    color: #b2bec3;
    text-align: center;
  }
  @media (max-width: 600px) {
    body { padding: 16px; }
    .container { padding: 24px; }
    .header h1 { font-size: 22px; }
  }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>LoxNote 笔记导出</h1>
      <div class="meta">共 ${notes.length} 篇笔记 · 导出时间：${exportDate}</div>
    </div>
    ${notesHtml}
    <div class="footer">由 LoxNote 生成 · https://github.com/loxnote</div>
  </div>
</body>
</html>`;

    fs.writeFileSync(result.filePath, fullHtml, 'utf-8');
    mainWindow.webContents.send('export-complete', { success: true, count: notes.length, type: 'html' });
  } catch (err) {
    mainWindow.webContents.send('export-complete', { success: false, error: err.message });
  }
});

// 导出当前笔记为单个 HTML（带样式）
ipcMain.on('export-note-html', async (event, note) => {
  if (!note) {
    mainWindow.webContents.send('export-complete', { success: false, error: '当前没有打开的笔记' });
    return;
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出当前笔记为 HTML',
    defaultPath: (note.title || '未命名') + '.html',
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }]
  });
  if (result.canceled) return;

  try {
    const title = (note.title || '未命名').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const content = (note.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const exportDate = new Date().toLocaleString();

    const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
    background: #f5f7fa;
    color: #2c3e50;
    line-height: 1.8;
    padding: 40px 20px;
  }
  .container {
    max-width: 860px;
    margin: 0 auto;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    padding: 48px;
  }
  .header {
    border-bottom: 3px solid #4a90d9;
    padding-bottom: 20px;
    margin-bottom: 32px;
  }
  .header h1 {
    font-size: 28px;
    color: #2c3e50;
    margin-bottom: 8px;
    word-break: break-word;
  }
  .header .meta {
    font-size: 13px;
    color: #95a5a6;
  }
  .note-content {
    white-space: pre-wrap;
    word-wrap: break-word;
    font-size: 15px;
    color: #2c3e50;
  }
  .footer {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #ecf0f1;
    font-size: 12px;
    color: #b2bec3;
    text-align: center;
  }
  @media (max-width: 600px) {
    body { padding: 16px; }
    .container { padding: 24px; }
    .header h1 { font-size: 22px; }
  }
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
      <div class="meta">导出时间：${exportDate}</div>
    </div>
    <pre class="note-content">${content}</pre>
    <div class="footer">由 LoxNote 生成</div>
  </div>
</body>
</html>`;

    fs.writeFileSync(result.filePath, fullHtml, 'utf-8');
    mainWindow.webContents.send('export-complete', { success: true, count: 1, type: 'html' });
  } catch (err) {
    mainWindow.webContents.send('export-complete', { success: false, error: err.message });
  }
});

// ==================== 动作执行 ====================

function executeAction(action) {
  switch (action) {
    case 'new':
      currentFilePath = null;
      mainWindow.webContents.send('file-new');
      break;
    case 'open':
      openFileDialog();
      break;
    case 'close':
      isQuitting = true;
      if (closeBehavior === 'quit') {
        app.quit();  // 直接退出整个应用
      } else {
        mainWindow.close();
      }
      break;
  }
}

function openFileDialog() {
  const result = dialog.showOpenDialogSync(mainWindow, {
    title: i18n.t('menu.open'),
    filters: [{ name: i18n.t('dialog.textFiles'), extensions: ['txt'] }],
    properties: ['openFile']
  });

  if (result && result.length > 0) {
    const filePath = result[0];
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      currentFilePath = filePath;
      addRecentFile(filePath);
      mainWindow.webContents.send('file-opened', { filePath, content });
    } catch (err) {
      dialog.showErrorBox(i18n.t('dialog.openError'), i18n.t('dialog.openFailed') + ': ' + err.message);
    }
  }
}

// ==================== 最近文件管理 ====================

function loadRecentFiles() {
  try {
    if (fs.existsSync(RECENT_FILES_PATH)) {
      recentFiles = JSON.parse(fs.readFileSync(RECENT_FILES_PATH, 'utf-8'));
    }
  } catch (e) { recentFiles = []; }
}

function saveRecentFiles() {
  try {
    fs.writeFileSync(RECENT_FILES_PATH, JSON.stringify(recentFiles, null, 2), 'utf-8');
  } catch (e) { /* ignore */ }
}

function addRecentFile(filePath) {
  if (!filePath) return;
  recentFiles = recentFiles.filter(function (f) { return f !== filePath; });
  recentFiles.unshift(filePath);
  if (recentFiles.length > 5) recentFiles = recentFiles.slice(0, 5);
  saveRecentFiles();
  buildMenu();
}

function buildRecentFilesSubmenu() {
  if (recentFiles.length === 0) {
    return [{ label: i18n.t('ui.noRecentFiles'), enabled: false }];
  }
  var items = recentFiles.map(function (filePath) {
    return {
      label: filePath,
      click: function () {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          currentFilePath = filePath;
          addRecentFile(filePath);
          mainWindow.webContents.send('file-opened', { filePath, content });
        } catch (err) {
          dialog.showErrorBox(i18n.t('dialog.openError'), i18n.t('dialog.openFailed') + ': ' + err.message);
        }
      }
    };
  });
  items.push({ type: 'separator' });
  items.push({
    label: i18n.t('ui.clearRecentFiles'),
    click: function () {
      recentFiles = [];
      saveRecentFiles();
      buildMenu();
    }
  });
  return items;
}

// ==================== 应用生命周期 ====================

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 第二个实例启动时，聚焦已存在的主窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  i18n.setConfigDir(app.getPath('userData'));
  initConfigPaths();
  const saved = i18n.loadLanguage();
  if (!saved) {
    i18n.setLanguage(i18n.detectSystemLanguage());
  }
  // 先加载设置，再创建窗口（确保 closeBehavior 等配置生效）
  loadSettings();
  // 应用开机自启动设置
  app.setLoginItemSettings({ openAtLogin: autoLaunch });
  loadShortcuts();
  createWindow();
  createTray();
  registerGlobalShortcuts();
});

app.on('window-all-closed', () => {
  // 保持进程常驻（透过托盘），让全局快捷键仍可唤起窗口
});

app.on('activate', () => {
  // macOS: 点击 Dock 图标时重新创建窗口
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ==================== 设置窗口 ====================

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 700,
    height: 500,
    resizable: false,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  settingsWindow.loadFile('settings.html');
  settingsWindow.setMenu(null);

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ==================== 历史管理窗口 ====================

function openHistoryWindow() {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.focus();
    return;
  }

  historyWindow = new BrowserWindow({
    width: 900,
    height: 700,
    resizable: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  historyWindow.loadFile('history.html');
  historyWindow.setMenu(null);

  // 同步主题
  historyWindow.webContents.on('did-finish-load', () => {
    historyWindow.webContents.executeJavaScript(`document.documentElement.setAttribute('data-theme', '${currentTheme}')`);
  });

  historyWindow.on('closed', () => {
    historyWindow = null;
  });
}

// ==================== 设置窗口 IPC 处理器 ====================

let SETTINGS_PATH = null;
let SHORTCUTS_PATH = null;

function initConfigPaths() {
  SETTINGS_PATH = path.join(app.getPath('userData'), 'loxnote-settings.json');
  SHORTCUTS_PATH = path.join(app.getPath('userData'), 'loxnote-shortcuts.json');
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      windowOpacity = data.opacity ?? 1;
      alwaysOnTop = data.alwaysOnTop ?? false;
      currentFontSize = data.fontSize ?? 14;
      wordWrapEnabled = data.wordWrap ?? true;
      closeBehavior = data.closeBehavior ?? 'minimize';
      autoLaunch = data.autoLaunch ?? false;
      currentTheme = data.theme ?? 'light';
      savedBounds = data.windowBounds || null;
      // 启动时设置系统原生主题
      nativeTheme.themeSource = currentTheme === 'dark' ? 'dark' : 'light';
    }
  } catch (e) { /* ignore */ }
}

function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify({
      opacity: windowOpacity,
      alwaysOnTop: alwaysOnTop,
      fontSize: currentFontSize,
      wordWrap: wordWrapEnabled,
      closeBehavior: closeBehavior,
      autoLaunch: autoLaunch,
      theme: currentTheme,
      windowBounds: savedBounds
    }, null, 2), 'utf-8');
  } catch (e) { /* ignore */ }
}

function loadShortcuts() {
  try {
    if (fs.existsSync(SHORTCUTS_PATH)) {
      customShortcuts = JSON.parse(fs.readFileSync(SHORTCUTS_PATH, 'utf-8'));
    }
  } catch (e) { customShortcuts = {}; }
}

function saveShortcutsConfig() {
  try {
    fs.writeFileSync(SHORTCUTS_PATH, JSON.stringify(customShortcuts, null, 2), 'utf-8');
  } catch (e) { /* ignore */ }
}

// 请求当前设置
ipcMain.on('request-settings', (event) => {
  event.sender.send('settings-loaded', {
    opacity: windowOpacity,
    alwaysOnTop: alwaysOnTop,
    fontSize: currentFontSize,
    wordWrap: wordWrapEnabled,
    theme: currentTheme
  });
});

// 请求通用设置
ipcMain.on('request-general-settings', (event) => {
  const loginSettings = app.getLoginItemSettings();
  event.sender.send('general-settings-loaded', {
    language: i18n.getCurrentLang(),
    closeBehavior: closeBehavior,
    autoLaunch: loginSettings.openAtLogin
  });
});

// 设置透明度
ipcMain.on('set-opacity', (event, value) => {
  windowOpacity = value;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setOpacity(value);
  }
  saveSettings();
});

// 设置置顶
ipcMain.on('set-always-on-top', (event, value) => {
  alwaysOnTop = value;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(value);
  }
  saveSettings();
  buildMenu();
});

// 设置字体大小
ipcMain.on('set-font-size', (event, size) => {
  currentFontSize = size;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-font-set', size);
  }
  saveSettings();
});

// 设置自动换行
ipcMain.on('set-word-wrap', (event, enabled) => {
  wordWrapEnabled = enabled;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-word-wrap', enabled);
  }
  saveSettings();
});

// 设置语言
ipcMain.on('set-language', (event, lang) => {
  switchLanguage(lang);
});

// 设置关闭行为
ipcMain.on('set-close-behavior', (event, behavior) => {
  closeBehavior = behavior;
  saveSettings();
});

// 设置开机自启动
ipcMain.on('set-auto-launch', (event, enabled) => {
  autoLaunch = enabled;
  app.setLoginItemSettings({ openAtLogin: enabled });
  saveSettings();
});

// 设置主题
ipcMain.on('set-theme', (event, theme) => {
  currentTheme = theme;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(`document.documentElement.setAttribute('data-theme', '${theme}')`);
  }
  // 同步设置系统原生主题
  nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light';
  saveSettings();
});

// 设置主题
ipcMain.on('set-theme', (event, theme) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(`document.documentElement.setAttribute('data-theme', '${theme}')`);
  }
  // 同步到历史窗口
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.webContents.executeJavaScript(`document.documentElement.setAttribute('data-theme', '${theme}')`);
  }
  saveSettings();
});

// 加载快捷键配置
ipcMain.on('load-shortcuts', (event) => {
  loadShortcuts();
  event.sender.send('shortcuts-loaded', customShortcuts);
});

// 保存快捷键配置
ipcMain.on('save-shortcuts', (event, shortcuts) => {
  customShortcuts = shortcuts;
  saveShortcutsConfig();
});

// 应用快捷键配置
ipcMain.on('apply-shortcuts', (event, shortcuts) => {
  customShortcuts = shortcuts;
  saveShortcutsConfig();
  // 注销旧的全局快捷键
  globalShortcut.unregisterAll();
  // 注册新的全局快捷键
  registerGlobalShortcuts();
  // 更新菜单快捷键
  buildMenu();
});

// ==================== 历史窗口 IPC 处理器 ====================

// 历史窗口请求当前笔记数据
ipcMain.on('request-note-data', (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('request-current-note-for-history');
  }
});

// 主窗口发送笔记数据给历史窗口
ipcMain.on('send-note-data', (event, noteData) => {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.webContents.send('note-data-loaded', noteData);
  }
});

// 历史窗口请求恢复笔记内容
ipcMain.on('restore-note-version', (event, data) => {
  const { noteId, snapshotContent } = data;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('restore-note-version', { noteId, snapshotContent });
  }
});

// 历史窗口请求删除历史版本
ipcMain.on('delete-history-version', (event, data) => {
  const { noteId, historyIndex } = data;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('delete-history-version', { noteId, historyIndex });
  }
});

// 打开历史窗口
ipcMain.on('open-history-window', () => {
  openHistoryWindow();
});

// ==================== 视图 / 置顶 / 透明度 / 托盘 ====================

function setAlwaysOnTop(onTop) {
  alwaysOnTop = onTop;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(onTop);
    mainWindow.focus();
  }
  buildMenu(); // 刷新菜单 checkbox 状态
}

function changeOpacity(delta) {
  windowOpacity = Math.min(1, Math.max(0.2, windowOpacity + delta));
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setOpacity(windowOpacity);
  }
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function registerGlobalShortcuts() {
  const toggleKey = customShortcuts.toggle || 'CommandOrControl+Shift+L';
  const topKey = customShortcuts.alwaysOnTop || 'CommandOrControl+Alt+T';
  const sidebarKey = customShortcuts.toggleSidebar || 'CommandOrControl+B';
  const incOpacityKey = customShortcuts.increaseOpacity || 'CommandOrControl+Shift+I';
  const decOpacityKey = customShortcuts.decreaseOpacity || 'CommandOrControl+Shift+O';
  const newNoteKey = customShortcuts.newNote || 'CommandOrControl+Shift+N';
  
  // 注册全局快捷键，并检查是否注册成功
  const toggleRegistered = globalShortcut.register(toggleKey, toggleWindow);
  const topRegistered = globalShortcut.register(topKey, () => {
    setAlwaysOnTop(!alwaysOnTop);
  });
  const sidebarRegistered = globalShortcut.register(sidebarKey, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toggle-sidebar');
    }
  });
  const incOpacityRegistered = globalShortcut.register(incOpacityKey, () => changeOpacity(0.1));
  const decOpacityRegistered = globalShortcut.register(decOpacityKey, () => changeOpacity(-0.1));
  const newNoteRegistered = globalShortcut.register(newNoteKey, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file-new');
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.ico'));  // ← 改这行
  tray = new Tray(icon);
  tray.setToolTip('LoxNote');
  const menu = Menu.buildFromTemplate([
    { label: i18n.t('view.hideShow'), click: () => toggleWindow() },
    { type: 'separator' },
    {
      label: i18n.t('view.alwaysOnTop'),
      type: 'checkbox',
      checked: alwaysOnTop,
      click: (item) => setAlwaysOnTop(item.checked)
    },
    { label: i18n.t('view.increaseOpacity'), click: () => changeOpacity(0.1) },
    { label: i18n.t('view.decreaseOpacity'), click: () => changeOpacity(-0.1) },
    { type: 'separator' },
    { label: i18n.t('view.exit'), click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => toggleWindow());
}