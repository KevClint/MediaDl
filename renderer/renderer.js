let queue = [];
let downloadFolder = '';
let idCounter = 0;
const MAX_CONCURRENT_DOWNLOADS = 2;
let activeDownloads = 0;

const STATE_STORAGE_KEY = 'mediadl.queue.v1';
const QUEUEABLE_STATUSES = new Set(['queued', 'failed', 'canceled']);
const RUNNING_STATUSES = new Set(['fetching', 'downloading', 'processing']);

const cardRefs = new Map();
const cancelRequested = new Set();

const urlInput = document.getElementById('url-input');
const folderDisplay = document.getElementById('folder-display');
const resGroup = document.getElementById('res-group');
const resSelect = document.getElementById('res-select');
const queueEl = document.getElementById('queue');
const emptyState = document.getElementById('empty-state');

document.querySelectorAll('input[name="fmt"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    resGroup.hidden = getFormat() === 'mp3';
  });
});

function getFormat() {
  return document.querySelector('input[name="fmt"]:checked').value;
}

function buildQueueKey(url, format, resolution, outputFolder) {
  return `${url}::${format}::${resolution || ''}::${outputFolder}`;
}

function statusLabel(status) {
  if (status === 'completed') return 'complete';
  if (status === 'failed') return 'failed';
  if (status === 'canceled') return 'canceled';
  if (status === 'fetching') return 'fetching info...';
  if (status === 'processing') return 'processing...';
  return status;
}

function createNode(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Returns inline SVG string for a given hostname (site icon). */
function getSiteIconSvg(hostname) {
  if (!hostname) return getSiteIconSvg('default');
  const h = hostname.toLowerCase();
  if (h.includes('youtube') || h.includes('youtu.be')) {
    return '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
  }
  if (h.includes('tiktok')) {
    return '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>';
  }
  if (h.includes('facebook') || h.includes('fb.')) {
    return '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>';
  }
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
}

/** Show a toast notification (e.g. "Download complete"). */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = createNode('div', `toast ${type}`);
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  container.appendChild(toast);
  const duration = 3500;
  setTimeout(() => {
    toast.style.animation = 'toast-in 0.2s ease reverse forwards';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

function normalizedPercent(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return 0;
  if (safe < 0) return 0;
  if (safe > 100) return 100;
  return safe;
}

function stateForStorage(job) {
  return {
    id: job.id,
    url: job.url,
    format: job.format,
    resolution: job.resolution,
    outputFolder: job.outputFolder,
    outputFilePath: job.outputFilePath || '',
    status: job.status,
    percent: normalizedPercent(job.percent),
    fileSize: job.fileSize || '',
    title: job.title || '',
    error: job.error || '',
  };
}

function saveState() {
  const state = queue.map((job) => stateForStorage(job));
  localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
}

async function saveFolder() {
  if (!downloadFolder) return;
  const result = await window.electronAPI.setDownloadFolder(downloadFolder);
  if (!result || !result.success) {
    console.warn('Could not persist download folder setting.');
  }
}

async function restoreState() {
  const savedFolder = await window.electronAPI.getDownloadFolder();
  if (savedFolder) {
    downloadFolder = savedFolder;
    folderDisplay.value = savedFolder;
  }
  const settings = await window.electronAPI.getSettings();
  if (settings.defaultQuality) {
    resSelect.value = settings.defaultQuality;
  }
  if (settings.defaultFormat) {
    const radio = document.querySelector(`input[name="fmt"][value="${settings.defaultFormat}"]`);
    if (radio) radio.checked = true;
    resGroup.hidden = settings.defaultFormat === 'mp3';
  }

  const raw = localStorage.getItem(STATE_STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    parsed.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      if (!Number.isInteger(item.id) || item.id < 1) return;
      if (typeof item.url !== 'string' || !item.url) return;
      if (item.format !== 'mp3' && item.format !== 'mp4') return;
      if (typeof item.outputFolder !== 'string' || !item.outputFolder) return;

      const wasRunning = RUNNING_STATUSES.has(item.status);
      const job = {
        id: item.id,
        url: item.url,
        format: item.format,
        resolution: item.format === 'mp4' ? String(item.resolution || '720') : null,
        outputFolder: item.outputFolder,
        outputFilePath: item.outputFilePath || '',
        status: wasRunning ? 'queued' : (item.status || 'queued'),
        percent: wasRunning ? 0 : normalizedPercent(item.percent),
        fileSize: wasRunning ? '' : (item.fileSize || ''),
        title: item.title || '',
        error: wasRunning ? 'Restored after restart. Start again to continue.' : (item.error || ''),
      };

      queue.push(job);
      if (job.id > idCounter) idCounter = job.id;
      renderCard(job);
    });
    syncEmptyState();
  } catch {
    localStorage.removeItem(STATE_STORAGE_KEY);
  }
}

document.getElementById('btn-min').onclick = () => window.electronAPI.minimizeWindow();
document.getElementById('btn-max').onclick = () => window.electronAPI.maximizeWindow();
document.getElementById('btn-close').onclick = () => window.electronAPI.closeWindow();

// ── Sidebar view switching ──
const VIEW_IDS = ['view-home', 'view-downloads', 'view-settings', 'view-tools'];
function switchView(viewId) {
  VIEW_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === viewId) {
      el.classList.remove('view-hidden');
    } else {
      el.classList.add('view-hidden');
    }
  });
  document.querySelectorAll('.sidebar-nav-item').forEach((btn) => {
    const v = btn.getAttribute('data-view');
    const targetId = 'view-' + v;
    btn.classList.toggle('active', targetId === viewId);
  });
  if (viewId === 'view-downloads') renderDownloadsManager();
  if (viewId === 'view-settings') loadSettingsForm();
}

