const { Router } = require('express');
const router = Router();

// In-memory store
const items = new Map();
let nextId = 1;

/**
 * @route GET /api/items
 * @returns {object[]} All items
 */
router.get('/', (req, res) => {
  res.json([...items.values()]);
});

/**
 * @route GET /api/items/:id
 * @returns {object} Single item
 */
router.get('/:id', (req, res) => {
  const item = items.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

/**
 * @route POST /api/items
 * @body {string} name - Item name
 * @returns {object} Created item
 */
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const item = { id: nextId++, name, createdAt: new Date().toISOString() };
  items.set(item.id, item);
  res.status(201).json(item);
});

/**
 * @route DELETE /api/items/:id
 * @returns {object} Success message
 */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!items.has(id)) return res.status(404).json({ error: 'Item not found' });
  items.delete(id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
