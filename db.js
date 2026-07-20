const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'pms.db');

class Database {
  constructor() {
    this.db = null;
    this.ready = this.init();
  }

  async init() {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }
    this.createTables();
    this.seedData();
    this.save();
  }

  save() {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }

  prepare(sql) {
    return {
      run: (...params) => {
        try {
          this.db.run(sql, params);
          const lastId = this.db.exec("SELECT last_insert_rowid() as id");
          this.save();
          return { lastInsertRowid: lastId.length ? lastId[0].values[0][0] : 0, changes: this.db.getRowsModified() };
        } catch (e) { console.error('SQL Error:', e.message, sql); throw e; }
      },
      get: (...params) => {
        try {
          const stmt = this.db.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            stmt.free();
            const row = {};
            cols.forEach((c, i) => row[c] = vals[i]);
            return row;
          }
          stmt.free();
          return undefined;
        } catch (e) { console.error('SQL Error:', e.message); return undefined; }
      },
      all: (...params) => {
        try {
          const stmt = this.db.prepare(sql);
          stmt.bind(params);
          const rows = [];
          while (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            const row = {};
            cols.forEach((c, i) => row[c] = vals[i]);
            rows.push(row);
          }
          stmt.free();
          return rows;
        } catch (e) { console.error('SQL Error:', e.message); return []; }
      }
    };
  }

  exec(sql) {
    try {
      this.db.run(sql);
      this.save();
    } catch (e) { console.error('SQL Exec Error:', e.message); }
  }

  createTables() {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT UNIQUE NOT NULL,
        mrn TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        dob TEXT NOT NULL,
        gender TEXT,
        ssn TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        zip TEXT,
        guarantor TEXT,
        guarantor_phone TEXT,
        guarantor_relation TEXT,
        emergency_contact TEXT,
        emergency_phone TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS insurances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT,
        insurance_type TEXT NOT NULL,
        payer_name TEXT NOT NULL,
        member_id TEXT NOT NULL,
        group_number TEXT,
        plan_name TEXT,
        payer_id TEXT,
        subscriber_name TEXT,
        subscriber_dob TEXT,
        relationship TEXT,
        effective_date TEXT,
        termination_date TEXT,
        copay REAL DEFAULT 0,
        deductible REAL DEFAULT 0,
        coinsurance REAL DEFAULT 0,
        out_of_pocket_max REAL DEFAULT 0,
        status TEXT DEFAULT 'active',
        card_image_front TEXT,
        card_image_back TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS providers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        npi TEXT NOT NULL,
        taxonomy_code TEXT,
        specialization TEXT,
        provider_type TEXT DEFAULT 'rendering',
        phone TEXT,
        fax TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        zip TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS eligibility_master (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        insurance_id INTEGER,
        verification_date TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        effective_date TEXT,
        termination_date TEXT,
        plan_type TEXT,
        network TEXT,
        pcp TEXT,
        referral_required INTEGER DEFAULT 0,
        auth_required INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS eligibility_benefits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eligibility_id INTEGER NOT NULL,
        benefit_type TEXT NOT NULL,
        benefit_name TEXT NOT NULL,
        covered INTEGER DEFAULT 0,
        copay_amount REAL DEFAULT 0,
        deductible_amount REAL DEFAULT 0,
        coinsurance_percent REAL DEFAULT 0,
        copay_currency TEXT DEFAULT '$',
        max_visits INTEGER,
        visits_used INTEGER DEFAULT 0,
        remaining_visits INTEGER,
        prior_auth_required INTEGER DEFAULT 0,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS benefit_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        template_name TEXT NOT NULL,
        benefit_type TEXT NOT NULL,
        benefit_name TEXT NOT NULL,
        covered INTEGER DEFAULT 1,
        copay_amount REAL DEFAULT 0,
        deductible_amount REAL DEFAULT 0,
        coinsurance_percent REAL DEFAULT 0,
        max_visits INTEGER DEFAULT 0,
        prior_auth_required INTEGER DEFAULT 0,
        notes TEXT,
        is_default INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appointment_id TEXT UNIQUE NOT NULL,
        patient_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        appointment_date TEXT NOT NULL,
        appointment_time TEXT NOT NULL,
        appointment_type TEXT,
        visit_type TEXT DEFAULT 'office',
        status TEXT DEFAULT 'scheduled',
        reason TEXT,
        notes TEXT,
        ref_provider_id TEXT,
        pcp_provider_id TEXT,
        insurance_id INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS charges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        charge_id TEXT UNIQUE NOT NULL,
        patient_id TEXT NOT NULL,
        appointment_id TEXT,
        provider_id TEXT NOT NULL,
        charge_date TEXT NOT NULL,
        insurance_id INTEGER,
        secondary_insurance_id INTEGER,
        tertiary_insurance_id INTEGER,
        insurance_type TEXT,
        status TEXT DEFAULT 'pending',
        total_charges REAL DEFAULT 0,
        total_allowed REAL DEFAULT 0,
        total_paid REAL DEFAULT 0,
        total_adjustment REAL DEFAULT 0,
        total_patient_responsibility REAL DEFAULT 0,
        msp_code TEXT,
        msp_qualifying_person_name TEXT,
        msp_qualifying_person_dob TEXT,
        msp_coverage_start TEXT,
        date_of_injury TEXT,
        place_of_accident TEXT,
        accident_type TEXT,
        employer_name TEXT,
        employer_address TEXT,
        employer_phone TEXT,
        workers_comp_claim TEXT,
        workers_comp_carrier TEXT,
        auto_claim_number TEXT,
        auto_insurance_carrier TEXT,
        eligibility_status TEXT,
        eligibility_checked_at TEXT,
        auth_number TEXT,
        auth_from_date TEXT,
        auth_to_date TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS charge_line_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        charge_id TEXT NOT NULL,
        line_number INTEGER NOT NULL,
        service_date TEXT NOT NULL,
        icd_codes TEXT NOT NULL,
        cpt_code TEXT NOT NULL,
        modifier1 TEXT,
        modifier2 TEXT,
        modifier3 TEXT,
        modifier4 TEXT,
        pointer1 TEXT,
        pointer2 TEXT,
        pointer3 TEXT,
        units INTEGER DEFAULT 1,
        charge_amount REAL NOT NULL,
        allowed_amount REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        adjustment_amount REAL DEFAULT 0,
        notes TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS charge_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        charge_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT,
        file_size INTEGER,
        attachment_type TEXT DEFAULT 'document',
        status TEXT DEFAULT 'active',
        uploaded_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id TEXT UNIQUE NOT NULL,
        patient_id TEXT NOT NULL,
        charge_id TEXT,
        payment_date TEXT NOT NULL,
        payment_type TEXT NOT NULL,
        payment_method TEXT,
        check_number TEXT,
        transaction_id TEXT,
        payer_name TEXT,
        payer_type TEXT,
        paid_amount REAL DEFAULT 0,
        allowed_amount REAL DEFAULT 0,
        adjustment_amount REAL DEFAULT 0,
        denial_amount REAL DEFAULT 0,
        writeoff_amount REAL DEFAULT 0,
        copay_amount REAL DEFAULT 0,
        deductible_amount REAL DEFAULT 0,
        coinsurance_amount REAL DEFAULT 0,
        patient_responsibility REAL DEFAULT 0,
        claim_forward INTEGER DEFAULT 0,
        next_payer_id INTEGER,
        eob_file TEXT,
        era_file TEXT,
        notes TEXT,
        status TEXT DEFAULT 'posted',
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS payment_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id TEXT NOT NULL,
        charge_line_id INTEGER,
        cpt_code TEXT,
        service_date TEXT,
        billed_amount REAL DEFAULT 0,
        allowed_amount REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        adjustment_amount REAL DEFAULT 0,
        denial_code TEXT,
        denial_reason TEXT,
        patient_responsibility REAL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS patient_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id TEXT UNIQUE NOT NULL,
        patient_id TEXT NOT NULL,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        description TEXT,
        debit REAL DEFAULT 0,
        credit REAL DEFAULT 0,
        balance REAL DEFAULT 0,
        charge_id TEXT,
        payment_id TEXT,
        reference TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS ar_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id TEXT UNIQUE NOT NULL,
        patient_id TEXT NOT NULL,
        charge_id TEXT,
        call_date TEXT NOT NULL,
        call_time TEXT,
        call_type TEXT DEFAULT 'outbound',
        phone_number TEXT,
        insurance_payer TEXT,
        representative_name TEXT,
        reference_number TEXT,
        call_status TEXT DEFAULT 'completed',
        claim_status TEXT,
        action_required TEXT,
        follow_up_date TEXT,
        notes TEXT,
        duration INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS ar_call_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        call_date TEXT NOT NULL,
        call_time TEXT,
        call_type TEXT,
        phone_number TEXT,
        status TEXT DEFAULT 'active',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS ar_voicemails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        voicemail_id TEXT UNIQUE NOT NULL,
        patient_id TEXT,
        call_id TEXT,
        date TEXT NOT NULL,
        time TEXT,
        phone_number TEXT,
        ivr_response TEXT,
        voicemail_status TEXT DEFAULT 'new',
        notes TEXT,
        recording_path TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS authorizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        auth_id TEXT UNIQUE NOT NULL,
        patient_id TEXT NOT NULL,
        insurance_id INTEGER,
        authorization_number TEXT,
        auth_type TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        procedure_code TEXT,
        procedure_description TEXT,
        icd_codes TEXT,
        cpt_codes TEXT,
        units INTEGER DEFAULT 1,
        provider_id TEXT,
        submission_date TEXT,
        approval_date TEXT,
        effective_date TEXT,
        expiration_date TEXT,
        authorized_amount REAL DEFAULT 0,
        used_amount REAL DEFAULT 0,
        remaining_amount REAL DEFAULT 0,
        notes TEXT,
        documents TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS auth_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        auth_id TEXT NOT NULL,
        action TEXT NOT NULL,
        action_date TEXT DEFAULT (datetime('now')),
        performed_by TEXT,
        notes TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS auth_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        auth_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type TEXT,
        file_size INTEGER,
        attachment_type TEXT DEFAULT 'document',
        uploaded_by TEXT DEFAULT 'provider',
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS medical_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id TEXT UNIQUE NOT NULL,
        patient_id TEXT NOT NULL,
        mrn TEXT,
        record_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        file_name TEXT,
        file_path TEXT,
        file_type TEXT,
        file_size INTEGER,
        category TEXT,
        status TEXT DEFAULT 'active',
        uploaded_by TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS inpatient_billing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_id TEXT UNIQUE NOT NULL,
        patient_id TEXT NOT NULL,
        admission_date TEXT NOT NULL,
        discharge_date TEXT,
        admission_type TEXT,
        admission_source TEXT,
        discharge_status TEXT,
        statement_covers_period_from TEXT,
        statement_covers_period_to TEXT,
        provider_id TEXT,
        insurance_id INTEGER,
        facility_name TEXT,
        facility_address TEXT,
        facility_phone TEXT,
        facility_npi TEXT,
        patient_status TEXT DEFAULT 'active',
        total_charges REAL DEFAULT 0,
        total_payments REAL DEFAULT 0,
        total_adjustments REAL DEFAULT 0,
        balance REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS ub04_form_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip_id TEXT NOT NULL,
        block_1_type_of_bill TEXT, block_2_federal_tax_id TEXT, block_3a_patient_account_no TEXT, block_3b_patient_name TEXT,
        block_4a_payer_name TEXT, block_4b_payer_id TEXT, block_5_patient_dob TEXT, block_6_patient_sex TEXT,
        block_7_payer_state TEXT, block_8_patient_condition TEXT,
        block_9_patient_address TEXT, block_10_patient_city TEXT, block_11_patient_state TEXT, block_12_patient_zip TEXT,
        block_13_patient_phone TEXT, block_14_patient_ssn TEXT, block_15_patient_gender TEXT, block_16_patient_race TEXT,
        block_17_patient_ethnicity TEXT, block_18_patient_marital TEXT,
        block_19_patient_country TEXT, block_20_patient_dob_formatted TEXT, block_21_patient_age TEXT,
        block_22_patient_weight TEXT, block_23_patient_weight_units TEXT, block_24_pregnancy TEXT,
        block_25_patient_status TEXT, block_26_patient_location TEXT, block_27_patient_prior_location TEXT,
        block_28_key_value TEXT, block_29_payer_priority TEXT, block_30_payer_plan TEXT,
        block_31_payer_member_id TEXT, block_32_payer_group TEXT, block_33_insured_name TEXT,
        block_34_insured_dob TEXT, block_35_insured_sex TEXT, block_36_insured_address TEXT,
        block_37_insured_city TEXT, block_38_insured_state TEXT, block_39_insured_zip TEXT,
        block_40_insured_phone TEXT, block_41_insured_relation TEXT, block_42_insured_ssn TEXT,
        block_43_insured_employer TEXT, block_44_insured_employer_city TEXT, block_45_insured_employer_state TEXT,
        block_46_insured_plan_name TEXT, block_47_insured_group TEXT, block_48_insured_effective TEXT,
        block_49_insured_termination TEXT, block_50_auth_number TEXT,
        block_51_provider_name TEXT, block_52_provider_address TEXT, block_53_provider_city TEXT,
        block_54_provider_state TEXT, block_55_provider_zip TEXT, block_56_provider_phone TEXT,
        block_57_provider_npi TEXT, block_58_provider_tax_id TEXT, block_59_attending_npi TEXT,
        block_60_attending_name TEXT, block_61_operating_npi TEXT, block_62_operating_name TEXT,
        block_63_other_npi TEXT, block_64_other_name TEXT,
        block_65_facility_name TEXT, block_66_facility_npi TEXT, block_67_facility_address TEXT,
        block_68_facility_city TEXT, block_69_facility_state TEXT, block_70_facility_zip TEXT,
        block_71_icd1 TEXT, block_72_icd2 TEXT, block_73_icd3 TEXT, block_74_icd4 TEXT, block_75_icd5 TEXT,
        block_76_icd6 TEXT, block_77_icd7 TEXT, block_78_icd8 TEXT, block_79_icd9 TEXT, block_80_icd10 TEXT,
        block_81_admitting_dx TEXT, block_82_principal_procedure TEXT, block_83_principal_proc_date TEXT,
        block_84_other_procedure TEXT, block_85_other_proc_date TEXT,
        block_86_occurrence_code TEXT, block_87_occurrence_span TEXT, block_88_condition_code TEXT,
        charge_lines TEXT,
        total_charges REAL DEFAULT 0, total_payments REAL DEFAULT 0,
        total_adjustments REAL DEFAULT 0, total_patient_responsibility REAL DEFAULT 0,
        balance_due REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS rejections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rejection_id TEXT UNIQUE NOT NULL,
        claim_id TEXT,
        charge_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        provider_id TEXT,
        insurance_id TEXT,
        rejection_code TEXT,
        rejection_reason TEXT,
        correction_notes TEXT,
        corrected_line_items TEXT,
        status TEXT DEFAULT 'new',
        resolution_notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id TEXT UNIQUE NOT NULL,
        patient_id TEXT NOT NULL,
        charge_id TEXT,
        provider_id TEXT,
        payer_id TEXT,
        claim_type TEXT DEFAULT 'professional',
        priority TEXT DEFAULT 'primary',
        status TEXT DEFAULT 'submitted',
        total_billed REAL DEFAULT 0,
        total_paid REAL DEFAULT 0,
        submission_date TEXT,
        adjudication_date TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS offset_reconciliation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        record_id TEXT UNIQUE NOT NULL,
        patient_id TEXT NOT NULL,
        charge_id TEXT,
        payment_id TEXT,
        record_type TEXT NOT NULL,
        old_balance REAL DEFAULT 0,
        offset_amount REAL DEFAULT 0,
        new_balance REAL DEFAULT 0,
        billed_amount REAL DEFAULT 0,
        allowed_amount REAL DEFAULT 0,
        writeoff_amount REAL DEFAULT 0,
        patient_responsibility REAL DEFAULT 0,
        paid_to_provider REAL DEFAULT 0,
        from_charge_id TEXT,
        to_charge_id TEXT,
        payer_name TEXT,
        notes TEXT,
        status TEXT DEFAULT 'completed',
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS dependents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dependent_id TEXT UNIQUE NOT NULL,
        guarantor_patient_id TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        dob TEXT,
        gender TEXT,
        relationship TEXT NOT NULL,
        ssn TEXT,
        phone TEXT,
        member_id TEXT,
        insurance_type TEXT,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS appeals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appeal_id TEXT UNIQUE NOT NULL,
        patient_id TEXT NOT NULL,
        charge_id TEXT,
        rejection_id TEXT,
        insurance_id INTEGER,
        appeal_type TEXT NOT NULL,
        appeal_reason TEXT,
        appeal_amount REAL DEFAULT 0,
        payer_name TEXT,
        reference_number TEXT,
        appeal_date TEXT,
        deadline_date TEXT,
        supporting_documents TEXT,
        clinical_notes TEXT,
        status TEXT DEFAULT 'pending',
        assigned_to TEXT,
        resolution_date TEXT,
        resolution_notes TEXT,
        approved_amount REAL DEFAULT 0,
        denial_reason TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS patient_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT UNIQUE NOT NULL,
        patient_id TEXT NOT NULL,
        document_type TEXT NOT NULL,
        document_title TEXT,
        document_data TEXT,
        status TEXT DEFAULT 'generated',
        generated_by TEXT DEFAULT 'system',
        created_at TEXT DEFAULT (datetime('now'))
      )`
    ];
    for (const s of stmts) this.db.run(s);
    this.save();
  }

  seedData() {
    const existing = this.db.exec("SELECT COUNT(*) as c FROM patients");
    if (existing.length > 0 && existing[0].values[0][0] > 0) return;

    // Providers
    const provs = [
      ['PRV001','John','Smith','1234567890','208100000X','Internal Medicine','rendering','555-0101','100 Medical Dr','New York','NY','10001'],
      ['PRV002','Sarah','Johnson','1234567891','208100000X','Family Medicine','pcp','555-0102','200 Health Ave','New York','NY','10002'],
      ['PRV003','Michael','Williams','1234567892','207Q00000X','Pediatrics','referring','555-0103','300 Care Blvd','Brooklyn','NY','11201']
    ];
    for (const p of provs) {
      this.db.run(`INSERT INTO providers (provider_id,first_name,last_name,npi,taxonomy_code,specialization,provider_type,phone,address,city,state,zip) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, p);
    }

    // Patients
    const pts = [
      ['PAT001','MRN00001','James','Anderson','1985-03-15','Male','123-45-6789','555-1001','james@email.com','123 Main St','New York','NY','10001','James Anderson','555-1001','Self'],
      ['PAT002','MRN00002','Maria','Garcia','1990-07-22','Female','987-65-4321','555-1002','maria@email.com','456 Oak Ave','Brooklyn','NY','11201','Carlos Garcia','555-1003','Spouse'],
      ['PAT003','MRN00003','Robert','Chen','1978-11-08','Male','456-78-9012','555-1004','robert@email.com','789 Pine Rd','Queens','NY','11101','Robert Chen','555-1004','Self']
    ];
    for (const p of pts) {
      this.db.run(`INSERT INTO patients (patient_id,mrn,first_name,last_name,dob,gender,ssn,phone,email,address,city,state,zip,guarantor,guarantor_phone,guarantor_relation) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, p);
    }

    // Insurances (3 for PAT001)
    const ins = [
      ['PAT001','primary','Blue Cross Blue Shield','BCBS-M001','GRP-1001','PPO Gold','BCBS001','James Anderson','1985-03-15','Self','2024-01-01',null,30,500,20,5000],
      ['PAT001','secondary','Aetna','AET-M002','GRP-2001','HMO Silver','AET001','James Anderson','1985-03-15','Self','2024-01-01',null,20,1000,30,8000],
      ['PAT001','tertiary','Cigna','CIG-M003','GRP-3001','PPO Bronze','CIG001','James Anderson','1985-03-15','Self','2024-01-01',null,40,2000,40,10000],
      ['PAT002','primary','UnitedHealthcare','UHC-M004','GRP-4001','PPO Platinum','UHC001','Maria Garcia','1990-07-22','Self','2024-01-01',null,25,750,25,6000],
      ['PAT003','primary','Medicare','MED-M005','GRP-5001','Original Medicare','MED001','Robert Chen','1978-11-08','Self','2024-01-01',null,0,240,20,7500]
    ];
    for (const i of ins) {
      this.db.run(`INSERT INTO insurances (patient_id,insurance_type,payer_name,member_id,group_number,plan_name,payer_id,subscriber_name,subscriber_dob,relationship,effective_date,termination_date,copay,deductible,coinsurance,out_of_pocket_max) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, i);
    }

    // Eligibility
    const eligs = [
      ['PAT001','BCBS-M001',1,'2025-01-15','active','2024-01-01','2025-12-31','PPO','In-Network','PRV002',0,1],
      ['PAT002','UHC-M004',4,'2025-01-15','active','2024-01-01','2025-12-31','PPO','In-Network','PRV003',1,1],
      ['PAT003','MED-M005',5,'2025-01-15','active','2024-01-01','2025-12-31','Original Medicare','In-Network','PRV002',0,0]
    ];
    for (const e of eligs) {
      this.db.run(`INSERT INTO eligibility_master (patient_id,member_id,insurance_id,verification_date,status,effective_date,termination_date,plan_type,network,pcp,referral_required,auth_required) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, e);
    }

    // 10 Benefits for each eligibility
    const benefits = [
      ['office_visit','Office Visit',1,30,25,20,52,4,48,0],
      ['specialist_visit','Specialist Visit',1,50,25,30,26,2,24,1],
      ['emergency_room','Emergency Room',1,250,0,20,6,1,5,0],
      ['urgent_care','Urgent Care',1,75,10,20,12,0,12,0],
      ['laboratory','Laboratory Services',1,15,0,15,30,5,25,0],
      ['radiology','Radiology/Imaging',1,50,0,20,10,3,7,1],
      ['preventive_care','Preventive Care',1,0,0,0,4,1,3,0],
      ['mental_health','Mental Health',1,40,50,25,20,2,18,1],
      ['physical_therapy','Physical Therapy',1,40,25,30,30,5,25,1],
      ['prescription','Prescription Drugs',1,10,25,25,60,10,50,0]
    ];
    for (let eid = 1; eid <= 3; eid++) {
      for (const b of benefits) {
        this.db.run(`INSERT INTO eligibility_benefits (eligibility_id,benefit_type,benefit_name,covered,copay_amount,deductible_amount,coinsurance_percent,max_visits,visits_used,remaining_visits,prior_auth_required) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [eid, ...b]);
      }
    }

    // Seed default benefit templates (Master User)
    const tplBenefits = [
      ['standard','office_visit','Office Visit',1,30,25,20,52,0,''],
      ['standard','specialist_visit','Specialist Visit',1,50,25,30,26,1,''],
      ['standard','emergency_room','Emergency Room',1,250,0,20,6,0,''],
      ['standard','urgent_care','Urgent Care',1,75,10,20,12,0,''],
      ['standard','laboratory','Laboratory Services',1,15,0,15,30,0,''],
      ['standard','radiology','Radiology/Imaging',1,50,0,20,10,1,''],
      ['standard','preventive_care','Preventive Care',1,0,0,0,4,0,''],
      ['standard','mental_health','Mental Health',1,40,50,25,20,1,''],
      ['standard','physical_therapy','Physical Therapy',1,40,25,30,30,1,''],
      ['standard','prescription','Prescription Drugs',1,10,25,25,60,0,''],
      ['premium','office_visit','Office Visit - Premium',1,15,15,15,99,0,'Premium plan lower copay'],
      ['premium','specialist_visit','Specialist Visit - Premium',1,25,15,20,99,1,''],
      ['premium','emergency_room','Emergency Room - Premium',1,150,0,15,8,0,''],
      ['premium','laboratory','Lab - Premium',1,5,0,10,99,0,''],
      ['premium','imaging','Advanced Imaging - Premium',1,30,0,15,20,1,'MRI/CT/PET'],
      ['hmo_basic','office_visit','Office Visit - HMO',1,20,0,20,40,0,'HMO basic plan'],
      ['hmo_basic','specialist_visit','Specialist Visit - HMO',1,40,0,25,20,1,'Referral required'],
      ['hmo_basic','preventive_care','Preventive Care - HMO',1,0,0,0,6,0,''],
    ];
    for (const t of tplBenefits) {
      this.db.run(`INSERT INTO benefit_templates (template_name,benefit_type,benefit_name,covered,copay_amount,deductible_amount,coinsurance_percent,max_visits,prior_auth_required,notes,is_default) VALUES (?,?,?,?,?,?,?,?,?,?,1)`, t);
    }

    // Default appointment
    this.db.run(`INSERT INTO appointments (appointment_id,patient_id,provider_id,appointment_date,appointment_time,appointment_type,visit_type,status,reason,pcp_provider_id,insurance_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ['APT001','PAT001','PRV002','2026-07-25','10:00','Follow-up','office','scheduled','Annual Physical Exam','PRV002',1]);

    // ============ MASTER DATA TABLES ============
    this.db.run(`CREATE TABLE IF NOT EXISTS master_insurances (
      id INTEGER PRIMARY KEY AUTOINCREMENT, payer_id TEXT UNIQUE, payer_name TEXT NOT NULL, payer_type TEXT DEFAULT 'commercial',
      address TEXT, city TEXT, state TEXT, zip TEXT, phone TEXT, fax TEXT, claims_address TEXT,
      payer_code TEXT, clearinghouse_id TEXT, electronic_payor_id TEXT, notes TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS master_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id TEXT UNIQUE, first_name TEXT, last_name TEXT,
      npi TEXT, taxonomy_code TEXT, specialization TEXT, license_number TEXT,
      facility_name TEXT, address TEXT, city TEXT, state TEXT, zip TEXT,
      phone TEXT, fax TEXT, email TEXT, credential TEXT, status TEXT DEFAULT 'active',
      accepting_patients INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS master_cpt (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, description TEXT, category TEXT,
      rvu_work REAL DEFAULT 0, rvu_facility REAL DEFAULT 0, rvu_mp REAL DEFAULT 0,
      fee_schedule REAL DEFAULT 0, status TEXT DEFAULT 'active', year TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS master_icd (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, description TEXT, category TEXT,
      chapter TEXT, billable INTEGER DEFAULT 1, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS master_modifiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, description TEXT, category TEXT,
      pricing TEXT, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS master_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT, room_number TEXT UNIQUE NOT NULL, room_type TEXT,
      floor TEXT, wing TEXT, bed_count INTEGER DEFAULT 1, status TEXT DEFAULT 'available',
      department TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS master_pcp (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pcp_id TEXT UNIQUE, first_name TEXT, last_name TEXT,
      npi TEXT, specialty TEXT, facility_name TEXT, address TEXT, phone TEXT, fax TEXT,
      accepting_patients INTEGER DEFAULT 1, notes TEXT, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS master_hospital (
      id INTEGER PRIMARY KEY AUTOINCREMENT, hospital_id TEXT UNIQUE, hospital_name TEXT NOT NULL,
      address TEXT, city TEXT, state TEXT, zip TEXT, phone TEXT, fax TEXT,
      website TEXT, taxonomy TEXT, npi TEXT, license_number TEXT, beds INTEGER DEFAULT 0,
      departments TEXT, emergency INTEGER DEFAULT 1, trauma_level TEXT, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS master_npi (
      id INTEGER PRIMARY KEY AUTOINCREMENT, npi TEXT UNIQUE NOT NULL, first_name TEXT, last_name TEXT,
      organization_name TEXT, credential TEXT, taxonomy_code TEXT, taxonomy_desc TEXT,
      address TEXT, city TEXT, state TEXT, zip TEXT, phone TEXT,
      provider_type TEXT, enumeration_date TEXT, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // Seed default modifiers
    const defaultModifiers = [
      ['25','Significant, Separately Identifiable E/M Service','E/M','-'],
      ['26','Professional Component','Professional','-'],
      ['TC','Technical Component','Technical','-'],
      ['59','Distinct Procedural Service','Payment','Eligible for payment'],
      ['76','Repeat Procedure by Same Physician','Surgery','-'],
      ['modifier_xe','Separate Encounter','Encounter','-'],
      ['modifier_xs','Separate Structure','Surgery','-'],
      ['modifier_xu','Unusual Non-Overlapping Service','Payment','-'],
      ['modifier_xp','Separate Practitioner','Encounter','-'],
      ['modifier_50','Bilateral Procedure','Surgery','150% of fee schedule'],
      ['modifier_51','Multiple Procedures','Surgery','50% of primary'],
      ['modifier_52','Reduced Services','Surgery','Reduced fee'],
      ['modifier_53','Discontinued Procedure','Surgery','Partial payment'],
      ['modifier_78','Unplanned Return to OR','Surgery','-'],
      ['modifier_91','Repeat Clinical Lab Test','Lab','-'],
    ];
    for (const m of defaultModifiers) {
      this.db.run(`INSERT OR IGNORE INTO master_modifiers (code,description,category,pricing) VALUES (?,?,?,?)`, m);
    }

    // Seed default rooms
    const defaultRooms = [
      ['RM-101','Examination Room','1','East',1,'available','Primary Care'],
      ['RM-102','Examination Room','1','East',1,'available','Primary Care'],
      ['RM-103','Examination Room','1','East',1,'maintenance','Primary Care'],
      ['RM-201','Procedure Room','2','West',1,'available','Specialty'],
      ['RM-202','Procedure Room','2','West',1,'available','Specialty'],
      ['RM-301','Inpatient Room','3','North',2,'available','Inpatient'],
      ['RM-302','Inpatient Room','3','North',2,'occupied','Inpatient'],
      ['RM-303','ICU Room','3','North',1,'available','Critical Care'],
      ['RM-401','Operating Room','4','South',1,'available','Surgery'],
      ['RM-402','Operating Room','4','South',1,'occupied','Surgery'],
    ];
    for (const r of defaultRooms) {
      this.db.run(`INSERT OR IGNORE INTO master_rooms (room_number,room_type,floor,wing,bed_count,status,department) VALUES (?,?,?,?,?,?,?)`, r);
    }

    // Seed master ICD codes
    const defaultICD = [
      ['I10','Essential (primary) hypertension','Circulatory','Circulatory',1],
      ['E11.9','Type 2 diabetes mellitus without complications','Endocrine','Endocrine',1],
      ['E11.65','Type 2 diabetes mellitus with hyperglycemia','Endocrine','Endocrine',1],
      ['E11.10','Type 2 diabetes mellitus with ketoacidosis','Endocrine','Endocrine',1],
      ['E78.5','Hyperlipidemia, unspecified','Endocrine','Endocrine',1],
      ['E03.9','Hypothyroidism, unspecified','Endocrine','Endocrine',1],
      ['J06.9','Acute upper respiratory infection, unspecified','Respiratory','Respiratory',1],
      ['J18.9','Pneumonia, unspecified organism','Respiratory','Respiratory',1],
      ['J44.1','Chronic obstructive pulmonary disease with acute exacerbation','Respiratory','Respiratory',1],
      ['J45.20','Mild intermittent asthma, uncomplicated','Respiratory','Respiratory',1],
      ['N17.9','Acute kidney injury, unspecified','Genitourinary','Genitourinary',1],
      ['N18.3','Chronic kidney disease, stage 3','Genitourinary','Genitourinary',1],
      ['N39.0','Urinary tract infection','Genitourinary','Genitourinary',1],
      ['K21.0','Gastro-esophageal reflux disease with esophagitis','Digestive','Digestive',1],
      ['K58.9','Irritable bowel syndrome without diarrhea','Digestive','Digestive',1],
      ['K35.80','Acute appendicitis, unspecified','Digestive','Digestive',1],
      ['K80.20','Calculus of gallbladder without cholecystitis','Digestive','Digestive',1],
      ['M54.5','Low back pain','Musculoskeletal','Musculoskeletal',1],
      ['M17.11','Primary osteoarthritis, right knee','Musculoskeletal','Musculoskeletal',1],
      ['M79.3','Panniculitis, unspecified','Musculoskeletal','Musculoskeletal',1],
      ['F32.1','Major depressive disorder, single episode, moderate','Mental Health','Mental Health',1],
      ['F41.1','Generalized anxiety disorder','Mental Health','Mental Health',1],
      ['F41.0','Panic disorder without agoraphobia','Mental Health','Mental Health',1],
      ['R07.9','Chest pain, unspecified','Symptoms','Symptoms',1],
      ['R06.02','Shortness of breath','Symptoms','Symptoms',1],
      ['R06.02','Dyspnea on exertion','Symptoms','Symptoms',1],
      ['R50.9','Fever, unspecified','Symptoms','Symptoms',1],
      ['R11.02','Nausea','Symptoms','Symptoms',1],
      ['R51.9','Headache, unspecified','Symptoms','Symptoms',1],
      ['R05.9','Cough, unspecified','Symptoms','Symptoms',1],
      ['R56.0','Convulsions, not elsewhere classified','Symptoms','Symptoms',1],
      ['E86.0','Dehydration','Nutritional','Nutritional',1],
      ['E44.0','Moderate malnutrition','Nutritional','Nutritional',1],
      ['I21.0','Acute ST elevation myocardial infarction','Circulatory','Circulatory',1],
      ['I21.4','Acute non-ST elevation myocardial infarction','Circulatory','Circulatory',1],
      ['I63.9','Cerebral infarction, unspecified','Circulatory','Circulatory',1],
      ['I48.91','Unspecified atrial fibrillation','Circulatory','Circulatory',1],
      ['I50.9','Heart failure, unspecified','Circulatory','Circulatory',1],
      ['Z00.00','Encounter for general adult medical exam','Encounter','Encounter',1],
      ['Z00.121','Encounter for routine child health exam with abnormal findings','Encounter','Encounter',1],
      ['Z23','Encounter for immunization','Encounter','Encounter',1],
      ['Z12.11','Encounter for screening for malignant neoplasm of colon','Encounter','Encounter',1],
      ['Z12.31','Encounter for screening mammogram','Encounter','Encounter',1],
      ['C34.90','Malignant neoplasm of unspecified part of right bronchus or lung','Neoplasm','Neoplasm',1],
      ['C50.919','Malignant neoplasm of unspecified site of unspecified female breast','Neoplasm','Neoplasm',1],
      ['D64.9','Anemia, unspecified','Blood','Blood',1],
      ['D72.810','Lymphocytopenia','Blood','Blood',1],
      ['S52.501A','Fracture of lower end of radius, right arm','Injury','Injury',1],
      ['T78.2XXA','Anaphylactic shock, unspecified','Injury','Injury',1],
      ['M80.00','Age-related osteoporosis without current pathological fracture','Musculoskeletal','Musculoskeletal',1],
    ];
    for (const i of defaultICD) {
      this.db.run(`INSERT OR IGNORE INTO master_icd (code,description,category,chapter,billable,status) VALUES (?,?,?,?,?,'active')`, i);
    }

    // Seed master CPT codes
    const defaultCPT = [
      ['99201','Office visit, new patient, straightforward','Office Visit',25,0,0,50],
      ['99202','Office visit, new patient, low complexity','Office Visit',42,0,0,95],
      ['99203','Office visit, new patient, moderate complexity','Office Visit',72,0,0,140],
      ['99204','Office visit, new patient, high complexity','Office Visit',112,0,0,210],
      ['99205','Office visit, new patient, high complexity','Office Visit',150,0,0,290],
      ['99211','Office visit, established, minimal','Office Visit',13,0,0,24],
      ['99212','Office visit, established, straightforward','Office Visit',28,0,0,45],
      ['99213','Office visit, established, low complexity','Office Visit',46,0,0,80],
      ['99214','Office visit, established, moderate complexity','Office Visit',67,0,0,120],
      ['99215','Office visit, established, high complexity','Office Visit',89,0,0,180],
      ['99281','ED visit, self-limited','Emergency',67,0,0,150],
      ['99282','ED visit, low complexity','Emergency',100,0,0,220],
      ['99283','ED visit, moderate complexity','Emergency',150,0,0,350],
      ['99284','ED visit, high complexity','Emergency',150,0,0,350],
      ['99285','ED visit, high complexity, critical','Emergency',190,0,0,520],
      ['99221','Initial hospital care, low complexity','Inpatient',150,0,0,250],
      ['99222','Initial hospital care, moderate complexity','Inpatient',250,0,0,380],
      ['99223','Initial hospital care, high complexity','Inpatient',350,0,0,520],
      ['99231','Subsequent hospital care, low','Inpatient',55,0,0,100],
      ['99232','Subsequent hospital care, moderate','Inpatient',85,0,0,150],
      ['99233','Subsequent hospital care, high','Inpatient',120,0,0,220],
      ['99385','Preventive visit, new patient, 18-39','Preventive',80,0,0,160],
      ['99386','Preventive visit, new patient, 40-64','Preventive',110,0,0,220],
      ['99387','Preventive visit, new patient, 65+','Preventive',140,0,0,280],
      ['99395','Preventive visit, established, 18-39','Preventive',60,0,0,130],
      ['99396','Preventive visit, established, 40-64','Preventive',85,0,0,180],
      ['99397','Preventive visit, established, 65+','Preventive',110,0,0,240],
      ['93000','Electrocardiogram, 12-lead, with interpretation','Cardiology',45,0,0,45],
      ['93005','Electrocardiogram, tracing only','Cardiology',20,0,0,20],
      ['93010','Electrocardiogram, interpretation only','Cardiology',15,0,0,15],
      ['93306','Transthoracic echocardiography','Cardiology',200,0,0,300],
      ['71046','Chest X-ray, 2 views','Radiology',40,0,0,85],
      ['71047','Chest X-ray, minimum 2 views','Radiology',35,0,0,70],
      ['73030','X-ray, shoulder, minimum 2 views','Radiology',40,0,0,75],
      ['73562','X-ray, hip, minimum 2 views','Radiology',45,0,0,85],
      ['73721','MRI, lower extremity joint, without contrast','Radiology',250,0,0,500],
      ['70553','MRI, brain, with and without contrast','Radiology',350,0,0,800],
      ['74177','CT, abdomen and pelvis, with contrast','Radiology',200,0,0,450],
      ['74178','CT, abdomen and pelvis, with and without contrast','Radiology',300,0,0,600],
      ['71260','CT, thorax, with contrast','Radiology',180,0,0,400],
      ['80053','Comprehensive metabolic panel','Lab',12,0,0,52],
      ['80048','Basic metabolic panel','Lab',8,0,0,35],
      ['85025','Complete blood count with differential','Lab',6,0,0,32],
      ['85027','Complete blood count, automated','Lab',5,0,0,28],
      ['80061','Lipid panel','Lab',10,0,0,45],
      ['84443','TSH, free (thyroid stimulating hormone)','Lab',8,0,0,38],
      ['84480','Troponin T, qualitative','Lab',15,0,0,65],
      ['82947','Glucose, quantitative','Lab',3,0,0,18],
      ['82950','Hemoglobin A1c','Lab',8,0,0,42],
      ['81001','Urinalysis, with microscopy','Lab',4,0,0,22],
      ['87880','Influenza A/B, rapid immunoassay','Lab',12,0,0,55],
      ['86769','HIV-1/2 antibody, immunoassay','Lab',10,0,0,45],
      ['96375','Therapeutic injection, IV push','Injection',20,0,0,75],
      ['96372','Therapeutic injection, subcutaneous or IM','Injection',15,0,0,50],
      ['90471','Immunization administration, first vaccine','Immunization',10,0,0,25],
      ['90472','Immunization administration, each additional','Immunization',5,0,0,15],
      ['90715','Tdap vaccine, intramuscular','Immunization',25,0,0,65],
      ['90732','Pneumococcal vaccine','Immunization',40,0,0,120],
      ['90686','Influenza vaccine, quadrivalent','Immunization',20,0,0,55],
      ['49505','Inguinal hernia repair, indirect, age>5 years','Surgery',250,0,0,600],
      ['47562','Laparoscopic cholecystectomy','Surgery',500,0,0,1500],
      ['44970','Laparoscopic appendectomy','Surgery',450,0,0,1200],
      ['27447','Total knee arthroplasty','Surgery',800,0,0,3000],
      ['27130','Total hip arthroplasty','Surgery',850,0,0,3200],
    ];
    for (const c of defaultCPT) {
      this.db.run(`INSERT OR IGNORE INTO master_cpt (code,description,category,rvu_work,rvu_facility,rvu_mp,fee_schedule,status) VALUES (?,?,?,?,'0','0',?,'active')`, [c[0],c[1],c[2],c[3],c[6]]);
    }

    // ============ MASTER INSURANCES SEED ============
    const defaultIns = [
      ['BCBS001','Blue Cross Blue Shield','Commercial','(800) 555-0101','Chicago','IL'],
      ['AETNA01','Aetna Health','Commercial','(800) 555-0102','Hartford','CT'],
      ['UHC001','UnitedHealthcare','Commercial','(800) 555-0103','Minneapolis','MN'],
      ['CIGNA01','Cigna Healthcare','Commercial','(800) 555-0104','Bloomfield','CT'],
      ['MEDICR','Medicare Part B','Medicare','(800) 555-0105','Baltimore','MD'],
      ['MCAID01','Medicaid','Medicare','(800) 555-0106','Washington','DC'],
      ['HUMANA1','Humana Insurance','Commercial','(800) 555-0107','Louisville','KY'],
      ['TRICAR1','Tricare Select','Tricare','(800) 555-0108','Falls Church','VA'],
      ['MOLINA1','Molina Healthcare','Medicaid','(800) 555-0109','Long Beach','CA'],
      ['GEICOM1','Geico Medical','Workers Comp','(800) 555-0110','Chevy Chase','MD']
    ];
    for (const i of defaultIns) {
      this.db.run(`INSERT OR IGNORE INTO master_insurances (payer_id,payer_name,payer_type,phone,city,state,status) VALUES (?,?,?,?,?,?,?)`, [i[0],i[1],i[2],i[3],i[4],i[5],'active']);
    }

    // ============ MASTER PROVIDERS SEED ============
    const defaultProv = [
      ['PRV001','John','Smith','1234567890','Family Medicine','(555) 201-0001','active'],
      ['PRV002','Sarah','Johnson','1234567891','Internal Medicine','(555) 201-0002','active'],
      ['PRV003','Michael','Williams','1234567892','Cardiology','(555) 201-0003','active'],
      ['PRV004','Emily','Brown','1234567893','Pediatrics','(555) 201-0004','active'],
      ['PRV005','David','Davis','1234567894','Orthopedics','(555) 201-0005','active'],
      ['PRV006','Lisa','Miller','1234567895','OB/GYN','(555) 201-0006','active'],
      ['PRV007','James','Wilson','1234567896','Neurology','(555) 201-0007','active'],
      ['PRV008','Patricia','Moore','1234567897','Psychiatry','(555) 201-0008','active']
    ];
    for (const p of defaultProv) {
      this.db.run(`INSERT OR IGNORE INTO master_providers (provider_id,first_name,last_name,npi,specialization,phone,status,accepting_patients) VALUES (?,?,?,?,?,?,?,?)`, [p[0],p[1],p[2],p[3],p[4],p[5],p[6],1]);
    }

    // ============ MASTER PCP SEED ============
    const defaultPCP = [
      ['PCP001','Alice','Taylor','2234567890','Family Medicine','Provision Clinic A','(555) 301-0001'],
      ['PCP002','Robert','Anderson','2234567891','Internal Medicine','Provision Clinic B','(555) 301-0002'],
      ['PCP003','Jennifer','Thomas','2234567892','Pediatrics','Provision Childrens','(555) 301-0003'],
      ['PCP004','William','Jackson','2234567893','OB/GYN','Provision Womens','(555) 301-0004'],
      ['PCP005','Barbara','White','2234567894','Family Medicine','Provision Clinic C','(555) 301-0005']
    ];
    for (const p of defaultPCP) {
      this.db.run(`INSERT OR IGNORE INTO master_pcp (pcp_id,first_name,last_name,npi,specialty,facility_name,phone,accepting_patients,status) VALUES (?,?,?,?,?,?,?,?,?)`, [p[0],p[1],p[2],p[3],p[4],p[5],p[6],1,'active']);
    }

    // ============ MASTER HOSPITAL SEED ============
    const defaultHosp = [
      ['HOS001','Provision Medical Center','123 Health Blvd','Springfield','IL','62701','(555) 401-0001',200,'Level I'],
      ['HOS002','St. Mary General Hospital','456 Care Ave','Chicago','IL','60601','(555) 401-0002',350,'Level II'],
      ['HOS003','Regional Trauma Center','789 Emergency Dr','Naperville','IL','60540','(555) 401-0003',150,'Level I'],
      ['HOS004','Community Health Hospital','321 Wellness Way','Aurora','IL','60502','(555) 401-0004',100,'Level III'],
      ['HOS005','Childrens Specialty Hospital','555 Kids Ln','Evanston','IL','60201','(555) 401-0005',80,'Level IV']
    ];
    for (const h of defaultHosp) {
      this.db.run(`INSERT OR IGNORE INTO master_hospital (hospital_id,hospital_name,address,city,state,zip,phone,beds,trauma_level,status) VALUES (?,?,?,?,?,?,?,?,?,?)`, [h[0],h[1],h[2],h[3],h[4],h[5],h[6],h[7],h[8],'active']);
    }

    // ============ MASTER NPI SEED ============
    const defaultNPI = [
      ['1234567890','John','Smith','MD','208100000X','Family Medicine','100 Main St','Springfield','IL','62701','(555) 201-0001','Individual'],
      ['1234567891','Sarah','Johnson','MD','208100000X','Internal Medicine','200 Oak Ave','Springfield','IL','62702','(555) 201-0002','Individual'],
      ['1234567892','Michael','Williams','DO','208100000X','Cardiology','300 Heart Blvd','Chicago','IL','60601','(555) 201-0003','Individual'],
      ['1234567893','Emily','Brown','MD','208000000X','Pediatrics','400 Child Ln','Naperville','IL','60540','(555) 201-0004','Individual'],
      ['1234567894','David','Davis','MD','207R00000X','Orthopedics','500 Bone St','Aurora','IL','60502','(555) 201-0005','Individual'],
      ['1234567895','Lisa','Miller','NP','363L00000X','Nurse Practitioner','600 Health Way','Evanston','IL','60201','(555) 201-0006','Individual'],
      ['1234567896','James','Wilson','MD','207R00000X','Neurology','700 Brain Blvd','Peoria','IL','61602','(555) 201-0007','Individual'],
      ['1234567897','Patricia','Moore','MD','2084P0015X','Psychiatry','800 Mind Way','Rockford','IL','61101','(555) 201-0008','Individual'],
      ['1234567898','Robert','Taylor','PA','363A00000X','Physician Assistant','900 Clinic Dr','Springfield','IL','62703','(555) 201-0009','Individual'],
      ['1234567899','Maria','Garcia','MD','208100000X','Family Medicine','1000 Wellness Ave','Chicago','IL','60602','(555) 201-0010','Individual']
    ];
    for (const n of defaultNPI) {
      this.db.run(`INSERT OR IGNORE INTO master_npi (npi,first_name,last_name,credential,taxonomy_code,taxonomy_desc,address,city,state,zip,phone,provider_type,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [n[0],n[1],n[2],n[3],n[4],n[5],n[6],n[7],n[8],n[9],n[10],n[11],'active']);
    }

    // ============ MEDICAL CODING REVIEW TABLES ============
    this.db.run(`CREATE TABLE IF NOT EXISTS coding_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_id TEXT UNIQUE NOT NULL,
      patient_id TEXT NOT NULL,
      patient_name TEXT,
      dob TEXT,
      gender TEXT,
      encounter_date TEXT,
      encounter_type TEXT,
      visit_type TEXT,
      provider_id TEXT,
      provider_name TEXT,
      facility TEXT,
      chief_complaint TEXT,
      history_of_illness TEXT,
      review_of_systems TEXT,
      physical_exam TEXT,
      assessment TEXT,
      plan TEXT,
      clinical_notes TEXT,
      medical_record_text TEXT,
      status TEXT DEFAULT 'pending_review',
      assigned_coder TEXT,
      coder_notes TEXT,
      sent_to_billing INTEGER DEFAULT 0,
      sent_to_billing_at TEXT,
      billing_batch_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS coding_checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_id TEXT NOT NULL,
      checkpoint_name TEXT NOT NULL,
      checkpoint_category TEXT,
      is_checked INTEGER DEFAULT 0,
      checked_by TEXT,
      checked_at TEXT,
      notes TEXT,
      severity TEXT DEFAULT 'info',
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS coding_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_id TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      doc_category TEXT,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER DEFAULT 0,
      mime_type TEXT,
      description TEXT,
      uploaded_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS coding_icd (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_id TEXT NOT NULL,
      icd_code TEXT NOT NULL,
      icd_description TEXT,
      sequence_order INTEGER DEFAULT 1,
      is_primary INTEGER DEFAULT 0,
      added_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS coding_cpt (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_id TEXT NOT NULL,
      cpt_code TEXT NOT NULL,
      cpt_description TEXT,
      units INTEGER DEFAULT 1,
      modifier1 TEXT,
      modifier2 TEXT,
      modifier3 TEXT,
      charge_amount REAL DEFAULT 0,
      is_approved INTEGER DEFAULT 0,
      added_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS coding_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      review_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    // Seed sample coding review
    const crSeedSql = `INSERT OR IGNORE INTO coding_reviews (review_id,patient_id,patient_name,dob,gender,encounter_date,encounter_type,visit_type,provider_id,provider_name,facility,chief_complaint,history_of_illness,review_of_systems,physical_exam,assessment,plan,clinical_notes,medical_record_text,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    this.db.run(crSeedSql,
      ['CRV001','PAT001','John Smith','1985-06-15','Male','2026-07-15','Office Visit','New Patient','PRV001','Dr. Sarah Johnson','Provision Medical Center',
       'Chest pain and shortness of breath',
       'Patient presents with 3-day history of substernal chest pain radiating to left arm, associated with shortness of breath on exertion.',
       'Constitutional: No fever, chills. Cardiovascular: Chest pain, palpitations. Respiratory: SOB, no cough.',
       'BP 158/92, HR 98, RR 20, Temp 98.6F, SpO2 94%. Heart: Tachycardic, regular rhythm. Lungs: Clear bilaterally.',
       '1. Chest pain (R07.9) 2. Shortness of breath (R06.02) 3. Hypertension (I10)',
       '1. ECG STAT 2. CBC, BMP, Troponin 3. CXR 4. Aspirin 81mg 5. Lisinopril 10mg',
       'ECG normal sinus rhythm. Troponin pending. Patient counseled.',
       'DOS: 07/15/2026 Patient: John Smith PAT001 Provider: Dr. Sarah Johnson. CC: Chest pain and SOB. HPI: 41yo male, 3-day substernal chest pain sharp 7/10 radiating to left arm. Associated SOB on exertion. PMH: HTN non-compliant. Meds: Lisinopril 10mg (not taking), Atorvastatin 20mg. Allergies: NKDA. ROS: Chest pain, palpitations, SOB. PE: BP 158/92 HR 98 RR 20 SpO2 94%. Heart tachycardic regular. Lungs clear. Assessment: 1.Chest pain R07.9 2.SOB R06.02 3.HTN I10. Plan: ECG STAT, CBC BMP Troponin, CXR, Aspirin 81mg, Lisinopril 10mg, f/u 1 week.',
       'pending_review']);
    this.db.run(crSeedSql,
      ['CRV002','PAT002','Jane Doe','1990-03-22','Female','2026-07-14','Emergency','Urgent','PRV003','Dr. Michael Chen','Provision Medical Center',
       'Right lower quadrant abdominal pain',
       'Patient presents with 12-hour history of RLQ abdominal pain, nausea, and low-grade fever. Pain constant, sharp, 8/10.',
       'GI: RLQ pain, nausea. GU: No dysuria. Constitutional: Fever, malaise.',
       'Temp 100.8F, HR 102, BP 120/78, RR 18. Abdomen: RLQ tenderness with rebound, guarding. Rovsing sign positive.',
       '1. Acute appendicitis (K35.80) 2. Nausea (R11.02) 3. Fever (R50.9)',
       '1. CBC 2. CT abdomen/pelvis with contrast 3. Surgical consult 4. NPO 5. IV fluids 6. Morphine IV',
       'CT shows inflamed appendix, no perforation. WBC 14,200.',
       'DOS: 07/14/2026 Patient: Jane Doe PAT002 Provider: Dr. Michael Chen. CC: RLQ abdominal pain. HPI: 36yo female, 12hr RLQ pain sharp 8/10. Nausea, low-grade fever. PMH: None. Meds: OCP, ibuprofen. Allergies: Penicillin (rash). PE: Temp 100.8F HR 102 BP 120/78. Abdomen RLQ tender with rebound. Rovsing positive. Assessment: 1.Acute appendicitis K35.80 2.Nausea R11.02 3.Fever R50.9. Plan: CT abd/pel w/contrast, surgical consult, NPO, IV NS, Morphine IV.',
       'reviewing']);
    this.db.run(crSeedSql,
      ['CRV003','PAT003','Robert Wilson','1972-11-08','Male','2026-07-10','Inpatient','Admission','PRV002','Dr. Emily Rodriguez','Provision Medical Center',
       'Uncontrolled diabetes with DKA',
       'Patient admitted via ED with DKA. Blood glucose 580, pH 7.21, bicarb 12. History Type 2 DM, non-compliant with insulin.',
       'Constitutional: Fatigue, weakness, weight loss. GI: Nausea, vomiting, polyuria. Neuro: Confusion.',
       'BP 100/60, HR 115, RR 28 Kussmaul, Temp 99.2F, SpO2 98%. Dehydrated. Kussmaul respirations. Fruity breath.',
       '1. DKA (E11.10) 2. Type 2 DM (E11.65) 3. AKI (N17.9) 4. Dehydration (E86.0)',
       '1. IV Insulin protocol 2. IV hydration NS 3. BMP q2h 4. K+ replacement 5. Anion gap monitoring 6. Endo consult',
       'DKA protocol initiated. Anion gap closing. K+ 3.8 replaced. Patient improving.',
       'DOS: 07/10/2026 Patient: Robert Wilson PAT003 Provider: Dr. Emily Rodriguez. CC: Altered mental status DKA. HPI: 53yo male T2DM presenting DKA. BG 580, pH 7.21, bicarb 12. Non-compliant insulin 2 weeks. PMH: T2DM. ABG: pH 7.21 pCO2 28 HCO3 12. Anion gap 24. BMP: Na 132 K 5.2 Cl 98 CO2 12 BUN 38 Cr 2.1. Assessment: 1.DKA E11.10 2.T2DM E11.65 3.AKI N17.9 4.Dehydration E86.0. Plan: IV insulin, IV NS, BMP q2h, K+ replacement, anion gap monitoring, endo consult.',
       'completed']);

    // Seed checkpoints for sample reviews
    const sampleCheckpoints = [
      ['CRV001','Demographics Verified','Documentation','checked','System','Patient identity confirmed'],
      ['CRV001','Insurance Verified','Documentation','checked','System','Insurance eligibility confirmed'],
      ['CRV001','Chief Complaint Documented','Clinical','checked','System','CC clearly stated'],
      ['CRV001','HPI Complete','Clinical','checked','System','HPI includes OLDCARTS'],
      ['CRV001','ROS Complete','Clinical','checked','System','All systems reviewed'],
      ['CRV001','Physical Exam Complete','Clinical','checked','System','Exam matches E/M level'],
      ['CRV001','Assessment Documented','Clinical','checked','System','Diagnoses listed'],
      ['CRV001','Plan Documented','Clinical','unchecked','Coder','Verify treatment plan specificity'],
      ['CRV001','Orders Reviewed','Documentation','unchecked','Coder','Check for duplicate orders'],
      ['CRV001','Modifier Review','Coding','unchecked','Coder','Verify appropriate modifiers'],
      ['CRV001','ICD-10 Validation','Coding','unchecked','Coder','Confirm code specificity'],
      ['CRV001','CPT Validation','Coding','unchecked','Coder','Verify CPT selection'],
      ['CRV001','Medical Necessity Check','Compliance','unchecked','Coder','Ensure medical necessity documented'],
      ['CRV001','CDI Review','Compliance','unchecked','Coder','Clinical documentation improvement'],
      ['CRV001','Ready for Billing','Administrative','unchecked','Coder','Final review complete'],
      ['CRV002','Demographics Verified','Documentation','checked','System','Patient identity confirmed'],
      ['CRV002','Chief Complaint Documented','Clinical','checked','System','CC clearly stated'],
      ['CRV002','HPI Complete','Clinical','checked','System','HPI includes OLDCARTS'],
      ['CRV002','Physical Exam Complete','Clinical','checked','System','Exam matches E/M level'],
      ['CRV002','Assessment Documented','Clinical','checked','System','Diagnoses listed'],
      ['CRV002','ICD-10 Validation','Coding','unchecked','Coder','Confirm code specificity'],
      ['CRV002','CPT Validation','Coding','unchecked','Coder','Verify CPT selection'],
      ['CRV002','Modifier Review','Coding','unchecked','Coder','Verify modifiers'],
      ['CRV002','Medical Necessity Check','Compliance','unchecked','Coder','Ensure medical necessity documented'],
      ['CRV002','Ready for Billing','Administrative','unchecked','Coder','Final review complete'],
    ];
    for (const cp of sampleCheckpoints) {
      this.db.run(`INSERT OR IGNORE INTO coding_checkpoints (review_id,checkpoint_name,checkpoint_category,is_checked,checked_by,notes) VALUES (?,?,?,?,?,?)`, cp);
    }

    // Seed sample ICD codes
    this.db.run(`INSERT OR IGNORE INTO coding_icd (review_id,icd_code,icd_description,sequence_order,is_primary) VALUES (?,?,?,?,?)`,['CRV001','R07.9','Chest pain, unspecified',1,1]);
    this.db.run(`INSERT OR IGNORE INTO coding_icd (review_id,icd_code,icd_description,sequence_order,is_primary) VALUES (?,?,?,?,?)`,['CRV001','R06.02','Shortness of breath',2,0]);
    this.db.run(`INSERT OR IGNORE INTO coding_icd (review_id,icd_code,icd_description,sequence_order,is_primary) VALUES (?,?,?,?,?)`,['CRV001','I10','Essential (primary) hypertension',3,0]);
    this.db.run(`INSERT OR IGNORE INTO coding_icd (review_id,icd_code,icd_description,sequence_order,is_primary) VALUES (?,?,?,?,?)`,['CRV002','K35.80','Acute appendicitis, unspecified',1,1]);
    this.db.run(`INSERT OR IGNORE INTO coding_icd (review_id,icd_code,icd_description,sequence_order,is_primary) VALUES (?,?,?,?,?)`,['CRV002','R11.02','Nausea',2,0]);
    this.db.run(`INSERT OR IGNORE INTO coding_icd (review_id,icd_code,icd_description,sequence_order,is_primary) VALUES (?,?,?,?,?)`,['CRV002','R50.9','Fever, unspecified',3,0]);
    this.db.run(`INSERT OR IGNORE INTO coding_icd (review_id,icd_code,icd_description,sequence_order,is_primary) VALUES (?,?,?,?,?)`,['CRV003','E11.10','Type 2 diabetes mellitus with ketoacidosis',1,1]);
    this.db.run(`INSERT OR IGNORE INTO coding_icd (review_id,icd_code,icd_description,sequence_order,is_primary) VALUES (?,?,?,?,?)`,['CRV003','N17.9','Acute kidney injury, unspecified',2,0]);
    this.db.run(`INSERT OR IGNORE INTO coding_icd (review_id,icd_code,icd_description,sequence_order,is_primary) VALUES (?,?,?,?,?)`,['CRV003','E86.0','Dehydration',3,0]);

    // Seed sample CPT codes
    this.db.run(`INSERT OR IGNORE INTO coding_cpt (review_id,cpt_code,cpt_description,units,modifier1,charge_amount,is_approved) VALUES (?,?,?,?,?,?,?)`,['CRV001','99213','Office visit - established, low complexity',1,null,120,1]);
    this.db.run(`INSERT OR IGNORE INTO coding_cpt (review_id,cpt_code,cpt_description,units,modifier1,charge_amount,is_approved) VALUES (?,?,?,?,?,?,?)`,['CRV001','93000','Electrocardiogram, 12-lead',1,null,45,1]);
    this.db.run(`INSERT OR IGNORE INTO coding_cpt (review_id,cpt_code,cpt_description,units,modifier1,charge_amount,is_approved) VALUES (?,?,?,?,?,?,?)`,['CRV001','71046','Chest X-ray, 2 views',1,null,85,0]);
    this.db.run(`INSERT OR IGNORE INTO coding_cpt (review_id,cpt_code,cpt_description,units,modifier1,charge_amount,is_approved) VALUES (?,?,?,?,?,?,?)`,['CRV001','80053','Comprehensive metabolic panel',1,null,52,0]);
    this.db.run(`INSERT OR IGNORE INTO coding_cpt (review_id,cpt_code,cpt_description,units,modifier1,charge_amount,is_approved) VALUES (?,?,?,?,?,?,?)`,['CRV001','84480','Troponin T, qualitative',1,null,65,0]);
    this.db.run(`INSERT OR IGNORE INTO coding_cpt (review_id,cpt_code,cpt_description,units,modifier1,charge_amount,is_approved) VALUES (?,?,?,?,?,?,?)`,['CRV002','99284','ED visit, high complexity',1,null,350,1]);
    this.db.run(`INSERT OR IGNORE INTO coding_cpt (review_id,cpt_code,cpt_description,units,modifier1,charge_amount,is_approved) VALUES (?,?,?,?,?,?,?)`,['CRV002','74177','CT abdomen/pelvis with contrast',1,null,850,0]);
    this.db.run(`INSERT OR IGNORE INTO coding_cpt (review_id,cpt_code,cpt_description,units,modifier1,charge_amount,is_approved) VALUES (?,?,?,?,?,?,?)`,['CRV002','85025','CBC with differential',1,null,32,1]);
    this.db.run(`INSERT OR IGNORE INTO coding_cpt (review_id,cpt_code,cpt_description,units,modifier1,charge_amount,is_approved) VALUES (?,?,?,?,?,?,?)`,['CRV003','99222','Initial hospital care, moderate',1,null,280,1]);
    this.db.run(`INSERT OR IGNORE INTO coding_cpt (review_id,cpt_code,cpt_description,units,modifier1,charge_amount,is_approved) VALUES (?,?,?,?,?,?,?)`,['CRV003','96375','Therapeutic injection, IV',1,null,75,0]);
    this.db.run(`INSERT OR IGNORE INTO coding_cpt (review_id,cpt_code,cpt_description,units,modifier1,charge_amount,is_approved) VALUES (?,?,?,?,?,?,?)`,['CRV003','82947','Glucose, quantitative',1,null,18,1]);

    // Sample documents removed - upload real files via the Documents & Images tab

    this.save();
  }
}

const db = new Database();
module.exports = db;
