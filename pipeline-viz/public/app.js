const { useState, useEffect, useReducer, useRef, useCallback } = React;
const { createPortal } = ReactDOM;

// --- Pixel Character Sprites ---
// Each sprite is a grid of color indices: 0=transparent, 1=hair, 2=skin, 3=eyes, 4=shirt, 5=pants, 6=accessory
const SPRITE_PALETTE = {
  researcher:  { 1: '#4a90d9', 2: '#ffd5b4', 3: '#222', 4: '#2962ff', 5: '#1a47b0', 6: '#90caf9' },
  architect:   { 1: '#7c4dff', 2: '#ffd5b4', 3: '#222', 4: '#6200ea', 5: '#4a148c', 6: '#ce93d8' },
  builder:     { 1: '#ff6d00', 2: '#ffd5b4', 3: '#222', 4: '#e65100', 5: '#bf360c', 6: '#ffcc02' },
  inspector:   { 1: '#00c853', 2: '#ffd5b4', 3: '#222', 4: '#2e7d32', 5: '#1b5e20', 6: '#a5d6a7' },
  guardian:    { 1: '#d50000', 2: '#ffd5b4', 3: '#222', 4: '#b71c1c', 5: '#7f0000', 6: '#ef9a9a' },
};

// Sprite grid (7 wide x 9 tall) — shared shape, different colors
const CHAR_GRID = [
  [0,0,1,1,1,0,0],
  [0,1,1,1,1,1,0],
  [0,2,2,2,2,2,0],
  [0,2,3,2,3,2,0],
  [0,0,2,2,2,0,0],
  [0,4,4,4,4,4,0],
  [4,4,4,4,4,4,4],
  [0,0,5,0,5,0,0],
  [0,0,5,0,5,0,0],
];

// Map phase to character type
function getCharType(phase) {
  if (phase <= 3) return 'researcher';
  if (phase <= 8) return 'architect';
  if (phase === 9) return 'builder';
  if (phase <= 15) return 'inspector';
  return 'guardian';
}

// Generate CSS box-shadow string for a sprite
function spriteBoxShadow(charType, pixelSize) {
  const palette = SPRITE_PALETTE[charType];
  const shadows = [];
  for (let y = 0; y < CHAR_GRID.length; y++) {
    for (let x = 0; x < CHAR_GRID[y].length; x++) {
      const colorIdx = CHAR_GRID[y][x];
      if (colorIdx === 0) continue;
      const color = palette[colorIdx] || '#fff';
      shadows.push(`${x * pixelSize}px ${y * pixelSize}px 0 ${color}`);
    }
  }
  return shadows.join(', ');
}

function PixelSprite({ phase, status }) {
  if (status === 'skipped') return <div className="pixel-sprite"></div>;

  const charType = getCharType(phase);
  const px = 3; // pixel size
  const shadow = spriteBoxShadow(charType, px);

  const style = {
    width: `${px}px`,
    height: `${px}px`,
    boxShadow: shadow,
    opacity: status === 'idle' ? 0.4 : 1,
    transition: 'opacity 0.2s steps(2)',
  };

  // Add a subtle animation class for running state
  const className = `pixel-char ${status === 'running' ? 'pixel-working' : ''}`;

  return (
    <div className="pixel-sprite">
      <div className={className} style={style}></div>
    </div>
  );
}

// --- Phase metadata (display names for all 20 phases) ---
const PHASE_META = [
  { phase: 0,  name: 'Pre-Check' },
  { phase: 1,  name: 'Research' },
  { phase: 2,  name: 'Requirements' },
  { phase: 3,  name: 'Cost Estimate' },
  { phase: 4,  name: 'Design' },
  { phase: 5,  name: 'Adversarial Review' },
  { phase: 6,  name: 'Planning' },
  { phase: 7,  name: 'Test Planning' },
  { phase: 8,  name: 'Drift Detection' },
  { phase: 9,  name: 'Build' },
  { phase: 10, name: 'Denoise' },
  { phase: 11, name: 'Quality Fit' },
  { phase: 12, name: 'Quality Behavior' },
  { phase: 13, name: 'Quality Docs' },
  { phase: 14, name: 'Perf Check' },
  { phase: 15, name: 'A11y Check' },
  { phase: 16, name: 'Security' },
  { phase: 17, name: 'Tech Debt' },
  { phase: 18, name: 'Rollback Plan' },
  { phase: 19, name: 'Changelog' },
];

// --- Verdict classification ---
function verdictClass(verdict) {
  if (!verdict || verdict === 'UNKNOWN') return 'verdict-unknown';
  const pass = ['SUFFICIENT','CLEAR','APPROVED','READY','ALIGNED','SUCCESS','PASS','CLEAN','CLEANED','LOW','ACCEPTABLE','DONE'];
  const warn = ['NEEDS_MORE_RESEARCH','NEEDS_INPUT','NEEDS_DETAIL','PARTIAL','WARN','DEBT_LOGGED','MEDIUM','REVIEW_COSTS'];
  if (pass.includes(verdict)) return 'verdict-pass';
  if (warn.includes(verdict)) return 'verdict-warn';
  return 'verdict-fail';
}

// --- Reducer ---
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

// --- Components ---

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
  const total = 20; // phases 0-19
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

