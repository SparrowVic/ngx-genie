const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const SVG_DIR = path.join(SCRIPT_DIR, '..', 'assets', 'svg');
const OUTPUT_DIR = path.join(SCRIPT_DIR, '..', 'resources', 'icons');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'icons.ts');

console.log('--- GENIE SVG GENERATOR ---');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, {recursive: true});
}

function generateIcons() {
  try {
    const files = fs.readdirSync(SVG_DIR).filter(file => file.endsWith('.svg'));

    if (files.length === 0) {
      console.warn('Not found .svg!');
      return;
    }

    let outputContent = '// THIS FILE IS AUTO-GENERATED - DO NOT EDIT\n\n';
    outputContent += 'export const GENIE_ICONS = {\n';

    files.forEach(file => {
      const filePath = path.join(SVG_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const cleanContent = content.replace(/\r?\n|\r/g, '');
      const key = file.replace('.svg', '').toUpperCase().replace(/-/g, '_');

      outputContent += `  ${key}: '${cleanContent}',\n`;
    });

    outputContent += '};\n';

    fs.writeFileSync(OUTPUT_FILE, outputContent);
    console.log(`✅ Success! File generated: ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('❌ Error while icons generating:', error);
    process.exit(1);
  }
}

generateIcons();
