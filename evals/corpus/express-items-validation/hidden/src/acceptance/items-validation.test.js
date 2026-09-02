// Hidden acceptance test for express-items-validation. Copied into the
// candidate tree AFTER the pipeline run; the pipeline never sees it.
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../index');

function request(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const allHeaders = payload
      ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers }
      : headers;
    const req = http.request({ host: '127.0.0.1', port, method, path, headers: allHeaders }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('request timed out')));
    if (payload) req.write(payload);
    req.end();
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

const REJECTED = { error: 'name is required' };

const badBodies = [
  ['empty object', {}],
  ['empty string', { name: '' }],
  ['whitespace only', { name: '   \t ' }],
  ['null', { name: null }],
  ['number', { name: 42 }],
  ['object', { name: { first: 'x' } }],
  ['array', { name: ['x'] }],
];

for (const [label, body] of badBodies) {
  test(`POST /api/items rejects name = ${label} with 400 { error: "name is required" }`, async () => {
    await withServer(async (port) => {
      const response = await request(port, 'POST', '/api/items', body);
      assert.strictEqual(response.status, 400);
      assert.deepStrictEqual(JSON.parse(response.body), REJECTED);
    });
  });
}

test('POST /api/items with no body at all is rejected the same way', async () => {
  await withServer(async (port) => {
    const response = await request(port, 'POST', '/api/items');
    assert.strictEqual(response.status, 400);
    assert.deepStrictEqual(JSON.parse(response.body), REJECTED);
  });
});

test('POST /api/items with a valid name still creates the item', async () => {
  await withServer(async (port) => {
    const response = await request(port, 'POST', '/api/items', { name: 'Widget' });
    assert.strictEqual(response.status, 201);
    const item = JSON.parse(response.body);
    assert.strictEqual(item.name, 'Widget');
    assert.strictEqual(typeof item.id, 'number');
    const fetched = await request(port, 'GET', `/api/items/${item.id}`);
    assert.strictEqual(fetched.status, 200);
  });
});
