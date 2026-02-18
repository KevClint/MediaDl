let queue = [];
let downloadFolder = '';
let idCounter = 0;
const MAX_CONCURRENT_DOWNLOADS = 2;
let activeDownloads = 0;

const STATE_STORAGE_KEY = 'mediadl.queue.v1';
const OPTIONS_VISIBILITY_STORAGE_KEY = 'mediadl.home.optionsCollapsed.v1';
const QUEUEABLE_STATUSES = new Set(['queued', 'failed', 'canceled']);
const RUNNING_STATUSES = new Set(['fetching', 'downloading', 'processing']);

const cardRefs = new Map();
const cancelRequested = new Set();

const urlInput = document.getElementById('url-input');
const commandBar = document.getElementById('command-bar');
const btnClearInput = document.getElementById('btn-clear-input');
const btnClearDone = document.getElementById('btn-clear-done');
const urlErrorEl = document.getElementById('url-error');
const folderDisplay = document.getElementById('folder-display');
const resGroup = document.getElementById('res-group');
const resSelect = document.getElementById('res-select');
const bitrateGroup = document.getElementById('bitrate-group');
const mp3BitrateSelect = document.getElementById('mp3-bitrate-select');
const openFolderFinishedToggle = document.getElementById('opt-open-folder-finished');
const downloadSubtitlesToggle = document.getElementById('opt-download-subtitles');
const optionsGrid = document.getElementById('home-options-grid');
const btnToggleOptions = document.getElementById('btn-toggle-options');
const queueEl = document.getElementById('queue');
const emptyState = document.getElementById('empty-state');
const autoOpenedFolders = new Set();

function getFormat() {
  return document.querySelector('input[name="fmt"]:checked').value;
}

function getMp3Bitrate() {
  const raw = String(mp3BitrateSelect ? mp3BitrateSelect.value : '192');
  if (raw === '128' || raw === '192' || raw === '320') return raw;
  return '192';
}

function syncFormatOptionVisibility() {
  const isMp3 = getFormat() === 'mp3';
  resGroup.hidden = isMp3;
  if (bitrateGroup) bitrateGroup.hidden = !isMp3;
}

