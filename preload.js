const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 发送消息到主进程
  send: (channel, data) => {
    const validChannels = [
      'unsaved-response',
      'save-file',
      'save-file-as',
      'load-recent-files',
      'save-recent-files',
      'request-current-lang'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  // 监听主进程消息
  on: (channel, callback) => {
    const validChannels = [
      'recent-files-loaded',
      'check-unsaved',
      'trigger-save',
      'trigger-save-as',
      'file-saved',
      'file-new',
      'file-opened',
      'init-notes-path',
      'menu-find',
      'menu-word-wrap',
      'menu-font-increase',
      'menu-font-decrease',
      'language-changed',
      'current-lang',
      'menu-global-search',
      'menu-theme'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },

  // 监听一次主进程消息
  once: (channel, callback) => {
    const validChannels = [
      'init-notes-path',
      'current-lang'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.once(channel, (event, ...args) => callback(...args));
    }
  },

  // 移除监听器
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },

  // 文件操作 API
  file: {
    existsSync: (filePath) => ipcRenderer.invoke('file-exists', filePath),
    readFileSync: (filePath) => ipcRenderer.invoke('file-read', filePath),
    writeFileSync: (filePath, content) => ipcRenderer.invoke('file-write', { path: filePath, content: content }),
    basename: (filePath, ext) => ipcRenderer.invoke('file-basename', { path: filePath, ext: ext })
  }
});