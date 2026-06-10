# QA Stress Test Report

| # | Test Case Description | Pipeline | Exit Code | Peak RAM (MB) | Duration (s) | Status | Last Error/Log |
|---|---|---|---|---|---|---|---|
| 1 | Valid YouTube (Rick Astley) | `yt-dlp` | 0 | 8.38 | 4.4 | **Success** | WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is  |
| 2 | Valid YouTube Short | `yt-dlp` | 1 | 8.41 | 2.2 | **Failed** | WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is  |
| 3 | Valid YouTube (Zoo) | `yt-dlp` | 0 | 8.39 | 3.5 | **Success** | WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is  |
| 4 | Valid YouTube (Gangnam Style) | `yt-dlp` | 0 | 8.38 | 4.2 | **Success** | WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is  |
| 5 | Valid YouTube (Perfect) | `yt-dlp` | 0 | 8.41 | 3.9 | **Success** | WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is  |
| 6 | Valid Spotify (Rick Astley) | `spt.py` | 1 | 35.71 | 3.7 | **Interrupted (Safe)** | Installed 8 packages in 180ms |
| 7 | Valid Spotify (Gangnam Style) | `spt.py` | 1 | 19.36 | 2.7 | **Interrupted (Safe)** | Traceback (most recent call last):   File "D:\Github2\MediaDl\spt.py", line 143, |
| 8 | Valid Spotify (Shape of You) | `spt.py` | 1 | 19.22 | 2.0 | **Interrupted (Safe)** | Traceback (most recent call last):   File "D:\Github2\MediaDl\spt.py", line 143, |
| 9 | Valid Spotify (Blinding Lights) | `spt.py` | 1 | 19.22 | 3.5 | **Interrupted (Safe)** | None |
| 10 | Valid Spotify (Other) | `spt.py` | 1 | 19.30 | 3.5 | **Interrupted (Safe)** | None |
| 11 | Chaos: Non-media site | `yt-dlp` | 1 | 8.38 | 2.9 | **Failed** | WARNING: [generic] Falling back on generic information extractor ERROR: Unsuppor |
| 12 | Chaos: Invalid protocol URL | `yt-dlp` | 1 | 8.35 | 1.9 | **Failed** | ERROR: Invalid URL 'https://': No host supplied |
| 13 | Chaos: Broken media domain | `yt-dlp` | 1 | 8.38 | 2.0 | **Failed** | ERROR: [generic] Unable to download webpage: HTTPSConnection(host='invalid-media |
| 14 | Chaos: Random string | `yt-dlp` | 1 | 8.38 | 2.2 | **Failed** | ERROR: [generic] 'just_a_random_string_with_no_url_structure' is not a valid URL |
| 15 | Chaos: Empty string | `yt-dlp` | 1 | 8.37 | 2.1 | **Failed** | ERROR: [generic] '' is not a valid URL |
| 16 | Chaos: Half YouTube link | `yt-dlp` | 0 | 8.38 | 3.3 | **Success** | [youtube:tab] Playlist recommended: Downloading 0 items | [download] Finished do |
| 17 | Chaos: Half Spotify link | `spt.py` | 1 | 19.21 | 1.5 | **Failed** | Traceback (most recent call last):   File "D:\Github2\MediaDl\spt.py", line 143, |
| 18 | Chaos: FTP protocol | `spt.py` | 1 | 19.17 | 1.6 | **Failed** | Traceback (most recent call last):   File "D:\Github2\MediaDl\spt.py", line 143, |
| 19 | Chaos: Connection refused | `spt.py` | 1 | 19.21 | 1.5 | **Failed** | Traceback (most recent call last):   File "D:\Github2\MediaDl\spt.py", line 143, |
| 20 | Chaos: Non-media Wikipedia | `spt.py` | 1 | 19.18 | 1.4 | **Failed** | Traceback (most recent call last):   File "D:\Github2\MediaDl\spt.py", line 143, |
