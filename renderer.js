const { ipcRenderer, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const i18n = require('./i18n');

// ==================== DOM 引用 ====================
const editor = document.getElementById('editor');
const statusBar = document.getElementById('status-bar');
const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findCount = document.getElementById('find-count');
const findPrevBtn = document.getElementById('find-prev');
const findNextBtn = document.getElementById('find-next');
const findCloseBtn = document.getElementById('find-close');
const replaceInput = document.getElementById('replace-input');
const replaceBtn = document.getElementById('replace-btn');
const replaceAllBtn = document.getElementById('replace-all-btn');
const noteList = document.getElementById('note-list');
const btnNewNote = document.getElementById('btn-new-note');
const sidebarTitle = document.getElementById('sidebar-title');

// ==================== 状态变量 ====================
let isModified = false;
let currentFilePath = null;
let currentFontSize = 14;
let wordWrapEnabled = true;
let notesFilePath = null;
let notes = [];
let activeNoteId = null;
let autoSaveTimer = null;
let searchQuery = '';
let activeTag = null; // 当前选中的标签筛选，null 表示全部
let recentFiles = [];
let saveFeedbackTimer = null;
let trash = [];
let trashOpen = false;

// 查找状态
let lastSearchTerm = '';
let lastMatchIndex = -1;
let currentMatches = [];

// 历史记录状态
let editCount = 0;
const MAX_HISTORY = 20;
const AUTO_SNAPSHOT_INTERVAL = 50;

// ==================== 初始化 ====================
function init() {
  // 先加载主题
  loadTheme();
  
  // 监听编辑区内容变化
  editor.addEventListener('input', onEditorChange);

  // Ctrl+点击打开链接 / 跳转笔记
  editor.addEventListener('click', handleEditorCtrlClick);

  // 查找栏事件
  findInput.addEventListener('input', () => performFind());
  findInput.addEventListener('keydown', onFindKeydown);
  findPrevBtn.addEventListener('click', () => performFind(false));
  findNextBtn.addEventListener('click', () => performFind(true));
  findCloseBtn.addEventListener('click', hideFindBar);

  // 替换功能
  replaceBtn.addEventListener('click', replaceCurrent);
  replaceAllBtn.addEventListener('click', replaceAll);
  replaceInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { replaceCurrent(); }
  });

  // 新建笔记按钮
  btnNewNote.addEventListener('click', createNote);

  // 搜索框事件
  var noteSearch = document.getElementById('note-search');
  if (noteSearch) {
    noteSearch.addEventListener('input', function () {
      searchQuery = noteSearch.value.toLowerCase();
      renderNoteList();
    });
  }

  // 回收站事件
  var trashHeader = document.getElementById('trash-header');
  var trashTitle = document.getElementById('trash-title');
  var btnRestoreAll = document.getElementById('btn-restore-all');
  var btnClearTrash = document.getElementById('btn-clear-trash');
  if (trashHeader) {
    trashHeader.addEventListener('click', function () {
      trashOpen = !trashOpen;
      renderTrash();
    });
  }
  if (btnRestoreAll) {
    btnRestoreAll.addEventListener('click', function (e) {
      e.stopPropagation();
      restoreAll();
    });
  }
  if (btnClearTrash) {
    btnClearTrash.addEventListener('click', function (e) {
      e.stopPropagation();
      clearTrash();
    });
  }

  // 加载最近文件列表
  loadRecentFiles();

  // 全局快捷键
  document.addEventListener('keydown', function (e) {
    // Ctrl+Shift+N 新建笔记
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
      e.preventDefault();
      createNote();
    }
    // Ctrl+W 关闭当前笔记
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault();
      closeCurrentNote();
    }
  });

  // 初始化拖拽文件导入
  initDragDrop();

  updateUILanguage();
  updateStatus();
  updateTitle();
}

function onEditorChange() {
  isModified = true;
  editCount++;
  updateStatus();
  updateTitle();
  autoSave();
  
  // 每编辑50次自动创建快照
  if (editCount >= AUTO_SNAPSHOT_INTERVAL) {
    createHistorySnapshot('auto');
    editCount = 0;
  }
  
  // 如果查找栏打开，重新计算匹配
  if (findBar.style.display === 'flex') {
    performFind();
  }
}

// ==================== 笔记管理 ====================

function createNoteObj(title, content) {
  const now = Date.now();
  return {
    id: String(now),
    title: title || '',
    content: content || '',
    tags: [],
    createdAt: now,
    updatedAt: now,
    order: notes.length,
    history: [
      {
        snapshot: content || '',
        timestamp: now,
        trigger: 'manual',
        charCount: content ? content.length : 0
      }
    ],
    historyIndex: 0
  };
}

function loadNotes() {
  if (!notesFilePath) return;
  try {
    if (fs.existsSync(notesFilePath)) {
      const data = JSON.parse(fs.readFileSync(notesFilePath, 'utf-8'));
      notes = data.notes || [];
      activeNoteId = data.activeId;
      // 兼容旧数据：给没有 tags 字段的笔记补上
      notes.forEach(function (n) { if (!n.tags) n.tags = []; });
    }
  } catch (e) { /* ignore */ }

  if (notes.length === 0) {
    const defaultNote = createNoteObj('');
    notes.push(defaultNote);
    activeNoteId = defaultNote.id;
    saveNotes(true);
  }

  // 加载回收站
  try {
    if (fs.existsSync(notesFilePath)) {
      const data = JSON.parse(fs.readFileSync(notesFilePath, 'utf-8'));
      trash = data.trash || [];
    }
  } catch (e) { trash = []; }

  if (!notes.find(function (n) { return n.id === activeNoteId; })) {
    activeNoteId = notes[0].id;
  }

  renderNoteList();
  renderTrash();
  loadActiveNote();
}

function saveNotes(skipContent, createSnapshot) {
  if (!notesFilePath) return;
  if (!skipContent) {
    var active = notes.find(function (n) { return n.id === activeNoteId; });
    if (active) {
      active.content = editor.value;
      active.updatedAt = Date.now();
      // 只在需要时创建快照（切换笔记、退出时）
      if (createSnapshot) {
        createHistorySnapshot('save');
      }
    }
  }
  try {
    fs.writeFileSync(notesFilePath, JSON.stringify({ activeId: activeNoteId, notes: notes, trash: trash }, null, 2), 'utf-8');
  } catch (e) { /* ignore */ }
}

// ==================== 最近文件管理 ====================

function loadRecentFiles() {
  ipcRenderer.send('load-recent-files');
}

ipcRenderer.on('recent-files-loaded', function (event, files) {
  recentFiles = files || [];
});

function addRecentFile(filePath) {
  if (!filePath) return;
  recentFiles = recentFiles.filter(function (f) { return f !== filePath; });
  recentFiles.unshift(filePath);
  if (recentFiles.length > 5) recentFiles = recentFiles.slice(0, 5);
  ipcRenderer.send('save-recent-files', recentFiles);
}

function autoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(function () {
    saveNotes(false, false); // 自动保存不创建快照
    isModified = false;
    showSaveFeedback();
    updateStatus();
  }, 500);
}

function flushSave() {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  saveNotes();
  isModified = false;
  showSaveFeedback();
  updateStatus();
}

function showSaveFeedback() {
  if (saveFeedbackTimer) clearTimeout(saveFeedbackTimer);
  var statusText = document.getElementById('status-text');
  var originalText = statusText.textContent;
  statusText.textContent = i18n.t('ui.saved') + ' \u2713';
  saveFeedbackTimer = setTimeout(function () {
    updateStatus();
  }, 1500);
}

function loadActiveNote() {
  var note = notes.find(function (n) { return n.id === activeNoteId; });
  if (note) {
    editor.value = note.content || '';
    isModified = false;
  }
  currentFilePath = null;
  editor.scrollTop = 0;
  updateStatus();
  updateTitle();
  // 如果在预览模式，重新渲染预览
  if (isPreviewMode && typeof renderPreview === 'function') renderPreview();
}

