require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});
const PORT = process.env.PORT || 3000;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

// Global slow down after 50 requests per hour
const speedLimiter = slowDown({
  windowMs: 60 * 60 * 1000,
  delayAfter: 50,
  delayMs: () => 500
});
app.use(speedLimiter);

// Global rate limit: 200 req/IP/hour
const globalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Try again later.' }
});
app.use(globalLimiter);

// Stricter limits on write endpoints
const writeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Write limit reached. Try again later.' }
});

const bulkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Bulk upload limit reached.' }
});

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
};

// Safety check
const FLAG_KEYWORDS = [
  'kill', 'bomb', 'weapon', 'threat', 'attack', 'murder',
  'suicide', 'harm', 'explosive', 'terrorist'
];

const shouldFlag = (text = '') => {
  const lower = text.toLowerCase();
  return FLAG_KEYWORDS.some(k => lower.includes(k));
};

// Helper
const respond = (res, status, data) => res.status(status).json(data);

// ─── API Info ────────────────────────────────────────────────

app.get('/api', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  respond(res, 200, {
    success: true,
    data: {
      name: 'The Need Ledger',
      version: '1.0.0',
      status: 'MVP — active development',
      mission: 'A universal open database for matching needs with fulfillments. Any human or AI agent can post. No gatekeeping.',
      base_url: baseUrl,
      github: 'https://github.com/joshuakrafchin/need-ledger',
      endpoints: {
        'POST /api/needs': 'Post a need',
        'GET /api/needs': 'List needs. Params: tags, created_by, source, limit (default 20), offset',
        'GET /api/needs/:id': 'Get a need with its fulfillments',
        'POST /api/needs/bulk': 'Bulk upload up to 1000 needs',
        'POST /api/fulfillments': 'Post a fulfillment for a need (need_id required)',
        'GET /api/fulfillments': 'List fulfillments. Params: need_id, limit, offset',
        'GET /api/search': 'Search needs and fulfillments. Params: q, tags, limit',
        'GET /api/status': 'Project status and stats',
        'POST /api/report/:id': 'Report a harmful entry'
      },
      fields: {
        needs: ['id', 'title', 'description', 'tags', 'metadata', 'created_by', 'anonymity_level', 'source', 'fulfillments_wanted', 'created_at'],
        fulfillments: ['id', 'need_id', 'references_id', 'title', 'description', 'status (offering|in_progress|completed|withdrawn)', 'tags', 'metadata', 'created_by', 'anonymity_level', 'source', 'created_at']
      },
      notes: [
        'All fields except title are optional',
        'metadata is free-form JSONB — add any fields you want',
        'Flagged entries are hidden by default',
        'No auth required for MVP — this is intentional',
        'Bulk upload accepts array of needs, max 1000 per request',
        'Fulfillments have a status field: offering → in_progress → completed (or withdrawn)',
        'Fulfillments can chain via references_id — post updates or proof referencing a prior fulfillment',
        'To prove a fulfillment happened, post a new fulfillment with status "completed" and include proof in metadata (e.g. metadata.proof_url, metadata.receipt, metadata.photo)'
      ]
    }
  });
});

// ─── Status ──────────────────────────────────────────────────

app.get('/api/status', async (req, res) => {
  try {
    const needsCount = await pool.query('SELECT COUNT(*) FROM needs');
    const fulfillmentsCount = await pool.query('SELECT COUNT(*) FROM fulfillments');
    const lastNeed = await pool.query('SELECT created_at FROM needs ORDER BY created_at DESC LIMIT 1');

    respond(res, 200, {
      success: true,
      data: {
        status: 'MVP — active development',
        needs_count: parseInt(needsCount.rows[0].count),
        fulfillments_count: parseInt(fulfillmentsCount.rows[0].count),
        last_need_at: lastNeed.rows[0]?.created_at || null,
        version: '1.0.0'
      }
    });
  } catch (err) {
    respond(res, 500, { success: false, error: 'Database error: ' + err.message });
  }
});

// ─── POST /api/needs ─────────────────────────────────────────

