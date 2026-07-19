const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all appointments
router.get('/', (req, res) => {
  const { patient_id, date, status } = req.query;
  let query = `
    SELECT a.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn,
           pr.first_name || ' ' || pr.last_name as provider_name, pr.npi as provider_npi,
           i.payer_name, i.member_id as insurance_member_id
    FROM appointments a
    LEFT JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN providers pr ON a.provider_id = pr.provider_id
    LEFT JOIN insurances i ON a.insurance_id = i.id
    WHERE 1=1
  `;
  const params = [];
  if (patient_id) { query += ' AND a.patient_id = ?'; params.push(patient_id); }
  if (date) { query += ' AND a.appointment_date = ?'; params.push(date); }
  if (status) { query += ' AND a.status = ?'; params.push(status); }
  query += ' ORDER BY a.appointment_date DESC, a.appointment_time ASC';

  const appointments = db.prepare(query).all(...params);
  res.json(appointments);
});

// Get appointment by ID
router.get('/:appointmentId', (req, res) => {
  const apt = db.prepare(`
    SELECT a.*, p.first_name, p.last_name, p.dob, p.phone, p.ssn, p.address, p.city as p_city, p.state as p_state, p.zip as p_zip,
           p.guarantor, p.guarantor_phone, p.guarantor_relation,
           pr.first_name as prov_first, pr.last_name as prov_last, pr.npi as prov_npi, pr.taxonomy_code, pr.specialization,
           ref.first_name as ref_first, ref.last_name as ref_last, ref.npi as ref_npi,
           pcp.first_name as pcp_first, pcp.last_name as pcp_last, pcp.npi as pcp_npi,
           i.payer_name, i.member_id as ins_member_id, i.group_number, i.plan_name
    FROM appointments a
    LEFT JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN providers pr ON a.provider_id = pr.provider_id
    LEFT JOIN providers ref ON a.ref_provider_id = ref.provider_id
    LEFT JOIN providers pcp ON a.pcp_provider_id = pcp.provider_id
    LEFT JOIN insurances i ON a.insurance_id = i.id
    WHERE a.appointment_id = ?
  `).get(req.params.appointmentId);
  if (!apt) return res.status(404).json({ error: 'Not found' });
  res.json(apt);
});

// Create appointment
router.post('/', (req, res) => {
  const aptId = 'APT' + String(Date.now()).slice(-6);
  const { patient_id, provider_id, appointment_date, appointment_time, appointment_type, visit_type, reason, notes, ref_provider_id, pcp_provider_id, insurance_id } = req.body;

  db.prepare(`
    INSERT INTO appointments (appointment_id, patient_id, provider_id, appointment_date, appointment_time, appointment_type, visit_type, status, reason, notes, ref_provider_id, pcp_provider_id, insurance_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?)
  `).run(aptId, patient_id, provider_id, appointment_date, appointment_time, appointment_type, visit_type || 'office', reason, notes, ref_provider_id, pcp_provider_id, insurance_id);

  res.json({ appointment_id: aptId, message: 'Appointment created' });
});

// Update appointment
router.put('/:appointmentId', (req, res) => {
  const { status, appointment_date, appointment_time, notes, reason } = req.body;
  const updates = [];
  const params = [];
  if (status) { updates.push('status = ?'); params.push(status); }
  if (appointment_date) { updates.push('appointment_date = ?'); params.push(appointment_date); }
  if (appointment_time) { updates.push('appointment_time = ?'); params.push(appointment_time); }
  if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
  if (reason) { updates.push('reason = ?'); params.push(reason); }
  params.push(req.params.appointmentId);

  db.prepare(`UPDATE appointments SET ${updates.join(', ')} WHERE appointment_id = ?`).run(...params);
  res.json({ message: 'Appointment updated' });
});

// Delete appointment
router.delete('/:appointmentId', (req, res) => {
  db.prepare('DELETE FROM appointments WHERE appointment_id = ?').run(req.params.appointmentId);
  res.json({ message: 'Appointment deleted' });
});

module.exports = router;
