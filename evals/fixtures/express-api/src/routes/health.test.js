const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const app = require('../index');

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

test('GET /api/health reports ok', async () => {
  await withServer(async (port) => {
    const response = await get(port, '/api/health');
    assert.strictEqual(response.status, 200);
    const payload = JSON.parse(response.body);
    assert.strictEqual(payload.status, 'ok');
    assert.strictEqual(typeof payload.uptime, 'number');
    assert.ok(!Number.isNaN(Date.parse(payload.timestamp)));
  });
});
