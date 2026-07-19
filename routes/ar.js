const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all AR calls
router.get('/calls', (req, res) => {
  const { patient_id } = req.query;
  let query = `
    SELECT ac.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn
    FROM ar_calls ac
    LEFT JOIN patients p ON ac.patient_id = p.patient_id
    WHERE 1=1
  `;
  const params = [];
  if (patient_id) { query += ' AND ac.patient_id = ?'; params.push(patient_id); }
  query += ' ORDER BY ac.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// Get claims status for patient
router.get('/claims-status/:patientId', (req, res) => {
  const charges = db.prepare(`
    SELECT c.*, p.first_name || ' ' || p.last_name as patient_name,
           py.paid_amount, py.allowed_amount, py.adjustment_amount, py.payment_date
    FROM charges c
    LEFT JOIN patients p ON c.patient_id = p.patient_id
    LEFT JOIN payments py ON c.charge_id = py.charge_id
    WHERE c.patient_id = ?
    ORDER BY c.created_at DESC
  `).all(req.params.patientId);
  res.json(charges);
});

// Verify insurance benefits same as eligibility
router.get('/verify-benefits/:patientId', (req, res) => {
  const eligibility = db.prepare(`
    SELECT e.*, eb.benefit_name, eb.copay_amount as elig_copay, eb.deductible_amount as elig_deductible, eb.coinsurance_percent as elig_coinsurance
    FROM eligibility_master e
    JOIN eligibility_benefits eb ON e.id = eb.eligibility_id
    WHERE e.patient_id = ? AND e.status = 'active'
  `).all(req.params.patientId);

  const insurance = db.prepare('SELECT * FROM insurances WHERE patient_id = ? AND status = "active" LIMIT 1').get(req.params.patientId);

  const comparison = eligibility.map(e => ({
    benefit: e.benefit_name,
    eligibility_copay: e.elig_copay,
    eligibility_deductible: e.elig_deductible,
    eligibility_coinsurance: e.elig_coinsurance,
    insurance_copay: insurance?.copay,
    insurance_deductible: insurance?.deductible,
    insurance_coinsurance: insurance?.coinsurance,
    match: e.elig_copay === insurance?.copay && e.elig_deductible === insurance?.deductible
  }));

  res.json({ eligibility, insurance, comparison });
});

// Verify patient history (payments, CPT, ICD)
router.get('/patient-history/:patientId', (req, res) => {
  const payments = db.prepare('SELECT * FROM payments WHERE patient_id = ? ORDER BY payment_date DESC').all(req.params.patientId);
  const charges = db.prepare(`
    SELECT cli.* FROM charge_line_items cli
    JOIN charges c ON cli.charge_id = c.charge_id
    WHERE c.patient_id = ?
  `).all(req.params.patientId);
  const transactions = db.prepare('SELECT * FROM patient_transactions WHERE patient_id = ? ORDER BY transaction_date DESC').all(req.params.patientId);
  res.json({ payments, charges, transactions });
});

// Verify authorization
router.get('/verify-auth/:patientId', (req, res) => {
  const auths = db.prepare(`
    SELECT * FROM authorizations WHERE patient_id = ? ORDER BY created_at DESC
  `).all(req.params.patientId);
  res.json(auths);
});

// Create AR call
router.post('/calls', (req, res) => {
  const callId = 'CALL' + String(Date.now()).slice(-6);
  const { patient_id, charge_id, call_date, call_time, call_type, phone_number, insurance_payer, representative_name, reference_number, claim_status, action_required, follow_up_date, notes, duration } = req.body;

  db.prepare(`
    INSERT INTO ar_calls (call_id, patient_id, charge_id, call_date, call_time, call_type, phone_number, insurance_payer, representative_name, reference_number, claim_status, action_required, follow_up_date, notes, duration)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(callId, patient_id, charge_id, call_date, call_time, call_type || 'outbound', phone_number, insurance_payer, representative_name, reference_number, claim_status, action_required, follow_up_date, notes, duration);

  // Also save to call history
  db.prepare(`
    INSERT INTO ar_call_history (call_id, patient_id, call_date, call_time, call_type, phone_number, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
  `).run(callId, patient_id, call_date, call_time, call_type || 'outbound', phone_number, notes);

  res.json({ call_id: callId, message: 'Call logged' });
});

// Update call
router.put('/calls/:callId', (req, res) => {
  const { claim_status, action_required, follow_up_date, notes, call_status } = req.body;
  db.prepare(`
    UPDATE ar_calls SET claim_status=?, action_required=?, follow_up_date=?, notes=?, call_status=? WHERE call_id=?
  `).run(claim_status, action_required, follow_up_date, notes, call_status, req.params.callId);
  res.json({ message: 'Call updated' });
});

// Get call history for patient
router.get('/calls/history/:patientId', (req, res) => {
  const history = db.prepare('SELECT * FROM ar_call_history WHERE patient_id = ? ORDER BY call_date DESC').all(req.params.patientId);
  res.json(history);
});

// Voicemail
router.post('/voicemail', (req, res) => {
  const vmId = 'VM' + String(Date.now()).slice(-6);
  const { patient_id, call_id, phone_number, ivr_response, notes } = req.body;

  db.prepare(`
    INSERT INTO ar_voicemails (voicemail_id, patient_id, call_id, date, time, phone_number, ivr_response, notes)
    VALUES (?, ?, ?, date('now'), time('now'), ?, ?, ?)
  `).run(vmId, patient_id, call_id, phone_number, ivr_response, notes);

  res.json({ voicemail_id: vmId, message: 'Voicemail recorded' });
});

// Get voicemails
router.get('/voicemails', (req, res) => {
  const vms = db.prepare('SELECT * FROM ar_voicemails ORDER BY created_at DESC').all();
  res.json(vms);
});

module.exports = router;
