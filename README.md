<div align="center">

# 🎬 MediaDl

[![Version](https://img.shields.io/badge/version-2.3.0-6366f1?style=for-the-badge)](https://github.com/kevclint/MediaDl/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey?style=for-the-badge)](https://github.com/kevclint/MediaDl/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)

**A high-performance, open-source media downloader built for speed.**

MediaDl provides a premium, "Linear-style" GUI for `yt-dlp` and `FFmpeg`. Download and process media from **YouTube, TikTok, Facebook, and 1000+ other sites** with a single click.

[**📥 Download Latest Release**](https://github.com/kevclint/MediaDl/releases/latest)

*Portable & Lightweight — No installation required.*

</div>

---

## ✨ Features

### 🚀 Powerful Downloading
* **4K Support:** Download in the highest quality available (from 144p up to 4K).
* **Smart Queue:** Add unlimited URLs and manage them in a clean, organized list.
* **Batch Processing:** Paste multiple links at once to save time.
* **Live Metrics:** Real-time tracking of file size, speed, and ETA with zero UI jitter.

### 🛠️ Media Tools (FFmpeg Powered)
* **Format Converter:** Seamlessly switch between MP4, MP3, MKV, and AVI.
* **Audio Extraction:** One-click high-fidelity "Video to MP3" conversion.
* **Drag & Drop:** Drop local files directly into the app to start processing instantly.
* **Success Cards:** Professional result cards with "Open Folder" and "Play" shortcuts.

### 🎨 Pro UI/UX
* **Modern Sidebar:** Clean navigation between Home, Downloads, Tools, and Settings.
* **Command Bar:** A focused, high-end URL input area with smart clipboard detection.
* **8px Design System:** Perfectly balanced spacing, typography, and visual hierarchy.

---

## 📸 Interface

<div align="center">
  <img width="800" alt="Dashboard View" src="https://github.com/user-attachments/assets/626490c8-2c48-45d0-ab05-66a02833be58" />
</div>

<br>

<div align="center">
  <table>
    <tr>
      <td width="50%">
        <h4 align="center">Smart Queue</h4>
        <img src="https://github.com/user-attachments/assets/9511594b-a2e6-4e4d-ab47-96ca703a7d66" alt="Smart Queue" width="100%">
      </td>
      <td width="50%">
        <h4 align="center">Media Tools</h4>
        <img src="https://github.com/user-attachments/assets/cfac6a06-5235-4b13-9afa-52a60655692c" alt="Media Tools" width="100%">
      </td>
    </tr>
  </table>
</div>

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

[![Star History Chart](https://api.star-history.com/svg?repos=KevClint/MediaDl&type=date&legend=top-left)](https://www.star-history.com/#KevClint/MediaDl&type=date&legend=top-left)