function renderNoteList() {
  noteList.innerHTML = '';
  var unnamedCount = 0;

  var sorted = notes.slice().sort(function (a, b) {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (a.order || 0) - (b.order || 0);
  });

  var filtered = sorted.filter(function (note) {
    // 标签筛选
    if (activeTag && !(note.tags || []).includes(activeTag)) return false;
    // 搜索筛选
    if (!searchQuery) return true;
    return note.title.toLowerCase().includes(searchQuery) || note.content.toLowerCase().includes(searchQuery);
  });

  filtered.forEach(function (note) {
    var item = document.createElement('div');
    item.className = 'note-item' + (note.id === activeNoteId ? ' active' : '') + (note.pinned ? ' pinned' : '');
    item.setAttribute('data-id', note.id);
    item.setAttribute('draggable', 'true');
    item.addEventListener('click', function () { switchNote(note.id); });
    item.addEventListener('dblclick', function () { renameNote(note.id); });

    item.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      showNoteContextMenu(e, note.id);
    });

    item.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', note.id);
      item.style.opacity = '0.4';
    });
    item.addEventListener('dragend', function () {
      item.style.opacity = '1';
    });
    item.addEventListener('dragover', function (e) {
      e.preventDefault();
      item.style.borderTop = '2px solid #4a90d9';
    });
    item.addEventListener('dragleave', function () {
      item.style.borderTop = '';
    });
    item.addEventListener('drop', function (e) {
      e.preventDefault();
      item.style.borderTop = '';
      var draggedId = e.dataTransfer.getData('text/plain');
      if (draggedId === note.id) return;
      reorderNotes(draggedId, note.id);
    });

    var row = document.createElement('div');
    row.className = 'note-item-row';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'flex-start';

    var titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.width = '100%';
    titleRow.style.alignItems = 'center';

    var titleSpan = document.createElement('span');
    titleSpan.className = 'note-title';
    if (note.title) {
      titleSpan.textContent = note.title;
    } else {
      unnamedCount++;
      titleSpan.textContent = i18n.t('ui.untitled') + ' ' + unnamedCount;
    }

    var delBtn = document.createElement('button');
    delBtn.className = 'note-delete';
    delBtn.textContent = '\u00D7';
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteNote(note.id);
    });

    titleRow.appendChild(titleSpan);
    titleRow.appendChild(delBtn);
    row.appendChild(titleRow);

    // 显示笔记标签
    if (note.tags && note.tags.length > 0) {
      var tagRow = document.createElement('div');
      tagRow.className = 'note-tags';
      note.tags.forEach(function (tag) {
        var tagEl = document.createElement('span');
        tagEl.className = 'note-tag';
        tagEl.textContent = '#' + tag;
        tagEl.title = i18n.t('ui.tags') + ': ' + tag;
        tagRow.appendChild(tagEl);
      });
      row.appendChild(tagRow);
    }

    // 搜索高亮预览：当有搜索词且匹配内容时，显示匹配的内容片段
    if (searchQuery && note.content) {
      var contentPreview = createContentPreview(note.content, searchQuery);
      if (contentPreview) {
        row.appendChild(contentPreview);
      }
    }

    item.appendChild(row);
    noteList.appendChild(item);
  });

  renderTagFilterBar();
}

// 渲染顶部标签筛选栏
function renderTagFilterBar() {
  var bar = document.getElementById('tag-filter-bar');
  if (!bar) return;
  bar.innerHTML = '';

  // 收集所有不重复的标签
  var allTags = {};
  notes.forEach(function (note) {
    (note.tags || []).forEach(function (tag) {
      allTags[tag] = true;
    });
  });
  var tagList = Object.keys(allTags).sort();

  // 「全部」按钮
  var allBtn = document.createElement('span');
  allBtn.className = 'tag-filter-btn' + (activeTag === null ? ' active' : '');
  allBtn.textContent = i18n.t('ui.allNotes');
  allBtn.addEventListener('click', function () {
    activeTag = null;
    renderNoteList();
  });
  bar.appendChild(allBtn);

  // 各标签按钮
  tagList.forEach(function (tag) {
    var btn = document.createElement('span');
    btn.className = 'tag-filter-btn' + (activeTag === tag ? ' active' : '');
    btn.textContent = '#' + tag;
    btn.addEventListener('click', function () {
      activeTag = (activeTag === tag) ? null : tag;
      renderNoteList();
    });
    btn.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      showTagContextMenu(e, tag);
    });
    bar.appendChild(btn);
  });
}

// 标签右键菜单：重命名 / 删除标签（全局生效）
function showTagContextMenu(e, tag) {
  var existing = document.getElementById('tag-context-menu');
  if (existing) existing.remove();

  var menu = document.createElement('div');
  menu.id = 'tag-context-menu';
  menu.className = 'context-menu';

  var renameItem = document.createElement('div');
  renameItem.className = 'context-menu-item';
  renameItem.textContent = i18n.t('ui.rename');
  renameItem.addEventListener('click', function () {
    menu.remove();
    openTagRenameDialog(tag);
  });

  var deleteItem = document.createElement('div');
  deleteItem.className = 'context-menu-item context-menu-item-danger';
  deleteItem.textContent = i18n.t('ui.delete');
  deleteItem.addEventListener('click', function () {
    menu.remove();
    notes.forEach(function (n) {
      if (n.tags) {
        var idx = n.tags.indexOf(tag);
        if (idx >= 0) n.tags.splice(idx, 1);
      }
    });
    if (activeTag === tag) activeTag = null;
    saveNotes();
    renderNoteList();
  });

  menu.appendChild(renameItem);
  menu.appendChild(deleteItem);
  document.body.appendChild(menu);

  var x = e.clientX, y = e.clientY;
  var rect = menu.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 5;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 5;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  setTimeout(function () {
    document.addEventListener('click', closeTagContextMenu);
  }, 0);
}

function closeTagContextMenu() {
  var menu = document.getElementById('tag-context-menu');
  if (menu) menu.remove();
  document.removeEventListener('click', closeTagContextMenu);
}

// 标签重命名弹窗（替代 prompt）
function openTagRenameDialog(tag) {
  var old = document.getElementById('tag-rename-modal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = 'tag-rename-modal';
  modal.className = 'tag-modal-overlay';
  modal.innerHTML = '<div class="tag-modal"><div class="tag-modal-title">' +
    (i18n.t('ui.tagRenameHint') || '重命名标签') + '</div>' +
    '<input type="text" id="tag-rename-input" value="' + tag.replace(/"/g, '&quot;') + '">' +
    '<div class="tag-modal-actions"><button id="tag-rename-ok">OK</button>' +
    '<button id="tag-rename-cancel">' + i18n.t('ui.closeFind') + '</button></div></div>';
  document.body.appendChild(modal);

  var input = document.getElementById('tag-rename-input');
  input.focus();
  input.select();

  function close() { modal.remove(); }
  function confirm() {
    var newName = input.value.trim();
    if (newName && newName !== tag) {
      notes.forEach(function (n) {
        if (n.tags) {
          var idx = n.tags.indexOf(tag);
          if (idx >= 0) n.tags[idx] = newName;
        }
      });
      if (activeTag === tag) activeTag = newName;
      saveNotes();
      renderNoteList();
    }
    close();
  }

  document.getElementById('tag-rename-ok').addEventListener('click', confirm);
  document.getElementById('tag-rename-cancel').addEventListener('click', close);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') close();
  });
  modal.addEventListener('click', function (e) {
    if (e.target === modal) close();
  });
}

function renameNote(id) {
  var note = notes.find(function (n) { return n.id === id; });
  if (!note) return;

  var item = noteList.querySelector('[data-id="' + id + '"]');
  if (!item) return;
  var titleSpan = item.querySelector('.note-title');
  if (!titleSpan) return;

  var input = document.createElement('input');
  input.type = 'text';
  input.value = note.title;
  input.style.cssText = 'width:100%;font-size:13px;border:1px solid #888;border-radius:2px;padding:1px 4px;outline:none;';
  titleSpan.replaceWith(input);
  input.focus();
  input.select();

  function finishRename() {
    var newName = input.value.trim();
    note.title = newName;
    saveNotes(true);
    renderNoteList();
    updateTitle();
  }

  input.addEventListener('blur', finishRename);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { input.blur(); }
    else if (e.key === 'Escape') { input.value = note.title; input.blur(); }
  });
}

