const fs = require('fs');
const path = 'public/js/render-tables.js';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

const cleaned = [];
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "html += '<div class=\"data-table-wrapper\"><table class=\"data-table\">';" && cleaned.length && cleaned[cleaned.length - 1].trim() === "let html = '<div class=\"data-table-wrapper\"><table class=\"data-table\">';") {
        // skip duplicate line
        continue;
    }
    cleaned.push(line.replace("';\\r\\n", "';"));
}

fs.writeFileSync(path, cleaned.join('\n'));
