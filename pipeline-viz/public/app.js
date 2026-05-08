const { useState, useEffect, useReducer, useRef, useCallback } = React;

// ===================================
// ISOMETRIC CONSTANTS
// ===================================
const TILE_W = 44;
const TILE_H = 22;
const COLS = 28;
const ROWS = 20;
const WALL_H = 18;
const VIEWPORT_W = 1100;
const VIEWPORT_H = 600;
const ORIGIN_X = ROWS * (TILE_W / 2);
const ORIGIN_Y = 10;

const WALK_SPEED = 2.5;
const WANDER_PAUSE_MIN = 3;
const WANDER_PAUSE_MAX = 18;
const WANDER_MOVES_MIN = 2;
const WANDER_MOVES_MAX = 5;
const REST_DURATION_MIN = 12;
const REST_DURATION_MAX = 30;
const COMPLETE_SHOW_TIME = 4;

// ===================================
// ISOMETRIC COORDINATE SYSTEM
// ===================================
function toScreen(col, row) {
  return {
    x: (col - row) * (TILE_W / 2) + ORIGIN_X,
    y: (col + row) * (TILE_H / 2) + ORIGIN_Y,
  };
}

function depthIndex(col, row) { return col + row; }

// ===================================
// AGENT TYPE COLORS
// ===================================
function getCharType(phase) {
  if (phase <= 3) return 'researcher';
  if (phase <= 8) return 'architect';
  if (phase === 9) return 'builder';
  if (phase <= 15) return 'inspector';
  return 'guardian';
}

// ===================================
// FLOOR TEXTURES (inline SVG data URIs)
// ===================================
const FLOOR_TEXTURES = {
  office: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="44" height="22"><line x1="0" y1="5" x2="44" y2="5" stroke="rgba(139,105,20,0.06)" stroke-width="0.5"/><line x1="0" y1="11" x2="44" y2="11" stroke="rgba(139,105,20,0.04)" stroke-width="0.5"/><line x1="0" y1="17" x2="44" y2="17" stroke="rgba(139,105,20,0.06)" stroke-width="0.5"/></svg>`)}`,
  break: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="0.6" fill="rgba(160,100,160,0.08)"/></svg>`)}`,
  study: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><rect x="0" y="0" width="22" height="22" fill="none" stroke="rgba(100,120,160,0.05)" stroke-width="0.5"/></svg>`)}`,
};

const WALL_BRICK_SVG = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="8"><rect x="0" y="0" width="7" height="3" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="0.3"/><rect x="8" y="0" width="7" height="3" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="0.3"/><rect x="4" y="4" width="7" height="3" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="0.3"/><rect x="12" y="4" width="3" height="3" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="0.3"/></svg>`)}`;

// ===================================
// IDLE EMOTES & PARTICLE CONFIG
// ===================================
const IDLE_EMOTES = ['\u2615', '\ud83d\udca4', '\ud83d\udca1', '\ud83c\udfb5', '\ud83d\udcda'];
const MAX_PARTICLES = 80;
const PARTICLE_EMIT_INTERVAL = 0.4;

// ===================================
// THREE-ROOM FLOOR PLAN
// ===================================
// MAIN OFFICE:  cols 0-19,  rows 0-19
// BREAK ROOM:   cols 20-27, rows 0-9
// STUDY ROOM:   cols 20-27, rows 10-19

// Desk positions: 4 cols × 5 rows = 20 desks in main office
const DESK_COL_STARTS = [3, 7, 11, 15];
const DESK_ROW_STARTS = [2, 5, 8, 11, 14];
const DESKS = [];
for (let ri = 0; ri < 5; ri++) {
  for (let ci = 0; ci < 4; ci++) {
    DESKS.push({
      col: DESK_COL_STARTS[ci],
      row: DESK_ROW_STARTS[ri],
      seatCol: DESK_COL_STARTS[ci] + 1,
      seatRow: DESK_ROW_STARTS[ri] + 1,
    });
  }
}

// Break room furniture (cols 20-27, rows 0-9)
const BREAK_FURNITURE = [
  { type: 'coffee',  col: 22, row: 2, label: 'COFFEE', w: 1, d: 1, h: 22 },
  { type: 'vending', col: 25, row: 2, label: 'VENDING', w: 1, d: 1, h: 26 },
  { type: 'water',   col: 22, row: 5, label: 'WATER', w: 1, d: 1, h: 20 },
  { type: 'couch',   col: 24, row: 6, label: 'COUCH', w: 2, d: 1, h: 12 },
  { type: 'plant',   col: 21, row: 8, label: '', w: 1, d: 1, h: 16 },
  { type: 'plant',   col: 26, row: 8, label: '', w: 1, d: 1, h: 16 },
];

// Study room furniture (cols 20-27, rows 10-19)
const STUDY_FURNITURE = [
  { type: 'whiteboard', col: 21, row: 11, label: 'BOARD', w: 2, d: 1, h: 28 },
  { type: 'bookshelf',  col: 26, row: 11, label: 'BOOKS', w: 1, d: 1, h: 30 },
  { type: 'readdesk',   col: 23, row: 14, label: 'STUDY', w: 1, d: 1, h: 16 },
  { type: 'lamp',       col: 24, row: 14, label: '', w: 1, d: 1, h: 24 },
  { type: 'beanbag',    col: 22, row: 17, label: 'BEAN', w: 1, d: 1, h: 8 },
  { type: 'plant',      col: 26, row: 17, label: '', w: 1, d: 1, h: 16 },
];

const ALL_FURNITURE = [...BREAK_FURNITURE, ...STUDY_FURNITURE];

// Furniture color palettes  { top, front, side }
// High contrast: bright top (lit), medium front-left, dark side-right
const FURN_COLORS = {
  coffee:     { top: ['#B89A80','#9A8068'], front: ['#6B5A48','#4A3D30'], side: ['#3D3028','#2A2018'] },
  vending:    { top: ['#6898C0','#5080A8'], front: ['#3A6080','#2A4A60'], side: ['#1E3A50','#142838'] },
  water:      { top: ['#B0E0F8','#90D0F0'], front: ['#60A0C0','#4888A8'], side: ['#306888','#204A68'] },
  couch:      { top: ['#9070A8','#7A5A92'], front: ['#5A3A6A','#4A2A5A'], side: ['#32184A','#22103A'] },
  plant:      { top: ['#50D880','#38B764'], front: ['#7A6A58','#5A4A38'], side: ['#3A3028','#2A2018'] },
  whiteboard: { top: ['#F0F0F2','#E0E0E5'], front: ['#E8E8EC','#D0D0D8'], side: ['#A0A0AA','#808088'] },
  bookshelf:  { top: ['#9A7A58','#8A6A48'], front: ['#A08060','#7A5A38'], side: ['#4A3220','#3A2218'] },
  readdesk:   { top: ['#CCA030','#B89020'], front: ['#8A6A18','#6A5010'], side: ['#4A380C','#3A2808'] },
  lamp:       { top: ['#FFE88A','#FFD54F'], front: ['#A0A0A0','#808080'], side: ['#505050','#383838'] },
  beanbag:    { top: ['#A888D0','#9070B8'], front: ['#6A4A9A','#5A3A8A'], side: ['#3A1A6A','#2A0A5A'] },
  desk:       { top: ['#CCA030','#B89020'], front: ['#8A6A18','#6A5010'], side: ['#4A380C','#3A2808'] },
};

// Build blocked tile set
const BLOCKED = new Set();
// Room walls (outer perimeter)
for (let c = 0; c < COLS; c++) { BLOCKED.add(`${c},-1`); BLOCKED.add(`${c},${ROWS}`); }
for (let r = 0; r < ROWS; r++) { BLOCKED.add(`-1,${r}`); BLOCKED.add(`${COLS},${r}`); }

// Internal walls between main office and side rooms
for (let r = 0; r < ROWS; r++) {
  // Wall at col 19/20 boundary
  if (r >= 0 && r <= 2) BLOCKED.add(`19,${r}`);   // above office-break door
  if (r >= 5 && r <= 13) BLOCKED.add(`19,${r}`);   // between doors
  if (r >= 16 && r <= 19) BLOCKED.add(`19,${r}`);  // below office-study door
}
// Wall between break and study at row 9/10
for (let c = 20; c < COLS; c++) {
  if (c < 23 || c > 24) { BLOCKED.add(`${c},9`); } // door gap at 23-24
}

// Desk tiles blocked
DESKS.forEach(d => {
  BLOCKED.add(`${d.col},${d.row}`);
  BLOCKED.add(`${d.col + 1},${d.row}`);
});
// Furniture tiles blocked
ALL_FURNITURE.forEach(f => {
  for (let dc = 0; dc < f.w; dc++) {
    for (let dr = 0; dr < f.d; dr++) {
      BLOCKED.add(`${f.col + dc},${f.row + dr}`);
    }
  }
});