document.querySelectorAll('.sidebar-nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.getAttribute('data-view');
    if (view) switchView('view-' + view);
  });
});

// ── Media Tools ──
let toolsSelectedPath = '';
let toolsLastOutputPath = '';

const toolsDropZone = document.getElementById('tools-drop-zone');
const toolsSelectedFileEl = document.getElementById('tools-selected-file');
const toolsStatusBar = document.getElementById('tools-status-bar');
const toolsStatusPercent = document.getElementById('tools-status-percent');
const toolsProgressFill = document.getElementById('tools-progress-fill');
const toolsStatusDone = document.getElementById('tools-status-done');
const btnToolsShowFolder = document.getElementById('btn-tools-show-folder');

function setToolsProcessing(processing) {
  toolsStatusDone.hidden = true;
  toolsStatusBar.hidden = !processing;
  if (processing) {
    toolsStatusPercent.textContent = '0%';
    toolsProgressFill.style.width = '0%';
  }
}

function setToolsProgress(percent) {
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  toolsStatusPercent.textContent = p + '%';
  toolsProgressFill.style.width = p + '%';
}

function setToolsComplete(outputPath) {
  toolsLastOutputPath = outputPath || '';
  toolsStatusBar.hidden = true;
  toolsStatusDone.hidden = false;
  setToolsProgress(100);
}

window.electronAPI.onMediaToolsProgress((data) => {
  setToolsProgress(data.percent);
  if (data.percent >= 100 && data.outputPath) {
    setToolsComplete(data.outputPath);
  }
});

function toolsPickFile() {
  return window.electronAPI.selectMediaFile().then((path) => {
    if (path) {
      toolsSelectedPath = path;
      toolsSelectedFileEl.textContent = path.replace(/^.*[\\/]/, '');
      toolsSelectedFileEl.classList.remove('muted');
    }
  });
}

toolsDropZone.addEventListener('click', () => void toolsPickFile());
toolsDropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    void toolsPickFile();
  }
});

toolsDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  toolsDropZone.classList.add('drag-over');
});

toolsDropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  toolsDropZone.classList.remove('drag-over');
});

toolsDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  toolsDropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file && file.path) {
    toolsSelectedPath = file.path;
    toolsSelectedFileEl.textContent = file.name;
    toolsSelectedFileEl.classList.remove('muted');
  }
});

async function runTool(invoker, opts) {
  if (!toolsSelectedPath) {
    showToast('Select a file first (click drop zone or browse)', 'error');
    return;
  }
  setToolsProcessing(true);
  try {
    const result = await invoker(opts);
    if (result && result.success && result.outputPath) {
      setToolsComplete(result.outputPath);
      showToast('Processing complete', 'success');
    }
  } catch (err) {
    setToolsProcessing(false);
    showToast(err && err.message ? err.message : 'Processing failed', 'error');
  }
}

document.getElementById('btn-tools-convert').addEventListener('click', () => {
  const format = document.getElementById('tools-format').value;
  runTool(window.electronAPI.mediaToolsConvert, { inputPath: toolsSelectedPath, format });
});