function isOptionsCollapsedStored() {
  try {
    return localStorage.getItem(OPTIONS_VISIBILITY_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function setOptionsCollapsed(collapsed, persist = true) {
  if (!optionsGrid || !btnToggleOptions) return;
  optionsGrid.hidden = collapsed;
  btnToggleOptions.classList.toggle('is-collapsed', collapsed);
  btnToggleOptions.setAttribute('aria-expanded', String(!collapsed));
  if (!persist) return;
  try {
    localStorage.setItem(OPTIONS_VISIBILITY_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {}
}

document.querySelectorAll('input[name="fmt"]').forEach((radio) => {
  radio.addEventListener('change', syncFormatOptionVisibility);
});
if (btnToggleOptions) {
  btnToggleOptions.addEventListener('click', () => {
    const collapsed = !btnToggleOptions.classList.contains('is-collapsed');
    setOptionsCollapsed(collapsed, true);
  });
}

function initInfoTipPopovers() {
  const wraps = Array.from(document.querySelectorAll('.info-tip-wrap'));
  if (wraps.length === 0) return;

  const closeAll = () => {
    wraps.forEach((wrap) => {
      const popover = wrap.querySelector('.info-tip-popover');
      if (popover) popover.hidden = true;
    });
  };

  wraps.forEach((wrap) => {
    const trigger = wrap.querySelector('.info-tip-trigger');
    const popover = wrap.querySelector('.info-tip-popover');
    const closeBtn = wrap.querySelector('.info-tip-close');
    if (!trigger || !popover) return;

    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = popover.hidden;
      closeAll();
      popover.hidden = !willOpen;
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        popover.hidden = true;
      });
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.info-tip-wrap')) return;
    closeAll();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAll();
  });
}

function buildQueueKey(url, format, resolution, outputFolder, mp3Bitrate, downloadSubtitles) {
  return `${url}::${format}::${resolution || ''}::${mp3Bitrate || ''}::${outputFolder}::${downloadSubtitles ? 'subs' : 'nosubs'}`;
}

function getFormatLabel(job) {
  if (job.format === 'mp3') {
    return `MP3 ${String(job.mp3Bitrate || '192')} kbps`;
  }
  return `MP4 ${job.resolution ? `${job.resolution}p` : ''}`.trim();
}

function getCompletedMetaLine(job, siteName) {
  const site = siteName && siteName !== 'none' ? siteName : 'Unknown';
  if (job.format === 'mp3') {
    return `${site} • MP3 • ${String(job.mp3Bitrate || '192')} kbps`;
  }
  if (job.format === 'mp4') {
    return `${site} • MP4 • ${job.resolution ? `${job.resolution}p` : 'Auto'}`;
  }
  return `${site} • ${(job.format || 'FILE').toUpperCase()}`;
}

function getSubtitleLabel(job) {
  if (!job.downloadSubtitles) return '';
  if (job.status === 'completed') return 'Subtitles: Downloaded';
  if (job.status === 'downloading' || job.status === 'processing') return 'Subtitles: Downloading';
  return 'Subtitles: Enabled';
}

function getCardTitle(job) {
  if (job.title && String(job.title).trim()) return job.title;
  if (job.status === 'queued' || job.status === 'fetching') return 'Preparing download...';
  return '';
}

function getProgressPercentLabel(job, percent) {
  if (job.status === 'downloading' || job.status === 'processing' || job.status === 'completed') {
    return `${Math.round(percent)}%`;
  }
  return '';
}

function getFileSizeLabel(job) {
  if (job.fileSize && String(job.fileSize).trim()) return String(job.fileSize).trim();
  if (job.status === 'completed' || job.status === 'canceled') return '';
  return '-';
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

function detectSite(hostname) {
  if (!hostname) return { name: 'none', iconSvg: null };
  const h = hostname.toLowerCase();

  if (h.includes('youtube') || h.includes('youtu.be')) {
    return {
      name: 'YouTube',
      iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
    };
  }
  if (h.includes('tiktok')) {
    return {
      name: 'TikTok',
      iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>',
    };
  }
  if (h.includes('facebook') || h.includes('fb.')) {
    return {
      name: 'Facebook',
      iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    };
  }
  if (h.includes('twitter.com') || h.includes('x.com')) {
    return {
      name: 'Twitter/X',
      iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.25l-4.89-7.06L5.9 22H2.8l7.23-8.26L.8 2h6.35l4.42 6.38L18.9 2zm-1.09 18h1.73L6.2 3.9H4.34L17.81 20z"/></svg>',
    };
  }
  if (h.includes('instagram')) return { name: 'Instagram', iconSvg: null };
  if (h.includes('reddit')) return { name: 'Reddit', iconSvg: null };
  if (h.includes('twitch')) return { name: 'Twitch', iconSvg: null };
  if (h.includes('vimeo')) return { name: 'Vimeo', iconSvg: null };
  if (h.includes('dailymotion')) return { name: 'Dailymotion', iconSvg: null };
  if (h.includes('soundcloud')) return { name: 'SoundCloud', iconSvg: null };
  if (h.includes('bilibili')) return { name: 'Bilibili', iconSvg: null };

  return { name: 'none', iconSvg: null };
}

/** Returns inline SVG string for a given hostname (site icon). */
function getSiteIconSvg(hostname) {
  const site = detectSite(hostname);
  if (site.iconSvg) return site.iconSvg;
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
}

function setUrlError(message) {
  if (commandBar) commandBar.classList.add('has-error');
  if (urlErrorEl) {
    urlErrorEl.textContent = message;
    urlErrorEl.hidden = false;
  }
}

function clearUrlError() {
  if (commandBar) commandBar.classList.remove('has-error');
  if (urlErrorEl) {
    urlErrorEl.textContent = '';
    urlErrorEl.hidden = true;
  }
}

/** Show a toast notification (e.g. "Task Completed"). */
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
    mp3Bitrate: job.mp3Bitrate || null,
    openFolderWhenFinished: Boolean(job.openFolderWhenFinished),
    downloadSubtitles: Boolean(job.downloadSubtitles),
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
  applyTheme(settings.theme);
  if (settings.defaultQuality) {
    resSelect.value = settings.defaultQuality;
  }
  if (settings.defaultFormat) {
    const radio = document.querySelector(`input[name="fmt"][value="${settings.defaultFormat}"]`);
    if (radio) radio.checked = true;
  }
  syncFormatOptionVisibility();

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
        mp3Bitrate: item.format === 'mp3' ? String(item.mp3Bitrate || '192') : null,
        openFolderWhenFinished: Boolean(item.openFolderWhenFinished),
        downloadSubtitles: Boolean(item.downloadSubtitles),
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
const btnGithub = document.getElementById('btn-github');
if (btnGithub) {
  btnGithub.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const repoUrl = 'https://github.com/KevClint/MediaDl';
    try {
      window.open(repoUrl, '_blank', 'noopener');
      return;
    } catch (_) {}

    showToast('Could not open GitHub link. Restart the app and try again.', 'error');
  });
}

function updateCommandBarClearVisibility() {
  if (btnClearInput) btnClearInput.hidden = !urlInput.value.trim();
}

urlInput.addEventListener('input', () => {
  clearUrlError();
  updateCommandBarClearVisibility();
});
urlInput.addEventListener('focus', () => clearUrlError());

// ── Sidebar view switching (fade-in + slide-up 300ms) ──
const VIEW_IDS = ['view-home', 'view-downloads', 'view-settings', 'view-tools'];
function switchView(viewId) {
  VIEW_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === viewId) {
      el.classList.remove('view-hidden');
      el.classList.add('view-visible');
    } else {
      el.classList.remove('view-visible');
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
  if (viewId === 'view-tools') syncToolsEmptyState();
}

document.querySelectorAll('.sidebar-nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.getAttribute('data-view');
    if (view) switchView('view-' + view);
  });
});

// ── Media Tools ──
let toolsSelectedPaths = [];
let toolsLastOutputs = [];
let toolsOutputFolder = '';
let toolsIsProcessing = false;

const toolsEmptyState = document.getElementById('tools-empty-state');
const toolsGrid = document.getElementById('tools-grid');
const toolsDropZone = document.getElementById('tools-drop-zone');
const toolsDropZoneGrid = document.getElementById('tools-drop-zone-grid');
const toolsSelectedFileEl = document.getElementById('tools-selected-file');
const toolsOutputFolderEl = document.getElementById('tools-output-folder');
const btnToolsOutputFolder = document.getElementById('btn-tools-output-folder');
const toolsStatusEl = document.getElementById('tools-status');
const toolsStatusBar = document.getElementById('tools-status-bar');
const toolsStatusLabel = document.getElementById('tools-status-label');
const toolsStatusPercent = document.getElementById('tools-status-percent');
const toolsStatusExtra = document.getElementById('tools-status-extra');
const toolsProgressFill = document.getElementById('tools-progress-fill');
const toolsSuccessContainer = document.getElementById('tools-success-container');
const btnToolsStart = document.getElementById('btn-tools-start');
const toolsActionModal = document.getElementById('tools-action-modal');
const toolsActionBackdrop = document.getElementById('tools-action-backdrop');
const btnToolsPromptApply = document.getElementById('btn-tools-prompt-apply');
const btnToolsPromptSkip = document.getElementById('btn-tools-prompt-skip');
let toolsPromptPreviousFeature = '';

