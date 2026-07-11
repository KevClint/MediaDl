const sidebarInnerHtml = `<button type="button" class="sidebar-nav-item active" data-view="home" aria-label="Home" title="Home">
        <span class="sidebar-nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </span>
        <span class="sidebar-nav-label">Home</span>
      </button>
      <button type="button" class="sidebar-nav-item" data-view="downloads" aria-label="Downloads" title="Downloads">
        <span class="sidebar-nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </span>
        <span class="sidebar-nav-label">Downloads</span>
      </button>
      <button type="button" class="sidebar-nav-item" data-view="tools" aria-label="Media Tools" title="Media Tools">
        <span class="sidebar-nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
            <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" />
          </svg>
        </span>
        <span class="sidebar-nav-label">Media Tools</span>
      </button>
      <button type="button" class="sidebar-nav-item" data-view="spot" aria-label="Spotify downloader" title="Spotify downloader">
        <span class="sidebar-nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.980-8.159-2.58-12.039-1.541-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.079 9.6 14.399 10.2 17.98 12.42c.361.21.599.659.301 1.08zm.140-3.438c-3.899-2.319-10.259-2.52-13.979-1.38-.601.179-1.2-.041-1.38-.62-.18-.601.041-1.2.62-1.381 4.100-1.319 11.020-1.077 15.679 1.598.56.343.799 1.02.456 1.58-.343.56-1.019.799-1.576.457z" />
          </svg>
        </span>
        <span class="sidebar-nav-label">Spot</span>
      </button>
      <button type="button" class="sidebar-nav-item" data-view="settings" aria-label="Settings" title="Settings">
        <span class="sidebar-nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m2.98 2.98l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m2.98-2.98l4.24-4.24" />
          </svg>
        </span>
        <span class="sidebar-nav-label">Settings</span>
      </button>
      <div class="sidebar-divider"></div>
      <div class="sidebar-about">
        <div class="sidebar-about-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
        </div>
        <button type="button" class="sidebar-about-btn" id="btn-about-github" aria-label="Open GitHub repository" title="GitHub repo">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
        </button>
        <div class="sidebar-about-text">
          <span class="sidebar-about-caption">Support This</span>
          <span class="sidebar-about-caption">Repo</span>
          <span class="sidebar-about-credit">By KevClint</span>
        </div>
      </div>
`;

function LegacyAppLayout({ children }) {
  return (
    <div className="app-layout">
      <nav
        className="sidebar"
        aria-label="Main navigation"
        dangerouslySetInnerHTML={{ __html: sidebarInnerHtml }}
      />
      <main className="main-content">{children}</main>
    </div>
  );
}

export default LegacyAppLayout;
