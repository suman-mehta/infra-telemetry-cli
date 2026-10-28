import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const CONFIG_PATH = resolve('test', 'temp-config.json');
const LOG_ENDPOINT = '/mock-log';

function startMockServer(port, logs) {
  const server = createServer((req, res) => {
    if (req.url === LOG_ENDPOINT) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(logs));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolveSrv) => {
    server.listen(port, () => resolveSrv(server));
  });
}

test('CLI aggregates logs and prints dashboard', async (t) => {
  const mockLogs = [
    { level: 'info', message: 'service started' },
    { level: 'warn', message: 'high memory usage' },
    { level: 'error', message: 'connection lost' },
    { level: 'info', message: 'heartbeat' }
  ];
  const port = 41234;
  const server = await startMockServer(port, mockLogs);
  const configContent = JSON.stringify({ sources: [`http://127.0.0.1:${port}${LOG_ENDPOINT}`] });
  await writeFile(CONFIG_PATH, configContent, 'utf8');

  const result = spawnSync(process.execPath, [resolve('src', 'index.js'), `--config=${CONFIG_PATH}`], {
    encoding: 'utf8'
  });

  // Clean up before assertions
  await rm(CONFIG_PATH);
  server.close();

  assert.strictEqual(result.status, 0, 'CLI should exit with code 0');
  const output = result.stdout;
  assert.match(output, /INFO : 2/);
  assert.match(output, /WARN : 1/);
  assert.match(output, /ERROR: 1/);
});
