const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = file.mimetype.startsWith('image') ? 'uploads/images' : 'uploads/documents';
    cb(null, path.join(__dirname, '..', dir));
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Get all charges
router.get('/', (req, res) => {
  const { patient_id, status } = req.query;
  let query = `
    SELECT c.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn,
           pr.first_name || ' ' || pr.last_name as provider_name
    FROM charges c
    LEFT JOIN patients p ON c.patient_id = p.patient_id
    LEFT JOIN providers pr ON c.provider_id = pr.provider_id
    WHERE 1=1
  `;
  const params = [];
  if (patient_id) { query += ' AND c.patient_id = ?'; params.push(patient_id); }
  if (status) { query += ' AND c.status = ?'; params.push(status); }
  query += ' ORDER BY c.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// Get charge details
router.get('/:chargeId', (req, res) => {
  const charge = db.prepare(`
    SELECT c.*, p.first_name, p.last_name, p.dob, p.ssn, p.phone, p.address, p.mrn, p.patient_id,
           pr.first_name as prov_first, pr.last_name as prov_last, pr.npi, pr.taxonomy_code, pr.specialization,
           i.payer_name, i.member_id, i.group_number, i.plan_name, i.copay, i.deductible, i.coinsurance
    FROM charges c
    LEFT JOIN patients p ON c.patient_id = p.patient_id
    LEFT JOIN providers pr ON c.provider_id = pr.provider_id
    LEFT JOIN insurances i ON c.insurance_id = i.id
    WHERE c.charge_id = ?
  `).get(req.params.chargeId);
  if (!charge) return res.status(404).json({ error: 'Not found' });

  const lineItems = db.prepare('SELECT * FROM charge_line_items WHERE charge_id = ?').all(req.params.chargeId);
  const attachments = db.prepare('SELECT * FROM charge_attachments WHERE charge_id = ?').all(req.params.chargeId);
  const insurances = db.prepare('SELECT * FROM insurances WHERE patient_id = ?').all(charge.patient_id);
  const secondaryIns = charge.secondary_insurance_id ? db.prepare('SELECT * FROM insurances WHERE id = ?').get(charge.secondary_insurance_id) : null;
  const tertiaryIns = charge.tertiary_insurance_id ? db.prepare('SELECT * FROM insurances WHERE id = ?').get(charge.tertiary_insurance_id) : null;
  const today = new Date().toISOString().slice(0, 10);
  for (const ins of insurances) {
    const elig = db.prepare('SELECT * FROM eligibility_master WHERE insurance_id = ? OR member_id = ? ORDER BY id DESC LIMIT 1').get(ins.id, ins.member_id);
    if (elig) {
      if (elig.status === 'active' && elig.termination_date && elig.termination_date < today) {
        ins.eligibility_status = 'expired';
      } else if (elig.effective_date && elig.effective_date > today) {
        ins.eligibility_status = 'pending';
      } else {
        ins.eligibility_status = elig.status || 'active';
      }
    } else { ins.eligibility_status = null; }
    ins.effective_status = (ins.eligibility_status === 'expired') ? 'expired' : (ins.eligibility_status === 'pending') ? 'pending' : (ins.status || 'active');
  }

  res.json({ ...charge, line_items: lineItems, attachments, insurances, secondary_insurance: secondaryIns, tertiary_insurance: tertiaryIns });
});

// Check eligibility before charge
router.get('/check-eligibility/:patientId/:insuranceId', (req, res) => {
  const { patientId, insuranceId } = req.params;
  const today = new Date().toISOString().slice(0, 10);
  const ins = db.prepare('SELECT * FROM insurances WHERE id = ?').get(insuranceId);
  let elig = db.prepare('SELECT * FROM eligibility_master WHERE insurance_id = ? OR member_id = ? ORDER BY id DESC LIMIT 1').get(insuranceId, ins ? ins.member_id : '');
  if (!elig) elig = db.prepare('SELECT * FROM eligibility_master WHERE patient_id = ? AND insurance_id = ? ORDER BY id DESC LIMIT 1').get(patientId, insuranceId);
  const benefits = db.prepare('SELECT * FROM eligibility_benefits WHERE eligibility_id = ?').all(elig?.id);

  let status = 'inactive';
  let message = 'No eligibility found';

  if (elig) {
    if (elig.status === 'active' && elig.termination_date && elig.termination_date < today) {
      status = 'expired';
      message = 'Eligibility expired on ' + elig.termination_date;
      db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(elig.id);
    } else if (elig.effective_date && elig.effective_date > today) {
      status = 'pending';
      message = 'Eligibility not yet effective. Starts: ' + elig.effective_date;
    } else if (elig.status === 'active') {
      status = 'active';
      message = 'Eligibility is active';
    } else {
      status = elig.status;
      message = 'Eligibility status: ' + elig.status;
    }
  }

  res.json({ status, message, eligibility: elig || null, insurance: ins || null, benefits: benefits || [] });
});

// Create charge
router.post('/', (req, res) => {
  const chargeId = 'CHG' + String(Date.now()).slice(-6);
  const { patient_id, provider_id, charge_date, insurance_id, secondary_insurance_id, tertiary_insurance_id, insurance_type, line_items,
    msp_code, msp_qualifying_person_name, msp_qualifying_person_dob, msp_coverage_start,
    date_of_injury, place_of_accident, accident_type,
    employer_name, employer_address, employer_phone,
    workers_comp_claim, workers_comp_carrier, auto_claim_number, auto_insurance_carrier,
    eligibility_status, eligibility_checked_at,
    auth_number, auth_from_date, auth_to_date } = req.body;

  let totalCharges = 0;
  if (line_items) {
    totalCharges = line_items.reduce((sum, li) => sum + (li.charge_amount * (li.units || 1)), 0);
  }

  db.prepare(`
    INSERT INTO charges (charge_id, patient_id, provider_id, charge_date, insurance_id, secondary_insurance_id, tertiary_insurance_id, insurance_type, total_charges,
      msp_code, msp_qualifying_person_name, msp_qualifying_person_dob, msp_coverage_start,
      date_of_injury, place_of_accident, accident_type,
      employer_name, employer_address, employer_phone,
      workers_comp_claim, workers_comp_carrier, auto_claim_number, auto_insurance_carrier,
      eligibility_status, eligibility_checked_at,
      auth_number, auth_from_date, auth_to_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(chargeId, patient_id, provider_id, charge_date, insurance_id || null, secondary_insurance_id || null, tertiary_insurance_id || null, insurance_type || null, totalCharges,
    msp_code || null, msp_qualifying_person_name || null, msp_qualifying_person_dob || null, msp_coverage_start || null,
    date_of_injury || null, place_of_accident || null, accident_type || null,
    employer_name || null, employer_address || null, employer_phone || null,
    workers_comp_claim || null, workers_comp_carrier || null, auto_claim_number || null, auto_insurance_carrier || null,
    eligibility_status || null, eligibility_checked_at || null,
    auth_number || null, auth_from_date || null, auth_to_date || null);

  if (line_items) {
    const insertLine = db.prepare(`
      INSERT INTO charge_line_items (charge_id, line_number, service_date, icd_codes, cpt_code, modifier1, modifier2, modifier3, modifier4, pointer1, pointer2, pointer3, units, charge_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    line_items.forEach((li, idx) => {
      insertLine.run(chargeId, idx + 1, li.service_date || null, li.icd_codes || null, li.cpt_code || null, li.modifier1 || null, li.modifier2 || null, li.modifier3 || null, li.modifier4 || null, li.pointer1 || null, li.pointer2 || null, li.pointer3 || null, li.units || 1, li.charge_amount || 0);
    });
  }

  res.json({ charge_id: chargeId, total_charges: totalCharges, message: 'Charge created' });
});

// Add line item to charge
router.post('/:chargeId/line-item', (req, res) => {
  const maxLine = db.prepare('SELECT MAX(line_number) as max_line FROM charge_line_items WHERE charge_id = ?').get(req.params.chargeId);
  const lineNum = (maxLine?.max_line || 0) + 1;
  const { service_date, icd_codes, cpt_code, modifier1, modifier2, modifier3, modifier4, pointer1, pointer2, pointer3, units, charge_amount } = req.body;

  db.prepare(`
    INSERT INTO charge_line_items (charge_id, line_number, service_date, icd_codes, cpt_code, modifier1, modifier2, modifier3, modifier4, pointer1, pointer2, pointer3, units, charge_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.chargeId, lineNum, service_date || null, icd_codes || null, cpt_code || null, modifier1 || null, modifier2 || null, modifier3 || null, modifier4 || null, pointer1 || null, pointer2 || null, pointer3 || null, units || 1, charge_amount || 0);

  // Recalculate total
  const total = db.prepare('SELECT SUM(charge_amount * units) as total FROM charge_line_items WHERE charge_id = ?').get(req.params.chargeId);
  db.prepare('UPDATE charges SET total_charges = ? WHERE charge_id = ?').run(total?.total || 0, req.params.chargeId);

  res.json({ line_number: lineNum, message: 'Line item added' });
});

// Update charge status
router.put('/:chargeId', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE charges SET status = ? WHERE charge_id = ?').run(status, req.params.chargeId);
  res.json({ message: 'Charge updated' });
});

// Upload image/document
router.post('/:chargeId/upload', upload.array('files', 10), (req, res) => {
  const insertAttachment = db.prepare(`
    INSERT INTO charge_attachments (charge_id, file_name, file_path, file_type, file_size, attachment_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const file of req.files) {
    const type = file.mimetype.startsWith('image') ? 'image' : 'document';
    insertAttachment.run(req.params.chargeId, file.originalname, file.path, file.mimetype, file.size, type);
  }
  res.json({ message: 'Files uploaded', count: req.files.length });
});

// Get attachments
router.get('/:chargeId/attachments', (req, res) => {
  const attachments = db.prepare('SELECT * FROM charge_attachments WHERE charge_id = ? AND status = ?').all(req.params.chargeId, 'active');
  res.json(attachments);
});

// Download attachment
router.get('/attachment/:attachmentId/download', (req, res) => {
  const att = db.prepare('SELECT * FROM charge_attachments WHERE id = ?').get(req.params.attachmentId);
  if (!att) return res.status(404).json({ error: 'Not found' });
  res.download(att.file_path, att.file_name);
});

// View attachment
router.get('/attachment/:attachmentId/view', (req, res) => {
  const att = db.prepare('SELECT * FROM charge_attachments WHERE id = ?').get(req.params.attachmentId);
  if (!att) return res.status(404).json({ error: 'Not found' });
  res.sendFile(att.file_path);
});

// Reject attachment
router.put('/attachment/:attachmentId/reject', (req, res) => {
  db.prepare("UPDATE charge_attachments SET status = 'rejected' WHERE id = ?").run(req.params.attachmentId);
  res.json({ message: 'Attachment rejected' });
});

// Delete attachment
router.delete('/attachment/:attachmentId', (req, res) => {
  const att = db.prepare('SELECT * FROM charge_attachments WHERE id = ?').get(req.params.attachmentId);
  if (att && fs.existsSync(att.file_path)) fs.unlinkSync(att.file_path);
  db.prepare('DELETE FROM charge_attachments WHERE id = ?').run(req.params.attachmentId);
  res.json({ message: 'Attachment deleted' });
});

// Delete charge
router.delete('/:chargeId', (req, res) => {
  db.prepare('DELETE FROM charge_line_items WHERE charge_id = ?').run(req.params.chargeId);
  db.prepare('DELETE FROM charge_attachments WHERE charge_id = ?').run(req.params.chargeId);
  db.prepare('DELETE FROM charges WHERE charge_id = ?').run(req.params.chargeId);
  res.json({ message: 'Charge deleted' });
});

module.exports = router;
