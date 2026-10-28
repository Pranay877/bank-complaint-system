// =====================================================================
//  backend/routes/auth.js
//  Handles: registering a customer, logging in, and "who am I?".
//  All URLs here start with /api/auth (set in server.js).
// =====================================================================

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { verifyToken, JWT_SECRET } = require('../middleware/authMiddleware');

const router = express.Router();

// ---------------------------------------------------------------------
// POST /api/auth/register
// Creates a new CUSTOMER account.
// Body: { "name": "...", "email": "...", "password": "..." }
// Employees cannot register themselves - they are added by the bank
// (in this project: directly in schema.sql).
// ---------------------------------------------------------------------
router.post('/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    // ----- validate the input -----
    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ error: 'Name must be between 2 and 100 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    if (password.length < 6 || password.length > 72) {
      return res.status(400).json({ error: 'Password must be between 6 and 72 characters' });
    }

    // ----- is the email already used? -----
    // The "?" is a placeholder; the value goes in the array. This is a
    // "parameterized query" and it protects against SQL injection.
    const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'This email is already registered' });
    }

    // ----- hash the password and save the user -----
    const hashedPassword = await bcrypt.hash(password, 10);
    const [insertedRows] = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?) RETURNING id',
      [name, email, hashedPassword, 'customer']   // role is always 'customer' here
    );
    const newUserId = insertedRows[0].id;

    res.status(201).json({
      message: 'Registration successful. You can now log in.',
      user: { id: newUserId, name, email, role: 'customer' }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ---------------------------------------------------------------------
// POST /api/auth/login
// Checks email + password. Works for both customers and employees;
// the role comes from the database, so the frontend uses it to decide
// which dashboard to open.
// Body: { "email": "...", "password": "..." }
// ---------------------------------------------------------------------
router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const [rows] = await db.query(
      'SELECT id, name, email, password, role FROM users WHERE email = ?',
      [email]
    );
    const user = rows[0];

    // Same message for "no such email" and "wrong password", on purpose,
    // so nobody can use this form to find out which emails exist.
    const passwordMatches = user && (await bcrypt.compare(password, user.password));
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create the token (valid for 8 hours)
    const userInfo = { id: user.id, name: user.name, email: user.email, role: user.role };
    const token = jwt.sign(userInfo, JWT_SECRET, { expiresIn: '8h' });

    res.json({ message: 'Login successful', token, user: userInfo });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ---------------------------------------------------------------------
// GET /api/auth/me      (login required)
// Returns the currently logged-in user. The frontend can call this when
// a page loads to confirm the saved token is still valid.
// ---------------------------------------------------------------------
router.get('/me', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'User no longer exists. Please log in again.' });
    }
    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

module.exports = router;
