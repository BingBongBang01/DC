import fs from 'fs';
import path from 'path';

const pngBase64 = 'iVBORw0KGgoAAAANSU6EUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const buffer = Buffer.from(pngBase64, 'base64');

fs.writeFileSync('assets/icons/icon16.png', buffer);
fs.writeFileSync('assets/icons/icon48.png', buffer);
fs.writeFileSync('assets/icons/icon128.png', buffer);
console.log('Icons generated successfully.');
