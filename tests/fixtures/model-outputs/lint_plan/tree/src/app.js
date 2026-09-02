'use strict';

const express = require('express');
const { version } = require('../package.json');

const VERSION_RE = /^v?\d+\.\d+\.\d+$/;

const app = express();
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/version', (req, res) => {
  res.json({ version });
});

module.exports = { app, VERSION_RE };
