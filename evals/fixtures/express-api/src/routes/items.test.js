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

test('items can be created, listed, fetched and deleted', async () => {
  await withServer(async (port) => {
    const created = [];
    for (const name of ['alpha', 'beta', 'gamma']) {
      const response = await request(port, 'POST', '/api/items', { name });
      assert.strictEqual(response.status, 201);
      const item = JSON.parse(response.body);
      assert.strictEqual(item.name, name);
      assert.strictEqual(typeof item.id, 'number');
      created.push(item);
    }

    const listed = JSON.parse((await request(port, 'GET', '/api/items')).body);
    assert.deepStrictEqual(listed.map((item) => item.id), created.map((item) => item.id));

    const fetched = await request(port, 'GET', `/api/items/${created[1].id}`);
    assert.strictEqual(fetched.status, 200);
    assert.strictEqual(JSON.parse(fetched.body).name, 'beta');

    const deleted = await request(port, 'DELETE', `/api/items/${created[0].id}`);
    assert.strictEqual(deleted.status, 200);

    const gone = await request(port, 'GET', `/api/items/${created[0].id}`);
    assert.strictEqual(gone.status, 404, 'deleted item must no longer be fetchable');

    const remaining = JSON.parse((await request(port, 'GET', '/api/items')).body);
    assert.deepStrictEqual(
      remaining.map((item) => item.id),
      [created[1].id, created[2].id],
      'only the deleted item may disappear from the list'
    );
  });
});

test('POST /api/items without a name is rejected', async () => {
  await withServer(async (port) => {
    const response = await request(port, 'POST', '/api/items', {});
    assert.strictEqual(response.status, 400);
  });
});

test('GET /api/items/:id for an unknown id is 404', async () => {
  await withServer(async (port) => {
    const response = await request(port, 'GET', '/api/items/9999');
    assert.strictEqual(response.status, 404);
  });
});