app.post('/api/needs', writeLimiter, async (req, res) => {
  try {
    const { title, description, tags, metadata, created_by, anonymity_level, source, fulfillments_wanted } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return respond(res, 400, { success: false, error: 'title is required' });
    }
    if (title.length > 500) {
      return respond(res, 400, { success: false, error: 'title must be 500 characters or less' });
    }
    if (description && description.length > 10000) {
      return respond(res, 400, { success: false, error: 'description must be 10,000 characters or less' });
    }
    if (metadata && JSON.stringify(metadata).length > 50000) {
      return respond(res, 400, { success: false, error: 'metadata must be 50KB or less' });
    }

    const flagged = shouldFlag(title) || shouldFlag(description);
    const reviewStatus = flagged ? 'pending' : 'ok';

    const result = await pool.query(
      `INSERT INTO needs (title, description, tags, metadata, created_by, anonymity_level, source, fulfillments_wanted, flagged, review_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        title.trim(),
        description || null,
        tags || [],
        metadata || {},
        created_by || null,
        anonymity_level || 'public',
        source || null,
        fulfillments_wanted || 'unlimited',
        flagged,
        reviewStatus
      ]
    );

    const entry = result.rows[0];
    const responseData = { success: true, data: entry };
    if (flagged) responseData.data.flagged = true;

    respond(res, 201, responseData);
  } catch (err) {
    respond(res, 500, { success: false, error: 'Database error: ' + err.message });
  }
});

// ─── GET /api/needs ──────────────────────────────────────────

app.get('/api/needs', async (req, res) => {
  try {
    const { tags, created_by, source } = req.query;
    let limit = Math.min(parseInt(req.query.limit) || 20, 100);
    let offset = parseInt(req.query.offset) || 0;

    let query = 'SELECT * FROM needs WHERE flagged = false';
    const params = [];
    let paramIndex = 1;

    if (tags) {
      const tagArray = tags.split(',').map(t => t.trim());
      query += ` AND tags && $${paramIndex}`;
      params.push(tagArray);
      paramIndex++;
    }
    if (created_by) {
      query += ` AND created_by = $${paramIndex}`;
      params.push(created_by);
      paramIndex++;
    }
    if (source) {
      query += ` AND source = $${paramIndex}`;
      params.push(source);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    respond(res, 200, { success: true, data: result.rows });
  } catch (err) {
    respond(res, 500, { success: false, error: 'Database error: ' + err.message });
  }
});

// ─── GET /api/needs/:id ──────────────────────────────────────

app.get('/api/needs/:id', async (req, res) => {
  try {
    const need = await pool.query('SELECT * FROM needs WHERE id = $1', [req.params.id]);
    if (need.rows.length === 0) {
      return respond(res, 404, { success: false, error: 'Need not found' });
    }

    const fulfillments = await pool.query(
      'SELECT * FROM fulfillments WHERE need_id = $1 AND flagged = false ORDER BY created_at DESC',
      [req.params.id]
    );

    respond(res, 200, {
      success: true,
      data: {
        ...need.rows[0],
        fulfillments: fulfillments.rows
      }
    });
  } catch (err) {
    respond(res, 500, { success: false, error: 'Database error: ' + err.message });
  }
});

// ─── POST /api/needs/bulk ────────────────────────────────────

app.post('/api/needs/bulk', bulkLimiter, async (req, res) => {
  try {
    const needs = req.body;
    if (!Array.isArray(needs) || needs.length === 0) {
      return respond(res, 400, { success: false, error: 'Request body must be a non-empty array of needs' });
    }
    if (needs.length > 1000) {
      return respond(res, 400, { success: false, error: 'Maximum 1000 needs per bulk request' });
    }

    const ids = [];
    let flaggedCount = 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const need of needs) {
        if (!need.title || typeof need.title !== 'string' || need.title.trim().length === 0) {
          await client.query('ROLLBACK');
          return respond(res, 400, { success: false, error: 'Each need must have a title' });
        }

        const flagged = shouldFlag(need.title) || shouldFlag(need.description);
        if (flagged) flaggedCount++;

        const result = await client.query(
          `INSERT INTO needs (title, description, tags, metadata, created_by, anonymity_level, source, fulfillments_wanted, flagged, review_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING id`,
          [
            need.title.trim(),
            need.description || null,
            need.tags || [],
            need.metadata || {},
            need.created_by || null,
            need.anonymity_level || 'public',
            need.source || null,
            need.fulfillments_wanted || 'unlimited',
            flagged,
            flagged ? 'pending' : 'ok'
          ]
        );
        ids.push(result.rows[0].id);
      }

      await client.query('COMMIT');
    } finally {
      client.release();
    }

    respond(res, 201, {
      success: true,
      data: {
        created: ids.length,
        ids,
        flagged_count: flaggedCount
      }
    });
  } catch (err) {
    respond(res, 500, { success: false, error: 'Database error: ' + err.message });
  }
});

// ─── POST /api/fulfillments ──────────────────────────────────

app.post('/api/fulfillments', writeLimiter, async (req, res) => {
  try {
    const { need_id, references_id, title, description, status, tags, metadata, created_by, anonymity_level, source } = req.body;

    if (!need_id) {
      return respond(res, 400, { success: false, error: 'need_id is required' });
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return respond(res, 400, { success: false, error: 'title is required' });
    }
    if (title.length > 500) {
      return respond(res, 400, { success: false, error: 'title must be 500 characters or less' });
    }
    if (description && description.length > 10000) {
      return respond(res, 400, { success: false, error: 'description must be 10,000 characters or less' });
    }

    // Verify need exists
    const needExists = await pool.query('SELECT id FROM needs WHERE id = $1', [need_id]);
    if (needExists.rows.length === 0) {
      return respond(res, 404, { success: false, error: 'Need not found' });
    }

    const flagged = shouldFlag(title) || shouldFlag(description);
    const reviewStatus = flagged ? 'pending' : 'ok';

    const validStatuses = ['offering', 'in_progress', 'completed', 'withdrawn'];
    const fulfillStatus = validStatuses.includes(status) ? status : 'offering';

    const result = await pool.query(
      `INSERT INTO fulfillments (need_id, references_id, title, description, status, tags, metadata, created_by, anonymity_level, source, flagged, review_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        need_id,
        references_id || null,
        title.trim(),
        description || null,
        fulfillStatus,
        tags || [],
        metadata || {},
        created_by || null,
        anonymity_level || 'public',
        source || null,
        flagged,
        reviewStatus
      ]
    );

    respond(res, 201, { success: true, data: result.rows[0] });
  } catch (err) {
    respond(res, 500, { success: false, error: 'Database error: ' + err.message });
  }
});

