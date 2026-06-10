const fs = require('fs');

// The fixed version of LegacyAppLayout.jsx is to:
// 1. Use single quotes for the outer string and double quotes inside
// 2. OR escape all the internal double quotes properly
// For now, let's read what the HTML content should be

const oldData = fs.readFileSync('renderer/components/legacy/LegacyAppLayout.jsx', 'utf8');
const firstLine = oldData.split('\n')[0];
console.log('first line length', firstLine.length);

// Extract the HTML from the broken first line
// It starts at const sidebarInnerHtml = " and should end at the next unescaped quote

// Let's reconstruct: use template literals instead
const match = firstLine.match(/const sidebarInnerHtml = "([\s\S]*?)(?:\\"|$)/);
if (match) {
  const htmlContent = match[1];
  console.log('extracted content length', htmlContent.length);
  console.log('first 100', JSON.stringify(htmlContent.slice(0, 100)));
  console.log('last 100', JSON.stringify(htmlContent.slice(-100)));
}

// The proper fix is to use backticks for the template literal
// Change: const sidebarInnerHtml = "...";
// To:     const sidebarInnerHtml = `...`;
// But need to replace \ u003c with < etc first

const htmlLines = oldData.split('\n');
const firstContentLine = htmlLines[0];
console.log('first content line ends with:', firstContentLine.slice(-40));
