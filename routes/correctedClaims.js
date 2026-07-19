const express = require('express');
const router = express.Router();
const db = require('../db');

// Submit corrected claim
router.post('/submit', (req, res) => {
  const { charge_id, patient_id, cpt_code, charge_amount, units,
          icd_codes, modifier1, modifier2, modifier3, modifier4, notes } = req.body;

  if (!charge_id || !cpt_code) return res.status(400).json({ error: 'charge_id and cpt_code required' });

  const charge = db.prepare('SELECT * FROM charges WHERE charge_id = ?').get(charge_id);
  if (!charge) return res.status(404).json({ error: 'Charge not found: ' + charge_id });

  const existingLines = db.prepare('SELECT * FROM charge_line_items WHERE charge_id = ?').all(charge_id);
  if (existingLines.length > 0) {
    const firstLine = existingLines[0];
    db.prepare(`
      UPDATE charge_line_items SET
        cpt_code = ?, charge_amount = ?, units = ?,
        icd_codes = ?, modifier1 = ?, modifier2 = ?, modifier3 = ?, modifier4 = ?
      WHERE id = ?
    `).run(cpt_code, charge_amount, units || 1,
           icd_codes || firstLine.icd_codes || '', modifier1 || '', modifier2 || '', modifier3 || '', modifier4 || '',
           firstLine.id);

    for (let i = 1; i < existingLines.length; i++) {
      db.prepare(`
        UPDATE charge_line_items SET
          icd_codes = ?, modifier1 = ?, modifier2 = ?, modifier3 = ?, modifier4 = ?
        WHERE id = ?
      `).run(icd_codes || firstLine.icd_codes || '', modifier1 || '', modifier2 || '', modifier3 || '', modifier4 || '',
             existingLines[i].id);
    }
  }

  const total = db.prepare('SELECT SUM(charge_amount * units) as total FROM charge_line_items WHERE charge_id = ?').get(charge_id);
  const newTotal = total?.total || charge_amount * (units || 1);
  db.prepare("UPDATE charges SET total_charges = ?, status = 'corrected' WHERE charge_id = ?")
    .run(newTotal, charge_id);

  const rejId = 'REJ' + String(Date.now()).slice(-6);
  db.prepare(`
    INSERT INTO rejections (rejection_id, claim_id, charge_id, patient_id, provider_id, insurance_id,
      rejection_code, rejection_reason, status, resolution_notes)
    VALUES (?, ?, ?, ?, ?, ?, 'CORRECTED', ?, 'corrected', ?)
  `).run(rejId, charge_id, charge_id, patient_id || charge.patient_id,
         charge.provider_id, charge.insurance_id,
         notes || 'Corrected claim resubmitted',
         'CPT changed to ' + cpt_code + ', Amount: $' + (charge_amount * (units || 1)).toFixed(2));

  res.json({
    message: 'Corrected claim submitted',
    charge_id: charge_id,
    new_total: newTotal,
    rejection_id: rejId,
    status: 'corrected'
  });
});

module.exports = router;
