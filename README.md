# 🎬 MediaDl

A free, open-source Windows desktop app to download videos and music from YouTube, TikTok, Facebook, and 1000+ other sites.

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 📥 Download

👉 **[Click here to download the latest release](https://github.com/kevclint/MediaDl/releases/latest)**

> No installation needed — just download and run the `.exe` directly!

---

## ✨ Features

- 🎬 Download videos as **MP4**
- 🎵 Download audio as **MP3**
- 📺 Choose resolution: **144p, 360p, 480p, 720p, 1080p, 4K**
- 🔗 Paste **multiple URLs** at once
- 📋 **Download queue** — add as many videos as you want
- 📊 **Live progress bar** with file size and status
- 📁 Choose your own **download folder**
- 🌙 Clean modern **dark UI**

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
