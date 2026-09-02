// Hidden acceptance test for express-logger-refactor. Copied into the
// candidate tree AFTER the pipeline run; the pipeline never sees it.
const { test } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const logger = require('../middleware/logger');

test('the module still exports the middleware function as its default export', () => {
  assert.strictEqual(typeof logger, 'function');
  assert.strictEqual(logger.length, 3, 'middleware signature must stay (req, res, next)');
});

test('formatLogLine is exported and formats "<method> <url> <status> <ms>ms"', () => {
  assert.strictEqual(typeof logger.formatLogLine, 'function');
  const line = logger.formatLogLine(
    { method: 'GET', originalUrl: '/api/items?limit=2' },
    { statusCode: 200 },
    12
  );
  assert.strictEqual(line, 'GET /api/items?limit=2 200 12ms');
  assert.strictEqual(
    logger.formatLogLine({ method: 'DELETE', originalUrl: '/api/items/7' }, { statusCode: 404 }, 0),
    'DELETE /api/items/7 404 0ms'
  );
});

test('formatLogLine is pure: it does not write to the console', (t) => {
  const log = t.mock.method(console, 'log', () => {});
  logger.formatLogLine({ method: 'GET', originalUrl: '/' }, { statusCode: 200 }, 1);
  assert.strictEqual(log.mock.callCount(), 0);
});

test('the middleware still logs exactly one formatted line when the response finishes', (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const req = { method: 'POST', originalUrl: '/api/items' };
  const res = new EventEmitter();
  res.statusCode = 201;
  let nextCalls = 0;

  logger(req, res, () => { nextCalls += 1; });
  assert.strictEqual(nextCalls, 1, 'middleware must call next() exactly once');
  assert.strictEqual(log.mock.callCount(), 0, 'nothing is logged before the response finishes');

  res.emit('finish');
  assert.strictEqual(log.mock.callCount(), 1);
  const [line] = log.mock.calls[0].arguments;
  assert.match(line, /^POST \/api\/items 201 \d+ms$/);
});
