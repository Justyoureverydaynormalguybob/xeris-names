const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
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

// Initialize SQLite database
const dbPath = process.env.DB_PATH || './xrs-names.db';
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  } else {
    console.log('Connected to XRS Names database');
    initDatabase();
  }
});

// Enable WAL mode for better concurrent read performance
db.run('PRAGMA journal_mode=WAL');
db.run('PRAGMA busy_timeout=5000');

// Create tables
function initDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS names (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        address TEXT NOT NULL,
        owner_signature TEXT,
        registered_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER,
        metadata TEXT
      )
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_name ON names(name);
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_address ON names(address);
    `);

    console.log('Database initialized');
  });
}

// Validation helpers
function isValidXRSName(name) {
  if (typeof name !== 'string') return false;
  // Rules: 3-32 chars, lowercase alphanumeric + hyphen, no consecutive hyphens
  const nameRegex = /^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])?$/;
  return nameRegex.test(name) && !name.includes('--');
}

function isValidXRSAddress(address) {
  if (typeof address !== 'string') return false;
  // Basic validation - adjust based on Xeris address format
  return address.length >= 32 && address.length <= 64 && /^[a-zA-Z0-9]+$/.test(address);
}

// Safe JSON parse helper
function safeJsonParse(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Sanitize metadata - strip any unexpected fields, limit size
function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return null;
  // Allow only known safe fields
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
app.get('/api/check/:name', (req, res) => {
  const name = req.params.name.toLowerCase().replace('.xrs', '');
  
  if (!isValidXRSName(name)) {
    return res.status(400).json({ 
      error: 'Invalid name format',
      rules: '3-32 characters, lowercase letters, numbers, hyphens (no consecutive hyphens)'
    });
  }

  db.get('SELECT name FROM names WHERE name = ?', [name], (err, row) => {
    if (err) {
      console.error('DB error on check:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }
    
    res.json({ 
      name: `${name}.xrs`,
      available: !row
    });
  });
});

// Resolve name to address
app.get('/api/resolve/:name', (req, res) => {
  const name = req.params.name.toLowerCase().replace('.xrs', '');
  
  if (!isValidXRSName(name)) {
    return res.status(400).json({ error: 'Invalid name format' });
  }

  db.get(
    'SELECT address, registered_at, metadata FROM names WHERE name = ?',
    [name],
    (err, row) => {
      if (err) {
        console.error('DB error on resolve:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }
      
      if (!row) {
        return res.status(404).json({ 
          error: 'Name not found',
          name: `${name}.xrs`
        });
      }

      res.json({
        name: `${name}.xrs`,
        address: row.address,
        registered: new Date(row.registered_at).toISOString(),
        metadata: safeJsonParse(row.metadata)
      });
    }
  );
});

// Reverse lookup - address to name(s)
app.get('/api/reverse/:address', (req, res) => {
  const address = req.params.address;
  
  if (!isValidXRSAddress(address)) {
    return res.status(400).json({ error: 'Invalid address format' });
  }

  db.all(
    'SELECT name, registered_at FROM names WHERE address = ? ORDER BY registered_at ASC',
    [address],
    (err, rows) => {
      if (err) {
        console.error('DB error on reverse:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        address: address,
        names: rows.map(r => ({
          name: `${r.name}.xrs`,
          registered: new Date(r.registered_at).toISOString()
        })),
        primary: rows.length > 0 ? `${rows[0].name}.xrs` : null
      });
    }
  );
});

// Register a new name
app.post('/api/register', registrationLimiter, (req, res) => {
  const { name, address, signature, metadata } = req.body;
  
  if (!name || !address) {
    return res.status(400).json({ error: 'Name and address are required' });
  }

  // Validate inputs
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

  // Check if name already exists
  db.get('SELECT name FROM names WHERE name = ?', [cleanName], (err, row) => {
    if (err) {
      console.error('DB error on register check:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }

    if (row) {
      return res.status(409).json({ 
        error: 'Name already registered',
        name: `${cleanName}.xrs`
      });
    }

    // Insert new name
    db.run(
      `INSERT INTO names (name, address, owner_signature, registered_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [cleanName, address, signature || null, now, now, metadataStr],
      function(err) {
        if (err) {
          console.error('Registration error:', err.message);
          return res.status(500).json({ error: 'Failed to register name' });
        }

        res.status(201).json({
          success: true,
          name: `${cleanName}.xrs`,
          address: address,
          registered: new Date(now).toISOString()
        });
      }
    );
  });
});

// Update name address (owner only)
app.put('/api/update/:name', (req, res) => {
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

  // TODO: Verify signature against the original owner's address
  // For now, require signature to be present as a basic check

  db.run(
    'UPDATE names SET address = ?, updated_at = ? WHERE name = ?',
    [address, now, name],
    function(err) {
      if (err) {
        console.error('DB error on update:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Name not found' });
      }

      res.json({
        success: true,
        name: `${name}.xrs`,
        address: address,
        updated: new Date(now).toISOString()
      });
    }
  );
});

// Search names
app.get('/api/search', (req, res) => {
  const query = req.query.q;
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);

  if (!query || typeof query !== 'string' || query.length < 2 || query.length > 32) {
    return res.status(400).json({ error: 'Query must be 2-32 characters' });
  }

  // Sanitize the search query - only allow valid name characters
  const cleanQuery = query.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (cleanQuery.length < 2) {
    return res.status(400).json({ error: 'Query too short after sanitization' });
  }

  db.all(
    `SELECT name, address, registered_at 
     FROM names 
     WHERE name LIKE ? 
     ORDER BY registered_at ASC 
     LIMIT ?`,
    [`${cleanQuery}%`, limit],
    (err, rows) => {
      if (err) {
        console.error('DB error on search:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        query: cleanQuery,
        results: rows.map(r => ({
          name: `${r.name}.xrs`,
          address: r.address,
          registered: new Date(r.registered_at).toISOString()
        }))
      });
    }
  );
});

// Get recent registrations
app.get('/api/recent', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);

  db.all(
    `SELECT name, address, registered_at 
     FROM names 
     ORDER BY registered_at DESC 
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) {
        console.error('DB error on recent:', err.message);
        return res.status(500).json({ error: 'Database error' });
      }

      res.json({
        recent: rows.map(r => ({
          name: `${r.name}.xrs`,
          address: r.address,
          registered: new Date(r.registered_at).toISOString()
        }))
      });
    }
  );
});

// Stats
app.get('/api/stats', (req, res) => {
  db.get('SELECT COUNT(*) as total FROM names', (err, row) => {
    if (err) {
      console.error('DB error on stats:', err.message);
      return res.status(500).json({ error: 'Database error' });
    }

    db.get(
      'SELECT COUNT(DISTINCT address) as unique_owners FROM names',
      (err2, row2) => {
        if (err2) {
          console.error('DB error on stats owners:', err2.message);
          return res.status(500).json({ error: 'Database error' });
        }

        res.json({
          total_names: row.total,
          unique_owners: row2.unique_owners,
          service: 'XRS Names - Public Good',
          version: '1.1.0'
        });
      }
    );
  });
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 XRS Names service running on port ${PORT}`);
  console.log(`📖 API docs: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Database connection closed');
    }
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
