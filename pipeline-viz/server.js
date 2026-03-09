const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const chokidar = require('chokidar');

const PORT = parseInt(process.env.PORT, 10) || 3001;
const ARTIFACTS_DIR = path.resolve(__dirname, '..', '.claude', 'artifacts');
const CURRENT_TXT = path.join(ARTIFACTS_DIR, 'current.txt');
const PING_INTERVAL = 30000;
const AWAIT_WRITE_FINISH = { stabilityThreshold: 300 };

// --- State ---
let activeSession = null;   // absolute path to active session dir
let storedLines = [];        // parsed PhaseEvent objects
let byteOffset = 0;
let sessionWatcher = null;

// --- MIME types ---
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
};

// --- Validation ---
function isValidPhaseEvent(obj) {
  return obj
    && typeof obj.phase === 'number'
    && typeof obj.status === 'string'
    && ['running', 'complete', 'failed', 'skipped'].includes(obj.status);
}

// --- Read new bytes from JSONL file ---
function readNewLines(filePath) {
  const newEvents = [];
  try {
    const fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    if (stat.size <= byteOffset) {
      fs.closeSync(fd);
      return newEvents;
    }
    const buf = Buffer.alloc(stat.size - byteOffset);
    fs.readSync(fd, buf, 0, buf.length, byteOffset);
    fs.closeSync(fd);
    byteOffset = stat.size;

    const text = buf.toString('utf8');
    const lines = text.split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (isValidPhaseEvent(parsed)) {
          storedLines.push(parsed);
          newEvents.push(parsed);
        } else {
          console.warn('Skipping invalid phase event:', line);
        }
      } catch {
        console.warn('Skipping malformed JSONL line:', line);
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Error reading JSONL:', err.message);
  }
  return newEvents;
}

// --- Broadcast to all WS clients ---
function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(ws => {
    if (ws.readyState === 1) ws.send(data);
  });
}

// --- Session watcher management ---
function stopSessionWatcher() {
  if (sessionWatcher) {
    sessionWatcher.close();
    sessionWatcher = null;
  }
}

function watchSession(sessionDir) {
  stopSessionWatcher();
  const jsonlPath = path.join(sessionDir, 'pipeline-state.jsonl');
  sessionWatcher = chokidar.watch(jsonlPath, {
    awaitWriteFinish: AWAIT_WRITE_FINISH,
    ignoreInitial: false,
  });

  sessionWatcher.on('add', () => {
    const newEvents = readNewLines(jsonlPath);
    newEvents.forEach(phase => broadcast({ type: 'update', phase }));
  });

  sessionWatcher.on('change', () => {
    // Verify this is still the active session
    if (activeSession !== sessionDir) return;
    const newEvents = readNewLines(jsonlPath);
    newEvents.forEach(phase => broadcast({ type: 'update', phase }));
  });
}

function switchToSession(sessionDir) {
  activeSession = sessionDir;
  storedLines = [];
  byteOffset = 0;

  // Try to read existing JSONL if it already exists
  const jsonlPath = path.join(sessionDir, 'pipeline-state.jsonl');
  if (fs.existsSync(jsonlPath)) {
    readNewLines(jsonlPath);
  }

  watchSession(sessionDir);
  broadcast({ type: 'init', session: path.basename(sessionDir), phases: storedLines });
}

// --- Startup: detect active session from current.txt ---
function initActiveSession() {
  try {
    const content = fs.readFileSync(CURRENT_TXT, 'utf8').trim();
    // content is a relative path like ".claude/artifacts/20260309-..."
    const absDir = path.resolve(__dirname, '..', content);
    if (fs.existsSync(absDir) && fs.statSync(absDir).isDirectory()) {
      console.log('Found active session:', content);
      switchToSession(absDir);
      return;
    }
  } catch {}
  console.log('No active session found — waiting for new session.');
  activeSession = null;
  storedLines = [];
  byteOffset = 0;
}

// --- HTTP server ---
const server = http.createServer((req, res) => {
  let urlPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(__dirname, 'public', urlPath);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// --- WebSocket server ---
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.send(JSON.stringify({
    type: 'init',
    session: activeSession ? path.basename(activeSession) : null,
    phases: storedLines,
  }));
});

// --- Ping/pong heartbeat ---
const pingTimer = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, PING_INTERVAL);

// --- Watch artifacts dir for new sessions ---
const SESSION_PATTERN = /^\d{8}-\d{6}-.+$/;

const artifactsWatcher = chokidar.watch(ARTIFACTS_DIR, {
  depth: 0,
  ignoreInitial: true,
  awaitWriteFinish: false,
});

artifactsWatcher.on('addDir', (dirPath) => {
  const dirName = path.basename(dirPath);
  if (SESSION_PATTERN.test(dirName)) {
    console.log('New session detected:', dirName);
    switchToSession(dirPath);
  }
});

// --- Start ---
initActiveSession();

server.listen(PORT, () => {
  console.log(`Pipeline Viz running on http://localhost:${PORT}`);
  console.log(`WebSocket on ws://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set PORT env var to use a different port.`);
    process.exit(1);
  }
  throw err;
});

// --- Graceful shutdown ---
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  clearInterval(pingTimer);
  stopSessionWatcher();
  artifactsWatcher.close();
  wss.close();
  server.close(() => process.exit(0));
});
