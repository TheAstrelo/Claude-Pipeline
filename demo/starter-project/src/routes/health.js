const { Router } = require('express');
const router = Router();

/**
 * @route GET /api/health
 * @returns {object} Server health status
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
