<div align="center">

# 🎬 MediaDl

[![Version](https://img.shields.io/badge/version-2.4.0-6366f1?style=for-the-badge)](https://github.com/kevclint/MediaDl/releases)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey?style=for-the-badge)](https://github.com/kevclint/MediaDl/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)

**A high-performance, open-source media downloader built for speed.**

MediaDl provides a premium, "Linear-style" GUI for `yt-dlp` and `FFmpeg`. Download and process media from **YouTube, TikTok, Facebook, and 1000+ other sites** with a single click.

[**📥 Download Latest Release**](https://github.com/kevclint/MediaDl/releases/latest)

*..Downloading Videos and Music Made Simple..*

</div>

---

## ✨ Key Features

### 📥 Effortless Downloading
* **High Quality:** Supports everything from 144p to **4K**.
* **Smart Queue:** Easily manage multiple downloads in one organized list.
* **Batch Paste:** Add multiple links at once to save time.
* **Live Stats:** Real-time tracking of speed, file size, and progress.

### 🛠️ Built-in Media Tools
* **Fast Converter:** Switch between MP4, MP3, MKV, and AVI.
* **Audio Extractor:** Quickly turn any video into a high-quality MP3.
* **Drag & Drop:** Drop local files into the app to start processing instantly.
* **Quick Actions:** Instant "Open Folder" and "Play" shortcuts once finished.

### 🎨 Modern Design
* **Clean Navigation:** Simple sidebar to switch between Home, Tools, and Settings.
* **Smart Input:** A focused search bar that detects links from your clipboard.
* **Sleek Layout:** A professional, easy-to-read interface designed for speed.

---

## 📸 Interface

<table>
  <tr>
    <td><img width="843" height="978" alt="Screenshot 2026-02-18 225836" src="https://github.com/user-attachments/assets/4eef4978-eec9-459c-8041-798b8f9c580b" /></td>
    <td><img width="838" height="982" alt="Screenshot 2026-02-18 225843" src="https://github.com/user-attachments/assets/ab5f036b-f69c-40c2-b86e-8fa913dda2f9" /></td>
  </tr>
  <tr>
    <td><img width="838" height="986" alt="Screenshot 2026-02-18 225900" src="https://github.com/user-attachments/assets/af885af3-7262-4c37-8465-9829c01b1a02" /></td>
    <td><img width="836" height="977" alt="Screenshot 2026-02-18 225909" src="https://github.com/user-attachments/assets/b307709f-7821-4d22-bce9-2e5688e2b1b0" /></td>
  </tr>
</table>


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

### 3. Install Rust toolchain (required by Tauri)

```bash
rustup toolchain install stable
```

### 4. Download required tools

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

### 5. Run the app

```bash
npm start
```

### 6. Build your own `.exe` (Tauri)

```powershell
npm run build
```

Your `.exe` will appear in the `dist/` folder.

---

## 📦 Built With

- [Tauri 2.0](https://tauri.app) — Desktop app framework
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — Video downloading engine
- [FFmpeg](https://ffmpeg.org) — Audio/video conversion

---

## ⚠️ Legal Notice

-This tool is intended for **personal use only**. Only download content you have permission to download. Respect copyright laws in your country.
-Check out the MIT license for more info...

---

<div align="center">
  
⭐ Support

If you find this useful, give it a **star** on GitHub! It helps others discover the project. 🙏

[![Star on GitHub](https://img.shields.io/github/stars/kevclint/MediaDl?style=social)](https://github.com/kevclint/MediaDl/stargazers)

[![Star History Chart](https://api.star-history.com/svg?repos=KevClint/MediaDl&type=date&legend=top-left)](https://www.star-history.com/#KevClint/MediaDl&type=date&legend=top-left)

</div>

