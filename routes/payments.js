const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all payments
router.get('/', (req, res) => {
  const { patient_id } = req.query;
  let query = `
    SELECT py.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn
    FROM payments py
    LEFT JOIN patients p ON py.patient_id = p.patient_id
    WHERE 1=1
  `;
  const params = [];
  if (patient_id) { query += ' AND py.patient_id = ?'; params.push(patient_id); }
  query += ' ORDER BY py.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// Get payment details
router.get('/:paymentId', (req, res) => {
  const payment = db.prepare(`
    SELECT py.*, p.first_name, p.last_name, p.mrn
    FROM payments py
    LEFT JOIN patients p ON py.patient_id = p.patient_id
    WHERE py.payment_id = ?
  `).get(req.params.paymentId);
  if (!payment) return res.status(404).json({ error: 'Not found' });
  const details = db.prepare('SELECT * FROM payment_details WHERE payment_id = ?').all(req.params.paymentId);
  res.json({ ...payment, details });
});

// POST Manual Payment
// Workflow: Bill($1000) → Allowed($500) → WriteOff=Billed-Allowed($500) → PA($400) → PR=Allowed-PA($100) → Offset(old pending) → FinalPR
router.post('/manual', (req, res) => {
  const paymentId = 'PAY' + String(Date.now()).slice(-6);
  const { patient_id, charge_id, payment_date, payment_method, check_number, payer_name, payer_type, line_details, paid_amount, adjustment_amount } = req.body;

  let totalPaid = 0, totalAllowed = 0, totalWriteOff = 0, totalDenial = 0, totalPatientResp = 0;
  let totalBilled = 0;

  if (line_details && line_details.length) {
    for (const ld of line_details) {
      const billed = ld.billed_amount || 0;
      const allowed = ld.allowed_amount || 0;
      const paid = ld.paid_amount || 0;
      const writeOff = Math.max(0, billed - allowed);
      const pr = Math.max(0, allowed - paid);
      ld.adjustment_amount = writeOff;
      ld.patient_responsibility = pr;
      totalBilled += billed;
      totalAllowed += allowed;
      totalPaid += paid;
      totalWriteOff += writeOff;
      totalPatientResp += pr;
      totalDenial += ld.denial_amount || 0;
    }
  } else {
    totalPaid = paid_amount || 0;
    totalWriteOff = adjustment_amount || 0;
    totalAllowed = totalPaid + totalWriteOff;
    totalBilled = totalAllowed + totalWriteOff;
    totalPatientResp = Math.max(0, totalAllowed - totalPaid);
  }

  db.prepare(`
    INSERT INTO payments (payment_id, patient_id, charge_id, payment_date, payment_type, payment_method, check_number, payer_name, payer_type, paid_amount, allowed_amount, adjustment_amount, denial_amount, patient_responsibility)
    VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(paymentId, patient_id, charge_id, payment_date, payment_method, check_number, payer_name, payer_type, totalPaid, totalAllowed, totalWriteOff, totalDenial, totalPatientResp);

  if (line_details) {
    const insertDetail = db.prepare(`
      INSERT INTO payment_details (payment_id, charge_line_id, cpt_code, service_date, billed_amount, allowed_amount, paid_amount, adjustment_amount, denial_code, denial_reason, patient_responsibility)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const ld of line_details) {
      insertDetail.run(paymentId, ld.charge_line_id || null, ld.cpt_code || null, ld.service_date || null, ld.billed_amount || 0, ld.allowed_amount || 0, ld.paid_amount || 0, ld.adjustment_amount || 0, ld.denial_code || null, ld.denial_reason || null, ld.patient_responsibility || 0);
    }
  }

  if (charge_id) {
    db.prepare(`
      UPDATE charges SET total_paid = total_paid + ?, total_adjustment = total_adjustment + ? WHERE charge_id = ?
    `).run(totalPaid, totalWriteOff, charge_id);
  }

  const txId = 'TXN' + String(Date.now()).slice(-6);
  const lastTx = db.prepare('SELECT balance FROM patient_transactions WHERE patient_id = ? ORDER BY id DESC LIMIT 1').get(patient_id);
  const prevBalance = lastTx?.balance || 0;
  const newBalance = prevBalance - totalPaid + totalPatientResp;

  db.prepare(`
    INSERT INTO patient_transactions (transaction_id, patient_id, transaction_date, transaction_type, description, debit, credit, balance, charge_id, payment_id)
    VALUES (?, ?, ?, 'payment', ?, ?, ?, ?, ?, ?)
  `).run(txId, patient_id, payment_date, `Payment from ${payer_name || 'patient'}`, totalPatientResp, totalPaid, newBalance, charge_id, paymentId);

  res.json({ payment_id: paymentId, paid_amount: totalPaid, allowed_amount: totalAllowed, writeoff: totalWriteOff, patient_responsibility: totalPatientResp, message: 'Payment posted (manual)' });
});

// POST Comprehensive Payment with full breakdown and old balance offset
// Workflow: Bill($1000) → Allowed($500) → WriteOff($500) → PR($50) → PA($450) → OldOffset($10) → FinalPR($40)
router.post('/post', (req, res) => {
  const paymentId = 'PAY' + String(Date.now()).slice(-6);
  const { patient_id, charge_id, payment_date, payment_method, check_number, payer_name, payer_type,
    billed_amount, allowed_amount, writeoff_amount, patient_responsibility, paid_to_provider,
    offset_amount, old_balance, notes, line_details } = req.body;

  const lastTx = db.prepare('SELECT balance FROM patient_transactions WHERE patient_id = ? ORDER BY id DESC LIMIT 1').get(patient_id);
  const prevBalance = lastTx?.balance || 0;
  const actualOffset = offset_amount || 0;
  const finalPR = Math.max(0, (patient_responsibility || 0) - actualOffset);
  const paidAmount = paid_to_provider || 0;
  const adjAmount = writeoff_amount || 0;
  let totalDenial = 0;
  if (line_details && line_details.length) {
    line_details.forEach(ld => { if (ld.denial_code) totalDenial += ld.billed_amount || 0; });
  }

  db.prepare(`
    INSERT INTO payments (payment_id, patient_id, charge_id, payment_date, payment_type, payment_method, check_number, payer_name, payer_type, paid_amount, allowed_amount, adjustment_amount, denial_amount, patient_responsibility)
    VALUES (?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(paymentId, patient_id, charge_id, payment_date, payment_method, check_number, payer_name, payer_type, paidAmount, allowed_amount || 0, adjAmount, totalDenial, finalPR);

  if (line_details && line_details.length) {
    const insertDetail = db.prepare(`
      INSERT INTO payment_details (payment_id, charge_line_id, cpt_code, service_date, billed_amount, allowed_amount, paid_amount, adjustment_amount, denial_code, denial_reason, patient_responsibility)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    line_details.forEach(ld => {
      insertDetail.run(paymentId, ld.charge_line_id || null, ld.cpt_code || null, ld.service_date || null, ld.billed_amount || 0, ld.allowed_amount || 0, ld.paid_amount || 0, ld.adjustment_amount || 0, ld.denial_code || null, ld.denial_reason || null, ld.patient_responsibility || 0);
    });
  }

  if (charge_id) {
    db.prepare(`UPDATE charges SET total_paid = total_paid + ?, total_adjustment = total_adjustment + ? WHERE charge_id = ?`).run(paidAmount, adjAmount, charge_id);
  }

  const txId = 'TXN' + String(Date.now()).slice(-6);
  const desc = `Bill: $${(billed_amount||0).toFixed(2)} | Allowed: $${(allowed_amount||0).toFixed(2)} | WriteOff: $${adjAmount.toFixed(2)} | PR: $${(patient_responsibility||0).toFixed(2)} | Offset: $${actualOffset.toFixed(2)} | Final PR: $${finalPR.toFixed(2)} | PA: $${paidAmount.toFixed(2)}${notes ? ' | ' + notes : ''}`;
  const newBalance = prevBalance - actualOffset + finalPR;

  db.prepare(`
    INSERT INTO patient_transactions (transaction_id, patient_id, transaction_date, transaction_type, description, debit, credit, balance, charge_id, payment_id)
    VALUES (?, ?, ?, 'payment', ?, ?, ?, ?, ?, ?)
  `).run(txId, patient_id, payment_date, desc, finalPR, paidAmount, newBalance, charge_id, paymentId);

  if (actualOffset > 0) {
    const recId = 'REC' + String(Date.now()).slice(-6);
    db.prepare(`
      INSERT INTO offset_reconciliation (record_id, patient_id, charge_id, payment_id, record_type, old_balance, offset_amount, new_balance, billed_amount, allowed_amount, writeoff_amount, patient_responsibility, paid_to_provider, from_charge_id, to_charge_id, payer_name, notes, status)
      VALUES (?, ?, ?, ?, 'offset', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
    `).run(recId, patient_id, charge_id, paymentId, prevBalance, actualOffset, newBalance, billed_amount || 0, allowed_amount || 0, adjAmount, finalPR, paidAmount, charge_id, charge_id, payer_name || '', notes || '');
  }

  res.json({
    payment_id: paymentId,
    breakdown: {
      billed_amount: billed_amount || 0,
      allowed_amount: allowed_amount || 0,
      writeoff_amount: adjAmount,
      patient_responsibility: patient_responsibility || 0,
      offset_from_old: actualOffset,
      old_balance: prevBalance,
      final_patient_responsibility: finalPR,
      paid_to_provider: paidAmount,
      new_balance: newBalance,
      denial_amount: totalDenial,
      line_items_count: (line_details && line_details.length) || 0
    },
    message: 'Payment posted with breakdown'
  });
});

// POST Automatic Payment (from ERA/EOB file data)
router.post('/automatic', (req, res) => {
  const paymentId = 'PAY' + String(Date.now()).slice(-6);
  const { patient_id, charge_id, payment_date, payer_name, payer_type, paid_amount, allowed_amount, adjustment_amount, denial_amount, copay_amount, deductible_amount, coinsurance_amount, claim_forward, next_payer_id, eob_file, line_details } = req.body;

  // AUTO CALCULATED: allowed_amount = paid + adjustment (overridden if provided)
  const calcAllowed = allowed_amount || (paid_amount || 0) + (adjustment_amount || 0);
  const patientResp = (copay_amount || 0) + (deductible_amount || 0) + (coinsurance_amount || 0);

  db.prepare(`
    INSERT INTO payments (payment_id, patient_id, charge_id, payment_date, payment_type, payer_name, payer_type, paid_amount, allowed_amount, adjustment_amount, denial_amount, copay_amount, deductible_amount, coinsurance_amount, patient_responsibility, claim_forward, next_payer_id, eob_file)
    VALUES (?, ?, ?, ?, 'automatic', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(paymentId, patient_id, charge_id, payment_date, payer_name, payer_type, paid_amount, calcAllowed, adjustment_amount, denial_amount, copay_amount, deductible_amount, coinsurance_amount, patientResp, claim_forward || 0, next_payer_id, eob_file);

  if (line_details) {
    const insertDetail = db.prepare(`
      INSERT INTO payment_details (payment_id, charge_line_id, cpt_code, service_date, billed_amount, allowed_amount, paid_amount, adjustment_amount, denial_code, denial_reason, patient_responsibility)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const ld of line_details) {
      ld.allowed_amount = ld.allowed_amount || (ld.paid_amount || 0) + (ld.adjustment_amount || 0);
      insertDetail.run(paymentId, ld.charge_line_id || null, ld.cpt_code || null, ld.service_date || null, ld.billed_amount || 0, ld.allowed_amount || 0, ld.paid_amount || 0, ld.adjustment_amount || 0, ld.denial_code || null, ld.denial_reason || null, ld.patient_responsibility || 0);
    }
  }

  // Create patient transaction
  const txId = 'TXN' + String(Date.now()).slice(-6);
  const lastTx = db.prepare('SELECT balance FROM patient_transactions WHERE patient_id = ? ORDER BY id DESC LIMIT 1').get(patient_id);
  const prevBalance = lastTx?.balance || 0;
  const newBalance = prevBalance - paid_amount + patientResp;

  db.prepare(`
    INSERT INTO patient_transactions (transaction_id, patient_id, transaction_date, transaction_type, description, debit, credit, balance, charge_id, payment_id)
    VALUES (?, ?, ?, 'auto_payment', ?, ?, ?, ?, ?, ?)
  `).run(txId, patient_id, payment_date, `Automatic payment from ${payer_name}`, patientResp, paid_amount, newBalance, charge_id, paymentId);

  // Handle claim forward
  if (claim_forward && next_payer_id) {
    db.prepare("UPDATE charges SET insurance_id = ?, insurance_type = 'secondary', status = 'forwarded' WHERE charge_id = ?").run(next_payer_id, charge_id);
  }

  res.json({ payment_id: paymentId, paid_amount, allowed_amount: calcAllowed, message: 'Payment posted (automatic)' });
});

