const { ipcRenderer } = require('electron');

const noteTitle = document.getElementById('note-title');
const versionCount = document.getElementById('version-count');
const noteCreated = document.getElementById('note-created');
const noteModified = document.getElementById('note-modified');
const timelineList = document.getElementById('timeline-list');
const previewTitle = document.getElementById('preview-title');
const previewActions = document.getElementById('preview-actions');
const versionContent = document.getElementById('version-content');
const previewStats = document.getElementById('preview-stats');
const statChars = document.getElementById('stat-chars');
const statLines = document.getElementById('stat-lines');
const statTime = document.getElementById('stat-time');
const btnCompareMode = document.getElementById('btn-compare-mode');
const btnRefresh = document.getElementById('btn-refresh');
const compareSelector = document.getElementById('compare-selector');
const versionASelect = document.getElementById('version-a-select');
const versionBSelect = document.getElementById('version-b-select');
const btnStartCompare = document.getElementById('btn-start-compare');
const compareView = document.getElementById('compare-view');
const mainContent = document.getElementById('main-content');
const btnExitCompare = document.getElementById('btn-exit-compare');
const btnRestoreVersion = document.getElementById('btn-restore-version');
const btnDeleteVersion = document.getElementById('btn-delete-version');

let currentNote = null;
let selectedVersionIndex = -1;
let isCompareMode = false;

function init() {
  ipcRenderer.send('request-note-data');
  
  btnCompareMode.addEventListener('click', toggleCompareMode);
  btnRefresh.addEventListener('click', refreshData);
  btnStartCompare.addEventListener('click', startCompare);
  btnExitCompare.addEventListener('click', exitCompare);
  btnRestoreVersion.addEventListener('click', restoreVersion);
  btnDeleteVersion.addEventListener('click', deleteVersion);
  
  // 监听语言切换事件
  ipcRenderer.on('language-changed', (event, lang) => {
    // 重新渲染历史窗口
    if (currentNote) {
      renderHeader();
      renderTimeline();
    }
  });
}

ipcRenderer.on('note-data-loaded', (event, noteData) => {
  currentNote = noteData;
  renderHeader();
  renderTimeline();
});

function renderHeader() {
  if (!currentNote) return;
  
  noteTitle.textContent = currentNote.title || '未命名';
  
  const history = currentNote.history || [];
  versionCount.textContent = `共 ${history.length} 个版本`;
  
  if (currentNote.createdAt) {
    const createdDate = new Date(currentNote.createdAt);
    noteCreated.textContent = `创建: ${formatDate(createdDate)}`;
  }
  
  if (currentNote.updatedAt) {
    const modifiedDate = new Date(currentNote.updatedAt);
    noteModified.textContent = `修改: ${formatDate(modifiedDate)}`;
  }
}

function renderTimeline() {
  if (!currentNote || !currentNote.history) return;
  
  timelineList.innerHTML = '';
  const history = currentNote.history.slice().reverse();
  
  history.forEach((item, reversedIndex) => {
    const index = history.length - 1 - reversedIndex;
    const timelineItem = createTimelineItem(item, index);
    timelineList.appendChild(timelineItem);
  });
}

function createTimelineItem(item, index) {
  const div = document.createElement('div');
  div.className = 'timeline-item';
  
  if (index === currentNote.historyIndex) {
    div.classList.add('current');
  }
  
  if (index === selectedVersionIndex) {
    div.classList.add('active');
  }
  
  const header = document.createElement('div');
  header.className = 'timeline-header';
  
  const versionSpan = document.createElement('span');
  versionSpan.className = 'timeline-version';
  versionSpan.textContent = `版本 ${index + 1}`;
  
  const badge = document.createElement('span');
  badge.className = `timeline-badge ${item.trigger}`;
  badge.textContent = getTriggerLabel(item.trigger);
  
  header.appendChild(versionSpan);
  header.appendChild(badge);
  
  const timeDiv = document.createElement('div');
  timeDiv.className = 'timeline-time';
  timeDiv.textContent = formatDate(new Date(item.timestamp));
  
  const previewDiv = document.createElement('div');
  previewDiv.className = 'timeline-preview';
  const preview = item.snapshot.substring(0, 50);
  previewDiv.textContent = preview + (item.snapshot.length > 50 ? '...' : '');
  
  div.appendChild(header);
  div.appendChild(timeDiv);
  div.appendChild(previewDiv);
  
  div.addEventListener('click', () => selectVersion(index));
  
  return div;
}

function selectVersion(index) {
  selectedVersionIndex = index;
  renderTimeline();
  showVersionPreview(index);
}