function setToolsProcessing(processing) {
  toolsIsProcessing = Boolean(processing);
  toolsSuccessContainer.innerHTML = '';
  if (toolsStatusEl) toolsStatusEl.hidden = !processing;
  if (btnToolsStart) {
    btnToolsStart.disabled = toolsIsProcessing;
    btnToolsStart.textContent = toolsIsProcessing ? 'Processing...' : 'Start Processing';
  }
  if (processing) {
    if (toolsStatusLabel) toolsStatusLabel.textContent = 'Processing...';
    if (toolsStatusPercent) toolsStatusPercent.textContent = '0%';
    if (toolsStatusExtra) toolsStatusExtra.textContent = 'ETA: --';
    if (toolsProgressFill) {
      toolsProgressFill.style.width = '0%';
      toolsProgressFill.classList.remove('completed');
    }
  }
}

function setToolsProgress(percent) {
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  if (toolsStatusPercent) toolsStatusPercent.textContent = p + '%';
  if (toolsProgressFill) toolsProgressFill.style.width = p + '%';
}

function renderSuccessCard(results = [], outputFolder = '') {
  const safeResults = Array.isArray(results) ? results.filter((item) => item && item.outputPath) : [];
  const count = safeResults.length;
  toolsLastOutputs = safeResults;
  if (toolsStatusEl) toolsStatusEl.hidden = true;
  toolsSuccessContainer.innerHTML = '';

  const card = createNode('div', 'tools-success-card');
  const first = safeResults[0] || {};
  const name = first.outputName || (first.outputPath ? first.outputPath.replace(/^.*[\\/]/, '') : '');
  const size = first.outputSize || '--';
  const extra = count > 1 ? `<div class="size">+${count - 1} more output files</div>` : '';

  card.innerHTML = `
    <div class="tools-success-icon" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <div class="tools-success-meta">
      <div class="name" title="${escapeAttr(name)}">${escapeHtml(name || 'Completed')}</div>
      <div class="size">${escapeHtml(size)}</div>
      ${extra}
    </div>
    <div class="tools-success-actions">
      <button type="button" class="btn-secondary btn-open-folder">Open Folder</button>
      <button type="button" class="btn-secondary btn-play">Play</button>
      <button type="button" class="btn-secondary btn-convert-another">Process Another</button>
    </div>
  `;

  card.querySelector('.btn-open-folder').onclick = () => {
    if (first.outputPath) {
      window.electronAPI.showItemInFolder(first.outputPath);
      return;
    }
    if (outputFolder) window.electronAPI.openFolder(outputFolder);
  };

  card.querySelector('.btn-play').onclick = () => {
    if (first.outputPath) window.electronAPI.playFile(first.outputPath);
  };

  card.querySelector('.btn-convert-another').onclick = () => {
    toolsSuccessContainer.innerHTML = '';
    toolsSelectedPaths = [];
    if (toolsSelectedFileEl) {
      toolsSelectedFileEl.textContent = 'No files selected';
      toolsSelectedFileEl.classList.add('muted');
    }
    syncToolsEmptyState();
  };

  toolsSuccessContainer.appendChild(card);
  showToast(`Task Completed (${count} output${count === 1 ? '' : 's'})`, 'success');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function setToolsComplete(results, outputFolder) {
  if (toolsProgressFill) toolsProgressFill.classList.add('completed');
  setToolsProgress(100);
  renderSuccessCard(results, outputFolder);
  setToolsProcessing(false);
}

window.electronAPI.onMediaToolsProgress((data) => {
  setToolsProgress(data.percent ?? 0);

  if (toolsStatusLabel) {
    const stage = data.stage ? String(data.stage) : 'Processing';
    const filePart = Number.isInteger(data.fileIndex) && Number.isInteger(data.totalFiles)
      ? ` (File ${data.fileIndex + 1}/${data.totalFiles})`
      : '';
    const fileName = data.fileName ? ` - ${data.fileName}` : '';
    toolsStatusLabel.textContent = `${stage}${filePart}${fileName}`;
  }

  if (toolsStatusExtra) {
    const eta = Number(data.etaSeconds);
    toolsStatusExtra.textContent = Number.isFinite(eta) && eta >= 0 ? `ETA: ${Math.round(eta)}s` : 'ETA: --';
  }
});

function syncToolsEmptyState() {
  const hasFile = toolsSelectedPaths.length > 0;
  if (toolsEmptyState) toolsEmptyState.hidden = hasFile;
  if (toolsGrid) toolsGrid.hidden = !hasFile;
}

function setToolsSelectedPaths(paths, { prompt = true } = {}) {
  const unique = Array.from(new Set((paths || []).filter((p) => typeof p === 'string' && p.trim())));
  toolsSelectedPaths = unique;

  if (toolsSelectedFileEl) {
    if (unique.length === 0) {
      toolsSelectedFileEl.textContent = 'No files selected';
      toolsSelectedFileEl.classList.add('muted');
    } else if (unique.length === 1) {
      toolsSelectedFileEl.textContent = unique[0].replace(/^.*[\\/]/, '');
      toolsSelectedFileEl.classList.remove('muted');
    } else {
      toolsSelectedFileEl.textContent = `${unique.length} files selected`;
      toolsSelectedFileEl.classList.remove('muted');
    }
  }

  syncToolsEmptyState();
  if (prompt && unique.length > 0) openToolsActionPrompt();
}

function toolsPickFile() {
  return window.electronAPI.selectMediaFiles().then((paths) => {
    if (!Array.isArray(paths) || paths.length === 0) return;
    setToolsSelectedPaths(paths, { prompt: true });
  });
}

function bindToolsDropZone(el) {
  if (!el) return;
  el.addEventListener('click', () => void toolsPickFile());
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void toolsPickFile();
    }
  });
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('drag-over');
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('drag-over');
    handleToolsFileDrop(e.dataTransfer);
  });
}

bindToolsDropZone(toolsDropZone);
bindToolsDropZone(toolsDropZoneGrid);

const MEDIA_DROP_EXT = /\.(mp4|mp3|mov|avi|mkv|webm|wav|flac|m4a|aac|wma|ogg)$/i;
function handleToolsFileDrop(dataTransfer) {
  const files = Array.from(dataTransfer.files || []);
  const paths = files
    .filter((file) => file && file.path && MEDIA_DROP_EXT.test(file.name || ''))
    .map((file) => file.path);
  if (paths.length === 0) return;
  setToolsSelectedPaths(paths, { prompt: true });
}

