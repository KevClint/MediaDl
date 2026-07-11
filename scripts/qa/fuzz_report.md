# QA Stress Test Report

| # | Test Case Description | Pipeline | Exit Code | Peak RAM (MB) | Duration (s) | Status | Last Error/Log |
|---|---|---|---|---|---|---|---|
| 1 | Valid YouTube (Rick Astley) | `yt-dlp` | 0 | 9.27 | 3.3 | **Success** | WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is  |
| 2 | Valid YouTube Short | `yt-dlp` | 1 | 9.28 | 2.0 | **Failed** | WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is  |
| 3 | Valid YouTube (Zoo) | `yt-dlp` | 0 | 9.28 | 2.6 | **Success** | WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is  |
| 4 | Valid YouTube (Gangnam Style) | `yt-dlp` | 0 | 9.27 | 3.7 | **Success** | WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is  |
| 5 | Valid YouTube (Perfect) | `yt-dlp` | 0 | 9.32 | 3.4 | **Success** | WARNING: [youtube] No supported JavaScript runtime could be found. Only deno is  |
| 6 | Valid Spotify (Rick Astley) | `spt.py` | 0 | 20.64 | 1.5 | **Success** | [*] Processing initial parameters through /action... | [-] Server returned no t |
| 7 | Valid Spotify (Gangnam Style) | `spt.py` | 0 | 20.65 | 1.4 | **Success** | [*] Processing initial parameters through /action... | [-] Server returned no t |
| 8 | Valid Spotify (Shape of You) | `spt.py` | 0 | 20.66 | 1.2 | **Success** | [*] Processing initial parameters through /action... | [-] Server returned no t |
| 9 | Valid Spotify (Blinding Lights) | `spt.py` | 1 | 20.66 | 3.5 | **Interrupted (Safe)** | None |
| 10 | Valid Spotify (Other) | `spt.py` | 0 | 20.67 | 1.6 | **Success** | [*] Processing initial parameters through /action... | [-] Server returned no t |
| 11 | Chaos: Non-media site | `yt-dlp` | 1 | 9.28 | 3.1 | **Failed** | WARNING: [generic] Falling back on generic information extractor ERROR: Unsuppor |
| 12 | Chaos: Invalid protocol URL | `yt-dlp` | 1 | 9.28 | 1.9 | **Failed** | ERROR: Invalid URL 'https://': No host supplied |
| 13 | Chaos: Broken media domain | `yt-dlp` | 1 | 9.29 | 2.0 | **Failed** | ERROR: [generic] Unable to download webpage: HTTPSConnection(host='invalid-media |
| 14 | Chaos: Random string | `yt-dlp` | 1 | 9.28 | 1.8 | **Failed** | ERROR: [generic] 'just_a_random_string_with_no_url_structure' is not a valid URL |
| 15 | Chaos: Empty string | `yt-dlp` | 1 | 9.29 | 1.8 | **Failed** | ERROR: [generic] '' is not a valid URL |
| 16 | Chaos: Half YouTube link | `yt-dlp` | 0 | 9.28 | 2.9 | **Success** | [youtube:tab] Playlist recommended: Downloading 0 items | [download] Finished do |
| 17 | Chaos: Half Spotify link | `spt.py` | 0 | 20.63 | 1.4 | **Success** | [*] Processing initial parameters through /action... | [-] Server returned no t |
| 18 | Chaos: FTP protocol | `spt.py` | 0 | 20.67 | 1.6 | **Success** | [*] Processing initial parameters through /action... | [-] Server returned no t |
| 19 | Chaos: Connection refused | `spt.py` | 0 | 20.64 | 1.5 | **Success** | [*] Processing initial parameters through /action... | [-] Server returned no t |
| 20 | Chaos: Non-media Wikipedia | `spt.py` | 0 | 20.63 | 1.4 | **Success** | [*] Processing initial parameters through /action... | [-] Server returned no t |