// Offset/Reconciliation - adjust old patient amount into new account
router.post('/reconcile', (req, res) => {
  const { patient_id, from_charge_id, to_charge_id, amount, notes } = req.body;

  const txId = 'TXN' + String(Date.now()).slice(-6);
  const lastTx = db.prepare('SELECT balance FROM patient_transactions WHERE patient_id = ? ORDER BY id DESC LIMIT 1').get(patient_id);
  const prevBalance = lastTx?.balance || 0;

  db.prepare(`
    INSERT INTO patient_transactions (transaction_id, patient_id, transaction_date, transaction_type, description, debit, credit, balance, charge_id)
    VALUES (?, ?, date('now'), 'reconciliation', ?, 0, ?, ?, ?)
  `).run(txId, patient_id, `Offset: ${notes || 'Reconciliation between claims'}`, amount, prevBalance, to_charge_id);

  res.json({ message: 'Reconciliation completed', transaction_id: txId });
});

// Amount adjustment
router.post('/adjust', (req, res) => {
  const { patient_id, charge_id, adjustment_amount, adjustment_type, reason, payment_id } = req.body;

  const txId = 'TXN' + String(Date.now()).slice(-6);
  const lastTx = db.prepare('SELECT balance FROM patient_transactions WHERE patient_id = ? ORDER BY id DESC LIMIT 1').get(patient_id);
  const prevBalance = lastTx?.balance || 0;

  db.prepare(`
    INSERT INTO patient_transactions (transaction_id, patient_id, transaction_date, transaction_type, description, debit, credit, balance, charge_id, payment_id)
    VALUES (?, ?, date('now'), 'adjustment', ?, ?, 0, ?, ?, ?)
  `).run(txId, patient_id, `${adjustment_type}: ${reason}`, adjustment_type === 'writeoff' ? 0 : adjustment_amount, prevBalance + (adjustment_type === 'writeoff' ? -adjustment_amount : adjustment_amount), charge_id, payment_id);

  // Update charge
  if (charge_id) {
    db.prepare('UPDATE charges SET total_adjustment = total_adjustment + ? WHERE charge_id = ?').run(adjustment_amount, charge_id);
  }

  res.json({ message: 'Adjustment posted', transaction_id: txId });
});