// Walkable tiles
const WALKABLE = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (!BLOCKED.has(`${c},${r}`)) WALKABLE.push({ col: c, row: r });
  }
}

// Interest points near furniture
const INTEREST_POINTS = [
  // Break room
  { col: 23, row: 2 }, { col: 22, row: 3 }, { col: 25, row: 3 },
  { col: 23, row: 5 }, { col: 24, row: 7 },
  // Study room
  { col: 22, row: 12 }, { col: 25, row: 12 },
  { col: 23, row: 15 }, { col: 22, row: 18 },
  // Main office aisles
  { col: 5, row: 4 }, { col: 9, row: 7 }, { col: 13, row: 10 },
  { col: 17, row: 13 }, { col: 1, row: 16 },
];

// ===================================
// BFS PATHFINDING
// ===================================
const BFS_DIRS = [{ dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }];

function findPath(startCol, startRow, endCol, endRow) {
  const key = (c, r) => `${c},${r}`;
  const endKey = key(endCol, endRow);
  if (key(startCol, startRow) === endKey) return [];

  const visited = new Set([key(startCol, startRow)]);
  const queue = [{ col: startCol, row: startRow, path: [] }];

  while (queue.length > 0) {
    const { col, row, path } = queue.shift();
    for (const { dc, dr } of BFS_DIRS) {
      const nc = col + dc, nr = row + dr;
      const nk = key(nc, nr);
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      if (visited.has(nk)) continue;
      if (BLOCKED.has(nk) && nk !== endKey) continue;
      const newPath = [...path, { col: nc, row: nr }];
      if (nk === endKey) return newPath;
      visited.add(nk);
      queue.push({ col: nc, row: nr, path: newPath });
    }
  }
  return null;
}

// ===================================
// PHASE METADATA & UTILS
// ===================================
const PHASE_META = [
  { phase: 0,  name: 'Pre-Check' },
  { phase: 1,  name: 'Research' },
  { phase: 2,  name: 'Requirements' },
  { phase: 3,  name: 'Cost Estimate' },
  { phase: 4,  name: 'Design' },
  { phase: 5,  name: 'Adversarial' },
  { phase: 6,  name: 'Planning' },
  { phase: 7,  name: 'Test Plan' },
  { phase: 8,  name: 'Drift Check' },
  { phase: 9,  name: 'Build' },
  { phase: 10, name: 'Denoise' },
  { phase: 11, name: 'Quality Fit' },
  { phase: 12, name: 'QA Behavior' },
  { phase: 13, name: 'QA Docs' },
  { phase: 14, name: 'Perf Check' },
  { phase: 15, name: 'A11y Check' },
  { phase: 16, name: 'Security' },
  { phase: 17, name: 'Tech Debt' },
  { phase: 18, name: 'Rollback' },
  { phase: 19, name: 'Changelog' },
];

function verdictClass(verdict) {
  if (!verdict || verdict === 'UNKNOWN') return 'verdict-unknown';
  const pass = ['SUFFICIENT','CLEAR','APPROVED','READY','ALIGNED','SUCCESS','PASS','CLEAN','CLEANED','LOW','ACCEPTABLE','DONE'];
  const warn = ['NEEDS_MORE_RESEARCH','NEEDS_INPUT','NEEDS_DETAIL','PARTIAL','WARN','DEBT_LOGGED','MEDIUM','REVIEW_COSTS'];
  if (pass.includes(verdict)) return 'verdict-pass';
  if (warn.includes(verdict)) return 'verdict-warn';
  return 'verdict-fail';
}

function getElapsed(event, prevEvent) {
  if (!event || !event.timestamp) return null;
  if (event.status === 'running') return 'Running...';
  if ((event.status === 'complete' || event.status === 'failed') && prevEvent && prevEvent.timestamp) {
    const start = new Date(prevEvent.timestamp);
    const end = new Date(event.timestamp);
    const secs = Math.round((end - start) / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }
  return null;
}

// ===================================
// ISO BOX GEOMETRY — 3-face clip paths
// ===================================
function isoBoxFaces(col, row, boxW, boxD, boxH) {
  // 4 ground corners of the box in screen space
  const nw = toScreen(col, row);                     // back corner
  const ne = toScreen(col + boxW, row);              // right-back
  const se = toScreen(col + boxW, row + boxD);       // front corner
  const sw = toScreen(col, row + boxD);              // left-back

  // Raised versions (subtract boxH from y)
  const nwT = { x: nw.x, y: nw.y - boxH };
  const neT = { x: ne.x, y: ne.y - boxH };
  const seT = { x: se.x, y: se.y - boxH };
  const swT = { x: sw.x, y: sw.y - boxH };

  // Bounding box for the SVG/div
  const allPts = [nw, ne, se, sw, nwT, neT, seT, swT];
  const minX = Math.min(...allPts.map(p => p.x));
  const minY = Math.min(...allPts.map(p => p.y));
  const maxX = Math.max(...allPts.map(p => p.x));
  const maxY = Math.max(...allPts.map(p => p.y));
  const w = maxX - minX;
  const h = maxY - minY;

  // Convert to local coords (relative to bounding box)
  const local = p => ({ x: p.x - minX, y: p.y - minY });

  // Top face: nwT, neT, seT, swT
  const topPts = [local(nwT), local(neT), local(seT), local(swT)];
  const topClip = `polygon(${topPts.map(p => `${p.x}px ${p.y}px`).join(', ')})`;

  // Left face (front-left): swT, seT, se, sw
  const leftPts = [local(swT), local(seT), local(se), local(sw)];
  const leftClip = `polygon(${leftPts.map(p => `${p.x}px ${p.y}px`).join(', ')})`;

  // Right face (front-right): neT, seT, se, ne
  const rightPts = [local(neT), local(seT), local(se), local(ne)];
  const rightClip = `polygon(${rightPts.map(p => `${p.x}px ${p.y}px`).join(', ')})`;

  return { minX, minY, w, h, topClip, leftClip, rightClip };
}

// ===================================
// PARTICLE SYSTEM (object-pooled)
// ===================================
const PARTICLE_CONFIG = {
  dust:    { minSize: 2, maxSize: 4, minLife: 3, maxLife: 6, speed: 8 },
  sparkle: { minSize: 1, maxSize: 3, minLife: 0.5, maxLife: 1.5, speed: 20 },
  steam:   { minSize: 2, maxSize: 4, minLife: 1.5, maxLife: 3, speed: 15 },
  work:    { minSize: 2, maxSize: 3, minLife: 0.4, maxLife: 0.8, speed: 30 },
};

function createParticlePool(containerEl) {
  const particles = [];
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const el = document.createElement('div');
    el.className = 'particle';
    el.style.display = 'none';
    containerEl.appendChild(el);
    particles.push({ el, active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0, size: 0, type: '' });
  }
  return particles;
}

function emitParticle(pool, type, x, y) {
  const cfg = PARTICLE_CONFIG[type];
  if (!cfg) return;
  const p = pool.find(p => !p.active);
  if (!p) return;

  p.active = true;
  p.type = type;
  p.x = x + (Math.random() - 0.5) * 10;
  p.y = y + (Math.random() - 0.5) * 6;
  p.size = cfg.minSize + Math.random() * (cfg.maxSize - cfg.minSize);
  p.maxLife = cfg.minLife + Math.random() * (cfg.maxLife - cfg.minLife);
  p.life = p.maxLife;

  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
  const spd = cfg.speed * (0.5 + Math.random() * 0.5);
  p.vx = Math.cos(angle) * spd * (type === 'dust' ? 0.3 : 1);
  p.vy = Math.sin(angle) * spd;

  p.el.style.display = 'block';
  p.el.style.width = p.size + 'px';
  p.el.style.height = p.size + 'px';
  p.el.className = `particle particle-${type}`;
}

function updateParticles(pool, dt) {
  for (const p of pool) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      p.el.style.display = 'none';
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const alpha = Math.min(1, p.life / p.maxLife * 2);
    p.el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    p.el.style.opacity = alpha;
  }
}

