const { ipcRenderer } = require('electron');

// 默认快捷键配置
const defaultShortcuts = {
  toggle: 'CmdOrCtrl+Shift+L',
  alwaysOnTop: 'CmdOrCtrl+Alt+T',
  newNote: 'CmdOrCtrl+Shift+N',
  save: 'CmdOrCtrl+S',
  find: 'CmdOrCtrl+F',
  toggleSidebar: 'CmdOrCtrl+B',  // 改成这个
  increaseOpacity: 'CmdOrCtrl+Shift+I',
  decreaseOpacity: 'CmdOrCtrl+Shift+O'      
};

let currentShortcuts = { ...defaultShortcuts };
let isRecording = false;
let recordingKey = null;

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  // 先加载主题
  loadTheme();
  loadSettings();
  initTabs();
  initShortcuts();
  initAppearance();
  initGeneral();
});

// ==================== 主题加载 ====================
function loadTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

// ==================== Tab 切换 ====================
function initTabs() {
  const tabs = document.querySelectorAll('.tab-item');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(`tab-${target}`).classList.add('active');
    });
  });
}

// ==================== 快捷键设置 ====================
function initShortcuts() {
  const inputs = document.querySelectorAll('.shortcut-input');
  
  inputs.forEach(input => {
    const key = input.id.replace('shortcut-', '');
    input.value = formatShortcut(currentShortcuts[key]);
    
    // 点击输入框开始录制
    input.addEventListener('click', () => startRecording(key, input));
    
    // 失去焦点时停止录制
    input.addEventListener('blur', () => {
      if (isRecording && recordingKey === key) {
        stopRecording();
      }
    });
  });

  // 全局键盘监听（绕过 readonly 限制）
  document.addEventListener('keydown', (e) => {
    if (!isRecording || !recordingKey) return;
    e.preventDefault();
    e.stopPropagation();
    
    const shortcut = buildShortcut(e);
    if (shortcut) {
      currentShortcuts[recordingKey] = shortcut;
      const input = document.getElementById(`shortcut-${recordingKey}`);
      if (input) {
        input.value = formatShortcut(shortcut);
      }
      saveShortcuts();
      applyShortcuts();
      stopRecording();
    }
  });

  // 重置按钮
  document.querySelectorAll('.btn-reset').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      currentShortcuts[key] = defaultShortcuts[key];
      document.getElementById(`shortcut-${key}`).value = formatShortcut(defaultShortcuts[key]);
      saveShortcuts();
      applyShortcuts();
    });
  });
}

function startRecording(key, input) {
  isRecording = true;
  recordingKey = key;
  input.classList.add('recording');
  input.value = '按下快捷键...';
  input.focus();
}

function stopRecording() {
  isRecording = false;
  recordingKey = null;
  document.querySelectorAll('.shortcut-input').forEach(input => {
    input.classList.remove('recording');
  });
}

