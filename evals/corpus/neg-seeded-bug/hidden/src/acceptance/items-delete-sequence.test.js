// Hidden acceptance test for neg-seeded-bug. Copied into the candidate tree
// AFTER the pipeline run; the pipeline never sees it. The store is
// module-level, so every test reasons from the ids it created rather than
// assuming an empty store.
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../index');

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = payload
      ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
      : {};
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
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

async function listIds(port) {
  return JSON.parse((await request(port, 'GET', '/api/items')).body).map((item) => item.id);
}

async function create(port, name) {
  const response = await request(port, 'POST', '/api/items', { name });
  assert.strictEqual(response.status, 201);
  return JSON.parse(response.body);
}

test('deleting the last item removes exactly that item', async () => {
  await withServer(async (port) => {
    const before = await listIds(port);
    const x = await create(port, 'x');
    const y = await create(port, 'y');
    const z = await create(port, 'z');

    const deleted = await request(port, 'DELETE', `/api/items/${z.id}`);
    assert.strictEqual(deleted.status, 200);
    assert.strictEqual((await request(port, 'GET', `/api/items/${z.id}`)).status, 404);
    assert.strictEqual((await request(port, 'GET', `/api/items/${x.id}`)).status, 200);
    assert.strictEqual((await request(port, 'GET', `/api/items/${y.id}`)).status, 200);
    assert.deepStrictEqual(await listIds(port), [...before, x.id, y.id]);
  });
});

test('deleting a middle item and then the last item both work', async () => {
  await withServer(async (port) => {
    const before = await listIds(port);
    const a = await create(port, 'a');
    const b = await create(port, 'b');
    const c = await create(port, 'c');

    assert.strictEqual((await request(port, 'DELETE', `/api/items/${b.id}`)).status, 200);
    assert.strictEqual((await request(port, 'DELETE', `/api/items/${c.id}`)).status, 200);
    assert.strictEqual((await request(port, 'GET', `/api/items/${b.id}`)).status, 404);
    assert.strictEqual((await request(port, 'GET', `/api/items/${c.id}`)).status, 404);
    assert.strictEqual((await request(port, 'GET', `/api/items/${a.id}`)).status, 200);
    assert.deepStrictEqual(await listIds(port), [...before, a.id]);

    const again = await request(port, 'DELETE', `/api/items/${c.id}`);
    assert.strictEqual(again.status, 404, 'deleting an already-deleted id is 404');
  });
});
