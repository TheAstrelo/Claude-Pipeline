# Implementation Plan

## Verdict: READY

## Steps

| # | File | Action | Depends |
|---|------|--------|---------|
| 1 | `package.json` | MODIFY — add bcrypt + jsonwebtoken | — |
| 2 | `src/store/users.js` | CREATE — in-memory user store | — |
| 3 | `src/routes/auth.js` | CREATE — register + login endpoints | 1, 2 |
| 4 | `src/middleware/auth.js` | CREATE — JWT verification middleware | 1 |
| 5 | `src/routes/items.js` | MODIFY — protect routes with auth middleware | 4 |
| 6 | `src/index.js` | MODIFY — mount auth routes, check JWT_SECRET | 3 |

---

### Step 1: Add dependencies

**File:** `package.json`
**Action:** MODIFY

BEFORE:
```json
"dependencies": {
  "express": "^4.21.0"
}
```

AFTER:
```json
"dependencies": {
  "bcrypt": "^5.1.1",
  "express": "^4.21.0",
  "jsonwebtoken": "^9.0.2"
}
```

**Test:** `npm install` succeeds

---

### Step 2: Create user store

**File:** `src/store/users.js`
**Action:** CREATE

```javascript
const users = new Map();
let nextId = 1;

function createUser(email, hashedPassword) {
  const user = { id: nextId++, email, password: hashedPassword, createdAt: new Date().toISOString() };
  users.set(user.id, user);
  return { id: user.id, email: user.email, createdAt: user.createdAt };
}

function findByEmail(email) {
  return [...users.values()].find(u => u.email === email);
}

module.exports = { createUser, findByEmail };
```

**Test:** Module loads without error

---

### Step 3: Create auth routes

**File:** `src/routes/auth.js`
**Action:** CREATE

```javascript
const { Router } = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createUser, findByEmail } = require('../store/users');

const router = Router();

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (findByEmail(email)) return res.status(409).json({ error: 'Email already registered' });

  const hashed = await bcrypt.hash(password, 10);
  const user = createUser(email, hashed);
  res.status(201).json(user);
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

module.exports = router;
```

**Test:** POST /api/auth/register returns 201, POST /api/auth/login returns token

---

### Step 4: Create auth middleware

**File:** `src/middleware/auth.js`
**Action:** CREATE

```javascript
const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = requireAuth;
```

**Test:** Requests without token get 401

---

### Step 5: Protect item routes

**File:** `src/routes/items.js`
**Action:** MODIFY

BEFORE:
```javascript
const { Router } = require('express');
const router = Router();
```

AFTER:
```javascript
const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const router = Router();

router.use(requireAuth);
```

**Test:** GET /api/items without token returns 401

---

### Step 6: Mount auth routes and validate env

**File:** `src/index.js`
**Action:** MODIFY

BEFORE:
```javascript
const healthRoutes = require('./routes/health');
const itemRoutes = require('./routes/items');
```

AFTER:
```javascript
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const itemRoutes = require('./routes/items');
```

BEFORE:
```javascript
app.use('/api/health', healthRoutes);
app.use('/api/items', itemRoutes);
```

AFTER:
```javascript
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
```

**Test:** Server starts with JWT_SECRET set, fails without it
