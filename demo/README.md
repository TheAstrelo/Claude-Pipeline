# Pipeline Demo Kit

Show a fellow dev what the pipeline does in under 5 minutes.

## What's Inside

```
demo/
├── starter-project/          # Tiny Express API (4 files)
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.js           # Express server, 2 routes mounted
│       ├── middleware/
│       │   └── logger.js      # Request logger
│       └── routes/
│           ├── health.js      # GET /api/health
│           └── items.js       # CRUD /api/items
│
└── expected-output/           # What the pipeline produces
    ├── pre-check.md           # Phase 0: Found existing routes, recommends BUILD_NEW
    ├── brief.md               # Phase 1: Extracted 5 success criteria
    ├── design.md              # Phase 2: 5 decisions with sources, 3 components
    ├── critique.md            # Phase 3: Caught missing input validation + rate limiting
    ├── plan.md                # Phase 4: 6 steps with BEFORE/AFTER code
    ├── build-report.md        # Phase 6: All 6 steps DONE
    └── qa-report.md           # Phases 7-11: All pass, security clear
```

## The Demo

**Task:** "Add user authentication with JWT" on a 4-file Express API.

**Why this task:** It's complex enough for every phase to add value — Pre-Check finds existing route patterns, Design makes real architectural decisions, Adversarial Review catches security gaps, Build produces 6 files, and Security scans for hardcoded secrets.

---

## Setup (1 minute)

```bash
# 1. Copy the starter project somewhere
cp -r demo/starter-project/ /tmp/pipeline-demo/
cd /tmp/pipeline-demo/

# 2. Install the pipeline for your tool
#    (from the Claude-Pipeline repo root)
bash install.sh
#    → Pick your tool, point it at /tmp/pipeline-demo/

# 3. Install project deps
npm install
```

---

## Run It (3 minutes)

### Claude Code
```bash
cd /tmp/pipeline-demo/
npx @anthropic-ai/claude-code@latest

# Inside Claude Code:
/auto-pipeline --profile=yolo "add user authentication with JWT"
```

### Cursor
```
Open /tmp/pipeline-demo/ in Cursor
Cmd+K → @auto-pipeline add user authentication with JWT
```

### Cline
```
Open /tmp/pipeline-demo/ in VS Code with Cline
Tell Cline: "Run the auto-pipeline workflow with task: add user authentication with JWT"
```

### Windsurf
```
Open /tmp/pipeline-demo/ in Windsurf
Run workflow: auto-pipeline
Task: "add user authentication with JWT"
```

### GitHub Copilot
```
Open /tmp/pipeline-demo/ in VS Code with Copilot Chat
Type: @auto-pipeline add user authentication with JWT
```

### Aider
```bash
cd /tmp/pipeline-demo/
aider

# Inside Aider:
"Run the development pipeline for: add user authentication with JWT"
```

---

## What to Watch For

Point these out to the dev you're demoing to:

| Phase | What Happens | Why It's Impressive |
|-------|-------------|---------------------|
| **Phase 0** | Finds existing routes and middleware pattern | Doesn't rebuild what exists |
| **Phase 1** | Extracts 5 testable success criteria | Turns a vague task into specs |
| **Phase 2** | Designs 3 components with source citations | Decisions are traceable, not hallucinated |
| **Phase 3** | Catches missing input validation and rate limiting | Three critics review the design |
| **Phase 4** | Produces 6 steps with exact BEFORE/AFTER code | Every change is deterministic |
| **Phase 6** | Executes step by step, verifies each one | No YOLO code dumps |
| **Phase 11** | Scans for OWASP vulnerabilities | Catches hardcoded secrets, injection |

**The "aha" moment:** Phase 3 (Adversarial Review) finding real security gaps that a human would miss if they were just vibe coding.

---

## Talking Points

1. **"It's not just autocomplete."** This is a full development workflow — requirements, design, review, build, QA, security. The same process a senior team follows, automated.

2. **"The pipeline catches its own mistakes."** Drift detection ensures nothing from the design gets lost. Adversarial review catches security gaps before code is written.

3. **"It works with any AI tool."** Same pipeline spec, native implementations for Claude Code, Cursor, Cline, Windsurf, Copilot, and Aider.

4. **"It's cost-efficient."** Only 2 of 12 phases use the expensive model. The rest use the cheap/fast model. ~70% cost reduction.

5. **"Every decision is traceable."** No black-box output. You get artifacts at every phase — you can read the design doc, see the critique, verify the plan.

---

## Expected Output

Check `expected-output/` for example artifacts the pipeline produces. The actual output will vary based on the model, but the structure and quality gates will be the same.

After the pipeline runs, you should see:
- **3 new files:** `src/routes/auth.js`, `src/middleware/auth.js`, `src/store/users.js`
- **3 modified files:** `package.json`, `src/index.js`, `src/routes/items.js`
- **7 artifacts** in the pipeline artifacts directory
- **All gates passed** (no HARD failures)

---

## Quick Verification

After the pipeline finishes:

```bash
# Install new dependencies
npm install

# Start the server
JWT_SECRET=demo-secret node src/index.js

# Test in another terminal:

# Health (public)
curl http://localhost:3000/api/health

# Register
curl -X POST http://localhost:3000/api/items \
  -H "Content-Type: application/json"
# → Should get 401

# Register a user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@demo.com","password":"password123"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@demo.com","password":"password123"}'
# → Copy the token

# Access protected route
curl http://localhost:3000/api/items \
  -H "Authorization: Bearer <token>"
# → Should get 200
```
