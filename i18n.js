// ==================== 多语言翻译模块 ====================

const translations = {
  'zh-CN': {
    menu: {
      file: '文件', new: '新建', open: '打开...', save: '保存', saveAs: '另存为...',
      exit: '退出', edit: '编辑', undo: '撤销', redo: '重做',
      cut: '剪切', copy: '复制', paste: '粘贴', selectAll: '全选',
      find: '查找...', format: '格式', wordWrap: '自动换行',
      increaseFont: '增大字体', decreaseFont: '减小字体',
      help: '帮助', about: '关于 LoxNote', language: '语言',
      chinese: '中文', english: 'English', view: '视图',
      settings: '设置', openSettings: '打开设置',
      exportNotes: '导出笔记', exportTxt: '导出为 TXT',
      exportMd: '导出为 Markdown',
      exportJson: '导出为 JSON（备份）', exportZip: '导出为 ZIP',
      exportPdf: '导出当前笔记为 PDF', exportAllPdf: '导出全部为 PDF',
      exportHtml: '导出为单个 HTML',
      exportCurrentHtml: '导出当前笔记为 HTML'
    },
    dialog: {
      saveChanges: '是否保存对当前文件的修改？',
      save: '保存', dontSave: '不保存', cancel: '取消',
      saveError: '保存失败', saveFailed: '无法保存文件',
      openError: '打开失败', openFailed: '无法打开文件',
      aboutMessage: '一个轻量纯文本记事本。\n基于 Electron + 原生 HTML/CSS/JavaScript 构建。',
      textFiles: '文本文件'
    },
    ui: {
      untitled: '未命名', modified: '已修改', placeholder: '开始输入...',
      findPlaceholder: '查找...', replacePlaceholder: '替换...',
      prevMatch: '上一个', nextMatch: '下一个', replace: '替换', replaceAll: '全部替换',
      closeFind: '关闭', noMatches: '无匹配', of: '/',
      sidebarTitle: '笔记', autoSaved: '已自动保存',
      chars: '字', lines: '行',
      searchPlaceholder: '搜索笔记...',
      pinned: '已置顶',
      unpinned: '取消置顶',
      pin: '置顶',
      rename: '重命名',
      delete: '删除',
      recentFiles: '最近文件',
      noRecentFiles: '无最近文件',
      clearRecentFiles: '清除最近文件',
      saved: '已保存',
      trash: '回收站',
      restoreAll: '全部恢复',
      restore: '恢复',
      permanentlyDelete: '永久删除',
      clearTrash: '清空回收站',
      clearTrashConfirm: '确定要永久清空回收站吗？此操作不可恢复。',
      backlinks: '反向链接',
      tags: '标签',
      manageTags: '管理标签',
      tagPlaceholder: '输入标签，用逗号分隔',
      tagRenameHint: '重命名标签为：',
      allNotes: '全部笔记',
      addTag: '添加标签',
      tagEmpty: '暂无标签',
      preview: '预览',
      edit: '编辑',
      insertLink: '插入笔记链接',
      searchNotes: '搜索笔记...',
      insertTime: '插入当前时间',
      newNoteFromSelection: '用选中文字新建笔记',
      enterNoteTitle: '输入新笔记标题',
      noteTitlePlaceholder: '笔记标题',
      lastSaved: '上次保存',
      justNow: '刚刚',
      secondsAgo: '秒前',
      minutesAgo: '分钟前',
      hoursAgo: '小时前',
      daysAgo: '天前',
      quickSwitch: '快速切换笔记'
    },
    view: {
      alwaysOnTop: '窗口置顶',
      increaseOpacity: '更透明',
      decreaseOpacity: '更不透明',
      hideShow: '显示 / 隐藏',
      exit: '退出'
    }
  },
  'en': {
    menu: {
      file: 'File', new: 'New', open: 'Open...', save: 'Save', saveAs: 'Save As...',
      exit: 'Exit', edit: 'Edit', undo: 'Undo', redo: 'Redo',
      cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All',
      find: 'Find...', format: 'Format', wordWrap: 'Word Wrap',
      increaseFont: 'Increase Font Size', decreaseFont: 'Decrease Font Size',
      help: 'Help', about: 'About LoxNote', language: 'Language',
      chinese: '中文', english: 'English', view: 'View',
      settings: 'Settings', openSettings: 'Open Settings',
      exportNotes: 'Export Notes', exportTxt: 'Export as TXT',
      exportMd: 'Export as Markdown',
      exportJson: 'Export as JSON (Backup)', exportZip: 'Export as ZIP',
      exportPdf: 'Export Current Note as PDF', exportAllPdf: 'Export All as PDF',
      exportHtml: 'Export as Single HTML',
      exportCurrentHtml: 'Export Current Note as HTML'
    },
    dialog: {
      saveChanges: 'Do you want to save changes to this file?',
      save: 'Save', dontSave: "Don't Save", cancel: 'Cancel',
      saveError: 'Save Error', saveFailed: 'Failed to save file',
      openError: 'Open Error', openFailed: 'Failed to open file',
      aboutMessage: 'A lightweight plain text notepad.\nBuilt with Electron + native HTML/CSS/JavaScript.',
      textFiles: 'Text Files'
    },
    ui: {
      untitled: 'Untitled', modified: 'Modified', placeholder: 'Start typing...',
      findPlaceholder: 'Find...', replacePlaceholder: 'Replace...',
      prevMatch: 'Previous', nextMatch: 'Next', replace: 'Replace', replaceAll: 'Replace All',
      closeFind: 'Close', noMatches: 'No matches', of: ' of ',
      sidebarTitle: 'Notes', autoSaved: 'Auto-saved',
      chars: 'chars', lines: 'lines',
      searchPlaceholder: 'Search notes...',
      pinned: 'Pinned',
      unpinned: 'Unpinned',
      pin: 'Pin',
      rename: 'Rename',
      delete: 'Delete',
      recentFiles: 'Recent Files',
      noRecentFiles: 'No recent files',
      clearRecentFiles: 'Clear Recent Files',
      saved: 'Saved',
      trash: 'Trash',
      restoreAll: 'Restore All',
      restore: 'Restore',
      permanentlyDelete: 'Delete Forever',
      clearTrash: 'Clear Trash',
      clearTrashConfirm: 'Are you sure you want to permanently clear the trash? This cannot be undone.',
      backlinks: 'Backlinks',
      tags: 'Tags',
      manageTags: 'Manage Tags',
      tagPlaceholder: 'Enter tags separated by commas',
      tagRenameHint: 'Rename tag to:',
      allNotes: 'All Notes',
      addTag: 'Add Tag',
      tagEmpty: 'No tags',
      preview: 'Preview',
      edit: 'Edit',
      insertLink: 'Insert Note Link',
      searchNotes: 'Search notes...',
      insertTime: 'Insert Current Time',
      newNoteFromSelection: 'New Note from Selection',
      enterNoteTitle: 'Enter note title',
      noteTitlePlaceholder: 'Note title',
      lastSaved: 'Last saved',
      justNow: 'just now',
      secondsAgo: 'seconds ago',
      minutesAgo: 'minutes ago',
      hoursAgo: 'hours ago',
      daysAgo: 'days ago',
      quickSwitch: 'Quick Switch Note'
    },
    view: {
      alwaysOnTop: 'Always On Top',
      increaseOpacity: 'More Transparent',
      decreaseOpacity: 'Less Transparent',
      hideShow: 'Show / Hide',
      exit: 'Exit'
    }
  }
};