document.getElementById('btn-tools-compress').addEventListener('click', () => {
  const quality = document.querySelector('input[name="tools-compress"]:checked').value;
  runTool(window.electronAPI.mediaToolsCompress, { inputPath: toolsSelectedPath, quality });
});

document.getElementById('btn-tools-extract').addEventListener('click', () => {
  runTool(window.electronAPI.mediaToolsExtractAudio, { inputPath: toolsSelectedPath });
});

btnToolsShowFolder.addEventListener('click', () => {
  if (toolsLastOutputPath) {
    window.electronAPI.showItemInFolder(toolsLastOutputPath);
  }
});

// ── Downloads Manager ──
const downloadsListEl = document.getElementById('downloads-list');
const downloadsEmptyEl = document.getElementById('downloads-empty');

function renderDownloadsManager() {
  const completed = queue.filter((j) => j.status === 'completed');
  downloadsListEl.innerHTML = '';
  if (completed.length === 0) {
    downloadsEmptyEl.hidden = false;
    return;
  }
  downloadsEmptyEl.hidden = true;
  completed.forEach((job) => {
    const item = createNode('div', 'completed-item');
    item.dataset.jobId = String(job.id);

    let thumbEl;
    if (job.thumbnailUrl) {
      const img = document.createElement('img');
      img.className = 'completed-item-thumb';
      img.src = job.thumbnailUrl;
      img.alt = '';
      thumbEl = img;
    } else {
      const placeholder = createNode('div', 'completed-item-thumb-placeholder');
      placeholder.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>';
      thumbEl = placeholder;
    }

    const info = createNode('div', 'completed-item-info');
    const title = createNode('div', 'completed-item-title', job.title || 'Unknown');
    info.appendChild(title);

    const actions = createNode('div', 'completed-item-actions');
    const btnOpen = createNode('button', 'btn-secondary', 'Open Folder');
    const btnPlay = createNode('button', 'btn-secondary', 'Play Video');
    const btnRemove = createNode('button', 'btn-secondary', 'Remove');
    btnOpen.type = btnPlay.type = btnRemove.type = 'button';
    btnOpen.onclick = () => window.electronAPI.openFolder(job.outputFolder);
    btnPlay.onclick = () => {
      if (job.outputFilePath) {
        window.electronAPI.playFile(job.outputFilePath);
      } else {
        window.electronAPI.openFolder(job.outputFolder);
      }
    };
    btnRemove.onclick = () => removeCompletedFromList(job.id);
    actions.appendChild(btnOpen);
    actions.appendChild(btnPlay);
    actions.appendChild(btnRemove);

    item.appendChild(thumbEl);
    item.appendChild(info);
    item.appendChild(actions);
    downloadsListEl.appendChild(item);
  });
}

function removeCompletedFromList(jobId) {
  queue = queue.filter((j) => j.id !== jobId);
  const card = document.getElementById('card-' + jobId);
  if (card) card.remove();
  cardRefs.delete(jobId);
  renderDownloadsManager();
  syncEmptyState();
  saveState();
}

document.getElementById('btn-paste').onclick = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) urlInput.value = text;
  } catch (_) {
    showToast('Could not read clipboard', 'error');
  }
};

document.getElementById('btn-browse').onclick = async () => {
  const folder = await window.electronAPI.selectFolder();
  if (folder) {
    downloadFolder = folder;
    folderDisplay.value = folder;
    await saveFolder();
  }
};

// ── Settings ──
const settingsFolderEl = document.getElementById('settings-folder');
const settingsDefaultQualityEl = document.getElementById('settings-default-quality');
const settingsDefaultFormatEl = document.getElementById('settings-default-format');

async function loadSettingsForm() {
  const s = await window.electronAPI.getSettings();
  settingsFolderEl.value = s.downloadFolder || '';
  if (s.defaultQuality) settingsDefaultQualityEl.value = s.defaultQuality;
  if (s.defaultFormat) settingsDefaultFormatEl.value = s.defaultFormat;
}

document.getElementById('btn-settings-browse').onclick = async () => {
  const folder = await window.electronAPI.selectFolder();
  if (folder) {
    await window.electronAPI.setSettings({ downloadFolder: folder });
    settingsFolderEl.value = folder;
    downloadFolder = folder;
    folderDisplay.value = folder;
    await saveFolder();
  }
};

settingsDefaultQualityEl.addEventListener('change', async () => {
  const val = settingsDefaultQualityEl.value;
  await window.electronAPI.setSettings({ defaultQuality: val });
  resSelect.value = val;
});

