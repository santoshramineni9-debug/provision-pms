const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => { res.set('Content-Disposition', 'inline'); res.set('X-Content-Type-Options', 'nosniff'); }
}));

async function start() {
  const db = require('./db');
  await db.ready;

  // Add card_image columns to insurances table if missing
  try { db.prepare("ALTER TABLE insurances ADD COLUMN card_image_front TEXT").run(); } catch(e) {}
  try { db.prepare("ALTER TABLE insurances ADD COLUMN card_image_back TEXT").run(); } catch(e) {}

  db.prepare(`CREATE TABLE IF NOT EXISTS training_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    mime_type TEXT DEFAULT 'video/mp4',
    uploaded_at TEXT DEFAULT (datetime('now')),
    sort_order INTEGER DEFAULT 0
  )`).run();

  db.prepare(`CREATE TABLE IF NOT EXISTS training_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    full_name TEXT DEFAULT '',
    role TEXT DEFAULT 'user',
    permissions TEXT DEFAULT '[]',
    fee_amount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    due_date TEXT DEFAULT '',
    access_until TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();

  const existingUsers = db.prepare('SELECT COUNT(*) as cnt FROM training_users').get();
  if (existingUsers.cnt === 0) {
    db.prepare('INSERT INTO training_users (email, password, full_name, role, permissions, fee_amount, paid_amount, due_date, access_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('admin@provision.com', 'admin123', 'Administrator', 'admin', '["all"]', 0, 0, '', '');
    db.prepare('INSERT INTO training_users (email, password, full_name, role, permissions, fee_amount, paid_amount, due_date, access_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('trainer@provision.com', 'trainer123', 'Trainer', 'trainer', '["all"]', 0, 0, '', '');
  }

  app.use('/api/patients', require('./routes/patients'));
  app.use('/api/eligibility', require('./routes/eligibility'));
  app.use('/api/appointments', require('./routes/appointments'));
  app.use('/api/providers', require('./routes/providers'));
  app.use('/api/charges', require('./routes/charges'));
  app.use('/api/payments', require('./routes/payments'));
  app.use('/api/ar', require('./routes/ar'));
  app.use('/api/authorizations', require('./routes/authorizations'));
  app.use('/api/medical-records', require('./routes/medicalRecords'));
  app.use('/api/inpatient', require('./routes/inpatient'));
  app.use('/api/rejections', require('./routes/rejections'));
  app.use('/api/offset-tracking', require('./routes/offsetTracking'));
  app.use('/api/adjudication', require('./routes/adjudication'));
  app.use('/api/cms1500', require('./routes/cms1500'));
  app.use('/api/appeals', require('./routes/appeals'));
  app.use('/api/corrected-claim', require('./routes/correctedClaims'));
  app.use('/api/documents', require('./routes/documents'));

  // ============ MEDICAL CODING REVIEW API ============
  app.get('/api/coding/reviews', (req, res) => {
    const { status, search } = req.query;
    let q = 'SELECT * FROM coding_reviews WHERE 1=1';
    const params = [];
    if (status && status !== 'all') { q += ' AND status = ?'; params.push(status); }
    if (search) { q += ' AND (review_id LIKE ? OR patient_name LIKE ? OR patient_id LIKE ? OR chief_complaint LIKE ?)'; params.push(`%${search}%`,`%${search}%`,`%${search}%`,`%${search}%`); }
    q += ' ORDER BY id DESC';
    res.json(db.prepare(q).all(...params));
  });

  app.get('/api/coding/reviews/:id', (req, res) => {
    const review = db.prepare('SELECT * FROM coding_reviews WHERE review_id = ?').get(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    review.checkpoints = db.prepare('SELECT * FROM coding_checkpoints WHERE review_id = ? ORDER BY id').all(req.params.id);
    review.documents = db.prepare('SELECT * FROM coding_documents WHERE review_id = ? ORDER BY id').all(req.params.id);
    review.icd_codes = db.prepare('SELECT * FROM coding_icd WHERE review_id = ? ORDER BY sequence_order').all(req.params.id);
    review.cpt_codes = db.prepare('SELECT * FROM coding_cpt WHERE review_id = ? ORDER BY id').all(req.params.id);
    review.audit_log = db.prepare('SELECT * FROM coding_audit_log WHERE review_id = ? ORDER BY id DESC LIMIT 50').all(req.params.id);
    res.json(review);
  });

  app.post('/api/coding/reviews', (req, res) => {
    const b = req.body;
    const count = db.prepare("SELECT COUNT(*) as c FROM coding_reviews").get().c;
    const reviewId = 'CRV' + String(count + 1).padStart(3, '0');
    db.prepare(`INSERT INTO coding_reviews (review_id,patient_id,patient_name,dob,gender,encounter_date,encounter_type,visit_type,provider_id,provider_name,facility,chief_complaint,history_of_illness,review_of_systems,physical_exam,assessment,plan,clinical_notes,medical_record_text,status,assigned_coder) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      reviewId, b.patient_id||'', b.patient_name||'', b.dob||'', b.gender||'', b.encounter_date||'', b.encounter_type||'', b.visit_type||'',
      b.provider_id||'', b.provider_name||'', b.facility||'', b.chief_complaint||'', b.history_of_illness||'', b.review_of_systems||'',
      b.physical_exam||'', b.assessment||'', b.plan||'', b.clinical_notes||'', b.medical_record_text||'', 'pending_review', b.assigned_coder||''
    );
    db.prepare('INSERT INTO coding_audit_log (review_id,action,actor,details) VALUES (?,?,?,?)').run(reviewId,'created',b.assigned_coder||'System','Review created');
    const defaultCPs = [['Demographics Verified','Documentation'],['Insurance Verified','Documentation'],['Chief Complaint Documented','Clinical'],['HPI Complete','Clinical'],['ROS Complete','Clinical'],['Physical Exam Complete','Clinical'],['Assessment Documented','Clinical'],['Plan Documented','Clinical'],['Orders Reviewed','Documentation'],['Modifier Review','Coding'],['ICD-10 Validation','Coding'],['CPT Validation','Coding'],['Medical Necessity Check','Compliance'],['CDI Review','Compliance'],['Ready for Billing','Administrative']];
    for (const cp of defaultCPs) {
      db.prepare('INSERT INTO coding_checkpoints (review_id,checkpoint_name,checkpoint_category,is_checked) VALUES (?,?,?,0)').run(reviewId, cp[0], cp[1]);
    }
    res.json({ review_id: reviewId });
  });

  app.put('/api/coding/reviews/:id', (req, res) => {
    const b = req.body;
    const fields = []; const vals = [];
    const allowed = ['status','assigned_coder','coder_notes','chief_complaint','history_of_illness','review_of_systems','physical_exam','assessment','plan','clinical_notes','medical_record_text','encounter_type','visit_type','provider_id','provider_name','patient_name','dob','gender','encounter_date'];
    for (const k of allowed) { if (b[k] !== undefined) { fields.push(k+'=?'); vals.push(b[k]); } }
    if (fields.length === 0) return res.status(400).json({error:'No fields'});
    fields.push("updated_at=datetime('now')");
    vals.push(req.params.id);
    db.prepare(`UPDATE coding_reviews SET ${fields.join(',')} WHERE review_id=?`).run(...vals);
    if (b.status) db.prepare('INSERT INTO coding_audit_log (review_id,action,actor,details) VALUES (?,?,?,?)').run(req.params.id, 'status_changed', b.assigned_coder||'System', 'Status -> ' + b.status);
    res.json({ok:true});
  });

  app.delete('/api/coding/reviews/:id', (req, res) => {
    db.prepare('DELETE FROM coding_checkpoints WHERE review_id=?').run(req.params.id);
    db.prepare('DELETE FROM coding_documents WHERE review_id=?').run(req.params.id);
    db.prepare('DELETE FROM coding_icd WHERE review_id=?').run(req.params.id);
    db.prepare('DELETE FROM coding_cpt WHERE review_id=?').run(req.params.id);
    db.prepare('DELETE FROM coding_audit_log WHERE review_id=?').run(req.params.id);
    db.prepare('DELETE FROM coding_reviews WHERE review_id=?').run(req.params.id);
    res.json({ok:true});
  });

  app.post('/api/coding/reviews/:id/checkpoints', (req, res) => {
    const b = req.body;
    const r = db.prepare('INSERT INTO coding_checkpoints (review_id,checkpoint_name,checkpoint_category,is_checked,checked_by,notes,severity) VALUES (?,?,?,?,?,?,?)').run(req.params.id, b.checkpoint_name, b.checkpoint_category||'Custom', b.is_checked||0, b.checked_by||'', b.notes||'', b.severity||'info');
    res.json({id: r.lastInsertRowid});
  });

  app.put('/api/coding/checkpoints/:cpId', (req, res) => {
    const b = req.body;
    const fields = []; const vals = [];
    if (b.is_checked !== undefined) { fields.push('is_checked=?'); vals.push(b.is_checked); }
    if (b.checked_by !== undefined) { fields.push('checked_by=?'); vals.push(b.checked_by); }
    if (b.notes !== undefined) { fields.push('notes=?'); vals.push(b.notes); }
    if (b.severity !== undefined) { fields.push('severity=?'); vals.push(b.severity); }
    if (fields.length === 0) return res.status(400).json({error:'No fields'});
    vals.push(req.params.cpId);
    db.prepare(`UPDATE coding_checkpoints SET ${fields.join(',')} WHERE id=?`).run(...vals);
    res.json({ok:true});
  });

  app.delete('/api/coding/checkpoints/:cpId', (req, res) => {
    db.prepare('DELETE FROM coding_checkpoints WHERE id=?').run(req.params.cpId);
    res.json({ok:true});
  });

  app.post('/api/coding/reviews/:id/icd', (req, res) => {
    const b = req.body;
    const maxSeq = db.prepare('SELECT COALESCE(MAX(sequence_order),0)+1 as s FROM coding_icd WHERE review_id=?').get(req.params.id).s;
    const r = db.prepare('INSERT INTO coding_icd (review_id,icd_code,icd_description,sequence_order,is_primary,added_by) VALUES (?,?,?,?,?,?)').run(req.params.id, b.icd_code, b.icd_description||'', b.sequence_order||maxSeq, b.is_primary||0, b.added_by||'');
    res.json({id: r.lastInsertRowid});
  });

  app.delete('/api/coding/icd/:icdId', (req, res) => {
    db.prepare('DELETE FROM coding_icd WHERE id=?').run(req.params.icdId);
    res.json({ok:true});
  });

  app.put('/api/coding/icd/:icdId', (req, res) => {
    const b = req.body;
    const fields = []; const vals = [];
    if (b.is_primary !== undefined) { fields.push('is_primary=?'); vals.push(b.is_primary); }
    if (b.sequence_order !== undefined) { fields.push('sequence_order=?'); vals.push(b.sequence_order); }
    if (fields.length === 0) return res.status(400).json({error:'No fields'});
    vals.push(req.params.icdId);
    db.prepare(`UPDATE coding_icd SET ${fields.join(',')} WHERE id=?`).run(...vals);
    res.json({ok:true});
  });

  app.post('/api/coding/reviews/:id/cpt', (req, res) => {
    const b = req.body;
    const r = db.prepare('INSERT INTO coding_cpt (review_id,cpt_code,cpt_description,units,modifier1,modifier2,modifier3,charge_amount,is_approved,added_by) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
      req.params.id, b.cpt_code, b.cpt_description||'', b.units||1, b.modifier1||'', b.modifier2||'', b.modifier3||'', b.charge_amount||0, b.is_approved||0, b.added_by||''
    );
    res.json({id: r.lastInsertRowid});
  });

  app.delete('/api/coding/cpt/:cptId', (req, res) => {
    db.prepare('DELETE FROM coding_cpt WHERE id=?').run(req.params.cptId);
    res.json({ok:true});
  });

  app.put('/api/coding/cpt/:cptId', (req, res) => {
    const b = req.body;
    const fields = []; const vals = [];
    for (const k of ['units','modifier1','modifier2','modifier3','charge_amount','is_approved']) {
      if (b[k] !== undefined) { fields.push(k+'=?'); vals.push(b[k]); }
    }
    if (fields.length === 0) return res.status(400).json({error:'No fields'});
    vals.push(req.params.cptId);
    db.prepare(`UPDATE coding_cpt SET ${fields.join(',')} WHERE id=?`).run(...vals);
    res.json({ok:true});
  });

  app.post('/api/coding/reviews/:id/documents', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({error:'No file uploaded'});
    const b = req.body;
    const r = db.prepare('INSERT INTO coding_documents (review_id,doc_type,doc_category,file_name,file_path,file_size,mime_type,description,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?)').run(
      req.params.id, b.doc_type||'document', b.doc_category||'other', req.file.originalname,
      'uploads/' + req.file.filename, req.file.size, req.file.mimetype, b.description||'', b.uploaded_by||''
    );
    res.json({id: r.lastInsertRowid, file_name: req.file.originalname});
  });

  app.delete('/api/coding/documents/:docId', (req, res) => {
    const doc = db.prepare('SELECT * FROM coding_documents WHERE id=?').get(req.params.docId);
    if (doc) {
      const cleanPath = doc.file_path.replace(/^\/+/, '');
      const fp = path.join(__dirname, cleanPath);
      if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch(e){} }
      db.prepare('DELETE FROM coding_documents WHERE id=?').run(req.params.docId);
    }
    res.json({ok:true});
  });

  app.get('/api/coding/documents/:docId/download', (req, res) => {
    const doc = db.prepare('SELECT * FROM coding_documents WHERE id=?').get(req.params.docId);
    if (!doc) return res.status(404).json({error:'Document not found'});
    const cleanPath = doc.file_path.replace(/^\/+/, '');
    const fp = path.join(__dirname, cleanPath);
    if (!fs.existsSync(fp)) return res.status(404).json({error:'File not found on disk'});
    res.download(fp, doc.file_name);
  });

  app.get('/api/coding/documents/:docId/view', (req, res) => {
    const doc = db.prepare('SELECT * FROM coding_documents WHERE id=?').get(req.params.docId);
    if (!doc) return res.status(404).json({error:'Document not found'});
    const cleanPath = doc.file_path.replace(/^\/+/, '');
    const fp = path.join(__dirname, cleanPath);
    if (!fs.existsSync(fp)) return res.status(404).json({error:'File not found on disk'});
    const buf = fs.readFileSync(fp);
    const isPDF = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
    const isImage = doc.mime_type && doc.mime_type.startsWith('image/');
    if (isPDF) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="' + doc.file_name + '"');
      fs.createReadStream(fp).pipe(res);
    } else if (isImage) {
      res.setHeader('Content-Type', doc.mime_type);
      res.setHeader('Content-Disposition', 'inline; filename="' + doc.file_name + '"');
      fs.createReadStream(fp).pipe(res);
    } else {
      const content = buf.toString('utf8');
      res.setHeader('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html><html><head><title>${doc.file_name}</title><style>body{font-family:'Segoe UI',Arial,sans-serif;max-width:900px;margin:40px auto;padding:20px;background:#f5f5f5}h1{color:#1a237e;font-size:20px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)}td,th{padding:10px 14px;text-align:left;border-bottom:1px solid #eee;font-size:13px}th{background:#e8eaf6;color:#1a237e;width:160px}.content{background:#fff;padding:20px;border-radius:8px;margin-top:16px;box-shadow:0 2px 8px rgba(0,0,0,0.1);white-space:pre-wrap;font-family:'Courier New',monospace;font-size:13px;line-height:1.6}.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600}.badge-radiology{background:#e3f2fd;color:#1565c0}.badge-lab{background:#e8f5e9;color:#2e7d32}.badge-ecg{background:#fce4ec;color:#c62828}.badge-clinical{background:#fff3e0;color:#e65100}.badge-other{background:#eceff1;color:#455a64}</style></head><body><h1>&#x1F4C4; ${doc.file_name}</h1><table><tr><th>Document Type</th><td>${doc.doc_type||'N/A'}</td></tr><tr><th>Category</th><td><span class="badge badge-${doc.doc_category||'other'}">${doc.doc_category||'N/A'}</span></td></tr><tr><th>Description</th><td>${doc.description||'N/A'}</td></tr><tr><th>File Size</th><td>${(doc.file_size/1024).toFixed(1)} KB</td></tr><tr><th>MIME Type</th><td>${doc.mime_type||'N/A'}</td></tr><tr><th>Uploaded By</th><td>${doc.uploaded_by||'Unknown'}</td></tr></table><div class="content">${content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div></body></html>`);
    }
  });

  app.post('/api/coding/reviews/:id/send-to-billing', (req, res) => {
    const review = db.prepare('SELECT * FROM coding_reviews WHERE review_id=?').get(req.params.id);
    if (!review) return res.status(404).json({error:'Review not found'});
    const unchecked = db.prepare("SELECT COUNT(*) as c FROM coding_checkpoints WHERE review_id=? AND is_checked=0 AND checkpoint_category IN ('Coding','Clinical')").get(req.params.id).c;
    if (unchecked > 0) return res.status(400).json({error:`${unchecked} required checkpoints incomplete`});
    const batchCount = db.prepare("SELECT COUNT(*) as c FROM coding_reviews WHERE sent_to_billing=1").get().c;
    const batchId = 'BAT' + String(batchCount + 1).padStart(4, '0');
    const now = new Date().toISOString();
    db.prepare("UPDATE coding_reviews SET status='sent_to_billing', sent_to_billing=1, sent_to_billing_at=?, billing_batch_id=? WHERE review_id=?").run(now, batchId, req.params.id);
    db.prepare('INSERT INTO coding_audit_log (review_id,action,actor,details) VALUES (?,?,?,?)').run(req.params.id, 'sent_to_billing', req.body.actor||'Coder', 'Batch: ' + batchId);
    res.json({ok:true, batch_id: batchId});
  });

  app.get('/api/coding/suggest-icd', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json([]);
    res.json(db.prepare("SELECT code, description, category FROM master_icd WHERE (LOWER(code) LIKE ? OR LOWER(description) LIKE ?) AND status='active' LIMIT 20").all(`%${q}%`, `%${q}%`));
  });

  app.get('/api/coding/suggest-cpt', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json([]);
    res.json(db.prepare("SELECT code, description, category, fee_schedule FROM master_cpt WHERE (LOWER(code) LIKE ? OR LOWER(description) LIKE ?) AND status='active' LIMIT 20").all(`%${q}%`, `%${q}%`));
  });

  app.post('/api/coding/auto-suggest', (req, res) => {
    const { text, encounter_type } = req.body;
    if (!text) return res.json({icd:[], cpt:[]});
    const words = text.toLowerCase().split(/[\s,;.]+/).filter(w => w.length > 3);
    let icdResults = []; let cptResults = [];
    for (const w of words) {
      const icds = db.prepare("SELECT code, description, category FROM master_icd WHERE LOWER(description) LIKE ? AND status='active' LIMIT 5").all(`%${w}%`);
      icdResults.push(...icds);
    }
    const seen = new Set();
    icdResults = icdResults.filter(r => { if (seen.has(r.code)) return false; seen.add(r.code); return true; }).slice(0, 10);
    if (encounter_type) {
      cptResults = db.prepare("SELECT code, description, category, fee_schedule FROM master_cpt WHERE LOWER(category) LIKE ? AND status='active' LIMIT 10").all(`%${encounter_type.toLowerCase()}%`);
    }
    if (cptResults.length === 0) {
      for (const w of words) {
        const cpts = db.prepare("SELECT code, description, category, fee_schedule FROM master_cpt WHERE LOWER(description) LIKE ? AND status='active' LIMIT 5").all(`%${w}%`);
        cptResults.push(...cpts);
      }
      const seen2 = new Set();
      cptResults = cptResults.filter(r => { if (seen2.has(r.code)) return false; seen2.add(r.code); return true; }).slice(0, 10);
    }
    res.json({ icd: icdResults, cpt: cptResults });
  });

  app.get('/api/coding/stats', (req, res) => {
    const total = db.prepare('SELECT COUNT(*) as c FROM coding_reviews').get().c;
    const pending = db.prepare("SELECT COUNT(*) as c FROM coding_reviews WHERE status='pending_review'").get().c;
    const reviewing = db.prepare("SELECT COUNT(*) as c FROM coding_reviews WHERE status='reviewing'").get().c;
    const sent = db.prepare("SELECT COUNT(*) as c FROM coding_reviews WHERE status='sent_to_billing'").get().c;
    const completed = db.prepare("SELECT COUNT(*) as c FROM coding_reviews WHERE status='completed'").get().c;
    const totalICD = db.prepare('SELECT COUNT(*) as c FROM coding_icd').get().c;
    const totalCPT = db.prepare('SELECT COUNT(*) as c FROM coding_cpt').get().c;
    const totalDocs = db.prepare('SELECT COUNT(*) as c FROM coding_documents').get().c;
    res.json({ total, pending, reviewing, sent, completed, totalICD, totalCPT, totalDocs });
  });

  app.get('/api/coding/reviews/:id/audit', (req, res) => {
    res.json(db.prepare('SELECT * FROM coding_audit_log WHERE review_id=? ORDER BY id DESC').all(req.params.id));
  });

  app.get('/api/master/icd/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json(db.prepare("SELECT * FROM master_icd WHERE status='active' ORDER BY code LIMIT 50").all());
    res.json(db.prepare("SELECT * FROM master_icd WHERE (LOWER(code) LIKE ? OR LOWER(description) LIKE ?) AND status='active' ORDER BY code LIMIT 50").all(`%${q}%`, `%${q}%`));
  });
  app.get('/api/master/cpt/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json(db.prepare("SELECT * FROM master_cpt WHERE status='active' ORDER BY code LIMIT 50").all());
    res.json(db.prepare("SELECT * FROM master_cpt WHERE (LOWER(code) LIKE ? OR LOWER(description) LIKE ?) AND status='active' ORDER BY code LIMIT 50").all(`%${q}%`, `%${q}%`));
  });
  app.get('/api/master/modifiers/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    if (!q) return res.json(db.prepare("SELECT * FROM master_modifiers WHERE status='active' ORDER BY code LIMIT 50").all());
    res.json(db.prepare("SELECT * FROM master_modifiers WHERE (LOWER(code) LIKE ? OR LOWER(description) LIKE ?) AND status='active' ORDER BY code LIMIT 50").all(`%${q}%`, `%${q}%`));
  });

  const codingUploads = path.join(uploadsDir, 'coding');
  if (!fs.existsSync(codingUploads)) fs.mkdirSync(codingUploads, { recursive: true });

  // ============ MASTER DATA CRUD ============
  const masterTables = {
    'insurances': { table: 'master_insurances', idField: 'payer_id', label: 'Payer' },
    'providers': { table: 'master_providers', idField: 'provider_id', label: 'Provider' },
    'cpt': { table: 'master_cpt', idField: 'code', label: 'CPT Code' },
    'icd': { table: 'master_icd', idField: 'code', label: 'ICD Code' },
    'modifiers': { table: 'master_modifiers', idField: 'code', label: 'Modifier' },
    'rooms': { table: 'master_rooms', idField: 'room_number', label: 'Room' },
    'pcp': { table: 'master_pcp', idField: 'pcp_id', label: 'PCP' },
    'hospital': { table: 'master_hospital', idField: 'hospital_id', label: 'Hospital' },
    'npi': { table: 'master_npi', idField: 'npi', label: 'NPI Record' },
  };

  for (const [key, cfg] of Object.entries(masterTables)) {
    app.get(`/api/master-data/${key}`, (req, res) => {
      const { search, status } = req.query;
      let q = `SELECT * FROM ${cfg.table} WHERE 1=1`;
      const params = [];
      if (search) {
        q += ` AND (`;
        const cols = Object.keys(db.prepare(`PRAGMA table_info(${cfg.table})`).all().reduce((a,c)=>{a[c.name]=1;return a;}, {}));
        const searchCols = cols.filter(c => ['code','description','name','payer_name','first_name','last_name','hospital_name','room_number','npi','specialization','taxonomy_desc','organization_name'].includes(c));
        if (searchCols.length === 0) searchCols.push(cols[0] || 'id');
        q += searchCols.map(c => `LOWER(${c}) LIKE ?`).join(' OR ');
        searchCols.forEach(() => params.push(`%${search.toLowerCase()}%`));
        q += ')';
      }
      if (status) { q += ' AND status = ?'; params.push(status); }
      q += ' ORDER BY id DESC LIMIT 500';
      res.json(db.prepare(q).all(...params));
    });

    app.get(`/api/master-data/${key}/:id`, (req, res) => {
      const row = db.prepare(`SELECT * FROM ${cfg.table} WHERE id=?`).get(req.params.id);
      if (!row) return res.status(404).json({error:'Not found'});
      res.json(row);
    });

    app.post(`/api/master-data/${key}`, (req, res) => {
      const cols = Object.keys(req.body).filter(k => req.body[k] !== undefined);
      if (cols.length === 0) return res.status(400).json({error:'No data'});
      const placeholders = cols.map(() => '?').join(',');
      const r = db.prepare(`INSERT INTO ${cfg.table} (${cols.join(',')}) VALUES (${placeholders})`).run(...cols.map(c => req.body[c]));
      res.json({ id: r.lastInsertRowid, ok: true });
    });

    app.put(`/api/master-data/${key}/:id`, (req, res) => {
      const cols = Object.keys(req.body).filter(k => req.body[k] !== undefined);
      if (cols.length === 0) return res.status(400).json({error:'No data'});
      const sets = cols.map(c => `${c}=?`).join(',');
      db.prepare(`UPDATE ${cfg.table} SET ${sets} WHERE id=?`).run(...cols.map(c => req.body[c]), req.params.id);
      res.json({ ok: true });
    });

    app.delete(`/api/master-data/${key}/:id`, (req, res) => {
      db.prepare(`DELETE FROM ${cfg.table} WHERE id=?`).run(req.params.id);
      res.json({ ok: true });
    });

    app.post(`/api/master-data/${key}/bulk-import`, upload.single('file'), (req, res) => {
      if (!req.file) return res.status(400).json({error:'No file uploaded'});
      const content = fs.readFileSync(req.file.path, 'utf8');
      fs.unlinkSync(req.file.path);
      const lines = content.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return res.status(400).json({error:'CSV must have a header row and at least 1 data row'});
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,'').toLowerCase().replace(/ /g,'_'));
      let inserted = 0, skipped = 0, errors = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g,''));
        const row = {};
        headers.forEach((h, j) => { row[h] = vals[j] || ''; });
        const cols = Object.keys(row).filter(k => row[k] !== '' && row[k] !== undefined);
        if (cols.length === 0) { skipped++; continue; }
        try {
          const placeholders = cols.map(() => '?').join(',');
          db.prepare(`INSERT INTO ${cfg.table} (${cols.join(',')}) VALUES (${placeholders})`).run(...cols.map(c => row[c]));
          inserted++;
        } catch(e) { skipped++; errors.push(`Row ${i+1}: ${e.message}`); }
      }
      res.json({ok:true, total: lines.length - 1, inserted, skipped, errors: errors.slice(0, 10)});
    });
  }

  // NPI Lookup (external API simulation - searches local NPI database)
  app.get('/api/npi-lookup', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    if (!q || q.length < 2) return res.json([]);
    const results = db.prepare("SELECT * FROM master_npi WHERE (LOWER(npi) LIKE ? OR LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR LOWER(organization_name) LIKE ? OR LOWER(taxonomy_desc) LIKE ?) LIMIT 20").all(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`);
    if (results.length > 0) return res.json(results);
    // Fallback: generate realistic demo NPI records
    const demoNPIs = [
      {npi:'1234567890',first_name:'Sarah',last_name:'Johnson',credential:'MD',taxonomy_code:'208100000X',taxonomy_desc:'Anesthesiology',address:'123 Medical Center Dr',city:'Houston',state:'TX',zip:'77001',phone:'713-555-0100',provider_type:'Individual'},
      {npi:'2345678901',first_name:'Michael',last_name:'Chen',credential:'DO',taxonomy_code:'207Q00000X',taxonomy_desc:'Family Medicine',address:'456 Healthcare Blvd',city:'Dallas',state:'TX',zip:'75201',phone:'214-555-0200',provider_type:'Individual'},
      {npi:'3456789012',first_name:'Emily',last_name:'Rodriguez',credential:'MD',taxonomy_code:'208000000X',taxonomy_desc:'Pediatrics',address:'789 Childrens Way',city:'Austin',state:'TX',zip:'73301',phone:'512-555-0300',provider_type:'Individual'},
      {npi:'4567890123',first_name:'David',last_name:'Wilson',credential:'MD',taxonomy_code:'2085R0202X',taxonomy_desc:'Diagnostic Radiology',address:'321 Imaging Center',city:'San Antonio',state:'TX',zip:'78201',phone:'210-555-0400',provider_type:'Individual'},
      {npi:'5678901234',first_name:'Lisa',last_name:'Thompson',credential:'PA-C',taxonomy_code:'363L00000X',taxonomy_desc:'Physician Assistant',address:'654 Clinic Rd',city:'Fort Worth',state:'TX',zip:'76101',phone:'817-555-0500',provider_type:'Individual'},
      {npi:'1122334455',first_name:'Provision',last_name:'Medical Center',credential:'',taxonomy_code:'261Q00000X',taxonomy_desc:'Clinic/Center',address:'100 Hospital Blvd',city:'Houston',state:'TX',zip:'77002',phone:'713-555-1000',provider_type:'Organization'},
      {npi:'2233445566',first_name:'Houston',last_name:'General Hospital',credential:'',taxonomy_code:'282N00000X',taxonomy_desc:'General Acute Care Hospital',address:'200 Hospital Way',city:'Houston',state:'TX',zip:'77003',phone:'713-555-2000',provider_type:'Organization'},
      {npi:'3344556677',first_name:'James',last_name:'Anderson',credential:'MD',taxonomy_code:'208600000X',taxonomy_desc:'Surgery',address:'400 Surgical Suite',city:'Dallas',state:'TX',zip:'75202',phone:'214-555-0600',provider_type:'Individual'},
      {npi:'4455667788',first_name:'Patricia',last_name:'Martinez',credential:'MD',taxonomy_code:'207R00000X',taxonomy_desc:'Internal Medicine',address:'500 Internal Med Way',city:'Austin',state:'TX',zip:'73301',phone:'512-555-0700',provider_type:'Individual'},
      {npi:'5566778899',first_name:'Robert',last_name:'Lee',credential:'DPM',taxonomy_code:'213E00000X',taxonomy_desc:'Podiatrist',address:'600 Foot Care Lane',city:'San Antonio',state:'TX',zip:'78202',phone:'210-555-0800',provider_type:'Individual'},
    ];
    const filtered = demoNPIs.filter(d => {
      const s = `${d.npi} ${d.first_name} ${d.last_name} ${d.taxonomy_desc} ${d.organization_name||''}`.toLowerCase();
      return s.includes(q);
    });
    res.json(filtered);
  });

  app.get('/api/insurances/list', (req, res) => {
    const { patient_id } = req.query;
    let q = 'SELECT * FROM insurances';
    const params = [];
    if (patient_id) { q += ' WHERE patient_id = ?'; params.push(patient_id); }
    q += ' ORDER BY id DESC';
    res.json(db.prepare(q).all(...params));
  });

  app.post('/api/training/videos/upload', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });
    const title = req.body.title || req.file.originalname;
    const filepath = '/uploads/' + req.file.filename;
    const info = db.prepare('INSERT INTO training_videos (title, filename, filepath, mime_type) VALUES (?, ?, ?, ?)').run(title, req.file.originalname, filepath, req.file.mimetype || 'video/mp4');
    res.json({ id: info.lastInsertRowid, title, filepath, filename: req.file.originalname });
  });

  app.get('/api/training/videos', (req, res) => {
    res.json(db.prepare('SELECT * FROM training_videos ORDER BY sort_order, id').all());
  });

  app.delete('/api/training/videos/:id', (req, res) => {
    const vid = db.prepare('SELECT * FROM training_videos WHERE id = ?').get(req.params.id);
    if (vid) {
      const fp = path.join(__dirname, vid.filepath);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      db.prepare('DELETE FROM training_videos WHERE id = ?').run(req.params.id);
    }
    res.json({ ok: true });
  });

  app.post('/api/training/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = db.prepare('SELECT id, email, full_name, role, permissions, fee_amount, paid_amount, due_date, access_until FROM training_users WHERE email = ? AND password = ? AND active = 1').get(email, password);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    let perms = [];
    try { perms = JSON.parse(user.permissions || '[]'); } catch(e) { perms = []; }
    var feeInfo = { fee_amount: user.fee_amount || 0, paid_amount: user.paid_amount || 0, due_date: user.due_date || '', access_until: user.access_until || '' };
    res.json({ id: user.id, email: user.email, full_name: user.full_name, role: user.role, permissions: perms, fee: feeInfo });
  });

  app.get('/api/training/users', (req, res) => {
    const users = db.prepare('SELECT id, email, full_name, role, permissions, fee_amount, paid_amount, due_date, access_until, active, created_at FROM training_users ORDER BY id').all();
    users.forEach(u => { try { u.permissions = JSON.parse(u.permissions || '[]'); } catch(e) { u.permissions = []; } });
    res.json(users);
  });

  app.post('/api/training/users', (req, res) => {
    const { email, password, full_name, role, permissions, fee_amount, due_date } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const perms = JSON.stringify(permissions || []);
    var fee = fee_amount || 0;
    var due = due_date || '';
    var accessUntil = '';
    if (due) {
      var d = new Date(due); d.setDate(d.getDate() + 30);
      accessUntil = d.toISOString().split('T')[0];
    }
    try {
      const info = db.prepare('INSERT INTO training_users (email, password, full_name, role, permissions, fee_amount, paid_amount, due_date, access_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(email, password, full_name || '', role || 'user', perms, fee, 0, due, accessUntil);
      res.json({ id: info.lastInsertRowid, email });
    } catch(e) {
      res.status(400).json({ error: 'Email already registered' });
    }
  });

  app.put('/api/training/users/:id', (req, res) => {
    const { full_name, role, active, password, permissions, fee_amount, paid_amount, due_date, access_until } = req.body;
    const perms = permissions !== undefined ? JSON.stringify(permissions) : undefined;
    var sets = [];
    var vals = [];
    if (full_name !== undefined) { sets.push('full_name = ?'); vals.push(full_name || ''); }
    if (role !== undefined) { sets.push('role = ?'); vals.push(role || 'user'); }
    if (active !== undefined) { sets.push('active = ?'); vals.push(active ? 1 : 0); }
    if (password) { sets.push('password = ?'); vals.push(password); }
    if (perms !== undefined) { sets.push('permissions = ?'); vals.push(perms); }
    if (fee_amount !== undefined) { sets.push('fee_amount = ?'); vals.push(fee_amount || 0); }
    if (paid_amount !== undefined) { sets.push('paid_amount = ?'); vals.push(paid_amount || 0); }
    if (due_date !== undefined) { sets.push('due_date = ?'); vals.push(due_date || ''); }
    if (access_until !== undefined) { sets.push('access_until = ?'); vals.push(access_until || ''); }
    if (sets.length === 0) return res.json({ ok: true });
    vals.push(req.params.id);
    db.prepare('UPDATE training_users SET ' + sets.join(', ') + ' WHERE id = ?').run(...vals);
    res.json({ ok: true });
  });

  app.get('/api/training/invoice/:id', (req, res) => {
    const user = db.prepare('SELECT id, email, full_name, fee_amount, paid_amount, due_date, access_until, created_at FROM training_users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    var remaining = (user.fee_amount || 0) - (user.paid_amount || 0);
    res.json({ ...user, remaining: remaining > 0 ? remaining : 0 });
  });

  app.delete('/api/training/users/:id', (req, res) => {
    db.prepare('DELETE FROM training_users WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // ============ FINANCIAL REPORTS API ============
  app.get('/api/reports/monthly-collection', (req, res) => {
    const { year } = req.query;
    const yr = year || new Date().getFullYear();
    const months = [];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const prefix = yr + '-' + mm;
      const payments = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE payment_date LIKE ?").get(prefix + '%');
      const charges = db.prepare("SELECT COALESCE(SUM(billed_amount),0) as total FROM charges WHERE charge_date LIKE ?").get(prefix + '%');
      months.push({ month: monthNames[m-1], month_num: m, collections: payments.total || 0, charges: charges.total || 0 });
    }
    const totalCollections = months.reduce((s, m) => s + m.collections, 0);
    const totalCharges = months.reduce((s, m) => s + m.charges, 0);
    res.json({ year: parseInt(yr), months, totalCollections, totalCharges });
  });

  app.get('/api/reports/dues', (req, res) => {
    const charges = db.prepare("SELECT * FROM charges ORDER BY charge_date DESC").all();
    const today = new Date().toISOString().split('T')[0];
    let totalBilled = 0, totalPaid = 0, totalDue = 0;
    const aging = { '0-30': 0, '31-60': 0, '61-90': 0, '91-120': 0, '120+': 0 };
    const patientDues = {};
    charges.forEach(c => {
      const billed = c.billed_amount || 0;
      const paid = c.paid_amount || 0;
      const due = billed - paid;
      if (due <= 0) return;
      totalBilled += billed;
      totalPaid += paid;
      totalDue += due;
      const pid = c.patient_id;
      if (!patientDues[pid]) patientDues[pid] = { patient_id: pid, total_billed: 0, total_paid: 0, total_due: 0, claims: 0 };
      patientDues[pid].total_billed += billed;
      patientDues[pid].total_paid += paid;
      patientDues[pid].total_due += due;
      patientDues[pid].claims += 1;
      const cDate = new Date(c.charge_date || today);
      const diffDays = Math.floor((new Date(today) - cDate) / (1000 * 60 * 60 * 24));
      if (diffDays <= 30) aging['0-30'] += due;
      else if (diffDays <= 60) aging['31-60'] += due;
      else if (diffDays <= 90) aging['61-90'] += due;
      else if (diffDays <= 120) aging['91-120'] += due;
      else aging['120+'] += due;
    });
    const patientList = Object.values(patientDues).sort((a, b) => b.total_due - a.total_due);
    res.json({ totalBilled, totalPaid, totalDue, aging, patients: patientList.slice(0, 50) });
  });

  app.get('/api/reports/ledger', (req, res) => {
    const { patient_id } = req.query;
    let txns = [];
    if (patient_id) {
      txns = db.prepare("SELECT * FROM patient_transactions WHERE patient_id = ? ORDER BY transaction_date DESC").all(patient_id);
    } else {
      txns = db.prepare("SELECT * FROM patient_transactions ORDER BY transaction_date DESC LIMIT 200").all();
    }
    const payments = db.prepare("SELECT * FROM payments ORDER BY payment_date DESC LIMIT 200").all();
    res.json({ transactions: txns, payments });
  });

  app.get('/api/reports/summary', (req, res) => {
    const totalPatients = db.prepare("SELECT COUNT(*) as c FROM patients").get().c;
    const totalCharges = db.prepare("SELECT COALESCE(SUM(billed_amount),0) as c FROM charges").get().c;
    const totalPaid = db.prepare("SELECT COALESCE(SUM(paid_amount),0) as c FROM charges").get().c;
    const totalPayments = db.prepare("SELECT COALESCE(SUM(amount),0) as c FROM payments").get().c;
    const pendingClaims = db.prepare("SELECT COUNT(*) as c FROM charges WHERE status != 'posted'").get().c;
    const openAR = totalCharges - totalPaid;
    const claimsByStatus = db.prepare("SELECT status, COUNT(*) as count FROM charges GROUP BY status").all();
    res.json({ totalPatients, totalCharges, totalPaid, totalPayments, pendingClaims, openAR, claimsByStatus });
  });

  app.get('/api/reports/training-payments', (req, res) => {
    const users = db.prepare("SELECT id, email, full_name, role, fee_amount, paid_amount, due_date, access_until, active FROM training_users ORDER BY id").all();
    const summary = {
      total_users: users.length,
      total_fees: users.reduce((s, u) => s + (u.fee_amount || 0), 0),
      total_paid: users.reduce((s, u) => s + (u.paid_amount || 0), 0),
      total_due: users.reduce((s, u) => s + Math.max(0, (u.fee_amount || 0) - (u.paid_amount || 0)), 0),
      active: users.filter(u => u.active).length,
      expired: users.filter(u => u.access_until && new Date(u.access_until) < new Date()).length
    };
    res.json({ users, summary });
  });

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // ============ PDF DOWNLOAD - Serve pre-made PDFs ============
  app.get('/api/training/generate-pdf', (req, res) => {
    const pdfPath = path.join(__dirname, 'deploy', 'pdfs', 'AR_Calling_Training_Course.pdf');
    if (fs.existsSync(pdfPath)) {
      res.download(pdfPath, 'Provision_AR_Training_Study_Material.pdf');
    } else {
      res.status(404).json({ error: 'PDF not found. Please contact admin.' });
    }
  });

  app.get('/api/training/generate-billing-pdf', (req, res) => {
    const pdfPath = path.join(__dirname, 'deploy', 'pdfs', 'Medical_Billing_Training_Course.pdf');
    if (fs.existsSync(pdfPath)) {
      res.download(pdfPath, 'Provision_Medical_Billing_Training.pdf');
    } else {
      res.status(404).json({ error: 'PDF not found. Please contact admin.' });
    }
  });

  app.listen(PORT, () => {
    console.log('PMS App running at http://localhost:' + PORT);
  });
}

// Student inquiries storage
const INQUIRIES_FILE = path.join(__dirname, 'student-inquiries.json');
function getInquiries() {
  try { return JSON.parse(fs.readFileSync(INQUIRIES_FILE, 'utf8')); }
  catch(e) { return []; }
}
function saveInquiries(data) { fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(data, null, 2)); }

// API: Get current demo link
app.get('/api/demo-link', (req, res) => { res.json(getDemoLink()); });

// API: Update demo link (admin)
app.post('/api/demo-link', express.json(), (req, res) => {
  const { link, title, schedule } = req.body;
  const data = { link: link || '', title: title || 'Demo Class', schedule: schedule || '', updated: new Date().toISOString() };
  saveDemoLink(data);
  res.json({ ok: true, data });
});

// API: Submit student inquiry
app.post('/api/student-inquiry', express.json(), (req, res) => {
  const { name, phone, email, city, course, batch, message } = req.body;
  if (!name || !phone || !course) return res.status(400).json({ error: 'Name, phone and course required' });
  const demo = getDemoLink();
  const inquiry = {
    id: Date.now(),
    name, phone, email: email || '', city: city || '', course, batch: batch || 'Evening',
    message: message || '', demoLink: demo.link, demoTitle: demo.title, demoSchedule: demo.schedule,
    status: 'new', created: new Date().toISOString()
  };
  const inquiries = getInquiries();
  inquiries.push(inquiry);
  saveInquiries(inquiries);
  // Build WhatsApp message for admin notification
  const adminMsg = encodeURIComponent(` New Student Inquiry!\n\n Name: ${name}\n Phone: ${phone}\n Email: ${email || 'N/A'}\n City: ${city || 'N/A'}\n Course: ${course}\n Batch: ${batch || 'Evening'}\n Message: ${message || 'N/A'}\n\n Sent via Provision AR Website`);
  // Build WhatsApp message for student with demo link
  const studentMsg = encodeURIComponent(`Hi ${name}!\n\n Thank you for your interest in ${course} at Provision AR Training Center!\n\n Here is your demo class link:\n ${demo.link}\n\n Title: ${demo.title}\n Schedule: ${demo.schedule}\n\n Join the demo class to see our training in action.\n\n For any questions, call us:\n  7095-101-102\n  8309456545\n\n Address: Boduppal, Dwarakha Nagar, Hyderabad`);
  res.json({
    ok: true,
    id: inquiry.id,
    adminWhatsApp: `https://wa.me/918309456545?text=${adminMsg}`,
    studentWhatsApp: `https://wa.me/91${phone}?text=${studentMsg}`,
    demoLink: demo.link
  });
});