// Patient history transactions
router.get('/history/:patientId', (req, res) => {
  const transactions = db.prepare('SELECT * FROM patient_transactions WHERE patient_id = ? ORDER BY transaction_date DESC, id DESC').all(req.params.patientId);
  res.json(transactions);
});

// Get patient balance info for reconciliation
router.get('/balance/:patientId', (req, res) => {
  const pid = req.params.patientId;
  const lastTx = db.prepare('SELECT balance FROM patient_transactions WHERE patient_id = ? ORDER BY id DESC LIMIT 1').get(pid);
  const balance = lastTx?.balance || 0;
  const totalCharges = db.prepare('SELECT SUM(total_charges) as total FROM charges WHERE patient_id = ?').get(pid);
  const totalPaid = db.prepare('SELECT SUM(total_paid) as total FROM charges WHERE patient_id = ?').get(pid);
  const totalAdj = db.prepare('SELECT SUM(total_adjustment) as total FROM charges WHERE patient_id = ?').get(pid);
  const charges = db.prepare('SELECT charge_id, charge_date, total_charges, total_paid, total_adjustment, status FROM charges WHERE patient_id = ? ORDER BY created_at DESC').all(pid);
  const lastPayment = db.prepare('SELECT * FROM payments WHERE patient_id = ? ORDER BY created_at DESC LIMIT 1').get(pid);
  res.json({
    patient_id: pid,
    current_balance: balance,
    total_charges: totalCharges?.total || 0,
    total_paid: totalPaid?.total || 0,
    total_adjustment: totalAdj?.total || 0,
    charges: charges,
    last_payment: lastPayment || null
  });
});

// Download EOB
router.get('/:paymentId/eob', (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE payment_id = ?').get(req.params.paymentId);
  if (!payment || !payment.eob_file) return res.status(404).json({ error: 'EOB not found' });
  res.download(payment.eob_file, `EOB_${req.params.paymentId}.pdf`);
});

// Download ERA
router.get('/:paymentId/era', (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE payment_id = ?').get(req.params.paymentId);
  if (!payment || !payment.era_file) return res.status(404).json({ error: 'ERA not found' });
  res.download(payment.era_file, `ERA_${req.params.paymentId}.txt`);
});

module.exports = router;
