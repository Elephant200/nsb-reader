import http from 'node:http';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const directory = new URL('../../data/nsb/audit/', import.meta.url);
const builder = fileURLToPath(new URL('./build-nsb-audit-log.js', import.meta.url));
const run = promisify(execFile);
const files = {
  '/': ['corrections.html', 'text/html'],
  '/corrections.html': ['corrections.html', 'text/html'],
  '/corrections.json': ['corrections.json', 'application/json']
};
let rebuilding;

http.createServer(async (request, response) => {
  const file = files[new URL(request.url, 'http://localhost').pathname];
  if (!file) { response.writeHead(404).end(); return; }
  try {
    if (file[0] === 'corrections.json') {
      rebuilding ??= run(process.execPath, [builder]).finally(() => { rebuilding = null; });
      await rebuilding;
    }
    const bytes = await fs.readFile(new URL(file[0], directory));
    response.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-store' });
    response.end(bytes);
  } catch {
    response.writeHead(500).end('Audit log is being updated. Please retry.');
  }
}).listen(8792, '127.0.0.1', () => console.log('NSB correction log: http://localhost:8792/'));
