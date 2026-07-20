const express = require('express');
const router = express.Router();
const db = require('../db');

// Get all inpatient records
router.get('/', (req, res) => {
  const { patient_id } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  let query = `
    SELECT ip.*, p.first_name || ' ' || p.last_name as patient_name, p.mrn
    FROM inpatient_billing ip
    LEFT JOIN patients p ON ip.patient_id = p.patient_id
    WHERE 1=1
  `;
  const params = [];
  if (patient_id) { query += ' AND ip.patient_id = ?'; params.push(patient_id); }
  query += ' ORDER BY ip.created_at DESC';
  const rows = db.prepare(query).all(...params);
  for (const ip of rows) {
    if (ip.insurance_id) {
      const ins = db.prepare('SELECT member_id FROM insurances WHERE id = ?').get(ip.insurance_id);
      let elig = db.prepare('SELECT * FROM eligibility_master WHERE insurance_id = ? OR member_id = ? ORDER BY id DESC LIMIT 1').get(ip.insurance_id, ins ? ins.member_id : '');
      if (elig) {
        if (elig.status === 'active' && elig.termination_date && elig.termination_date < today) {
          ip.eligibility_status = 'expired';
          db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(elig.id);
        } else if (elig.effective_date && elig.effective_date > today) {
          ip.eligibility_status = 'pending';
        } else {
          ip.eligibility_status = elig.status || 'active';
        }
      } else {
        ip.eligibility_status = 'unknown';
      }
    } else {
      ip.eligibility_status = 'no_insurance';
    }
  }
  res.json(rows);
});

// Get inpatient record with UB-04 data
router.get('/:ipId', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const ip = db.prepare(`
    SELECT ip.*, p.first_name, p.last_name, p.dob, p.ssn, p.phone, p.address, p.city as p_city, p.state as p_state, p.zip as p_zip, p.mrn, p.patient_id,
           pr.first_name as prov_first, pr.last_name as prov_last, pr.npi as prov_npi, pr.taxonomy_code,
           i.payer_name, i.member_id as ins_member_id, i.group_number
    FROM inpatient_billing ip
    LEFT JOIN patients p ON ip.patient_id = p.patient_id
    LEFT JOIN providers pr ON ip.provider_id = pr.provider_id
    LEFT JOIN insurances i ON ip.insurance_id = i.id
    WHERE ip.ip_id = ?
  `).get(req.params.ipId);
  if (!ip) return res.status(404).json({ error: 'Not found' });

  let eligibility_status = 'unknown';
  if (ip.insurance_id) {
    const ins = db.prepare('SELECT member_id FROM insurances WHERE id = ?').get(ip.insurance_id);
    let elig = db.prepare('SELECT * FROM eligibility_master WHERE insurance_id = ? OR member_id = ? ORDER BY id DESC LIMIT 1').get(ip.insurance_id, ins ? ins.member_id : '');
    if (elig) {
      if (elig.termination_date && elig.termination_date < today) {
        eligibility_status = 'expired';
        db.prepare("UPDATE eligibility_master SET status = 'expired' WHERE id = ?").run(elig.id);
      } else if (elig.effective_date && elig.effective_date > today) {
        eligibility_status = 'pending';
      } else {
        eligibility_status = elig.status || 'active';
      }
    } else {
      eligibility_status = 'not_found';
    }
  }

  const ub04 = db.prepare('SELECT * FROM ub04_form_data WHERE ip_id = ?').get(req.params.ipId);
  res.json({ ...ip, eligibility_status, ub04: ub04 || null });
});

