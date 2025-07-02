const { createUser, getUserByUsername, getUserById, updateUser, listUsers } = require('../models/user.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

exports.register = async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    const existing = await getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    const hash = await bcrypt.hash(password, 10);
    const api_key = uuidv4();
    const user = await createUser({ username, email, password: hash, api_key });
    res.status(201).json({ id: user.id, username: user.username, email: user.email, api_key: user.api_key });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  try {
    const user = await getUserByUsername(username);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials or inactive user' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ username: user.username, id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, api_key: user.api_key, role: user.role });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.activate = async (req, res) => {
  // Admin only
  const { id } = req.params;
  try {
    const user = await updateUser(id, { is_active: true });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.deactivate = async (req, res) => {
  // Admin only
  const { id } = req.params;
  try {
    const user = await updateUser(id, { is_active: false });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.setRole = async (req, res) => {
  // Admin only
  const { id } = req.params;
  const { role } = req.body;
  try {
    const user = await updateUser(id, { role });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.regenerateApiKey = async (req, res) => {
  // User or admin
  const { id } = req.params;
  try {
    const api_key = uuidv4();
    const user = await updateUser(id, { api_key });
    res.json({ api_key: user.api_key });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.list = async (req, res) => {
  // Admin only
  try {
    const users = await listUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
}; 