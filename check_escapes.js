const fs = require('fs');
const data = fs.readFileSync('renderer/components/legacy/LegacyAppLayout.jsx', 'utf8');
for (let i = 0; i < data.length; i++) {
  if (data[i] === '\\') {
    const seq = data.slice(i, i + 6);
    console.log(i, JSON.stringify(seq));
  }
}