function switchNote(id) {
  if (id === activeNoteId) return;
  
  // 切换前保存并创建快照
  saveNotes(false, true);
  
  activeNoteId = id;
  loadActiveNote();
  renderNoteList();
}

function deleteNote(id) {
  if (notes.length <= 1) return;
  var note = notes.find(function (n) { return n.id === id; });
  if (note) {
    note.deletedAt = Date.now();
    trash.push(note);
  }
  notes = notes.filter(function (n) { return n.id !== id; });
  if (activeNoteId === id) {
    activeNoteId = notes[0].id;
    loadActiveNote();
  }
  saveNotes(true);
  renderNoteList();
  renderTrash();
}

function togglePin(id) {
  var note = notes.find(function (n) { return n.id === id; });
  if (note) {
    note.pinned = !note.pinned;
    saveNotes(true);
    renderNoteList();
  }
}

// ==================== 拖拽文件导入 ====================
function initDragDrop() {
  var dragOverlay = null;
  
  // 阻止浏览器默认行为
  ['dragover', 'dragenter', 'dragleave', 'drop'].forEach(function(eventName) {
    document.addEventListener(eventName, function(e) {
      e.preventDefault();
      e.stopPropagation();
    });
  });
  
  // 拖拽进入时显示提示
  document.addEventListener('dragenter', function(e) {
    if (!dragOverlay && e.dataTransfer && e.dataTransfer.types.includes('Files')) {
      dragOverlay = document.createElement('div');
      dragOverlay.id = 'drag-overlay';
      dragOverlay.innerHTML = '<div class="drag-content"><h2>释放以导入文件</h2><p>支持 .txt, .md 文件</p></div>';
      document.body.appendChild(dragOverlay);
    }
  });
  
  document.addEventListener('dragleave', function(e) {
    if (dragOverlay && (!e.relatedTarget || e.relatedTarget === document.body)) {
      dragOverlay.remove();
      dragOverlay = null;
    }
  });
  
  // 处理文件放置
  document.addEventListener('drop', function(e) {
    if (dragOverlay) {
      dragOverlay.remove();
      dragOverlay = null;
    }
    
    var files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    
    for (var i = 0; i < files.length; i++) {
      handleDroppedFile(files[i]);
    }
  });
}

function handleDroppedFile(file) {
  var ext = path.extname(file.name).toLowerCase();
  var supportedExts = ['.txt', '.md', '.json', '.html', '.css', '.js', '.log', '.py', '.java', '.c', '.cpp', '.h', '.xml', '.yaml', '.yml', '.csv', '.ini', '.conf', '.sh', '.bat', '.ps1'];
  
  if (!supportedExts.includes(ext) && ext !== '') {
    console.log('不支持的文件类型:', ext);
    return;
  }
  
  try {
    var content = fs.readFileSync(file.path, 'utf-8');
    var title = path.basename(file.name, ext);
    
    // 创建新笔记
    var note = createNoteObj(title, content);
    notes.push(note);
    activeNoteId = note.id;
    
    saveNotes(true);
    loadActiveNote();
    renderNoteList();
    updateStatus();
    updateTitle();
    
    console.log('导入文件成功:', file.name);
  } catch (err) {
    console.error('读取文件失败:', err);
    alert('读取文件失败: ' + err.message);
  }
}

// ==================== 历史记录管理 ====================

function createHistorySnapshot(trigger) {
  var note = notes.find(function (n) { return n.id === activeNoteId; });
  if (!note) return;
  
  if (!note.history) {
    note.history = [];
    note.historyIndex = 0;
  }
  
  var snapshot = {
    snapshot: editor.value,
    timestamp: Date.now(),
    trigger: trigger,
    charCount: editor.value.length
  };
  
  note.history.push(snapshot);
  note.historyIndex = note.history.length - 1;
  
  if (note.history.length > MAX_HISTORY) {
    note.history.shift();
    note.historyIndex--;
  }
}

function restoreToVersion(historyIndex) {
  var note = notes.find(function (n) { return n.id === activeNoteId; });
  if (!note || !note.history || !note.history[historyIndex]) return;
  
  editor.value = note.history[historyIndex].snapshot;
  note.historyIndex = historyIndex;
  isModified = true;
  updateStatus();
  updateTitle();
  saveNotes();
}

function deleteHistoryVersion(historyIndex) {
  var note = notes.find(function (n) { return n.id === activeNoteId; });
  if (!note || !note.history || !note.history[historyIndex]) return;
  
  note.history.splice(historyIndex, 1);
  
  if (note.historyIndex >= note.history.length) {
    note.historyIndex = note.history.length - 1;
  }
  
  saveNotes(true);
}

function getCurrentNoteData() {
  var note = notes.find(function (n) { return n.id === activeNoteId; });
  if (!note) return null;
  
  if (!note.history || note.history.length === 0) {
    note.history = [];
    note.historyIndex = 0;
    createHistorySnapshot('manual');
  }
  
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    history: note.history,
    historyIndex: note.historyIndex
  };
}

