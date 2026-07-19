const express = require('express');
const router = express.Router();
const db = require('../db');
const { v4: uuidv4 } = require('uuid');

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
  
  // Auto-expire eligibility based on termination_date
  const eligibilities = db.prepare('SELECT * FROM eligibility_master WHERE patient_id = ?').all(pid);
  const eligibility_summary = [];
  for (const e of eligibilities) {
    let status = e.status;
    if (e.status === 'active' && e.termination_date && e.termination_date < today) {
      db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(e.id);
      status = 'expired';
    } else if (e.effective_date && e.effective_date > today) {
      status = 'pending';
    }
    eligibility_summary.push({ ...e, computed_status: status });
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

  const insurances = db.prepare('SELECT * FROM insurances WHERE patient_id = ?').all(req.params.patientId);
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
