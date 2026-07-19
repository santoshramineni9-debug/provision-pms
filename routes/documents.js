const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all saved documents for a patient
router.get('/patient/:patientId', (req, res) => {
  const docs = db.prepare('SELECT * FROM patient_documents WHERE patient_id = ? ORDER BY created_at DESC').all(req.params.patientId);
  res.json(docs);
});

// ========== COB - Coordination of Benefits ==========
router.get('/cob/:patientId', (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE patient_id = ?').get(req.params.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const insurances = db.prepare('SELECT * FROM insurances WHERE patient_id = ? ORDER BY CASE insurance_type WHEN \'primary\' THEN 1 WHEN \'secondary\' THEN 2 WHEN \'tertiary\' THEN 3 ELSE 4 END').all(req.params.patientId);

  const eligList = db.prepare('SELECT * FROM eligibility_master WHERE patient_id = ?').all(req.params.patientId);
  const eligMap = {};
  eligList.forEach(e => { eligMap[e.insurance_id] = e; });

  const cobId = 'COB' + String(Date.now()).slice(-6);
  const today = new Date().toISOString().split('T')[0];

  const primary = insurances.find(i => i.insurance_type === 'primary') || {};
  const secondary = insurances.find(i => i.insurance_type === 'secondary') || {};
  const tertiary = insurances.find(i => i.insurance_type === 'tertiary') || {};

  const cob = {
    cob_id: cobId,
    document_type: 'COB',
    document_title: 'Coordination of Benefits',
    date: today,
    patient: {
      name: patient.first_name + ' ' + patient.last_name,
      dob: patient.dob,
      ssn: patient.ssn ? '***-**-' + patient.ssn.slice(-4) : '',
      address: (patient.address || '') + (patient.city ? ', ' + patient.city : '') + (patient.state ? ', ' + patient.state : '') + (patient.zip ? ' ' + patient.zip : ''),
      phone: patient.phone || ''
    },
    insurance_order: [],
    coordination_rules: []
  };

  insurances.forEach((ins, idx) => {
    const elig = eligMap[ins.id] || {};
    cob.insurance_order.push({
      order: idx + 1,
      type: ins.insurance_type,
      payer: ins.payer_name,
      member_id: ins.member_id,
      group: ins.group_number || '',
      plan: ins.plan_name || '',
      subscriber: ins.subscriber_name || patient.first_name + ' ' + patient.last_name,
      relationship: ins.relationship || 'self',
      effective: elig.effective_date || '',
      termination: elig.termination_date || '',
      copay: ins.copay || 0,
      deductible: ins.deductible || 0,
      coinsurance: ins.coinsurance || 0,
      elig_id: elig.id || null
    });
  });

  if (insurances.length >= 2) {
    cob.coordination_rules = [
      { rule: 'Primary payer pays first based on their benefit schedule.' },
      { rule: 'Secondary payer covers remaining balance up to their allowed amount.' },
      { rule: 'Patient responsibility is the lesser of remaining balance and secondary deductible/copay.' },
      { rule: 'Total combined payments from all payers cannot exceed total billed charges.' }
    ];
    if (insurances.length >= 3) {
      cob.coordination_rules.push({ rule: 'Tertiary payer processes any remaining balance after primary and secondary.' });
    }
  } else {
    cob.coordination_rules = [
      { rule: 'Single insurance on file - no COB coordination needed.' },
      { rule: 'Patient is responsible for any amounts not covered by this plan.' }
    ];
  }

  // Save to DB
  db.prepare('INSERT INTO patient_documents (document_id, patient_id, document_type, document_title, document_data) VALUES (?, ?, ?, ?, ?)')
    .run(cobId, req.params.patientId, 'COB', 'Coordination of Benefits', JSON.stringify(cob));

  res.json(cob);
});

// ========== ABN - Advance Beneficiary Notice ==========
router.get('/abn/:patientId', (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE patient_id = ?').get(req.params.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const insurances = db.prepare('SELECT * FROM insurances WHERE patient_id = ? AND insurance_type = \'primary\'').get(req.params.patientId);
  const abnId = 'ABN' + String(Date.now()).slice(-6);
  const today = new Date().toISOString().split('T')[0];

  const abn = {
    abn_id: abnId,
    document_type: 'ABN',
    document_title: 'Advance Beneficiary Notice of Noncoverage',
    date: today,
    patient: {
      name: patient.first_name + ' ' + patient.last_name,
      dob: patient.dob,
      ssn: patient.ssn ? '***-**-' + patient.ssn.slice(-4) : '',
      address: (patient.address || '') + (patient.city ? ', ' + patient.city : '') + (patient.state ? ', ' + patient.state : '') + (patient.zip ? ' ' + patient.zip : ''),
      phone: patient.phone || ''
    },
    insurance: {
      payer: insurances ? insurances.payer_name : '',
      member_id: insurances ? insurances.member_id : '',
      group: insurances ? insurances.group_number : ''
    },
    reason_for_notice: 'Medicare may not pay for the following items or services because it may not be considered medically necessary under Medicare coverage guidelines.',
    items: [
      { code: '', description: 'Service may not be medically necessary', estimated_cost: 0 }
    ],
    patient_choices: [
      'Option 1: I want the listed item(s) or service(s). I understand that I must pay for them myself if Medicare does not pay.',
      'Option 2: I do not want the listed item(s) or service(s). I will not have to pay for them if Medicare does not pay.',
      'Option 3: I want the listed item(s) or service(s). I also want Medicare to determine if they are covered. If Medicare denies payment, I will be responsible for the full cost.'
    ],
    notice_date: today,
    provider_name: '',
    provider_npi: '',
    patient_signature: '',
    signature_date: ''
  };

  db.prepare('INSERT INTO patient_documents (document_id, patient_id, document_type, document_title, document_data) VALUES (?, ?, ?, ?, ?)')
    .run(abnId, req.params.patientId, 'ABN', 'Advance Beneficiary Notice', JSON.stringify(abn));

  res.json(abn);
});

