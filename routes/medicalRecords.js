const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads', 'documents')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// Get all medical records for patient
router.get('/patient/:patientId', (req, res) => {
  const { mrn, category } = req.query;
  let query = 'SELECT * FROM medical_records WHERE patient_id = ?';
  const params = [req.params.patientId];
  if (mrn) { query += ' AND mrn = ?'; params.push(mrn); }
  if (category) { query += ' AND category = ?'; params.push(category); }
  query += ' ORDER BY created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// Search by MRN or patient_id (broad search)
router.get('/search/mrn/:mrn', (req, res) => {
  const q = req.params.mrn;
  const records = db.prepare('SELECT * FROM medical_records WHERE patient_id = ? OR mrn = ? ORDER BY created_at DESC').all(q, q);
  res.json(records);
});

// Broad search
router.get('/search', (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.json([]);
  const records = db.prepare('SELECT * FROM medical_records WHERE patient_id = ? OR mrn = ? OR title LIKE ? ORDER BY created_at DESC').all(q, q, '%' + q + '%');
  res.json(records);
});

// Get all records
router.get('/', (req, res) => {
  const records = db.prepare('SELECT * FROM medical_records ORDER BY created_at DESC').all();
  res.json(records);
});

// Upload document
router.post('/upload', (req, res) => {
  upload.array('files', 20)(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'Upload error: ' + err.message });
    try {
      const { patient_id, record_type, title, description, category, uploaded_by } = req.body;
      if (!patient_id || !title) return res.status(400).json({ error: 'Patient ID and Title required' });
      if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files selected' });
      const patient = db.prepare('SELECT mrn FROM patients WHERE patient_id = ?').get(patient_id);

      const insertRecord = db.prepare(`
        INSERT INTO medical_records (record_id, patient_id, mrn, record_type, title, description, file_name, file_path, file_type, file_size, category, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const results = [];
      for (const file of req.files) {
        const recordId = 'MR' + String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 1000));
        insertRecord.run(recordId, patient_id, patient?.mrn || '', record_type || 'document', title || file.originalname, description || '', file.originalname, file.path, file.mimetype, file.size, category || 'general', uploaded_by || '');
        results.push({ record_id: recordId, file_name: file.originalname });
      }
      res.json({ message: 'Documents uploaded', records: results });
    } catch(e) { res.status(500).json({ error: 'Upload failed: ' + e.message }); }
  });
});

// Verify patient history
router.get('/history/:patientId', (req, res) => {
  const records = db.prepare('SELECT * FROM medical_records WHERE patient_id = ? ORDER BY created_at DESC').all(req.params.patientId);
  const payments = db.prepare('SELECT * FROM payments WHERE patient_id = ? ORDER BY payment_date DESC').all(req.params.patientId);
  const charges = db.prepare(`
    SELECT cli.*, c.charge_date FROM charge_line_items cli
    JOIN charges c ON cli.charge_id = c.charge_id
    WHERE c.patient_id = ?
  `).all(req.params.patientId);
  res.json({ records, payments, charges });
});

// View document
router.get('/view/:recordId', (req, res) => {
  const record = db.prepare('SELECT * FROM medical_records WHERE record_id = ?').get(req.params.recordId);
  if (!record) return res.status(404).json({ error: 'Not found' });
  res.sendFile(record.file_path);
});

// Download document
router.get('/download/:recordId', (req, res) => {
  const record = db.prepare('SELECT * FROM medical_records WHERE record_id = ?').get(req.params.recordId);
  if (!record) return res.status(404).json({ error: 'Not found' });
  res.download(record.file_path, record.file_name);
});

// Update record
router.put('/:recordId', (req, res) => {
  const { title, description, category } = req.body;
  db.prepare('UPDATE medical_records SET title=?, description=?, category=? WHERE record_id=?').run(title, description, category, req.params.recordId);
  res.json({ message: 'Record updated' });
});

// Delete record
router.delete('/:recordId', (req, res) => {
  const record = db.prepare('SELECT * FROM medical_records WHERE record_id = ?').get(req.params.recordId);
  if (record && record.file_path && fs.existsSync(record.file_path)) {
    fs.unlinkSync(record.file_path);
  }
  db.prepare('DELETE FROM medical_records WHERE record_id = ?').run(req.params.recordId);
  res.json({ message: 'Record deleted' });
});

module.exports = router;
