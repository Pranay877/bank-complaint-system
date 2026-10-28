// =====================================================================
//  backend/routes/complaints.js
//  Everything about complaints. All URLs start with /api/complaints.
//  Every route here requires the user to be logged in.
//
//    POST /api/complaints               customer  - register a complaint
//    GET  /api/complaints               both      - list complaints
//    GET  /api/complaints/stats         both      - counts for dashboard cards
//    GET  /api/complaints/:id           both      - one complaint + its history
//    PUT  /api/complaints/:id/status    employee  - change status (+ remark)
//    POST /api/complaints/:id/updates   employee  - add a remark only
//
//  ":id" is the friendly complaint ID, e.g. CMP-2026-0001
// =====================================================================

const express = require('express');
const db = require('../database/db');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

const VALID_STATUSES = ['Pending', 'In Progress', 'Resolved', 'Closed'];

// Every route below this line needs a logged-in user.
router.use(verifyToken);

// ---------------------------------------------------------------------
// Small helper functions
// ---------------------------------------------------------------------

// Turns empty/missing values into null, otherwise returns trimmed text.
function cleanOptional(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

// Today's date as "YYYY-MM-DD" (local time).
function todayString() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

// True only for real dates written as YYYY-MM-DD (rejects 2026-02-31 etc.)
function isValidDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(text + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

// ---------------------------------------------------------------------
// POST /api/complaints          (customer only)
// Registers a new complaint and creates its complaint ID.
// Body: {
//   "category": "UPI",                    (required, must exist in categories)
//   "subject": "...",                     (required)
//   "description": "...",                 (required)
//   "transaction_id": "...",              (optional)
//   "transaction_amount": 1500.50,        (optional)
//   "transaction_date": "2026-10-05"      (optional, YYYY-MM-DD)
// }
// ---------------------------------------------------------------------
router.post('/', requireRole('customer'), async (req, res) => {
  try {
    const category = String(req.body.category || '').trim();
    const subject = String(req.body.subject || '').trim();
    const description = String(req.body.description || '').trim();
    const transaction_id = cleanOptional(req.body.transaction_id);
    const amountText = cleanOptional(req.body.transaction_amount);
    const transaction_date = cleanOptional(req.body.transaction_date);

    // ----- validate the input -----
    if (!category) {
      return res.status(400).json({ error: 'Please select a category' });
    }
    if (subject.length < 3 || subject.length > 150) {
      return res.status(400).json({ error: 'Subject must be between 3 and 150 characters' });
    }
    if (description.length < 10 || description.length > 2000) {
      return res.status(400).json({ error: 'Description must be between 10 and 2000 characters' });
    }
    if (transaction_id && transaction_id.length > 50) {
      return res.status(400).json({ error: 'Transaction ID must be 50 characters or less' });
    }

    let transaction_amount = null;
    if (amountText !== null) {
      transaction_amount = Number(amountText);
      if (isNaN(transaction_amount) || transaction_amount < 0 || transaction_amount > 9999999999.99) {
        return res.status(400).json({ error: 'Transaction amount must be a valid positive number' });
      }
      transaction_amount = Math.round(transaction_amount * 100) / 100; // 2 decimal places
    }

    if (transaction_date !== null) {
      if (!isValidDate(transaction_date)) {
        return res.status(400).json({ error: 'Transaction date must be a valid date (YYYY-MM-DD)' });
      }
      if (transaction_date > todayString()) {
        return res.status(400).json({ error: 'Transaction date cannot be in the future' });
      }
    }

    // ----- does this category exist? -----
    const [cat] = await db.query('SELECT id FROM categories WHERE category_name = ?', [category]);
    if (cat.length === 0) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    // ----- save the complaint AND its first history entry together -----
    // A "transaction" means: either both inserts succeed, or neither does.
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // Build the complaint ID: CMP-<year>-<number padded to 4 digits>
      const [rows] = await connection.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_number FROM complaints');
      const number = String(rows[0].next_number).padStart(4, '0');
      const complaint_id = `CMP-${new Date().getFullYear()}-${number}`;

      await connection.query(
        `INSERT INTO complaints
           (complaint_id, user_id, category, subject, description,
            transaction_id, transaction_amount, transaction_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
        [complaint_id, req.user.id, category, subject, description,
         transaction_id, transaction_amount, transaction_date]
      );

      await connection.query(
        `INSERT INTO complaint_updates (complaint_id, status, remark, updated_by)
         VALUES (?, 'Pending', 'Complaint registered', ?)`,
        [complaint_id, req.user.id]
      );

      await connection.commit();
      res.status(201).json({ message: 'Complaint Registered Successfully', complaint_id });
    } catch (err) {
      await connection.rollback(); // undo everything if something failed
      throw err;
    } finally {
      connection.release();        // give the connection back to the pool
    }
  } catch (err) {
    console.error('Create complaint error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ---------------------------------------------------------------------
// GET /api/complaints/stats
// Counts for the dashboard cards.
//   customer -> counts of their own complaints
//   employee -> counts of all complaints
// Response: { total, pending, in_progress, resolved, closed }
// (This route must stay ABOVE "/:id", otherwise Express would treat
//  the word "stats" as a complaint ID.)
// ---------------------------------------------------------------------
router.get('/stats', async (req, res) => {
  try {
    let sql = `SELECT COUNT(*) AS total,
                      COALESCE(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending,
                      COALESCE(SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END), 0) AS in_progress,
                      COALESCE(SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END), 0) AS resolved,
                      COALESCE(SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END), 0) AS closed
               FROM complaints`;
    const params = [];

    if (req.user.role === 'customer') {
      sql += ' WHERE user_id = ?';
      params.push(req.user.id);
    }

    const [rows] = await db.query(sql, params);
    const r = rows[0];
    res.json({
      total: Number(r.total),
      pending: Number(r.pending),
      in_progress: Number(r.in_progress),
      resolved: Number(r.resolved),
      closed: Number(r.closed)
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ---------------------------------------------------------------------
// GET /api/complaints
// Lists complaints, newest first.
//   customer -> only their own complaints
//   employee -> all complaints
// Optional filter:  /api/complaints?status=Pending
//                   /api/complaints?status=In%20Progress
// Response: an array of complaints.
// ---------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const conditions = [];
    const params = [];

    if (req.user.role === 'customer') {
      conditions.push('c.user_id = ?');
      params.push(req.user.id);
    }

    if (req.query.status) {
      if (!VALID_STATUSES.includes(req.query.status)) {
        return res.status(400).json({ error: 'Invalid status filter' });
      }
      conditions.push('c.status = ?');
      params.push(req.query.status);
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await db.query(
      `SELECT c.complaint_id, c.category, c.subject, c.status,
              c.created_at, c.updated_at, u.name AS customer_name
       FROM complaints c
       JOIN users u ON u.id = c.user_id
       ${where}
       ORDER BY c.created_at DESC, c.id DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error('List complaints error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ---------------------------------------------------------------------
// GET /api/complaints/:id
// One complaint with its full details and its history (all updates).
// A customer can only open their own complaints.
// Response: { "complaint": {...}, "updates": [ {...}, {...} ] }
// ---------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.complaint_id, c.category, c.subject, c.description,
              c.transaction_id, c.transaction_amount, c.transaction_date,
              c.status, c.created_at, c.updated_at, c.user_id,
              u.name AS customer_name, u.email AS customer_email
       FROM complaints c
       JOIN users u ON u.id = c.user_id
       WHERE c.complaint_id = ?`,
      [req.params.id]
    );

    const complaint = rows[0];

    // Same "not found" answer whether it doesn't exist or belongs to
    // someone else, so customers can't probe other people's complaint IDs.
    if (!complaint || (req.user.role === 'customer' && Number(complaint.user_id) !== Number(req.user.id))) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const [updates] = await db.query(
      `SELECT cu.id, cu.status, cu.remark, cu.created_at,
              u.name AS updated_by_name, u.role AS updated_by_role
       FROM complaint_updates cu
       JOIN users u ON u.id = cu.updated_by
       WHERE cu.complaint_id = ?
       ORDER BY cu.id ASC`,
      [req.params.id]
    );

    res.json({ complaint, updates });
  } catch (err) {
    console.error('Get complaint error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ---------------------------------------------------------------------
// PUT /api/complaints/:id/status        (employee only)
// Changes the status and records it in the history.
// Body: { "status": "In Progress", "remark": "Checking with the bank" }
// "remark" is optional; if empty, one is written automatically.
// ---------------------------------------------------------------------
router.put('/:id/status', requireRole('employee'), async (req, res) => {
  try {
    const newStatus = String(req.body.status || '').trim();
    const remark = cleanOptional(req.body.remark);

    if (!VALID_STATUSES.includes(newStatus)) {
      return res.status(400).json({ error: 'Status must be one of: ' + VALID_STATUSES.join(', ') });
    }
    if (remark && remark.length > 1000) {
      return res.status(400).json({ error: 'Remark must be 1000 characters or less' });
    }

    const [rows] = await db.query('SELECT status FROM complaints WHERE complaint_id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    const oldStatus = rows[0].status;

    if (oldStatus === newStatus && !remark) {
      return res.status(400).json({ error: 'Status is unchanged. Choose a new status or add a remark.' });
    }

    const finalRemark = remark || `Status changed from ${oldStatus} to ${newStatus}`;

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        'UPDATE complaints SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE complaint_id = ?',
        [newStatus, req.params.id]
      );
      await connection.query(
        'INSERT INTO complaint_updates (complaint_id, status, remark, updated_by) VALUES (?, ?, ?, ?)',
        [req.params.id, newStatus, finalRemark, req.user.id]
      );

      await connection.commit();
      res.json({
        message: 'Complaint updated successfully',
        complaint_id: req.params.id,
        status: newStatus
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ---------------------------------------------------------------------
// POST /api/complaints/:id/updates      (employee only)
// Adds a remark WITHOUT changing the status.
// Body: { "remark": "Customer contacted by phone" }
// ---------------------------------------------------------------------
router.post('/:id/updates', requireRole('employee'), async (req, res) => {
  try {
    const remark = String(req.body.remark || '').trim();

    if (remark.length < 1 || remark.length > 1000) {
      return res.status(400).json({ error: 'Remark must be between 1 and 1000 characters' });
    }

    const [rows] = await db.query('SELECT status FROM complaints WHERE complaint_id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    const currentStatus = rows[0].status;

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        'INSERT INTO complaint_updates (complaint_id, status, remark, updated_by) VALUES (?, ?, ?, ?)',
        [req.params.id, currentStatus, remark, req.user.id]
      );
      await connection.query(
        'UPDATE complaints SET updated_at = CURRENT_TIMESTAMP WHERE complaint_id = ?',
        [req.params.id]
      );

      await connection.commit();
      res.status(201).json({ message: 'Remark added successfully', complaint_id: req.params.id });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Add remark error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;