// API: Get all inquiries (admin)
app.get('/api/student-inquiries', (req, res) => { res.json(getInquiries()); });

// Serve training HTML files
app.get('/ar-calling-scenarios.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ar-calling-scenarios.html')));
app.get('/claim-visual-guide.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'claim-visual-guide.html')));
app.get('/pcp-vs-provider.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pcp-vs-provider.html')));

// ===== WEBSITE CONTENT MANAGEMENT =====
const SITE_CONTENT_FILE = path.join(__dirname, 'site-content.json');
function getSiteContent() {
  try { return JSON.parse(fs.readFileSync(SITE_CONTENT_FILE, 'utf8')); }
  catch(e) {
    return {
      courses: [
        { id:1, name:'AR Calling (Accounts Receivable)', batch:'Jul 2026', status:'New', duration:'45 Days', fee:'15000', visible:true },
        { id:2, name:'Medical Billing Fundamentals', batch:'Jul 2026', status:'New', duration:'60 Days', fee:'18000', visible:true },
        { id:3, name:'Medical Coding (CPT / ICD-10)', batch:'Aug 2026', status:'Open', duration:'90 Days', fee:'25000', visible:true },
        { id:4, name:'Claims Processing & Denials Management', batch:'Aug 2026', status:'Open', duration:'30 Days', fee:'12000', visible:true },
        { id:5, name:'Insurance Verification & Eligibility', batch:'Jul 2026', status:'Filling', duration:'20 Days', fee:'8000', visible:true },
        { id:6, name:'Complete RCM (Revenue Cycle Management)', batch:'Sep 2026', status:'New', duration:'120 Days', fee:'35000', visible:true },
        { id:7, name:'Payment Posting & Reconciliation', batch:'Sep 2026', status:'Open', duration:'25 Days', fee:'10000', visible:true },
        { id:8, name:'EHR / EMR Training (Epic / Cerner)', batch:'Jul 2026', status:'New', duration:'40 Days', fee:'20000', visible:true }
      ],
      demoLink: { link:'https://meet.zoho.in/your-demo-link', title:'AR Calling Demo Class', schedule:'Daily 6:00 PM' },
      announcements: '',
      lastUpdated: new Date().toISOString()
    };
  }
}
function saveSiteContent(data) { data.lastUpdated = new Date().toISOString(); fs.writeFileSync(SITE_CONTENT_FILE, JSON.stringify(data, null, 2)); }

