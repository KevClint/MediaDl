# 🎬 MediaDl 

![Version](https://img.shields.io/badge/version-2.2.0-6366f1)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

**MediaDl** is a high-performance, open-source Windows desktop application built for speed and simplicity. It provides a premium, "Linear-style" GUI for `yt-dlp` and `FFmpeg`, allowing you to download and process media from **YouTube, TikTok, Facebook, and 1000+ other sites** with a single click.

---

## 📥 Download

👉 **[Click here to download the latest release](https://github.com/kevclint/MediaDl/releases/latest)**

> **Portable & Lightweight:** No installation required. Just download the `.exe` and run it instantly.

---

## ✨ Features

### 🚀 Powerful Downloading
- **4K Support:** Download in the highest quality available (144p up to 4K).
- **Smart Queue:** Add unlimited URLs and manage them in a clean, organized list.
- **Batch Processing:** Paste multiple links at once to save time.
- **Live Metrics:** Real-time tracking of file size, download speed, and ETA using monospaced fonts for zero UI jitter.

### 🛠️ New: Media Tools (FFmpeg Powered)
- **Format Converter:** Seamlessly switch between MP4, MP3, MKV, and AVI.
- **Audio Extraction:** One-click high-fidelity "Video to MP3" conversion.
- **Drag & Drop:** Drop local files directly into the app to start processing instantly.
- **Success Cards:** Professional result cards with "Open Folder" and "Play" shortcuts.

### 🎨 Pro UI/UX Overhaul
- **Modern Sidebar:** Clean navigation between Home, Downloads, Tools, and Settings.
- **Responsive Scaling:** Content remains centered and professional even in fullscreen mode.
- **Command Bar:** A focused, high-end URL input area with integrated "Paste" logic.
- **8px Design System:** Perfectly balanced spacing, typography, and visual hierarchy.

---

## 📸 Screenshots

  <img width="942" alt="Dashboard View" src="https://github.com/user-attachments/assets/626490c8-2c48-45d0-ab05-66a02833be58" />
  <img width="890" height="691" alt="Screenshot 2026-02-15 194627" src="https://github.com/user-attachments/assets/9511594b-a2e6-4e4d-ab47-96ca703a7d66" />
  <img width="942" alt="Media Tools" src="https://github.com/user-attachments/assets/cfac6a06-5235-4b13-9afa-52a60655692c" />
  <img width="942" alt="Settings" src="https://github.com/user-attachments/assets/4d43331a-18d5-45cb-8d95-183979f69d4b" />


---

## 🌐 Supported Sites

| Site | Video | Audio |
|------|-------|-------|
| YouTube | ✅ | ✅ |
| TikTok | ✅ | ✅ |
| Facebook | ✅ | ✅ |
| Instagram | ✅ | ✅ |
| Twitter / X | ✅ | ✅ |
| 1000+ more | ✅ | ✅ |

> Full list: [yt-dlp supported sites](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md)

---

## 🛠️ Build From Source

### 1. Clone the repo

```bash
git clone https://github.com/kevclint/MediaDl.git
cd MediaDl
```

### 2. Install dependencies

```bash
npm install
```

### 3. Download required tools

Download these two files and place them inside the `tools/` folder:

| File | Download | Size |
|------|----------|------|
| `yt-dlp.exe` | [⬇️ Download](https://github.com/yt-dlp/yt-dlp/releases/download/2026.02.04/yt-dlp.exe) | ~9 MB |
| `ffmpeg.exe` | [⬇️ Download](https://sourceforge.net/projects/tumagcc/files/converters/ffmpeg.exe/download) | ~112 MB |

Your `tools/` folder should look like this:

```
MediaDl/
└── tools/
    ├── yt-dlp.exe   ✅
    └── ffmpeg.exe   ✅
```

### 4. Run the app

```bash
npm start
```

### 5. Build your own `.exe`

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY="false"
npm run build
```

Your `.exe` will appear in the `dist/` folder.

---

## 📦 Built With

- [Electron](https://electronjs.org) — Desktop app framework
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — Video downloading engine
- [FFmpeg](https://ffmpeg.org) — Audio/video conversion

---

## ⚠️ Legal Notice

This tool is intended for **personal use only**. Only download content you have permission to download. Respect copyright laws in your country.

---

## ⭐ Support

If you find this useful, give it a **star** on GitHub! It helps others discover the project. 🙏

[![Star on GitHub](https://img.shields.io/github/stars/kevclint/MediaDl?style=social)](https://github.com/kevclint/MediaDl/stargazers)
