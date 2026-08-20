const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, '../manifest.json');
const SRC_DIR = path.join(__dirname, '../src');

function parseManifest() {
  const data = fs.readFileSync(MANIFEST_PATH, 'utf-8');
  return JSON.parse(data);
}

function getWebAccessibleResources(manifest) {
  if (!manifest.web_accessible_resources) return [];
  const resources = new Set();
  for (const war of manifest.web_accessible_resources) {
    if (war.resources) {
      for (const res of war.resources) {
        if (res.startsWith('src/')) {
          resources.add(res.split('/')[1]); // e.g. "content" from "src/content/*"
        }
      }
    }
  }
  return Array.from(resources);
}

function findImportsInFile(filePath, visited, requiredDirs) {
  if (visited.has(filePath)) return;
  visited.add(filePath);

  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Basic regex to find static imports like `import { x } from '../foo/bar.js';`
  const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    
    if (importPath.startsWith('.')) {
      const dirName = path.dirname(filePath);
      let targetFile = path.resolve(dirName, importPath);
      if (!targetFile.endsWith('.js')) {
        targetFile += '.js';
      }
      
      const relativeToSrc = path.relative(SRC_DIR, targetFile);
      if (!relativeToSrc.startsWith('..')) {
        const topLevelDir = relativeToSrc.split(path.sep)[0];
        requiredDirs.add(topLevelDir);
        
        findImportsInFile(targetFile, visited, requiredDirs);
      }
    }
  }
}

function audit() {
  console.log('Web Accessible Resource Audit\n');
  const manifest = parseManifest();
  const warDirs = getWebAccessibleResources(manifest);
  
  const visited = new Set();
  const requiredDirs = new Set(['content']); // We know content script starts here
  
  const entryFile = path.join(SRC_DIR, 'content/index.js');
  console.log(`Entry:\nsrc/content/index.js\n`);
  
  findImportsInFile(entryFile, visited, requiredDirs);
  
  const requiredArray = Array.from(requiredDirs);
  
  console.log('Dependencies:');
  for (const req of requiredArray) {
    const isOk = warDirs.includes(req) || warDirs.includes('*');
    console.log(`${isOk ? 'OK' : 'MISSING'} src/${req}/*`);
  }
  
  console.log('\nMissing:');
  const missing = requiredArray.filter(req => !warDirs.includes(req) && !warDirs.includes('*'));
  if (missing.length === 0) {
    console.log('NONE');
    console.log('\nResult:\nPASS');
    process.exit(0);
  } else {
    for (const m of missing) {
      console.log(`- src/${m}/*`);
    }
    console.log('\nResult:\nFAIL');
    process.exit(1);
  }
}

audit();