settingsDefaultFormatEl.addEventListener('change', async () => {
  const val = settingsDefaultFormatEl.value;
  await window.electronAPI.setSettings({ defaultFormat: val });
  const radio = document.querySelector(`input[name="fmt"][value="${val}"]`);
  if (radio) radio.checked = true;
  resGroup.hidden = val === 'mp3';
});

document.getElementById('btn-update-ytdlp').onclick = async () => {
  const btn = document.getElementById('btn-update-ytdlp');
  btn.disabled = true;
  btn.textContent = 'Updating…';
  const result = await window.electronAPI.updateYtDlp();
  btn.disabled = false;
  btn.textContent = 'Update yt-dlp';
  if (result && result.success) {
    showToast('yt-dlp updated successfully', 'success');
  } else {
    showToast(result && result.message ? result.message : 'Update failed', 'error');
  }
};

document.getElementById('btn-add').onclick = () => {
  if (!downloadFolder) {
    alert('Please select a download folder first.');
    return;
  }

  const urls = urlInput.value
    .split('\n')
    .map((u) => u.trim())
    .filter((u) => u.length > 0);

  if (urls.length === 0) {
    alert('Please paste at least one URL.');
    return;
  }

  const valid = [];
  const invalid = [];
  urls.forEach((u) => {
    try {
      const parsed = new URL(u);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        valid.push(u);
      } else {
        invalid.push(u);
      }
    } catch {
      invalid.push(u);
    }
  });

  if (invalid.length > 0) {
    const proceed = confirm(
      `${invalid.length} invalid URL(s) will be skipped. Continue with ${valid.length} valid URL(s)?`
    );
    if (!proceed) return;
  }

  if (valid.length === 0) {
    alert('No valid URLs found.');
    return;
  }

  const format = getFormat();
  const resolution = format === 'mp4' ? resSelect.value : null;
  const existingKeys = new Set(
    queue.map((job) => buildQueueKey(job.url, job.format, job.resolution, job.outputFolder))
  );
  const pendingKeys = new Set();

  let duplicateCount = 0;
  valid.forEach((url) => {
    const key = buildQueueKey(url, format, resolution, downloadFolder);
    if (existingKeys.has(key) || pendingKeys.has(key)) {
      duplicateCount += 1;
      return;
    }

    pendingKeys.add(key);
    const job = {
      id: ++idCounter,
      url,
      format,
      resolution,
      outputFolder: downloadFolder,
      status: 'queued',
      percent: 0,
      fileSize: '',
      title: '',
      error: '',
    };
    queue.push(job);
    renderCard(job);
  });

  if (duplicateCount > 0) {
    alert(`${duplicateCount} duplicate URL(s) were skipped.`);
  }

  urlInput.value = '';
  syncEmptyState();
  saveState();
};

document.getElementById('btn-start-all').onclick = () => {
  const queued = queue.filter((job) => job.status === 'queued');
  if (queued.length === 0) {
    alert('No queued downloads to start.');
    return;
  }
  scheduleDownloads();
};

document.getElementById('btn-clear').onclick = () => {
  queue = queue.filter(
    (job) => job.status !== 'completed' && job.status !== 'failed' && job.status !== 'canceled'
  );
  rebuildQueue();
  saveState();
};

function scheduleDownloads() {
  while (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
    const nextJob = queue.find((job) => job.status === 'queued');
    if (!nextJob) break;
    void runDownload(nextJob);
  }
}

async function runDownload(job) {
  if (job.status !== 'queued') return;
  activeDownloads += 1;
  cancelRequested.delete(job.id);

  updateJob(job.id, { status: 'fetching', error: '' });
  try {
    const info = await window.electronAPI.fetchFormats(job.url);
    updateJob(job.id, { title: info.title || '' });
  } catch {
    updateJob(job.id, { title: job.url });
  }

  if (cancelRequested.has(job.id)) {
    cancelRequested.delete(job.id);
    updateJob(job.id, {
      status: 'canceled',
      percent: 0,
      fileSize: '',
      error: 'Download canceled by user.',
    });
    activeDownloads = Math.max(0, activeDownloads - 1);
    saveState();
    scheduleDownloads();
    return;
  }

  updateJob(job.id, { status: 'downloading' });
  try {
    await window.electronAPI.startDownload({
      url: job.url,
      outputFolder: job.outputFolder,
      format: job.format,
      resolution: job.resolution,
      downloadId: job.id,
    });
  } catch (error) {
    updateJob(job.id, {
      status: 'failed',
      error: friendlyError(error && error.message),
    });
  } finally {
    activeDownloads = Math.max(0, activeDownloads - 1);
    saveState();
    scheduleDownloads();
  }
}