function createContentPreview(content, query) {
  if (!query || !content) return null;
  
  var lowerContent = content.toLowerCase();
  var queryLower = query.toLowerCase();
  var firstMatchIdx = lowerContent.indexOf(queryLower);
  
  if (firstMatchIdx === -1) return null;
  
  // 提取匹配位置前后的内容片段（前后各30个字符）
  var contextLength = 30;
  var startIdx = Math.max(0, firstMatchIdx - contextLength);
  var endIdx = Math.min(content.length, firstMatchIdx + query.length + contextLength);
  var snippet = content.substring(startIdx, endIdx);
  
  // 如果不在开头，添加省略号
  if (startIdx > 0) {
    snippet = '...' + snippet;
  }
  // 如果不在结尾，添加省略号
  if (endIdx < content.length) {
    snippet = snippet + '...';
  }
  
  // 创建预览元素
  var preview = document.createElement('div');
  preview.className = 'note-content-preview';
  
  // 高亮匹配的词
  var escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\function reorderNotes(draggedId, targetId) {');
  var regex = new RegExp('(' + escapedQuery + ')', 'gi');
  var highlightedSnippet = snippet.replace(regex, '<mark class="search-highlight">$1</mark>');
  
  preview.innerHTML = highlightedSnippet;
  
  return preview;
}

function reorderNotes(draggedId, targetId) {
  var draggedIdx = notes.findIndex(function (n) { return n.id === draggedId; });
  var targetIdx = notes.findIndex(function (n) { return n.id === targetId; });
  if (draggedIdx === -1 || targetIdx === -1) return;
  var draggedNote = notes.splice(draggedIdx, 1)[0];
  notes.splice(targetIdx, 0, draggedNote);
  // 重新分配 order
  notes.forEach(function (n, i) { n.order = i; });
  saveNotes(true);
  renderNoteList();
}

// 右键菜单功能
function showNoteContextMenu(e, noteId) {
  var existingMenu = document.getElementById('note-context-menu');
  if (existingMenu) existingMenu.remove();

  var note = notes.find(function (n) { return n.id === noteId; });
  if (!note) return;

  var menu = document.createElement('div');
  menu.id = 'note-context-menu';
  menu.className = 'context-menu';

  var pinItem = document.createElement('div');
  pinItem.className = 'context-menu-item';
  pinItem.textContent = note.pinned ? i18n.t('ui.unpinned') : i18n.t('ui.pin');
  pinItem.addEventListener('click', function () {
    togglePin(noteId);
    menu.remove();
  });

  var renameItem = document.createElement('div');
  renameItem.className = 'context-menu-item';
  renameItem.textContent = i18n.t('ui.rename');
  renameItem.addEventListener('click', function () {
    renameNote(noteId);
    menu.remove();
  });

  var tagItem = document.createElement('div');
  tagItem.className = 'context-menu-item';
  tagItem.textContent = i18n.t('ui.manageTags');
  tagItem.addEventListener('click', function () {
    openTagManager(noteId);
    menu.remove();
  });

  var deleteItem = document.createElement('div');
  deleteItem.className = 'context-menu-item context-menu-item-danger';
  deleteItem.textContent = i18n.t('ui.delete');
  deleteItem.addEventListener('click', function () {
    deleteNote(noteId);
    menu.remove();
  });

  menu.appendChild(pinItem);
  menu.appendChild(renameItem);
  menu.appendChild(tagItem);
  menu.appendChild(deleteItem);
  document.body.appendChild(menu);

  var menuRect = menu.getBoundingClientRect();
  var x = e.clientX;
  var y = e.clientY;
  
  if (x + menuRect.width > window.innerWidth) {
    x = window.innerWidth - menuRect.width - 5;
  }
  if (y + menuRect.height > window.innerHeight) {
    y = window.innerHeight - menuRect.height - 5;
  }
  
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  setTimeout(function () {
    document.addEventListener('click', closeContextMenu);
  }, 0);
}

function closeContextMenu() {
  var menu = document.getElementById('note-context-menu');
  if (menu) menu.remove();
  document.removeEventListener('click', closeContextMenu);
}

// 标签管理弹窗
function openTagManager(noteId) {
  var note = notes.find(function (n) { return n.id === noteId; });
  if (!note) return;

  // 移除已有弹窗
  var old = document.getElementById('tag-manager-modal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = 'tag-manager-modal';
  modal.className = 'tag-modal-overlay';
  modal.innerHTML = '<div class="tag-modal"><div class="tag-modal-title">' +
    i18n.t('ui.manageTags') + '</div>' +
    '<input type="text" id="tag-input" placeholder="' + i18n.t('ui.tagPlaceholder') + '">' +
    '<div id="existing-tags"></div>' +
    '<div class="tag-modal-actions"><button id="tag-save">OK</button>' +
    '<button id="tag-cancel">' + i18n.t('ui.closeFind') + '</button></div></div>';
  document.body.appendChild(modal);

  var input = document.getElementById('tag-input');
  input.value = (note.tags || []).join(', ');
  input.focus();

  // 展示已有标签作为快捷按钮
  var existingBox = document.getElementById('existing-tags');
  var allTags = {};
  notes.forEach(function (n) {
    (n.tags || []).forEach(function (t) { allTags[t] = true; });
  });
  Object.keys(allTags).sort().forEach(function (tag) {
    var chip = document.createElement('span');
    chip.className = 'tag-chip' + ((note.tags || []).includes(tag) ? ' selected' : '');
    chip.textContent = '#' + tag;
    chip.addEventListener('click', function () {
      var cur = input.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var idx = cur.indexOf(tag);
      if (idx >= 0) cur.splice(idx, 1); else cur.push(tag);
      input.value = cur.join(', ');
      chip.classList.toggle('selected');
    });
    existingBox.appendChild(chip);
  });

  function close() { modal.remove(); }
  function save() {
    var tags = input.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    note.tags = tags;
    saveNotes();
    renderNoteList();
    close();
  }

  document.getElementById('tag-save').addEventListener('click', save);
  document.getElementById('tag-cancel').addEventListener('click', close);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') close();
  });
  modal.addEventListener('click', function (e) {
    if (e.target === modal) close();
  });
}

function closeCurrentNote() {
  if (notes.length <= 1) return;
  flushSave();
  var idx = notes.findIndex(function (n) { return n.id === activeNoteId; });
  var note = notes[idx];
  note.deletedAt = Date.now();
  trash.push(note);
  notes.splice(idx, 1);
  activeNoteId = notes[Math.min(idx, notes.length - 1)].id;
  loadActiveNote();
  renderNoteList();
  renderTrash();
  saveNotes(true);
}

function createNote() {
  flushSave();
  var note = createNoteObj('');
  notes.push(note);
  activeNoteId = note.id;
  editor.value = '';
  editor.focus();
  renderNoteList();
  renderTrash();
  updateStatus();
  updateTitle();
  saveNotes(true);
}

function createNoteFromFile(filePath, content) {
  var title = path.basename(filePath, '.txt');
  var note = createNoteObj(title, content);
  notes.push(note);
  activeNoteId = note.id;
  editor.value = content;
  isModified = false;
  renderNoteList();
  renderTrash();
  updateStatus();
  updateTitle();
  saveNotes(true);
}

// ==================== 状态栏与标题更新 ====================
function getRelativeTime(timestamp) {
  if (!timestamp) return '';
  var diff = Date.now() - timestamp;
  var seconds = Math.floor(diff / 1000);
  var minutes = Math.floor(seconds / 60);
  var hours = Math.floor(minutes / 60);
  var days = Math.floor(hours / 24);
  if (seconds < 5) return i18n.t('ui.justNow') || '刚刚';
  if (minutes < 1) return seconds + ' ' + (i18n.t('ui.secondsAgo') || '秒前');
  if (hours < 1) return minutes + ' ' + (i18n.t('ui.minutesAgo') || '分钟前');
  if (days < 1) return hours + ' ' + (i18n.t('ui.hoursAgo') || '小时前');
  if (days < 7) return days + ' ' + (i18n.t('ui.daysAgo') || '天前');
  // 超过7天显示具体日期
  var d = new Date(timestamp);
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return month + '-' + day;
}

function updateStatus() {
  var note = notes.find(function (n) { return n.id === activeNoteId; });
  var title = note ? note.title : i18n.t('ui.untitled');
  var text = editor.value;
  var charCount = text.length;
  var lineCount = text ? text.split('\n').length : 0;
  var countInfo = charCount + ' ' + i18n.t('ui.chars') + ' | ' + lineCount + ' ' + i18n.t('ui.lines');
  var dateStr = '';
  if (note && note.updatedAt) {
    dateStr = ' | ' + (i18n.t('ui.lastSaved') || '上次保存') + '：' + getRelativeTime(note.updatedAt);
  }
  var statusText = document.getElementById('status-text');
  if (currentFilePath) {
    statusText.textContent = title + ' | ' + currentFilePath + dateStr + ' | ' + countInfo;
  } else {
    statusText.textContent = title + ' | ' + i18n.t('ui.autoSaved') + dateStr + ' | ' + countInfo;
  }
}

function updateTitle() {
  var note = notes.find(function (n) { return n.id === activeNoteId; });
  var filename = note ? note.title : i18n.t('ui.untitled');
  var prefix = isModified ? '* ' : '';
  document.title = prefix + filename + ' - LoxNote';
}

// 更新界面语言
function updateUILanguage() {
  sidebarTitle.textContent = i18n.t('ui.sidebarTitle');
  editor.placeholder = i18n.t('ui.placeholder');
  findInput.placeholder = i18n.t('ui.findPlaceholder');
  replaceInput.placeholder = i18n.t('ui.replacePlaceholder');
  findPrevBtn.title = i18n.t('ui.prevMatch');
  findNextBtn.title = i18n.t('ui.nextMatch');
  replaceBtn.title = i18n.t('ui.replace');
  replaceAllBtn.title = i18n.t('ui.replaceAll');
  findCloseBtn.title = i18n.t('ui.closeFind');
  var noteSearch = document.getElementById('note-search');
  if (noteSearch) noteSearch.placeholder = i18n.t('ui.searchPlaceholder');
  updateStatus();
  updateTitle();
  // 更新预览按钮语言
  if (typeof updatePreviewBtnLabel === 'function') updatePreviewBtnLabel();
}

// 替换当前匹配
function replaceCurrent() {
  var term = findInput.value;
  var replacement = replaceInput.value;
  if (!term || currentMatches.length === 0 || lastMatchIndex === -1) return;

  var pos = currentMatches[lastMatchIndex];
  var text = editor.value;
  editor.value = text.substring(0, pos) + replacement + text.substring(pos + term.length);
  isModified = true;
  updateStatus();
  performFind();
}