let currentLang = 'en';

function detectSystemLanguage() {
  const locale = require('electron').app ? require('electron').app.getLocale() : 'en';
  return locale.startsWith('zh') ? 'zh-CN' : 'en';
}

function t(path) {
  const keys = path.split('.');
  let value = translations[currentLang];
  for (const key of keys) {
    if (!value || typeof value !== 'object') return path;
    value = value[key];
  }
  return value || path;
}

function setLanguage(lang) {
  if (translations[lang]) {
    currentLang = lang;
  }
}

function getCurrentLang() {
  return currentLang;
}

const fs = require('fs');
const path = require('path');

let configPath = null;

function setConfigDir(dir) {
  configPath = path.join(dir, 'loxnote-config.json');
}

function saveLanguage() {
  if (!configPath) return;
  try {
    fs.writeFileSync(configPath, JSON.stringify({ language: currentLang }), 'utf-8');
  } catch (e) { /* 忽略保存失败 */ }
}

function loadLanguage() {
  if (!configPath) return null;
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (data && data.language && translations[data.language]) {
        currentLang = data.language;
        return currentLang;
      }
    }
  } catch (e) { /* 忽略读取失败 */ }
  return null;
}

module.exports = { t, setLanguage, getCurrentLang, detectSystemLanguage, translations, setConfigDir, saveLanguage, loadLanguage };