// ─── GET /api/fulfillments ───────────────────────────────────

app.get('/api/fulfillments', async (req, res) => {
  try {
    const { need_id } = req.query;
    let limit = Math.min(parseInt(req.query.limit) || 20, 100);
    let offset = parseInt(req.query.offset) || 0;

    let query = 'SELECT * FROM fulfillments WHERE flagged = false';
    const params = [];
    let paramIndex = 1;

    if (need_id) {
      query += ` AND need_id = $${paramIndex}`;
      params.push(need_id);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    respond(res, 200, { success: true, data: result.rows });
  } catch (err) {
    respond(res, 500, { success: false, error: 'Database error: ' + err.message });
  }
});

// ─── GET /api/search ─────────────────────────────────────────

app.get('/api/search', async (req, res) => {
  try {
    const { q, tags } = req.query;
    let limit = Math.min(parseInt(req.query.limit) || 20, 100);

    if (!q && !tags) {
      return respond(res, 400, { success: false, error: 'Provide q (search text) or tags parameter' });
    }

    let needsQuery = 'SELECT * FROM needs WHERE flagged = false';
    let fulfillmentsQuery = 'SELECT * FROM fulfillments WHERE flagged = false';
    const needsParams = [];
    const fulfillmentsParams = [];
    let nIdx = 1;
    let fIdx = 1;

    if (q) {
      const searchPattern = `%${q}%`;
      needsQuery += ` AND (title ILIKE $${nIdx} OR description ILIKE $${nIdx + 1})`;
      needsParams.push(searchPattern, searchPattern);
      nIdx += 2;

      fulfillmentsQuery += ` AND (title ILIKE $${fIdx} OR description ILIKE $${fIdx + 1})`;
      fulfillmentsParams.push(searchPattern, searchPattern);
      fIdx += 2;
    }

    if (tags) {
      const tagArray = tags.split(',').map(t => t.trim());
      needsQuery += ` AND tags && $${nIdx}`;
      needsParams.push(tagArray);
      nIdx++;

      fulfillmentsQuery += ` AND tags && $${fIdx}`;
      fulfillmentsParams.push(tagArray);
      fIdx++;
    }

    needsQuery += ` ORDER BY created_at DESC LIMIT $${nIdx}`;
    needsParams.push(limit);

    fulfillmentsQuery += ` ORDER BY created_at DESC LIMIT $${fIdx}`;
    fulfillmentsParams.push(limit);

    const [needsResult, fulfillmentsResult] = await Promise.all([
      pool.query(needsQuery, needsParams),
      pool.query(fulfillmentsQuery, fulfillmentsParams)
    ]);

    respond(res, 200, {
      success: true,
      data: {
        needs: needsResult.rows,
        fulfillments: fulfillmentsResult.rows
      }
    });
  } catch (err) {
    respond(res, 500, { success: false, error: 'Database error: ' + err.message });
  }
});

// ─── POST /api/report/:id ───────────────────────────────────

app.post('/api/report/:id', writeLimiter, async (req, res) => {
  try {
    const { type, reason } = req.body;
    if (!type || !['need', 'fulfillment'].includes(type)) {
      return respond(res, 400, { success: false, error: 'type must be "need" or "fulfillment"' });
    }

    const table = type === 'need' ? 'needs' : 'fulfillments';
    const result = await pool.query(
      `UPDATE ${table} SET flagged = true, review_status = 'reported' WHERE id = $1 RETURNING id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return respond(res, 404, { success: false, error: 'Entry not found' });
    }

    respond(res, 200, { success: true, data: { id: result.rows[0].id, flagged: true, reason: reason || 'No reason provided' } });
  } catch (err) {
    respond(res, 500, { success: false, error: 'Database error: ' + err.message });
  }
});

// ─── Admin: GET /api/admin/flagged ───────────────────────────

app.get('/api/admin/flagged', requireAdmin, async (req, res) => {
  try {
    const [needs, fulfillments] = await Promise.all([
      pool.query('SELECT * FROM needs WHERE flagged = true ORDER BY created_at DESC'),
      pool.query('SELECT * FROM fulfillments WHERE flagged = true ORDER BY created_at DESC')
    ]);

    respond(res, 200, {
      success: true,
      data: {
        needs: needs.rows,
        fulfillments: fulfillments.rows
      }
    });
  } catch (err) {
    respond(res, 500, { success: false, error: 'Database error: ' + err.message });
  }
});

// ─── Admin: POST /api/admin/unflag/:id ───────────────────────

app.post('/api/admin/unflag/:id', requireAdmin, async (req, res) => {
  try {
    const { type } = req.body;
    if (!type || !['need', 'fulfillment'].includes(type)) {
      return respond(res, 400, { success: false, error: 'type must be "need" or "fulfillment"' });
    }

    const table = type === 'need' ? 'needs' : 'fulfillments';
    const result = await pool.query(
      `UPDATE ${table} SET flagged = false, review_status = 'ok' WHERE id = $1 RETURNING id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return respond(res, 404, { success: false, error: 'Entry not found' });
    }

    respond(res, 200, { success: true, data: { id: result.rows[0].id, flagged: false } });
  } catch (err) {
    respond(res, 500, { success: false, error: 'Database error: ' + err.message });
  }
});

// ─── Admin: DELETE /api/admin/entry/:id ──────────────────────

app.delete('/api/admin/entry/:id', requireAdmin, async (req, res) => {
  try {
    const { type } = req.body;
    if (!type || !['need', 'fulfillment'].includes(type)) {
      return respond(res, 400, { success: false, error: 'type must be "need" or "fulfillment"' });
    }

    const table = type === 'need' ? 'needs' : 'fulfillments';
    const result = await pool.query(
      `DELETE FROM ${table} WHERE id = $1 RETURNING id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return respond(res, 404, { success: false, error: 'Entry not found' });
    }

    respond(res, 200, { success: true, data: { id: result.rows[0].id, deleted: true } });
  } catch (err) {
    respond(res, 500, { success: false, error: 'Database error: ' + err.message });
  }
});

// ─── Start server (local dev only — Vercel uses the export) ──

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => console.log(`Need Ledger running on port ${PORT}`));
}

module.exports = app;
