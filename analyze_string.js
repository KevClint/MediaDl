const fs = require('fs');
const data = fs.readFileSync('renderer/components/legacy/LegacyAppLayout.jsx', 'utf8');
const start = data.indexOf('const sidebarInnerHtml = "');
if (start === -1) {
  throw new Error('start not found');
}
const quoteStart = data.indexOf('"', start + 1);
let inString = false;
let escaped = false;
let stringStart = -1;
for (let i = start; i < data.length; i++) {
  const ch = data[i];
  if (!inString) {
    if (ch === '"') {
      inString = true;
      stringStart = i;
      escaped = false;
    }
  } else {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      console.log('closing quote at', i);
      console.log('context', JSON.stringify(data.slice(i-20, i+20)));
      console.log('slice end', JSON.stringify(data.slice(i-5, i+5)));
      return;
    }
  }
}
console.log('no closing quote found');
console.log('last 40 chars', JSON.stringify(data.slice(-40)));
