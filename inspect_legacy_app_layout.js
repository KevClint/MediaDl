const fs = require('fs');
const path = 'renderer/components/legacy/LegacyAppLayout.jsx';
const data = fs.readFileSync(path, 'utf8');
console.log('length', data.length);
const idx = data.indexOf('const sidebarInnerHtml');
console.log('idx', idx);
const end_quote = data.indexOf('";', idx);
console.log('end_quote', end_quote);
console.log('snippet_end', JSON.stringify(data.slice(end_quote-40, end_quote+10)));

const body = data.slice(idx, end_quote);
let lastBackslash = false;
for (let i = 0; i < body.length; i++) {
  const ch = body[i];
  if (ch === '"' && !lastBackslash) {
    console.log('unescaped quote at', i, 'context', JSON.stringify(body.slice(i-20, i+20)));
    break;
  }
  if (ch === '\\' && !lastBackslash) {
    lastBackslash = true;
  } else {
    lastBackslash = false;
  }
}

const badEscapes = [];
for (let i = 0; i < body.length; i++) {
  if (body[i] === '\\') {
    const next = body[i+1];
    if (!next) { badEscapes.push(['eof', i]); break; }
    if (next === 'u') {
      const hex = body.substr(i+2, 4);
      if (!/^[0-9A-Fa-f]{4}$/.test(hex)) {
        badEscapes.push(['u', i, hex]);
        break;
      }
    } else if (next === 'x') {
      const hex = body.substr(i+2, 2);
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) {
        badEscapes.push(['x', i, hex]);
        break;
      }
    } else if (!['"', "'", '0','b','f','n','r','t','v','x','u','/', '\\'].includes(next)) {
      badEscapes.push(['invalid', i, next]);
      break;
    }
  }
}
console.log('badEscapes', badEscapes.slice(0, 10));
try {
  const parser = require('@babel/parser');
  parser.parse(data, { sourceType: 'module', plugins: ['jsx'] });
  console.log('babel parse ok');
} catch (e) {
  console.error('babel parse failed', e.message, e.loc);
}