// 替换所有匹配
function replaceAll() {
  var term = findInput.value;
  var replacement = replaceInput.value;
  if (!term) return;

  var text = editor.value;
  var count = 0;
  var idx = text.indexOf(term);
  while (idx !== -1) {
    count++;
    idx = text.indexOf(term, idx + replacement.length);
  }
  if (count === 0) return;

  editor.value = text.split(term).join(replacement);
  isModified = true;
  updateStatus();
  performFind();
}

// ==================== 查找功能 ====================
function showFindBar() {
  findBar.style.display = 'flex';
  findInput.focus();
  findInput.select();
}

function hideFindBar() {
  findBar.style.display = 'none';
  lastSearchTerm = '';
  lastMatchIndex = -1;
  currentMatches = [];
  findCount.textContent = '';
  replaceInput.value = '';
}

function performFind(forward) {
  const term = findInput.value;
  if (!term) {
    findCount.textContent = '';
    currentMatches = [];
    lastMatchIndex = -1;
    lastSearchTerm = '';
    return;
  }

  const text = editor.value;

  // 如果搜索词改变了，重新查找所有匹配
  if (term !== lastSearchTerm) {
    currentMatches = [];
    let idx = text.indexOf(term);
    while (idx !== -1) {
      currentMatches.push(idx);
      idx = text.indexOf(term, idx + 1);
    }
    lastSearchTerm = term;
    lastMatchIndex = -1;
  }

  if (currentMatches.length === 0) {
    findCount.textContent = i18n.t('ui.noMatches');
    return;
  }

  // 确定方向：forward=true 向下，forward=false 向上
  // 如果 forward 未传入（来自 input 事件），保持当前位置
  if (forward === undefined) {
    if (lastMatchIndex === -1) {
      lastMatchIndex = 0;
    }
  } else if (forward) {
    lastMatchIndex = (lastMatchIndex + 1) % currentMatches.length;
  } else {
    lastMatchIndex = (lastMatchIndex - 1 + currentMatches.length) % currentMatches.length;
  }

  const pos = currentMatches[lastMatchIndex];
  editor.focus();
  editor.setSelectionRange(pos, pos + term.length);

  // 滚动到可见区域需要先设置选区再计算位置
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 22;
  const paddingTop = parseFloat(getComputedStyle(editor).paddingTop) || 14;
  const linesBefore = text.substring(0, pos).split('\n').length - 1;
  const scrollTop = linesBefore * lineHeight + paddingTop - editor.clientHeight / 3;
  editor.scrollTop = Math.max(0, scrollTop);

  findCount.textContent = (lastMatchIndex + 1) + i18n.t('ui.of') + currentMatches.length;
}

function onFindKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) {
      performFind(false);
    } else {
      performFind(true);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideFindBar();
    editor.focus();
  }
}

// ==================== 回收站 ====================

function renderTrash() {
  var trashList = document.getElementById('trash-list');
  var trashTitleEl = document.getElementById('trash-title');
  var btnRestoreAll = document.getElementById('btn-restore-all');
  var btnClearTrash = document.getElementById('btn-clear-trash');
  if (!trashList || !trashTitleEl || !btnRestoreAll) return;

  trashTitleEl.textContent = i18n.t('ui.trash') + (trash.length > 0 ? ' (' + trash.length + ')' : '');
  btnRestoreAll.title = trash.length > 0 ? i18n.t('ui.restoreAll') : '';
  btnRestoreAll.style.visibility = trash.length > 0 ? 'visible' : 'hidden';
  if (btnClearTrash) {
    btnClearTrash.textContent = trash.length > 0 ? i18n.t('ui.clearTrash') : '';
    btnClearTrash.title = trash.length > 0 ? i18n.t('ui.clearTrash') : '';
    btnClearTrash.style.visibility = trash.length > 0 ? 'visible' : 'hidden';
  }

  if (trashOpen) {
    trashList.classList.add('open');
  } else {
    trashList.classList.remove('open');
    return;
  }

  trashList.innerHTML = '';
  trash.forEach(function (note) {
    var item = document.createElement('div');
    item.className = 'trash-item';

    var titleSpan = document.createElement('span');
    titleSpan.className = 'trash-item-title';
    titleSpan.textContent = note.title || i18n.t('ui.untitled');

    var restoreBtn = document.createElement('button');
    restoreBtn.className = 'trash-restore-btn';
    restoreBtn.textContent = '\u21A9';
    restoreBtn.title = i18n.t('ui.restore');
    restoreBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      restoreNote(note.id);
    });

    var permDeleteBtn = document.createElement('button');
    permDeleteBtn.className = 'trash-delete-btn';
    permDeleteBtn.textContent = '\u00D7';
    permDeleteBtn.title = i18n.t('ui.permanentlyDelete');
    permDeleteBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      permanentlyDelete(note.id);
    });

    item.appendChild(titleSpan);
    item.appendChild(restoreBtn);
    item.appendChild(permDeleteBtn);
    trashList.appendChild(item);
  });
}

function restoreNote(id) {
  var note = trash.find(function (n) { return n.id === id; });
  if (!note) return;
  trash = trash.filter(function (n) { return n.id !== id; });
  delete note.deletedAt;
  notes.push(note);
  saveNotes(true);
  renderNoteList();
  renderTrash();
}

function restoreAll() {
  if (trash.length === 0) return;
  trash.forEach(function (note) {
    delete note.deletedAt;
    notes.push(note);
  });
  trash = [];
  saveNotes(true);
  renderNoteList();
  renderTrash();
}

function clearTrash() {
  if (trash.length === 0) return;
  if (!confirm(i18n.t('ui.clearTrashConfirm'))) return;
  trash = [];
  saveNotes(true);
  renderTrash();
}

function permanentlyDelete(id) {
  trash = trash.filter(function (n) { return n.id !== id; });
  saveNotes(true);
  renderTrash();
}

// ==================== IPC 监听器 ====================

// 主进程询问是否有未保存的修改（笔记模式下直接保存即可）
ipcRenderer.on('check-unsaved', function () {
  flushSave();
  ipcRenderer.send('unsaved-response', {
    isModified: false,
    content: editor.value
  });
});

// 主进程要求保存文件
ipcRenderer.on('trigger-save', () => {
  ipcRenderer.send('save-file', editor.value);
});

// 主进程要求另存为
ipcRenderer.on('trigger-save-as', () => {
  ipcRenderer.send('save-file-as', editor.value);
});

// 文件保存成功
ipcRenderer.on('file-saved', function (event, filePath) {
  currentFilePath = filePath;
  isModified = false;
  updateStatus();
  updateTitle();
});

// 新建文件（笔记模式下创建新笔记）
ipcRenderer.on('file-new', function () {
  createNote();
});

// 打开文件（笔记模式下导入为新笔记）
ipcRenderer.on('file-opened', function (event, data) {
  flushSave();
  createNoteFromFile(data.filePath, data.content);
});

// 接收笔记文件路径
ipcRenderer.on('init-notes-path', function (event, filePath) {
  notesFilePath = filePath;
  loadNotes();
});

// 打开查找栏
ipcRenderer.on('menu-find', showFindBar);

// 自动换行开关
ipcRenderer.on('menu-word-wrap', (event, enabled) => {
  wordWrapEnabled = enabled;
  editor.wrap = enabled ? 'soft' : 'off';
});

// 增大字体
ipcRenderer.on('menu-font-increase', () => {
  if (currentFontSize < 24) {
    currentFontSize += 2;
    editor.style.fontSize = currentFontSize + 'px';
  }
});

// 减小字体
ipcRenderer.on('menu-font-decrease', () => {
  if (currentFontSize > 12) {
    currentFontSize -= 2;
    editor.style.fontSize = currentFontSize + 'px';
  }
});

// 直接设置字体大小（从设置窗口）
ipcRenderer.on('menu-font-set', (event, size) => {
  currentFontSize = size;
  editor.style.fontSize = size + 'px';
});

// ==================== 历史窗口 IPC 监听器 ====================

ipcRenderer.on('request-current-note-for-history', () => {
  const noteData = getCurrentNoteData();
  if (noteData) {
    ipcRenderer.send('send-note-data', noteData);
  }
});

