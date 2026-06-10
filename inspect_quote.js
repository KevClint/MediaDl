const fs = require('fs');
const data = fs.readFileSync('renderer/components/legacy/LegacyAppLayout.jsx', 'utf8');
const start = data.indexOf('const sidebarInnerHtml = "');
console.log('start', start);
const base = data.slice(start);
let inString = false;
let quoteStart = -1;
for (let i = 0; i < base.length; i++) {
  const ch = base[i];
  if (!inString) {
    if (base.slice(i, i + 24) === 'const sidebarInnerHtml = "') {
      inString = true;
      quoteStart = i + 23;
      i = quoteStart;
      continue;
    }
  } else {
    if (ch === '"') {
      let backslashes = 0;
      let j = i - 1;
      while (j >= 0 && base[j] === '\\') { backslashes++; j--; }
      if (backslashes % 2 === 0) {
        console.log('closing quote at', i, 'context', JSON.stringify(base.slice(i-20, i+20)));
        break;
      }
    }
  }
}
console.log('closing quote absolute', start + 23 + 1 + base.slice(24).indexOf('"')); // rough
const snippet = base.slice(0, 120);
console.log('snippet', JSON.stringify(snippet));
