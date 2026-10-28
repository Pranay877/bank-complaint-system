// =====================================================================
//  backend/routes/categories.js
//  GET /api/categories
//  Returns the list of complaint categories so the frontend can fill
//  the "Category" dropdown.  No login needed.
//
//  Example response:
//    [ { "id": 1, "category_name": "UPI" }, { "id": 2, "category_name": "ATM" }, ... ]
// =====================================================================

const express = require('express');
const db = require('../database/db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, category_name FROM categories ORDER BY id');
    res.json(rows);
  } catch (err) {
    console.error('Categories error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;
