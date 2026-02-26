const express = require('express');
const logger = require('./middleware/logger');
const healthRoutes = require('./routes/health');
const itemRoutes = require('./routes/items');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(logger);

app.use('/api/health', healthRoutes);
app.use('/api/items', itemRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