ipcRenderer.on('restore-note-version', (event, data) => {
  if (data.noteId === activeNoteId) {
    editor.value = data.snapshotContent;
    isModified = true;
    updateStatus();
    updateTitle();
    createHistorySnapshot('manual');
    saveNotes();
  }
});

ipcRenderer.on('delete-history-version', (event, data) => {
  if (data.noteId === activeNoteId) {
    deleteHistoryVersion(data.historyIndex);
  }
});

// ==================== 全局快捷键（补充） ====================
// 大部分快捷键已通过 Electron 菜单 accelerator 处理，
// 这里补充处理 textarea 中可能被拦截的快捷键
document.addEventListener('keydown', (e) => {
  // Ctrl+F: 如果查找栏未显示则显示
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    showFindBar();
  }
  // Ctrl+Alt+K: 插入笔记链接 [[笔记标题]]
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openNoteLinkPicker();
  }
});

// 语言切换监听（直接使用传入的语言，不依赖本地 i18n 实例）
ipcRenderer.on('language-changed', (event, lang) => {
  i18n.setLanguage(lang);
  updateUILanguage();
  renderNoteList();
  renderTrash();
});

// 主进程响应语言请求
ipcRenderer.on('current-lang', (event, lang) => {
  i18n.setLanguage(lang);
  updateUILanguage();
});

// ==================== 启动 ====================
// 等待主进程发送笔记路径后再初始化 UI
ipcRenderer.once('init-notes-path', function () {
  init();
  // 初始化完成后请求当前语言
  ipcRenderer.send('request-current-lang');
  // 每30秒刷新状态栏（更新"上次保存：x分钟前"的相对时间）
  setInterval(updateStatus, 30000);
});

// --- 侧边栏折叠逻辑 ---
const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const sidebar = document.getElementById('sidebar');
const editorContainer = document.getElementById('editor-container');

if (btnToggleSidebar && sidebar && editorContainer) {
  // 恢复上次保存的状态
  const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
  if (isCollapsed) {
    sidebar.classList.add('collapsed');
    editorContainer.classList.add('expanded');
  }

  btnToggleSidebar.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    editorContainer.classList.toggle('expanded');
    
    // 保存状态
    const collapsed = sidebar.classList.contains('collapsed');
    localStorage.setItem('sidebar-collapsed', collapsed);
  });
}

// 快捷键 Ctrl+B 切换侧边栏
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
    e.preventDefault();
    const btn = document.getElementById('btn-toggle-sidebar');
    if (btn) btn.click();
  }
});

// ==================== Ctrl+P 快速切换笔记 ====================
let quickSwitchModal = null;
let quickSwitchSelectedIndex = 0;
let quickSwitchFilteredNotes = [];

function openQuickSwitch() {
  closeQuickSwitch();

  quickSwitchSelectedIndex = 0;
  quickSwitchFilteredNotes = notes.slice();

  const modal = document.createElement('div');
  modal.id = 'quick-switch-modal';
  modal.className = 'tag-modal-overlay';
  modal.innerHTML = '<div class="tag-modal" style="width:420px;">' +
    '<div class="tag-modal-title">' + (i18n.t('ui.quickSwitch') || '快速切换笔记') + '</div>' +
    '<input type="text" id="quick-switch-input" placeholder="' + (i18n.t('ui.searchNotes') || '搜索笔记...') + '" autocomplete="off">' +
    '<div id="quick-switch-list"></div>' +
    '</div>';
  document.body.appendChild(modal);
  quickSwitchModal = modal;

  const input = document.getElementById('quick-switch-input');
  input.focus();

  input.addEventListener('input', function () {
    quickSwitchSelectedIndex = 0;
    renderQuickSwitchList();
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (quickSwitchSelectedIndex < quickSwitchFilteredNotes.length - 1) {
        quickSwitchSelectedIndex++;
        renderQuickSwitchList();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (quickSwitchSelectedIndex > 0) {
        quickSwitchSelectedIndex--;
        renderQuickSwitchList();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const note = quickSwitchFilteredNotes[quickSwitchSelectedIndex];
      if (note) {
        closeQuickSwitch();
        switchNote(note.id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeQuickSwitch();
    }
  });

  // 点击遮罩关闭
  modal.addEventListener('mousedown', function (e) {
    if (e.target === modal) closeQuickSwitch();
  });

  renderQuickSwitchList();
}

function renderQuickSwitchList() {
  const input = document.getElementById('quick-switch-input');
  const listEl = document.getElementById('quick-switch-list');
  if (!input || !listEl) return;

  const keyword = input.value.trim().toLowerCase();
  quickSwitchFilteredNotes = notes.filter(function (n) {
    if (!keyword) return true;
    return (n.title || '').toLowerCase().includes(keyword);
  });

  if (quickSwitchSelectedIndex >= quickSwitchFilteredNotes.length) {
    quickSwitchSelectedIndex = Math.max(0, quickSwitchFilteredNotes.length - 1);
  }

  listEl.innerHTML = '';
  if (quickSwitchFilteredNotes.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:16px;text-align:center;color:var(--text-muted);font-size:13px;';
    empty.textContent = i18n.t('ui.noMatches') || '无匹配';
    listEl.appendChild(empty);
    return;
  }

  quickSwitchFilteredNotes.forEach(function (note, idx) {
    const item = document.createElement('div');
    item.className = 'quick-switch-item' + (idx === quickSwitchSelectedIndex ? ' selected' : '');
    item.style.cssText = 'padding:8px 12px;cursor:pointer;border-radius:4px;font-size:14px;' +
      (idx === quickSwitchSelectedIndex ? 'background:var(--accent-bg,rgba(74,144,217,0.15));color:var(--accent-color);' : '');
    item.textContent = note.title || i18n.t('ui.untitled');
    item.addEventListener('mousedown', function (e) {
      e.preventDefault();
      closeQuickSwitch();
      switchNote(note.id);
    });
    item.addEventListener('mouseenter', function () {
      quickSwitchSelectedIndex = idx;
      renderQuickSwitchList();
    });
    listEl.appendChild(item);
  });
}

function closeQuickSwitch() {
  if (quickSwitchModal) {
    quickSwitchModal.remove();
    quickSwitchModal = null;
  }
}

// Ctrl+P 打开快速切换
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    openQuickSwitch();
  }
});

// ==================== 聚焦模式 ====================
function toggleFocusMode() {
  document.body.classList.toggle('focus-mode');
  const isFocus = document.body.classList.contains('focus-mode');
  localStorage.setItem('focus-mode', isFocus ? 'true' : 'false');
}

// 启动时恢复聚焦模式状态
if (localStorage.getItem('focus-mode') === 'true') {
  document.body.classList.add('focus-mode');
}

// Ctrl+Shift+F 切换聚焦模式，Esc 退出
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    toggleFocusMode();
  }
  if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) {
    document.body.classList.remove('focus-mode');
    localStorage.setItem('focus-mode', 'false');
  }
});

// 主进程触发侧边栏切换（全局快捷键）
ipcRenderer.on('toggle-sidebar', () => {
  const btn = document.getElementById('btn-toggle-sidebar');
  if (btn) btn.click();
});

// 导出功能：主进程请求导出数据
// 先移除旧监听器，防止重复注册
ipcRenderer.removeAllListeners('export-notes-txt');
ipcRenderer.removeAllListeners('export-notes-md');
ipcRenderer.removeAllListeners('export-notes-json');
ipcRenderer.removeAllListeners('export-notes-zip');
ipcRenderer.removeAllListeners('export-note-pdf');
ipcRenderer.removeAllListeners('export-all-pdf');
ipcRenderer.removeAllListeners('export-notes-html');
ipcRenderer.removeAllListeners('export-note-html');
ipcRenderer.removeAllListeners('export-complete');

ipcRenderer.on('export-notes-txt', () => {
  ipcRenderer.send('export-notes-txt', notes);
});

ipcRenderer.on('export-notes-md', () => {
  ipcRenderer.send('export-notes-md', notes);
});