// ===================================
// AGENT STATE MACHINE (imperative)
// ===================================
function createAgent(phaseNum) {
  const start = WALKABLE[Math.floor(Math.random() * WALKABLE.length)];
  return {
    phaseNum,
    x: start.col + 0.5,
    y: start.row + 0.5,
    tileCol: start.col,
    tileRow: start.row,
    path: [],
    moveProgress: 0,
    state: 'idle',
    walkTarget: null,
    wanderTimer: 2 + phaseNum * 0.5 + Math.random() * 4,
    wanderCount: 0,
    wanderLimit: WANDER_MOVES_MIN + Math.floor(Math.random() * (WANDER_MOVES_MAX - WANDER_MOVES_MIN + 1)),
    desk: DESKS[phaseNum],
    frameTimer: 0,
    walkFrame: 0,
    facingRight: Math.random() > 0.5,
    phaseStatus: 'idle',
    phaseVerdict: null,
    el: null,
    bubbleEl: null,
    nameEl: null,
    emoteEl: null,
    bubbleText: '',
    bubbleVisible: false,
    bubbleClass: '',
    completeTimer: 0,
    resting: false,
    dimmed: true,
    // Emote system
    idleEmoteTimer: 8 + Math.random() * 12,
    emoteVisible: false,
    emoteHideTimer: 0,
    // State class tracking
    prevStateClass: '',
  };
}

function startPathTo(agent, col, row, walkTarget) {
  const path = findPath(agent.tileCol, agent.tileRow, col, row);
  if (path && path.length > 0) {
    agent.path = path;
    agent.moveProgress = 0;
    agent.state = 'walk';
    agent.walkTarget = walkTarget;
    agent.dimmed = false;
    return true;
  }
  return false;
}

function showBubble(agent, text, cls) {
  agent.bubbleText = text;
  agent.bubbleClass = cls;
  agent.bubbleVisible = true;
}

function updateAgent(agent, dt) {
  agent.frameTimer += dt;

  switch (agent.state) {
    case 'idle': {
      if (agent.phaseStatus === 'running') {
        if (!startPathTo(agent, agent.desk.seatCol, agent.desk.seatRow, 'desk')) {
          agent.x = agent.desk.seatCol + 0.5;
          agent.y = agent.desk.seatRow + 0.5;
          agent.tileCol = agent.desk.seatCol;
          agent.tileRow = agent.desk.seatRow;
          agent.state = 'working';
          agent.dimmed = false;
          showBubble(agent, PHASE_META[agent.phaseNum].name, '');
        }
        break;
      }
      if (agent.phaseStatus === 'skipped') {
        agent.state = 'complete';
        agent.completeTimer = 2;
        showBubble(agent, 'SKIP', 'verdict-unknown');
        break;
      }

      // Idle emote timer
      agent.idleEmoteTimer -= dt;
      if (agent.idleEmoteTimer <= 0 && !agent.emoteVisible && !agent.bubbleVisible) {
        agent.emoteVisible = true;
        agent.emoteHideTimer = 2;
        agent.idleEmoteTimer = 8 + Math.random() * 15;
        if (agent.emoteEl) {
          agent.emoteEl.textContent = IDLE_EMOTES[Math.floor(Math.random() * IDLE_EMOTES.length)];
          agent.emoteEl.style.display = 'block';
          // Re-trigger animation
          agent.emoteEl.style.animation = 'none';
          agent.emoteEl.offsetHeight; // reflow
          agent.emoteEl.style.animation = '';
        }
      }
      if (agent.emoteVisible) {
        agent.emoteHideTimer -= dt;
        if (agent.emoteHideTimer <= 0) {
          agent.emoteVisible = false;
          if (agent.emoteEl) agent.emoteEl.style.display = 'none';
        }
      }

      agent.wanderTimer -= dt;
      if (agent.wanderTimer <= 0) {
        if (agent.wanderCount >= agent.wanderLimit) {
          startPathTo(agent, agent.desk.seatCol, agent.desk.seatRow, 'rest');
          agent.wanderCount = 0;
          agent.wanderLimit = WANDER_MOVES_MIN + Math.floor(Math.random() * (WANDER_MOVES_MAX - WANDER_MOVES_MIN + 1));
          agent.wanderTimer = REST_DURATION_MIN + Math.random() * (REST_DURATION_MAX - REST_DURATION_MIN);
          agent.resting = true;
        } else {
          const target = Math.random() < 0.25
            ? INTEREST_POINTS[Math.floor(Math.random() * INTEREST_POINTS.length)]
            : WALKABLE[Math.floor(Math.random() * WALKABLE.length)];
          if (startPathTo(agent, target.col, target.row, 'wander')) {
            agent.wanderCount++;
          }
          agent.wanderTimer = WANDER_PAUSE_MIN + Math.random() * (WANDER_PAUSE_MAX - WANDER_PAUSE_MIN);
        }
      }
      break;
    }

    case 'walk': {
      // Hide emote when walking
      if (agent.emoteVisible) {
        agent.emoteVisible = false;
        if (agent.emoteEl) agent.emoteEl.style.display = 'none';
      }

      if (agent.phaseStatus === 'running' && agent.walkTarget !== 'desk') {
        startPathTo(agent, agent.desk.seatCol, agent.desk.seatRow, 'desk');
      }

      if (agent.path.length === 0) {
        if (agent.walkTarget === 'desk') {
          agent.state = 'working';
          agent.dimmed = false;
          showBubble(agent, PHASE_META[agent.phaseNum].name, '');
        } else {
          agent.state = 'idle';
          agent.dimmed = agent.resting;
        }
        break;
      }

      const next = agent.path[0];
      if (next.col > agent.tileCol) agent.facingRight = true;
      else if (next.col < agent.tileCol) agent.facingRight = false;

      agent.moveProgress += WALK_SPEED * dt;
      const fromX = agent.tileCol + 0.5;
      const fromY = agent.tileRow + 0.5;
      const toX = next.col + 0.5;
      const toY = next.row + 0.5;
      const t = Math.min(agent.moveProgress, 1);
      agent.x = fromX + (toX - fromX) * t;
      agent.y = fromY + (toY - fromY) * t;

      if (agent.frameTimer >= 0.15) {
        agent.frameTimer -= 0.15;
        agent.walkFrame = (agent.walkFrame + 1) % 4;
      }

      if (agent.moveProgress >= 1) {
        agent.tileCol = next.col;
        agent.tileRow = next.row;
        agent.path.shift();
        agent.moveProgress = 0;
      }
      break;
    }

    case 'working': {
      agent.dimmed = false;
      if (agent.phaseStatus === 'complete' || agent.phaseStatus === 'failed') {
        agent.state = 'complete';
        agent.completeTimer = COMPLETE_SHOW_TIME;
        const verdict = agent.phaseVerdict || (agent.phaseStatus === 'failed' ? 'FAILED' : 'DONE');
        const cls = agent.phaseStatus === 'failed' ? 'verdict-fail' : verdictClass(agent.phaseVerdict);
        showBubble(agent, verdict, cls);
      }
      if (agent.phaseStatus === 'skipped') {
        agent.state = 'complete';
        agent.completeTimer = 2;
        showBubble(agent, 'SKIP', 'verdict-unknown');
      }
      break;
    }

    case 'complete': {
      agent.completeTimer -= dt;
      if (agent.completeTimer <= 0) {
        agent.bubbleVisible = false;
        agent.state = 'idle';
        agent.wanderTimer = 3 + Math.random() * 4;
        agent.resting = false;
        agent.dimmed = false;
      }
      break;
    }
  }

  // Apply to DOM — isometric conversion
  if (!agent.el) return;

  // Toggle state CSS classes for animations
  const newStateClass = agent.state === 'walk' ? 'agent-walking' : agent.state === 'working' ? 'agent-working' : '';
  if (newStateClass !== agent.prevStateClass) {
    if (agent.prevStateClass) agent.el.classList.remove(agent.prevStateClass);
    if (newStateClass) agent.el.classList.add(newStateClass);
    agent.prevStateClass = newStateClass;
  }

  let bounceY = 0;
  if (agent.state === 'walk') {
    bounceY = [0, -2, 0, -2][agent.walkFrame];
  } else if (agent.state === 'working') {
    bounceY = Math.sin(agent.frameTimer * 8) * 2;
  }

  const screen = toScreen(agent.x, agent.y);
  const drawX = screen.x - 8;
  const drawY = screen.y - 28 + bounceY;
  const scaleX = agent.facingRight ? 1 : -1;
  const zIdx = depthIndex(Math.round(agent.x), Math.round(agent.y)) + 100;

  agent.el.style.transform = `translate(${drawX}px, ${drawY}px) scaleX(${scaleX})`;
  agent.el.style.opacity = agent.dimmed ? '0.35' : '1';
  agent.el.style.zIndex = zIdx;

  if (agent.bubbleEl) {
    if (agent.bubbleVisible) {
      agent.bubbleEl.style.display = 'block';
      agent.bubbleEl.textContent = agent.bubbleText;
      agent.bubbleEl.style.transform = `translateX(-50%) scaleX(${scaleX})`;
      agent.bubbleEl.className = `speech-bubble ${agent.bubbleClass || ''}`;
    } else {
      agent.bubbleEl.style.display = 'none';
    }
  }

  if (agent.nameEl) {
    agent.nameEl.style.transform = `scaleX(${scaleX})`;
  }
}

