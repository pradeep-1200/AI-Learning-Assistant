const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// ── Helper: sign JWT ────────────────────────────────────────────────────────
const signToken = (user) =>
  jwt.sign(
    { id: user._id, username: user.username, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// ── POST /api/auth/signup ───────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Basic validation
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Please fill in all fields.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    // Check duplicate email
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
    });

    const token = signToken(user);

    res.status(201).json({
      message: 'Account created successfully!',
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password.' });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = signToken(user);

    res.status(200).json({
      message: 'Login successful!',
      token,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// ── GET /api/auth/me (protected) ────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.status(200).json({ user });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/auth/history (protected) ───────────────────────────────────────
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('chatHistory');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.status(200).json({ chatHistory: user.chatHistory || [] });
  } catch (err) {
    console.error('Get history error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── PUT /api/auth/history (protected) ───────────────────────────────────────
router.put('/history', authMiddleware, async (req, res) => {
  try {
    const { chatHistory } = req.body;
    if (!Array.isArray(chatHistory)) {
      return res.status(400).json({ message: 'chatHistory must be an array.' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { chatHistory } },
      { new: true }
    ).select('chatHistory');

    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.status(200).json({ message: 'History saved.', chatHistory: user.chatHistory });
  } catch (err) {
    console.error('Save history error:', err);
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
