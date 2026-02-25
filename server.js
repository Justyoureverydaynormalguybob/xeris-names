const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Health check - before ALL middleware so Railway can always reach it
app.get('/healthz', (req, res) => {
  console.log('Health check hit');
  res.status(200).send('ok');
});

// PostgreSQL connection
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
    }
  }
}));

// CORS - configure allowed origins for production
const corsOptions = {
  origin: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : '*',
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
};
app.use(cors(corsOptions));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts, please try again later' }
});

app.use('/api/', generalLimiter);

// Body parsing with size limit
app.use(express.json({ limit: '10kb' }));
app.use(express.static('public'));

// Initialize PostgreSQL database
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS names (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        address TEXT NOT NULL,
        owner_signature TEXT,
        registered_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        expires_at BIGINT,
        metadata TEXT
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_name ON names(name)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_address ON names(address)
    `);

    console.log('Database initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  }
}

// Validation helpers
function isValidXRSName(name) {
  if (typeof name !== 'string') return false;
  const nameRegex = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])?$/;
  return nameRegex.test(name) && !name.includes('--');
}

function isValidXRSAddress(address) {
  if (typeof address !== 'string') return false;
  return address.length >= 32 && address.length <= 64 && /^[a-zA-Z0-9]+$/.test(address);
}

function safeJsonParse(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  const allowed = ['description', 'avatar', 'website', 'email'];
  const sanitized = {};
  for (const key of allowed) {
    if (metadata[key] && typeof metadata[key] === 'string' && metadata[key].length <= 256) {
      sanitized[key] = metadata[key];
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'XRS Names',
    version: '1.1.0'
  });
});

// Check name availability
app.get('/api/check/:name', async (req, res) => {
  const name = req.params.name.toLowerCase().replace('.xrs', '');

  if (!isValidXRSName(name)) {
    return res.status(400).json({
      error: 'Invalid name format',
      rules: '3-32 characters, lowercase letters, numbers, hyphens (no consecutive hyphens)'
    });
  }

  try {
    const result = await pool.query('SELECT name FROM names WHERE name = $1', [name]);
    res.json({
      name: `${name}.xrs`,
      available: result.rows.length === 0
    });
  } catch (err) {
    console.error('DB error on check:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Resolve name to address
app.get('/api/resolve/:name', async (req, res) => {
  const name = req.params.name.toLowerCase().replace('.xrs', '');

  if (!isValidXRSName(name)) {
    return res.status(400).json({ error: 'Invalid name format' });
  }

  try {
    const result = await pool.query(
      'SELECT address, registered_at, metadata FROM names WHERE name = $1',
      [name]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Name not found',
        name: `${name}.xrs`
      });
    }

    const row = result.rows[0];
    res.json({
      name: `${name}.xrs`,
      address: row.address,
      registered: new Date(parseInt(row.registered_at)).toISOString(),
      metadata: safeJsonParse(row.metadata)
    });
  } catch (err) {
    console.error('DB error on resolve:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Reverse lookup - address to name(s)
app.get('/api/reverse/:address', async (req, res) => {
  const address = req.params.address;

  if (!isValidXRSAddress(address)) {
    return res.status(400).json({ error: 'Invalid address format' });
  }

  try {
    const result = await pool.query(
      'SELECT name, registered_at FROM names WHERE address = $1 ORDER BY registered_at ASC',
      [address]
    );

    res.json({
      address: address,
      names: result.rows.map(r => ({
        name: `${r.name}.xrs`,
        registered: new Date(parseInt(r.registered_at)).toISOString()
      })),
      primary: result.rows.length > 0 ? `${result.rows[0].name}.xrs` : null
    });
  } catch (err) {
    console.error('DB error on reverse:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Register a new name
app.post('/api/register', registrationLimiter, async (req, res) => {
  const { name, address, signature, metadata } = req.body;

  if (!name || !address) {
    return res.status(400).json({ error: 'Name and address are required' });
  }

  const cleanName = String(name).toLowerCase().replace('.xrs', '');

  if (!isValidXRSName(cleanName)) {
    return res.status(400).json({
      error: 'Invalid name format',
      rules: '3-32 characters, lowercase letters, numbers, hyphens'
    });
  }

  if (!isValidXRSAddress(address)) {
    return res.status(400).json({ error: 'Invalid address format' });
  }

  const now = Date.now();
  const sanitizedMeta = sanitizeMetadata(metadata);
  const metadataStr = sanitizedMeta ? JSON.stringify(sanitizedMeta) : null;

  try {
    await pool.query(
      `INSERT INTO names (name, address, owner_signature, registered_at, updated_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [cleanName, address, signature || null, now, now, metadataStr]
    );

    res.status(201).json({
      success: true,
      name: `${cleanName}.xrs`,
      address: address,
      registered: new Date(now).toISOString()
    });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({
        error: 'Name already registered',
        name: `${cleanName}.xrs`
      });
    }
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Failed to register name' });
  }
});