// Create inpatient registration with UB-04
router.post('/', (req, res) => {
  const ipId = 'IP' + String(Date.now()).slice(-6);
  const { patient_id, admission_date, discharge_date, admission_type, admission_source, discharge_status, provider_id, insurance_id, facility_name, facility_address, facility_phone, facility_npi, ub04_data } = req.body;

  db.prepare(`
    INSERT INTO inpatient_billing (ip_id, patient_id, admission_date, discharge_date, admission_type, admission_source, discharge_status, provider_id, insurance_id, facility_name, facility_address, facility_phone, facility_npi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ipId, patient_id, admission_date, discharge_date, admission_type, admission_source, discharge_status, provider_id, insurance_id, facility_name, facility_address, facility_phone, facility_npi);

  // Create UB-04 form data with 81 blocks
  if (ub04_data) {
    db.prepare(`
      INSERT INTO ub04_form_data (ip_id, block_1_type_of_bill, block_2_federal_tax_id, block_3a_patient_account_no, block_3b_patient_name,
      block_4a_payer_name, block_4b_payer_id, block_5_patient_dob, block_6_patient_sex, block_7_payer_state, block_8_patient_condition,
      block_9_patient_address, block_10_patient_city, block_11_patient_state, block_12_patient_zip, block_13_patient_phone, block_14_patient_ssn,
      block_15_patient_gender, block_16_patient_race, block_17_patient_ethnicity, block_18_patient_marital,
      block_19_patient_country, block_20_patient_dob_formatted, block_21_patient_age, block_22_patient_weight, block_23_patient_weight_units,
      block_24_pregnancy, block_25_patient_status, block_26_patient_location, block_27_patient_prior_location,
      block_28_key_value, block_29_payer_priority, block_30_payer_plan,
      block_31_payer_member_id, block_32_payer_group, block_33_insured_name, block_34_insured_dob, block_35_insured_sex,
      block_36_insured_address, block_37_insured_city, block_38_insured_state, block_39_insured_zip, block_40_insured_phone,
      block_41_insured_relation, block_42_insured_ssn, block_43_insured_employer, block_44_insured_employer_city, block_45_insured_employer_state,
      block_46_insured_plan_name, block_47_insured_group, block_48_insured_effective, block_49_insured_termination, block_50_auth_number,
      block_51_provider_name, block_52_provider_address, block_53_provider_city, block_54_provider_state, block_55_provider_zip,
      block_56_provider_phone, block_57_provider_npi, block_58_provider_tax_id, block_59_attending_npi, block_60_attending_name,
      block_61_operating_npi, block_62_operating_name, block_63_other_npi, block_64_other_name,
      block_65_facility_name, block_66_facility_npi, block_67_facility_address, block_68_facility_city, block_69_facility_state, block_70_facility_zip,
      block_71_icd1, block_72_icd2, block_73_icd3, block_74_icd4, block_75_icd5, block_76_icd6, block_77_icd7, block_78_icd8, block_79_icd9, block_80_icd10,
      block_81_admitting_dx, block_82_principal_procedure, block_83_principal_proc_date, block_84_other_procedure, block_85_other_proc_date,
      block_86_occurrence_code, block_87_occurrence_span, block_88_condition_code,
      charge_lines, total_charges)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ipId, ub04_data.block_1, ub04_data.block_2, ipId, `${ub04_data.block_3b || ''}`,
      ub04_data.block_4a, ub04_data.block_4b, ub04_data.block_5, ub04_data.block_6, ub04_data.block_7, ub04_data.block_8,
      ub04_data.block_9, ub04_data.block_10, ub04_data.block_11, ub04_data.block_12, ub04_data.block_13, ub04_data.block_14,
      ub04_data.block_15, ub04_data.block_16, ub04_data.block_17, ub04_data.block_18,
      ub04_data.block_19, ub04_data.block_20, ub04_data.block_21, ub04_data.block_22, ub04_data.block_23,
      ub04_data.block_24, ub04_data.block_25, ub04_data.block_26, ub04_data.block_27,
      ub04_data.block_28, ub04_data.block_29, ub04_data.block_30,
      ub04_data.block_31, ub04_data.block_32, ub04_data.block_33, ub04_data.block_34, ub04_data.block_35,
      ub04_data.block_36, ub04_data.block_37, ub04_data.block_38, ub04_data.block_39, ub04_data.block_40,
      ub04_data.block_41, ub04_data.block_42, ub04_data.block_43, ub04_data.block_44, ub04_data.block_45,
      ub04_data.block_46, ub04_data.block_47, ub04_data.block_48, ub04_data.block_49, ub04_data.block_50,
      ub04_data.block_51, ub04_data.block_52, ub04_data.block_53, ub04_data.block_54, ub04_data.block_55,
      ub04_data.block_56, ub04_data.block_57, ub04_data.block_58, ub04_data.block_59, ub04_data.block_60,
      ub04_data.block_61, ub04_data.block_62, ub04_data.block_63, ub04_data.block_64,
      ub04_data.block_65, ub04_data.block_66, ub04_data.block_67, ub04_data.block_68, ub04_data.block_69, ub04_data.block_70,
      ub04_data.block_71, ub04_data.block_72, ub04_data.block_73, ub04_data.block_74, ub04_data.block_75,
      ub04_data.block_76, ub04_data.block_77, ub04_data.block_78, ub04_data.block_79, ub04_data.block_80,
      ub04_data.block_81, ub04_data.block_82, ub04_data.block_83, ub04_data.block_84, ub04_data.block_85,
      ub04_data.block_86, ub04_data.block_87, ub04_data.block_88,
      JSON.stringify(ub04_data.charge_lines || []), ub04_data.total_charges || 0
    );
  }

  res.json({ ip_id: ipId, message: 'Inpatient registration created with UB-04' });
});

// Update UB-04
router.put('/:ipId/ub04', (req, res) => {
  const updates = [];
  const params = [];
  for (const [key, value] of Object.entries(req.body)) {
    if (key !== 'ip_id') {
      updates.push(`${key} = ?`);
      params.push(value);
    }
  }
  params.push(req.params.ipId);
  db.prepare(`UPDATE ub04_form_data SET ${updates.join(', ')} WHERE ip_id = ?`).run(...params);
  res.json({ message: 'UB-04 updated' });
});

// Update inpatient record
router.put('/:ipId', (req, res) => {
  const { discharge_date, discharge_status, total_charges, total_payments, total_adjustments } = req.body;
  const updates = [];
  const params = [];
  if (discharge_date) { updates.push('discharge_date = ?'); params.push(discharge_date); }
  if (discharge_status) { updates.push('discharge_status = ?'); params.push(discharge_status); }
  if (total_charges !== undefined) { updates.push('total_charges = ?'); params.push(total_charges); }
  if (total_payments !== undefined) { updates.push('total_payments = ?'); params.push(total_payments); }
  if (total_adjustments !== undefined) { updates.push('total_adjustments = ?'); params.push(total_adjustments); }
  params.push(req.params.ipId);
  db.prepare(`UPDATE inpatient_billing SET ${updates.join(', ')} WHERE ip_id = ?`).run(...params);
  res.json({ message: 'Inpatient record updated' });
});

// Delete inpatient
router.delete('/:ipId', (req, res) => {
  db.prepare('DELETE FROM ub04_form_data WHERE ip_id = ?').run(req.params.ipId);
  db.prepare('DELETE FROM inpatient_billing WHERE ip_id = ?').run(req.params.ipId);
  res.json({ message: 'Inpatient record deleted' });
});

module.exports = router;
