const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all appeals
router.get('/', (req, res) => {
  const { status, patient_id } = req.query;
  let query = `
    SELECT a.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn,
           c.total_charges, i.payer_name as ins_payer
    FROM appeals a
    LEFT JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN charges c ON a.charge_id = c.charge_id
    LEFT JOIN insurances i ON a.insurance_id = i.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { query += ' AND a.status = ?'; params.push(status); }
  if (patient_id) { query += ' AND a.patient_id = ?'; params.push(patient_id); }
  query += ' ORDER BY a.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// Get appeal details
router.get('/:appealId', (req, res) => {
  const appeal = db.prepare(`
    SELECT a.*, p.first_name, p.last_name, p.mrn, p.dob, p.ssn, p.phone,
           p.address, p.city, p.state, p.zip, p.guarantor,
           pr.first_name as prov_first, pr.last_name as prov_last, pr.npi, pr.taxonomy_code,
           i.payer_name, i.member_id, i.group_number, i.plan_name,
           c.total_charges, c.date_of_service, c.status as charge_status,
           r.rejection_code, r.rejection_reason
    FROM appeals a
    LEFT JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN providers pr ON c.provider_id = pr.provider_id
    LEFT JOIN insurances i ON a.insurance_id = i.id
    LEFT JOIN charges c ON a.charge_id = c.charge_id
    LEFT JOIN rejections r ON a.rejection_id = r.rejection_id
    WHERE a.appeal_id = ?
  `).get(req.params.appealId);
  if (!appeal) return res.status(404).json({ error: 'Appeal not found' });
  const lineItems = appeal.charge_id ? db.prepare('SELECT * FROM charge_line_items WHERE charge_id = ?').all(appeal.charge_id) : [];
  const history = db.prepare('SELECT * FROM appeals WHERE patient_id = ? ORDER BY created_at DESC').all(appeal.patient_id);
  res.json({ ...appeal, line_items: lineItems, patient_appeals: history });
});

// Create appeal from rejection
router.post('/', (req, res) => {
  const appealId = 'APL' + String(Date.now()).slice(-6);
  const { patient_id, charge_id, rejection_id, insurance_id, appeal_type, appeal_reason, appeal_amount,
    payer_name, reference_number, appeal_date, deadline_date, clinical_notes, supporting_documents } = req.body;

  let pid = patient_id, insId = insurance_id, payName = payer_name;
  if (rejection_id) {
    const rej = db.prepare('SELECT * FROM rejections WHERE rejection_id = ?').get(rejection_id);
    if (rej) {
      pid = pid || rej.patient_id;
      insId = insId || rej.insurance_id;
    }
  }
  if (charge_id) {
    const chg = db.prepare('SELECT * FROM charges WHERE charge_id = ?').get(charge_id);
    if (chg) {
      pid = pid || chg.patient_id;
    }
  }
  if (insId && !payName) {
    const ins = db.prepare('SELECT * FROM insurances WHERE id = ?').get(insId);
    if (ins) payName = ins.payer_name;
  }

  db.prepare(`
    INSERT INTO appeals (appeal_id, patient_id, charge_id, rejection_id, insurance_id, appeal_type,
      appeal_reason, appeal_amount, payer_name, reference_number, appeal_date, deadline_date,
      supporting_documents, clinical_notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(appealId, pid, charge_id || null, rejection_id || null, insId || null,
    appeal_type || 'medical_necessity', appeal_reason || '', appeal_amount || 0,
    payName || '', reference_number || '', appeal_date || null, deadline_date || null,
    supporting_documents || '', clinical_notes || '');

  if (rejection_id) {
    db.prepare('UPDATE rejections SET status = ? WHERE rejection_id = ?').run('escalated', rejection_id);
  }

  res.json({ appeal_id: appealId, message: 'Appeal created' });
});

// Update appeal
router.put('/:appealId', (req, res) => {
  const { status, appeal_reason, clinical_notes, supporting_documents, deadline_date,
    assigned_to, resolution_date, resolution_notes, approved_amount, denial_reason, appeal_amount } = req.body;
  db.prepare(`
    UPDATE appeals SET status=?, appeal_reason=?, clinical_notes=?, supporting_documents=?,
      deadline_date=?, assigned_to=?, resolution_date=?, resolution_notes=?,
      approved_amount=?, denial_reason=?, appeal_amount=?, updated_at=datetime('now')
    WHERE appeal_id=?
  `).run(status, appeal_reason, clinical_notes, supporting_documents, deadline_date,
    assigned_to, resolution_date, resolution_notes, approved_amount || 0, denial_reason || '',
    appeal_amount || 0, req.params.appealId);
  res.json({ message: 'Appeal updated' });
});

// Delete appeal
router.delete('/:appealId', (req, res) => {
  db.prepare('DELETE FROM appeals WHERE appeal_id = ?').run(req.params.appealId);
  res.json({ message: 'Appeal deleted' });
});

// Appeal summary stats
router.get('/stats/summary', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM appeals').get().c;
  const pending = db.prepare("SELECT COUNT(*) as c FROM appeals WHERE status = 'pending'").get().c;
  const submitted = db.prepare("SELECT COUNT(*) as c FROM appeals WHERE status = 'submitted'").get().c;
  const approved = db.prepare("SELECT COUNT(*) as c FROM appeals WHERE status = 'approved'").get().c;
  const denied = db.prepare("SELECT COUNT(*) as c FROM appeals WHERE status = 'denied'").get().c;
  const totalAmount = db.prepare('SELECT COALESCE(SUM(appeal_amount), 0) as t FROM appeals').get().t;
  const approvedAmount = db.prepare("SELECT COALESCE(SUM(approved_amount), 0) as t FROM appeals WHERE status = 'approved'").get().t;
  res.json({ total, pending, submitted, approved, denied, totalAmount, approvedAmount });
});

module.exports = router;
