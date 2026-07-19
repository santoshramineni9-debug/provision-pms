const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/adjudication/queue - list all charges with status 'submitted', joined with patients and providers, including line items
router.get('/queue', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const charges = db.prepare(`
    SELECT c.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn, p.dob, p.ssn, p.phone, p.address, p.city, p.state, p.zip,
           pr.first_name || ' ' || pr.last_name as provider_name, pr.npi, pr.taxonomy_code, pr.specialization
    FROM charges c
    LEFT JOIN patients p ON c.patient_id = p.patient_id
    LEFT JOIN providers pr ON c.provider_id = pr.provider_id
    WHERE c.status = 'submitted'
    ORDER BY c.created_at ASC
  `).all();

  const result = charges.map(charge => {
    const lineItems = db.prepare('SELECT * FROM charge_line_items WHERE charge_id = ?').all(charge.charge_id);
    let eligibility_status = charge.eligibility_status || 'unknown';
    if (charge.insurance_id) {
      const elig = db.prepare('SELECT * FROM eligibility_master WHERE patient_id = ? AND insurance_id = ? ORDER BY id DESC LIMIT 1').get(charge.patient_id, charge.insurance_id);
      if (elig) {
        if (elig.termination_date && elig.termination_date < today) {
          eligibility_status = 'expired';
          db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(elig.id);
        } else if (elig.effective_date && elig.effective_date > today) {
          eligibility_status = 'pending';
        } else {
          eligibility_status = elig.status || 'active';
        }
      } else {
        eligibility_status = 'not_found';
      }
    }
    return { ...charge, eligibility_status, line_items: lineItems };
  });

  res.json(result);
});

// POST /api/adjudication - adjudicate a claim
router.post('/', (req, res) => {
  const { claim_id, paid_amount, allowed_amount, deductible, coinsurance, copay, patient_responsibility, decision, denial_code, notes } = req.body;

  if (!claim_id || !decision) {
    return res.status(400).json({ error: 'claim_id and decision are required' });
  }

  const charge = db.prepare('SELECT * FROM charges WHERE charge_id = ?').get(claim_id);
  if (!charge) {
    return res.status(404).json({ error: 'Claim not found' });
  }

  const updateFields = [];
  const updateParams = [];

  if (paid_amount !== undefined) { updateFields.push('total_paid = ?'); updateParams.push(Number(paid_amount)); }
  if (allowed_amount !== undefined) { updateFields.push('total_allowed = ?'); updateParams.push(Number(allowed_amount)); }
  if (patient_responsibility !== undefined) { updateFields.push('total_patient_responsibility = ?'); updateParams.push(Number(patient_responsibility)); }

  let newStatus;
  if (decision === 'paid') newStatus = 'paid';
  else if (decision === 'partial') newStatus = 'partial';
  else if (decision === 'denied') newStatus = 'denied';
  else if (decision === 'rejected') newStatus = 'rejected';
  else return res.status(400).json({ error: 'Invalid decision. Must be paid/partial/denied/rejected' });

  updateFields.push('status = ?');
  updateParams.push(newStatus);
  updateParams.push(claim_id);

  db.prepare(`UPDATE charges SET ${updateFields.join(', ')} WHERE charge_id = ?`).run(...updateParams);

  // If rejected, create rejection record
  if (decision === 'rejected') {
    const rejectionId = 'REJ' + String(Date.now()).slice(-6);
    db.prepare(`
      INSERT INTO rejections (rejection_id, claim_id, charge_id, patient_id, provider_id, insurance_id, rejection_code, rejection_reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')
    `).run(rejectionId, claim_id, claim_id, charge.patient_id, charge.provider_id, charge.insurance_id, denial_code || '', notes || '');
  }

  res.json({
    charge_id: claim_id,
    status: newStatus,
    paid_amount: Number(paid_amount) || 0,
    allowed_amount: Number(allowed_amount) || 0,
    patient_responsibility: Number(patient_responsibility) || 0,
    message: `Claim ${newStatus}`
  });
});

// GET /api/adjudication/:chargeId/lines - get all line items for a charge with their individual amounts
router.get('/:chargeId/lines', (req, res) => {
  const charge = db.prepare('SELECT * FROM charges WHERE charge_id = ?').get(req.params.chargeId);
  if (!charge) return res.status(404).json({ error: 'Charge not found' });

  const lineItems = db.prepare('SELECT * FROM charge_line_items WHERE charge_id = ?').all(req.params.chargeId);
  res.json(lineItems);
});

module.exports = router;