// ===================================
// REDUCER
// ===================================
const initialState = { session: null, phases: new Map() };

function reducer(state, action) {
  switch (action.type) {
    case 'init': {
      const phases = new Map();
      (action.phases || []).forEach(p => phases.set(p.phase, p));
      return { session: action.session, phases };
    }
    case 'update': {
      const newPhases = new Map(state.phases);
      newPhases.set(action.phase.phase, action.phase);
      return { ...state, phases: newPhases };
    }
    default:
      return state;
  }
}

// ===================================
// REACT COMPONENTS
// ===================================
function Header({ session, connected }) {
  return (
    <div className="header">
      <h1>PIPELINE VIZ</h1>
      <div>
        <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></span>
        <span className="session">{session || 'Waiting for session...'}</span>
      </div>
    </div>
  );
}

function ProgressBar({ phases }) {
  const total = 20;
  let completed = 0;
  phases.forEach(p => {
    if (p.status === 'complete' || p.status === 'skipped') completed++;
  });
  const pct = Math.round((completed / total) * 100);
  return (
    <div className="progress-bar-container">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }}></div>
      </div>
      <div className="progress-label">{completed}/{total} phases — {pct}%</div>
    </div>
  );
}

// ===================================
// ISOMETRIC FLOOR RENDERING
// ===================================
function roomDiamondPath(startCol, startRow, endCol, endRow) {
  const tl = toScreen(startCol, startRow);
  const tr = toScreen(endCol, startRow);
  const br = toScreen(endCol, endRow);
  const bl = toScreen(startCol, endRow);
  return `polygon(${tl.x}px ${tl.y}px, ${tr.x}px ${tr.y}px, ${br.x}px ${br.y}px, ${bl.x}px ${bl.y}px)`;
}

function RoomFloors() {
  const rooms = [
    { name: 'office', c0: 0, r0: 0, c1: 20, r1: 20, color: '#1e1a35' },
    { name: 'break',  c0: 20, r0: 0, c1: 28, r1: 10, color: '#231a30' },
    { name: 'study',  c0: 20, r0: 10, c1: 28, r1: 20, color: '#1a1d30' },
  ];

  const gridSvg = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_W}" height="${TILE_H}"><path d="M${TILE_W/2} 0 L${TILE_W} ${TILE_H/2} L${TILE_W/2} ${TILE_H} L0 ${TILE_H/2} Z" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="0.5"/></svg>`)}`;

  return rooms.map(room => {
    const clip = roomDiamondPath(room.c0, room.r0, room.c1, room.r1);
    const texture = FLOOR_TEXTURES[room.name] || '';
    return (
      <div key={room.name} className="room-floor" style={{
        clipPath: clip,
        backgroundColor: room.color,
        backgroundImage: texture ? `url("${texture}"), url("${gridSvg}")` : `url("${gridSvg}")`,
        backgroundSize: texture ? `${TILE_W}px ${TILE_H}px, ${TILE_W}px ${TILE_H}px` : `${TILE_W}px ${TILE_H}px`,
        zIndex: 0,
      }} />
    );
  });
}

// ===================================
// WALL RENDERING
// ===================================
function WallSegment({ col, row, length, direction }) {
  const segments = [];
  for (let i = 0; i < length; i++) {
    const c = direction === 'east' ? col + i : col;
    const r = direction === 'south' ? row + i : row;
    const p0 = toScreen(c, r);
    const p1 = direction === 'east' ? toScreen(c + 1, r) : toScreen(c, r + 1);

    const pts = [
      { x: p0.x, y: p0.y - WALL_H },
      { x: p1.x, y: p1.y - WALL_H },
      { x: p1.x, y: p1.y },
      { x: p0.x, y: p0.y },
    ];

    const minX = Math.min(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y));
    const maxX = Math.max(...pts.map(p => p.x));
    const maxY = Math.max(...pts.map(p => p.y));
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const clip = `polygon(${pts.map(p => `${p.x - minX}px ${p.y - minY}px`).join(', ')})`;
    const zIdx = depthIndex(c, r);

    segments.push(
      <div key={`${c}-${r}`} className="wall-strip" style={{
        left: minX, top: minY, width: w, height: h,
        clipPath: clip,
        background: `linear-gradient(180deg, #3a3660, #252244)`,
        backgroundImage: `url("${WALL_BRICK_SVG}")`,
        backgroundSize: '16px 8px',
        borderTop: '1px solid rgba(255,255,255,0.15)',
        zIndex: zIdx,
      }} />
    );
  }
  return segments;
}

function Walls() {
  const walls = [];

  // Main office north wall (row 0, cols 0-20)
  walls.push(<WallSegment key="on" col={0} row={0} length={20} direction="east" />);
  // Main office west wall (col 0, rows 0-20)
  walls.push(<WallSegment key="ow" col={0} row={0} length={20} direction="south" />);
  // Main office south wall (row 20, cols 0-20)
  walls.push(<WallSegment key="os" col={0} row={20} length={20} direction="east" />);

  // Break room north wall (row 0, cols 20-28)
  walls.push(<WallSegment key="bn" col={20} row={0} length={8} direction="east" />);
  // Break room east wall (col 28, rows 0-10)
  walls.push(<WallSegment key="be" col={28} row={0} length={10} direction="south" />);

  // Study room east wall (col 28, rows 10-20)
  walls.push(<WallSegment key="se" col={28} row={10} length={10} direction="south" />);
  // Study room south wall (row 20, cols 20-28)
  walls.push(<WallSegment key="ss" col={20} row={20} length={8} direction="east" />);

  // Internal wall: office-to-side rooms at col 20
  walls.push(<WallSegment key="i1" col={20} row={0} length={3} direction="south" />);
  walls.push(<WallSegment key="i2" col={20} row={5} length={9} direction="south" />);
  walls.push(<WallSegment key="i3" col={20} row={16} length={4} direction="south" />);

  // Internal wall: break-study divider at row 10
  walls.push(<WallSegment key="d1" col={20} row={10} length={3} direction="east" />);
  walls.push(<WallSegment key="d2" col={25} row={10} length={3} direction="east" />);

  return walls;
}

// ===================================
// ISO BOX FURNITURE COMPONENT
// ===================================
function IsoBox({ col, row, boxW, boxD, boxH, topColor, frontColor, sideColor, label, zIndex, onClick, className, children }) {
  const faces = isoBoxFaces(col, row, boxW || 1, boxD || 1, boxH || 16);

  // Edge highlight on top face, shadow on right face bottom
  const topGrad = `linear-gradient(135deg, rgba(255,255,255,0.15), ${topColor[0]} 25%, ${topColor[1]})`;
  const leftGrad = `linear-gradient(180deg, ${frontColor[0]}, ${frontColor[1]})`;
  const rightGrad = `linear-gradient(180deg, ${sideColor[0]}, ${sideColor[1]}, rgba(0,0,0,0.2))`;

  const zIdx = zIndex != null ? zIndex : depthIndex(col + (boxW || 1), row + (boxD || 1));
  const cls = ['iso-box', className].filter(Boolean).join(' ');

  return (
    <div className={cls} style={{
      left: faces.minX, top: faces.minY,
      width: faces.w, height: faces.h,
      zIndex: zIdx,
      cursor: onClick ? 'pointer' : 'default',
      pointerEvents: onClick ? 'auto' : 'none',
      filter: 'drop-shadow(1px 2px 2px rgba(0,0,0,0.35))',
    }} onClick={onClick}>
      <div className="iso-face" style={{
        width: faces.w, height: faces.h,
        clipPath: faces.topClip,
        background: topGrad,
      }} />
      <div className="iso-face" style={{
        width: faces.w, height: faces.h,
        clipPath: faces.leftClip,
        background: leftGrad,
      }} />
      <div className="iso-face" style={{
        width: faces.w, height: faces.h,
        clipPath: faces.rightClip,
        background: rightGrad,
      }} />
      {children}
    </div>
  );
}

