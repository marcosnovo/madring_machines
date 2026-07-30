#!/usr/bin/env node
/**
 * generate-screenshots.js
 *
 * Generates a PNG screenshot of every Micro Machines map and updates README.md.
 *
 * Usage:
 *   npm run screenshots
 *
 * Prerequisites (first time only):
 *   npm install
 *   npx playwright install chromium
 */

'use strict';

const { chromium } = require('playwright');
const esbuild = require('esbuild');
const http = require('http');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const IMAGES_DIR = path.join(ROOT, 'images');
const MAPS_YAML = path.join(ROOT, 'maps.yml');
const README_PATH = path.join(ROOT, 'README.md');

const PORT = 7234;
const MAX_W = 800; // max screenshot width in pixels (large tracks are scaled down)

const MAPS_START = '<!-- MAPS_START -->';
const MAPS_END = '<!-- MAPS_END -->';

// ── Static file server ─────────────────────────────────────────────────────────

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

      // Safety: prevent directory traversal
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(err.code === 'ENOENT' ? 404 : 500);
          res.end(err.message);
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    server.listen(PORT, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

// ── README map section builder ─────────────────────────────────────────────────

function buildMapsSection(maps) {
  const rows = maps
    .map((m, i) => {
      const imgSrc = `images/map-${m.id}.png`;
      return [
        `    <tr>`,
        `      <td align="center">${i + 1}</td>`,
        `      <td><strong>${m.name}</strong></td>`,
        `      <td><img src="${imgSrc}" width="240" alt="${m.name}"></td>`,
        `      <td>${m.inspiration}</td>`,
        `      <td>${m.theme}</td>`,
        `    </tr>`,
      ].join('\n');
    })
    .join('\n');

  return [
    MAPS_START,
    '## Maps',
    '',
    `${maps.length} tracks, each with a unique theme and visual style.`,
    '',
    '<table>',
    '  <thead>',
    '    <tr>',
    '      <th>#</th>',
    '      <th>Map</th>',
    '      <th>Screenshot</th>',
    '      <th>Inspiration</th>',
    '      <th>Theme</th>',
    '    </tr>',
    '  </thead>',
    '  <tbody>',
    rows,
    '  </tbody>',
    '</table>',
    '',
    MAPS_END,
  ].join('\n');
}

function updateReadme(maps) {
  let readme = fs.readFileSync(README_PATH, 'utf8');
  const section = buildMapsSection(maps);

  const startIdx = readme.indexOf(MAPS_START);
  const endIdx = readme.indexOf(MAPS_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing section between sentinels
    readme =
      readme.slice(0, startIdx) +
      section +
      readme.slice(endIdx + MAPS_END.length);
  } else {
    // Insert before ## Credits; fall back to appending
    const creditsIdx = readme.indexOf('\n## Credits');
    if (creditsIdx !== -1) {
      readme =
        readme.slice(0, creditsIdx) +
        '\n\n' +
        section +
        readme.slice(creditsIdx);
    } else {
      readme = readme.trimEnd() + '\n\n' + section + '\n';
    }
  }

  fs.writeFileSync(README_PATH, readme);
  console.log('✓ README.md updated');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const config = yaml.load(fs.readFileSync(MAPS_YAML, 'utf8'));
  const maps = config.maps;

  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  const server = await startServer();
  console.log(`Server: http://127.0.0.1:${PORT}/`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1024, height: 768 });

  // Suppress console noise from the game
  page.on('console', () => {});
  page.on('pageerror', err => console.warn('Page error:', err.message));

  // Build a fresh bundle from current game.js, with hooks for screenshots:
  //  - Force Canvas renderer (more reliable in headless environments)
  //  - Expose Phaser game instance and TRACKS array for the harness
  console.log('Building bundle for screenshots…');
  const gameSrc = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8')
    .replace(/type\s*:\s*Phaser\.AUTO/, 'type: Phaser.CANVAS')
    .replace(
      /^new Phaser\.Game\(config\);/m,
      'globalThis.__phaserGame = new Phaser.Game(config); globalThis.TRACKS = TRACKS;',
    );
  const wrapped = `import Phaser from 'phaser';\n${gameSrc}\n`;
  const buildResult = await esbuild.build({
    stdin: { contents: wrapped, resolveDir: ROOT, loader: 'js' },
    bundle: true,
    write: false,
    platform: 'browser',
    target: 'es2020',
    minify: false,
    sourcemap: false,
  });
  const bundleJs = buildResult.outputFiles[0].text;

  // Intercept the bundle URL and serve our screenshot-instrumented build instead
  await page.route('**/dist/bundle.js', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: bundleJs,
    });
  });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });

    console.log('Waiting for tracks to generate…');
    await page.waitForFunction(
      () =>
        typeof TRACKS !== 'undefined' &&
        TRACKS.length > 0 &&
        TRACKS.every(t => Array.isArray(t.wp) && t.wp.length > 0),
      { timeout: 60_000 },
    );
    console.log('Tracks ready!');

    // Validate YAML vs game
    const trackCount = await page.evaluate(() => TRACKS.length);
    if (trackCount !== maps.length) {
      console.warn(
        `⚠  maps.yml has ${maps.length} entries but game has ${trackCount} tracks — check alignment`,
      );
    }

    // Extract and save screenshots one track at a time
    let saved = 0;
    for (let idx = 0; idx < maps.length; idx++) {
      const map = maps[idx];

      const dataURL = await page.evaluate(
        ({ idx, maxW }) => {
          const game = window.__phaserGame;
          const tex = game.textures.get('tv_' + idx);
          if (!tex) return null;

          const canvas = tex.getSourceImage();
          if (!canvas || typeof canvas.toDataURL !== 'function') return null;

          if (canvas.width > maxW) {
            const scale = maxW / canvas.width;
            const tmp = document.createElement('canvas');
            tmp.width = maxW;
            tmp.height = Math.round(canvas.height * scale);
            tmp.getContext('2d').drawImage(canvas, 0, 0, tmp.width, tmp.height);
            return tmp.toDataURL('image/png');
          }

          return canvas.toDataURL('image/png');
        },
        { idx, maxW: MAX_W },
      );

      if (dataURL) {
        const buf = Buffer.from(dataURL.split(',')[1], 'base64');
        const filename = `map-${map.id}.png`;
        fs.writeFileSync(path.join(IMAGES_DIR, filename), buf);
        console.log(`  ✓ [${String(idx + 1).padStart(2, ' ')}/${maps.length}] ${map.name} → images/${filename}`);
        saved++;
      } else {
        console.warn(`  ⚠ [${String(idx + 1).padStart(2, ' ')}/${maps.length}] ${map.name} — no canvas found`);
      }
    }

    console.log(`\nScreenshots: ${saved}/${maps.length} saved`);
  } finally {
    await browser.close();
    server.close();
  }

  updateReadme(maps);
  console.log('\nDone! Open README.md to preview the maps section.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
