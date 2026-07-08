const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  text: { type: String, required: true },
  stats: {
    tokens: Number,
    tokPerSec: Number,
    latencyMs: Number,
  },
}, { _id: false });

const ChatSessionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  timestamp: { type: Number, required: true },
  preview: { type: String, default: 'Chat session' },
  messages: [ChatMessageSchema],
}, { _id: false });

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    trim: true,
    minlength: [2, 'Username must be at least 2 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
  },
  chatHistory: [ChatSessionSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('User', UserSchema);