window.electronAPI.onDownloadProgress((data) => {
  const updates = {
    percent: data.percent ?? 0,
    fileSize: data.fileSize ?? '',
    status: data.status,
    error: data.error ?? '',
  };
  if (data.outputFilePath) updates.outputFilePath = data.outputFilePath;
  updateJob(data.downloadId, updates);
});

function updateJob(id, changes) {
  const job = queue.find((item) => item.id === id);
  if (!job) return;

  Object.assign(job, changes);
  refreshCard(job);
  saveState();
}

/**
 * Creates a professional download card and appends it to the queue.
 * @param {Object} data - Job data: { id, url, title, status, percent, fileSize, format, resolution, error, thumbnailUrl? }
 */
function createDownloadCard(data) {
  emptyState.hidden = true;

  const job = data;
  const card = createNode('div', `download-card ${job.status}`);
  card.id = `card-${job.id}`;
  card.dataset.prevStatus = job.status;

  let hostname = '';
  try {
    hostname = new URL(job.url).hostname;
  } catch (_) {}

  let thumbnailEl;
  if (job.thumbnailUrl) {
    const img = document.createElement('img');
    img.className = 'card-thumbnail';
    img.src = job.thumbnailUrl;
    img.alt = '';
    img.loading = 'lazy';
    thumbnailEl = img;
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'card-thumbnail';
    placeholder.setAttribute('role', 'img');
    placeholder.setAttribute('aria-label', 'Video thumbnail');
    placeholder.style.background = 'var(--color-surface-elevated)';
    placeholder.style.display = 'flex';
    placeholder.style.alignItems = 'center';
    placeholder.style.justifyContent = 'center';
    placeholder.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 9l5 3-5 3V9z"/></svg>';
    thumbnailEl = placeholder;
  }

  const body = createNode('div', 'card-body');
  const header = createNode('div', 'card-header');
  const titleGroup = createNode('div', 'card-title-group');
  const titleEl = createNode('div', 'card-title', job.title || 'Fetching title...');
  const siteIconWrap = createNode('span', 'card-site-icon');
  siteIconWrap.innerHTML = getSiteIconSvg(hostname);
  const badge = createNode('span', `badge badge-${job.status}`, statusLabel(job.status));
  titleGroup.appendChild(titleEl);
  titleGroup.appendChild(siteIconWrap);
  header.appendChild(titleGroup);
  header.appendChild(badge);

  const formatText = job.format === 'mp3'
    ? 'MP3'
    : `MP4 ${job.resolution ? `${job.resolution}p` : ''}`.trim();
  const meta = createNode('div', 'card-meta');
  const formatSpan = createNode('span', '', formatText);
  const fileSizeSpan = createNode('span', 'mono', job.fileSize || '—');
  meta.appendChild(formatSpan);
  meta.appendChild(fileSizeSpan);

  body.appendChild(header);
  body.appendChild(meta);

  const progressWrap = createNode('div', 'card-progress-wrap');
  const progressTrack = createNode('div', 'progress-track');
  const progressFill = createNode('div', 'progress-fill');
  progressFill.style.width = `${normalizedPercent(job.percent)}%`;
  progressTrack.appendChild(progressFill);
  progressWrap.appendChild(progressTrack);

  const actions = createNode('div', 'card-actions');
  const cancelBtn = createNode('button', 'btn-secondary', 'Cancel');
  const retryBtn = createNode('button', 'btn-secondary', 'Retry');
  cancelBtn.type = 'button';
  retryBtn.type = 'button';
  cancelBtn.onclick = () => void onCancel(job.id);
  retryBtn.onclick = () => onRetry(job.id);
  actions.appendChild(cancelBtn);
  actions.appendChild(retryBtn);

  const errorEl = createNode('div', 'card-error', '');
  errorEl.hidden = true;

  card.appendChild(thumbnailEl);
  card.appendChild(body);
  card.appendChild(progressWrap);
  card.appendChild(actions);
  card.appendChild(errorEl);

  queueEl.appendChild(card);

  cardRefs.set(job.id, {
    card,
    titleEl,
    siteIconWrap,
    badge,
    formatSpan,
    fileSizeSpan,
    progressFill,
    actions,
    cancelBtn,
    retryBtn,
    errorEl,
  });

  refreshCard(job);
}

