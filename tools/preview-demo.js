/**
 * Serve the already-built ngx-genie demo and open it in a fresh browser window.
 *
 * Used by `npm run preview` AFTER the library and demo have been built. It serves the static build
 * output (dist/ngx-genie-demo/browser) rather than the dev server, so what you see is exactly the
 * built artifact. Two independent guards against stale content:
 *   1. every response is sent with `Cache-Control: no-store` (the demo build uses outputHashing:none,
 *      so filenames repeat between builds and a normal browser would otherwise serve a cached copy);
 *   2. the page is opened in a NEW incognito window (Chrome) — no cache, no extensions, no state.
 *
 * Env overrides: PREVIEW_PORT=<n> (default 4300), PREVIEW_NO_OPEN=1 (serve only, don't open a window).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DIST_BASE = path.resolve(__dirname, '..', 'dist', 'ngx-genie-demo');
const START_PORT = Number(process.env.PREVIEW_PORT) || 4300;
const SHOULD_OPEN = process.env.PREVIEW_NO_OPEN !== '1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function resolveRoot() {
  for (const dir of [path.join(DIST_BASE, 'browser'), DIST_BASE]) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return null;
}

const root = resolveRoot();
if (!root) {
  console.error(`[preview] No built demo found under ${DIST_BASE}.`);
  console.error('[preview] Run "npm run build:demo" first (or use "npm run preview", which builds it).');
  process.exit(1);
}

function send(res, status, body, headers) {
  res.writeHead(status, { 'Cache-Control': 'no-store, max-age=0', ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const filePath = path.normalize(path.join(root, urlPath));
  if (!filePath.startsWith(root)) return send(res, 403, 'Forbidden');

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: a path with no file extension is a client-side route → serve index.html.
      if (!path.extname(urlPath)) {
        return fs.readFile(path.join(root, 'index.html'), (e2, html) =>
          e2
            ? send(res, 404, 'Not found')
            : send(res, 200, html, { 'Content-Type': MIME['.html'] })
        );
      }
      return send(res, 404, 'Not found');
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    send(res, 200, data, { 'Content-Type': type });
  });
});

function openFreshWindow(url) {
  const attempts =
    process.platform === 'darwin'
      ? [
          ['open', ['-na', 'Google Chrome', '--args', '--incognito', '--new-window', url]],
          ['open', [url]],
        ]
      : process.platform === 'win32'
      ? [
          ['cmd', ['/c', 'start', '', 'chrome', '--incognito', '--new-window', url]],
          ['cmd', ['/c', 'start', '', url]],
        ]
      : [
          ['google-chrome', ['--incognito', '--new-window', url]],
          ['chromium', ['--incognito', '--new-window', url]],
          ['xdg-open', [url]],
        ];

  const tryNext = (i) => {
    if (i >= attempts.length) {
      console.log(`[preview] Could not open a browser automatically — open ${url} yourself.`);
      return;
    }
    const [cmd, args] = attempts[i];
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => tryNext(i + 1));
    child.unref();
  };
  tryNext(0);
}

function listen(port, attemptsLeft) {
  const onError = (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error('[preview] server error:', err.message);
      process.exit(1);
    }
  };
  server.once('error', onError);
  server.listen(port, () => {
    server.removeListener('error', onError);
    const url = `http://localhost:${port}/`;
    console.log(`\n[preview] Serving built demo from ${path.relative(process.cwd(), root)}`);
    console.log(`[preview] ${url}`);
    console.log('[preview] Press Ctrl+C to stop.\n');
    if (SHOULD_OPEN) {
      console.log('[preview] Opening a fresh incognito window…');
      openFreshWindow(url);
    }
  });
}

listen(START_PORT, 10);
