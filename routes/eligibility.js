const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const cardStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, 'card_' + Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
});
const cardUpload = multer({ storage: cardStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// ========== ALL SPECIFIC ROUTES FIRST ==========

// ========== PAYER SIDE: Create Insurance Card (no patient_id/MRN needed) ==========
router.post('/payer/create-card', cardUpload.fields([{ name: 'card_front', maxCount: 1 }, { name: 'card_back', maxCount: 1 }]), (req, res) => {
  const { payer_name, member_id, group_number, plan_name, insurance_type, copay, deductible, coinsurance, subscriber_name, subscriber_dob, relationship } = req.body;
  if (!payer_name || !member_id) return res.status(400).json({ error: 'Payer Name and Member ID are required' });

  const existing = db.prepare('SELECT id FROM insurances WHERE member_id = ?').get(member_id);
  if (existing) return res.status(400).json({ error: 'Member ID already exists (ID: ' + existing.id + ')' });

  let card_front = null, card_back = null;
  if (req.files && req.files['card_front']) card_front = '/uploads/' + req.files['card_front'][0].filename;
  if (req.files && req.files['card_back']) card_back = '/uploads/' + req.files['card_back'][0].filename;

  const result = db.prepare(`
    INSERT INTO insurances (patient_id, insurance_type, payer_name, member_id, group_number, plan_name, copay, deductible, coinsurance, subscriber_name, subscriber_dob, relationship, card_image_front, card_image_back, status)
    VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(insurance_type || 'primary', payer_name, member_id, group_number || '', plan_name || '', copay || 0, deductible || 0, coinsurance || 0, subscriber_name || '', subscriber_dob || '', relationship || 'self', card_front, card_back);

  db.save();
  res.json({ id: result.lastInsertRowid, message: 'Insurance card created with Member ID: ' + member_id });
});

// ========== PAYER SIDE: Search by Member ID ==========
router.get('/payer/search-member/:memberId', (req, res) => {
  const memberId = req.params.memberId;
  const today = new Date().toISOString().slice(0, 10);
  const ins = db.prepare('SELECT * FROM insurances WHERE member_id = ? ORDER BY id DESC').all(memberId);
  if (!ins.length) return res.json({ found: false, message: 'No insurance found for Member ID: ' + memberId });

  const results = ins.map(i => {
    const patient = i.patient_id ? db.prepare('SELECT * FROM patients WHERE patient_id = ?').get(i.patient_id) : null;
    const elig = db.prepare('SELECT * FROM eligibility_master WHERE insurance_id = ? OR member_id = ? ORDER BY id DESC').all(i.id, i.member_id);
    let eligibility_status = null;
    if (elig.length) {
      const e = elig[0];
      if (e.status === 'active' && e.termination_date && e.termination_date < today) {
        eligibility_status = 'expired';
      } else if (e.effective_date && e.effective_date > today) {
        eligibility_status = 'pending';
      } else {
        eligibility_status = e.status || 'active';
      }
    }
    i.eligibility_status = eligibility_status;
    i.effective_status = (eligibility_status === 'expired') ? 'expired' : (eligibility_status === 'pending') ? 'pending' : (i.status || 'active');
    return { insurance: i, patient: patient || null, eligibilities: elig };
  });
  res.json({ found: true, results });
});

// ========== PAYER SIDE: List all eligibility records + insurance cards with search ==========
router.get('/payer/all', (req, res) => {
  const q = req.query.q || '';
  const today = new Date().toISOString().slice(0, 10);

  // 1) Get all eligibility records
  let eligQuery = `
    SELECT e.*, i.payer_name, i.member_id as ins_member_id, i.group_number, i.plan_name as ins_plan_name,
           i.patient_id as ins_patient_id, i.copay, i.deductible, i.coinsurance, i.status as ins_status,
           i.card_image_front, i.card_image_back, i.subscriber_name, i.subscriber_dob,
           p.first_name, p.last_name, p.dob as patient_dob, p.phone as patient_phone, p.mrn, p.patient_id as pid
    FROM eligibility_master e
    LEFT JOIN insurances i ON e.insurance_id = i.id
    LEFT JOIN patients p ON i.patient_id = p.patient_id
  `;
  const params = [];
  if (q) {
    eligQuery += ` WHERE (i.member_id LIKE ? OR e.patient_id LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ? OR i.payer_name LIKE ? OR (p.first_name || ' ' || p.last_name) LIKE ? OR p.mrn LIKE ? OR p.patient_id LIKE ?)`;
    const like = '%' + q + '%';
    params.push(like, like, like, like, like, like, like, like);
  }
  eligQuery += ` ORDER BY e.id DESC LIMIT 100`;
  const eligRows = db.prepare(eligQuery).all(...params);

  for (const r of eligRows) {
    if (r.status === 'active' && r.termination_date && r.termination_date < today) {
      db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(r.id);
      r.status = 'expired';
    }
  }

  // 2) Get insurance cards that have NO eligibility record
  let insQuery = `
    SELECT i.*, p.first_name, p.last_name, p.dob as patient_dob, p.phone as patient_phone, p.mrn, p.patient_id as pid
    FROM insurances i
    LEFT JOIN patients p ON i.patient_id = p.patient_id
    WHERE i.id NOT IN (SELECT DISTINCT insurance_id FROM eligibility_master WHERE insurance_id IS NOT NULL)
  `;
  const insParams = [];
  if (q) {
    insQuery += ` AND (i.member_id LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ? OR i.payer_name LIKE ? OR (p.first_name || ' ' || p.last_name) LIKE ? OR p.mrn LIKE ? OR p.patient_id LIKE ? OR i.subscriber_name LIKE ?)`;
    const like = '%' + q + '%';
    insParams.push(like, like, like, like, like, like, like, like);
  }
  insQuery += ` ORDER BY i.id DESC LIMIT 100`;
  const insRows = db.prepare(insQuery).all(...insParams);

  // Tag source type for frontend
  eligRows.forEach(r => { r._source = 'eligibility'; });
  insRows.forEach(r => { r._source = 'insurance'; r.id = 'INS' + r.id; });

  const all = [...eligRows, ...insRows].sort((a, b) => (b.id > a.id ? 1 : -1)).slice(0, 200);
  res.json(all);
});

// Get eligibility for patient
router.get('/patient/:patientId', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const eligibilities = db.prepare(`
    SELECT e.*, i.payer_name, i.member_id as ins_member_id, i.group_number
    FROM eligibility_master e
    LEFT JOIN insurances i ON e.insurance_id = i.id
    WHERE e.patient_id = ?
  `).all(req.params.patientId);

  for (const e of eligibilities) {
    if (e.status === 'active' && e.termination_date && e.termination_date < today) {
      db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(e.id);
      e.status = 'expired';
    }
  }

  res.json(eligibilities);
});

// Verify eligibility by Member ID (real payer-side workflow)
router.get('/verify-member/:memberId', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const memberId = req.params.memberId;

  const ins = db.prepare('SELECT * FROM insurances WHERE member_id = ? ORDER BY id DESC LIMIT 1').get(memberId);
  if (!ins) return res.json({ status: 'not_found', message: 'No insurance found for Member ID: ' + memberId });

  if (ins.status === 'active' && ins.termination_date && ins.termination_date < today) {
    db.prepare("UPDATE insurances SET status = 'expired' WHERE id = ?").run(ins.id);
    ins.status = 'expired';
  }

  const patient = db.prepare('SELECT * FROM patients WHERE patient_id = ?').get(ins.patient_id);

  // Find eligibility by member_id directly OR by insurance_id — covers both linked and unlinked cases
  let elig = db.prepare('SELECT * FROM eligibility_master WHERE member_id = ? ORDER BY id DESC LIMIT 1').get(memberId);
  if (!elig) {
    elig = db.prepare('SELECT * FROM eligibility_master WHERE patient_id = ? AND insurance_id = ? ORDER BY id DESC LIMIT 1').get(ins.patient_id, ins.id);
  }
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

// ========== PATIENT ELIGIBILITY VERIFICATION ==========
// Run verification: patient lookup by member_id + insurance_name + benefit + DOS
router.get('/patient-verify', (req, res) => {
  const { patient_id, member_id, payer_name, benefit_type, dos } = req.query;
  if (!patient_id && !member_id) return res.status(400).json({ error: 'patient_id or member_id required' });
  const today = dos || new Date().toISOString().slice(0, 10);

  // Find patient
  let patient = null;
  if (patient_id) patient = db.prepare('SELECT * FROM patients WHERE patient_id = ?').get(patient_id);
  if (!patient && member_id) {
    const ins = db.prepare('SELECT patient_id FROM insurances WHERE member_id = ?').get(member_id);
    if (ins && ins.patient_id) patient = db.prepare('SELECT * FROM patients WHERE patient_id = ?').get(ins.patient_id);
  }
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const pid = patient.patient_id;

  // Get ALL insurances for this patient
  const insurances = db.prepare('SELECT * FROM insurances WHERE patient_id = ? ORDER BY CASE insurance_type WHEN \'primary\' THEN 1 WHEN \'secondary\' THEN 2 WHEN \'tertiary\' THEN 3 ELSE 4 END').all(pid);

  // For each insurance, find eligibility + benefits
  const results = [];
  for (const ins of insurances) {
    if (payer_name && ins.payer_name && !ins.payer_name.toLowerCase().includes(payer_name.toLowerCase())) continue;
    let elig = db.prepare('SELECT * FROM eligibility_master WHERE insurance_id = ? OR member_id = ? ORDER BY id DESC LIMIT 1').get(ins.id, ins.member_id);
    let eligStatus = null, eligMessage = '';
    let benefits = [];

    if (elig) {
      if (elig.termination_date && elig.termination_date < today) {
        eligStatus = 'expired'; eligMessage = 'Eligibility expired on ' + elig.termination_date;
        db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(elig.id);
      } else if (elig.effective_date && elig.effective_date > today) {
        eligStatus = 'pending'; eligMessage = 'Not yet effective. Starts: ' + elig.effective_date;
      } else {
        eligStatus = 'active'; eligMessage = 'Coverage active';
      }
      let bQuery = 'SELECT * FROM eligibility_benefits WHERE eligibility_id = ?';
      const bParams = [elig.id];
      if (benefit_type) { bQuery += ' AND benefit_type = ?'; bParams.push(benefit_type); }
      benefits = db.prepare(bQuery).all(...bParams);
    }

    // Check if DOS is within eligibility validity
    let dosValid = null;
    if (elig && elig.effective_date && elig.termination_date) {
      if (today >= elig.effective_date && today <= elig.termination_date) dosValid = true;
      else dosValid = false;
    }

    results.push({
      insurance_id: ins.id,
      insurance_type: ins.insurance_type,
      payer_name: ins.payer_name,
      member_id: ins.member_id,
      group_number: ins.group_number,
      plan_name: ins.plan_name,
      insurance_status: ins.status,
      eligibility_id: elig ? elig.id : null,
      eligibility_status: eligStatus,
      eligibility_message: eligMessage,
      effective_date: elig ? elig.effective_date : null,
      termination_date: elig ? elig.termination_date : null,
      plan_type: elig ? elig.plan_type : null,
      network: elig ? elig.network : null,
      dos_check: dosValid,
      benefits: benefits,
      referral_required: elig ? elig.referral_required : 0,
      auth_required: elig ? elig.auth_required : 0
    });
  }

  // COB: determine primary/secondary order
  const primary = results.find(r => r.insurance_type === 'primary');
  const secondary = results.find(r => r.insurance_type === 'secondary');
  const tertiary = results.find(r => r.insurance_type === 'tertiary');

  // Get rejections and denials for this patient
  const rejections = db.prepare(`
    SELECT r.*, c.total_amount, c.service_date, c.payer_name as claim_payer, c.claim_status,
           pr.first_name || ' ' || pr.last_name as provider_name
    FROM rejections r
    LEFT JOIN charges c ON r.charge_id = c.charge_id
    LEFT JOIN providers pr ON c.provider_id = pr.provider_id
    WHERE r.patient_id = ?
    ORDER BY r.created_at DESC
  `).all(pid);

  // Denied claims (charge status = denied)
  const denials = db.prepare(`
    SELECT c.*, pr.first_name || ' ' || pr.last_name as provider_name,
           i.payer_name as ins_payer, i.member_id as ins_member_id
    FROM charges c
    LEFT JOIN providers pr ON c.provider_id = pr.provider_id
    LEFT JOIN insurances i ON c.insurance_id = i.id
    WHERE c.patient_id = ? AND (c.claim_status = 'denied' OR c.claim_status = 'rejected' OR c.status = 'denied')
    ORDER BY c.created_at DESC
  `).all(pid);

  res.json({
    patient: { patient_id: patient.patient_id, name: patient.first_name + ' ' + patient.last_name, dob: patient.dob, mrn: patient.mrn, phone: patient.phone, address: patient.address, city: patient.city, state: patient.state, zip: patient.zip, ssn: patient.ssn },
    verification_date: today,
    insurances: results,
    cob: {
      primary: primary ? { payer: primary.payer_name, member_id: primary.member_id, eligibility: primary.eligibility_status, dos_valid: primary.dos_check } : null,
      secondary: secondary ? { payer: secondary.payer_name, member_id: secondary.member_id, eligibility: secondary.eligibility_status, dos_valid: secondary.dos_check } : null,
      tertiary: tertiary ? { payer: tertiary.payer_name, member_id: tertiary.member_id, eligibility: tertiary.eligibility_status, dos_valid: tertiary.dos_check } : null
    },
    rejections: rejections,
    denials: denials
  });
});

// Get hospitals list
router.get('/hospitals', (req, res) => {
  const hospitals = db.prepare('SELECT hospital_id, hospital_name as name, city, state FROM master_hospital ORDER BY hospital_name').all();
  res.json(hospitals);
});

// Get benefit types
router.get('/benefit-types', (req, res) => {
  const types = db.prepare('SELECT DISTINCT benefit_type, benefit_name FROM eligibility_benefits ORDER BY benefit_type').all();
  res.json(types);
});

// Verify eligibility - check active status (auto-expire based on termination_date)
router.get('/verify/:patientId', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  let eligibility = db.prepare(`
    SELECT e.*, i.payer_name, i.member_id as ins_member_id, i.status as insurance_status
    FROM eligibility_master e
    LEFT JOIN insurances i ON e.insurance_id = i.id
    WHERE e.patient_id = ? AND e.status = 'active'
    ORDER BY e.id ASC LIMIT 1
  `).get(req.params.patientId);

  // Fallback: also check by member_id from insurances table
  if (!eligibility) {
    const ins = db.prepare('SELECT member_id FROM insurances WHERE patient_id = ? LIMIT 1').get(req.params.patientId);
    if (ins && ins.member_id) {
      eligibility = db.prepare(`
        SELECT e.*, i.payer_name, i.member_id as ins_member_id, i.status as insurance_status
        FROM eligibility_master e
        LEFT JOIN insurances i ON e.insurance_id = i.id
        WHERE e.member_id = ? ORDER BY e.id DESC LIMIT 1
      `).get(ins.member_id);
    }
  }

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

// ========== BENEFIT TEMPLATES (specific routes) ==========

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

// ========== ALL SPECIFIC PUT/DELETE ROUTES ==========

// Update benefit
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

// ========== CATCH-ALL PARAM ROUTES LAST ==========

// Get eligibility with 10 benefits (MUST be after all specific GET routes)
router.get('/:eligibilityId', (req, res) => {
  const eligibility = db.prepare('SELECT * FROM eligibility_master WHERE id = ?').get(req.params.eligibilityId);
  if (!eligibility) return res.status(404).json({ error: 'Not found' });

  const benefits = db.prepare('SELECT * FROM eligibility_benefits WHERE eligibility_id = ?').all(req.params.eligibilityId);
  res.json({ ...eligibility, benefits });
});

// Update eligibility (MUST be after all specific PUT routes)
router.put('/:eligibilityId', (req, res) => {
  const { member_id, effective_date, termination_date, plan_type, network, pcp, referral_required, auth_required, status } = req.body;
  db.prepare(`
    UPDATE eligibility_master SET member_id=?, effective_date=?, termination_date=?, plan_type=?, network=?, pcp=?, referral_required=?, auth_required=?, status=?
    WHERE id=?
  `).run(member_id, effective_date, termination_date, plan_type, network, pcp, referral_required || 0, auth_required || 0, status || 'active', req.params.eligibilityId);
  res.json({ message: 'Eligibility updated' });
});

module.exports = router;
