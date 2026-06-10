const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Ensure output dir exists
const outputDir = path.join(__dirname, 'fuzz_output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

const testCases = [
  // 5 Valid YouTube URLs
  { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', type: 'yt-dlp', desc: 'Valid YouTube (Rick Astley)' },
  { url: 'https://www.youtube.com/shorts/3xR6RkG7oV0', type: 'yt-dlp', desc: 'Valid YouTube Short' },
  { url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', type: 'yt-dlp', desc: 'Valid YouTube (Zoo)' },
  { url: 'https://www.youtube.com/watch?v=9bZkp7q19f0', type: 'yt-dlp', desc: 'Valid YouTube (Gangnam Style)' },
  { url: 'https://www.youtube.com/watch?v=2Vv-BfVoq4g', type: 'yt-dlp', desc: 'Valid YouTube (Perfect)' },

  // 5 Valid Spotify URLs
  { url: 'https://open.spotify.com/track/4PTG3Z6ehGkBF3zIqYQGS3', type: 'spt.py', desc: 'Valid Spotify (Rick Astley)' },
  { url: 'https://open.spotify.com/track/1BxfuN26vjbSHm44l760t5', type: 'spt.py', desc: 'Valid Spotify (Gangnam Style)' },
  { url: 'https://open.spotify.com/track/7qiZjo2v6t5VjU1t3m6k3N', type: 'spt.py', desc: 'Valid Spotify (Shape of You)' },
  { url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b', type: 'spt.py', desc: 'Valid Spotify (Blinding Lights)' },
  { url: 'https://open.spotify.com/track/2t94l98QkXb6zPqY0e883m', type: 'spt.py', desc: 'Valid Spotify (Other)' },

  // 10 Chaos inputs
  { url: 'https://www.google.com', type: 'yt-dlp', desc: 'Chaos: Non-media site' },
  { url: 'https://', type: 'yt-dlp', desc: 'Chaos: Invalid protocol URL' },
  { url: 'https://invalid-media-url-that-does-not-exist.org/video.mp4', type: 'yt-dlp', desc: 'Chaos: Broken media domain' },
  { url: 'just_a_random_string_with_no_url_structure', type: 'yt-dlp', desc: 'Chaos: Random string' },
  { url: '', type: 'yt-dlp', desc: 'Chaos: Empty string' },
  { url: 'https://www.youtube.com/watch?v=', type: 'yt-dlp', desc: 'Chaos: Half YouTube link' },
  { url: 'https://open.spotify.com/track/', type: 'spt.py', desc: 'Chaos: Half Spotify link' },
  { url: 'ftp://ftp.funet.fi/pub/standards/RFC/rfc959.txt', type: 'spt.py', desc: 'Chaos: FTP protocol' },
  { url: 'http://127.0.0.1:9999/does-not-exist', type: 'spt.py', desc: 'Chaos: Connection refused' },
  { url: 'https://www.wikipedia.org', type: 'spt.py', desc: 'Chaos: Non-media Wikipedia' },
];

function getProcessMemory(pid) {
  try {
    const cmd = `powershell -NoProfile -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty WorkingSet"`;
    const output = execSync(cmd, { encoding: 'utf8' });
    const bytes = parseInt(output.trim(), 10);
    if (!isNaN(bytes)) {
      return bytes / (1024 * 1024); // Convert to MB
    }
  } catch (e) {
    // Process may have exited
  }
  return 0;
}

async function runTestCase(testCase, index) {
  console.log(`\n[${index + 1}/20] Testing URL: "${testCase.url || '(empty)'}" (${testCase.desc}) using ${testCase.type}...`);
  
  return new Promise((resolve) => {
    let proc;
    let stdout = '';
    let stderr = '';
    let peakMemory = 0;
    const startTime = Date.now();

    if (testCase.type === 'yt-dlp') {
      const ytdlp = path.join(__dirname, 'tools', 'yt-dlp.exe');
      const ffmpegDir = path.join(__dirname, 'tools');
      
      const args = [
        '--ffmpeg-location', ffmpegDir,
        '--simulate',
        '--no-playlist',
        testCase.url
      ];

      proc = spawn(ytdlp, args, {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });
    } else {
      const sptScript = path.join(__dirname, 'spt.py');
      proc = spawn('uv', ['run', sptScript, testCase.url || '', outputDir], {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });
    }

    let intervalId = setInterval(() => {
      if (proc.pid) {
        const mem = getProcessMemory(proc.pid);
        if (mem > peakMemory) {
          peakMemory = mem;
        }
      }
    }, 100);

    let timeoutId;
    if (testCase.type === 'spt.py' && testCase.desc.includes('Valid')) {
      timeoutId = setTimeout(() => {
        console.log(`  [Bandwidth Saver] Terminating ${testCase.type} download stream after 3 seconds...`);
        if (process.platform === 'win32') {
          try {
            execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
          } catch (_) {}
        } else {
          proc.kill('SIGKILL');
        }
      }, 3000);
    }

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const isCanceled = testCase.type === 'spt.py' && testCase.desc.includes('Valid') && (code === null || code === 1 || code === 15);
      
      const isSegFault = code === 3221225477 || code === 139;
      const isOOM = stderr.includes('heap out of memory') || stdout.includes('heap out of memory');
      const isFatal = isSegFault || isOOM;

      let status = 'Failed';
      if (code === 0) {
        status = 'Success';
      } else if (isCanceled) {
        status = 'Interrupted (Safe)';
      } else if (isFatal) {
        status = 'CRASHED';
      }

      console.log(`  Exit Code: ${code}, Peak Memory: ${peakMemory.toFixed(2)} MB, Duration: ${duration}s, Status: ${status}`);
      
      const lastLine = stderr.trim() || stdout.trim().split('\n').filter(Boolean).slice(-2).join(' | ');

      resolve({
        url: testCase.url,
        type: testCase.type,
        desc: testCase.desc,
        exitCode: code,
        peakMemory,
        duration,
        status,
        stderr: lastLine || 'None',
        isFatal
      });
    });
  });
}

async function main() {
  const results = [];
  console.log('=== MediaDl QA Pipeline Stress Test ===');
  console.log(`Starting fuzzer on 20 mixed inputs...\n`);

  for (let i = 0; i < testCases.length; i++) {
    const res = await runTestCase(testCases[i], i);
    results.push(res);

    if (res.isFatal) {
      console.log('\n[CRITICAL ERROR] Fatal Error Detected (Segmentation Fault or Out of Memory)! Stopping fuzzer immediately.');
      break;
    }
  }

  // Generate markdown report
  let md = `# QA Stress Test Report\n\n`;
  md += `| # | Test Case Description | Pipeline | Exit Code | Peak RAM (MB) | Duration (s) | Status | Last Error/Log |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;
  results.forEach((r, idx) => {
    const cleanErr = r.stderr.replace(/\r?\n/g, ' ').substring(0, 80);
    md += `| ${idx + 1} | ${r.desc} | \`${r.type}\` | ${r.exitCode} | ${r.peakMemory.toFixed(2)} | ${r.duration} | **${r.status}** | ${cleanErr} |\n`;
  });

  const reportPath = path.join(__dirname, 'fuzz_report.md');
  fs.writeFileSync(reportPath, md);
  console.log(`\nFuzz test completed! Report saved to [fuzz_report.md](file:///${reportPath.replace(/\\/g, '/')})`);
}

main();
