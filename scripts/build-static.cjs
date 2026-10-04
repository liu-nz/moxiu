const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
for (const entry of ['index.html', 'assets', 'src']) {
  fs.cpSync(path.join(root, entry), path.join(output, entry), { recursive: true });
}
console.log('Static game ready in dist/');
