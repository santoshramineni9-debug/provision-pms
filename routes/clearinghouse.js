const express = require('express');
const router = express.Router();
const db = require('../db');

function cid() { return 'CLM' + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 1000)); }

router.post('/submit', (req, res) => {
  const { patient_id, charge_id, payer_id, provider_id, claim_type, priority } = req.body;
  if (!patient_id || !charge_id || !payer_id || !provider_id) return res.status(400).json({ error: 'All fields required' });

  const charge = db.prepare('SELECT * FROM charges WHERE charge_id = ?').get(charge_id);
  if (!charge) return res.status(400).json({ error: 'Charge not found' });

  const claim_id = cid();
  db.prepare(`INSERT INTO claims (claim_id, patient_id, charge_id, provider_id, payer_id, claim_type, priority, status, total_billed, submission_date)
    VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))`).run(claim_id, patient_id, charge_id, provider_id, payer_id, claim_type || 'professional', priority || 'primary', 'submitted', charge.total_charges || 0);

  db.prepare('UPDATE charges SET status = ? WHERE charge_id = ?').run('submitted', charge_id);
  db.saveDB();
  res.json({ claim_id, status: 'submitted' });
});

router.get('/claims', (req, res) => {
  const { status, patient_id } = req.query;
  let sql = `SELECT c.*, p.first_name || ' ' || p.last_name as patient_name, ins.payer_name
    FROM claims c
    LEFT JOIN patients p ON c.patient_id = p.patient_id
    LEFT JOIN insurances ins ON c.payer_id = ins.id
    WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND c.status = ?'; params.push(status); }
  if (patient_id) { sql += ' AND c.patient_id = ?'; params.push(patient_id); }
  sql += ' ORDER BY c.submission_date DESC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/claims/:claimId', (req, res) => {
  const claim = db.prepare(`SELECT c.*, p.first_name || ' ' || p.last_name as patient_name, ins.payer_name
    FROM claims c
    LEFT JOIN patients p ON c.patient_id = p.patient_id
    LEFT JOIN insurances ins ON c.payer_id = ins.id
    WHERE c.claim_id = ?`).get(req.params.claimId);
  if (!claim) return res.status(404).json({ error: 'Not found' });
  res.json(claim);
});

router.post('/claims/:claimId/route-to-rejections', (req, res) => {
  const claim = db.prepare('SELECT * FROM claims WHERE claim_id = ?').get(req.params.claimId);
  if (!claim) return res.status(404).json({ error: 'Claim not found' });

  const rejId = 'REJ' + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 1000));
  db.prepare(`INSERT INTO rejections (rejection_id, claim_id, patient_id, charge_id, rejection_code, rejection_reason, status, assigned_to, created_at)
    VALUES (?,?,?,?,?,?,?,?,datetime('now'))`).run(rejId, claim.claim_id, claim.patient_id, claim.charge_id, req.body.code || 'CO-45', req.body.reason || 'Routed from clearinghouse', 'new', null);
  db.prepare('UPDATE claims SET status = ? WHERE claim_id = ?').run('rejected', claim.claim_id);
  db.saveDB();
  res.json({ message: 'Routed to rejections', rejection_id: rejId });
});

module.exports = router;
