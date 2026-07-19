const express = require('express');
const router = express.Router();
const db = require('../db');

// Get eligibility for patient
router.get('/patient/:patientId', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const eligibilities = db.prepare(`
    SELECT e.*, i.payer_name, i.member_id as ins_member_id, i.group_number
    FROM eligibility_master e
    LEFT JOIN insurances i ON e.insurance_id = i.id
    WHERE e.patient_id = ?
  `).all(req.params.patientId);

  // Auto-expire records where termination_date has passed
  for (const e of eligibilities) {
    if (e.status === 'active' && e.termination_date && e.termination_date < today) {
      db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(e.id);
      e.status = 'expired';
    }
  }

  res.json(eligibilities);
});

// Get eligibility with 10 benefits
router.get('/:eligibilityId', (req, res) => {
  const eligibility = db.prepare('SELECT * FROM eligibility_master WHERE id = ?').get(req.params.eligibilityId);
  if (!eligibility) return res.status(404).json({ error: 'Not found' });

  const benefits = db.prepare('SELECT * FROM eligibility_benefits WHERE eligibility_id = ?').all(req.params.eligibilityId);
  res.json({ ...eligibility, benefits });
});

// Verify eligibility by Member ID (real payer-side workflow: patient shows card → verify by member_id)
router.get('/verify-member/:memberId', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const memberId = req.params.memberId;

  // Find insurance by member_id
  const ins = db.prepare('SELECT * FROM insurances WHERE member_id = ? ORDER BY id DESC LIMIT 1').get(memberId);
  if (!ins) return res.json({ status: 'not_found', message: 'No insurance found for Member ID: ' + memberId });

  // Auto-expire insurance if past termination_date
  if (ins.status === 'active' && ins.termination_date && ins.termination_date < today) {
    db.prepare("UPDATE insurances SET status = 'expired' WHERE id = ?").run(ins.id);
    ins.status = 'expired';
  }

  // Find patient
  const patient = db.prepare('SELECT * FROM patients WHERE patient_id = ?').get(ins.patient_id);

  // Find eligibility record
  const elig = db.prepare('SELECT * FROM eligibility_master WHERE patient_id = ? AND insurance_id = ? ORDER BY id DESC LIMIT 1').get(ins.patient_id, ins.id);
  let eligibility_status = ins.status || 'unknown';
  if (elig) {
    if (elig.termination_date && elig.termination_date < today) {
      eligibility_status = 'expired';
      db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(elig.id);
    } else if (elig.effective_date && elig.effective_date > today) {
      eligibility_status = 'pending';
    } else {
      eligibility_status = elig.status || 'active';
    }
  }

  const benefits = elig ? db.prepare('SELECT * FROM eligibility_benefits WHERE eligibility_id = ?').all(elig.id) : [];

  res.json({
    status: eligibility_status,
    message: eligibility_status === 'active' ? 'Eligibility verified - ACTIVE' : eligibility_status === 'expired' ? 'Eligibility EXPIRED on ' + (elig?.termination_date || ins.termination_date || 'unknown') : 'Eligibility: ' + eligibility_status,
    patient: patient || null,
    insurance: ins,
    eligibility: elig || null,
    benefits,
    card_image_front: ins.card_image_front || null,
    card_image_back: ins.card_image_back || null
  });
});

// Verify eligibility - check active status (auto-expire based on termination_date)
router.get('/verify/:patientId', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const eligibility = db.prepare(`
    SELECT e.*, i.payer_name, i.member_id as ins_member_id, i.status as insurance_status
    FROM eligibility_master e
    LEFT JOIN insurances i ON e.insurance_id = i.id
    WHERE e.patient_id = ? AND e.status = 'active'
    ORDER BY e.id ASC LIMIT 1
  `).get(req.params.patientId);

  if (!eligibility) {
    return res.json({ status: 'inactive', message: 'No active eligibility found' });
  }

  if (eligibility.termination_date && eligibility.termination_date < today) {
    db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(eligibility.id);
    return res.json({ status: 'expired', message: 'Eligibility expired on ' + eligibility.termination_date, eligibility });
  }

  if (eligibility.effective_date && eligibility.effective_date > today) {
    return res.json({ status: 'pending', message: 'Eligibility not yet effective. Starts: ' + eligibility.effective_date, eligibility });
  }

  const benefits = db.prepare('SELECT * FROM eligibility_benefits WHERE eligibility_id = ?').all(eligibility.id);
  res.json({ ...eligibility, benefits, status: 'active' });
});

