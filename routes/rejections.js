const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all rejections
router.get('/', (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT r.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn,
           c.total_charges, c.total_paid, i.payer_name
    FROM rejections r
    LEFT JOIN patients p ON r.patient_id = p.patient_id
    LEFT JOIN charges c ON r.charge_id = c.charge_id
    LEFT JOIN insurances i ON r.insurance_id = i.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { query += ' AND r.status = ?'; params.push(status); }
  query += ' ORDER BY r.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// Get rejection details
router.get('/:rejectionId', (req, res) => {
  const rej = db.prepare(`
    SELECT r.*, p.first_name, p.last_name, p.mrn, p.dob, p.ssn, p.phone, p.address, p.city, p.state, p.zip,
           pr.first_name as prov_first, pr.last_name as prov_last, pr.npi, pr.taxonomy_code, pr.specialization, pr.phone as prov_phone,
           i.payer_name, i.member_id, i.group_number, i.plan_name, i.copay, i.deductible, i.coinsurance,
           c.charge_date, c.total_charges, c.status as charge_status
    FROM rejections r
    LEFT JOIN patients p ON r.patient_id = p.patient_id
    LEFT JOIN charges c ON r.charge_id = c.charge_id
    LEFT JOIN providers pr ON r.provider_id = pr.provider_id
    LEFT JOIN insurances i ON r.insurance_id = i.id
    WHERE r.rejection_id = ?
  `).get(req.params.rejectionId);
  if (!rej) return res.status(404).json({ error: 'Not found' });
  const lineItems = db.prepare('SELECT * FROM charge_line_items WHERE charge_id = ?').all(rej.charge_id);
  res.json({ ...rej, line_items: lineItems });
});

// Create rejection from charge
router.post('/create', (req, res) => {
  const rejId = 'REJ' + String(Date.now()).slice(-6);
  const { charge_id, rejection_code, rejection_reason, patient_id, provider_id, insurance_id } = req.body;

  let pid = patient_id, provId = provider_id, insId = insurance_id;
  if (charge_id) {
    const charge = db.prepare('SELECT * FROM charges WHERE charge_id = ?').get(charge_id);
    if (charge) {
      pid = pid || charge.patient_id;
      provId = provId || charge.provider_id;
      insId = insId || charge.insurance_id;
    }
  }

  db.prepare(`
    INSERT INTO rejections (rejection_id, claim_id, charge_id, patient_id, provider_id, insurance_id, rejection_code, rejection_reason, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')
  `).run(rejId, charge_id || '', charge_id || '', pid, provId, insId, rejection_code || '', rejection_reason || '');

  if (charge_id) {
    db.prepare("UPDATE charges SET status = 'denied' WHERE charge_id = ?").run(charge_id);
  }

  res.json({ rejection_id: rejId, message: 'Rejection created' });
});

// Process rejection action
router.post('/:rejectionId/action', (req, res) => {
  const { action, notes, new_procedure_code, new_icd_codes, new_cpt_codes, new_charge_amount } = req.body;
  const rej = db.prepare('SELECT * FROM rejections WHERE rejection_id = ?').get(req.params.rejectionId);
  if (!rej) return res.status(404).json({ error: 'Not found' });

  const newStatus = action === 'investigating' ? 'investigating' : action === 'corrected' ? 'corrected' : action === 'escalated' ? 'escalated' : action === 'closed' ? 'closed' : action;
  db.prepare('UPDATE rejections SET status = ?, resolution_notes = ? WHERE rejection_id = ?').run(newStatus, notes || '', req.params.rejectionId);

  if (action === 'corrected' || action === 'resubmitted') {
    if (rej.charge_id) {
      const updates = [];
      const params = [];
      if (new_procedure_code) { updates.push('procedure_code = ?'); params.push(new_procedure_code); }
      if (new_icd_codes) { updates.push('icd_codes = ?'); params.push(new_icd_codes); }
      if (new_cpt_codes) { updates.push('cpt_code = ?'); params.push(new_cpt_codes); }
      if (updates.length) {
        params.push(rej.charge_id);
        db.prepare('UPDATE charge_line_items SET ' + updates.join(', ') + ' WHERE charge_id = ?').run(...params);
      }
      if (new_charge_amount) {
        db.prepare('UPDATE charge_line_items SET charge_amount = ? WHERE charge_id = ?').run(parseFloat(new_charge_amount), rej.charge_id);
        const total = db.prepare('SELECT SUM(charge_amount * units) as total FROM charge_line_items WHERE charge_id = ?').get(rej.charge_id);
        db.prepare('UPDATE charges SET total_charges = ? WHERE charge_id = ?').run(total?.total || 0, rej.charge_id);
      }
      db.prepare("UPDATE charges SET status = 'pending' WHERE charge_id = ?").run(rej.charge_id);
    }
  }

  if (action === 'resubmitted' && rej.charge_id) {
    db.prepare("UPDATE charges SET status = 'submitted' WHERE charge_id = ?").run(rej.charge_id);
  }

  const newRejId = action === 'corrected' ? 'REJ' + String(Date.now()).slice(-6) : null;
  res.json({ new_status: newStatus, new_claim_id: newRejId, message: 'Action processed' });
});

module.exports = router;
