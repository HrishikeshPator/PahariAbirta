const fs = require('fs');
const path = require('path');

function replaceInFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== '.firebase') {
        replaceInFiles(filePath);
      }
    } else if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
      let content = fs.readFileSync(filePath, 'utf8');
      let original = content;

      // Replace href="index.html..." with href="/..."
      content = content.replace(/href="index\.html([#"])/g, 'href="/$1');

      // Replace other .html links
      content = content.replace(/href="(about|advertise|category|privacy|terms|search|admin|article)\.html([#\? "'])/g, 'href="/$1$2');

      // Replace form actions
      content = content.replace(/action="(about|advertise|category|privacy|terms|search|admin|article)\.html([#\? "'])/g, 'action="/$1$2');

      // In script.js specifically
      if (filePath.endsWith('script.js')) {
        content = content.replace('let articlePath = "article.html";', 'let articlePath = "/article";');
        content = content.replace('let catPath = "category.html";', 'let catPath = "/category";');
        content = content.replace('window.location.pathname.includes(".html")', 'false'); // clean URLs won't include .html
      }

      if (content !== original) {
        fs.writeFileSync(filePath, content);
        console.log('Updated ' + filePath);
      }
    }
  }
}

replaceInFiles('.');
