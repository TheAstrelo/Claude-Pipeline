const { Router } = require('express');
const router = Router();

// In-memory store, kept in insertion order so listing is deterministic.
const items = [];
let nextId = 1;

/**
 * @route GET /api/items
 * @returns {object[]} All items
 */
router.get('/', (req, res) => {
  res.json(items);
});

/**
 * @route GET /api/items/:id
 * @returns {object} Single item
 */
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const item = items.find((entry) => entry.id === id);
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
  items.push(item);
  res.status(201).json(item);
});

/**
 * @route DELETE /api/items/:id
 * @returns {object} Success message
 */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!items.some((entry) => entry.id === id)) {
    return res.status(404).json({ error: 'Item not found' });
  }
  // Ids are handed out sequentially starting at 1, so the id doubles as the
  // position of the item in the store.
  items.splice(id, 1);
  res.json({ message: 'Deleted' });
});

module.exports = router;
