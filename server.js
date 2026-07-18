const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const PDFDocument = require('pdfkit');

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

  // ============ PDF GENERATOR - AR Training Study Material ============
  app.get('/api/training/generate-pdf', (req, res) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Provision_AR_Training_Study_Material.pdf"');
    doc.pipe(res);

    const blue = '#1a237e';
    const darkBlue = '#0d47a1';
    const green = '#2e7d32';
    const red = '#c62828';
    const orange = '#e65100';
    const gray = '#555555';

    // Title Page
    doc.fontSize(28).fillColor(blue).text('Provision AR Calling', { align: 'center' });
    doc.fontSize(18).fillColor(darkBlue).text('Practice Management System', { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(24).fillColor(blue).text('AR Training Study Material', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(14).fillColor(gray).text('Complete Reference Guide', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor(gray).text('Medical Billing | Revenue Cycle | AR Calling | Coding Basics', { align: 'center' });
    doc.moveDown(3);
    doc.fontSize(10).fillColor(gray).text('This document covers all essential topics for AR Calling training.', { align: 'center' });
    doc.text('Generated: ' + new Date().toLocaleDateString(), { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#888').text('CONFIDENTIAL - For Training Use Only', { align: 'center' });
    doc.addPage();

    function addTitle(text) {
      doc.fontSize(16).fillColor(blue).text(text, { underline: true });
      doc.moveDown(0.5);
    }
    function addSection(text) {
      doc.fontSize(12).fillColor(darkBlue).text(text);
      doc.moveDown(0.3);
    }
    function addBody(text) {
      doc.fontSize(10).fillColor('#333').text(text, { lineGap: 3 });
      doc.moveDown(0.3);
    }
    function addBullet(text) {
      doc.fontSize(10).fillColor('#333').text('  • ' + text, { lineGap: 2 });
    }
    function addTable(headers, rows) {
      const colW = (doc.page.width - 100) / headers.length;
      doc.fontSize(9).fillColor('#fff');
      doc.rect(doc.x, doc.y, doc.page.width - 100, 18).fill(blue);
      doc.fillColor('#fff');
      headers.forEach((h, i) => { doc.text(h, doc.x + i * colW + 5, doc.y - 16, { width: colW - 10 }); });
      doc.moveDown(0.5);
      rows.forEach((row, ri) => {
        const bgColor = ri % 2 === 0 ? '#f5f5f5' : '#fff';
        doc.fontSize(9).fillColor('#333');
        row.forEach((cell, ci) => { doc.text(String(cell), 50 + ci * colW + 5, doc.y, { width: colW - 10 }); });
        doc.moveDown(0.2);
      });
      doc.moveDown(0.5);
    }
    function addPageBreak() { doc.addPage(); }

    // ========== TABLE OF CONTENTS ==========
    addTitle('Table of Contents');
    addBody('1. What is AR? - Accounts Receivable in Healthcare');
    addBody('2. Medical Billing Process & RCM');
    addBody('3. HIPAA Compliance');
    addBody('4. Patient, Guarantor & Dependent');
    addBody('5. Insurance Types - Medicare, Medicaid, COBRA, TRICARE, CHAMPVA');
    addBody('6. Insurance Modes - Primary, Secondary, Tertiary');
    addBody('7. Managed Care Plans - HMO, PPO, EPO');
    addBody('8. CPT Code Ranges - Office Visits, ER, Inpatient');
    addBody('9. CPT Modifiers - Complete Guide');
    addBody('10. ICD-10 Diagnosis Codes');
    addBody('11. Common Coding Mistakes');
    addBody('12. AR Calling Steps & Script');
    addBody('13. Payment / ERA / EOB Reading');
    addBody('14. Denial Management');
    addBody('15. Timely Filing Rules');
    addBody('16. Mock Call Scenarios');
    addBody('17. Common Denial Codes Reference');
    addBody('18. Glossary of Key Terms');
    addPageBreak();

    // ========== 1. WHAT IS AR ==========
    addTitle('1. What is AR (Accounts Receivable)?');
    addBody('AR stands for "Accounts Receivable" and is a critical part of Medical Billing and Revenue Cycle Management (RCM) in US Healthcare.');
    addSection('Definition:');
    addBody('AR is the money owed to a healthcare provider for services rendered to patients. When a doctor treats a patient, the claim is sent to insurance. Until the claim is paid, it remains as Accounts Receivable.');
    addSection('The Medical Billing Process:');
    addBody('In the USA, when a patient visits a doctor, the patient provides insurance details. The doctor bills the insurance company using claim forms containing:');
    addBullet('Patient Information - Name, DOB, Insurance ID');
    addBullet('Provider Information - Doctor/NPI, Taxonomy, Facility');
    addBullet('Service Performed - CPT/HCPCS codes');
    addBullet('Diagnosis Code - ICD-10 codes');
    addBullet('Billed Amount - Charge for the service');
    addSection('RCM (Revenue Cycle Management):');
    addBody('RCM is the financial process used by healthcare facilities to manage billing, claims, payment, and revenue collection. It covers the entire lifecycle from patient registration to final payment.');
    addPageBreak();

    // ========== 2. MEDICAL BILLING PROCESS ==========
    addTitle('2. Medical Billing Process & RCM');
    addSection('Steps in Medical Billing:');
    addBody('Step 1: Patient Registration - Collect demographics, insurance info');
    addBody('Step 2: Insurance Verification - Check eligibility before service');
    addBody('Step 3: Charge Entry - Enter CPT, ICD, billed amounts');
    addBody('Step 4: Claims Submission - Submit electronically or paper');
    addBody('Step 5: Claims Tracking - Monitor claim status');
    addBody('Step 6: Payment Posting - Post insurance and patient payments');
    addBody('Step 7: Denial Management - Fix and resubmit denied claims');
    addBody('Step 8: AR Follow-up / Calling - Call payers for unpaid claims');
    addBody('Step 9: Patient Billing - Send statements for patient responsibility');
    addBody('Step 10: Collections - Follow up on unpaid patient balances');
    addPageBreak();

    // ========== 3. HIPAA ==========
    addTitle('3. HIPAA Compliance');
    addBody('HIPAA (Health Insurance Portability and Accountability Act) protects patient health information.');
    addSection('Key Rules:');
    addBullet('Privacy Rule - Controls who can access PHI');
    addBullet('Security Rule - Safeguards for electronic PHI (passwords, encryption)');
    addBullet('Breach Notification Rule - Notify patients if PHI is breached');
    addBullet('Enforcement Rule - Penalties from $100 to $50,000 per violation');
    addSection('What is PHI?');
    addBullet('Patient name, DOB, SSN, address, phone');
    addBullet('Medical records and treatment history');
    addBullet('Insurance information and member IDs');
    addBullet('Billing records and claim data');
    addSection('HIPAA in Daily AR Work:');
    addBullet('Never share patient info over unsecured channels');
    addBullet('Verify patient identity before discussing account');
    addBullet('Log out of systems when away from desk');
    addBullet('Do not discuss patient info in public areas');
    addPageBreak();

    // ========== 4. PATIENT & GUARANTOR ==========
    addTitle('4. Patient, Guarantor & Dependent');
    addSection('Patient:');
    addBody('A person receiving medical treatment. Key data: Name (LAST, FIRST format), DOB, SSN, Gender, Address, Phone, Email.');
    addSection('Guarantor:');
    addBody('The person financially responsible for the bill.');
    addBullet('Patient under 18: Guarantor REQUIRED (parent/guardian)');
    addBullet('Patient 18+: Patient is their own guarantor');
    addSection('Subscriber / Policy Holder:');
    addBody('The person who owns the insurance policy. Also called: Member, Insured, Policy Holder. The subscriber\'s info goes on the claim.');
    addSection('Dependent:');
    addBody('A person covered under the subscriber\'s plan (spouse, child under 26). Dependents use the subscriber\'s Member ID but have their own unique ID on the card.');
    addSection('US Naming Format:');
    addBody('LAST NAME, First Name Middle Name (e.g., SMITH, John Robert). Must match insurance card exactly.');
    addPageBreak();

    // ========== 5. INSURANCE TYPES ==========
    addTitle('5. Insurance Types');
    addSection('Medicare (Federal Government Program):');
    addBullet('Part A - Hospital Insurance (inpatient, skilled nursing)');
    addBullet('Part B - Medical Insurance (doctor visits, outpatient)');
    addBullet('Part C - Medicare Advantage (private plans, combines A+B)');
    addBullet('Part D - Prescription Drug Coverage');
    addBullet('Eligibility: Age 65+ or certain disabilities');
    addBullet('Medicare Beneficiary Identifier (MBI): 11 characters');
    addSection('Medicaid (State Government Program):');
    addBullet('For low-income individuals (income-based eligibility)');
    addBullet('Varies by state - each state has own rules');
    addBullet('Spenddown: Patients may need to spend income on medical bills first');
    addBullet('Usually pays LAST (after Medicare or commercial)');
    addSection('COBRA:');
    addBullet('Continue employer insurance after job loss');
    addBullet('Duration: 18-36 months');
    addBullet('Employee pays full premium + 2% admin fee');
    addBullet('60 days to elect from qualifying event');
    addSection('TRICARE:');
    addBullet('Military members, retirees, and families');
    addBullet('Prime (HMO), Select (PPO), For Life (65+)');
    addSection('CHAMPVA:');
    addBullet('Dependents of veterans with permanent disability');
    addBullet('Medicare is primary, CHAMPVA is secondary');
    addSection('Workers Compensation:');
    addBullet('Work-related injuries - ALWAYS primary');
    addBullet('Health insurance is secondary');
    addSection('Auto Insurance:');
    addBullet('Accident-related injuries - Primary for auto accidents');
    addBullet('Need Date of Injury (DOI) and State');
    addPageBreak();

    // ========== 6. INSURANCE MODES ==========
    addTitle('6. Insurance Modes - COB Order');
    addBody('A patient can have multiple insurances. The order determines who pays first.');
    addSection('Insurance Order:');
    addBullet('Primary - Pays first based on benefit schedule');
    addBullet('Secondary - Pays remaining balance after primary');
    addBullet('Tertiary - Pays remaining after primary + secondary');
    addBullet('Quaternary - Last payer (rare)');
    addSection('COB Rules:');
    addBullet('Birthday Rule - Parent with earlier birthday in year is primary (for dependents)');
    addBullet('Employment Rule - Active employer plan is primary');
    addBullet('COBRA is usually secondary to active coverage');
    addBullet('Medicare is usually primary unless employer plan applies');
    addPageBreak();

    // ========== 7. MANAGED CARE ==========
    addTitle('7. Managed Care Plans');
    addTable(['Plan', 'Network', 'Referral', 'Flexibility'], [
      ['HMO', 'In-network only', 'PCP referral required', 'Least flexible'],
      ['PPO', 'In & Out of network', 'No referral needed', 'Most flexible'],
      ['EPO', 'In-network only (except ER)', 'No referral needed', 'Moderate'],
      ['POS', 'In & Out of network', 'Yes for out-of-network', 'Hybrid HMO/PPO']
    ]);
    addSection('Key Terms:');
    addBullet('PCP (Primary Care Physician) - First contact for medical care');
    addBullet('Referral - Written order from PCP to see a specialist');
    addBullet('In-Network - Providers contracted with plan (lower cost)');
    addBullet('Out-of-Network - Providers NOT contracted (higher cost)');
    addPageBreak();

    // ========== 8. CPT CODES ==========
    addTitle('8. CPT Code Ranges');
    addSection('Office/Outpatient Visits (New Patient):');
    addBullet('99202 - Low complexity, 15-29 min');
    addBullet('99203 - Moderate low, 30-44 min');
    addBullet('99204 - Moderate high, 45-59 min');
    addBullet('99205 - High complexity, 60-74 min');
    addSection('Office/Outpatient Visits (Established Patient):');
    addBullet('99211 - Minimal (nurse visit, no physician)');
    addBullet('99212 - Straightforward, 10-19 min');
    addBullet('99213 - Low complexity, 20-29 min (MOST COMMON)');
    addBullet('99214 - Moderate complexity, 30-39 min (VERY COMMON)');
    addBullet('99215 - High complexity, 40-54 min');
    addSection('Emergency Department Visits:');
    addBullet('99281 - Level 1 Minimal');
    addBullet('99282 - Level 2 Low');
    addBullet('99283 - Level 3 Moderate');
    addBullet('99284 - Level 4 High');
    addBullet('99285 - Level 5 Critical');
    addSection('Inpatient Services:');
    addBullet('99221-99223 - Initial Admission (Low to High)');
    addBullet('99231-99233 - Subsequent Care (Daily visits)');
    addBullet('99238-99239 - Discharge Day (<30 min / 30+ min)');
    addSection('Consultations:');
    addBullet('99242-99245 - Outpatient consultation (Low to High)');
    addPageBreak();

    // ========== 9. MODIFIERS ==========
    addTitle('9. CPT Modifiers - Complete Guide');
    addBody('Modifiers are 2-digit codes added to a CPT to give extra context.');
    addTable(['Modifier', 'Name', 'When to Use'], [
      ['-25', 'Separately Identifiable E/M', 'Visit AND procedure same day, different reasons'],
      ['-59', 'Distinct Procedural Service', 'Two normally bundled procedures, truly separate'],
      ['-76', 'Repeat Procedure (Same MD)', 'Same doctor repeats same procedure same day'],
      ['-77', 'Repeat Procedure (Diff MD)', 'Different doctor repeats procedure same day'],
      ['-50', 'Bilateral Procedure', 'Same procedure on BOTH sides'],
      ['-LT', 'Left Side', 'Procedure on LEFT side only'],
      ['-RT', 'Right Side', 'Procedure on RIGHT side only'],
      ['-51', 'Multiple Procedures', '2+ different procedures same session'],
      ['-57', 'Decision for Surgery', 'E/M visit where surgery decided (day before)'],
      ['-24', 'Unrelated E/M During Global', 'Visit for different problem during post-op'],
      ['-78', 'Return to OR', 'Complication needs OR during global period'],
      ['-XE', 'Separate Encounter', 'Different date/session'],
      ['-XS', 'Separate Structure', 'Different organ/structure'],
      ['-XU', 'Unusual Non-Overlapping', 'Service does not overlap usual components']
    ]);
    addPageBreak();

    // ========== 10. ICD-10 ==========
    addTitle('10. ICD-10 Diagnosis Codes');
    addBody('ICD-10 codes explain WHY the patient needed treatment. They justify medical necessity.');
    addSection('Code Structure:');
    addBody('Letter + 2 digits + decimal + up to 4 more characters');
    addBody('Example: E11.65 = Type 2 diabetes with hyperglycemia');
    addSection('Common Ranges:');
    addBullet('E00-E89 - Endocrine/Metabolic (Diabetes, Cholesterol, Thyroid)');
    addBullet('I00-I99 - Circulatory (Hypertension, Heart Failure)');
    addBullet('J00-J99 - Respiratory (URI, Asthma, Pneumonia)');
    addBullet('M00-M99 - Musculoskeletal (Back pain, Arthritis)');
    addBullet('R00-R99 - Symptoms (Cough, Headache, Pain)');
    addBullet('Z00-Z99 - Encounters/History (Annual exam, Vaccination)');
    addSection('Golden Rules:');
    addBullet('CPT = WHAT was done; ICD-10 = WHY it was done');
    addBullet('Both are needed on every claim');
    addBullet('Code to highest specificity');
    addBullet('If ICD does not match CPT, claim denied');
    addPageBreak();

    // ========== 11. CODING MISTAKES ==========
    addTitle('11. Common Coding Mistakes');
    addTable(['#', 'Mistake', 'Fix'], [
      ['1', 'Wrong E/M level', 'Match complexity to documentation'],
      ['2', 'Missing modifier', 'Check if -25 or -59 needed'],
      ['3', 'Unbundling', 'Use CCI edits to check bundling rules'],
      ['4', 'Wrong ICD specificity', 'Use most specific code (E11.65 not E11.9)'],
      ['5', 'Missing diagnosis', 'Code everything documented'],
      ['6', 'Upcoding', 'Code based on actual time/complexity'],
      ['7', 'Wrong DOS', 'Match DOS to progress notes'],
      ['8', 'Duplicate codes', 'Use -76 or -77 if repeated'],
      ['9', 'Missing laterality', 'Add -LT or -RT for paired body parts'],
      ['10', 'Outdated codes', 'Use current ICD-10 and CPT editions']
    ]);
    addPageBreak();

    // ========== 12. AR CALLING ==========
    addTitle('12. AR Calling Steps & Script');
    addSection('Before the Call - Prepare:');
    addBullet('Patient name, DOB, Member ID');
    addBullet('Claim number and date of service');
    addBullet('Billed amount, CPT/ICD codes');
    addBullet('Provider NPI');
    addBullet('Payer phone number');
    addBullet('Previous EOB or correspondence');
    addSection('Call Script Template:');
    addBody('"Hello, this is [Name] calling from [Practice Name] regarding claim #[number] for patient [Patient Name], DOB [date]. The claim was submitted on [date] for date of service [DOS]. I am calling to check the status of this claim and understand why it shows [pending/denied/adjusted]. Can you help me resolve this?"');
    addSection('During the Call:');
    addBullet('Ask for claim status and explanation');
    addBullet('If denied: Get denial code and reason');
    addBullet('If pending: Ask what is needed and timeline');
    addBullet('Get reference/call tracking number');
    addSection('After the Call:');
    addBullet('Document all call notes');
    addBullet('Record reference numbers');
    addBullet('Set follow-up date');
    addBullet('Take corrective action if needed');
    addPageBreak();

    // ========== 13. PAYMENT / ERA / EOB ==========
    addTitle('13. Payment / ERA / EOB Reading');
    addSection('ERA (835) - Electronic Remittance Advice:');
    addBody('Contains: Payer info, Patient info, Claim details, Payment amount, Adjustments, CARC codes, RARC codes.');
    addSection('Key Formula:');
    addBody('Billed Amount - Allowed Amount = Contractual Write-off');
    addBody('Allowed Amount - Paid Amount = Patient Responsibility (PR)');
    addSection('PR (Patient Responsibility):');
    addBody('The portion the patient owes: Copay + Coinsurance + Deductible.');
    addSection('Common Adjustment Codes:');
    addBullet('CO-1 - Contractual adjustment');
    addBullet('CO-2 - Duplicate claim');
    addBullet('CO-45 - Charges exceed fee schedule (CO-45)');
    addBullet('CO-16 - Claim lacks information');
    addBullet('CO-18 - Duplicate claim');
    addBullet('CO-29 - Timely filing');
    addBullet('CO-252 - Auth missing');
    addPageBreak();

    // ========== 14. DENIAL MANAGEMENT ==========
    addTitle('14. Denial Management');
    addSection('Steps to Handle Denials:');
    addBody('1) Review denial reason code and remark code');
    addBody('2) Determine if correctable (coding, auth, eligibility)');
    addBody('3) If correctable: correct and resubmit or appeal');
    addBody('4) If not correctable: write off with proper code');
    addBody('5) Document reason and action taken');
    addBody('6) Track denial trends');
    addSection('Rejection vs Denial:');
    addBullet('Rejection - Never entered payer system (fix and resubmit)');
    addBullet('Denial - Processed by payer but payment denied (appeal or write off)');
    addPageBreak();

    // ========== 15. TIMELY FILING ==========
    addTitle('15. Timely Filing Rules');
    addTable(['Payer', 'Deadline'], [
      ['Medicare', '1 calendar year from DOS'],
      ['Medicaid', '6-12 months (varies by state)'],
      ['Commercial', '90 days to 1 year (varies by payer)'],
      ['Workers Comp', 'Varies by state']
    ]);
    addSection('Proof of Timely Filing:');
    addBullet('Clearinghouse confirmation with date');
    addBullet('EDI acknowledgment from payer');
    addBullet('Certified mail receipt (if paper)');
    addBullet('Fax confirmation with timestamp');
    addPageBreak();

    // ========== 16. MOCK CALL SCENARIOS ==========
    addTitle('16. Mock Call Scenarios');
    addSection('Scenario 1 - Claim Pending Review:');
    addBody('Call about claim pending 30 days. Rep says needs chart notes. Action: Send notes, get reference#, follow up in 10 days.');
    addSection('Scenario 2 - CO-45 Denial:');
    addBody('Claim denied - charges exceed fee schedule. Allowed $450 vs billed $800. Patient owes $0 (contractual adjustment). Action: Post payment, write off $350.');
    addSection('Scenario 3 - Timely Filing (CO-29):');
    addBody('Medicare denied for timely filing but claim was submitted on time. Action: Provide EDI proof, request reprocessing.');
    addSection('Scenario 4 - Patient Billing Call:');
    addBody('Patient confused about $275 balance. Action: Explain EOB, show what insurance paid, offer payment plan.');
    addSection('Scenario 5 - Auth Status:');
    addBody('Check prior auth for MRI. Action: Verify auth number, effective dates, schedule before expiration.');
    addSection('Scenario 6 - Escalation:');
    addBody('3 different answers from 3 calls. Action: Request supervisor, provide call history, get final resolution.');
    addPageBreak();

    // ========== 17. DENIAL CODES ==========
    addTitle('17. Common Denial Codes Reference');
    addTable(['Code', 'Meaning', 'Action'], [
      ['CO-4', 'Procedure inconsistent', 'Verify CPT code matches documentation'],
      ['CO-16', 'Claim lacks info', 'Add missing information, resubmit'],
      ['CO-18', 'Duplicate claim', 'Check if claim already processed'],
      ['CO-29', 'Timely filing', 'Provide proof of submission'],
      ['CO-45', 'Exceeds fee schedule', 'Post contractual adjustment'],
      ['CO-109', 'Not our patient', 'Verify correct payer and member ID'],
      ['CO-167', 'Diagnosis inconsistent', 'Review ICD codes for accuracy'],
      ['CO-194', 'Balance exceeds fee schedule', 'Adjust to allowed amount'],
      ['CO-204', 'Service not covered', 'Verify benefit coverage'],
      ['CO-252', 'Auth missing', 'Obtain retroauth or appeal']
    ]);
    addPageBreak();

    // ========== 18. GLOSSARY ==========
    addTitle('18. Glossary of Key Terms');
    const glossary = [
      ['AR', 'Accounts Receivable - money owed to provider'],
      ['CPT', 'Current Procedural Terminology - procedure codes'],
      ['ICD-10', 'International Classification of Diseases - diagnosis codes'],
      ['ERA', 'Electronic Remittance Advice (835)'],
      ['EOB', 'Explanation of Benefits'],
      ['COB', 'Coordination of Benefits - multiple insurance order'],
      ['NPI', 'National Provider Identifier'],
      ['PHI', 'Protected Health Information'],
      ['PA', 'Prior Authorization'],
      ['ABN', 'Advance Beneficiary Notice (Medicare)'],
      ['COBRA', 'Continuation of employer insurance after job loss'],
      ['PCP', 'Primary Care Physician'],
      ['HMO', 'Health Maintenance Organization'],
      ['PPO', 'Preferred Provider Organization'],
      ['EPO', 'Exclusive Provider Organization'],
      ['PIP', 'Personal Injury Protection (auto insurance)'],
      ['MSP', 'Medicare Secondary Payer'],
      ['CCI', 'Correct Coding Initiative (bundling rules)'],
      ['CARC', 'Claim Adjustment Reason Code'],
      ['RARC', 'Remittance Advice Remark Code'],
      ['PR', 'Patient Responsibility'],
      ['DOS', 'Date of Service'],
      ['DOJ', 'Date of Injury'],
      ['EDI', 'Electronic Data Interchange'],
      ['RCM', 'Revenue Cycle Management']
    ];
    glossary.forEach(function(g) {
      doc.fontSize(10).fillColor(blue).text(g[0] + ': ', { continued: true }).fillColor('#333').text(g[1]);
      doc.moveDown(0.2);
    });

    // Final page
    addPageBreak();
    doc.fontSize(20).fillColor(blue).text('End of Study Material', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(12).fillColor(gray).text('Provision AR Calling - Practice Management System', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor(gray).text('Good luck with your training!', { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#aaa').text('For questions, contact your administrator.', { align: 'center' });

    doc.end();
  });

  app.listen(PORT, () => {
    console.log('PMS App running at http://localhost:' + PORT);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
