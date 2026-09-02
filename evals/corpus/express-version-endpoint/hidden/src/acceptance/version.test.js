// Hidden acceptance test for express-version-endpoint. The runner copies it
// into the candidate tree AFTER the pipeline has finished; the pipeline never
// sees it. Adapted from demo/starter-project/src/acceptance/version.test.js.
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../index');
const pkg = require('../../package.json');

function get(port, path) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    request.on('error', reject);
    request.setTimeout(5000, () => request.destroy(new Error('request timed out')));
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

test('GET /api/version returns exactly { version } from package.json', async () => {
  await withServer(async (port) => {
    const response = await get(port, '/api/version');
    assert.strictEqual(response.status, 200);
    assert.match(response.headers['content-type'] || '', /application\/json/);
    assert.deepStrictEqual(JSON.parse(response.body), { version: pkg.version });
  });
});

test('existing routes still respond', async () => {
  await withServer(async (port) => {
    assert.strictEqual((await get(port, '/api/health')).status, 200);
    assert.strictEqual((await get(port, '/api/items')).status, 200);
  });
});