const AgentCard = React.forwardRef(function AgentCard({ meta, event, prevEvent }, ref) {
  const status = event ? event.status : 'idle';
  const cardClass = `agent-card card-${status}`;
  const elapsed = getElapsed(event, prevEvent);

  let icon;
  if (status === 'idle') icon = <span className="card-status-icon">⏳</span>;
  else if (status === 'running') icon = <span className="spinner"></span>;
  else if (status === 'complete') icon = <span className="card-status-icon">✓</span>;
  else if (status === 'failed') icon = <span className="card-status-icon">✗</span>;
  else if (status === 'skipped') icon = <span className="card-status-icon">⊘</span>;

  return (
    <div className={cardClass} ref={ref}>
      <span className="card-phase-badge">#{meta.phase}</span>
      <PixelSprite phase={meta.phase} status={status} />
      <div className="card-title">{icon} {meta.name}</div>
      {event && event.verdict && (
        <div className={`card-verdict ${verdictClass(event.verdict)}`}>{event.verdict}</div>
      )}
      {elapsed && <div className="card-elapsed">{elapsed}</div>}
      {event && event.artifact && (
        <div className="card-artifact">{event.artifact}</div>
      )}
    </div>
  );
});

function getElapsed(event, prevEvent) {
  // If complete/failed with a running event before it, calculate elapsed
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

function CardGrid({ phases, cardRefs }) {
  // Build a map of running events for elapsed time calculation
  const runningEvents = new Map();
  phases.forEach((event, phaseNum) => {
    if (event.status === 'running') {
      runningEvents.set(phaseNum, event);
    }
  });

  return (
    <div className="card-grid">
      {PHASE_META.map(meta => {
        const event = phases.get(meta.phase);
        // Find the "running" event for this phase (for elapsed calc)
        const prevEvent = runningEvents.get(meta.phase);
        // If current event is complete/failed, the running event is the prev
        const runningRef = (event && event.status !== 'running') ? prevEvent : null;
        return (
          <AgentCard
            key={meta.phase}
            meta={meta}
            event={event}
            prevEvent={runningRef}
            ref={el => { if (cardRefs.current) cardRefs.current.set(meta.phase, el); }}
          />
        );
      })}
    </div>
  );
}

function ArtifactAnimation({ sourcePhase, targetPhase, cardRefs, onComplete }) {
  const [style, setStyle] = useState(null);

  useEffect(() => {
    const sourceEl = cardRefs.current.get(sourcePhase);
    const targetEl = cardRefs.current.get(targetPhase);
    if (!sourceEl || !targetEl) {
      onComplete();
      return;
    }

    const sourceRect = sourceEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    // Start position: center of source card
    const startX = sourceRect.left + sourceRect.width / 2 - 4;
    const startY = sourceRect.top + sourceRect.height / 2 - 4;

    // End position: center of target card
    const endX = targetRect.left + targetRect.width / 2 - 4;
    const endY = targetRect.top + targetRect.height / 2 - 4;

    // Set initial position
    setStyle({
      left: startX,
      top: startY,
      transform: 'translate(0, 0)',
    });

    // Animate to target on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setStyle({
          left: startX,
          top: startY,
          transform: `translate(${endX - startX}px, ${endY - startY}px)`,
        });
      });
    });

    // Clean up after transition
    const timer = setTimeout(onComplete, 600);
    return () => clearTimeout(timer);
  }, [sourcePhase, targetPhase, cardRefs, onComplete]);

  if (!style) return null;

  return createPortal(
    <div
      className="artifact-handoff"
      style={style}
      onTransitionEnd={onComplete}
    />,
    document.body
  );
}

function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [connected, setConnected] = useState(false);
  const [animation, setAnimation] = useState(null);
  const wsRef = useRef(null);
  const cardRefs = useRef(new Map());
  // Store running timestamps for elapsed calculation
  const runningTimestamps = useRef(new Map());
  // Track previous phases to detect complete transitions
  const prevPhasesRef = useRef(new Map());

  // Track running timestamps and trigger artifact animation on complete
  useEffect(() => {
    state.phases.forEach((event, phaseNum) => {
      if (event.status === 'running') {
        runningTimestamps.current.set(phaseNum, event);
      }
    });

    // Detect newly completed phases to trigger animation
    const prev = prevPhasesRef.current;
    state.phases.forEach((event, phaseNum) => {
      const prevEvent = prev.get(phaseNum);
      const wasNotComplete = !prevEvent || prevEvent.status !== 'complete';
      if (event.status === 'complete' && wasNotComplete) {
        // Find the next phase in PHASE_META order
        const idx = PHASE_META.findIndex(m => m.phase === phaseNum);
        if (idx >= 0 && idx < PHASE_META.length - 1) {
          const nextPhase = PHASE_META[idx + 1].phase;
          setAnimation({ source: phaseNum, target: nextPhase });
        }
      }
    });
    prevPhasesRef.current = new Map(state.phases);
  }, [state.phases]);

  const handleAnimationComplete = useCallback(() => {
    setAnimation(null);
  }, []);

  useEffect(() => {
    let retryDelay = 2000;
    const maxDelay = 30000;
    let currentWs = null;

    function attempt() {
      const ws = new WebSocket(`ws://${location.host}`);
      currentWs = ws;

      ws.onopen = () => {
        setConnected(true);
        retryDelay = 2000;
      };

      ws.onclose = () => {
        setConnected(false);
        if (currentWs === ws) {
          setTimeout(attempt, retryDelay);
          retryDelay = Math.min(retryDelay * 2, maxDelay);
        }
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          dispatch(msg);
        } catch {}
      };

      wsRef.current = ws;
    }

    attempt();

    return () => {
      currentWs = null;
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return (
    <div>
      <Header session={state.session} connected={connected} />
      <ProgressBar phases={state.phases} />
      {!state.session && state.phases.size === 0 ? (
        <div className="waiting-message">PRESS START ... WAITING FOR PIPELINE</div>
      ) : (
        <CardGrid phases={state.phases} cardRefs={cardRefs} />
      )}
      {animation && (
        <ArtifactAnimation
          sourcePhase={animation.source}
          targetPhase={animation.target}
          cardRefs={cardRefs}
          onComplete={handleAnimationComplete}
        />
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
