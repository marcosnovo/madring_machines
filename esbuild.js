const esbuild = require('esbuild');
const fs = require('fs');

// Create a wrapper that imports Phaser before game.js
const wrapper = `import Phaser from 'phaser';
${fs.readFileSync('game.js', 'utf8')}`;

fs.writeFileSync('game-with-phaser.js', wrapper);

esbuild.build({
  entryPoints: ['game-with-phaser.js'],
  bundle: true,
  outfile: 'dist/bundle.js',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  sourcemap: false,
}).then(() => {
  fs.unlinkSync('game-with-phaser.js');
}).catch(() => process.exit(1));
