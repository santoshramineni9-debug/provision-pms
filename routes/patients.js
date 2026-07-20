const express = require('express');
const router = express.Router();
const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const cardStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, 'card_' + Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
});
const upload = multer({ storage: cardStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// Search patients by MRN, patient_id, or SSN
router.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const patients = db.prepare(`
    SELECT * FROM patients 
    WHERE patient_id LIKE ? OR mrn LIKE ? OR ssn LIKE ? OR first_name LIKE ? OR last_name LIKE ?
    OR (first_name || ' ' || last_name) LIKE ?
  `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  res.json(patients);
});

// Get all patients
router.get('/', (req, res) => {
  const patients = db.prepare('SELECT * FROM patients ORDER BY created_at DESC').all();
  res.json(patients);
});

// Patient 360 - full view
router.get('/:patientId/360', (req, res) => {
  const pid = req.params.patientId;
  const today = new Date().toISOString().slice(0, 10);
  const patient = db.prepare('SELECT * FROM patients WHERE patient_id = ?').get(pid);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const insurances = db.prepare('SELECT * FROM insurances WHERE patient_id = ?').all(pid);
  
  // Auto-expire eligibility based on termination_date — search by patient_id OR member_id
  let eligibilities = db.prepare('SELECT * FROM eligibility_master WHERE patient_id = ?').all(pid);
  // Also find eligibility by member_id from insurances (covers payer-created records)
  for (const ins of insurances) {
    if (ins.member_id) {
      const extra = db.prepare('SELECT * FROM eligibility_master WHERE member_id = ? AND patient_id != ? ORDER BY id DESC').all(ins.member_id, pid);
      for (const e of extra) {
        if (!eligibilities.find(x => x.member_id === e.member_id)) eligibilities.push(e);
      }
    }
  }
  const eligibility_summary = [];
  const seenMemberIds = new Set();
  for (const e of eligibilities) {
    if (seenMemberIds.has(e.member_id)) continue;
    seenMemberIds.add(e.member_id);
    let status = e.status;
    if (e.status === 'active' && e.termination_date && e.termination_date < today) {
      db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(e.id);
      status = 'expired';
    } else if (e.effective_date && e.effective_date > today) {
      status = 'pending';
    }
    eligibility_summary.push({ ...e, computed_status: status });
  }

  // Also auto-expire insurance records based on their termination_date + attach eligibility status
  for (const ins of insurances) {
    if (ins.status === 'active' && ins.termination_date && ins.termination_date < today) {
      db.prepare("UPDATE insurances SET status = 'expired' WHERE id = ?").run(ins.id);
      ins.status = 'expired';
    }
    const elig = db.prepare('SELECT * FROM eligibility_master WHERE insurance_id = ? OR member_id = ? ORDER BY id DESC LIMIT 1').get(ins.id, ins.member_id);
    if (elig) {
      if (elig.status === 'active' && elig.termination_date && elig.termination_date < today) {
        ins.eligibility_status = 'expired';
        db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(elig.id);
      } else if (elig.effective_date && elig.effective_date > today) {
        ins.eligibility_status = 'pending';
      } else {
        ins.eligibility_status = elig.status || 'active';
      }
    } else {
      ins.eligibility_status = null;
    }
    ins.effective_status = (ins.eligibility_status === 'expired') ? 'expired' : (ins.eligibility_status === 'pending') ? 'pending' : (ins.status || 'active');
  }

  const dependents = db.prepare('SELECT * FROM dependents WHERE guarantor_patient_id = ?').all(pid);
  const appointments = db.prepare('SELECT * FROM appointments WHERE patient_id = ? ORDER BY appointment_date DESC LIMIT 20').all(pid);
  const charges = db.prepare('SELECT * FROM charges WHERE patient_id = ? ORDER BY created_at DESC LIMIT 20').all(pid);
  const payments = db.prepare('SELECT * FROM payments WHERE patient_id = ? ORDER BY created_at DESC LIMIT 20').all(pid);
  const authorizations = db.prepare('SELECT * FROM authorizations WHERE patient_id = ? ORDER BY created_at DESC LIMIT 20').all(pid);
  const arCalls = db.prepare('SELECT * FROM ar_calls WHERE patient_id = ? ORDER BY created_at DESC LIMIT 20').all(pid);
  const rejections = db.prepare('SELECT * FROM rejections WHERE patient_id = ? ORDER BY created_at DESC LIMIT 20').all(pid);
  const offsets = db.prepare('SELECT * FROM offset_reconciliation WHERE patient_id = ? ORDER BY created_at DESC LIMIT 20').all(pid);
  const medicalRecords = db.prepare('SELECT * FROM medical_records WHERE patient_id = ? ORDER BY created_at DESC LIMIT 20').all(pid);

  // compute totals
  const totalCharges = charges.reduce((s, c) => s + (c.total_amount || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const totalOffset = offsets.reduce((s, o) => s + (o.offset_amount || 0), 0);
  const totalBalance = totalCharges - totalPaid - totalOffset;
  const activeAuths = authorizations.filter(a => a.status === 'active' || a.status === 'approved').length;
  const openRejections = rejections.filter(r => r.status !== 'closed').length;

  res.json({
    patient, insurances, dependents, eligibility_summary, appointments, charges, payments,
    authorizations, arCalls, rejections, offsets, medicalRecords,
    summary: { totalCharges, totalPaid, totalOffset, totalBalance, activeAuths, openRejections,
      totalAppointments: appointments.length, totalChargesCount: charges.length, totalPaymentsCount: payments.length }
  });
});

// Get patient by ID
router.get('/:patientId', (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE patient_id = ?').get(req.params.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const today = new Date().toISOString().slice(0, 10);
  const insurances = db.prepare('SELECT * FROM insurances WHERE patient_id = ?').all(req.params.patientId);

  // Attach eligibility status to each insurance
  for (const ins of insurances) {
    if (ins.status === 'active' && ins.termination_date && ins.termination_date < today) {
      db.prepare("UPDATE insurances SET status = 'expired' WHERE id = ?").run(ins.id);
      ins.status = 'expired';
    }
    const elig = db.prepare('SELECT * FROM eligibility_master WHERE insurance_id = ? OR member_id = ? ORDER BY id DESC LIMIT 1').get(ins.id, ins.member_id);
    if (elig) {
      if (elig.status === 'active' && elig.termination_date && elig.termination_date < today) {
        ins.eligibility_status = 'expired';
        ins.eligibility_term_date = elig.termination_date;
        db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(elig.id);
      } else if (elig.effective_date && elig.effective_date > today) {
        ins.eligibility_status = 'pending';
      } else {
        ins.eligibility_status = elig.status || 'active';
      }
    } else {
      ins.eligibility_status = null;
    }
    ins.effective_status = (ins.eligibility_status === 'expired') ? 'expired' : (ins.eligibility_status === 'pending') ? 'pending' : (ins.status || 'active');
  }

  const dependents = db.prepare('SELECT * FROM dependents WHERE guarantor_patient_id = ?').all(req.params.patientId);
  res.json({ ...patient, insurances, dependents });
});

// Create patient
router.post('/', (req, res) => {
  const patientId = 'PAT' + String(Date.now()).slice(-6);
  const mrn = 'MRN' + String(Date.now()).slice(-5).padStart(5, '0');

  db.prepare(`
    INSERT INTO patients (patient_id, mrn, first_name, last_name, dob, gender, ssn, phone, email, address, city, state, zip, guarantor, guarantor_phone, guarantor_relation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(patientId, mrn, req.body.first_name, req.body.last_name, req.body.dob, req.body.gender,
    req.body.ssn, req.body.phone, req.body.email, req.body.address, req.body.city,
    req.body.state, req.body.zip, req.body.guarantor, req.body.guarantor_phone, req.body.guarantor_relation);

  res.json({ patient_id: patientId, mrn, message: 'Patient created' });
});

// Update patient
router.put('/:patientId', (req, res) => {
  const { first_name, last_name, dob, gender, ssn, phone, email, address, city, state, zip, guarantor, guarantor_phone, guarantor_relation } = req.body;
  db.prepare(`
    UPDATE patients SET first_name=?, last_name=?, dob=?, gender=?, ssn=?, phone=?, email=?, address=?, city=?, state=?, zip=?, guarantor=?, guarantor_phone=?, guarantor_relation=?, updated_at=datetime('now')
    WHERE patient_id=?
  `).run(first_name, last_name, dob, gender, ssn, phone, email, address, city, state, zip, guarantor, guarantor_phone, guarantor_relation, req.params.patientId);
  res.json({ message: 'Patient updated' });
});

// Delete patient
router.delete('/:patientId', (req, res) => {
  db.prepare('DELETE FROM patients WHERE patient_id = ?').run(req.params.patientId);
  res.json({ message: 'Patient deleted' });
});

// Add insurance to patient
router.post('/:patientId/insurance', (req, res) => {
  const { payer_name, insurance_type, member_id, group_number, plan_name, copay, deductible, coinsurance, effective_date, termination_date, subscriber_name, subscriber_dob, relationship, status } = req.body;
  db.prepare(`
    INSERT INTO insurances (patient_id, payer_name, insurance_type, member_id, group_number, plan_name, copay, deductible, coinsurance, effective_date, termination_date, subscriber_name, subscriber_dob, relationship, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.patientId, payer_name, insurance_type || 'primary', member_id, group_number || '-', plan_name || '', copay || 0, deductible || 0, coinsurance || 0, effective_date || null, termination_date || null, subscriber_name || '', subscriber_dob || '', relationship || 'self', status || 'active');
  res.json({ message: 'Insurance added' });
});

// Update insurance
router.put('/:patientId/insurance/:insuranceId', (req, res) => {
  const { payer_name, insurance_type, member_id, group_number, plan_name, copay, deductible, coinsurance, effective_date, termination_date, subscriber_name, subscriber_dob, relationship, status } = req.body;
  db.prepare(`
    UPDATE insurances SET payer_name=?, insurance_type=?, member_id=?, group_number=?, plan_name=?, copay=?, deductible=?, coinsurance=?, effective_date=?, termination_date=?, subscriber_name=?, subscriber_dob=?, relationship=?, status=?
    WHERE id=? AND patient_id=?
  `).run(payer_name, insurance_type, member_id, group_number || '-', plan_name || '', copay || 0, deductible || 0, coinsurance || 0, effective_date || null, termination_date || null, subscriber_name || '', subscriber_dob || '', relationship || 'self', status || 'active', req.params.insuranceId, req.params.patientId);
  res.json({ message: 'Insurance updated' });
});

// Delete insurance
router.delete('/:patientId/insurance/:insuranceId', (req, res) => {
  db.prepare('DELETE FROM insurances WHERE id=? AND patient_id=?').run(req.params.insuranceId, req.params.patientId);
  res.json({ message: 'Insurance deleted' });
});

// Lookup insurance card by Member ID (payer-created cards)
router.get('/insurance/lookup/:memberId', (req, res) => {
  const ins = db.prepare('SELECT * FROM insurances WHERE member_id = ? ORDER BY id DESC').all(req.params.memberId);
  if (!ins.length) return res.json({ found: false, message: 'No insurance card found for Member ID: ' + req.params.memberId });
  const today = new Date().toISOString().slice(0, 10);
  const enriched = ins.map(i => {
    const elig = db.prepare('SELECT * FROM eligibility_master WHERE insurance_id = ? OR member_id = ? ORDER BY id DESC').all(i.id, i.member_id);
    let eligibility_status = null;
    if (elig.length) {
      const e = elig[0];
      if (e.status === 'active' && e.termination_date && e.termination_date < today) eligibility_status = 'expired';
      else if (e.effective_date && e.effective_date > today) eligibility_status = 'pending';
      else eligibility_status = e.status || 'active';
    }
    i.eligibility_status = eligibility_status;
    i.effective_status = (eligibility_status === 'expired') ? 'expired' : (eligibility_status === 'pending') ? 'pending' : (i.status || 'active');
    return i;
  });
  res.json({ found: true, insurances: enriched });
});

// Link payer-created insurance card to patient
router.post('/:patientId/insurance/link', (req, res) => {
  const { insurance_id, insurance_type } = req.body;
  const ins = db.prepare('SELECT * FROM insurances WHERE id = ?').get(insurance_id);
  if (!ins) return res.status(404).json({ error: 'Insurance card not found' });
  if (ins.patient_id && ins.patient_id !== req.params.patientId) return res.status(400).json({ error: 'This insurance is already linked to patient: ' + ins.patient_id });
  const existingType = db.prepare('SELECT id FROM insurances WHERE patient_id = ? AND insurance_type = ?').get(req.params.patientId, insurance_type);
  if (existingType) return res.status(400).json({ error: 'Patient already has ' + insurance_type + ' insurance' });
  db.prepare('UPDATE insurances SET patient_id = ?, insurance_type = ? WHERE id = ?').run(req.params.patientId, insurance_type || 'primary', insurance_id);
  db.save();
  res.json({ message: 'Insurance linked to patient', insurance_id: insurance_id });
});

// Reorder insurance priority (swap types)
router.post('/:patientId/insurance/reorder', (req, res) => {
  const { insurance_id, direction } = req.body;
  const ins = db.prepare('SELECT * FROM insurances WHERE id = ? AND patient_id = ?').get(insurance_id, req.params.patientId);
  if (!ins) return res.status(404).json({ error: 'Insurance not found' });
  const typeOrder = ['primary', 'secondary', 'tertiary'];
  const currentIdx = typeOrder.indexOf(ins.insurance_type);
  const newIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
  if (newIdx < 0 || newIdx >= typeOrder.length) return res.status(400).json({ error: 'Cannot move further in that direction' });
  const newType = typeOrder[newIdx];
  const swapIns = db.prepare('SELECT * FROM insurances WHERE patient_id = ? AND insurance_type = ?').get(req.params.patientId, newType);
  if (swapIns) {
    db.prepare('UPDATE insurances SET insurance_type = ? WHERE id = ?').run(newType, ins.id);
    db.prepare('UPDATE insurances SET insurance_type = ? WHERE id = ?').run(ins.insurance_type, swapIns.id);
  } else {
    db.prepare('UPDATE insurances SET insurance_type = ? WHERE id = ?').run(newType, ins.id);
  }
  db.save();
  res.json({ message: 'Insurance reordered', from: ins.insurance_type, to: newType });
});

// Upload insurance card image
router.post('/:patientId/insurance/:insuranceId/card', upload.single('card'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const side = req.body.side || 'front';
  const col = side === 'back' ? 'card_image_back' : 'card_image_front';
  const filePath = '/uploads/' + req.file.filename;
  db.prepare(`UPDATE insurances SET ${col} = ? WHERE id = ? AND patient_id = ?`).run(filePath, req.params.insuranceId, req.params.patientId);
  res.json({ message: 'Card image uploaded', path: filePath });
});

// Get dependents for patient
router.get('/:patientId/dependents', (req, res) => {
  const deps = db.prepare('SELECT * FROM dependents WHERE guarantor_patient_id = ? ORDER BY created_at DESC').all(req.params.patientId);
  res.json(deps);
});

// Add dependent
router.post('/:patientId/dependents', (req, res) => {
  const depId = 'DEP' + String(Date.now()).slice(-6);
  const { first_name, last_name, dob, gender, relationship, ssn, phone, member_id, insurance_type } = req.body;
  db.prepare(`
    INSERT INTO dependents (dependent_id, guarantor_patient_id, first_name, last_name, dob, gender, relationship, ssn, phone, member_id, insurance_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(depId, req.params.patientId, first_name, last_name, dob || null, gender || null, relationship, ssn || null, phone || null, member_id || null, insurance_type || null);
  res.json({ dependent_id: depId, message: 'Dependent added' });
});

// Delete dependent
router.delete('/:patientId/dependents/:depId', (req, res) => {
  db.prepare('DELETE FROM dependents WHERE dependent_id = ? AND guarantor_patient_id = ?').run(req.params.depId, req.params.patientId);
  res.json({ message: 'Dependent deleted' });
});

module.exports = router;