function FurnitureItem({ item }) {
  const colors = FURN_COLORS[item.type] || FURN_COLORS.desk;
  const labelPos = toScreen(item.col + item.w / 2, item.row + item.d / 2);
  const zIdx = depthIndex(item.col + item.w, item.row + item.d);

  // Anchor points for detail placement
  const topC = toScreen(item.col + item.w / 2, item.row + item.d / 2);
  const frontE = toScreen(item.col + item.w * 0.4, item.row + item.d);
  const sideE = toScreen(item.col + item.w, item.row + item.d * 0.4);

  return (
    <React.Fragment>
      <IsoBox
        col={item.col} row={item.row}
        boxW={item.w} boxD={item.d} boxH={item.h}
        topColor={colors.top} frontColor={colors.front} sideColor={colors.side}
        className={`furn-${item.type}`}
      />

      {/* ---- COFFEE MACHINE ---- */}
      {item.type === 'coffee' && (
        <React.Fragment>
          {/* Power indicator */}
          <div className="furn-detail" style={{
            left: frontE.x - 1, top: frontE.y - item.h + 3,
            width: 3, height: 3, borderRadius: '50%',
            background: '#e63946',
            boxShadow: '0 0 4px rgba(230,57,70,0.5)',
            zIndex: zIdx + 1,
          }} />
          {/* Drip nozzle */}
          <div className="furn-detail" style={{
            left: frontE.x - 3, top: frontE.y - item.h + 9,
            width: 6, height: 3,
            background: 'rgba(60,45,30,0.6)',
            borderRadius: '0 0 2px 2px',
            zIndex: zIdx + 1,
          }} />
          {/* Carafe */}
          <div className="furn-detail" style={{
            left: frontE.x - 5, top: frontE.y - 9,
            width: 10, height: 8,
            background: 'linear-gradient(180deg, rgba(60,45,30,0.7), rgba(40,28,18,0.6))',
            border: '1px solid rgba(100,80,60,0.4)',
            borderRadius: '1px 1px 4px 4px',
            zIndex: zIdx + 1,
          }} />
          {/* Carafe handle */}
          <div className="furn-detail" style={{
            left: frontE.x + 5, top: frontE.y - 7,
            width: 3, height: 5,
            borderRight: '2px solid rgba(100,80,60,0.4)',
            borderTop: '2px solid rgba(100,80,60,0.4)',
            borderBottom: '2px solid rgba(100,80,60,0.4)',
            borderRadius: '0 3px 3px 0',
            zIndex: zIdx + 1,
          }} />
          {/* Side buttons */}
          <div className="furn-detail" style={{
            left: sideE.x - 3, top: sideE.y - item.h + 5,
            width: 2, height: 2, borderRadius: '50%',
            background: 'rgba(200,200,200,0.2)',
            boxShadow: '0 4px 0 rgba(200,200,200,0.2), 0 8px 0 rgba(200,200,200,0.15)',
            zIndex: zIdx + 1,
          }} />
        </React.Fragment>
      )}

      {/* ---- VENDING MACHINE ---- */}
      {item.type === 'vending' && (
        <React.Fragment>
          {/* Glass display window */}
          <div className="furn-detail" style={{
            left: frontE.x - 7, top: frontE.y - item.h + 3,
            width: 14, height: 16,
            background: 'linear-gradient(180deg, rgba(50,80,130,0.5), rgba(30,55,90,0.4))',
            border: '1px solid rgba(90,140,200,0.35)',
            borderRadius: 1,
            boxShadow: 'inset 0 0 4px rgba(60,100,160,0.15)',
            zIndex: zIdx + 1,
          }} />
          {/* Product rows — cans/bottles */}
          <div className="furn-detail" style={{
            left: frontE.x - 5, top: frontE.y - item.h + 5,
            width: 10, height: 12,
            backgroundImage:
              'repeating-linear-gradient(180deg,' +
              'rgba(255,100,100,0.3) 0px, rgba(255,100,100,0.3) 2.5px, transparent 2.5px, transparent 4px,' +
              'rgba(100,210,100,0.3) 4px, rgba(100,210,100,0.3) 6.5px, transparent 6.5px, transparent 8px,' +
              'rgba(100,100,255,0.3) 8px, rgba(100,100,255,0.3) 10.5px, transparent 10.5px, transparent 12px)',
            zIndex: zIdx + 2,
          }} />
          {/* Coin slot */}
          <div className="furn-detail" style={{
            left: sideE.x - 4, top: sideE.y - 10,
            width: 3, height: 6,
            background: '#1a1a25',
            border: '1px solid rgba(140,140,140,0.3)',
            borderRadius: 1,
            zIndex: zIdx + 1,
          }} />
          {/* Selection buttons */}
          <div className="furn-detail" style={{
            left: frontE.x - 3, top: frontE.y - 5,
            width: 3, height: 3, borderRadius: '50%',
            background: '#c8a020',
            boxShadow: '5px 0 0 #40c040, 10px 0 0 #d04040',
            zIndex: zIdx + 2,
          }} />
          {/* Brand label */}
          <div className="furn-detail" style={{
            left: frontE.x - 5, top: frontE.y - item.h + 20,
            width: 10, height: 2,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 1,
            zIndex: zIdx + 2,
          }} />
        </React.Fragment>
      )}

      {/* ---- WATER COOLER ---- */}
      {item.type === 'water' && (
        <React.Fragment>
          {/* Water bottle on top */}
          <div className="furn-detail" style={{
            left: topC.x - 5, top: topC.y - item.h - 12,
            width: 10, height: 14,
            borderRadius: '5px 5px 1px 1px',
            background: 'linear-gradient(180deg, rgba(160,220,250,0.65), rgba(100,180,230,0.5))',
            border: '1px solid rgba(140,210,240,0.4)',
            boxShadow: '0 0 4px rgba(100,180,230,0.15)',
            zIndex: zIdx + 2,
          }} />
          {/* Bottle cap */}
          <div className="furn-detail" style={{
            left: topC.x - 3, top: topC.y - item.h - 14,
            width: 6, height: 3,
            borderRadius: '2px 2px 0 0',
            background: '#6ab8e0',
            zIndex: zIdx + 3,
          }} />
          {/* Water level line */}
          <div className="furn-detail" style={{
            left: topC.x - 4, top: topC.y - item.h - 5,
            width: 8, height: 1,
            background: 'rgba(80,160,220,0.35)',
            zIndex: zIdx + 3,
          }} />
          {/* Tap/spigot */}
          <div className="furn-detail" style={{
            left: frontE.x + 3, top: frontE.y - item.h / 2 - 1,
            width: 5, height: 3,
            background: '#8090a0',
            borderRadius: '0 2px 2px 0',
            zIndex: zIdx + 1,
          }} />
          {/* Drip tray */}
          <div className="furn-detail" style={{
            left: frontE.x - 4, top: frontE.y - 3,
            width: 8, height: 2,
            background: 'rgba(120,120,130,0.35)',
            borderRadius: 1,
            zIndex: zIdx + 1,
          }} />
        </React.Fragment>
      )}

      {/* ---- COUCH ---- */}
      {item.type === 'couch' && (
        <React.Fragment>
          {/* Back rest */}
          <div className="furn-detail" style={{
            left: topC.x - 18, top: topC.y - item.h - 8,
            width: 36, height: 9,
            background: 'linear-gradient(180deg, #6a4880, #503068)',
            borderRadius: '4px 4px 0 0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            zIndex: zIdx - 1,
          }} />
          {/* Cushion seams */}
          <div className="furn-detail" style={{
            left: topC.x - 1, top: topC.y - item.h + 1,
            width: 1, height: 6,
            background: 'rgba(0,0,0,0.2)',
            zIndex: zIdx + 1,
          }} />
          <div className="furn-detail" style={{
            left: topC.x - 1, top: topC.y - item.h - 6,
            width: 1, height: 5,
            background: 'rgba(0,0,0,0.15)',
            zIndex: zIdx + 1,
          }} />
          {/* Throw pillow */}
          <div className="furn-detail" style={{
            left: topC.x - 13, top: topC.y - item.h - 3,
            width: 8, height: 6,
            background: 'linear-gradient(135deg, #a080c0, #8060a0)',
            borderRadius: 3,
            border: '1px solid rgba(180,140,210,0.3)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            zIndex: zIdx + 1,
          }} />
          {/* Armrests */}
          <div className="furn-detail" style={{
            left: topC.x - 22, top: topC.y - item.h - 2,
            width: 6, height: 9,
            background: 'linear-gradient(180deg, #6a4880, #4a2860)',
            borderRadius: '4px 0 0 4px',
            zIndex: zIdx + 1,
          }} />
          <div className="furn-detail" style={{
            left: topC.x + 17, top: topC.y - item.h - 2,
            width: 6, height: 9,
            background: 'linear-gradient(180deg, #6a4880, #4a2860)',
            borderRadius: '0 4px 4px 0',
            zIndex: zIdx + 1,
          }} />
        </React.Fragment>
      )}

      {/* ---- PLANT ---- */}
      {item.type === 'plant' && (
        <React.Fragment>
          {/* Main leaf cluster */}
          <div className="furn-detail" style={{
            left: topC.x - 10, top: topC.y - item.h - 7,
            width: 20, height: 13,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(56,183,100,0.8), rgba(42,144,80,0.4) 55%, transparent 80%)',
            zIndex: zIdx + 2,
          }} />
          {/* Left leaf frond */}
          <div className="furn-detail" style={{
            left: topC.x - 16, top: topC.y - item.h - 2,
            width: 13, height: 7,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(50,160,90,0.7), rgba(40,130,70,0.2) 65%, transparent 80%)',
            transform: 'rotate(-25deg)',
            zIndex: zIdx + 2,
          }} />
          {/* Right leaf frond */}
          <div className="furn-detail" style={{
            left: topC.x + 4, top: topC.y - item.h - 3,
            width: 13, height: 7,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(45,150,85,0.7), rgba(35,120,65,0.2) 65%, transparent 80%)',
            transform: 'rotate(25deg)',
            zIndex: zIdx + 2,
          }} />
          {/* Top bud */}
          <div className="furn-detail" style={{
            left: topC.x - 3, top: topC.y - item.h - 11,
            width: 6, height: 5,
            borderRadius: '60% 40% 50% 50%',
            background: 'rgba(60,210,110,0.6)',
            zIndex: zIdx + 3,
          }} />
        </React.Fragment>
      )}

      {/* ---- WHITEBOARD ---- */}
      {item.type === 'whiteboard' && (
        <React.Fragment>
          {/* Writing surface */}
          <div className="furn-detail" style={{
            left: frontE.x - 13, top: frontE.y - item.h + 3,
            width: 26, height: 18,
            background: 'rgba(240,240,245,0.12)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 1,
            zIndex: zIdx + 1,
          }} />
          {/* Diagram scribbles */}
          <div className="furn-detail" style={{
            left: frontE.x - 9, top: frontE.y - item.h + 6,
            width: 18, height: 12,
            backgroundImage:
              'linear-gradient(165deg, transparent 35%, rgba(59,130,246,0.25) 35%, rgba(59,130,246,0.25) 37%, transparent 37%),' +
              'linear-gradient(175deg, transparent 25%, rgba(239,68,68,0.2) 25%, rgba(239,68,68,0.2) 27%, transparent 27%),' +
              'linear-gradient(155deg, transparent 50%, rgba(34,197,94,0.18) 50%, rgba(34,197,94,0.18) 52%, transparent 52%),' +
              'linear-gradient(180deg, transparent 65%, rgba(200,200,200,0.12) 65%, rgba(200,200,200,0.12) 67%, transparent 67%)',
            zIndex: zIdx + 2,
          }} />
          {/* Marker tray + colored markers */}
          <div className="furn-detail furn-wb-tray" style={{
            left: frontE.x - 11, top: frontE.y - 4,
            zIndex: zIdx + 1,
          }} />
        </React.Fragment>
      )}

      {/* ---- BOOKSHELF ---- */}
      {item.type === 'bookshelf' && (
        <React.Fragment>
          {/* Shelf dividers */}
          <div className="furn-detail" style={{
            left: frontE.x - 6, top: frontE.y - item.h * 0.65,
            width: 12, height: 1,
            background: 'rgba(90,58,32,0.4)',
            zIndex: zIdx + 1,
          }} />
          <div className="furn-detail" style={{
            left: frontE.x - 6, top: frontE.y - item.h * 0.35,
            width: 12, height: 1,
            background: 'rgba(90,58,32,0.4)',
            zIndex: zIdx + 1,
          }} />
          {/* Decorative globe on top */}
          <div className="furn-detail" style={{
            left: topC.x - 2, top: topC.y - item.h - 4,
            width: 5, height: 5,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, rgba(200,180,100,0.35), rgba(140,120,60,0.15))',
            zIndex: zIdx + 2,
          }} />
          {/* Leaning book on top */}
          <div className="furn-detail" style={{
            left: topC.x + 4, top: topC.y - item.h - 3,
            width: 3, height: 6,
            background: 'rgba(180,60,60,0.2)',
            transform: 'rotate(10deg)',
            borderRadius: 0.5,
            zIndex: zIdx + 2,
          }} />
        </React.Fragment>
      )}

      {/* ---- LAMP ---- */}
      {item.type === 'lamp' && (
        <React.Fragment>
          {/* Lamp shade (trapezoid) */}
          <div className="furn-detail" style={{
            left: topC.x - 10, top: topC.y - item.h - 4,
            width: 20, height: 9,
            background: 'linear-gradient(180deg, #ffe08a, #d4a030)',
            clipPath: 'polygon(25% 0%, 75% 0%, 100% 100%, 0% 100%)',
            zIndex: zIdx + 2,
          }} />
          {/* Warm glow halo under shade */}
          <div className="furn-detail" style={{
            left: topC.x - 20, top: topC.y - item.h - 10,
            width: 40, height: 28,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(255,213,79,0.15), rgba(255,200,60,0.05) 50%, transparent 75%)',
            zIndex: zIdx + 1,
          }} />
          {/* Bulb dot */}
          <div className="furn-detail" style={{
            left: topC.x - 2, top: topC.y - item.h - 1,
            width: 4, height: 3,
            borderRadius: '50%',
            background: '#ffe88a',
            boxShadow: '0 0 6px rgba(255,213,79,0.6)',
            zIndex: zIdx + 2,
          }} />
        </React.Fragment>
      )}

      {/* ---- READ DESK ---- */}
      {item.type === 'readdesk' && (
        <React.Fragment>
          {/* Open book */}
          <div className="furn-detail" style={{
            left: topC.x - 6, top: topC.y - item.h - 2,
            width: 12, height: 8,
            background: 'rgba(255,255,240,0.2)',
            border: '1px solid rgba(200,200,180,0.15)',
            borderRadius: 1,
            zIndex: zIdx + 1,
          }} />
          {/* Book spine */}
          <div className="furn-detail" style={{
            left: topC.x, top: topC.y - item.h - 2,
            width: 1, height: 8,
            background: 'rgba(120,90,60,0.4)',
            zIndex: zIdx + 2,
          }} />
          {/* Text lines on pages */}
          <div className="furn-detail" style={{
            left: topC.x - 4, top: topC.y - item.h,
            width: 3, height: 1,
            background: 'rgba(120,120,120,0.2)',
            boxShadow: '0 2px 0 rgba(120,120,120,0.15), 6px 0 0 rgba(120,120,120,0.2), 6px 2px 0 rgba(120,120,120,0.15), 0 4px 0 rgba(120,120,120,0.12), 6px 4px 0 rgba(120,120,120,0.12)',
            zIndex: zIdx + 2,
          }} />
          {/* Pencil */}
          <div className="furn-detail" style={{
            left: topC.x + 7, top: topC.y - item.h,
            width: 1, height: 8,
            background: '#c8a030',
            transform: 'rotate(15deg)',
            zIndex: zIdx + 1,
          }} />
          {/* Pencil tip */}
          <div className="furn-detail" style={{
            left: topC.x + 7, top: topC.y - item.h + 7,
            width: 1, height: 2,
            background: '#333',
            transform: 'rotate(15deg)',
            zIndex: zIdx + 1,
          }} />
        </React.Fragment>
      )}

      {/* ---- BEANBAG ---- */}
      {item.type === 'beanbag' && (
        <React.Fragment>
          {/* Wrinkle lines */}
          <div className="furn-detail" style={{
            left: frontE.x - 4, top: frontE.y - item.h * 0.6,
            width: 8, height: 1,
            background: 'rgba(0,0,0,0.1)',
            borderRadius: 1,
            transform: 'rotate(-5deg)',
            zIndex: zIdx + 1,
          }} />
          <div className="furn-detail" style={{
            left: frontE.x - 3, top: frontE.y - item.h * 0.3,
            width: 6, height: 1,
            background: 'rgba(0,0,0,0.08)',
            borderRadius: 1,
            transform: 'rotate(3deg)',
            zIndex: zIdx + 1,
          }} />
          {/* Soft highlight on top */}
          <div className="furn-detail" style={{
            left: topC.x - 6, top: topC.y - item.h - 1,
            width: 12, height: 6,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(150,110,200,0.15), transparent 70%)',
            zIndex: zIdx + 1,
          }} />
        </React.Fragment>
      )}

      {item.label && (
        <div className="furn-label" style={{
          left: labelPos.x, top: labelPos.y + 4,
          transform: 'translateX(-50%)',
          zIndex: zIdx + 1,
        }}>{item.label}</div>
      )}
    </React.Fragment>
  );
}