// ========== AOB - Assignment of Benefits ==========
router.get('/aob/:patientId', (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE patient_id = ?').get(req.params.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const insurances = db.prepare('SELECT * FROM insurances WHERE patient_id = ? ORDER BY CASE insurance_type WHEN \'primary\' THEN 1 WHEN \'secondary\' THEN 2 ELSE 3 END').all(req.params.patientId);
  const aobId = 'AOB' + String(Date.now()).slice(-6);
  const today = new Date().toISOString().split('T')[0];

  const aob = {
    aob_id: aobId,
    document_type: 'AOB',
    document_title: 'Assignment of Benefits',
    date: today,
    patient: {
      name: patient.first_name + ' ' + patient.last_name,
      dob: patient.dob,
      ssn: patient.ssn ? '***-**-' + patient.ssn.slice(-4) : '',
      address: (patient.address || '') + (patient.city ? ', ' + patient.city : '') + (patient.state ? ', ' + patient.state : '') + (patient.zip ? ' ' + patient.zip : ''),
      phone: patient.phone || ''
    },
    insurance_assignments: insurances.map(ins => ({
      payer: ins.payer_name,
      member_id: ins.member_id,
      type: ins.insurance_type,
      group: ins.group_number || ''
    })),
    assignment_text: [
      'I hereby authorize the release of any information necessary to process this claim.',
      'I hereby assign all benefits payable for the services described herein to the healthcare provider.',
      'I understand that I am financially responsible for charges not covered by my insurance.',
      'This assignment is valid for the period indicated and may be revoked in writing.'
    ],
    provider_name: '',
    provider_npi: '',
    patient_signature: '',
    signature_date: ''
  };

  db.prepare('INSERT INTO patient_documents (document_id, patient_id, document_type, document_title, document_data) VALUES (?, ?, ?, ?, ?)')
    .run(aobId, req.params.patientId, 'AOB', 'Assignment of Benefits', JSON.stringify(aob));

  res.json(aob);
});

// ========== ROI - Release of Information ==========
router.get('/roi/:patientId', (req, res) => {
  const patient = db.prepare('SELECT * FROM patients WHERE patient_id = ?').get(req.params.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const insurances = db.prepare('SELECT * FROM insurances WHERE patient_id = ?').all(req.params.patientId);
  const roiId = 'ROI' + String(Date.now()).slice(-6);
  const today = new Date().toISOString().split('T')[0];

  const roi = {
    roi_id: roiId,
    document_type: 'ROI',
    document_title: 'Authorization for Release of Protected Health Information',
    date: today,
    patient: {
      name: patient.first_name + ' ' + patient.last_name,
      dob: patient.dob,
      ssn: patient.ssn ? '***-**-' + patient.ssn.slice(-4) : '',
      address: (patient.address || '') + (patient.city ? ', ' + patient.city : '') + (patient.state ? ', ' + patient.state : '') + (patient.zip ? ' ' + patient.zip : ''),
      phone: patient.phone || ''
    },
    insurance_recipients: insurances.map(ins => ({
      payer: ins.payer_name,
      member_id: ins.member_id,
      address: '',
      type: ins.insurance_type
    })),
    information_released: [
      'Medical records and treatment history',
      'Diagnostic test results and imaging reports',
      'Laboratory results',
      'Surgical and procedure records',
      'Prescription and medication history',
      'Insurance claim information',
      'Billing records'
    ],
    purpose: 'Insurance claim processing, eligibility verification, and benefits coordination',
    disclosure_limits: 'Only information necessary for the stated purpose',
    expiration: 'This authorization expires one year from the date signed.',
    patient_rights: [
      'I may revoke this authorization at any time in writing.',
      'I understand that treatment, payment, or enrollment may not be conditioned on signing this authorization.',
      'I may request a copy of this authorization.',
      'Information disclosed under this authorization is subject to re-disclosure by the recipient.'
    ],
    patient_signature: '',
    signature_date: ''
  };

  db.prepare('INSERT INTO patient_documents (document_id, patient_id, document_type, document_title, document_data) VALUES (?, ?, ?, ?, ?)')
    .run(roiId, req.params.patientId, 'ROI', 'Release of Information', JSON.stringify(roi));

  res.json(roi);
});

// Save/Update a document
router.post('/save', (req, res) => {
  const { document_id, document_data, status } = req.body;
  if (!document_id) return res.status(400).json({ error: 'document_id required' });
  db.prepare('UPDATE patient_documents SET document_data = ?, status = ? WHERE document_id = ?')
    .run(document_data || '', status || 'saved', document_id);
  res.json({ message: 'Document saved' });
});

module.exports = router;