// Update name address (owner only)
app.put('/api/update/:name', async (req, res) => {
  const name = req.params.name.toLowerCase().replace('.xrs', '');
  const { address, signature } = req.body;

  if (!isValidXRSName(name)) {
    return res.status(400).json({ error: 'Invalid name format' });
  }

  if (!address || !isValidXRSAddress(address)) {
    return res.status(400).json({ error: 'Invalid address format' });
  }

  if (!signature) {
    return res.status(401).json({ error: 'Signature required for updates' });
  }

  const now = Date.now();

  try {
    const result = await pool.query(
      'UPDATE names SET address = $1, updated_at = $2 WHERE name = $3',
      [address, now, name]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Name not found' });
    }

    res.json({
      success: true,
      name: `${name}.xrs`,
      address: address,
      updated: new Date(now).toISOString()
    });
  } catch (err) {
    console.error('DB error on update:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Search names
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

  if (!query || typeof query !== 'string' || query.length < 2 || query.length > 32) {
    return res.status(400).json({ error: 'Query must be 2-32 characters' });
  }

  const cleanQuery = query.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (cleanQuery.length < 2) {
    return res.status(400).json({ error: 'Query too short after sanitization' });
  }

  try {
    const result = await pool.query(
      `SELECT name, address, registered_at
       FROM names
       WHERE name LIKE $1
       ORDER BY registered_at ASC
       LIMIT $2`,
      [`${cleanQuery}%`, limit]
    );

    res.json({
      query: cleanQuery,
      results: result.rows.map(r => ({
        name: `${r.name}.xrs`,
        address: r.address,
        registered: new Date(parseInt(r.registered_at)).toISOString()
      }))
    });
  } catch (err) {
    console.error('DB error on search:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get recent registrations
app.get('/api/recent', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);

  try {
    const result = await pool.query(
      `SELECT name, address, registered_at
       FROM names
       ORDER BY registered_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      recent: result.rows.map(r => ({
        name: `${r.name}.xrs`,
        address: r.address,
        registered: new Date(parseInt(r.registered_at)).toISOString()
      }))
    });
  } catch (err) {
    console.error('DB error on recent:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Directory - list all registered names with pagination
app.get('/api/directory', async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
  const offset = (page - 1) * limit;

  try {
    const countResult = await pool.query('SELECT COUNT(*) as total FROM names');
    const total = parseInt(countResult.rows[0].total);

    const result = await pool.query(
      `SELECT name, address, registered_at
       FROM names
       ORDER BY name ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      entries: result.rows.map(r => ({
        name: `${r.name}.xrs`,
        address: r.address,
        registered: new Date(parseInt(r.registered_at)).toISOString()
      })),
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('DB error on directory:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Stats
app.get('/api/stats', async (req, res) => {
  try {
    const totalResult = await pool.query('SELECT COUNT(*) as total FROM names');
    const ownersResult = await pool.query('SELECT COUNT(DISTINCT address) as unique_owners FROM names');

    res.json({
      total_names: parseInt(totalResult.rows[0].total),
      unique_owners: parseInt(ownersResult.rows[0].unique_owners),
      service: 'XRS Names - Public Good',
      version: '1.1.0'
    });
  } catch (err) {
    console.error('DB error on stats:', err.message);
    res.status(500).json({ error: 'Database error' });
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server with retry for database connection
async function start() {
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await initDatabase();
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`XRS Names service running on port ${PORT}`);
        console.log(`API docs: http://localhost:${PORT}/api/health`);
      });
      return;
    } catch (err) {
      console.error(`Database connection attempt ${attempt}/${maxRetries} failed:`, err.message);
      if (attempt === maxRetries) throw err;
      const delay = attempt * 2000;
      console.log(`Retrying in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down gracefully...');
  pool.end().then(() => {
    console.log('Database pool closed');
    process.exit(0);
  }).catch(err => {
    console.error('Error closing pool:', err);
    process.exit(1);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