function renderCard(job) {
  createDownloadCard(job);
}

function refreshCard(job) {
  const refs = cardRefs.get(job.id);
  if (!refs) return;

  const percent = normalizedPercent(job.percent);
  const prevStatus = refs.card.dataset.prevStatus || '';
  refs.card.dataset.prevStatus = job.status;

  refs.card.className = `download-card ${job.status}`;
  refs.badge.className = `badge badge-${job.status}`;
  refs.badge.textContent = statusLabel(job.status);
  refs.titleEl.textContent = job.title || 'Fetching title...';
  refs.fileSizeSpan.textContent = job.fileSize || '—';
  refs.fileSizeSpan.className = 'mono';
  refs.progressFill.style.width = `${percent}%`;

  const formatText = job.format === 'mp3'
    ? 'MP3'
    : `MP4 ${job.resolution ? `${job.resolution}p` : ''}`.trim();
  refs.formatSpan.textContent = formatText;

  const canCancel = job.status === 'queued' || RUNNING_STATUSES.has(job.status);
  const canRetry = job.status === 'failed' || job.status === 'canceled';
  refs.actions.hidden = !(canCancel || canRetry);
  refs.cancelBtn.hidden = !canCancel;
  refs.retryBtn.hidden = !canRetry;

  if (job.error) {
    refs.errorEl.textContent = job.error;
    refs.errorEl.hidden = false;
  } else {
    refs.errorEl.textContent = '';
    refs.errorEl.hidden = true;
  }

  if (job.status === 'completed' && prevStatus !== 'completed') {
    showToast('Download complete', 'success');
  }
}

async function onCancel(jobId) {
  const job = queue.find((item) => item.id === jobId);
  if (!job) return;

  if (job.status === 'queued') {
    updateJob(jobId, {
      status: 'canceled',
      percent: 0,
      fileSize: '',
      error: 'Download canceled by user.',
    });
    return;
  }

  if (job.status === 'fetching') {
    cancelRequested.add(jobId);
    updateJob(jobId, { error: 'Cancel requested...' });
    return;
  }

  if (!RUNNING_STATUSES.has(job.status)) return;

  const result = await window.electronAPI.cancelDownload(jobId);
  if (!result || !result.success) {
    updateJob(jobId, { error: result && result.message ? result.message : 'Failed to cancel download.' });
  }
}

function onRetry(jobId) {
  const job = queue.find((item) => item.id === jobId);
  if (!job) return;
  if (!QUEUEABLE_STATUSES.has(job.status)) return;

  cancelRequested.delete(job.id);
  updateJob(job.id, {
    status: 'queued',
    percent: 0,
    fileSize: '',
    error: '',
  });
  scheduleDownloads();
}

function rebuildQueue() {
  cardRefs.clear();
  queueEl.innerHTML = '';
  queueEl.appendChild(emptyState);
  queue.forEach((job) => renderCard(job));
  syncEmptyState();
}

function syncEmptyState() {
  emptyState.hidden = queue.length !== 0;
}

function progressText(job) {
  if (job.status === 'completed') return 'Complete';
  if (job.status === 'failed') return 'Failed';
  if (job.status === 'canceled') return 'Canceled';
  if (job.status === 'fetching') return 'Fetching info...';
  if (job.status === 'processing') return 'Processing...';
  return `${normalizedPercent(job.percent).toFixed(1)}%`;
}

function trailingPercent(percent, status) {
  if (status !== 'downloading') return '';
  const safe = normalizedPercent(percent);
  if (safe <= 0 || safe >= 100) return '';
  return `${safe.toFixed(1)}%`;
}

function friendlyError(message) {
  if (!message) return 'Unknown error occurred.';

  if (message.includes('canceled')) return 'Download canceled by user.';
  if (message.includes('Private video')) return 'This video is private.';
  if (message.includes('unavailable')) return 'Video is unavailable or has been removed.';
  if (message.includes('Sign in')) return 'This content requires login to access.';
  if (message.includes('ETIMEDOUT')) return 'Connection timed out. Check your internet.';
  if (message.includes('ENOTFOUND')) return 'Network error. Check your internet connection.';
  if (message.includes('Unsupported URL')) return 'This URL or site is not supported.';
  if (message.includes('timed out')) return 'Download timed out after 10 minutes.';
  if (message.includes('429')) return 'Too many requests. Please wait and try again.';
  return 'Download failed. The video may be unavailable.';
}

void restoreState().finally(() => {
  saveState();
});