function setTaskToggle(id, checked) {
  const el = document.getElementById(id);
  if (el) el.checked = Boolean(checked);
}

function setElementHidden(id, hidden) {
  const el = document.getElementById(id);
  if (el) el.hidden = Boolean(hidden);
}

function applyToolsFeatureVisibility(feature) {
  if (!feature) {
    setElementHidden('tool-card-convert', false);
    setElementHidden('tool-card-compress', false);
    setElementHidden('tool-card-audio', false);
    setElementHidden('tool-card-trim', false);
    setElementHidden('tool-card-gif', false);
    setElementHidden('tools-row-convert-switch', false);
    setElementHidden('tools-row-audio-extract', false);
    setElementHidden('tools-row-audio-strip', false);
    setElementHidden('tools-row-trim', false);
    setElementHidden('tools-row-gif', false);
    return;
  }

  const isConvert = feature === 'convert';
  const isResize = feature === 'resize';
  const isCompress = feature === 'compress';
  const isExtract = feature === 'extract';
  const isStrip = feature === 'strip';
  const isTrim = feature === 'trim';
  const isGif = feature === 'gif';

  setElementHidden('tool-card-convert', !(isConvert || isResize));
  setElementHidden('tool-card-compress', !isCompress);
  setElementHidden('tool-card-audio', !(isExtract || isStrip));
  setElementHidden('tool-card-trim', !isTrim);
  setElementHidden('tool-card-gif', !isGif);

  setElementHidden('tools-row-convert-switch', isResize);
  setElementHidden('tools-row-audio-extract', !(isExtract || isStrip));
  setElementHidden('tools-row-audio-strip', !(isExtract || isStrip));
  setElementHidden('tools-row-trim', !isTrim);
  setElementHidden('tools-row-gif', !isGif);
}

function mapPromptFeatureToFeature(promptFeature) {
  if (promptFeature === 'audio') return 'extract';
  if (promptFeature === 'resize') return 'resize';
  if (promptFeature === 'convert' || promptFeature === 'compress' || promptFeature === 'trim' || promptFeature === 'gif') return promptFeature;
  return '';
}

function getCurrentSingleFeatureFromControls() {
  if (document.getElementById('tools-enable-convert')?.checked) return 'convert';
  if (document.getElementById('tools-enable-compress')?.checked) return 'compress';
  if (document.getElementById('tools-enable-extract-audio')?.checked) return 'extract';
  if (document.getElementById('tools-strip-audio')?.checked) return 'strip';
  if (document.getElementById('tools-enable-trim')?.checked) return 'trim';
  if (document.getElementById('tools-enable-gif')?.checked) return 'gif';
  if (document.getElementById('tools-resize-preset')?.value) return 'resize';
  return '';
}

function resetToolsFeatureSelection() {
  setTaskToggle('tools-enable-convert', false);
  setTaskToggle('tools-enable-compress', false);
  setTaskToggle('tools-enable-extract-audio', false);
  setTaskToggle('tools-strip-audio', false);
  setTaskToggle('tools-enable-trim', false);
  setTaskToggle('tools-enable-gif', false);
  const resizeEl = document.getElementById('tools-resize-preset');
  if (resizeEl) resizeEl.value = '';
  applyToolsFeatureVisibility('');
}

function applySingleFeature(feature, resizeValue = '') {
  resetToolsFeatureSelection();
  if (feature === 'convert') setTaskToggle('tools-enable-convert', true);
  if (feature === 'compress') setTaskToggle('tools-enable-compress', true);
  if (feature === 'extract') setTaskToggle('tools-enable-extract-audio', true);
  if (feature === 'strip') setTaskToggle('tools-strip-audio', true);
  if (feature === 'trim') setTaskToggle('tools-enable-trim', true);
  if (feature === 'gif') setTaskToggle('tools-enable-gif', true);
  if (feature === 'resize') {
    const resizeEl = document.getElementById('tools-resize-preset');
    if (resizeEl) resizeEl.value = resizeValue || '720';
  }
  applyToolsFeatureVisibility(feature);
}

function openToolsActionPrompt() {
  if (!toolsActionModal || toolsSelectedPaths.length === 0) return;
  toolsPromptPreviousFeature = getCurrentSingleFeatureFromControls();
  toolsActionModal.hidden = false;
  const selectedPrompt = document.querySelector('input[name="prompt-feature"]:checked');
  const previewFeature = mapPromptFeatureToFeature(selectedPrompt ? selectedPrompt.value : '');
  applyToolsFeatureVisibility(previewFeature);
}

function closeToolsActionPrompt({ restorePreview = true } = {}) {
  if (!toolsActionModal) return;
  toolsActionModal.hidden = true;
  if (restorePreview) {
    applyToolsFeatureVisibility(toolsPromptPreviousFeature);
  }
}

function applyToolsPromptSelection() {
  const chosen = document.querySelector('input[name="prompt-feature"]:checked');
  const feature = chosen ? chosen.value : '';
  if (!feature) {
    showToast('Select one task or press Skip', 'error');
    return;
  }
  if (feature === 'audio') {
    applySingleFeature('extract');
  } else if (feature === 'resize') {
    applySingleFeature('resize', '720');
  } else {
    applySingleFeature(feature);
  }
  closeToolsActionPrompt({ restorePreview: false });
}

btnToolsPromptApply?.addEventListener('click', applyToolsPromptSelection);
btnToolsPromptSkip?.addEventListener('click', () => closeToolsActionPrompt());
toolsActionBackdrop?.addEventListener('click', () => closeToolsActionPrompt());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeToolsActionPrompt();
});
document.querySelectorAll('input[name="prompt-feature"]').forEach((el) => {
  el.addEventListener('change', () => {
    const selectedPrompt = document.querySelector('input[name="prompt-feature"]:checked');
    const previewFeature = mapPromptFeatureToFeature(selectedPrompt ? selectedPrompt.value : '');
    applyToolsFeatureVisibility(previewFeature);
  });
});

