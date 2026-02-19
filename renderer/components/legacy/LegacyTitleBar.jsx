function LegacyTitleBar() {
  return (
    <div className="title-bar">
      <div className="title-bar-left">
        <img src="/icon.ico" className="app-logo" alt="" aria-hidden="true" />
        <span className="app-name">MediaDl</span>
      </div>
      <div className="title-bar-buttons">
        <button id="btn-min" type="button" aria-label="Minimize">
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 5h8" />
          </svg>
        </button>
        <button id="btn-max" type="button" aria-label="Maximize">
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <rect x="1.5" y="1.5" width="7" height="7" />
          </svg>
        </button>
        <button id="btn-close" type="button" className="close-btn" aria-label="Close">
          <svg viewBox="0 0 10 10" aria-hidden="true">
            <path d="M2 2l6 6M8 2L2 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default LegacyTitleBar;