ipcRenderer.on('export-notes-json', () => {
  ipcRenderer.send('export-notes-json', notes);
});

ipcRenderer.on('export-notes-zip', () => {
  ipcRenderer.send('export-notes-zip', notes);
});

// 导出当前笔记为 PDF
ipcRenderer.on('export-note-pdf', () => {
  const currentNote = notes.find(n => n.id === activeNoteId);
  if (currentNote) ipcRenderer.send('export-note-pdf', currentNote);
});

// 导出全部笔记为 PDF
ipcRenderer.on('export-all-pdf', () => {
  ipcRenderer.send('export-all-pdf', notes);
});

// 导出全部笔记为单个 HTML
ipcRenderer.on('export-notes-html', () => {
  ipcRenderer.send('export-notes-html', notes);
});

// 导出当前笔记为单个 HTML
ipcRenderer.on('export-note-html', () => {
  const currentNote = notes.find(n => n.id === activeNoteId);
  if (currentNote) ipcRenderer.send('export-note-html', currentNote);
});

// 导出完成提示
ipcRenderer.on('export-complete', (event, result) => {
  if (result.success) {
    alert(`导出成功！共 ${result.count} 个笔记。`);
  } else {
    alert(`导出失败：${result.error}`);
  }
});

// --- 侧边栏拖拽调整宽度逻辑 ---
const resizer = document.getElementById('sidebar-resizer');

if (resizer && sidebar) {
  let isResizing = false;

  const savedWidth = localStorage.getItem('sidebar-width');
  if (savedWidth && !sidebar.classList.contains('collapsed')) {
    sidebar.style.width = savedWidth + 'px';
  }

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    let newWidth = e.clientX;
    if (newWidth < 100) newWidth = 100;
    if (newWidth > 400) newWidth = 400;
    sidebar.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem('sidebar-width', parseInt(sidebar.style.width));
    }
  });
}

// ==================== 主题切换 ====================

function loadTheme() {
  currentTheme = localStorage.getItem('theme') || 'light';
  applyTheme(currentTheme);
}

function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

// 从光标位置提取链接（URL 或 [[笔记标题]]）
function extractLinkAtCursor(text, pos) {
  if (pos < 0 || pos > text.length) return null;

  // 先尝试匹配 [[笔记标题]]
  // 向前找 [[
  let start = pos;
  while (start > 0) {
    if (text.charAt(start - 1) === '[' && text.charAt(start - 2) === '[') {
      start -= 2;
      break;
    }
    // 遇到换行或空格停止
    if (text.charAt(start - 1) === '\n' || text.charAt(start - 1) === ' ') break;
    start--;
  }
  // 向后找 ]]
  let end = pos;
  while (end < text.length - 1) {
    if (text.charAt(end) === ']' && text.charAt(end + 1) === ']') {
      end += 2;
      // 确认开头确实是 [[
      if (text.charAt(start) === '[' && text.charAt(start + 1) === '[') {
        const inner = text.slice(start + 2, end - 2);
        const pipeIdx = inner.indexOf('|');
        const title = (pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner).trim();
        return { type: 'note', title: title };
      }
      break;
    }
    if (text.charAt(end) === '\n') break;
    end++;
  }

  // 再尝试匹配 URL
  // 向前找 URL 开头（http:// 或 https://）
  let urlStart = pos;
  while (urlStart > 0) {
    const ch = text.charAt(urlStart - 1);
    if (ch === ' ' || ch === '\n' || ch === '\t') break;
    urlStart--;
    // 检查是否以 http(s):// 开头
    if (urlStart >= 6 && text.slice(urlStart, urlStart + 7) === 'http://') break;
    if (urlStart >= 7 && text.slice(urlStart, urlStart + 8) === 'https://') break;
  }
  // 向后找 URL 结尾
  let urlEnd = pos;
  while (urlEnd < text.length) {
    const ch = text.charAt(urlEnd);
    if (ch === ' ' || ch === '\n' || ch === '\t') break;
    urlEnd++;
  }
  const rawUrl = text.slice(urlStart, urlEnd);
  if (/^https?:\/\//i.test(rawUrl)) {
    // 剥离末尾标点
    const cleanUrl = rawUrl.replace(/[\u3002.,;:!?\)\]\}'"]+$/g, '');
    return { type: 'url', url: cleanUrl };
  }

  return null;
}

// 编辑区 Ctrl+点击：打开链接或跳转笔记
function handleEditorCtrlClick(e) {
  if (!(e.ctrlKey || e.metaKey)) return;
  const pos = editor.selectionStart;
  const text = editor.value;
  const link = extractLinkAtCursor(text, pos);
  if (!link) return;

  e.preventDefault();
  if (link.type === 'url') {
    shell.openExternal(link.url);
  } else if (link.type === 'note') {
    const found = notes.find(function (n) { return (n.title || '').trim() === link.title; });
    if (found) {
      switchNote(found.id);
    }
  }
}

// ==================== 预览模式（[[笔记]] 链接跳转） ====================
let isPreviewMode = false;
const previewEl = document.getElementById('preview');
const btnTogglePreview = document.getElementById('btn-toggle-preview');

// 更新预览按钮文本
function updatePreviewBtnLabel() {
  if (!btnTogglePreview) return;
  btnTogglePreview.textContent = isPreviewMode ? (i18n.t('ui.edit') || '编辑') : (i18n.t('ui.preview') || '预览');
  btnTogglePreview.classList.toggle('active', isPreviewMode);
}

// 切换预览/编辑模式
function togglePreviewMode() {
  isPreviewMode = !isPreviewMode;
  if (isPreviewMode) {
    editor.style.display = 'none';
    previewEl.style.display = 'block';
    renderPreview();
  } else {
    editor.style.display = 'block';
    previewEl.style.display = 'none';
  }
  updatePreviewBtnLabel();
}

// 渲染预览内容：把 [[笔记标题]] 转成可点击链接
function renderPreview() {
  const content = editor.value || '';
  // 转义 HTML
  let html = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // 匹配 [[笔记标题]]，支持 [[标题|显示文本]]
  html = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function (match, target, display) {
    const noteTitle = target.trim();
    const linkText = (display || noteTitle).trim();
    const found = notes.find(function (n) { return (n.title || '').trim() === noteTitle; });
    if (found) {
      return '<a class="note-link" data-note-id="' + found.id + '" href="javascript:void(0)">' + linkText + '</a>';
    } else {
      return '<span class="note-link note-link-broken" title="未找到该笔记">' + linkText + '</span>';
    }
  });

  // 识别外部链接 http(s)://... 并渲染为可点击链接
  html = html.replace(/https?:\/\/[^\s<>"']+/gi, function (rawUrl) {
    // 剥离末尾常见标点（。.,;:!?)]}'" 等）
    let url = rawUrl.replace(/[\u3002.,;:!?\)\]\}'"]+$/g, '');
    // 还原 HTML 转义的 &（内容已被转义，& 变成了 &amp;）
    const displayUrl = url.replace(/&amp;/g, '&');
    return '<a class="external-link" href="' + displayUrl + '" target="_blank" rel="noopener">' + displayUrl + '</a>';
  });

  // 渲染反向链接（哪些笔记引用了当前笔记）
  const currentNote = notes.find(function (n) { return n.id === activeNoteId; });
  if (currentNote && currentNote.title) {
    const currentTitle = currentNote.title.trim();
    const backlinks = [];
    notes.forEach(function (n) {
      if (n.id === currentNote.id) return;
      // 检查该笔记内容中是否引用了当前笔记（支持 [[标题]] 和 [[标题|显示文本]]）
      const content = n.content || '';
      const pattern1 = '[[' + currentTitle + ']]';
      const pattern2 = '[[' + currentTitle + '|';
      if (content.indexOf(pattern1) !== -1 || content.indexOf(pattern2) !== -1) {
        backlinks.push(n);
      }
    });

    if (backlinks.length > 0) {
      html += '<hr class="backlinks-divider">';
      html += '<div class="backlinks-section">';
      html += '<div class="backlinks-title">' + (i18n.t('ui.backlinks') || '反向链接') + ' (' + backlinks.length + ')</div>';
      html += '<ul class="backlinks-list">';
      backlinks.forEach(function (bl) {
        html += '<li><a class="note-link" data-note-id="' + bl.id + '" href="javascript:void(0)">' + (bl.title || i18n.t('ui.untitled')) + '</a></li>';
      });
      html += '</ul>';
      html += '</div>';
    }
  }

  previewEl.innerHTML = html;

  // 绑定笔记内链点击事件（包括反向链接）
  previewEl.querySelectorAll('.note-link[data-note-id]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var noteId = link.getAttribute('data-note-id');
      if (noteId) {
        // 退出预览模式，然后切换笔记
        isPreviewMode = false;
        editor.style.display = 'block';
        previewEl.style.display = 'none';
        updatePreviewBtnLabel();
        switchNote(noteId);
      }
    });
  });

  // 绑定外部链接点击事件：用系统默认浏览器打开
  previewEl.querySelectorAll('.external-link').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var url = link.getAttribute('href');
      if (url) shell.openExternal(url);
    });
  });
}