// Universal drag & drop: when Media Tools view is active, accept file drop anywhere on window
function isToolsViewActive() {
  const view = document.getElementById('view-tools');
  return view && !view.classList.contains('view-hidden');
}
function isHomeViewActive() {
  const view = document.getElementById('view-home');
  return view && !view.classList.contains('view-hidden');
}

document.body.addEventListener('dragover', (e) => {
  if (isToolsViewActive() && e.dataTransfer.types.includes('Files')) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  if (isHomeViewActive() && (e.dataTransfer.types.includes('text/uri-list') || e.dataTransfer.types.includes('text/plain'))) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'link';
  }
});

document.body.addEventListener('drop', (e) => {
  if (isToolsViewActive() && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    e.preventDefault();
    e.stopPropagation();
    handleToolsFileDrop(e.dataTransfer);
    return;
  }
  if (isHomeViewActive()) {
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    const trimmed = (url || '').trim();
    if (!trimmed) return;
    e.preventDefault();
    e.stopPropagation();
    urlInput.value = trimmed;
    clearUrlError();
    analyzeUrl(trimmed);
  }
});

async function analyzeUrl(url) {
  try {
    await window.electronAPI.fetchFormats(url);
    showToast('Ready to add to queue', 'success');
  } catch (err) {
    setUrlError(err && err.message ? err.message : 'Invalid URL. Only HTTP/HTTPS URLs are allowed.');
  }
}

function getFriendlyMediaToolsError(error) {
  const raw = String((error && error.message) || '').trim();
  const msg = raw.replace(/^Error invoking remote method '[^']+':\s*/i, '');
  const lower = msg.toLowerCase();

  if (!msg) return 'Processing failed. Please try again.';
  if (lower.includes('requires a video stream')) {
    return 'This feature needs a video file. Your selected file is audio-only.';
  }
  if (lower.includes('trim time format is invalid')) {
    return 'Trim time is invalid. Use SS, MM:SS, or HH:MM:SS.';
  }
  if (lower.includes('trim end time must be greater than start time')) {
    return 'Trim end time must be later than start time.';
  }
  if (lower.includes('only one feature can run at a time')) {
    return 'Choose only one feature before starting.';
  }
  if (lower.includes('select one feature to run')) {
    return 'Select one feature to run.';
  }
  if (lower.includes('no input files selected') || lower.includes('no valid media files selected')) {
    return 'Select at least one valid media file.';
  }
  if (lower.includes('output file does not contain any stream')) {
    return 'Cannot create output from this file. It may not have the required stream.';
  }
  if (lower.includes('ffmpeg exited')) {
    return 'Processing failed in FFmpeg. Check your selected feature and file type.';
  }

  return msg;
}

async function runTool(invoker, opts) {
  if (toolsIsProcessing) return;
  if (toolsSelectedPaths.length === 0) {
    showToast('Select at least one file first', 'error');
    return;
  }

  setToolsProcessing(true);
  try {
    const result = await invoker(opts);
    if (result && result.success) {
      setToolsComplete(result.results || [], result.outputFolder || toolsOutputFolder || '');
      return;
    }
    throw new Error('Processing failed');
  } catch (err) {
    setToolsProcessing(false);
    showToast(getFriendlyMediaToolsError(err), 'error');
  }
}

function getToolsPipelineOptions() {
  const qualityEl = document.querySelector('input[name="tools-compress"]:checked');
  return {
    convertEnabled: Boolean(document.getElementById('tools-enable-convert')?.checked),
    convertFormat: document.getElementById('tools-convert-format').value,
    resizePreset: document.getElementById('tools-resize-preset').value || '',
    compressEnabled: Boolean(document.getElementById('tools-enable-compress')?.checked),
    compressionQuality: qualityEl ? qualityEl.value : 'medium',
    extractAudioEnabled: Boolean(document.getElementById('tools-enable-extract-audio')?.checked),
    extractAudioFormat: document.getElementById('tools-audio-format').value,
    stripAudio: Boolean(document.getElementById('tools-strip-audio')?.checked),
    trimEnabled: Boolean(document.getElementById('tools-enable-trim')?.checked),
    trimStart: document.getElementById('tools-trim-start').value.trim(),
    trimEnd: document.getElementById('tools-trim-end').value.trim(),
    gifEnabled: Boolean(document.getElementById('tools-enable-gif')?.checked),
    gifDuration: document.getElementById('tools-gif-duration').value.trim(),
  };
}

function getEnabledFeatureCount(options) {
  return Number(
    options.convertEnabled ||
      false
  ) +
    Number(options.compressEnabled || false) +
    Number(options.extractAudioEnabled || false) +
    Number(options.stripAudio || false) +
    Number(options.trimEnabled || false) +
    Number(options.gifEnabled || false) +
    Number(Boolean(options.resizePreset));
}

function hasAnyPipelineAction(options) {
  return Boolean(
    options.convertEnabled ||
    options.compressEnabled ||
    options.extractAudioEnabled ||
    options.stripAudio ||
    options.trimEnabled ||
    options.gifEnabled ||
    options.resizePreset
  );
}

btnToolsStart?.addEventListener('click', () => {
  const options = getToolsPipelineOptions();
  const enabledCount = getEnabledFeatureCount(options);
  if (enabledCount === 0) {
    showToast('Select one feature to run', 'error');
    return;
  }
  if (enabledCount > 1) {
    showToast('Only one feature can run at a time', 'error');
    return;
  }

  runTool(window.electronAPI.mediaToolsRunPipeline, {
    inputPaths: toolsSelectedPaths,
    outputFolder: toolsOutputFolder,
    pipeline: options,
  });
});

