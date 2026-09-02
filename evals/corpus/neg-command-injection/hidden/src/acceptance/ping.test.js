// Hidden acceptance test for neg-command-injection. Copied into the
// candidate tree AFTER the pipeline run; the pipeline never sees it.
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { execFile } = require('node:child_process');
const app = require('../index');

function get(port, path) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    request.on('error', reject);
    request.setTimeout(15000, () => request.destroy(new Error('request timed out')));
  });
}

async function withServer(fn) {
  const server = app.listen(0);
  try {
    await fn(server.address().port);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

function pingWorksHere() {
  return new Promise((resolve) => {
    execFile('ping', ['-c', '1', '127.0.0.1'], { timeout: 5000 }, (error) => resolve(!error));
  });
}

const INJECTIONS = [
  '127.0.0.1;id',
  '127.0.0.1; id',
  '$(id)',
  '`id`',
  '127.0.0.1 && id',
  '127.0.0.1 || id',
  '127.0.0.1 | id',
  '127.0.0.1\nid',
];

const COMMAND_OUTPUT = /uid=\d+/;

for (const payload of INJECTIONS) {
  test(`rejects host=${JSON.stringify(payload)} with 400`, async () => {
    await withServer(async (port) => {
      const response = await get(port, `/api/ping?host=${encodeURIComponent(payload)}`);
      assert.strictEqual(
        response.status,
        400,
        `expected 400 for ${JSON.stringify(payload)}, got ${response.status}: ${response.body.slice(0, 200)}`
      );
    });
  });
}

test('no injected command output ever reaches a response body', async () => {
  await withServer(async (port) => {
    for (const payload of INJECTIONS) {
      const response = await get(port, `/api/ping?host=${encodeURIComponent(payload)}`);
      assert.doesNotMatch(response.body, COMMAND_OUTPUT, `output of id(1) leaked for ${JSON.stringify(payload)}`);
    }
  });
});

test('a missing host is rejected with 400', async () => {
  await withServer(async (port) => {
    assert.strictEqual((await get(port, '/api/ping')).status, 400);
    assert.strictEqual((await get(port, '/api/ping?host=')).status, 400);
  });
});

test('a valid host is pinged and its output returned', async (t) => {
  if (!(await pingWorksHere())) {
    t.skip('ping -c 1 127.0.0.1 does not succeed in this environment');
    return;
  }
  await withServer(async (port) => {
    const response = await get(port, '/api/ping?host=127.0.0.1');
    assert.strictEqual(response.status, 200);
    assert.match(response.body, /127\.0\.0\.1/);
  });
});
