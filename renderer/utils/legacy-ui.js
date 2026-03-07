export const DISPLAY_TITLE_MAX_CHARS = 12;
export const FILE_TITLE_MAX_CHARS = 40;

export function compactTitle(rawTitle, maxChars = DISPLAY_TITLE_MAX_CHARS) {
  const text = String(rawTitle || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars)).trim()}...`;
}

export function buildFileTitle(rawTitle, maxChars = FILE_TITLE_MAX_CHARS) {
  const text = String(rawTitle || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[<>:\"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/[^\x20-\x7E]+/g, " ")
    .trim();

  if (!text) return "";

  const underscored = text
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/\.+$/g, "")
    .replace(/^[_\-.]+|[_\-.]+$/g, "");

  if (!underscored) return "";
  return underscored.slice(0, maxChars).replace(/^[_\-.]+|[_\-.]+$/g, "");
}

export function statusLabel(status) {
  if (status === "completed") return "complete";
  if (status === "failed") return "failed";
  if (status === "canceled") return "canceled";
  if (status === "fetching") return "fetching info...";
  if (status === "processing") return "processing...";
  return status;
}

export function createNode(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function detectSite(hostname) {
  if (!hostname) return { name: "none", iconSvg: null };
  const h = hostname.toLowerCase();

  if (h.includes("youtube") || h.includes("youtu.be")) {
    return {
      name: "YouTube",
      iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
    };
  }
  if (h.includes("tiktok")) {
    return {
      name: "TikTok",
      iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>',
    };
  }
  if (h.includes("facebook") || h.includes("fb.")) {
    return {
      name: "Facebook",
      iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>',
    };
  }
  if (h.includes("twitter.com") || h.includes("x.com")) {
    return {
      name: "Twitter/X",
      iconSvg: '<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.25l-4.89-7.06L5.9 22H2.8l7.23-8.26L.8 2h6.35l4.42 6.38L18.9 2zm-1.09 18h1.73L6.2 3.9H4.34L17.81 20z"/></svg>',
    };
  }
  if (h.includes("instagram")) return { name: "Instagram", iconSvg: null };
  if (h.includes("reddit")) return { name: "Reddit", iconSvg: null };
  if (h.includes("twitch")) return { name: "Twitch", iconSvg: null };
  if (h.includes("vimeo")) return { name: "Vimeo", iconSvg: null };
  if (h.includes("dailymotion")) return { name: "Dailymotion", iconSvg: null };
  if (h.includes("soundcloud")) return { name: "SoundCloud", iconSvg: null };
  if (h.includes("bilibili")) return { name: "Bilibili", iconSvg: null };

  return { name: "none", iconSvg: null };
}

export function getSiteIconSvg(hostname) {
  const site = detectSite(hostname);
  if (site.iconSvg) return site.iconSvg;
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
}

export function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = createNode("div", `toast ${type}`);
  toast.setAttribute("role", "status");
  toast.textContent = message;
  container.appendChild(toast);
  const duration = 3500;
  setTimeout(() => {
    toast.style.animation = "toast-in 0.2s ease reverse forwards";
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

export function normalizedPercent(value) {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return 0;
  if (safe < 0) return 0;
  if (safe > 100) return 100;
  return safe;
}

export function friendlyError(message) {
  if (!message) return "Unknown error occurred.";
  const text = String(message);

  if (text.includes("canceled")) return "Download canceled by user.";
  if (text.includes("Private video")) return "This video is private.";
  if (text.includes("unavailable")) return "Video is unavailable or has been removed.";
  if (text.includes("Sign in")) return "This content requires login to access.";
  if (text.includes("ETIMEDOUT")) return "Connection timed out. Check your internet.";
  if (text.includes("ENOTFOUND")) return "Network error. Check your internet connection.";
  if (text.includes("Unsupported URL")) return "This URL or site is not supported.";
  if (text.includes("timed out")) return "Download timed out after 10 minutes.";
  if (text.includes("429")) return "Too many requests. Please wait and try again.";
  if (text.includes("[Errno 22] Invalid argument")) {
    return "Windows rejected the generated file path/name. Try a shorter output folder path and retry.";
  }
  if (text.includes("Requested format is not available")) {
    return "Selected quality is unavailable for this video. Try a lower resolution.";
  }
  if (text.includes("cookies") || text.includes("login required")) {
    return "This content requires login/cookies to download.";
  }
  return text.slice(0, 240);
}