// Update benefit (MUST be before /:eligibilityId to avoid route conflict)
router.put('/benefit/:benefitId', (req, res) => {
  const { covered, copay_amount, deductible_amount, coinsurance_percent, max_visits, visits_used, prior_auth_required } = req.body;
  db.prepare(`
    UPDATE eligibility_benefits SET covered=?, copay_amount=?, deductible_amount=?, coinsurance_percent=?, max_visits=?, visits_used=?, remaining_visits=COALESCE(max_visits,0)-COALESCE(visits_used,0), prior_auth_required=?
    WHERE id=?
  `).run(covered, copay_amount, deductible_amount, coinsurance_percent, max_visits, visits_used, prior_auth_required, req.params.benefitId);
  res.json({ message: 'Benefit updated' });
});

// Create eligibility
router.post('/', (req, res) => {
  const { patient_id, member_id, insurance_id, effective_date, termination_date, plan_type, network, pcp, referral_required, auth_required } = req.body;

  const result = db.prepare(`
    INSERT INTO eligibility_master (patient_id, member_id, insurance_id, verification_date, effective_date, termination_date, plan_type, network, pcp, referral_required, auth_required)
    VALUES (?, ?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?)
  `).run(patient_id, member_id, insurance_id, effective_date, termination_date, plan_type, network, pcp, referral_required || 0, auth_required || 0);

  // Add benefits from template (default: 'standard')
  const tplName = req.body.template_name || 'standard';
  const templateBenefits = db.prepare('SELECT * FROM benefit_templates WHERE template_name = ?').all(tplName);
  const benefits = templateBenefits.length > 0 ? templateBenefits : [
    ['office_visit', 'Office Visit', 1, 30, 25, 20, 52, 4, 48, 0],
    ['specialist_visit', 'Specialist Visit', 1, 50, 25, 30, 26, 2, 24, 1],
    ['emergency_room', 'Emergency Room', 1, 250, 0, 20, 6, 1, 5, 0],
    ['urgent_care', 'Urgent Care', 1, 75, 10, 20, 12, 0, 12, 0],
    ['laboratory', 'Laboratory Services', 1, 15, 0, 15, 30, 5, 25, 0],
    ['radiology', 'Radiology/Imaging', 1, 50, 0, 20, 10, 3, 7, 1],
    ['preventive_care', 'Preventive Care', 1, 0, 0, 0, 4, 1, 3, 0],
    ['mental_health', 'Mental Health', 1, 40, 50, 25, 20, 2, 18, 1],
    ['physical_therapy', 'Physical Therapy', 1, 40, 25, 30, 30, 5, 25, 1],
    ['prescription', 'Prescription Drugs', 1, 10, 25, 25, 60, 10, 50, 0],
  ];

  const insertBenefit = db.prepare(`
    INSERT INTO eligibility_benefits (eligibility_id, benefit_type, benefit_name, covered, copay_amount, deductible_amount, coinsurance_percent, max_visits, visits_used, remaining_visits, prior_auth_required)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const b of benefits) {
    if (templateBenefits.length > 0) {
      insertBenefit.run(result.lastInsertRowid, b.benefit_type, b.benefit_name, b.covered, b.copay_amount, b.deductible_amount, b.coinsurance_percent, b.max_visits, 0, b.max_visits || 0, b.prior_auth_required);
    } else {
      insertBenefit.run(result.lastInsertRowid, ...b);
    }
  }

  res.json({ eligibility_id: result.lastInsertRowid, message: 'Eligibility created with 10 benefits' });
});

// Update eligibility
router.put('/:eligibilityId', (req, res) => {
  const { member_id, effective_date, termination_date, plan_type, network, pcp, referral_required, auth_required, status } = req.body;
  db.prepare(`
    UPDATE eligibility_master SET member_id=?, effective_date=?, termination_date=?, plan_type=?, network=?, pcp=?, referral_required=?, auth_required=?, status=?
    WHERE id=?
  `).run(member_id, effective_date, termination_date, plan_type, network, pcp, referral_required || 0, auth_required || 0, status || 'active', req.params.eligibilityId);
  res.json({ message: 'Eligibility updated' });
});

// ========== BENEFIT TEMPLATES (Master User) ==========

// Get all benefit templates
router.get('/templates', (req, res) => {
  const { template_name } = req.query;
  let query = 'SELECT * FROM benefit_templates';
  const params = [];
  if (template_name) { query += ' WHERE template_name = ?'; params.push(template_name); }
  query += ' ORDER BY template_name, benefit_type';
  res.json(db.prepare(query).all(...params));
});

// Get distinct template names
router.get('/templates/names', (req, res) => {
  const names = db.prepare('SELECT DISTINCT template_name FROM benefit_templates ORDER BY template_name').all();
  res.json(names.map(n => n.template_name));
});

// Create a single benefit template
router.post('/templates', (req, res) => {
  const { template_name, benefit_type, benefit_name, covered, copay_amount, deductible_amount, coinsurance_percent, max_visits, prior_auth_required, notes } = req.body;
  if (!template_name || !benefit_type || !benefit_name) return res.status(400).json({ error: 'template_name, benefit_type, benefit_name required' });
  const result = db.prepare(`
    INSERT INTO benefit_templates (template_name, benefit_type, benefit_name, covered, copay_amount, deductible_amount, coinsurance_percent, max_visits, prior_auth_required, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(template_name, benefit_type, benefit_name, covered || 1, copay_amount || 0, deductible_amount || 0, coinsurance_percent || 0, max_visits || 0, prior_auth_required || 0, notes || '');
  res.json({ id: result.lastInsertRowid, message: 'Template benefit created' });
});

// Create a full template set from existing benefits
router.post('/templates/copy', (req, res) => {
  const { source_template, new_template_name } = req.body;
  if (!source_template || !new_template_name) return res.status(400).json({ error: 'source and new name required' });
  const existing = db.prepare('SELECT * FROM benefit_templates WHERE template_name = ?').all(source_template);
  if (!existing.length) return res.status(404).json({ error: 'Source template not found' });
  const ins = db.prepare('INSERT INTO benefit_templates (template_name,benefit_type,benefit_name,covered,copay_amount,deductible_amount,coinsurance_percent,max_visits,prior_auth_required,notes,is_default) VALUES (?,?,?,?,?,?,?,?,?,?,0)');
  for (const t of existing) {
    ins.run(new_template_name, t.benefit_type, t.benefit_name, t.covered, t.copay_amount, t.deductible_amount, t.coinsurance_percent, t.max_visits, t.prior_auth_required, t.notes);
  }
  res.json({ message: 'Template copied', count: existing.length });
});

// Update a benefit template
router.put('/templates/:templateId', (req, res) => {
  const { benefit_type, benefit_name, covered, copay_amount, deductible_amount, coinsurance_percent, max_visits, prior_auth_required, notes } = req.body;
  db.prepare(`
    UPDATE benefit_templates SET benefit_type=?, benefit_name=?, covered=?, copay_amount=?, deductible_amount=?, coinsurance_percent=?, max_visits=?, prior_auth_required=?, notes=?
    WHERE id=?
  `).run(benefit_type, benefit_name, covered || 1, copay_amount || 0, deductible_amount || 0, coinsurance_percent || 0, max_visits || 0, prior_auth_required || 0, notes || '', req.params.templateId);
  res.json({ message: 'Template benefit updated' });
});

// Delete a benefit template
router.delete('/templates/:templateId', (req, res) => {
  db.prepare('DELETE FROM benefit_templates WHERE id = ?').run(req.params.templateId);
  res.json({ message: 'Template benefit deleted' });
});

// Delete entire template set
router.delete('/templates/set/:templateName', (req, res) => {
  db.prepare('DELETE FROM benefit_templates WHERE template_name = ?').run(req.params.templateName);
  res.json({ message: 'Template set deleted' });
});

module.exports = router;