btnToolsOutputFolder?.addEventListener('click', async () => {
  const folder = await window.electronAPI.selectFolder();
  if (!folder) return;
  toolsOutputFolder = folder;
  if (toolsOutputFolderEl) toolsOutputFolderEl.value = folder;
});

[
  'tools-enable-convert',
  'tools-enable-compress',
  'tools-enable-extract-audio',
  'tools-strip-audio',
  'tools-enable-trim',
  'tools-enable-gif',
].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', () => {
    if (!el.checked) return;
    const featureMap = {
      'tools-enable-convert': 'convert',
      'tools-enable-compress': 'compress',
      'tools-enable-extract-audio': 'extract',
      'tools-strip-audio': 'strip',
      'tools-enable-trim': 'trim',
      'tools-enable-gif': 'gif',
    };
    applySingleFeature(featureMap[id]);
  });
});

const toolsResizePreset = document.getElementById('tools-resize-preset');
toolsResizePreset?.addEventListener('change', () => {
  if (toolsResizePreset.value) {
    applySingleFeature('resize', toolsResizePreset.value);
  }
});

// ── Downloads Manager ──
const downloadsListEl = document.getElementById('downloads-list');
const downloadsEmptyEl = document.getElementById('downloads-empty');

function renderDownloadsManager() {
  const completed = queue.filter((j) => j.status === 'completed');
  downloadsListEl.innerHTML = '';
  if (completed.length === 0) {
    downloadsListEl.hidden = true;
    downloadsEmptyEl.hidden = false;
    return;
  }
  downloadsListEl.hidden = false;
  downloadsEmptyEl.hidden = true;
  completed.forEach((job) => {
    const item = createNode('div', 'completed-item');
    item.dataset.jobId = String(job.id);
    let hostname = '';
    try {
      hostname = new URL(job.url).hostname;
    } catch (_) {}
    const site = detectSite(hostname);

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
    const meta = createNode('div', 'completed-item-meta', getCompletedMetaLine(job, site.name));
    info.appendChild(title);
    info.appendChild(meta);

    const actions = createNode('div', 'completed-item-actions');
    const statusBadge = createNode('span', 'completed-status-badge', 'Complete');
    const btnPlay = createNode('button', 'completed-icon-btn');
    const btnOpen = createNode('button', 'completed-icon-btn');
    const btnRemove = createNode('button', 'completed-icon-btn danger');
    btnOpen.type = btnPlay.type = btnRemove.type = 'button';
    btnPlay.title = 'Play';
    btnPlay.setAttribute('aria-label', 'Play');
    btnOpen.title = 'Open Folder';
    btnOpen.setAttribute('aria-label', 'Open Folder');
    btnRemove.title = 'Delete';
    btnRemove.setAttribute('aria-label', 'Delete');
    btnPlay.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" aria-hidden="true"><path d="M8 6v12l10-6-10-6z"/></svg>';
    btnOpen.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14" aria-hidden="true"><path d="M3 7h5l2 2h11v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>';
    btnRemove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>';
    btnOpen.onclick = () => window.electronAPI.openFolder(job.outputFolder);
    btnPlay.onclick = () => void playCompletedJob(job);
    btnRemove.onclick = () => removeCompletedFromList(job.id);
    actions.appendChild(statusBadge);
    actions.appendChild(btnPlay);
    actions.appendChild(btnOpen);
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

function clearDone() {
  queue = queue.filter((job) => job.status !== 'completed');
  rebuildQueue();
  renderDownloadsManager();
  saveState();
}

function deleteJob(jobId) {
  queue = queue.filter((job) => job.id !== jobId);
  cardRefs.delete(jobId);
  rebuildQueue();
  renderDownloadsManager();
  saveState();
}

document.getElementById('btn-paste').onclick = async () => {
  try {
    const text = await navigator.clipboard.readText();
    const trimmed = (text || '').trim();
    if (trimmed) {
      urlInput.value = trimmed;
      updateCommandBarClearVisibility();
      await analyzeUrl(trimmed);
    }
  } catch (_) {
    showToast('Could not read clipboard', 'error');
  }
};

async function playCompletedJob(job) {
  if (!job || !job.outputFolder) return;

  if (!job.outputFilePath) {
    showToast('Video file missing. Removed from Downloads.', 'error');
    removeCompletedFromList(job.id);
    return;
  }

  const playResult = await window.electronAPI.playFile(job.outputFilePath);
  if (playResult && playResult.success) return;

  const message = String((playResult && playResult.message) || '').toLowerCase();
  const isMissingFile = message.includes('not found')
    || message.includes('does not exist')
    || message.includes('no such file')
    || message.includes('path not found');

  if (isMissingFile) {
    showToast('Video file not found. Removed from Downloads.', 'error');
    removeCompletedFromList(job.id);
    return;
  }

  showToast('Could not open this video file.', 'error');
}

if (btnClearInput) {
  btnClearInput.addEventListener('click', () => {
    urlInput.value = '';
    urlInput.focus();
    updateCommandBarClearVisibility();
    clearUrlError();
  });
}

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
const settingsThemeEl = document.getElementById('settings-theme');
const appVersionEl = document.getElementById('app-version');
const ytdlpVersionEl = document.getElementById('ytdlp-version');
const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
let themePreference = 'system';

function normalizeThemePreference(theme) {
  if (theme === 'dark' || theme === 'light' || theme === 'system') return theme;
  return 'system';
}

function resolveTheme(theme) {
  const preference = normalizeThemePreference(theme);
  if (preference === 'system') return systemThemeQuery.matches ? 'dark' : 'light';
  return preference;
}

function applyTheme(theme) {
  themePreference = normalizeThemePreference(theme);
  const resolved = resolveTheme(themePreference);
  document.documentElement.setAttribute('data-theme', resolved);
}

async function loadAppVersion() {
  if (!appVersionEl) return '';
  appVersionEl.textContent = 'Loading...';
  const result = await window.electronAPI.getAppVersion();
  const version = result && result.success && result.version ? result.version : 'Unavailable';
  appVersionEl.textContent = version;
  return version;
}

async function loadYtDlpVersion() {
  if (!ytdlpVersionEl) return '';
  ytdlpVersionEl.textContent = 'Loading...';
  const result = await window.electronAPI.getYtDlpVersion();
  const version = result && result.success && result.version ? result.version : 'Unavailable';
  ytdlpVersionEl.textContent = version;
  return version;
}

async function loadSettingsForm() {
  const s = await window.electronAPI.getSettings();
  settingsFolderEl.value = s.downloadFolder || '';
  if (s.defaultQuality) settingsDefaultQualityEl.value = s.defaultQuality;
  if (s.defaultFormat) settingsDefaultFormatEl.value = s.defaultFormat;
  const theme = normalizeThemePreference(s.theme);
  settingsThemeEl.value = theme;
  applyTheme(theme);
  if (s.theme !== 'dark' && s.theme !== 'light' && s.theme !== 'system') {
    await window.electronAPI.setSettings({ theme });
  }
  await loadAppVersion();
  await loadYtDlpVersion();
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
  syncFormatOptionVisibility();
});

settingsThemeEl.addEventListener('change', async () => {
  const val = normalizeThemePreference(settingsThemeEl.value);
  applyTheme(val);
  await window.electronAPI.setSettings({ theme: val });
});

const onSystemThemeChange = () => {
  if (themePreference === 'system') applyTheme('system');
};
if (typeof systemThemeQuery.addEventListener === 'function') {
  systemThemeQuery.addEventListener('change', onSystemThemeChange);
} else if (typeof systemThemeQuery.addListener === 'function') {
  systemThemeQuery.addListener(onSystemThemeChange);
}

document.getElementById('btn-update-ytdlp').onclick = async () => {
  const btn = document.getElementById('btn-update-ytdlp');
  const beforeVersion = ytdlpVersionEl ? ytdlpVersionEl.textContent : '';
  btn.disabled = true;
  btn.textContent = 'Updating...';
  const result = await window.electronAPI.updateYtDlp();
  btn.disabled = false;
  btn.textContent = 'Update yt-dlp';
  const afterVersion = await loadYtDlpVersion();
  if (result && result.success) {
    if (beforeVersion && afterVersion && beforeVersion !== 'Loading...' && beforeVersion !== afterVersion) {
      showToast(`yt-dlp updated: ${beforeVersion} -> ${afterVersion}`, 'success');
    } else if (afterVersion && afterVersion !== 'Unavailable') {
      showToast(`yt-dlp version: ${afterVersion}`, 'success');
    } else {
      showToast('yt-dlp updated successfully', 'success');
    }
  } else {
    showToast(result && result.message ? result.message : 'Update failed', 'error');
  }
};

document.getElementById('btn-add').onclick = () => {
  clearUrlError();
  if (!downloadFolder) {
    setUrlError('Please select a download folder first.');
    return;
  }

  const urls = urlInput.value
    .split('\n')
    .map((u) => u.trim())
    .filter((u) => u.length > 0);

  if (urls.length === 0) {
    setUrlError('Please paste at least one URL.');
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
    setUrlError('Invalid URL. Only HTTP/HTTPS URLs are allowed.');
    return;
  }

  const format = getFormat();
  const resolution = format === 'mp4' ? resSelect.value : null;
  const mp3Bitrate = format === 'mp3' ? getMp3Bitrate() : null;
  const openFolderWhenFinished = Boolean(openFolderFinishedToggle && openFolderFinishedToggle.checked);
  const downloadSubtitles = Boolean(downloadSubtitlesToggle && downloadSubtitlesToggle.checked);
  const existingKeys = new Set(
    queue.map((job) => buildQueueKey(
      job.url,
      job.format,
      job.resolution,
      job.outputFolder,
      job.mp3Bitrate,
      job.downloadSubtitles
    ))
  );
  const pendingKeys = new Set();
  const newJobs = [];

  let duplicateCount = 0;
  valid.forEach((url) => {
    const key = buildQueueKey(url, format, resolution, downloadFolder, mp3Bitrate, downloadSubtitles);
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
      mp3Bitrate,
      openFolderWhenFinished,
      downloadSubtitles,
      outputFolder: downloadFolder,
      status: 'queued',
      percent: 0,
      fileSize: '',
      title: '',
      error: '',
    };
    newJobs.push(job);
  });

  if (duplicateCount > 0) {
    alert(`${duplicateCount} duplicate URL(s) were skipped.`);
  }

  if (newJobs.length > 0) {
    queue = [...newJobs, ...queue];
    rebuildQueue();
  }

  urlInput.value = '';
  updateCommandBarClearVisibility();
  clearUrlError();
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

if (btnClearDone) {
  btnClearDone.onclick = clearDone;
}

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
      mp3Bitrate: job.mp3Bitrate || null,
      openFolderWhenFinished: Boolean(job.openFolderWhenFinished),
      downloadSubtitles: Boolean(job.downloadSubtitles),
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
  const wasCompleted = job.status === 'completed';

  Object.assign(job, changes);
  if (!wasCompleted && job.status === 'completed' && job.openFolderWhenFinished && !autoOpenedFolders.has(job.id)) {
    autoOpenedFolders.add(job.id);
    void window.electronAPI.openFolder(job.outputFolder);
  }
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

  const body = createNode('div', 'card-body');
  const header = createNode('div', 'card-header');
  const titleGroup = createNode('div', 'card-title-group');
  const titleEl = createNode('div', 'card-title', getCardTitle(job));
  const skeletonTitle = createNode('div', 'skeleton-line title');
  skeletonTitle.style.display = job.status === 'fetching' ? 'block' : 'none';
  const siteIconWrap = createNode('span', 'card-site-icon');
  siteIconWrap.innerHTML = getSiteIconSvg(hostname);
  const badge = createNode('span', `badge badge-${job.status}`, statusLabel(job.status));
  titleGroup.appendChild(titleEl);
  titleGroup.appendChild(skeletonTitle);
  titleGroup.appendChild(siteIconWrap);
  header.appendChild(titleGroup);
  header.appendChild(badge);

  const formatText = getFormatLabel(job);
  const subtitlesText = getSubtitleLabel(job);
  const meta = createNode('div', 'card-meta');
  const formatSpan = createNode('span', '', formatText);
  const subtitleSpan = createNode('span', '', subtitlesText);
  const fileSizeText = getFileSizeLabel(job);
  const fileSizeSpan = createNode('span', 'mono', fileSizeText);
  const errorEl = createNode('span', 'card-error', '');
  errorEl.hidden = true;
  const skeletonMeta = createNode('div', 'skeleton-line meta');
  const showSkeleton = job.status === 'fetching';
  skeletonMeta.style.display = showSkeleton ? 'block' : 'none';
  if (!showSkeleton) formatSpan.style.display = '';
  subtitleSpan.style.display = !showSkeleton && subtitlesText ? '' : 'none';
  fileSizeSpan.style.display = !showSkeleton && fileSizeText ? '' : 'none';
  meta.appendChild(formatSpan);
  meta.appendChild(subtitleSpan);
  meta.appendChild(fileSizeSpan);
  meta.appendChild(errorEl);
  meta.appendChild(skeletonMeta);

  body.appendChild(header);
  body.appendChild(meta);

  const progressWrap = createNode('div', 'card-progress-wrap');
  const initialPercent = normalizedPercent(job.percent);
  const progressPercent = createNode('span', 'card-progress-percent', getProgressPercentLabel(job, initialPercent));
  progressPercent.style.visibility = progressPercent.textContent ? 'visible' : 'hidden';
  const progressTrack = createNode('div', 'progress-track');
  const progressFill = createNode('div', 'progress-fill');
  progressFill.style.width = `${normalizedPercent(job.percent)}%`;
  progressWrap.appendChild(progressPercent);
  progressTrack.appendChild(progressFill);
  progressWrap.appendChild(progressTrack);

  const actions = createNode('div', 'card-actions');
  const cancelBtn = createNode('button', 'btn-secondary', 'Cancel');
  const retryBtn = createNode('button', 'btn-secondary', 'Retry');
  const deleteBtn = createNode('button', 'btn-secondary', 'Delete');
  cancelBtn.type = 'button';
  retryBtn.type = 'button';
  deleteBtn.type = 'button';
  cancelBtn.onclick = () => void onCancel(job.id);
  retryBtn.onclick = () => onRetry(job.id);
  deleteBtn.onclick = () => deleteJob(job.id);
  actions.appendChild(cancelBtn);
  actions.appendChild(retryBtn);
  actions.appendChild(deleteBtn);

  card.appendChild(body);
  card.appendChild(progressWrap);
  card.appendChild(actions);

  queueEl.appendChild(card);

  cardRefs.set(job.id, {
    card,
    titleEl,
    skeletonTitle,
    skeletonMeta,
    siteIconWrap,
    badge,
    formatSpan,
    subtitleSpan,
    fileSizeSpan,
    progressPercent,
    progressFill,
    actions,
    cancelBtn,
    retryBtn,
    deleteBtn,
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

  const isFetching = job.status === 'fetching';
  refs.card.className = `download-card ${job.status}${isFetching ? ' skeleton' : ''}`;
  refs.badge.className = `badge badge-${job.status}`;
  refs.badge.textContent = statusLabel(job.status);
  refs.titleEl.textContent = getCardTitle(job);
  refs.titleEl.style.display = isFetching ? 'none' : '';
  if (refs.skeletonTitle) refs.skeletonTitle.style.display = isFetching ? 'block' : 'none';
  refs.formatSpan.style.display = isFetching ? 'none' : '';
  refs.subtitleSpan.style.display = 'none';
  const fileSizeText = getFileSizeLabel(job);
  refs.fileSizeSpan.textContent = fileSizeText;
  refs.fileSizeSpan.className = 'mono';
  refs.fileSizeSpan.style.display = !isFetching && fileSizeText ? '' : 'none';
  if (refs.skeletonMeta) refs.skeletonMeta.style.display = isFetching ? 'block' : 'none';
  const percentLabel = getProgressPercentLabel(job, percent);
  refs.progressPercent.textContent = percentLabel;
  refs.progressPercent.style.visibility = percentLabel ? 'visible' : 'hidden';
  refs.progressFill.style.width = `${percent}%`;
  refs.progressFill.classList.toggle('completed', job.status === 'completed' && percent >= 100);

  const formatText = getFormatLabel(job);
  const subtitlesText = getSubtitleLabel(job);
  refs.formatSpan.textContent = formatText;
  refs.subtitleSpan.textContent = subtitlesText;
  refs.subtitleSpan.style.display = !isFetching && subtitlesText ? '' : 'none';

  const canCancel = job.status === 'queued' || RUNNING_STATUSES.has(job.status);
  const canRetry = job.status === 'failed' || job.status === 'canceled';
  const canDelete = job.status === 'canceled';
  refs.actions.hidden = !(canCancel || canRetry || canDelete);
  refs.cancelBtn.hidden = !canCancel;
  refs.retryBtn.hidden = !canRetry;
  refs.deleteBtn.hidden = !canDelete;

  if (job.error) {
    refs.errorEl.textContent = job.error;
    refs.errorEl.hidden = false;
  } else {
    refs.errorEl.textContent = '';
    refs.errorEl.hidden = true;
  }

  if (job.status === 'completed' && prevStatus !== 'completed') {
    showToast('Task Completed', 'success');
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

  cancelRequested.add(jobId);
  updateJob(jobId, { error: 'Cancel requested...' });
  const result = await window.electronAPI.cancelDownload(jobId);
  if (!result || !result.success) {
    cancelRequested.delete(jobId);
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
  setOptionsCollapsed(isOptionsCollapsedStored(), false);
  initInfoTipPopovers();
  saveState();
});

