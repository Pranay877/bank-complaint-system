const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/complaints', require('./routes/complaints'));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

async function start() {
  try {
    await db.query('SELECT 1');
    console.log('[OK] Connected to PostgreSQL/Supabase');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[OK] Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('[ERROR] Could not connect to PostgreSQL:', err.message);
    process.exit(1);
  }
}

start();
