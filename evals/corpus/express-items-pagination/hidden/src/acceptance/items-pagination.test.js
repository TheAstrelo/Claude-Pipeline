// Hidden acceptance test for express-items-pagination (and its terse
// variant). Copied into the candidate tree AFTER the pipeline run; the
// pipeline never sees it.
const { describe, it, before, after } = require('node:test');
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

const TOTAL = 25;
const names = Array.from({ length: TOTAL }, (_, i) => `item-${String(i + 1).padStart(2, '0')}`);

describe('GET /api/items pagination', () => {
  let server;
  let port;

  before(async () => {
    server = app.listen(0);
    port = server.address().port;
    for (const name of names) {
      const response = await request(port, 'POST', '/api/items', { name });
      assert.strictEqual(response.status, 201, `seeding ${name} failed: ${response.body}`);
    }
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  async function page(query) {
    const response = await request(port, 'GET', `/api/items${query}`);
    return { status: response.status, body: response.body, json: () => JSON.parse(response.body) };
  }

  it('defaults to the first 20 items in insertion order', async () => {
    const response = await page('');
    assert.strictEqual(response.status, 200);
    const items = response.json();
    assert.ok(Array.isArray(items), 'response must be a JSON array');
    assert.deepStrictEqual(items.map((item) => item.name), names.slice(0, 20));
  });

  it('slices by limit and offset', async () => {
    const response = await page('?limit=5&offset=10');
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.json().map((item) => item.name), names.slice(10, 15));
  });

  it('honours offset alone with the default limit', async () => {
    const response = await page('?offset=10');
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.json().map((item) => item.name), names.slice(10, 25));
  });

  it('allows limit up to 100', async () => {
    const response = await page('?limit=100');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.json().length, TOTAL);
  });

  it('returns an empty array for an offset past the end', async () => {
    const response = await page(`?offset=${TOTAL}`);
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(response.json(), []);
  });

  for (const query of ['?limit=101', '?limit=0', '?limit=-5', '?offset=-1', '?limit=abc', '?limit=2.5', '?offset=1.5']) {
    it(`rejects ${query} with 400 and an error body`, async () => {
      const response = await page(query);
      assert.strictEqual(response.status, 400, `expected 400 for ${query}, got ${response.status}: ${response.body}`);
      const body = response.json();
      assert.strictEqual(typeof body.error, 'string');
    });
  }
});
