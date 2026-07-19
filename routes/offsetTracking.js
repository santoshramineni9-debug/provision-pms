const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all offset/reconciliation records (admin view) - must be before /:patientId
router.get('/all', (req, res) => {
  const query = `
    SELECT o.*,
      p.first_name || ' ' || p.last_name as patient_name, p.mrn,
      c.total_charges as charge_total, c.charge_date,
      py.paid_amount as payment_paid, py.payment_date, py.payer_name as payment_payer
    FROM offset_reconciliation o
    LEFT JOIN patients p ON o.patient_id = p.patient_id
    LEFT JOIN charges c ON o.charge_id = c.charge_id
    LEFT JOIN payments py ON o.payment_id = py.payment_id
    ORDER BY o.created_at DESC
  `;
  res.json(db.prepare(query).all());
});

// GET summary for a patient
router.get('/summary/:patientId', (req, res) => {
  const pid = req.params.patientId;
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_offsets,
      COALESCE(SUM(offset_amount), 0) as total_offset_amount,
      COALESCE(SUM(billed_amount), 0) as total_billed,
      COALESCE(SUM(allowed_amount), 0) as total_allowed,
      COALESCE(SUM(writeoff_amount), 0) as total_writeoff,
      COALESCE(SUM(patient_responsibility), 0) as total_patient_responsibility,
      COALESCE(SUM(paid_to_provider), 0) as total_paid_to_provider
    FROM offset_reconciliation
    WHERE patient_id = ?
  `).get(pid);

  const lastTx = db.prepare('SELECT balance FROM patient_transactions WHERE patient_id = ? ORDER BY id DESC LIMIT 1').get(pid);
  const remaining_balance = lastTx?.balance || 0;

  res.json({
    patient_id: pid,
    ...summary,
    remaining_balance
  });
});

// GET all offset/reconciliation records for a patient
router.get('/', (req, res) => {
  const { patient_id } = req.query;
  let query = `
    SELECT o.*,
      p.first_name || ' ' || p.last_name as patient_name, p.mrn,
      c.total_charges as charge_total, c.charge_date,
      py.paid_amount as payment_paid, py.payment_date, py.payer_name as payment_payer
    FROM offset_reconciliation o
    LEFT JOIN patients p ON o.patient_id = p.patient_id
    LEFT JOIN charges c ON o.charge_id = c.charge_id
    LEFT JOIN payments py ON o.payment_id = py.payment_id
    WHERE 1=1
  `;
  const params = [];
  if (patient_id) { query += ' AND o.patient_id = ?'; params.push(patient_id); }
  query += ' ORDER BY o.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// POST create a manual offset/reconciliation record
router.post('/', (req, res) => {
  const recId = 'OREC' + Date.now();
  const {
    patient_id, charge_id, payment_id, record_type,
    old_balance, offset_amount, new_balance,
    billed_amount, allowed_amount, writeoff_amount,
    patient_responsibility, paid_to_provider,
    from_charge_id, to_charge_id, payer_name, notes, status
  } = req.body;

  if (!patient_id || !record_type) {
    return res.status(400).json({ error: 'patient_id and record_type are required' });
  }

  db.prepare(`
    INSERT INTO offset_reconciliation
      (record_id, patient_id, charge_id, payment_id, record_type, old_balance, offset_amount, new_balance, billed_amount, allowed_amount, writeoff_amount, patient_responsibility, paid_to_provider, from_charge_id, to_charge_id, payer_name, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    recId, patient_id, charge_id || null, payment_id || null, record_type,
    old_balance || 0, offset_amount || 0, new_balance || 0,
    billed_amount || 0, allowed_amount || 0, writeoff_amount || 0,
    patient_responsibility || 0, paid_to_provider || 0,
    from_charge_id || null, to_charge_id || null,
    payer_name || '', notes || '', status || 'completed'
  );

  res.json({ record_id: recId, message: 'Offset/reconciliation record created' });
});

module.exports = router;