// ===================================
// DESK COMPONENT
// ===================================
function DeskTile({ phase, desk, status, verdict, isActive, onClick }) {
  const colors = FURN_COLORS.desk;
  const classes = ['desk-tile'];
  if (isActive) classes.push('desk-active');
  if (status === 'complete') classes.push('desk-complete');
  if (status === 'failed') classes.push('desk-failed');

  const faces = isoBoxFaces(desk.col, desk.row, 2, 1, 14);
  const badgePos = toScreen(desk.col + 1, desk.row + 0.5);
  const zIdx = depthIndex(desk.col + 2, desk.row + 1);

  // Monitor & keyboard anchor points
  const monPos = toScreen(desk.col + 0.7, desk.row + 0.3);
  const kbPos = toScreen(desk.col + 1.2, desk.row + 0.6);
  const mousePos = toScreen(desk.col + 1.6, desk.row + 0.5);
  const screenColor = isActive
    ? 'linear-gradient(180deg, #5090e0, #3060c0)'
    : status === 'complete'
      ? 'linear-gradient(180deg, rgba(56,183,100,0.5), rgba(40,140,70,0.35))'
      : 'linear-gradient(180deg, #2a2e40, #1e2030)';
  const screenBorder = isActive
    ? '1px solid #70a8ff'
    : status === 'complete'
      ? '1px solid rgba(56,183,100,0.5)'
      : '1px solid #3a3e52';
  const screenGlow = isActive
    ? '0 0 8px rgba(80,144,224,0.5), 0 0 3px rgba(80,144,224,0.3)'
    : status === 'complete'
      ? '0 0 4px rgba(56,183,100,0.25)'
      : 'none';

  return (
    <React.Fragment>
      <div className={classes.join(' ')} style={{
        left: faces.minX, top: faces.minY,
        width: faces.w, height: faces.h,
        zIndex: zIdx,
        filter: 'drop-shadow(1px 2px 2px rgba(0,0,0,0.35))',
      }} onClick={onClick}>
        <div className="iso-face" style={{
          width: faces.w, height: faces.h,
          clipPath: faces.topClip,
          background: `linear-gradient(135deg, rgba(255,255,255,0.12), ${colors.top[0]} 25%, ${colors.top[1]})`,
        }} />
        <div className="iso-face" style={{
          width: faces.w, height: faces.h,
          clipPath: faces.leftClip,
          background: `linear-gradient(180deg, ${colors.front[0]}, ${colors.front[1]})`,
        }} />
        <div className="iso-face" style={{
          width: faces.w, height: faces.h,
          clipPath: faces.rightClip,
          background: `linear-gradient(180deg, ${colors.side[0]}, ${colors.side[1]}, rgba(0,0,0,0.2))`,
        }} />
      </div>
      {/* Monitor screen */}
      <div className="furn-detail desk-monitor" style={{
        left: monPos.x - 6, top: monPos.y - 24,
        width: 12, height: 9,
        background: screenColor,
        border: screenBorder,
        borderRadius: 1,
        boxShadow: screenGlow,
        zIndex: zIdx + 1,
      }} />
      {/* Monitor bezel bottom (stand mount) */}
      <div className="furn-detail" style={{
        left: monPos.x - 3, top: monPos.y - 15,
        width: 6, height: 2,
        background: '#2a2e3a',
        border: '1px solid #3a3e4a',
        borderRadius: '0 0 1px 1px',
        zIndex: zIdx + 1,
      }} />
      {/* Monitor stand */}
      <div className="furn-detail" style={{
        left: monPos.x - 1, top: monPos.y - 13,
        width: 2, height: 4,
        background: '#3a3e4a',
        zIndex: zIdx + 1,
      }} />
      {/* Stand base */}
      <div className="furn-detail" style={{
        left: monPos.x - 3, top: monPos.y - 9,
        width: 6, height: 2,
        background: '#2a2e3a',
        borderRadius: 1,
        zIndex: zIdx + 1,
      }} />
      {/* Keyboard */}
      <div className="furn-detail" style={{
        left: kbPos.x - 5, top: kbPos.y - 16,
        width: 10, height: 4,
        background: 'linear-gradient(180deg, #3a3e4a, #2a2e38)',
        borderRadius: 1,
        border: '1px solid #4a4e5a',
        zIndex: zIdx + 1,
      }} />
      {/* Key rows texture */}
      <div className="furn-detail" style={{
        left: kbPos.x - 4, top: kbPos.y - 15,
        width: 8, height: 2,
        backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 2.5px)',
        zIndex: zIdx + 2,
      }} />
      {/* Mouse */}
      <div className="furn-detail" style={{
        left: mousePos.x - 2, top: mousePos.y - 15,
        width: 3, height: 4,
        background: 'linear-gradient(180deg, #3a3e4a, #2a2e38)',
        borderRadius: '1px 1px 2px 2px',
        border: '1px solid #4a4e5a',
        zIndex: zIdx + 1,
      }} />
      <div className="desk-badge" style={{
        left: badgePos.x, top: badgePos.y - 20,
        transform: 'translateX(-50%)',
        zIndex: zIdx + 2,
      }}>#{phase}</div>
      {verdict && (
        <div className={`desk-verdict ${verdictClass(verdict)}`} style={{
          left: badgePos.x, top: badgePos.y - 12,
          transform: 'translateX(-50%)',
          zIndex: zIdx + 2,
        }}>
          {verdict.length > 8 ? verdict.substring(0, 7) + '..' : verdict}
        </div>
      )}
    </React.Fragment>
  );
}

