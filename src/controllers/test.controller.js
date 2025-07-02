const { createTest, getTestById, getTestsByUser, updateTest, deleteTest, filterTests } = require('../models/test.model');

exports.create = async (req, res) => {
  const { name, description, natural_language_input, k6_script, target_url, test_type, configuration, tags } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const test = await createTest({
      user_id: req.user.id,
      name,
      description,
      natural_language_input,
      k6_script,
      target_url,
      test_type,
      configuration,
      tags
    });
    res.status(201).json(test);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.getById = async (req, res) => {
  try {
    const test = await getTestById(req.params.id);
    if (!test || test.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
    res.json(test);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.getAll = async (req, res) => {
  try {
    const tests = await getTestsByUser(req.user.id);
    res.json(tests);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.update = async (req, res) => {
  const { name, description, natural_language_input, k6_script, target_url, test_type, configuration, tags, is_active } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const test = await getTestById(req.params.id);
    if (!test || test.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
    const updated = await updateTest(req.params.id, {
      name,
      description,
      natural_language_input,
      k6_script,
      target_url,
      test_type,
      configuration,
      tags,
      is_active
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
};

exports.delete = async (req, res) => {
  try {
    const test = await getTestById(req.params.id);
    if (!test || test.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
    await deleteTest(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
}; 