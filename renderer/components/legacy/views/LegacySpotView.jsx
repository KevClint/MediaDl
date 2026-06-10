function LegacySpotView() {
  return (
    <div className="view view-hidden" id="view-spot">
      <section className="command-section">
        <div className="content-wrap">
          <div className="command-bar-wrapper">
            <div className="command-bar-intro">
              <h1 className="command-bar-title">Spotify Downloader</h1>
              <p className="command-bar-subtitle">Paste Spotify track URLs to download them as MP3 files.</p>
            </div>
            <div className="command-bar-container">
              <div className="command-bar" id="spot-command-bar">
                <button type="button" id="btn-spot-paste" className="command-bar-paste" aria-label="Paste from clipboard" title="Paste">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
                <div className="command-bar-input-wrap">
                  <input
                    type="text"
                    id="spot-url-input"
                    className="command-bar-input"
                    placeholder="Paste Spotify track link here..."
                    autoComplete="off"
                  />
                  <button type="button" id="btn-spot-clear-input" className="command-bar-clear" aria-label="Clear input" title="Clear" hidden>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <button type="button" id="btn-spot-add" className="command-bar-action">Add to Queue</button>
              </div>
            </div>
            <p className="command-bar-error" id="spot-url-error" role="alert" hidden></p>
          </div>
        </div>
      </section>

      <section className="queue-section">
        <div className="content-wrap">
          <div className="queue-header">
            <div className="queue-title-group">
              <h2>Spotify Download Queue</h2>
              <p className="queue-subtitle">Track progress, cancel downloads, and manage completed tracks.</p>
            </div>
            <div className="queue-actions">
              <button type="button" id="btn-spot-start-all" className="btn-primary small">Start All</button>
              <button type="button" id="btn-spot-clear-done" className="btn-secondary">Clear Done</button>
            </div>
          </div>
          <div id="spot-queue">
            <div className="empty-state" id="spot-empty-state">
              <div className="empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <p>No Spotify downloads yet</p>
              <p className="empty-prompt">Paste a Spotify track link to get started.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default LegacySpotView;