// API: Public - Get all site content (for website)
app.get('/api/site-content', (req, res) => { res.json(getSiteContent()); });

// API: Public - Get courses only
app.get('/api/site-courses', (req, res) => {
  const content = getSiteContent();
  res.json(content.courses.filter(c => c.visible));
});

// API: Admin - Update courses
app.post('/api/site-courses', express.json(), (req, res) => {
  const content = getSiteContent();
  content.courses = req.body.courses || content.courses;
  saveSiteContent(content);
  res.json({ ok: true, courses: content.courses });
});

// API: Admin - Update single course
app.put('/api/site-courses/:id', express.json(), (req, res) => {
  const content = getSiteContent();
  const idx = content.courses.findIndex(c => c.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  content.courses[idx] = { ...content.courses[idx], ...req.body };
  saveSiteContent(content);
  res.json({ ok: true, course: content.courses[idx] });
});

// API: Admin - Add course
app.post('/api/site-courses/add', express.json(), (req, res) => {
  const content = getSiteContent();
  const maxId = content.courses.reduce((m, c) => Math.max(m, c.id), 0);
  const newCourse = { id: maxId + 1, name: req.body.name || 'New Course', batch: req.body.batch || '', status: req.body.status || 'New', duration: req.body.duration || '', fee: req.body.fee || '0', visible: true };
  content.courses.push(newCourse);
  saveSiteContent(content);
  res.json({ ok: true, course: newCourse });
});

// API: Admin - Delete course
app.delete('/api/site-courses/:id', (req, res) => {
  const content = getSiteContent();
  content.courses = content.courses.filter(c => c.id !== parseInt(req.params.id));
  saveSiteContent(content);
  res.json({ ok: true });
});

// API: Admin - Update demo link
app.put('/api/demo-link', express.json(), (req, res) => {
  const content = getSiteContent();
  content.demoLink = { ...content.demoLink, ...req.body };
  saveSiteContent(content);
  // Also save standalone file for backward compat
  saveDemoLink(content.demoLink);
  res.json({ ok: true, demoLink: content.demoLink });
});

// API: Admin - Update announcements
app.post('/api/site-announcements', express.json(), (req, res) => {
  const content = getSiteContent();
  content.announcements = req.body.announcements || '';
  saveSiteContent(content);
  res.json({ ok: true });
});

// API: Admin - Save videos
app.post('/api/site-videos', express.json(), (req, res) => {
  const content = getSiteContent();
  content.videos = req.body.videos || [];
  saveSiteContent(content);
  res.json({ ok: true, videos: content.videos });
});

  // API: Admin - Save course PDFs metadata
  app.post('/api/site-pdfs', express.json(), (req, res) => {
    const content = getSiteContent();
    content.pdfs = req.body.pdfs || [];
    saveSiteContent(content);
    res.json({ ok: true, pdfs: content.pdfs });
  });

  app.get('/api/site-pdfs', (req, res) => {
    const content = getSiteContent();
    res.json(content.pdfs || []);
  });

  // Serve Provision AR Training Website at /training
app.use('/training', express.static(path.join(__dirname, 'website')));

// API: Deploy courses.js + update videos in index.html
app.post('/api/deploy-website', express.json(), (req, res) => {
  try {
    const content = getSiteContent();
    const dl = content.demoLink || {};
    let js = '// ===== AUTO-GENERATED by PMS Website Manager =====\n\n';
    js += 'var SITE_DATA = {\n';
    js += '  demoLink: {\n';
    js += '    title: ' + JSON.stringify(dl.title || 'AR Calling Demo Class') + ',\n';
    js += '    link: ' + JSON.stringify(dl.link || '') + ',\n';
    js += '    schedule: ' + JSON.stringify(dl.schedule || 'Daily 6:00 PM') + '\n';
    js += '  },\n';
    js += '  announcements: ' + JSON.stringify(content.announcements || '') + ',\n';
    js += '  courses: [\n';
    (content.courses || []).forEach(c => {
      js += '    { id:' + c.id + ', name:' + JSON.stringify(c.name) + ', batch:' + JSON.stringify(c.batch) + ', status:' + JSON.stringify(c.status) + ', duration:' + JSON.stringify(c.duration) + ', fee:' + JSON.stringify(String(c.fee)) + ', visible:' + (c.visible ? 'true' : 'false') + ' },\n';
    });
    js += '  ],\n';
    js += '  videos: [\n';
    (content.videos || []).forEach(v => {
      if (v.visible !== false) {
        js += '    { title:' + JSON.stringify(v.title || '') + ', url:' + JSON.stringify(v.url || '') + ', tag:' + JSON.stringify(v.tag || '') + ' },\n';
      }
    });
    js += '  ],\n';
    js += '  pdfs: [\n';
    (content.pdfs || []).forEach(p => {
      js += '    { title:' + JSON.stringify(p.title || '') + ', course:' + JSON.stringify(p.course || '') + ', url:' + JSON.stringify(p.url || '') + ', description:' + JSON.stringify(p.description || '') + ', pages:' + JSON.stringify(p.pages || '') + ', size:' + JSON.stringify(p.size || '') + ' },\n';
    });
    js += '  ]\n};\n';
    const deployDir = path.join(__dirname, 'deploy');
    if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });
    fs.writeFileSync(path.join(deployDir, 'courses.js'), js);

    res.json({ ok: true, message: 'courses.js updated', courses: content.courses.length, videos: (content.videos||[]).length });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Auto-deploy to Vercel
app.post('/api/deploy-vercel', (req, res) => {
  const deployDir = path.join(__dirname, 'deploy');
  exec('npx vercel --prod --yes', { cwd: deployDir, timeout: 120000 }, (err, stdout, stderr) => {
    if (err) {
      console.error('Vercel deploy error:', err.message);
      return res.status(500).json({ ok: false, error: err.message, output: stdout || stderr });
    }
    res.json({ ok: true, output: stdout });
  });
});

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
