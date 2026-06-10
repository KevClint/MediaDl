# /// script
# dependencies = [
#   "requests",
#   "beautifulsoup4",
# ]
# ///

import requests
from bs4 import BeautifulSoup
import json
import re
import os
import sys

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Origin": "https://spotidown.app",
    "Referer": "https://spotidown.app/en3"
}

def download_file(url, filename):
    """Streams the binary data from the signed CDN URL and writes it to disk."""
    print(f"[*] Initializing connection to media server...")

    with requests.get(url, headers=HEADERS, stream=True) as r:
        r.raise_for_status()
        total_size = int(r.headers.get('content-length', 0))
        
        print(f"[*] Downloading file ({total_size / (1024*1024):.2f} MB)...")
        downloaded = 0
        
        with open(filename, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    # Simple inline loading indicator for the terminal
                    if total_size:
                        percent = (downloaded / total_size) * 100
                        print(f"\rProgress: {percent:.1f}%", end="")
                        sys.stdout.flush()
        print("\n[+] Download completed successfully!")

def fetch_track(spotify_url, out_dir="."):
    session = requests.Session()
    session.headers.update(HEADERS)
    

    print("[*] Handshaking with spotidown.app...")
    response = session.get("https://spotidown.app/en3")
    if response.status_code != 200:
        print("[-] Base connection failed.")
        return

    soup = BeautifulSoup(response.text, 'html.parser')
    hidden_input = soup.find('input', type='hidden', attrs={'name': lambda x: x != 'g-recaptcha-response'})
    if not hidden_input:
        print("[-] Security structure changed on site.")
        return
        
    token_name = hidden_input.get('name')
    token_value = hidden_input.get('value')

    payload = {
        "url": spotify_url,
        "g-recaptcha-response": "", 
        token_name: token_value
    }


    print("[*] Processing initial parameters through /action...")
    api_response = session.post("https://spotidown.app/action", data=payload)
    
    try:
        html_content = api_response.json().get("data")
    except Exception:
        print("[-] Failed to process base tracking details.")
        return

    if not html_content or not isinstance(html_content, str):
        print("[-] Server returned no track data. The URL may be invalid or unsupported.")
        return

    track_soup = BeautifulSoup(html_content, 'html.parser')
    
    data_input  = track_soup.find('input', attrs={'name': 'data'})
    base_input  = track_soup.find('input', attrs={'name': 'base'})
    token_input = track_soup.find('input', attrs={'name': 'token'})
    
    if not data_input or not base_input or not token_input:
        print("[-] Security structure changed on site — required hidden fields missing.")
        return
    
    final_payload = {
        "data":  data_input.get('value', ''),
        "base":  base_input.get('value', ''),
        "token": token_input.get('value', '')
    }
    
    print("[*] Authorizing download signature via /action/track...")
    final_response = session.post("https://spotidown.app/action/track", data=final_payload)
    
    try:
        final_html = final_response.json().get("data")
    except Exception:
        print("[-] Validation backend rejected handshake inputs.")
        return

    if not final_html or not isinstance(final_html, str):
        print("[-] Final validation returned no data. Track may be geo-blocked or unavailable.")
        return


    result_soup = BeautifulSoup(final_html, 'html.parser')
    links = result_soup.find_all('a', id='popup')
    
    mp3_url = None
    cover_url = None
    
    for link in links:
        href_value = link.get('href', '')
        if "Download Cover" in link.get_text() or '"cover"' in href_value:
            cover_url = href_value
        else:
            mp3_url = href_value

    track_title_node = result_soup.find('h3', itemprop='name')
    track_title = track_title_node.get_text(strip=True) if track_title_node else "Unknown_Track"


    safe_title = re.sub(r'[\\/*?:"<>|]', "", track_title).replace(" ", "_")
    filename = os.path.join(out_dir, f"{safe_title}.mp3")

    print("\n" + "="*50)
    print(f"🎵 TRACK IDENTIFIED: {track_title}")
    print("="*50)
    
    if mp3_url:
        print(f"[+] Found direct stream token pipeline.")

        try:
            download_file(mp3_url, filename)
            print(f"[+] Saved file as: {os.path.abspath(filename)}")
        except Exception as e:
            print(f"[-] Data stream execution failed: {e}")
    else:
        print("[-] Could not isolate the core MP3 token parameter link.")
        
    print("="*50)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        url_input = sys.argv[1]
        out_directory = sys.argv[2] if len(sys.argv) > 2 else "."
    else:
        url_input = input("Enter Spotify Track URL: ")
        out_directory = "."
    
    fetch_track(url_input, out_directory)