import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Minimal 1x1 transparent PNG buffer as fallback icon placeholder
const pngBase64 = 'iVBORw0KGgoAAAANSU6EUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const pngBuffer = Buffer.from(pngBase64, 'base64');

['icon16.png', 'icon48.png', 'icon128.png'].forEach(filename => {
  const filePath = path.join(__dirname, filename);
  fs.writeFileSync(filePath, pngBuffer);
  console.log(`Created icon placeholder: ${filePath}`);
});
