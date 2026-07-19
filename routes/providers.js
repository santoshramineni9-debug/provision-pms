const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const providers = db.prepare('SELECT * FROM providers ORDER BY first_name').all();
  res.json(providers);
});

router.get('/:providerId', (req, res) => {
  const provider = db.prepare('SELECT * FROM providers WHERE provider_id = ?').get(req.params.providerId);
  if (!provider) return res.status(404).json({ error: 'Not found' });
  res.json(provider);
});

router.post('/', (req, res) => {
  const provId = 'PRV' + String(Date.now()).slice(-6);
  const { first_name, last_name, npi, taxonomy_code, specialization, provider_type, phone, address, city, state, zip } = req.body;
  db.prepare(`
    INSERT INTO providers (provider_id, first_name, last_name, npi, taxonomy_code, specialization, provider_type, phone, address, city, state, zip)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(provId, first_name, last_name, npi, taxonomy_code, specialization, provider_type || 'rendering', phone, address, city, state, zip);
  res.json({ provider_id: provId, message: 'Provider created' });
});

router.put('/:providerId', (req, res) => {
  const { first_name, last_name, npi, taxonomy_code, specialization, phone } = req.body;
  db.prepare(`
    UPDATE providers SET first_name=?, last_name=?, npi=?, taxonomy_code=?, specialization=?, phone=? WHERE provider_id=?
  `).run(first_name, last_name, npi, taxonomy_code, specialization, phone, req.params.providerId);
  res.json({ message: 'Provider updated' });
});

router.delete('/:providerId', (req, res) => {
  db.prepare('DELETE FROM providers WHERE provider_id = ?').run(req.params.providerId);
  res.json({ message: 'Provider deleted' });
});

module.exports = router;
