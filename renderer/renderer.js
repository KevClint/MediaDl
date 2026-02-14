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

document.getElementById('btn-browse').onclick = async () => {
  const folder = await window.electronAPI.selectFolder();
  if (folder) {
    downloadFolder = folder;
    folderDisplay.value = folder;
    await saveFolder();
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
  updateJob(data.downloadId, {
    percent: data.percent ?? 0,
    fileSize: data.fileSize ?? '',
    status: data.status,
    error: data.error ?? '',
  });
});

function updateJob(id, changes) {
  const job = queue.find((item) => item.id === id);
  if (!job) return;

  Object.assign(job, changes);
  refreshCard(job);
  saveState();
}

function renderCard(job) {
  emptyState.hidden = true;

  const card = createNode('div', `dl-card ${job.status}`);
  card.id = `card-${job.id}`;

  const top = createNode('div', 'card-top');
  const urlText = createNode('span', 'card-url', job.url);
  const badge = createNode('span', `badge badge-${job.status}`, statusLabel(job.status));
  top.appendChild(urlText);
  top.appendChild(badge);

  const title = createNode('div', 'card-title', job.title || 'Fetching title...');

  const meta = createNode('div', 'card-meta');
  const formatText = job.format === 'mp3'
    ? 'MP3'
    : `MP4 ${job.resolution ? `${job.resolution}p` : ''}`.trim();
  const formatMeta = createNode('span', '', formatText);
  const fileSize = createNode('span', '', job.fileSize || '');
  meta.appendChild(formatMeta);
  meta.appendChild(fileSize);

  const progressTrack = createNode('div', 'progress-track');
  const progress = createNode('progress', 'progress-fill');
  progress.max = 100;
  progress.value = normalizedPercent(job.percent);
  progressTrack.appendChild(progress);

  const labels = createNode('div', 'progress-labels');
  const progressLabel = createNode('span', '', progressText(job));
  const percentLabel = createNode('span', '', trailingPercent(job.percent, job.status));
  labels.appendChild(progressLabel);
  labels.appendChild(percentLabel);

  const actions = createNode('div', 'card-actions');
  const cancelBtn = createNode('button', 'btn-secondary small', 'Cancel');
  const retryBtn = createNode('button', 'btn-secondary small', 'Retry');
  cancelBtn.type = 'button';
  retryBtn.type = 'button';
  cancelBtn.onclick = () => void onCancel(job.id);
  retryBtn.onclick = () => onRetry(job.id);
  actions.appendChild(cancelBtn);
  actions.appendChild(retryBtn);

  const error = createNode('div', 'card-error', '');
  error.hidden = true;

  card.appendChild(top);
  card.appendChild(title);
  card.appendChild(meta);
  card.appendChild(progressTrack);
  card.appendChild(labels);
  card.appendChild(actions);
  card.appendChild(error);

  queueEl.appendChild(card);

  cardRefs.set(job.id, {
    card,
    badge,
    title,
    formatMeta,
    fileSize,
    progress,
    progressLabel,
    percentLabel,
    actions,
    cancelBtn,
    retryBtn,
    error,
  });

  refreshCard(job);
}

function refreshCard(job) {
  const refs = cardRefs.get(job.id);
  if (!refs) return;

  const percent = normalizedPercent(job.percent);

  refs.card.className = `dl-card ${job.status}`;
  refs.badge.className = `badge badge-${job.status}`;
  refs.badge.textContent = statusLabel(job.status);
  refs.title.textContent = job.title || 'Fetching title...';
  refs.fileSize.textContent = job.fileSize || '';
  refs.progress.value = percent;
  refs.progressLabel.textContent = progressText(job);
  refs.percentLabel.textContent = trailingPercent(percent, job.status);

  const canCancel = job.status === 'queued' || RUNNING_STATUSES.has(job.status);
  const canRetry = job.status === 'failed' || job.status === 'canceled';
  refs.actions.hidden = !(canCancel || canRetry);
  refs.cancelBtn.hidden = !canCancel;
  refs.retryBtn.hidden = !canRetry;

  if (job.error) {
    refs.error.textContent = `Warning: ${job.error}`;
    refs.error.hidden = false;
  } else {
    refs.error.textContent = '';
    refs.error.hidden = true;
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
