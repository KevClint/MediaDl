// ── State ──
let queue = [];
let downloadFolder = '';
let idCounter = 0;

// ── DOM ──
const urlInput      = document.getElementById('url-input');
const folderDisplay = document.getElementById('folder-display');
const resGroup      = document.getElementById('res-group');
const resSelect     = document.getElementById('res-select');
const queueEl       = document.getElementById('queue');
const emptyState    = document.getElementById('empty-state');

// ── Hide resolution when MP3 selected ──
document.querySelectorAll('input[name="fmt"]').forEach(r => {
  r.addEventListener('change', () => {
    resGroup.style.display = getFormat() === 'mp3' ? 'none' : 'flex';
  });
});

function getFormat() {
  return document.querySelector('input[name="fmt"]:checked').value;
}

// ── Title bar ──
document.getElementById('btn-min').onclick   = () => window.electronAPI.minimizeWindow();
document.getElementById('btn-max').onclick   = () => window.electronAPI.maximizeWindow();
document.getElementById('btn-close').onclick = () => window.electronAPI.closeWindow();

// ── Browse folder ──
document.getElementById('btn-browse').onclick = async () => {
  const folder = await window.electronAPI.selectFolder();
  if (folder) {
    downloadFolder = folder;
    folderDisplay.value = folder;
  }
};

// ── Add to Queue ──
document.getElementById('btn-add').onclick = () => {
  if (!downloadFolder) {
    alert('Please select a download folder first.');
    return;
  }

  const urls = urlInput.value
    .split('\n')
    .map(u => u.trim())
    .filter(u => u.length > 0);

  if (urls.length === 0) {
    alert('Please paste at least one URL.');
    return;
  }

  // Basic URL validation
  const valid = [];
  const invalid = [];
  urls.forEach(u => {
    try { new URL(u); valid.push(u); }
    catch { invalid.push(u); }
  });

  if (invalid.length > 0) {
    if (!confirm(`${invalid.length} invalid URL(s) will be skipped. Continue with ${valid.length} valid URL(s)?`)) return;
  }

  if (valid.length === 0) {
    alert('No valid URLs found.');
    return;
  }

  const format     = getFormat();
  const resolution = format === 'mp4' ? resSelect.value : null;

  valid.forEach(url => {
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
      error: ''
    };
    queue.push(job);
    renderCard(job);
  });

  urlInput.value = '';
  syncEmptyState();
};

// ── Start All ──
document.getElementById('btn-start-all').onclick = () => {
  const queued = queue.filter(j => j.status === 'queued');
  if (queued.length === 0) {
    alert('No queued downloads to start.');
    return;
  }
  queued.forEach(job => runDownload(job));
};

// ── Clear Done ──
document.getElementById('btn-clear').onclick = () => {
  queue = queue.filter(j => j.status !== 'completed' && j.status !== 'failed');
  rebuildQueue();
};

// ── Run a Download ──
async function runDownload(job) {
  // Step 1: Fetch video title
  updateJob(job.id, { status: 'fetching' });
  try {
    const info = await window.electronAPI.fetchFormats(job.url);
    updateJob(job.id, { title: info.title });
  } catch {
    // Not fatal, we just won't have the title
  }

  // Step 2: Start download
  updateJob(job.id, { status: 'downloading' });
  try {
    await window.electronAPI.startDownload({
      url:          job.url,
      outputFolder: job.outputFolder,
      format:       job.format,
      resolution:   job.resolution,
      downloadId:   job.id
    });
  } catch (err) {
    updateJob(job.id, {
      status: 'failed',
      error: friendlyError(err.message)
    });
  }
}

// ── Listen for progress from main process ──
window.electronAPI.onDownloadProgress((data) => {
  updateJob(data.downloadId, {
    percent:  data.percent  ?? 0,
    fileSize: data.fileSize ?? '',
    status:   data.status,
    error:    data.error    ?? ''
  });
});

// ── Update job state and refresh its card ──
function updateJob(id, changes) {
  const job = queue.find(j => j.id === id);
  if (!job) return;
  Object.assign(job, changes);
  refreshCard(job);
}

// ── Render a brand new card ──
function renderCard(job) {
  emptyState.style.display = 'none';

  const card = document.createElement('div');
  card.id        = `card-${job.id}`;
  card.className = `dl-card ${job.status}`;

  card.innerHTML = buildCardHTML(job);
  queueEl.appendChild(card);
}

// ── Refresh an existing card in place ──
function refreshCard(job) {
  const card = document.getElementById(`card-${job.id}`);
  if (!card) return;

  card.className  = `dl-card ${job.status}`;
  card.innerHTML  = buildCardHTML(job);
}

// ── Build card inner HTML ──
function buildCardHTML(job) {
  const formatLabel = job.format === 'mp3'
    ? '🎵 MP3'
    : `🎬 MP4 ${job.resolution ? job.resolution + 'p' : ''}`;

  const progressLabel = job.status === 'completed' ? '✓ Complete'
    : job.status === 'failed'     ? '✗ Failed'
    : job.status === 'fetching'   ? 'Fetching info...'
    : job.status === 'processing' ? 'Processing...'
    : `${job.percent.toFixed(1)}%`;

  const fillClass = job.status === 'completed' ? 'done'
    : job.status === 'failed' ? 'error' : '';

  const errorHTML = job.error
    ? `<div class="card-error">⚠ ${job.error}</div>`
    : '';

  return `
    <div class="card-top">
      <span class="card-url">${job.url}</span>
      <span class="badge badge-${job.status}">${job.status}</span>
    </div>
    <div class="card-title">${job.title || 'Fetching title...'}</div>
    <div class="card-meta">
      <span>${formatLabel}</span>
      ${job.fileSize ? `<span>${job.fileSize}</span>` : ''}
    </div>
    <div class="progress-track">
      <div class="progress-fill ${fillClass}" style="width:${job.percent}%"></div>
    </div>
    <div class="progress-labels">
      <span>${progressLabel}</span>
      <span>${job.percent > 0 && job.percent < 100 ? job.percent.toFixed(1) + '%' : ''}</span>
    </div>
    ${errorHTML}
  `;
}

// ── Rebuild entire queue display ──
function rebuildQueue() {
  queueEl.innerHTML = '';
  queueEl.appendChild(emptyState);
  queue.forEach(job => renderCard(job));
  syncEmptyState();
}

function syncEmptyState() {
  emptyState.style.display = queue.length === 0 ? 'flex' : 'none';
}

// ── Friendly error messages ──
function friendlyError(msg) {
  if (!msg) return 'Unknown error occurred.';
  if (msg.includes('Private video'))     return 'This video is private.';
  if (msg.includes('unavailable'))       return 'Video is unavailable or has been removed.';
  if (msg.includes('Sign in'))           return 'This content requires login to access.';
  if (msg.includes('ETIMEDOUT'))         return 'Connection timed out. Check your internet.';
  if (msg.includes('ENOTFOUND'))         return 'Network error. Check your internet connection.';
  if (msg.includes('Unsupported URL'))   return 'This URL or site is not supported.';
  if (msg.includes('timed out'))         return 'Download timed out after 10 minutes.';
  if (msg.includes('429'))               return 'Too many requests. Please wait and try again.';
  return 'Download failed. The video may be unavailable.';
}
