const fs = require('fs');
const path = require('path');

const libs = [
  {
    src: path.join(
      __dirname,
      '..',
      'node_modules',
      'sortablejs',
      'Sortable.min.js'
    ),
    dest: path.join(
      __dirname,
      '..',
      'src',
      'renderer',
      'js',
      'lib',
      'Sortable.min.js'
    ),
  },
];

function copyLibs() {
  console.log('📦 Vendor Init: Copying frontend libraries...');

  libs.forEach((lib) => {
    const destDir = path.dirname(lib.dest);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    if (fs.existsSync(lib.src)) {
      fs.copyFileSync(lib.src, lib.dest);
      console.log(`   ✔ Copied: ${path.basename(lib.src)}`);
    } else {
      console.error(
        `   ❌ Missing: ${lib.src}\n      (Run 'npm install' first)`
      );
    }
  });
}

copyLibs();