// ===================================
// ROOM LABELS
// ===================================
function RoomLabels() {
  const officePos = toScreen(10, 18);
  const breakPos = toScreen(24, 1);
  const studyPos = toScreen(24, 11);
  return (
    <React.Fragment>
      <div className="room-label" style={{ left: officePos.x - 40, top: officePos.y - 5, zIndex: 1 }}>
        MAIN OFFICE
      </div>
      <div className="room-label" style={{ left: breakPos.x - 30, top: breakPos.y - 5, zIndex: 1 }}>
        BREAK ROOM
      </div>
      <div className="room-label" style={{ left: studyPos.x - 30, top: studyPos.y - 5, zIndex: 1 }}>
        STUDY ROOM
      </div>
    </React.Fragment>
  );
}

// ===================================
// LIGHT OVERLAYS
// ===================================
function LightOverlays({ phases }) {
  const lights = [];

  // Study lamp warm glow
  const lampPos = toScreen(24.5, 14.5);
  lights.push(
    <div key="lamp" className="light-source light-lamp" style={{
      left: lampPos.x - 60, top: lampPos.y - 80,
    }} />
  );

  // Coffee machine indicator
  const coffeePos = toScreen(22.5, 2.5);
  lights.push(
    <div key="coffee" className="light-source light-coffee" style={{
      left: coffeePos.x - 20, top: coffeePos.y - 30,
    }} />
  );

  // Active desk screen glows
  phases.forEach((event, phaseNum) => {
    if (event.status === 'running' && phaseNum < DESKS.length) {
      const desk = DESKS[phaseNum];
      const deskPos = toScreen(desk.col + 1, desk.row + 0.5);
      lights.push(
        <div key={`screen-${phaseNum}`} className="light-source light-screen" style={{
          left: deskPos.x - 25, top: deskPos.y - 35,
        }} />
      );
    }
  });

  return lights;
}

// ===================================
// DECORATIONS
// ===================================
function Decorations() {
  const decorations = [];

  // 2 poster frames on office north wall
  const poster1Pos = toScreen(5, 0);
  const poster2Pos = toScreen(12, 0);
  decorations.push(
    <div key="poster1" className="decor-poster" style={{
      left: poster1Pos.x - 6, top: poster1Pos.y - WALL_H + 3,
      width: 12, height: 8,
      background: 'linear-gradient(135deg, #3a2a6a, #5a3a8a)',
      zIndex: depthIndex(5, 0) + 1,
    }} />
  );
  decorations.push(
    <div key="poster2" className="decor-poster" style={{
      left: poster2Pos.x - 6, top: poster2Pos.y - WALL_H + 3,
      width: 12, height: 8,
      background: 'linear-gradient(135deg, #2a5a3a, #3a8a5a)',
      zIndex: depthIndex(12, 0) + 1,
    }} />
  );

  // Clock on break room wall
  const clockPos = toScreen(24, 0);
  decorations.push(
    <div key="clock" className="decor-clock" style={{
      left: clockPos.x - 5, top: clockPos.y - WALL_H + 3,
      zIndex: depthIndex(24, 0) + 1,
    }}>
      <div className="decor-clock-hand" />
    </div>
  );

  // Rug under couch
  const rugPos = toScreen(24.5, 7);
  decorations.push(
    <div key="rug" className="decor-rug" style={{
      left: rugPos.x - 25, top: rugPos.y - 4,
      width: 50, height: 16,
      background: 'radial-gradient(ellipse, rgba(106,74,122,0.15), rgba(90,58,106,0.05) 60%, transparent 80%)',
      zIndex: 1,
    }} />
  );

  // 3 scattered paper scraps near random desks
  const paperPositions = [
    { col: 5.5, row: 4.2, rot: 15 },
    { col: 9.3, row: 7.8, rot: -25 },
    { col: 14.7, row: 12.3, rot: 42 },
  ];
  paperPositions.forEach((pp, i) => {
    const pPos = toScreen(pp.col, pp.row);
    decorations.push(
      <div key={`paper-${i}`} className="decor-paper" style={{
        left: pPos.x - 2, top: pPos.y - 2,
        '--paper-rot': `${pp.rot}deg`,
        zIndex: depthIndex(Math.round(pp.col), Math.round(pp.row)) + 1,
      }} />
    );
  });

  // Mug on reading desk
  const mugPos = toScreen(23.7, 14.3);
  decorations.push(
    <div key="mug" className="decor-mug" style={{
      left: mugPos.x - 2, top: mugPos.y - 18,
      zIndex: depthIndex(24, 15) + 1,
    }} />
  );

  return decorations;
}