function showVersionPreview(index) {
  if (!currentNote || !currentNote.history[index]) return;
  
  const item = currentNote.history[index];
  previewTitle.textContent = `版本 ${index + 1}`;
  previewActions.classList.remove('hidden');
  
  versionContent.textContent = item.snapshot;
  
  statChars.textContent = `${item.snapshot.length} 字符`;
  statLines.textContent = `${item.snapshot.split('\n').length} 行`;
  statTime.textContent = formatDate(new Date(item.timestamp));
  
  previewStats.classList.remove('hidden');
}

function toggleCompareMode() {
  isCompareMode = !isCompareMode;
  
  if (isCompareMode) {
    compareSelector.classList.remove('hidden');
    mainContent.classList.add('hidden');
    populateCompareSelects();
  } else {
    compareSelector.classList.add('hidden');
    mainContent.classList.remove('hidden');
  }
}

function populateCompareSelects() {
  if (!currentNote || !currentNote.history) return;
  
  versionASelect.innerHTML = '';
  versionBSelect.innerHTML = '';
  
  currentNote.history.forEach((item, index) => {
    const optionA = document.createElement('option');
    optionA.value = index;
    optionA.textContent = `版本 ${index + 1} - ${formatDate(new Date(item.timestamp))}`;
    versionASelect.appendChild(optionA);
    
    const optionB = document.createElement('option');
    optionB.value = index;
    optionB.textContent = `版本 ${index + 1} - ${formatDate(new Date(item.timestamp))}`;
    versionBSelect.appendChild(optionB);
  });
  
  if (currentNote.history.length >= 2) {
    versionASelect.value = currentNote.history.length - 2;
    versionBSelect.value = currentNote.history.length - 1;
  }
}

function startCompare() {
  const indexA = parseInt(versionASelect.value);
  const indexB = parseInt(versionBSelect.value);
  
  if (indexA === indexB) {
    alert('请选择不同的版本进行对比');
    return;
  }
  
  const versionA = currentNote.history[indexA];
  const versionB = currentNote.history[indexB];
  
  document.getElementById('compare-title-a').textContent = 
    `版本 ${indexA + 1} - ${formatDate(new Date(versionA.timestamp))}`;
  document.getElementById('compare-title-b').textContent = 
    `版本 ${indexB + 1} - ${formatDate(new Date(versionB.timestamp))}`;
  
  document.getElementById('compare-content-a').textContent = versionA.snapshot;
  document.getElementById('compare-content-b').textContent = versionB.snapshot;
  
  calculateDiff(versionA.snapshot, versionB.snapshot);
  
  compareView.classList.remove('hidden');
  compareSelector.classList.add('hidden');
}

function calculateDiff(textA, textB) {
  const linesA = textA.split('\n');
  const linesB = textB.split('\n');
  
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  
  const maxLines = Math.max(linesA.length, linesB.length);
  
  for (let i = 0; i < maxLines; i++) {
    const lineA = linesA[i] || '';
    const lineB = linesB[i] || '';
    
    if (lineA === lineB) {
      unchanged++;
    } else {
      if (lineA) removed++;
      if (lineB) added++;
    }
  }
  
  const diffStats = document.getElementById('diff-stats');
  diffStats.innerHTML = `
    <span class="diff-added">+ ${added} 行新增</span>
    <span class="diff-removed">- ${removed} 行删除</span>
    <span class="diff-unchanged">= ${unchanged} 行未变</span>
  `;
  
  document.getElementById('diff-summary').classList.remove('hidden');
}

function exitCompare() {
  compareView.classList.add('hidden');
  compareSelector.classList.remove('hidden');
}

function restoreVersion() {
  if (selectedVersionIndex === -1 || !currentNote) return;
  
  const confirmed = confirm(`确定要恢复到版本 ${selectedVersionIndex + 1} 吗？\n当前内容将被替换。`);
  if (!confirmed) return;
  
  const snapshot = currentNote.history[selectedVersionIndex].snapshot;
  
  ipcRenderer.send('restore-note-version', {
    noteId: currentNote.id,
    snapshotContent: snapshot
  });
  
  alert('已恢复到选定版本！');
}

function deleteVersion() {
  if (selectedVersionIndex === -1 || !currentNote) return;
  
  const confirmed = confirm(`确定要删除版本 ${selectedVersionIndex + 1} 吗？\n此操作不可撤销。`);
  if (!confirmed) return;
  
  ipcRenderer.send('delete-history-version', {
    noteId: currentNote.id,
    historyIndex: selectedVersionIndex
  });
  
  selectedVersionIndex = -1;
  refreshData();
}

function refreshData() {
  ipcRenderer.send('request-note-data');
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function getTriggerLabel(trigger) {
  const labels = {
    'manual': '手动',
    'auto': '自动',
    'save': '保存'
  };
  return labels[trigger] || trigger;
}

init();