// 绑定切换按钮
if (btnTogglePreview) {
  btnTogglePreview.addEventListener('click', togglePreviewMode);
}

// 初始化按钮文本
updatePreviewBtnLabel();

// ==================== 插入笔记链接（Ctrl+Alt+K） =====================
function openNoteLinkPicker() {
  // 移除已有弹窗
  var old = document.getElementById('note-link-picker');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = 'note-link-picker';
  modal.className = 'tag-modal-overlay';
  modal.innerHTML = '<div class="tag-modal"><div class="tag-modal-title">' +
    (i18n.t('ui.insertLink') || '插入笔记链接') + '</div>' +
    '<input type="text" id="link-search" placeholder="' + (i18n.t('ui.searchNotes') || '搜索笔记...') + '">' +
    '<div id="link-note-list"></div>' +
    '<div class="tag-modal-actions"><button id="link-cancel">' + i18n.t('ui.closeFind') + '</button></div></div>';
  document.body.appendChild(modal);

  var searchInput = document.getElementById('link-search');
  var listBox = document.getElementById('link-note-list');
  searchInput.focus();

  function renderList(query) {
    listBox.innerHTML = '';
    var q = (query || '').toLowerCase().trim();
    var matched = notes.filter(function (n) {
      if (!q) return true;
      return (n.title || '').toLowerCase().includes(q);
    });
    if (matched.length === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'padding:16px;color:var(--text-muted);text-align:center;font-size:13px;';
      empty.textContent = i18n.t('ui.tagEmpty') || '暂无笔记';
      listBox.appendChild(empty);
      return;
    }
    matched.forEach(function (note) {
      var item = document.createElement('div');
      item.className = 'link-note-item';
      item.textContent = note.title || (i18n.t('ui.untitled') + ' ' + (notes.indexOf(note) + 1));
      item.addEventListener('click', function () {
        insertNoteLink(note);
        close();
      });
      listBox.appendChild(item);
    });
  }

  function insertNoteLink(note) {
    var title = note.title || '';
    if (!title) return; // 标题为空的笔记无法被链接
    var linkText = '[[' + title + ']]';
    var start = editor.selectionStart;
    var end = editor.selectionEnd;
    editor.value = editor.value.slice(0, start) + linkText + editor.value.slice(end);
    var pos = start + linkText.length;
    editor.focus();
    editor.setSelectionRange(pos, pos);
    isModified = true;
    updateStatus();
  }

  function close() { modal.remove(); }

  searchInput.addEventListener('input', function () { renderList(searchInput.value); });
  document.getElementById('link-cancel').addEventListener('click', close);
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
  modal.addEventListener('click', function (e) {
    if (e.target === modal) close();
  });

  renderList();
}

// ==================== 编辑器右键菜单 ====================
editor.addEventListener('contextmenu', function (e) {
  e.preventDefault();
  showEditorContextMenu(e.clientX, e.clientY);
});

function showEditorContextMenu(x, y) {
  var old = document.getElementById('editor-context-menu');
  if (old) old.remove();

  var hasSelection = editor.selectionStart !== editor.selectionEnd;
  var selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd).trim();

  var menu = document.createElement('div');
  menu.id = 'editor-context-menu';
  menu.className = 'context-menu';

  var items = [
    { label: i18n.t('ui.insertLink'), action: function () { openNoteLinkPicker(); } },
    { label: i18n.t('ui.insertTime'), action: function () { insertCurrentTime(); } },
    { label: i18n.t('ui.newNoteFromSelection'), action: function () { createNoteFromSelection(selectedText); }, disabled: !hasSelection || !selectedText }
  ];

  items.forEach(function (item) {
    var div = document.createElement('div');
    div.className = 'context-menu-item';
    if (item.disabled) {
      div.style.opacity = '0.4';
      div.style.cursor = 'not-allowed';
    }
    div.textContent = item.label;
    if (!item.disabled) {
      div.addEventListener('click', function () {
        item.action();
        menu.remove();
      });
    }
    menu.appendChild(div);
  });

  document.body.appendChild(menu);

  // 防止菜单超出屏幕
  var rect = menu.getBoundingClientRect();
  if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
  if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  setTimeout(function () {
    document.addEventListener('click', closeMenu, { once: true });
    document.addEventListener('contextmenu', closeMenu, { once: true });
  }, 0);

  function closeMenu() { if (menu.parentNode) menu.remove(); }
}

function insertCurrentTime() {
  var now = new Date();
  var pad = function (n) { return n < 10 ? '0' + n : n; };
  var dateStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  var timeStr = pad(now.getHours()) + ':' + pad(now.getMinutes());
  var full = dateStr + ' ' + timeStr;
  var start = editor.selectionStart;
  var end = editor.selectionEnd;
  editor.value = editor.value.slice(0, start) + full + editor.value.slice(end);
  var pos = start + full.length;
  editor.focus();
  editor.setSelectionRange(pos, pos);
  isModified = true;
  updateStatus();
}

function createNoteFromSelection(text) {
  if (!text) return;
  // 弹出输入框让用户输入标题
  var oldModal = document.getElementById('note-title-modal');
  if (oldModal) oldModal.remove();

  var defaultTitle = text.slice(0, 30) + (text.length > 30 ? '...' : '');
  var modal = document.createElement('div');
  modal.id = 'note-title-modal';
  modal.className = 'tag-modal-overlay';
  modal.innerHTML = '<div class="tag-modal">' +
    '<div class="tag-modal-title">' + (i18n.t('ui.enterNoteTitle') || '输入新笔记标题') + '</div>' +
    '<input type="text" id="note-title-input" value="" placeholder="' + (i18n.t('ui.noteTitlePlaceholder') || '笔记标题') + '">' +
    '<div class="tag-modal-actions">' +
    '<button id="note-title-confirm">' + (i18n.t('menu.save') || '保存') + '</button>' +
    '<button id="note-title-cancel">' + (i18n.t('dialog.cancel') || '取消') + '</button>' +
    '</div></div>';
  document.body.appendChild(modal);

  var input = document.getElementById('note-title-input');
  input.focus();
  input.select();

  function confirm() {
    var title = input.value.trim();
    if (!title) { title = defaultTitle; }
    var newNote = createNoteObj();
    newNote.title = title;
    newNote.content = text;
    notes.unshift(newNote);
    saveNotes();
    // 从当前笔记中移除选中的文本
    var start = editor.selectionStart;
    var end = editor.selectionEnd;
    editor.value = editor.value.slice(0, start) + editor.value.slice(end);
    editor.focus();
    editor.setSelectionRange(start, start);
    isModified = true;
    updateStatus();
    renderNoteList();
    switchNote(newNote.id);
    modal.remove();
  }

  function cancel() { modal.remove(); }

  document.getElementById('note-title-confirm').addEventListener('click', confirm);
  document.getElementById('note-title-cancel').addEventListener('click', cancel);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') confirm();
    if (e.key === 'Escape') cancel();
  });
  modal.addEventListener('click', function (e) {
    if (e.target === modal) cancel();
  });
}