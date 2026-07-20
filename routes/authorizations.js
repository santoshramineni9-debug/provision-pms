const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const authStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'auth');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const authUpload = multer({ storage: authStorage });

// ==================== PROVIDER SIDE ====================

// Get all authorizations
router.get('/', (req, res) => {
  const { patient_id, status } = req.query;
  let query = `
    SELECT a.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn, i.payer_name
    FROM authorizations a
    LEFT JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN insurances i ON a.insurance_id = i.id
    WHERE 1=1
  `;
  const params = [];
  if (patient_id) { query += ' AND a.patient_id = ?'; params.push(patient_id); }
  if (status) { query += ' AND a.status = ?'; params.push(status); }
  query += ' ORDER BY a.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// Get authorization by ID with full history
router.get('/:authId', (req, res) => {
  const auth = db.prepare(`
    SELECT a.*, p.first_name, p.last_name, p.mrn, p.dob, p.ssn, p.phone,
           i.payer_name, i.member_id as ins_member_id, i.group_number, i.plan_name
    FROM authorizations a
    LEFT JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN insurances i ON a.insurance_id = i.id
    WHERE a.auth_id = ?
  `).get(req.params.authId);
  if (!auth) return res.status(404).json({ error: 'Not found' });
  const history = db.prepare('SELECT * FROM auth_history WHERE auth_id = ? ORDER BY action_date DESC').all(req.params.authId);
  res.json({ ...auth, history });
});

// Provider submits authorization request
router.post('/submit', (req, res) => {
  const authId = 'AUTH' + String(Date.now()).slice(-6);
  const { patient_id, insurance_id, auth_type, procedure_code, procedure_description, icd_codes, cpt_codes, units, provider_id, dos_from, dos_to, notes } = req.body;

  db.prepare(`
    INSERT INTO authorizations (auth_id, patient_id, insurance_id, auth_type, status, procedure_code, procedure_description, icd_codes, cpt_codes, units, provider_id, submission_date, notes)
    VALUES (?, ?, ?, ?, 'intake', ?, ?, ?, ?, ?, ?, date('now'), ?)
  `).run(authId, patient_id, insurance_id, auth_type, procedure_code, procedure_description, icd_codes, cpt_codes, units || 1, provider_id, notes);

  db.prepare(`INSERT INTO auth_history (auth_id, action, performed_by, notes) VALUES (?, 'submitted', 'provider', ?)`).run(authId, 'Provider submitted authorization request');

  res.json({ auth_id: authId, status: 'intake', message: 'Authorization request submitted to payer' });
});

// Provider submits RETRO authorization (DOS outside validity period)
router.post('/retro-submit', (req, res) => {
  const authId = 'RETRO' + String(Date.now()).slice(-6);
  const { original_auth_id, patient_id, dos, auth_type, procedure_code, cpt_codes, icd_codes, units, reason } = req.body;

  const origAuth = original_auth_id ? db.prepare('SELECT * FROM authorizations WHERE auth_id = ?').get(original_auth_id) : null;
  const insurance_id = origAuth ? origAuth.insurance_id : null;

  const notes = '[RETRO AUTHORIZATION] Original Auth: ' + (original_auth_id || 'N/A') + ' | Actual DOS: ' + dos + ' | Reason: ' + (reason || '');

  db.prepare(`
    INSERT INTO authorizations (auth_id, patient_id, insurance_id, auth_type, status, procedure_code, icd_codes, cpt_codes, units, submission_date, notes)
    VALUES (?, ?, ?, ?, 'retro_pending', ?, ?, ?, ?, date('now'), ?)
  `).run(authId, patient_id, insurance_id, auth_type, procedure_code, icd_codes, cpt_codes, units || 1, notes);

  db.prepare(`INSERT INTO auth_history (auth_id, action, performed_by, notes) VALUES (?, 'retro_submitted', 'provider', ?)`).run(authId, 'Retro authorization submitted. Original Auth: ' + (original_auth_id || 'N/A') + ' | DOS: ' + dos + ' | Reason: ' + (reason || ''));

  res.json({ auth_id: authId, status: 'retro_pending', message: 'Retro authorization submitted to payer for review' });
});

// Provider verifies authorization from payer — accepts optional DOS parameter for validity check
router.get('/verify/:authId', (req, res) => {
  const auth = db.prepare('SELECT * FROM authorizations WHERE auth_id = ?').get(req.params.authId);
  if (!auth) return res.status(404).json({ error: 'Not found' });
  const dos = req.query.dos || null;
  var isExpired = false, isActive = false, dosStatus = null;
  if (auth.authorization_number && auth.effective_date && auth.expiration_date) {
    const today = new Date().toISOString().split('T')[0];
    isExpired = today > auth.expiration_date;
    isActive = auth.status === 'approved' && !isExpired;
    if (dos) {
      if (dos < auth.effective_date) dosStatus = 'before_validity';
      else if (dos > auth.expiration_date) dosStatus = 'expired';
      else dosStatus = 'within_validity';
    }
  }
  const remainingAmount = (auth.authorized_amount || 0) - (auth.used_amount || 0);
  const remainingDays = auth.expiration_date ? Math.ceil((new Date(auth.expiration_date) - new Date()) / (1000 * 60 * 60 * 24)) : null;
  res.json({
    auth_id: auth.auth_id,
    patient_id: auth.patient_id,
    insurance_id: auth.insurance_id,
    status: auth.status,
    is_active: isActive,
    is_expired: isExpired,
    dos_check: dosStatus,
    authorization_number: auth.authorization_number,
    submission_date: auth.submission_date,
    effective_date: auth.effective_date,
    expiration_date: auth.expiration_date,
    authorized_amount: auth.authorized_amount || 0,
    used_amount: auth.used_amount || 0,
    remaining_amount: remainingAmount,
    remaining_days: remainingDays,
    procedure_code: auth.procedure_code,
    procedure_description: auth.procedure_description,
    cpt_codes: auth.cpt_codes,
    icd_codes: auth.icd_codes,
    auth_type: auth.auth_type,
    notes: auth.notes
  });
});

// ==================== PAYER SIDE ====================

// Payer: Get all authorizations in queue (intake/pending)
router.get('/payer/queue', (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT a.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn, p.dob,
           i.payer_name, i.member_id as ins_member_id, i.group_number,
           pr.first_name as prov_first, pr.last_name as prov_last, pr.npi as prov_npi
    FROM authorizations a
    LEFT JOIN patients p ON a.patient_id = p.patient_id
    LEFT JOIN insurances i ON a.insurance_id = i.id
    LEFT JOIN providers pr ON a.provider_id = pr.provider_id
    WHERE 1=1
  `;
  const params = [];
  if (status) { query += ' AND a.status = ?'; params.push(status); }
  query += ' ORDER BY a.submission_date ASC, a.created_at ASC';
  res.json(db.prepare(query).all(...params));
});

// Payer: Start Clinical Review
router.put('/:authId/start-review', (req, res) => {
  const { reviewed_by } = req.body;
  db.prepare("UPDATE authorizations SET status = 'review' WHERE auth_id = ? AND status = 'intake'").run(req.params.authId);
  db.prepare("INSERT INTO auth_history (auth_id, action, performed_by, notes) VALUES (?, 'review_started', ?, 'Clinical review started')").run(req.params.authId, reviewed_by || 'payer_reviewer');
  res.json({ message: 'Clinical review started' });
});

// Payer: Request Additional Information
router.put('/:authId/request-info', (req, res) => {
  const { requested_by, info_needed, deadline } = req.body;
  db.prepare("UPDATE authorizations SET status = 'pend' WHERE auth_id = ?").run(req.params.authId);
  db.prepare("INSERT INTO auth_history (auth_id, action, performed_by, notes) VALUES (?, 'info_requested', ?, ?)").run(req.params.authId, requested_by || 'payer_reviewer', 'Additional information needed: ' + (info_needed || ''));
  res.json({ message: 'Additional information requested' });
});

// Payer: Approve Authorization (works from review, retro_pending, hold)
router.put('/:authId/approve', (req, res) => {
  const auth = db.prepare("SELECT * FROM authorizations WHERE auth_id = ?").get(req.params.authId);
  if (!auth) return res.status(404).json({ error: 'Not found' });
  const { authorization_number, effective_date, expiration_date, authorized_amount, approved_by } = req.body;
  if (!authorization_number) return res.status(400).json({ error: 'Authorization number is required' });
  if (!effective_date || !expiration_date) return res.status(400).json({ error: 'Both valid from and valid to dates are required' });
  db.prepare(`
    UPDATE authorizations SET status='approved', authorization_number=?, effective_date=?, expiration_date=?, authorized_amount=?, remaining_amount=?, approval_date=date('now') WHERE auth_id=?
  `).run(authorization_number, effective_date, expiration_date, authorized_amount || 0, authorized_amount || 0, req.params.authId);
  var histNote = 'Approved. Auth#' + authorization_number + ' Valid: ' + effective_date + ' to ' + expiration_date + ' Amt:$' + (authorized_amount || 0);
  if (auth.status === 'retro_pending') histNote = 'RETRO APPROVED. ' + histNote;
  db.prepare("INSERT INTO auth_history (auth_id, action, performed_by, notes) VALUES (?, 'approved', ?, ?)").run(req.params.authId, approved_by || 'payer_approver', histNote);
  res.json({ message: 'Authorization approved', auth_id: req.params.authId, authorization_number: authorization_number });
});

// Payer: Deny Authorization
router.put('/:authId/deny', (req, res) => {
  const { denied_by, denial_reason, denial_code } = req.body;
  db.prepare("UPDATE authorizations SET status='denied' WHERE auth_id=?").run(req.params.authId);
  db.prepare("INSERT INTO auth_history (auth_id, action, performed_by, notes) VALUES (?, 'denied', ?, ?)").run(req.params.authId, denied_by || 'payer_reviewer', 'Denied. Reason: ' + (denial_reason || '') + ' Code: ' + (denial_code || ''));
  res.json({ message: 'Authorization denied' });
});

// Provider: Appeal Denial
router.post('/:authId/appeal', (req, res) => {
  const { appealed_by, appeal_reason, clinical_justification } = req.body;
  const auth = db.prepare("SELECT * FROM authorizations WHERE auth_id = ?").get(req.params.authId);
  if (!auth) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE authorizations SET status='appeal' WHERE auth_id=?").run(req.params.authId);
  db.prepare("INSERT INTO auth_history (auth_id, action, performed_by, notes) VALUES (?, 'appeal_submitted', ?, ?)").run(req.params.authId, appealed_by || 'provider', 'Appeal: ' + (appeal_reason || '') + ' Justification: ' + (clinical_justification || ''));
  res.json({ message: 'Appeal submitted' });
});

// Provider: Peer-to-Peer Review Request
router.post('/:authId/peer-review', (req, res) => {
  const { requested_by, payer_director } = req.body;
  db.prepare("UPDATE authorizations SET status='peer_review' WHERE auth_id=?").run(req.params.authId);
  db.prepare("INSERT INTO auth_history (auth_id, action, performed_by, notes) VALUES (?, 'peer_review_requested', ?, ?)").run(req.params.authId, requested_by || 'provider', 'Peer-to-peer review requested with ' + (payer_director || 'payer medical director'));
  res.json({ message: 'Peer-to-peer review scheduled' });
});

// Provider: Resubmit authorization after uploading additional docs (pend → review)
router.put('/:authId/resubmit', (req, res) => {
  const auth = db.prepare("SELECT * FROM authorizations WHERE auth_id = ?").get(req.params.authId);
  if (!auth) return res.status(404).json({ error: 'Not found' });
  if (auth.status !== 'pend') return res.status(400).json({ error: 'Can only resubmit from PEND status' });
  const { notes } = req.body;
  db.prepare("UPDATE authorizations SET status = 'review' WHERE auth_id = ?").run(req.params.authId);
  db.prepare("INSERT INTO auth_history (auth_id, action, performed_by, notes) VALUES (?, 'resubmitted', 'provider', ?)").run(req.params.authId, 'Provider resubmitted after uploading docs. ' + (notes || ''));
  res.json({ message: 'Authorization resubmitted to payer for review' });
});

// Payer: Hold authorization
router.put('/:authId/hold', (req, res) => {
  const auth = db.prepare("SELECT * FROM authorizations WHERE auth_id = ?").get(req.params.authId);
  if (!auth) return res.status(404).json({ error: 'Not found' });
  const { held_by, reason } = req.body;
  db.prepare("UPDATE authorizations SET status = 'hold' WHERE auth_id = ?").run(req.params.authId);
  db.prepare("INSERT INTO auth_history (auth_id, action, performed_by, notes) VALUES (?, 'held', ?, ?)").run(req.params.authId, held_by || 'payer', 'Authorization placed on hold. ' + (reason || ''));
  res.json({ message: 'Authorization placed on hold' });
});

// Payer: Release from hold (hold → review)
router.put('/:authId/release', (req, res) => {
  const auth = db.prepare("SELECT * FROM authorizations WHERE auth_id = ?").get(req.params.authId);
  if (!auth) return res.status(404).json({ error: 'Not found' });
  const { released_by, notes } = req.body;
  db.prepare("UPDATE authorizations SET status = 'review' WHERE auth_id = ?").run(req.params.authId);
  db.prepare("INSERT INTO auth_history (auth_id, action, performed_by, notes) VALUES (?, 'released_from_hold', ?, ?)").run(req.params.authId, released_by || 'payer', 'Released from hold. ' + (notes || ''));
  res.json({ message: 'Authorization released from hold' });
});

// Cancel authorization
router.delete('/:authId', (req, res) => {
  db.prepare('DELETE FROM auth_attachments WHERE auth_id = ?').run(req.params.authId);
  db.prepare('DELETE FROM auth_history WHERE auth_id = ?').run(req.params.authId);
  db.prepare('DELETE FROM authorizations WHERE auth_id = ?').run(req.params.authId);
  res.json({ message: 'Authorization deleted' });
});

// ==================== ATTACHMENTS ====================

// Upload files to authorization
router.post('/:authId/upload', authUpload.array('files', 20), (req, res) => {
  const insert = db.prepare(`INSERT INTO auth_attachments (auth_id, file_name, file_path, file_type, file_size, attachment_type) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const file of req.files) {
    const type = file.mimetype.startsWith('image') ? 'image' : file.mimetype === 'application/pdf' ? 'pdf' : 'document';
    insert.run(req.params.authId, file.originalname, file.path, file.mimetype, file.size, type);
  }
  db.prepare(`INSERT INTO auth_history (auth_id, action, performed_by, notes) VALUES (?, 'documents_uploaded', 'provider', ?)`).run(req.params.authId, 'Uploaded ' + req.files.length + ' document(s)');
  res.json({ message: 'Files uploaded', count: req.files.length });
});

// List attachments for authorization
router.get('/:authId/attachments', (req, res) => {
  const files = db.prepare('SELECT * FROM auth_attachments WHERE auth_id = ? ORDER BY created_at DESC').all(req.params.authId);
  res.json(files);
});

// View attachment
router.get('/attachment/:id/view', (req, res) => {
  const file = db.prepare('SELECT * FROM auth_attachments WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.resolve(file.file_path));
});

// Download attachment
router.get('/attachment/:id/download', (req, res) => {
  const file = db.prepare('SELECT * FROM auth_attachments WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'Not found' });
  res.download(path.resolve(file.file_path), file.file_name);
});

// Delete attachment
router.delete('/attachment/:id', (req, res) => {
  const file = db.prepare('SELECT * FROM auth_attachments WHERE id = ?').get(req.params.id);
  if (file && fs.existsSync(file.file_path)) fs.unlinkSync(file.file_path);
  db.prepare('DELETE FROM auth_attachments WHERE id = ?').run(req.params.id);
  res.json({ message: 'Attachment deleted' });
});

module.exports = router;
