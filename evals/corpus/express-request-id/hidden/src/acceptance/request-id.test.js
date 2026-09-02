// Hidden acceptance test for express-request-id. Copied into the candidate
// tree AFTER the pipeline run; the pipeline never sees it.
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../index');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path, headers }, (res) => {
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

test('responses without an incoming id get a fresh UUID', async () => {
  await withServer(async (port) => {
    const first = await get(port, '/api/health');
    const second = await get(port, '/api/health');
    assert.strictEqual(first.status, 200);
    assert.match(first.headers['x-request-id'] || '', UUID, 'X-Request-Id must be a UUID');
    assert.match(second.headers['x-request-id'] || '', UUID);
    assert.notStrictEqual(first.headers['x-request-id'], second.headers['x-request-id'], 'ids must differ per request');
  });
});

test('an incoming X-Request-Id is echoed back unchanged', async () => {
  await withServer(async (port) => {
    const response = await get(port, '/api/items', { 'X-Request-Id': 'req-abc-123' });
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers['x-request-id'], 'req-abc-123');
  });
});

test('404 responses for unknown routes also carry the header', async () => {
  await withServer(async (port) => {
    const generated = await get(port, '/no/such/route');
    assert.strictEqual(generated.status, 404);
    assert.match(generated.headers['x-request-id'] || '', UUID);

    const echoed = await get(port, '/no/such/route', { 'X-Request-Id': 'trace-42' });
    assert.strictEqual(echoed.headers['x-request-id'], 'trace-42');
  });
});