// ===================================
// INFO PANEL
// ===================================
function InfoPanel({ selectedPhase, phases, runningTimestamps }) {
  if (selectedPhase === null) {
    return (
      <div className="info-panel">
        <span className="info-hint">Click an agent or desk to see details</span>
      </div>
    );
  }
  const meta = PHASE_META.find(m => m.phase === selectedPhase);
  const event = phases.get(selectedPhase);
  const runEv = runningTimestamps.get(selectedPhase);
  const elapsed = getElapsed(event, runEv);
  const status = event ? event.status : 'idle';
  const icons = { idle: '...', running: '>>>', complete: '[OK]', failed: '[!!]', skipped: '[--]' };
  return (
    <div className="info-panel">
      <span className="info-phase">#{selectedPhase}</span>
      <span className="info-name">{meta ? meta.name : `Phase ${selectedPhase}`}</span>
      <span className={`info-status info-status-${status}`}>{icons[status] || '...'} {status.toUpperCase()}</span>
      {event && event.verdict && <span className={`info-verdict ${verdictClass(event.verdict)}`}>{event.verdict}</span>}
      {elapsed && <span className="info-elapsed">{elapsed}</span>}
      {event && event.artifact && <span className="info-artifact">{event.artifact}</span>}
    </div>
  );
}

// ===================================
// OFFICE SCENE — game loop + DOM refs
// ===================================
function OfficeScene({ phases }) {
  const agentsRef = useRef(null);
  const [selectedPhase, setSelectedPhase] = useState(null);
  const runningTimestamps = useRef(new Map());
  const particlePoolRef = useRef(null);
  const particleContainerRef = useRef(null);
  const emitTimerRef = useRef(0);

  if (!agentsRef.current) {
    agentsRef.current = PHASE_META.map((_, i) => createAgent(i));
  }

  useEffect(() => {
    phases.forEach((event, phaseNum) => {
      if (event.status === 'running') {
        runningTimestamps.current.set(phaseNum, event);
      }
    });
  }, [phases]);

  useEffect(() => {
    if (!agentsRef.current) return;
    agentsRef.current.forEach(agent => {
      const event = phases.get(agent.phaseNum);
      agent.phaseStatus = event ? event.status : 'idle';
      agent.phaseVerdict = event ? event.verdict : null;
    });
  }, [phases]);

  // Initialize particle pool
  useEffect(() => {
    if (particleContainerRef.current && !particlePoolRef.current) {
      particlePoolRef.current = createParticlePool(particleContainerRef.current);
    }
  }, []);

  // Game loop
  useEffect(() => {
    let lastTime = performance.now();
    let rafId;
    const frame = (time) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      if (agentsRef.current) {
        agentsRef.current.forEach(agent => updateAgent(agent, dt));
      }

      // Particle system
      if (particlePoolRef.current) {
        updateParticles(particlePoolRef.current, dt);

        emitTimerRef.current -= dt;
        if (emitTimerRef.current <= 0) {
          emitTimerRef.current = PARTICLE_EMIT_INTERVAL;

          // Ambient dust
          if (Math.random() < 0.3) {
            const dustTile = WALKABLE[Math.floor(Math.random() * WALKABLE.length)];
            const dustScreen = toScreen(dustTile.col + 0.5, dustTile.row + 0.5);
            emitParticle(particlePoolRef.current, 'dust', dustScreen.x, dustScreen.y);
          }

          // Sparkles near lamp
          if (Math.random() < 0.4) {
            const lampScreen = toScreen(24.5, 14.5);
            emitParticle(particlePoolRef.current, 'sparkle', lampScreen.x, lampScreen.y - 20);
          }

          // Steam from coffee machine
          if (Math.random() < 0.35) {
            const coffeeScreen = toScreen(22.5, 2.5);
            emitParticle(particlePoolRef.current, 'steam', coffeeScreen.x, coffeeScreen.y - 18);
          }

          // Work particles from active desks
          if (agentsRef.current) {
            agentsRef.current.forEach(agent => {
              if (agent.phaseStatus === 'running' && agent.phaseNum < DESKS.length && Math.random() < 0.5) {
                const desk = DESKS[agent.phaseNum];
                const deskScreen = toScreen(desk.col + 1, desk.row + 0.5);
                emitParticle(particlePoolRef.current, 'work', deskScreen.x, deskScreen.y - 12);
              }
            });
          }
        }
      }

      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="office-wrapper">
      <div className="office" style={{ width: VIEWPORT_W, height: VIEWPORT_H }}>
        {/* Floor tiles */}
        <RoomFloors />

        {/* Walls */}
        <Walls />

        {/* Room labels */}
        <RoomLabels />

        {/* Decorations */}
        <Decorations />

        {/* Furniture (break + study rooms) */}
        {ALL_FURNITURE.map((item, i) => (
          <FurnitureItem key={`furn-${i}`} item={item} />
        ))}

        {/* Desks */}
        {DESKS.map((desk, i) => {
          const event = phases.get(i);
          return (
            <DeskTile key={`desk-${i}`} phase={i}
              desk={desk}
              status={event ? event.status : 'idle'}
              verdict={event ? event.verdict : null}
              isActive={event && event.status === 'running'}
              onClick={() => setSelectedPhase(i)}
            />
          );
        })}

        {/* Agents */}
        {PHASE_META.map((meta, i) => {
          const agent = agentsRef.current[i];
          const charType = getCharType(i);
          return (
            <div key={i} className={`agent agent-type-${charType}`}
              ref={el => { if (el) agent.el = el; }}
              onClick={() => setSelectedPhase(i)}
              style={{ position: 'absolute', willChange: 'transform' }}>
              <div className="speech-bubble"
                ref={el => { if (el) agent.bubbleEl = el; }}
                style={{ display: 'none' }}></div>
              <div className="emote-bubble"
                ref={el => { if (el) agent.emoteEl = el; }}
                style={{ display: 'none' }}></div>
              <div className="agent-body-container">
                <div className="agent-shadow"></div>
                <div className="agent-accessory"></div>
                <div className="agent-accent"></div>
                <div className="agent-head">
                  <div className="agent-eye eye-left"></div>
                  <div className="agent-eye eye-right"></div>
                </div>
                <div className="agent-body"></div>
                <div className="agent-arm arm-left"></div>
                <div className="agent-arm arm-right"></div>
                <div className="agent-leg leg-left"></div>
                <div className="agent-leg leg-right"></div>
              </div>
              <div className="agent-name"
                ref={el => { if (el) agent.nameEl = el; }}>
                {meta.name}
              </div>
            </div>
          );
        })}

        {/* Light overlays */}
        <LightOverlays phases={phases} />

        {/* Particle container */}
        <div ref={particleContainerRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 350 }} />
      </div>

      <InfoPanel selectedPhase={selectedPhase} phases={phases} runningTimestamps={runningTimestamps.current} />
    </div>
  );
}

// ===================================
// APP
// ===================================
function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    let retryDelay = 2000;
    const maxDelay = 30000;
    let currentWs = null;

    function attempt() {
      const ws = new WebSocket(`ws://${location.host}`);
      currentWs = ws;
      ws.onopen = () => { setConnected(true); retryDelay = 2000; };
      ws.onclose = () => {
        setConnected(false);
        if (currentWs === ws) {
          setTimeout(attempt, retryDelay);
          retryDelay = Math.min(retryDelay * 2, maxDelay);
        }
      };
      ws.onmessage = (e) => { try { dispatch(JSON.parse(e.data)); } catch {} };
      wsRef.current = ws;
    }

    attempt();
    return () => { currentWs = null; if (wsRef.current) wsRef.current.close(); };
  }, []);

  return (
    <div>
      <Header session={state.session} connected={connected} />
      <ProgressBar phases={state.phases} />
      <OfficeScene phases={state.phases} />
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