function buildShortcut(e) {
  const parts = [];
  
  if (e.ctrlKey || e.metaKey) parts.push('CmdOrCtrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  
  // 忽略单独的修饰键
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  
  const keyMap = {
    ' ': 'Space',
    '=': '=',
    '-': '-',
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right'
  };
  
  const keyName = keyMap[e.key] || e.key.toUpperCase();
  parts.push(keyName);
  
  return parts.join('+');
}

function formatShortcut(shortcut) {
  return shortcut
    .replace('CmdOrCtrl', process.platform === 'darwin' ? '⌘' : 'Ctrl')
    .replace('Shift', '⇧')
    .replace('Alt', 'Alt')
    .replace(/\+/g, ' + ');
}

function saveShortcuts() {
  ipcRenderer.send('save-shortcuts', currentShortcuts);
}

function applyShortcuts() {
  ipcRenderer.send('apply-shortcuts', currentShortcuts);
}

// ==================== 外观设置 ====================
function initAppearance() {
  const opacitySlider = document.getElementById('opacity-slider');
  const opacityValue = document.getElementById('opacity-value');
  const alwaysOnTop = document.getElementById('always-on-top');
  const fontDecrease = document.getElementById('font-decrease');
  const fontIncrease = document.getElementById('font-increase');
  const fontSizeDisplay = document.getElementById('font-size-display');
  const wordWrap = document.getElementById('word-wrap');
  const themeSelect = document.getElementById('theme-select');

  // 加载当前值
  ipcRenderer.on('settings-loaded', (event, data) => {
    opacitySlider.value = data.opacity * 100;
    opacityValue.textContent = `${data.opacity * 100}%`;
    alwaysOnTop.checked = data.alwaysOnTop;
    fontSizeDisplay.textContent = `${data.fontSize}px`;
    wordWrap.checked = data.wordWrap;
    if (themeSelect) {
      // 使用localStorage中保存的主题，保持与设置窗口显示一致
      const savedTheme = localStorage.getItem('theme') || data.theme || 'light';
      themeSelect.value = savedTheme;
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  });

  // 监听语言切换事件
  ipcRenderer.on('language-changed', (event, lang) => {
    // 重新加载设置窗口
    loadSettings();
  });

  // 主题切换
  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      const theme = themeSelect.value;
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
      ipcRenderer.send('set-theme', theme);
    });
  }

  // 透明度滑块
  opacitySlider.addEventListener('input', () => {
    const value = parseInt(opacitySlider.value);
    opacityValue.textContent = `${value}%`;
    ipcRenderer.send('set-opacity', value / 100);
  });

  // 置顶开关
  alwaysOnTop.addEventListener('change', () => {
    ipcRenderer.send('set-always-on-top', alwaysOnTop.checked);
  });

  // 字体大小
  fontDecrease.addEventListener('click', () => {
    let size = parseInt(fontSizeDisplay.textContent);
    if (size > 12) {
      size -= 2;
      fontSizeDisplay.textContent = `${size}px`;
      ipcRenderer.send('set-font-size', size);
    }
  });

  fontIncrease.addEventListener('click', () => {
    let size = parseInt(fontSizeDisplay.textContent);
    if (size < 24) {
      size += 2;
      fontSizeDisplay.textContent = `${size}px`;
      ipcRenderer.send('set-font-size', size);
    }
  });

  // 自动换行
  wordWrap.addEventListener('change', () => {
    ipcRenderer.send('set-word-wrap', wordWrap.checked);
  });

  // 请求当前设置
  ipcRenderer.send('request-settings');
}

// ==================== 通用设置 ====================
function initGeneral() {
  const languageSelect = document.getElementById('language-select');
  const closeBehavior = document.getElementById('close-behavior');

  const autoLaunch = document.getElementById('auto-launch');

  // 加载当前值
  ipcRenderer.on('general-settings-loaded', (event, data) => {
    languageSelect.value = data.language;
    closeBehavior.value = data.closeBehavior || 'minimize';
    if (autoLaunch) autoLaunch.checked = !!data.autoLaunch;
  });

  // 语言切换
  languageSelect.addEventListener('change', () => {
    ipcRenderer.send('set-language', languageSelect.value);
  });

  // 关闭行为
  closeBehavior.addEventListener('change', () => {
    ipcRenderer.send('set-close-behavior', closeBehavior.value);
  });

  // 开机自启动
  if (autoLaunch) {
    autoLaunch.addEventListener('change', () => {
      ipcRenderer.send('set-auto-launch', autoLaunch.checked);
    });
  }

  ipcRenderer.send('request-general-settings');
}

// ==================== 加载设置 ====================
function loadSettings() {
  ipcRenderer.on('shortcuts-loaded', (event, shortcuts) => {
    if (shortcuts && Object.keys(shortcuts).length > 0) {
      currentShortcuts = { ...defaultShortcuts, ...shortcuts };
    }
    // 更新输入框显示
    document.querySelectorAll('.shortcut-input').forEach(input => {
      const key = input.id.replace('shortcut-', '');
      input.value = formatShortcut(currentShortcuts[key]);
    });
  });
  ipcRenderer.send('load-shortcuts');
}