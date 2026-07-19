const express = require('express');
const router = express.Router();
const db = require('../db');

// Generate CMS 1500 from charge/rejection
router.get('/generate/:chargeId', (req, res) => {
  const charge = db.prepare(`
    SELECT c.*, p.first_name, p.last_name, p.dob, p.ssn, p.gender, p.phone,
           p.address, p.city, p.state, p.zip, p.guarantor, p.guarantor_relation,
           pr.first_name as prov_first, pr.last_name as prov_last, pr.npi,
           pr.taxonomy_code, pr.specialization, pr.address as prov_address,
           pr.city as prov_city, pr.state as prov_state, pr.zip as prov_zip,
           pr.phone as prov_phone
    FROM charges c
    LEFT JOIN patients p ON c.patient_id = p.patient_id
    LEFT JOIN providers pr ON c.provider_id = pr.provider_id
    WHERE c.charge_id = ?
  `).get(req.params.chargeId);
  if (!charge) return res.status(404).json({ error: 'Charge not found' });

  const insurances = db.prepare('SELECT * FROM insurances WHERE patient_id = ?').all(charge.patient_id);
  const primary = insurances.find(i => i.insurance_type === 'primary') || insurances[0] || {};
  const secondary = insurances.find(i => i.insurance_type === 'secondary') || {};
  const lineItems = db.prepare('SELECT * FROM charge_line_items WHERE charge_id = ?').all(req.params.chargeId);

  const cms = {
    // Box 1 - Payer
    payer_name: primary.payer_name || '',
    payer_address: '',
    // Box 1a - Insured ID
    insured_id: primary.member_id || '',
    // Box 2 - Patient Name
    patient_name: charge.first_name + ' ' + charge.last_name,
    // Box 3 - Patient DOB / Sex
    patient_dob: charge.dob || '',
    patient_gender: charge.gender || '',
    // Box 4 - Insured Name (if different from patient)
    insured_name: primary.subscriber_name || charge.first_name + ' ' + charge.last_name,
    // Box 5 - Patient Address
    patient_address: charge.address || '',
    patient_city: charge.city || '',
    patient_state: charge.state || '',
    patient_zip: charge.zip || '',
    patient_phone: charge.phone || '',
    // Box 6 - Patient Relationship
    patient_relationship: primary.relationship || 'self',
    // Box 7 - Insured Address
    // Box 8 - Reserved
    // Box 9 - Other Insured Name
    other_insured_name: secondary.payer_name ? (secondary.subscriber_name || '') : '',
    // Box 9a - Other Insurance Policy/Group
    other_policy_group: secondary.group_number || '',
    // Box 10 - Patient Condition
    // Box 11 - Insured Policy/Group
    insured_group: primary.group_number || '',
    insured_plan: primary.plan_name || '',
    // Box 12 - Reserved
    // Box 13 - Reserved
    // Box 14 - Date of Illness/Injury
    date_of_service: charge.date_of_service || '',
    // Box 15-17 - Dates
    // Box 18 - Hospitalization (N/A for professional)
    // Box 19 - Reserved
    // Box 20 - External Cause
    // Box 21 - Diagnosis/Condition (ICD)
    icd_codes: lineItems.map(l => l.icd_codes).filter(Boolean).join(', '),
    // Box 22 - Resubmission Code / Reference
    // Box 23 - Prior Authorization
    // Box 24 - Services (line items)
    line_items: lineItems.map((l, i) => ({
      line: i + 1,
      date: l.service_date || charge.date_of_service || '',
      place: '11', // Office
      cpt: l.cpt_code || '',
      modifiers: [l.modifier1, l.modifier2, l.modifier3, l.modifier4].filter(Boolean).join(''),
      icd_pointer: l.pointer1 || '1',
      charges: (l.charge_amount || 0).toFixed(2),
      units: l.units || 1,
      dx_codes: l.icd_codes || ''
    })),
    // Box 25 - Federal Tax ID
    federal_tax_id: '',
    // Box 26 - Patient Account
    patient_account: charge.patient_id,
    // Box 27 - Accept Assignment
    accept_assignment: 'YES',
    // Box 28 - Total Charge
    total_charge: (lineItems.reduce((s, l) => s + (l.charge_amount || 0) * (l.units || 1), 0)).toFixed(2),
    // Box 29 - Amount Paid
    amount_paid: (charge.amount_paid || 0).toFixed(2),
    // Box 30 - Balance Due
    balance_due: ((lineItems.reduce((s, l) => s + (l.charge_amount || 0) * (l.units || 1), 0)) - (charge.amount_paid || 0)).toFixed(2),
    // Box 31 - Provider Signature
    provider_signature: charge.prov_first + ' ' + charge.prov_last,
    // Box 32 - Facility
    facility_name: '',
    // Box 33 - Provider Info
    provider_name: charge.prov_first + ' ' + charge.prov_last,
    provider_npi: charge.npi || '',
    provider_taxonomy: charge.taxonomy_code || '',
    provider_address: charge.prov_address || '',
    provider_phone: charge.prov_phone || ''
  };

  res.json(cms);
});

// Save CMS 1500 as claim record
router.post('/save', (req, res) => {
  const { charge_id, patient_id, status } = req.body;
  db.prepare('UPDATE charges SET status = ? WHERE charge_id = ?').run(status || 'submitted', charge_id);
  res.json({ message: 'CMS 1500 saved', charge_id });
});

module.exports = router;
