(function(){
  // ===== MOCK API LAYER - localStorage-backed =====
  // Intercepts all /api/* fetch calls and returns localStorage data

  var DB_PREFIX = 'pms_db_';

  function getStore(name) {
    try { return JSON.parse(localStorage.getItem(DB_PREFIX + name)) || []; }
    catch(e) { return []; }
  }
  function setStore(name, data) {
    localStorage.setItem(DB_PREFIX + name, JSON.stringify(data));
  }
  function getConfig() {
    try { return JSON.parse(localStorage.getItem(DB_PREFIX + '_config')) || {}; }
    catch(e) { return {}; }
  }
  function setConfig(data) {
    localStorage.setItem(DB_PREFIX + '_config', JSON.stringify(data));
  }
  function nextId(store) {
    var items = getStore(store);
    if (items.length === 0) return 1;
    return Math.max.apply(null, items.map(function(i){ return i.id || 0; })) + 1;
  }
  function findPatientById(idStr) {
    var patients = getStore('patients');
    var numId = parseInt(idStr);
    return patients.find(function(p) {
      return p.patient_id === idStr || p.id === numId || p.id === idStr || p.mrn === idStr;
    });
  }

  // Seed demo data on first load
  function seedData() {
    if (localStorage.getItem(DB_PREFIX + '_seeded')) return;
    var patients = [
      {id:1,patient_id:'PAT001',mrn:'MRN00001',first_name:'John',last_name:'Smith',dob:'1985-03-15',gender:'Male',phone:'555-0101',email:'john.smith@email.com',address:'123 Main St, Houston TX 77001',ssn:'***-**-1234',emergency_contact:'Jane Smith',emergency_phone:'555-0102',status:'active',created_at:'2026-01-15'},
      {id:2,patient_id:'PAT002',mrn:'MRN00002',first_name:'Maria',last_name:'Garcia',dob:'1990-07-22',gender:'Female',phone:'555-0201',email:'maria.garcia@email.com',address:'456 Oak Ave, Dallas TX 75201',ssn:'***-**-5678',emergency_contact:'Carlos Garcia',emergency_phone:'555-0202',status:'active',created_at:'2026-02-10'},
      {id:3,patient_id:'PAT003',mrn:'MRN00003',first_name:'Robert',last_name:'Johnson',dob:'1978-11-08',gender:'Male',phone:'555-0301',email:'robert.j@email.com',address:'789 Pine Rd, Austin TX 73301',ssn:'***-**-9012',emergency_contact:'Linda Johnson',emergency_phone:'555-0302',status:'active',created_at:'2026-03-05'},
      {id:4,patient_id:'PAT004',mrn:'MRN00004',first_name:'Sarah',last_name:'Williams',dob:'1995-01-30',gender:'Female',phone:'555-0401',email:'sarah.w@email.com',address:'321 Elm St, San Antonio TX 78201',ssn:'***-**-3456',emergency_contact:'Mike Williams',emergency_phone:'555-0402',status:'active',created_at:'2026-04-12'},
      {id:5,patient_id:'PAT005',mrn:'MRN00005',first_name:'David',last_name:'Brown',dob:'1982-06-18',gender:'Male',phone:'555-0501',email:'david.b@email.com',address:'654 Cedar Ln, Fort Worth TX 76101',ssn:'***-**-7890',emergency_contact:'Karen Brown',emergency_phone:'555-0502',status:'active',created_at:'2026-05-20'}
    ];
    setStore('patients', patients);

    var insurances = [
      {id:1,patient_id:1,payer_name:'Aetna',policy_number:'AET-332190',member_id:'AET-M001',group_number:'GRP-5521',subscriber_name:'John Smith',relationship:'Self',plan_type:'PPO',copay:30,deductible:500,coinsurance:20,insurance_type:'primary',effective_date:'2026-01-01',termination_date:'2026-12-31',status:'active',effective_status:'active',eligibility_status:'active'},
      {id:2,patient_id:2,payer_name:'Blue Cross Blue Shield',policy_number:'BCBS-784521',member_id:'BCBS-M002',group_number:'GRP-3344',subscriber_name:'Maria Garcia',relationship:'Self',plan_type:'HMO',copay:25,deductible:300,coinsurance:15,insurance_type:'primary',effective_date:'2026-01-01',termination_date:'2026-12-31',status:'active',effective_status:'active',eligibility_status:'active'},
      {id:3,patient_id:3,payer_name:'UnitedHealthcare',policy_number:'UHC-991234',member_id:'UHC-M003',group_number:'GRP-7788',subscriber_name:'Robert Johnson',relationship:'Self',plan_type:'PPO',copay:35,deductible:750,coinsurance:25,insurance_type:'primary',effective_date:'2026-03-01',termination_date:'2027-02-28',status:'active',effective_status:'active',eligibility_status:'active'},
      {id:4,patient_id:4,payer_name:'Cigna',policy_number:'CIG-445678',member_id:'CIG-M004',group_number:'GRP-2211',subscriber_name:'Sarah Williams',relationship:'Self',plan_type:'EPO',copay:20,deductible:400,coinsurance:10,insurance_type:'primary',effective_date:'2026-01-01',termination_date:'2026-12-31',status:'active',effective_status:'active',eligibility_status:'active'},
      {id:5,patient_id:5,payer_name:'Aetna',policy_number:'AET-556789',member_id:'AET-M005',group_number:'GRP-5521',subscriber_name:'David Brown',relationship:'Self',plan_type:'POS',copay:40,deductible:600,coinsurance:30,insurance_type:'primary',effective_date:'2026-02-01',termination_date:'2027-01-31',status:'active',effective_status:'active',eligibility_status:'active'},
      {id:6,patient_id:1,payer_name:'Blue Cross Blue Shield',policy_number:'BCBS-S001',member_id:'BCBS-S006',group_number:'GRP-8888',subscriber_name:'John Smith',relationship:'Self',plan_type:'HMO',copay:20,deductible:250,coinsurance:10,insurance_type:'secondary',effective_date:'2026-01-01',termination_date:'2026-12-31',status:'active',effective_status:'active',eligibility_status:'active'},
      {id:7,patient_id:1,payer_name:'Cigna',policy_number:'CIG-S001',member_id:'CIG-S007',group_number:'GRP-9999',subscriber_name:'John Smith',relationship:'Self',plan_type:'PPO',copay:15,deductible:200,coinsurance:10,insurance_type:'secondary',effective_date:'2026-01-01',termination_date:'2026-12-31',status:'active',effective_status:'active',eligibility_status:'active'},
      {id:8,patient_id:3,payer_name:'Blue Cross Blue Shield',policy_number:'BCBS-S003',member_id:'BCBS-S008',group_number:'GRP-4444',subscriber_name:'Robert Johnson',relationship:'Self',plan_type:'HMO',copay:20,deductible:250,coinsurance:10,insurance_type:'secondary',effective_date:'2026-01-01',termination_date:'2026-12-31',status:'active',effective_status:'active',eligibility_status:'active'}
    ];
    setStore('insurances', insurances);

    var providers = [
      {id:1,provider_id:'PRV001',first_name:'Sarah',last_name:'Johnson',credential:'MD',specialty:'Anesthesiology',npi:'1234567890',phone:'713-555-0100',address:'123 Medical Center Dr, Houston TX',status:'active'},
      {id:2,provider_id:'PRV002',first_name:'Michael',last_name:'Chen',credential:'DO',specialty:'Family Medicine',npi:'2345678901',phone:'214-555-0200',address:'456 Healthcare Blvd, Dallas TX',status:'active'},
      {id:3,provider_id:'PRV003',first_name:'Emily',last_name:'Rodriguez',credential:'MD',specialty:'Pediatrics',npi:'3456789012',phone:'512-555-0300',address:'789 Childrens Way, Austin TX',status:'active'},
      {id:4,provider_id:'PRV004',first_name:'David',last_name:'Wilson',credential:'MD',specialty:'Diagnostic Radiology',npi:'4567890123',phone:'210-555-0400',address:'321 Imaging Center, San Antonio TX',status:'active'},
      {id:5,provider_id:'PRV005',first_name:'Lisa',last_name:'Thompson',credential:'PA-C',specialty:'Physician Assistant',npi:'5678901234',phone:'817-555-0500',address:'654 Clinic Rd, Fort Worth TX',status:'active'}
    ];
    setStore('providers', providers);

    var charges = [
      {id:1,charge_id:'CHG001',patient_id:1,provider_id:1,insurance_id:1,charge_date:'2026-06-12',cpt_code:'99214',icd_codes:'E11.9,I10',billed_amount:250.00,paid_amount:0,status:'pending',description:'Office visit - established patient'},
      {id:2,charge_id:'CHG002',patient_id:2,provider_id:2,insurance_id:2,charge_date:'2026-06-15',cpt_code:'99213',icd_codes:'J06.9',billed_amount:180.00,paid_amount:144.00,status:'paid',description:'Office visit - moderate complexity'},
      {id:3,charge_id:'CHG003',patient_id:3,provider_id:3,insurance_id:3,charge_date:'2026-07-01',cpt_code:'99215',icd_codes:'M54.5',billed_amount:350.00,paid_amount:0,status:'denied',description:'Office visit - high complexity'}
    ];
    setStore('charges', charges);

    var appointments = [
      {id:1,patient_id:1,provider_id:1,appointment_date:'2026-07-25',appointment_time:'09:00',type:'Follow-up',status:'scheduled',notes:'Follow-up for diabetes management'},
      {id:2,patient_id:2,provider_id:2,appointment_date:'2026-07-25',appointment_time:'10:30',type:'Annual Physical',status:'scheduled',notes:'Annual wellness visit'},
      {id:3,patient_id:3,provider_id:3,appointment_date:'2026-07-26',appointment_time:'14:00',type:'Consultation',status:'completed',notes:'Back pain consultation'}
    ];
    setStore('appointments', appointments);

    var payments = [
      {id:1,charge_id:2,patient_id:2,amount:144.00,payment_date:'2026-06-25',payment_method:'Insurance',reference:'ERA-2026-001',status:'posted'}
    ];
    setStore('payments', payments);

    var rejections = [
      {id:1,charge_id:3,patient_id:3,rejection_code:'CO-45',rejection_reason:'Charge exceeds fee schedule',status:'open',received_date:'2026-07-10'}
    ];
    setStore('rejections', rejections);

    var training_users = [
      {id:1,email:'admin@provision.com',password:'admin123',full_name:'Administrator',role:'admin',permissions:['all'],fee_amount:0,paid_amount:0,due_date:'',access_until:'',active:1,created_at:'2026-01-01'},
      {id:2,email:'trainer@provision.com',password:'trainer123',full_name:'Trainer',role:'trainer',permissions:['all'],fee_amount:0,paid_amount:0,due_date:'',access_until:'',active:1,created_at:'2026-01-01'}
    ];
    setStore('training_users', training_users);

    var training_videos = [
      {id:1,title:'AR Calling Introduction',filename:'ar_intro.mp4',filepath:'',mime_type:'video/mp4',uploaded_at:'2026-06-01',sort_order:0},
      {id:2,title:'Insurance Verification Basics',filename:'eligibility.mp4',filepath:'',mime_type:'video/mp4',uploaded_at:'2026-06-15',sort_order:1}
    ];
    setStore('training_videos', training_videos);

    var coding_reviews = [];
    setStore('coding_reviews', coding_reviews);

    var coding_checkpoints = [];
    setStore('coding_checkpoints', coding_checkpoints);

    var coding_documents = [];
    setStore('coding_documents', coding_documents);

    var coding_icd = [];
    setStore('coding_icd', coding_icd);

    var coding_cpt = [];
    setStore('coding_cpt', coding_cpt);

    var coding_audit_log = [];
    setStore('coding_audit_log', coding_audit_log);

    var eligibility_templates = [
      {id:1,template_name:'Standard PPO',benefits:JSON.stringify([
        {benefit_name:'Office Visit - Primary Care',covered:true,copay_amount:30,deductible_amount:0,coinsurance_percent:20,max_visits:52,prior_auth_required:0},
        {benefit_name:'Office Visit - Specialist',covered:true,copay_amount:50,deductible_amount:0,coinsurance_percent:30,max_visits:26,prior_auth_required:1},
        {benefit_name:'Urgent Care',covered:true,copay_amount:75,deductible_amount:100,coinsurance_percent:20,max_visits:10,prior_auth_required:0},
        {benefit_name:'Emergency Room',covered:true,copay_amount:250,deductible_amount:500,coinsurance_percent:20,max_visits:4,prior_auth_required:0},
        {benefit_name:'Inpatient Hospital',covered:true,copay_amount:0,deductible_amount:1000,coinsurance_percent:20,max_visits:3,prior_auth_required:1},
        {benefit_name:'Outpatient Surgery',covered:true,copay_amount:100,deductible_amount:500,coinsurance_percent:20,max_visits:5,prior_auth_required:1},
        {benefit_name:'Lab / Diagnostics',covered:true,copay_amount:20,deductible_amount:0,coinsurance_percent:10,max_visits:20,prior_auth_required:0},
        {benefit_name:'Radiology / Imaging',covered:true,copay_amount:50,deductible_amount:200,coinsurance_percent:20,max_visits:10,prior_auth_required:1},
        {benefit_name:'Physical Therapy',covered:true,copay_amount:40,deductible_amount:0,coinsurance_percent:20,max_visits:30,prior_auth_required:1},
        {benefit_name:'Prescription - Generic',covered:true,copay_amount:15,deductible_amount:0,coinsurance_percent:0,max_visits:999,prior_auth_required:0},
        {benefit_name:'Prescription - Brand',covered:true,copay_amount:40,deductible_amount:0,coinsurance_percent:30,max_visits:999,prior_auth_required:0},
        {benefit_name:'Mental Health',covered:true,copay_amount:40,deductible_amount:200,coinsurance_percent:20,max_visits:20,prior_auth_required:1},
        {benefit_name:'Preventive Care',covered:true,copay_amount:0,deductible_amount:0,coinsurance_percent:0,max_visits:1,prior_auth_required:0},
        {benefit_name:'Durable Medical Equipment',covered:true,copay_amount:0,deductible_amount:200,coinsurance_percent:40,max_visits:2,prior_auth_required:1}
      ]),status:'active',created_at:'2026-01-01'},
      {id:2,template_name:'Standard HMO',benefits:JSON.stringify([
        {benefit_name:'Office Visit - PCP',covered:true,copay_amount:25,deductible_amount:0,coinsurance_percent:15,max_visits:52,prior_auth_required:0},
        {benefit_name:'Office Visit - Specialist',covered:true,copay_amount:45,deductible_amount:0,coinsurance_percent:25,max_visits:20,prior_auth_required:1},
        {benefit_name:'Urgent Care',covered:true,copay_amount:50,deductible_amount:75,coinsurance_percent:15,max_visits:8,prior_auth_required:0},
        {benefit_name:'Emergency Room',covered:true,copay_amount:200,deductible_amount:300,coinsurance_percent:15,max_visits:4,prior_auth_required:0},
        {benefit_name:'Inpatient Hospital',covered:true,copay_amount:0,deductible_amount:750,coinsurance_percent:15,max_visits:3,prior_auth_required:1},
        {benefit_name:'Lab / Diagnostics',covered:true,copay_amount:15,deductible_amount:0,coinsurance_percent:10,max_visits:15,prior_auth_required:0},
        {benefit_name:'Radiology / Imaging',covered:true,copay_amount:40,deductible_amount:150,coinsurance_percent:15,max_visits:8,prior_auth_required:1},
        {benefit_name:'Preventive Care',covered:true,copay_amount:0,deductible_amount:0,coinsurance_percent:0,max_visits:1,prior_auth_required:0}
      ]),status:'active',created_at:'2026-01-01'}
    ];
    setStore('eligibility_templates', eligibility_templates);

    setConfig({
      courses: [
        {id:1,name:'AR Calling (Accounts Receivable)',batch:'Jul 2026',status:'New',duration:'45 Days',fee:'15000',visible:true},
        {id:2,name:'Medical Billing Fundamentals',batch:'Jul 2026',status:'New',duration:'60 Days',fee:'18000',visible:true},
        {id:3,name:'Medical Coding (CPT / ICD-10)',batch:'Aug 2026',status:'Open',duration:'90 Days',fee:'25000',visible:true}
      ],
      demoLink:{link:'https://meet.zoho.in/demo',title:'AR Calling Demo Class',schedule:'Daily 6:00 PM'},
      announcements:'',
      videos:[],
      pdfs:[]
    });

    localStorage.setItem(DB_PREFIX + '_seeded', '1');
  }
  seedData();

  // Ensure templates always exist (even for existing users)
  (function() {
    var tpls = getStore('eligibility_templates');
    if (!tpls || tpls.length === 0) {
      setStore('eligibility_templates', [
        {id:1,template_name:'Standard PPO',benefits:JSON.stringify([
          {benefit_name:'Office Visit - Primary Care',covered:true,copay_amount:30,deductible_amount:0,coinsurance_percent:20,max_visits:52,prior_auth_required:0},
          {benefit_name:'Office Visit - Specialist',covered:true,copay_amount:50,deductible_amount:0,coinsurance_percent:30,max_visits:26,prior_auth_required:1},
          {benefit_name:'Urgent Care',covered:true,copay_amount:75,deductible_amount:100,coinsurance_percent:20,max_visits:10,prior_auth_required:0},
          {benefit_name:'Emergency Room',covered:true,copay_amount:250,deductible_amount:500,coinsurance_percent:20,max_visits:4,prior_auth_required:0},
          {benefit_name:'Inpatient Hospital',covered:true,copay_amount:0,deductible_amount:1000,coinsurance_percent:20,max_visits:3,prior_auth_required:1},
          {benefit_name:'Outpatient Surgery',covered:true,copay_amount:100,deductible_amount:500,coinsurance_percent:20,max_visits:5,prior_auth_required:1},
          {benefit_name:'Lab / Diagnostics',covered:true,copay_amount:20,deductible_amount:0,coinsurance_percent:10,max_visits:20,prior_auth_required:0},
          {benefit_name:'Radiology / Imaging',covered:true,copay_amount:50,deductible_amount:200,coinsurance_percent:20,max_visits:10,prior_auth_required:1},
          {benefit_name:'Physical Therapy',covered:true,copay_amount:40,deductible_amount:0,coinsurance_percent:20,max_visits:30,prior_auth_required:1},
          {benefit_name:'Prescription - Generic',covered:true,copay_amount:15,deductible_amount:0,coinsurance_percent:0,max_visits:999,prior_auth_required:0},
          {benefit_name:'Prescription - Brand',covered:true,copay_amount:40,deductible_amount:0,coinsurance_percent:30,max_visits:999,prior_auth_required:0},
          {benefit_name:'Mental Health',covered:true,copay_amount:40,deductible_amount:200,coinsurance_percent:20,max_visits:20,prior_auth_required:1},
          {benefit_name:'Preventive Care',covered:true,copay_amount:0,deductible_amount:0,coinsurance_percent:0,max_visits:1,prior_auth_required:0},
          {benefit_name:'Durable Medical Equipment',covered:true,copay_amount:0,deductible_amount:200,coinsurance_percent:40,max_visits:2,prior_auth_required:1}
        ]),status:'active',created_at:'2026-01-01'},
        {id:2,template_name:'Standard HMO',benefits:JSON.stringify([
          {benefit_name:'Office Visit - PCP',covered:true,copay_amount:25,deductible_amount:0,coinsurance_percent:15,max_visits:52,prior_auth_required:0},
          {benefit_name:'Office Visit - Specialist',covered:true,copay_amount:45,deductible_amount:0,coinsurance_percent:25,max_visits:20,prior_auth_required:1},
          {benefit_name:'Urgent Care',covered:true,copay_amount:50,deductible_amount:75,coinsurance_percent:15,max_visits:8,prior_auth_required:0},
          {benefit_name:'Emergency Room',covered:true,copay_amount:200,deductible_amount:300,coinsurance_percent:15,max_visits:4,prior_auth_required:0},
          {benefit_name:'Inpatient Hospital',covered:true,copay_amount:0,deductible_amount:750,coinsurance_percent:15,max_visits:3,prior_auth_required:1},
          {benefit_name:'Lab / Diagnostics',covered:true,copay_amount:15,deductible_amount:0,coinsurance_percent:10,max_visits:15,prior_auth_required:0},
          {benefit_name:'Radiology / Imaging',covered:true,copay_amount:40,deductible_amount:150,coinsurance_percent:15,max_visits:8,prior_auth_required:1},
          {benefit_name:'Preventive Care',covered:true,copay_amount:0,deductible_amount:0,coinsurance_percent:0,max_visits:1,prior_auth_required:0}
        ]),status:'active',created_at:'2026-01-01'}
      ]);
    }
  })();

  // ===== GENERIC CRUD ROUTER =====
  var originalFetch = window.fetch;
  window.fetch = function(url, opts) {
    if (typeof url === 'string' && url.indexOf('/api/') === 0) {
      var method = (opts && opts.method) ? opts.method.toUpperCase() : 'GET';
      var body = null;
      if (opts && opts.body) {
        try { body = JSON.parse(opts.body); } catch(e) { body = opts.body; }
      }
      // Handle FormData
      if (typeof FormData !== 'undefined' && opts && opts.body && typeof opts.body !== 'string') {
        body = null; // Skip file uploads in mock
      }
      var resp = handleAPI(url, method, body, opts);
      return Promise.resolve(new Response(JSON.stringify(resp.data), {
        status: resp.status || 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    return originalFetch.apply(this, arguments);
  };

  function parseUrl(url) {
    var parts = url.split('?');
    var path = parts[0];
    var qs = {};
    if (parts[1]) {
      parts[1].split('&').forEach(function(p) {
        var kv = p.split('=');
        qs[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
      });
    }
    return { path: path, query: qs };
  }

  function handleAPI(url, method, body, opts) {
    var parsed = parseUrl(url);
    var path = parsed.path;
    var q = parsed.query;

    // ===== TRAINING LOGIN =====
    if (path === '/api/training/login' && method === 'POST') {
      var users = getStore('training_users');
      var user = users.find(function(u){ return u.email === body.email && u.password === body.password && u.active; });
      if (!user) return { status: 401, data: {error:'Invalid email or password'} };
      var perms = [];
      try { perms = JSON.parse(user.permissions || '[]'); } catch(e) { perms = []; }
      return { data: {id:user.id,email:user.email,full_name:user.full_name,role:user.role,permissions:perms,fee:{fee_amount:user.fee_amount||0,paid_amount:user.paid_amount||0,due_date:user.due_date||'',access_until:user.access_until||''}} };
    }

    // ===== TRAINING USERS =====
    if (path === '/api/training/users' && method === 'GET') {
      var users = getStore('training_users').map(function(u) {
        var p = []; try { p = JSON.parse(u.permissions||'[]'); } catch(e) {}
        return {id:u.id,email:u.email,full_name:u.full_name,role:u.role,permissions:p,fee_amount:u.fee_amount,paid_amount:u.paid_amount,due_date:u.due_date,access_until:u.access_until,active:u.active,created_at:u.created_at};
      });
      return { data: users };
    }
    if (path === '/api/training/users' && method === 'POST') {
      var users = getStore('training_users');
      body.id = nextId('training_users');
      body.active = 1;
      body.created_at = new Date().toISOString();
      if (!body.permissions) body.permissions = '[]';
      if (typeof body.permissions !== 'string') body.permissions = JSON.stringify(body.permissions);
      users.push(body);
      setStore('training_users', users);
      return { data: {id:body.id,email:body.email,ok:true} };
    }
    var m;
    if ((m = path.match(/^\/api\/training\/users\/(\d+)$/))) {
      var uid = parseInt(m[1]);
      if (method === 'PUT') {
        var users = getStore('training_users');
        var idx = users.findIndex(function(u){return u.id===uid;});
        if (idx >= 0) { Object.assign(users[idx], body); setStore('training_users', users); }
        return { data: {ok:true} };
      }
      if (method === 'DELETE') {
        var users = getStore('training_users').filter(function(u){return u.id!==uid;});
        setStore('training_users', users);
        return { data: {ok:true} };
      }
    }

    // ===== TRAINING INVOICE =====
    if ((m = path.match(/^\/api\/training\/invoice\/(\d+)$/))) {
      var uid = parseInt(m[1]);
      var user = getStore('training_users').find(function(u){return u.id===uid;});
      if (!user) return { status: 404, data: {error:'Not found'} };
      var remaining = (user.fee_amount||0) - (user.paid_amount||0);
      return { data: Object.assign({}, user, {remaining: remaining > 0 ? remaining : 0}) };
    }

    // ===== TRAINING VIDEOS =====
    if (path === '/api/training/videos' && method === 'GET') {
      return { data: getStore('training_videos') };
    }
    if (path === '/api/training/videos/upload' && method === 'POST') {
      var vids = getStore('training_videos');
      var newVid = {id:nextId('training_videos'),title:'Uploaded Video',filename:'video.mp4',filepath:'',mime_type:'video/mp4',uploaded_at:new Date().toISOString(),sort_order:vids.length};
      vids.push(newVid);
      setStore('training_videos', vids);
      return { data: {id:newVid.id,title:newVid.title,filepath:newVid.filepath,filename:newVid.filename} };
    }
    if ((m = path.match(/^\/api\/training\/videos\/(\d+)$/)) && method === 'DELETE') {
      var vids = getStore('training_videos').filter(function(v){return v.id!==parseInt(m[1]);});
      setStore('training_videos', vids);
      return { data: {ok:true} };
    }

    // ===== PATIENTS =====
    if (path === '/api/patients' && method === 'GET') {
      var patients = getStore('patients');
      var allIns = getStore('insurances');
      patients = patients.map(function(p) {
        var linkedIns = allIns.filter(function(i) { return i.patient_id === p.id || i.patient_id === p.patient_id; });
        return Object.assign({}, p, { insurance_count: linkedIns.length, insurances: linkedIns });
      });
      return { data: patients };
    }
    if (path === '/api/patients/recent' && method === 'GET') {
      var allPatients = getStore('patients');
      var allCharges = getStore('charges');
      var allIns = getStore('insurances');
      var pidsWithCharges = [];
      allCharges.forEach(function(c) { if (pidsWithCharges.indexOf(c.patient_id) === -1) pidsWithCharges.push(c.patient_id); });
      var recent = allPatients.filter(function(p) { return pidsWithCharges.indexOf(p.id) !== -1 || pidsWithCharges.indexOf(p.patient_id) !== -1; });
      recent = recent.map(function(p) {
        var pCharges = allCharges.filter(function(c) { return c.patient_id === p.id; });
        var linkedIns = allIns.filter(function(i) { return i.patient_id === p.id; });
        var totalBilled = 0, totalPaid = 0;
        pCharges.forEach(function(c) { totalBilled += (c.billed_amount || c.total_charges || 0); totalPaid += (c.paid_amount || c.total_paid || 0); });
        return Object.assign({}, p, { charge_count: pCharges.length, total_billed: totalBilled, total_paid: totalPaid, insurances: linkedIns });
      });
      return { data: recent };
    }
    if (path === '/api/patients/search' || path.indexOf('/api/patients/search?') === 0) {
      var q2 = (q.q || q.search || '').toLowerCase();
      var patients = getStore('patients').filter(function(p) {
        return !q2 || (p.patient_id||'').toLowerCase().indexOf(q2) >= 0 || (p.mrn||'').toLowerCase().indexOf(q2) >= 0 || (p.first_name||'').toLowerCase().indexOf(q2) >= 0 || (p.last_name||'').toLowerCase().indexOf(q2) >= 0 || (p.phone||'').toLowerCase().indexOf(q2) >= 0 || (p.dob||'').toLowerCase().indexOf(q2) >= 0 || (p.ssn||'').toLowerCase().indexOf(q2) >= 0 || (p.email||'').toLowerCase().indexOf(q2) >= 0;
      });
      return { data: patients };
    }
    if (path === '/api/patients' && method === 'POST') {
      var patients = getStore('patients');
      body.id = nextId('patients');
      body.patient_id = body.patient_id || 'PAT' + String(body.id).padStart(3,'0');
      body.mrn = body.mrn || 'MRN' + String(body.id).padStart(5,'0');
      body.status = body.status || 'active';
      body.created_at = new Date().toISOString();
      patients.push(body);
      setStore('patients', patients);
      return { data: body };
    }
    if ((m = path.match(/^\/api\/patients\/search$/))) {
      var q2 = (q.q || '').toLowerCase();
      var patients = getStore('patients').filter(function(p) {
        return !q2 || (p.patient_id||'').toLowerCase().indexOf(q2) >= 0 || (p.mrn||'').toLowerCase().indexOf(q2) >= 0 || (p.first_name||'').toLowerCase().indexOf(q2) >= 0 || (p.last_name||'').toLowerCase().indexOf(q2) >= 0 || (p.phone||'').toLowerCase().indexOf(q2) >= 0 || (p.dob||'').toLowerCase().indexOf(q2) >= 0 || (p.ssn||'').toLowerCase().indexOf(q2) >= 0 || (p.email||'').toLowerCase().indexOf(q2) >= 0 || (p.address||'').toLowerCase().indexOf(q2) >= 0;
      });
      return { data: patients };
    }
    if ((m = path.match(/^\/api\/patients\/([^\/]+)\/360$/))) {
      var patient = findPatientById(m[1]);
      if (!patient) return { status: 404, data: {error:'Not found'} };
      var ins = getStore('insurances').filter(function(i){return i.patient_id===patient.id;});
      var chg = getStore('charges').filter(function(c){return c.patient_id===patient.id;});
      var appts = getStore('appointments').filter(function(a){return a.patient_id===patient.id;});
      var payms = getStore('payments').filter(function(p){return p.patient_id===patient.id;});
      var rej = getStore('rejections').filter(function(r){return r.patient_id===patient.id;});
      var totalPaid = 0, totalBilled = 0;
      chg.forEach(function(c){ totalBilled += (c.billed_amount||c.total_charges||0); totalPaid += (c.paid_amount||c.total_paid||0); });
      return { data: {
        patient: patient,
        insurances: ins,
        charges: chg,
        appointments: appts,
        payments: payms,
        rejections: rej,
        dependents: getStore('dependents').filter(function(d){return d.patient_id===patient.id;}),
        authorizations: [],
        arCalls: [],
        offsets: [],
        medicalRecords: [],
        summary: {
          totalPaid: totalPaid,
          totalCharges: totalBilled,
          totalBalance: totalBilled - totalPaid,
          totalChargesCount: chg.length,
          totalPaymentsCount: payms.length,
          totalAppointments: appts.length,
          activeAuths: 0,
          openRejections: rej.length
        }
      } };
    }
    if ((m = path.match(/^\/api\/patients\/([^\/]+)\/insurance\/(\d+)\/card$/))) {
      return { data: {ok:true} };
    }
    if ((m = path.match(/^\/api\/patients\/([^\/]+)\/dependents$/))) {
      if (method === 'POST') {
        return { data: {id:nextId('dependents'),ok:true} };
      }
      return { data: [] };
    }
    if ((m = path.match(/^\/api\/patients\/([^\/]+)\/dependents\/(\d+)$/)) && method === 'DELETE') {
      return { data: {ok:true} };
    }
    if ((m = path.match(/^\/api\/patients\/([^\/]+)\/insurance\/link$/))) {
      var linkPatient = findPatientById(m[1]);
      var linkPid = linkPatient ? linkPatient.id : m[1];
      var ins = getStore('insurances');
      var newIns = Object.assign({}, body, { patient_id: linkPid, id: nextId('insurances'), created_at: new Date().toISOString() });
      ins.push(newIns);
      setStore('insurances', ins);
      return { data: {ok:true,insurance:newIns} };
    }
    if ((m = path.match(/^\/api\/patients\/([^\/]+)\/insurance\/reorder$/))) {
      return { data: {ok:true} };
    }
    if (path.match(/^\/api\/patients\/insurance\/lookup\//)) {
      return { data: {found:false} };
    }
    if ((m = path.match(/^\/api\/patients\/([^\/]+)$/))) {
      var pid = parseInt(m[1]);
      if (method === 'GET') {
        var patient = findPatientById(m[1]);
        if (!patient) return { status: 404, data: {error:'Not found'} };
        var linkedIns = getStore('insurances').filter(function(i){return i.patient_id===patient.id;});
        var dependents = getStore('dependents').filter(function(d){return d.patient_id===patient.id;});
        return { data: Object.assign({}, patient, {insurances: linkedIns, dependents: dependents}) };
      }
      if (method === 'PUT') {
        var patients = getStore('patients');
        var patient = findPatientById(m[1]);
        if (patient) {
          var idx = patients.findIndex(function(p){return p.id===patient.id;});
          if (idx >= 0) { Object.assign(patients[idx], body); setStore('patients', patients); }
        }
        return { data: {ok:true} };
      }
      if (method === 'DELETE') {
        var patient = findPatientById(m[1]);
        if (patient) {
          setStore('patients', getStore('patients').filter(function(p){return p.id!==patient.id;}));
        }
        return { data: {ok:true} };
      }
    }

    // ===== ELIGIBILITY =====
    if (path === '/api/eligibility' && method === 'GET') {
      return { data: getStore('eligibility') };
    }
    if (path === '/api/eligibility' && method === 'POST') {
      var elig = getStore('eligibility');
      body.id = nextId('eligibility');
      body.status = body.status || 'verified';
      body.verified_date = new Date().toISOString();
      elig.push(body);
      setStore('eligibility', elig);
      return { data: body };
    }
    if ((m = path.match(/^\/api\/eligibility\/verify\/(\d+)$/))) {
      var pid = parseInt(m[1]);
      var patient = getStore('patients').find(function(p){return p.id===pid;});
      var ins = getStore('insurances').find(function(i){return i.patient_id===pid;});
      return { data: {verified:true,patient:patient,insurance:ins,benefits:[{type:'Medical',covered:true,copay:'$30'},{type:'Prescription',covered:true,copay:'$15'}]} };
    }
    if ((m = path.match(/^\/api\/eligibility\/verify-member\/(.+)$/))) {
      var memberId = decodeURIComponent(m[1]).trim();
      var allIns = getStore('insurances');
      var allPatients = getStore('patients');
      var payerCards = getStore('payer_cards');
      var ins = allIns.find(function(i){ return (i.member_id||'').toLowerCase()===memberId.toLowerCase() || (i.policy_number||'').toLowerCase()===memberId.toLowerCase(); });
      if (!ins && payerCards.length) {
        var pc = payerCards.find(function(c){ return (c.member_id||'').toLowerCase()===memberId.toLowerCase(); });
        if (pc) {
          ins = {id:pc.id,patient_id:null,payer_name:pc.payer_name,policy_number:pc.member_id,member_id:pc.member_id,group_number:pc.group_number,plan_name:pc.plan_name||'',subscriber_name:pc.subscriber_name,relationship:pc.relationship,plan_type:pc.plan_type,copay:pc.copay,deductible:pc.deductible,coinsurance:pc.coinsurance,insurance_type:pc.insurance_type,effective_date:pc.effective_date||new Date().toISOString().slice(0,10),termination_date:pc.termination_date||new Date(Date.now()+365*24*60*60*1000).toISOString().slice(0,10),status:'active',effective_status:'active',eligibility_status:'active',card_image_front:null,card_image_back:null,subscriber_dob:pc.subscriber_dob||''};
        }
      }
      if (!ins) return { data: {status:'not_found',verified:false,error:'Member not found for ID: ' + memberId} };
      var patient = ins.patient_id ? allPatients.find(function(p){ return p.id===ins.patient_id || p.patient_id===ins.patient_id; }) : null;
      var eligStatus = ins.effective_status || ins.status || 'active';
      if (ins.termination_date && ins.termination_date < new Date().toISOString().slice(0,10)) eligStatus = 'expired';
      var allPatientIns = ins.patient_id ? allIns.filter(function(i){ return i.patient_id===ins.patient_id; }) : [ins];
      var otherCoverages = allPatientIns.filter(function(i){ return i.id !== ins.id; });
      var payerShort = (ins.payer_name||'').replace(/ /g,'').toUpperCase().slice(0,6);
      var payerResponse = {
        payer_name: ins.payer_name,
        payer_address: 'PO BOX 5240, KINGSTON, NY 12402-5240',
        payer_phone: '877-269-0000',
        payer_website: 'www.'+payerShort.toLowerCase()+'provider.com',
        subscriber_name: ins.subscriber_name || (patient?patient.first_name+' '+patient.last_name:''),
        subscriber_address: patient?((patient.address||'')+(patient.city?', '+patient.city:'')+(patient.state?', '+patient.state:'')+(patient.zip?' '+patient.zip:'')):'',
        subscriber_dob: patient?patient.dob:'',
        plan_name: payerShort+' '+(ins.plan_type||'')+' PLAN',
        service_type: 'Health Benefit Plan Coverage',
        insurance_type_resp: ins.insurance_type==='primary'?'Medicare Primary':ins.insurance_type.toUpperCase()+' Coverage',
        plan_begin_date: ins.effective_date||'',
        plan_end_date: ins.termination_date||'',
        coverage_type: 'MODSNP',
        eligibility_code: 'MODSNP3P'
      };
      var elig = {id:ins.id,insurance_id:ins.id,patient_id:ins.patient_id,plan_type:ins.plan_type,effective_date:ins.effective_date,termination_date:ins.termination_date};
      var benefits = [{type:'Medical',covered:true,copay:'$'+(ins.copay||30)},{type:'Prescription',covered:true,copay:'$15'}];
      var addrMatch = true;
      if (patient) {
        var ourAddr = ((patient.address||'')+(patient.city?', '+patient.city:'')+(patient.state?', '+patient.state:'')+(patient.zip?' '+patient.zip:'')).toLowerCase().replace(/\s+/g,' ');
        var respAddr = payerResponse.subscriber_address.toLowerCase().replace(/\s+/g,' ');
        if (ourAddr && respAddr && ourAddr.length>3 && ourAddr !== respAddr) addrMatch = false;
      }
      return { data: {verified:true,status:eligStatus,insurance:ins,eligibility:elig,patient:patient||null,all_coverages:allPatientIns,other_coverages:otherCoverages,payer_response:payerResponse,address_match:addrMatch,benefits:benefits,card_image_front:ins.card_image_front||null,card_image_back:ins.card_image_back||null} };
    }
    if ((m = path.match(/^\/api\/eligibility\/update-type$/))) {
      if (method === 'POST') {
        var insId = parseInt(body.insurance_id) || body.insurance_id;
        var newType = body.insurance_type;
        var items = getStore('insurances');
        var idx = items.findIndex(function(i){return i.id===insId || i.id===parseInt(insId);});
        if (idx >= 0) {
          var patientId = items[idx].patient_id;
          var samePatient = items.filter(function(i){ return (i.patient_id===patientId || String(i.patient_id)===String(patientId)) && (i.id!==insId && i.id!==parseInt(insId)); });
          var typeOrder = ['primary','secondary','tertiary'];
          var newIdx = typeOrder.indexOf(newType);
          if (newIdx >= 0) {
            var currentHolder = samePatient.find(function(i){ return i.insurance_type===newType; });
            if (currentHolder) {
              var nextType = newIdx < typeOrder.length-1 ? typeOrder[newIdx+1] : null;
              var curIdx = items.findIndex(function(i){return i.id===currentHolder.id;});
              if (curIdx >= 0) items[curIdx].insurance_type = nextType || 'tertiary';
            }
          }
          items[idx].insurance_type = newType;
          items[idx].eligibility_status = items[idx].effective_status || items[idx].status || 'active';
          setStore('insurances', items);
          var allP = getStore('patients');
          allP.forEach(function(p){
            if(p.id===patientId || p.patient_id===patientId){
              var linkedIns = getStore('insurances').filter(function(i2){return i2.patient_id===p.id || i2.patient_id===patientId;});
              p.insurances = linkedIns;
            }
          });
          setStore('patients', allP);
        }
        return { data: {ok:true,insurance:items[idx]} };
      }
    }
    if ((m = path.match(/^\/api\/eligibility\/(\d+)$/))) {
      var eid = parseInt(m[1]);
      if (method === 'GET') {
        var item = getStore('eligibility').find(function(e){return e.id===eid;});
        return item ? { data: item } : { status: 404, data: {error:'Not found'} };
      }
      if (method === 'PUT') {
        var items = getStore('eligibility');
        var idx = items.findIndex(function(e){return e.id===eid;});
        if (idx >= 0) { Object.assign(items[idx], body); setStore('eligibility', items); }
        return { data: {ok:true} };
      }
    }
    if (path === '/api/eligibility/benefit' && method === 'POST') {
      var benefits = getStore('eligibility_benefits');
      body.id = nextId('eligibility_benefits');
      body.created_at = new Date().toISOString();
      benefits.push(body);
      setStore('eligibility_benefits', benefits);
      return { data: body };
    }
    if ((m = path.match(/^\/api\/eligibility\/benefits\/(\d+)$/))) {
      var insId = parseInt(m[1]);
      var benefits = getStore('eligibility_benefits').filter(function(b){ return b.insurance_id === insId || b.insurance_id === parseInt(insId); });
      return { data: {benefits: benefits} };
    }
    if ((m = path.match(/^\/api\/eligibility\/benefit\/(\d+)$/))) {
      var bid = parseInt(m[1]);
      if (method === 'PUT') {
        var benefits = getStore('eligibility_benefits');
        var idx = benefits.findIndex(function(b){return b.id===bid;});
        if (idx >= 0) { Object.assign(benefits[idx], body); setStore('eligibility_benefits', benefits); }
        return { data: {ok:true} };
      }
      if (method === 'DELETE') {
        setStore('eligibility_benefits', getStore('eligibility_benefits').filter(function(b){return b.id!==bid;}));
        return { data: {ok:true} };
      }
      return { data: {ok:true} };
    }
    if (path === '/api/eligibility/hospitals') {
      return { data: [{id:1,name:'Houston General Hospital'},{id:2,name:'Provision Medical Center'},{id:3,name:'Dallas Regional Medical'}] };
    }
    if (path === '/api/eligibility/benefit-types') {
      return { data: ['Medical','Surgical','Prescription','Mental Health','Dental','Vision','Emergency','Lab','Imaging','Rehabilitation'] };
    }

    // ===== CHARGES =====
    if (path === '/api/charges' && method === 'GET') {
      var chgs = getStore('charges');
      var pts = getStore('patients');
      var provs = getStore('providers');
      var resolved = chgs.map(function(c){
        var p = pts.find(function(pp){ return pp.id===c.patient_id || pp.patient_id===c.patient_id || String(pp.id)===String(c.patient_id); });
        var pv = provs.find(function(pp){ return pp.id===c.provider_id || String(pp.id)===String(c.provider_id); });
        c.patient_name = p ? (p.first_name+' '+p.last_name) : (c.patient_name || c.patient_id || '-');
        c.provider_name = pv ? (pv.first_name+' '+pv.last_name) : (c.provider_name || c.provider_id || '-');
        return c;
      });
      return { data: resolved };
    }
    if (path === '/api/charges' && method === 'POST') {
      var chg = getStore('charges');
      body.id = nextId('charges');
      body.charge_id = body.charge_id || 'CHG' + String(body.id).padStart(3,'0');
      body.status = body.status || 'pending';
      if (!body.total_charges) {
        var totalCharges = 0;
        if (body.line_items && body.line_items.length) {
          totalCharges = body.line_items.reduce(function(s, li) { return s + (li.charge_amount || 0) * (li.units || 1); }, 0);
        }
        body.total_charges = totalCharges;
        body.billed_amount = totalCharges;
      }
      body.paid_amount = body.paid_amount || 0;
      body.total_paid = body.total_paid || 0;
      chg.push(body);
      setStore('charges', chg);
      return { data: body };
    }
    if ((m = path.match(/^\/api\/charges\/check-eligibility\/(\d+)\/(\d+)$/))) {
      return { data: {eligible:true,verified:true} };
    }
    if ((m = path.match(/^\/api\/charges\/(\d+)$/))) {
      var cid = parseInt(m[1]);
      if (method === 'GET') {
        var chg = getStore('charges').find(function(c){return c.id===cid || c.charge_id===m[1];});
        if (chg) {
          var pts = getStore('patients');
          var provs = getStore('providers');
          var p = pts.find(function(pp){ return pp.id===chg.patient_id || pp.patient_id===chg.patient_id || String(pp.id)===String(chg.patient_id); });
          var pv = provs.find(function(pp){ return pp.id===chg.provider_id || String(pp.id)===String(chg.provider_id); });
          chg.patient_name = p ? (p.first_name+' '+p.last_name) : (chg.patient_name || '-');
          chg.patient_id = p ? p.patient_id : chg.patient_id;
          chg.first_name = p ? p.first_name : '';
          chg.last_name = p ? p.last_name : '';
          chg.mrn = p ? p.mrn : '';
          chg.dob = p ? p.dob : '';
          chg.ssn = p ? p.ssn : '';
          chg.phone = p ? p.phone : '';
          chg.address = p ? (p.address||'')+(p.city?', '+p.city:'')+(p.state?', '+p.state:'')+(p.zip?' '+p.zip:'') : '';
          chg.prov_first = pv ? pv.first_name : '';
          chg.prov_last = pv ? pv.last_name : '';
          chg.npi = pv ? pv.npi : '';
          chg.taxonomy_code = pv ? pv.taxonomy_code : '';
          chg.specialization = pv ? pv.specialization : '';
        }
        return chg ? { data: chg } : { status: 404, data: {error:'Not found'} };
      }
      if (method === 'PUT') {
        var chg = getStore('charges');
        var idx = chg.findIndex(function(c){return c.id===cid;});
        if (idx >= 0) { Object.assign(chg[idx], body); setStore('charges', chg); }
        return { data: {ok:true} };
      }
    }
    if (path.indexOf('/api/charges') === 0 && path.indexOf('?') > 0) {
      var qPid = (q.patient_id || '');
      var chg = getStore('charges');
      if (qPid) chg = chg.filter(function(c){return String(c.patient_id)===String(qPid) || c.patient_id===parseInt(qPid);});
      var pts = getStore('patients');
      var provs = getStore('providers');
      chg = chg.map(function(c){
        var p = pts.find(function(pp){ return pp.id===c.patient_id || pp.patient_id===c.patient_id || String(pp.id)===String(c.patient_id); });
        var pv = provs.find(function(pp){ return pp.id===c.provider_id || String(pp.id)===String(c.provider_id); });
        c.patient_name = p ? (p.first_name+' '+p.last_name) : (c.patient_name || '-');
        c.provider_name = pv ? (pv.first_name+' '+pv.last_name) : (c.provider_name || '-');
        return c;
      });
      return { data: chg };
    }

    // ===== PAYMENTS =====
    if (path === '/api/payments' && method === 'GET') {
      return { data: getStore('payments') };
    }
    if (path === '/api/payments' && method === 'POST') {
      var pays = getStore('payments');
      body.id = nextId('payments');
      pays.push(body);
      setStore('payments', pays);
      return { data: body };
    }
    if (path === '/api/payments/manual' && method === 'POST') {
      var pays = getStore('payments');
      body.id = nextId('payments');
      body.status = 'posted';
      body.payment_date = body.payment_date || new Date().toISOString().split('T')[0];
      pays.push(body);
      setStore('payments', pays);
      return { data: body };
    }
    if (path === '/api/payments/post' && method === 'POST') {
      var pays = getStore('payments');
      body.id = nextId('payments');
      body.status = 'posted';
      pays.push(body);
      setStore('payments', pays);
      return { data: body };
    }
    if (path === '/api/payments/automatic' && method === 'POST') {
      var pays = getStore('payments');
      body.id = nextId('payments');
      body.status = 'auto_posted';
      pays.push(body);
      setStore('payments', pays);
      return { data: body };
    }
    if (path === '/api/payments/reconcile' && method === 'POST') {
      return { data: {ok:true,reconciled:0,message:'Reconciliation complete'} };
    }
    if (path === '/api/payments/adjust' && method === 'POST') {
      var pays = getStore('payments');
      body.id = nextId('payments');
      body.type = 'adjustment';
      pays.push(body);
      setStore('payments', pays);
      return { data: body };
    }

    // ===== REJECTIONS =====
    if (path === '/api/rejections' && method === 'GET') {
      return { data: getStore('rejections') };
    }
    if (path === '/api/rejections/create' && method === 'POST') {
      var rej = getStore('rejections');
      body.id = nextId('rejections');
      body.status = body.status || 'open';
      body.received_date = body.received_date || new Date().toISOString().split('T')[0];
      rej.push(body);
      setStore('rejections', rej);
      return { data: body };
    }

    // ===== APPOINTMENTS =====
    if (path === '/api/appointments' && method === 'GET') {
      return { data: getStore('appointments') };
    }
    if (path === '/api/appointments' && method === 'POST') {
      var appts = getStore('appointments');
      body.id = nextId('appointments');
      body.status = body.status || 'scheduled';
      appts.push(body);
      setStore('appointments', appts);
      return { data: body };
    }
    if ((m = path.match(/^\/api\/appointments\/(\d+)$/))) {
      var aid = parseInt(m[1]);
      if (method === 'PUT') {
        var appts = getStore('appointments');
        var idx = appts.findIndex(function(a){return a.id===aid;});
        if (idx >= 0) { Object.assign(appts[idx], body); setStore('appointments', appts); }
        return { data: {ok:true} };
      }
    }

    // ===== PROVIDERS =====
    if (path === '/api/providers' && method === 'GET') {
      return { data: getStore('providers') };
    }
    if (path === '/api/providers' && method === 'POST') {
      var provs = getStore('providers');
      body.id = nextId('providers');
      body.provider_id = body.provider_id || 'PRV' + String(body.id).padStart(3,'0');
      body.status = body.status || 'active';
      provs.push(body);
      setStore('providers', provs);
      return { data: body };
    }
    if ((m = path.match(/^\/api\/providers\/(\d+)$/))) {
      var pid = parseInt(m[1]);
      if (method === 'GET') {
        var prov = getStore('providers').find(function(p){return p.id===pid;});
        return prov ? { data: prov } : { status: 404, data: {error:'Not found'} };
      }
      if (method === 'PUT') {
        var provs = getStore('providers');
        var idx = provs.findIndex(function(p){return p.id===pid;});
        if (idx >= 0) { Object.assign(provs[idx], body); setStore('providers', provs); }
        return { data: {ok:true} };
      }
      if (method === 'DELETE') {
        setStore('providers', getStore('providers').filter(function(p){return p.id!==pid;}));
        return { data: {ok:true} };
      }
    }

    // ===== INSURANCES =====
    if (path === '/api/insurances/list') {
      var ins = getStore('insurances');
      if (q.patient_id) ins = ins.filter(function(i){return i.patient_id===parseInt(q.patient_id);});
      return { data: ins };
    }
    if ((m = path.match(/^\/api\/insurances\/(\d+)$/))) {
      var iid = parseInt(m[1]);
      if (method === 'DELETE') {
        setStore('insurances', getStore('insurances').filter(function(i){return i.id!==iid;}));
        return { data: {ok:true} };
      }
    }

    // ===== DOCUMENTS =====
    if (path.match(/^\/api\/documents\//)) {
      return { data: [] };
    }

    // ===== AR =====
    if (path === '/api/ar' && method === 'GET') {
      return { data: getStore('ar_records') };
    }
    if (path === '/api/ar/calls' && method === 'GET') {
      return { data: getStore('ar_calls') || [] };
    }
    if (path === '/api/ar/calls' && method === 'POST') {
      var calls = getStore('ar_calls');
      body.id = nextId('ar_calls');
      body.call_date = body.call_date || new Date().toISOString();
      calls.push(body);
      setStore('ar_calls', calls);
      return { data: body };
    }
    if ((m = path.match(/^\/api\/ar\/calls\/(\d+)$/))) {
      var callId = parseInt(m[1]);
      if (method === 'PUT') {
        var calls = getStore('ar_calls');
        var idx = calls.findIndex(function(c){return c.id===callId;});
        if (idx >= 0) { Object.assign(calls[idx], body); setStore('ar_calls', calls); }
        return { data: {ok:true} };
      }
    }
    if (path === '/api/ar/voicemail' && method === 'POST') {
      var vms = getStore('ar_voicemail') || [];
      body.id = nextId('ar_voicemail');
      vms.push(body);
      setStore('ar_voicemail', vms);
      return { data: body };
    }

    // ===== AUTHORIZATIONS =====
    if (path === '/api/authorizations' && method === 'GET') {
      return { data: getStore('authorizations') || [] };
    }
    if (path === '/api/authorizations/submit' && method === 'POST') {
      var auths = getStore('authorizations');
      body.id = nextId('authorizations');
      body.auth_id = body.auth_id || 'AUTH' + String(body.id).padStart(3,'0');
      body.status = body.status || 'pending';
      body.created_at = new Date().toISOString();
      auths.push(body);
      setStore('authorizations', auths);
      return { data: body };
    }
    if (path === '/api/authorizations/retro-submit' && method === 'POST') {
      var auths = getStore('authorizations');
      body.id = nextId('authorizations');
      body.auth_id = body.auth_id || 'AUTH' + String(body.id).padStart(3,'0');
      body.status = 'retro_pending';
      body.type = 'retrospective';
      body.created_at = new Date().toISOString();
      auths.push(body);
      setStore('authorizations', auths);
      return { data: body };
    }
    if ((m = path.match(/^\/api\/authorizations\/(\d+)\/(start-review|request-info|approve|deny|resubmit|hold|release)$/))) {
      var authId = parseInt(m[1]);
      var action = m[2];
      var auths = getStore('authorizations');
      var idx = auths.findIndex(function(a){return a.id===authId;});
      if (idx >= 0) {
        var statusMap = {start_review:'under_review',request_info:'info_requested',approve:'approved',deny:'denied',resubmit:'resubmitted',hold:'on_hold',release:'released'};
        auths[idx].status = statusMap[action] || action;
        setStore('authorizations', auths);
      }
      return { data: {ok:true} };
    }
    if ((m = path.match(/^\/api\/authorizations\/(\d+)\/(appeal|peer-review)$/))) {
      return { data: {ok:true} };
    }

    // ===== REJECTIONS ACTIONS =====
    if ((m = path.match(/^\/api\/rejections\/(\d+)\/action$/))) {
      var rejId = parseInt(m[1]);
      var rejs = getStore('rejections');
      var idx = rejs.findIndex(function(r){return r.id===rejId;});
      if (idx >= 0) { Object.assign(rejs[idx], body); setStore('rejections', rejs); }
      return { data: {ok:true} };
    }

    // ===== APPEALS =====
    if (path === '/api/appeals' && method === 'GET') {
      return { data: getStore('appeals') || [] };
    }
    if (path === '/api/appeals' && method === 'POST') {
      var appeals = getStore('appeals');
      body.id = nextId('appeals');
      body.status = body.status || 'draft';
      body.created_at = new Date().toISOString();
      appeals.push(body);
      setStore('appeals', appeals);
      return { data: body };
    }
    if ((m = path.match(/^\/api\/appeals\/(\d+)$/))) {
      var aid = parseInt(m[1]);
      if (method === 'PUT') {
        var appeals = getStore('appeals');
        var idx = appeals.findIndex(function(a){return a.id===aid;});
        if (idx >= 0) { Object.assign(appeals[idx], body); setStore('appeals', appeals); }
        return { data: {ok:true} };
      }
    }

    // ===== INPATIENT / UB-04 =====
    if (path === '/api/inpatient' && method === 'GET') {
      return { data: getStore('inpatient') || [] };
    }
    if (path === '/api/inpatient' && method === 'POST') {
      var ips = getStore('inpatient');
      body.id = nextId('inpatient');
      body.ip_id = body.ip_id || 'IP' + String(body.id).padStart(3,'0');
      body.status = body.status || 'admitted';
      body.created_at = new Date().toISOString();
      ips.push(body);
      setStore('inpatient', ips);
      return { data: body };
    }
    if ((m = path.match(/^\/api\/inpatient\/(\d+)$/))) {
      var ipId = parseInt(m[1]);
      if (method === 'PUT') {
        var ips = getStore('inpatient');
        var idx = ips.findIndex(function(i){return i.id===ipId;});
        if (idx >= 0) { Object.assign(ips[idx], body); setStore('inpatient', ips); }
        return { data: {ok:true} };
      }
    }
    if ((m = path.match(/^\/api\/inpatient\/(\d+)\/ub04$/))) {
      var ipId = parseInt(m[1]);
      var ips = getStore('inpatient');
      var idx = ips.findIndex(function(i){return i.id===ipId;});
      if (idx >= 0) { Object.assign(ips[idx], body); setStore('inpatient', ips); }
      return { data: {ok:true} };
    }

    // ===== CORRECTED CLAIMS =====
    if (path === '/api/corrected-claims' && method === 'GET') {
      return { data: getStore('corrected_claims') || [] };
    }
    if (path === '/api/corrected-claims/submit' && method === 'POST') {
      var cc = getStore('corrected_claims');
      body.id = nextId('corrected_claims');
      body.status = body.status || 'submitted';
      body.created_at = new Date().toISOString();
      cc.push(body);
      setStore('corrected_claims', cc);
      return { data: body };
    }

    // ===== ADJUDICATION =====
    if (path === '/api/adjudication' && method === 'GET') {
      return { data: getStore('adjudication') || [] };
    }
    if (path === '/api/adjudication' && method === 'POST') {
      var adj = getStore('adjudication');
      body.id = nextId('adjudication');
      body.status = body.status || 'pending';
      body.created_at = new Date().toISOString();
      adj.push(body);
      setStore('adjudication', adj);
      return { data: body };
    }

    // ===== CMS-1500 =====
    if (path === '/api/cms1500/save' && method === 'POST') {
      var forms = getStore('cms1500_forms');
      body.id = nextId('cms1500_forms');
      body.created_at = new Date().toISOString();
      forms.push(body);
      setStore('cms1500_forms', forms);
      return { data: {id:body.id,ok:true} };
    }
    if (path === '/api/cms1500') {
      if (method === 'GET') return { data: getStore('cms1500_forms') || [] };
    }

    // ===== MEDICAL RECORDS =====
    if (path === '/api/medical-records' && method === 'GET') {
      return { data: getStore('medical_records') || [] };
    }
    if (path === '/api/medical-records/upload' && method === 'POST') {
      var recs = getStore('medical_records');
      body.id = nextId('medical_records');
      body.uploaded_at = new Date().toISOString();
      recs.push(body);
      setStore('medical_records', recs);
      return { data: body };
    }
    if ((m = path.match(/^\/api\/medical-records\/(\d+)$/))) {
      var rid = parseInt(m[1]);
      if (method === 'PUT') {
        var recs = getStore('medical_records');
        var idx = recs.findIndex(function(r){return r.id===rid;});
        if (idx >= 0) { Object.assign(recs[idx], body); setStore('medical_records', recs); }
        return { data: {ok:true} };
      }
      if (method === 'DELETE') {
        setStore('medical_records', getStore('medical_records').filter(function(r){return r.id!==rid;}));
        return { data: {ok:true} };
      }
    }

    // ===== OFFSET TRACKING =====
    if (path === '/api/offset-tracking' && method === 'GET') {
      return { data: getStore('offset_tracking') || [] };
    }
    if (path === '/api/offset-tracking' && method === 'POST') {
      var offs = getStore('offset_tracking');
      body.id = nextId('offset_tracking');
      body.created_at = new Date().toISOString();
      offs.push(body);
      setStore('offset_tracking', offs);
      return { data: body };
    }

    // ===== DOCUMENTS =====
    if (path === '/api/documents/save' && method === 'POST') {
      var docs = getStore('documents');
      body.id = nextId('documents');
      body.saved_at = new Date().toISOString();
      docs.push(body);
      setStore('documents', docs);
      return { data: {id:body.id,ok:true} };
    }
    if (path.match(/^\/api\/documents\//)) {
      return { data: getStore('documents') || [] };
    }

    // ===== ELIGIBILITY EXTRAS =====
    if (path === '/api/eligibility/templates' && method === 'GET') {
      return { data: getStore('eligibility_templates') || [] };
    }
    if (path === '/api/eligibility/templates' && method === 'POST') {
      var tpls = getStore('eligibility_templates');
      body.id = nextId('eligibility_templates');
      tpls.push(body);
      setStore('eligibility_templates', tpls);
      return { data: body };
    }
    if (path === '/api/eligibility/templates/copy' && method === 'POST') {
      var tpls = getStore('eligibility_templates');
      body.id = nextId('eligibility_templates');
      tpls.push(body);
      setStore('eligibility_templates', tpls);
      return { data: body };
    }
    if ((m = path.match(/^\/api\/eligibility\/templates\/(\d+)$/))) {
      var tid = parseInt(m[1]);
      if (method === 'PUT') {
        var tpls = getStore('eligibility_templates');
        var idx = tpls.findIndex(function(t){return t.id===tid;});
        if (idx >= 0) { Object.assign(tpls[idx], body); setStore('eligibility_templates', tpls); }
        return { data: {ok:true} };
      }
      if (method === 'DELETE') {
        setStore('eligibility_templates', getStore('eligibility_templates').filter(function(t){return t.id!==tid;}));
        return { data: {ok:true} };
      }
    }
    if (path.match(/^\/api\/eligibility\/templates\/\d+\/set\//)) {
      return { data: {ok:true} };
    }
    if (path === '/api/eligibility/payer/create-card' && method === 'POST') {
      var payerCards = getStore('payer_cards');
      var cardId = nextId('payer_cards');
      var autoMemberId = body.member_id || ('MID-' + Date.now().toString(36).toUpperCase() + cardId);
      var card = {
        id: cardId,
        payer_name: body.payer_name || '',
        member_id: autoMemberId,
        group_number: body.group_number || '',
        plan_name: body.plan_name || '',
        plan_type: body.plan_type || 'PPO',
        insurance_type: body.insurance_type || 'primary',
        copay: parseFloat(body.copay) || 0,
        deductible: parseFloat(body.deductible) || 0,
        coinsurance: parseFloat(body.coinsurance) || 0,
        subscriber_name: body.subscriber_name || '',
        subscriber_dob: body.subscriber_dob || '',
        relationship: body.relationship || 'self',
        status: 'active',
        effective_status: 'active',
        created_at: new Date().toISOString()
      };
      payerCards.push(card);
      setStore('payer_cards', payerCards);
      var allIns = getStore('insurances');
      var newInsId = nextId('insurances');
      var insRecord = {
        id: newInsId,
        patient_id: body.patient_id || null,
        payer_name: card.payer_name,
        policy_number: card.member_id,
        member_id: card.member_id,
        group_number: card.group_number,
        subscriber_name: card.subscriber_name,
        relationship: card.relationship,
        plan_type: card.plan_type || body.plan_type || 'PPO',
        plan_name: card.plan_name || body.plan_name || '',
        copay: card.copay,
        deductible: card.deductible,
        coinsurance: card.coinsurance,
        insurance_type: card.insurance_type,
        effective_date: body.effective_date || new Date().toISOString().slice(0,10),
        termination_date: body.termination_date || new Date(Date.now() + 365*24*60*60*1000).toISOString().slice(0,10),
        status: 'active',
        effective_status: 'active',
        eligibility_status: 'active',
        card_image_front: body.card_image_front || null,
        card_image_back: body.card_image_back || null,
        source: 'payer_card',
        created_at: new Date().toISOString()
      };
      allIns.push(insRecord);
      setStore('insurances', allIns);
      return { data: {ok:true, id: cardId, card: card, insurance_id: newInsId} };
    }
    if (path === '/api/eligibility/payer/all') {
      var q = (q.q || '').toLowerCase();
      var allIns = getStore('insurances');
      var payerCards = getStore('payer_cards');
      var allElig = getStore('eligibility');
      var allPatients = getStore('patients');
      var rows = [];
      allIns.forEach(function(ins) {
        var p = ins.patient_id ? allPatients.find(function(pp){return pp.id===ins.patient_id||pp.patient_id===ins.patient_id;}) : null;
        var e = allElig.find(function(el){return el.insurance_id===ins.id;});
        var name = p ? (p.first_name + ' ' + (p.last_name||'')) : (ins.subscriber_name || '');
        var mid = (ins.member_id||'').toLowerCase();
        var pn = (ins.payer_name||'').toLowerCase();
        if (q && name.toLowerCase().indexOf(q)<0 && mid.indexOf(q)<0 && pn.indexOf(q)<0 && (ins.policy_number||'').toLowerCase().indexOf(q)<0 && (p && p.patient_id ? p.patient_id.toLowerCase().indexOf(q)<0 : true) && (p && p.mrn ? p.mrn.toLowerCase().indexOf(q)<0 : true)) return;
        rows.push({id:ins.id,_source:'insurance',first_name:name,patient_id:p?p.patient_id:'-',pid:p?p.patient_id:'-',ins_patient_id:ins.patient_id,member_id:ins.member_id,ins_member_id:ins.member_id,payer_name:ins.payer_name,plan_type:ins.plan_type,plan_name:ins.plan_name||'',effective_date:ins.effective_date,termination_date:ins.termination_date,status:ins.effective_status||ins.status||'active',ins_status:ins.status});
      });
      payerCards.forEach(function(card) {
        var mid = (card.member_id||'').toLowerCase();
        var pn = (card.payer_name||'').toLowerCase();
        if (q && mid.indexOf(q)<0 && pn.indexOf(q)<0 && (card.subscriber_name||'').toLowerCase().indexOf(q)<0) return;
        if (allIns.find(function(i){return i.member_id===card.member_id;})) return;
        rows.push({id:card.id,_source:'payer_card',first_name:card.subscriber_name||'',patient_id:'-',pid:'-',ins_patient_id:null,member_id:card.member_id,ins_member_id:card.member_id,payer_name:card.payer_name,plan_type:card.plan_type,plan_name:card.plan_name||'',effective_date:card.effective_date||'',termination_date:card.termination_date||'',status:card.effective_status||card.status||'active',ins_status:card.status});
      });
      allElig.forEach(function(el) {
        var existing = rows.find(function(r){return r.id===el.id;});
        if (existing) return;
        var p = el.patient_id ? allPatients.find(function(pp){return pp.id===el.patient_id||String(pp.patient_id)===String(el.patient_id);}) : null;
        var name = p ? (p.first_name + ' ' + (p.last_name||'')) : '';
        var mid = (el.member_id||'').toLowerCase();
        var pn = (el.payer_name||'').toLowerCase();
        if (q && name.toLowerCase().indexOf(q)<0 && mid.indexOf(q)<0 && pn.indexOf(q)<0) return;
        rows.push({id:el.id,_source:'eligibility',first_name:name,patient_id:p?p.patient_id:'-',pid:p?p.patient_id:'-',ins_patient_id:el.patient_id,member_id:el.member_id,ins_member_id:el.member_id,payer_name:el.payer_name,plan_type:el.plan_type,effective_date:el.effective_date,termination_date:el.termination_date,status:el.status||'active',ins_status:el.status});
      });
      return { data: rows };
    }
    if ((m = path.match(/^\/api\/eligibility\/payer\/search-member\/(.+)$/))) {
      var searchId = decodeURIComponent(m[1]).trim().toLowerCase();
      var allIns = getStore('insurances');
      var payerCards = getStore('payer_cards');
      var allPatients = getStore('patients');
      var found = [];
      var cards = payerCards.filter(function(c){ return (c.member_id||'').toLowerCase() === searchId; });
      cards.forEach(function(card) {
        var insMatch = allIns.find(function(i){ return i.member_id && i.member_id.toLowerCase() === searchId; });
        var patient = insMatch && insMatch.patient_id ? allPatients.find(function(p){ return p.id === insMatch.patient_id || p.patient_id === insMatch.patient_id; }) : null;
        found.push({ insurance: insMatch || {id:card.id,payer_name:card.payer_name,member_id:card.member_id,group_number:card.group_number,plan_name:card.plan_name,plan_type:card.plan_type,insurance_type:card.insurance_type,copay:card.copay,deductible:card.deductible,coinsurance:card.coinsurance,subscriber_name:card.subscriber_name,effective_status:card.effective_status,status:card.status,card_image_front:null,card_image_back:null,patient_id:null}, patient: patient, eligibilities: [] });
      });
      if (!found.length) {
        allIns.forEach(function(ins) {
          if (ins.member_id && ins.member_id.toLowerCase() === searchId) {
            var patient = ins.patient_id ? allPatients.find(function(p){ return p.id === ins.patient_id || p.patient_id === ins.patient_id; }) : null;
            found.push({ insurance: ins, patient: patient, eligibilities: [] });
          }
        });
      }
      if (!found.length) {
        return { data: {found:false, results:[]} };
      }
      return { data: {found:true, results:found} };
    }

    // ===== REPORTS =====
    if (path === '/api/reports/summary') {
      var pts = getStore('patients');
      var chg = getStore('charges');
      var pays = getStore('payments');
      var totalBilled = chg.reduce(function(s,c){return s+(c.billed_amount||0);},0);
      var totalPaid = chg.reduce(function(s,c){return s+(c.paid_amount||0);},0);
      var totalPayments = pays.reduce(function(s,p){return s+(p.amount||0);},0);
      return { data: {totalPatients:pts.length,totalCharges:totalBilled,totalPaid:totalPaid,totalPayments:totalPayments,pendingClaims:chg.filter(function(c){return c.status!=='posted';}).length,openAR:totalBilled-totalPaid,claimsByStatus:[{status:'pending',count:chg.filter(function(c){return c.status==='pending';}).length},{status:'paid',count:chg.filter(function(c){return c.status==='paid';}).length},{status:'denied',count:chg.filter(function(c){return c.status==='denied';}).length}]} };
    }
    if (path.indexOf('/api/reports/monthly-collection') === 0) {
      return { data: {year:2026,months:[{month:'Jan',collections:0,charges:0},{month:'Feb',collections:0,charges:0},{month:'Mar',collections:0,charges:0},{month:'Apr',collections:0,charges:0},{month:'May',collections:0,charges:0},{month:'Jun',collections:200,charges:1000},{month:'Jul',collections:0,charges:600},{month:'Aug',collections:0,charges:0},{month:'Sep',collections:0,charges:0},{month:'Oct',collections:0,charges:0},{month:'Nov',collections:0,charges:0},{month:'Dec',collections:0,charges:0}],totalCollections:200,totalCharges:1600} };
    }
    if (path === '/api/reports/dues') {
      var chg = getStore('charges');
      var totalDue = chg.reduce(function(s,c){return s+Math.max(0,(c.billed_amount||0)-(c.paid_amount||0));},0);
      return { data: {totalBilled:chg.reduce(function(s,c){return s+(c.billed_amount||0);},0),totalPaid:chg.reduce(function(s,c){return s+(c.paid_amount||0);},0),totalDue:totalDue,aging:{'0-30':totalDue,'31-60':0,'61-90':0,'91-120':0,'120+':0},patients:[]} };
    }
    if (path === '/api/reports/training-payments') {
      var users = getStore('training_users');
      return { data: {users:users,summary:{total_users:users.length}} };
    }
    if (path === '/api/reports/ledger') {
      return { data: {transactions:[],payments:getStore('payments')} };
    }

    // ===== CODING REVIEWS =====
    if (path === '/api/coding/reviews' && method === 'GET') {
      return { data: getStore('coding_reviews') };
    }
    if (path === '/api/coding/reviews' && method === 'POST') {
      var revs = getStore('coding_reviews');
      var cnt = revs.length;
      body.review_id = body.review_id || 'CRV' + String(cnt+1).padStart(3,'0');
      body.status = body.status || 'pending_review';
      body.created_at = new Date().toISOString();
      body.updated_at = new Date().toISOString();
      body.sent_to_billing = 0;
      revs.push(body);
      setStore('coding_reviews', revs);
      var cps = getStore('coding_checkpoints');
      [['Demographics Verified','Documentation'],['Insurance Verified','Documentation'],['Chief Complaint Documented','Clinical']].forEach(function(cp) {
        cps.push({id:nextId('coding_checkpoints'),review_id:body.review_id,checkpoint_name:cp[0],checkpoint_category:cp[1],is_checked:0,checked_by:'',notes:'',severity:'info'});
      });
      setStore('coding_checkpoints', cps);
      return { data: {review_id:body.review_id} };
    }
    if ((m = path.match(/^\/api\/coding\/reviews\/([^/]+)$/))) {
      var rid = m[1];
      if (method === 'GET') {
        var rev = getStore('coding_reviews').find(function(r){return r.review_id===rid;});
        if (!rev) return { status: 404, data: {error:'Not found'} };
        rev.checkpoints = getStore('coding_checkpoints').filter(function(c){return c.review_id===rid;});
        rev.documents = getStore('coding_documents').filter(function(d){return d.review_id===rid;});
        rev.icd_codes = getStore('coding_icd').filter(function(c){return c.review_id===rid;});
        rev.cpt_codes = getStore('coding_cpt').filter(function(c){return c.review_id===rid;});
        rev.audit_log = getStore('coding_audit_log').filter(function(l){return l.review_id===rid;});
        return { data: rev };
      }
      if (method === 'PUT') {
        var revs = getStore('coding_reviews');
        var idx = revs.findIndex(function(r){return r.review_id===rid;});
        if (idx >= 0) { Object.assign(revs[idx], body); setStore('coding_reviews', revs); }
        return { data: {ok:true} };
      }
      if (method === 'DELETE') {
        setStore('coding_reviews', getStore('coding_reviews').filter(function(r){return r.review_id!==rid;}));
        setStore('coding_checkpoints', getStore('coding_checkpoints').filter(function(c){return c.review_id!==rid;}));
        return { data: {ok:true} };
      }
    }
    if ((m = path.match(/^\/api\/coding\/reviews\/([^/]+)\/checkpoints$/))) {
      body.id = nextId('coding_checkpoints');
      var cps = getStore('coding_checkpoints');
      cps.push(body);
      setStore('coding_checkpoints', cps);
      return { data: {id:body.id} };
    }
    if ((m = path.match(/^\/api\/coding\/checkpoints\/(\d+)$/))) {
      var cpId = parseInt(m[1]);
      if (method === 'PUT') {
        var cps = getStore('coding_checkpoints');
        var idx = cps.findIndex(function(c){return c.id===cpId;});
        if (idx >= 0) { Object.assign(cps[idx], body); setStore('coding_checkpoints', cps); }
        return { data: {ok:true} };
      }
      if (method === 'DELETE') {
        setStore('coding_checkpoints', getStore('coding_checkpoints').filter(function(c){return c.id!==cpId;}));
        return { data: {ok:true} };
      }
    }
    if ((m = path.match(/^\/api\/coding\/reviews\/([^/]+)\/icd$/))) {
      body.id = nextId('coding_icd');
      var icds = getStore('coding_icd');
      icds.push(body);
      setStore('coding_icd', icds);
      return { data: {id:body.id} };
    }
    if ((m = path.match(/^\/api\/coding\/icd\/(\d+)$/))) {
      var icdId = parseInt(m[1]);
      if (method === 'PUT') {
        var icds = getStore('coding_icd');
        var idx = icds.findIndex(function(c){return c.id===icdId;});
        if (idx >= 0) { Object.assign(icds[idx], body); setStore('coding_icd', icds); }
        return { data: {ok:true} };
      }
      if (method === 'DELETE') {
        setStore('coding_icd', getStore('coding_icd').filter(function(c){return c.id!==icdId;}));
        return { data: {ok:true} };
      }
    }
    if ((m = path.match(/^\/api\/coding\/reviews\/([^/]+)\/cpt$/))) {
      body.id = nextId('coding_cpt');
      var cpts = getStore('coding_cpt');
      cpts.push(body);
      setStore('coding_cpt', cpts);
      return { data: {id:body.id} };
    }
    if ((m = path.match(/^\/api\/coding\/cpt\/(\d+)$/))) {
      var cptId = parseInt(m[1]);
      if (method === 'PUT') {
        var cpts = getStore('coding_cpt');
        var idx = cpts.findIndex(function(c){return c.id===cptId;});
        if (idx >= 0) { Object.assign(cpts[idx], body); setStore('coding_cpt', cpts); }
        return { data: {ok:true} };
      }
      if (method === 'DELETE') {
        setStore('coding_cpt', getStore('coding_cpt').filter(function(c){return c.id!==cptId;}));
        return { data: {ok:true} };
      }
    }
    if ((m = path.match(/^\/api\/coding\/reviews\/([^/]+)\/documents$/))) {
      body.id = nextId('coding_documents');
      var docs = getStore('coding_documents');
      docs.push(body);
      setStore('coding_documents', docs);
      return { data: {id:body.id} };
    }
    if ((m = path.match(/^\/api\/coding\/documents\/(\d+)$/))) {
      var docId = parseInt(m[1]);
      if (method === 'DELETE') {
        setStore('coding_documents', getStore('coding_documents').filter(function(d){return d.id!==docId;}));
        return { data: {ok:true} };
      }
    }
    if ((m = path.match(/^\/api\/coding\/reviews\/([^/]+)\/send-to-billing$/))) {
      var revs = getStore('coding_reviews');
      var idx = revs.findIndex(function(r){return r.review_id===m[1];});
      if (idx >= 0) { revs[idx].status='sent_to_billing'; revs[idx].sent_to_billing=1; setStore('coding_reviews', revs); }
      return { data: {ok:true,batch_id:'BAT0001'} };
    }
    if (path === '/api/coding/stats') {
      var revs = getStore('coding_reviews');
      return { data: {total:revs.length,pending:revs.filter(function(r){return r.status==='pending_review';}).length,reviewing:revs.filter(function(r){return r.status==='reviewing';}).length,sent:revs.filter(function(r){return r.status==='sent_to_billing';}).length,completed:revs.filter(function(r){return r.status==='completed';}).length,totalICD:getStore('coding_icd').length,totalCPT:getStore('coding_cpt').length,totalDocs:getStore('coding_documents').length} };
    }
    if ((m = path.match(/^\/api\/coding\/reviews\/([^/]+)\/audit$/))) {
      return { data: getStore('coding_audit_log').filter(function(l){return l.review_id===m[1];}) };
    }
    if (path === '/api/coding/suggest-icd') {
      return { data: [{code:'E11.9',description:'Type 2 diabetes mellitus without complications',category:'Endocrine'},{code:'I10',description:'Essential (primary) hypertension',category:'Circulatory'},{code:'J45.9',description:'Unspecified asthma',category:'Respiratory'},{code:'M54.5',description:'Low back pain',category:'Musculoskeletal'}].filter(function(c){return !q.q || c.code.toLowerCase().indexOf(q.q.toLowerCase())>=0 || c.description.toLowerCase().indexOf(q.q.toLowerCase())>=0; }) };
    }
    if (path === '/api/coding/suggest-cpt') {
      return { data: [{code:'99213',description:'Office visit, established patient, low complexity',category:'E&M',fee_schedule:'125'},{code:'99214',description:'Office visit, established patient, moderate complexity',category:'E&M',fee_schedule:'180'},{code:'99215',description:'Office visit, established patient, high complexity',category:'E&M',fee_schedule:'250'}].filter(function(c){return !q.q || c.code.toLowerCase().indexOf(q.q.toLowerCase())>=0 || c.description.toLowerCase().indexOf(q.q.toLowerCase())>=0; }) };
    }
    if (path === '/api/coding/auto-suggest') {
      return { data: {icd:[],cpt:[]} };
    }

    // ===== MASTER DATA =====
    if (path.indexOf('/api/master-data/') === 0) {
      var parts = path.split('/');
      var key = parts[3];
      var tableName = {insurances:'master_insurances',providers:'master_providers',cpt:'master_cpt',icd:'master_icd',modifiers:'master_modifiers',rooms:'master_rooms',pcp:'master_pcp',hospital:'master_hospital',npi:'master_npi'}[key] || 'master_' + key;
      if (method === 'GET' && !parts[4]) {
        var items = getStore(tableName);
        return { data: items };
      }
      if (method === 'POST') {
        var items = getStore(tableName);
        body.id = nextId(tableName);
        items.push(body);
        setStore(tableName, items);
        return { data: {id:body.id,ok:true} };
      }
      if (parts[4] && method === 'PUT') {
        var items = getStore(tableName);
        var idx = items.findIndex(function(i){return i.id===parseInt(parts[4]);});
        if (idx >= 0) { Object.assign(items[idx], body); setStore(tableName, items); }
        return { data: {ok:true} };
      }
      if (parts[4] && method === 'DELETE') {
        setStore(tableName, getStore(tableName).filter(function(i){return i.id!==parseInt(parts[4]);}));
        return { data: {ok:true} };
      }
    }
    if (path === '/api/master/icd/search') return { data: [] };
    if (path === '/api/master/cpt/search') return { data: [] };
    if (path === '/api/master/modifiers/search') return { data: [] };

    // ===== NPI LOOKUP =====
    if (path === '/api/npi-lookup') {
      return { data: [{npi:'1234567890',first_name:'Sarah',last_name:'Johnson',credential:'MD',taxonomy_desc:'Anesthesiology',city:'Houston',state:'TX'},{npi:'2345678901',first_name:'Michael',last_name:'Chen',credential:'DO',taxonomy_desc:'Family Medicine',city:'Dallas',state:'TX'}].filter(function(n){return !q.q || (n.first_name+n.last_name+n.npi+n.taxonomy_desc).toLowerCase().indexOf(q.q.toLowerCase())>=0;}) };
    }

    // ===== SITE CONTENT =====
    if (path === '/api/site-content') {
      return { data: getConfig() };
    }
    if (path === '/api/site-courses') {
      if (method === 'GET') return { data: (getConfig().courses||[]).filter(function(c){return c.visible;}) };
      if (method === 'POST') { var cfg = getConfig(); cfg.courses = body.courses || cfg.courses; setConfig(cfg); return { data: {ok:true,courses:cfg.courses} }; }
    }
    if (path.indexOf('/api/site-courses/') === 0 && path.indexOf('/add') > 0 && method === 'POST') {
      var cfg = getConfig();
      var maxId = cfg.courses.reduce(function(m,c){return Math.max(m,c.id);},0);
      var newC = {id:maxId+1,name:body.name||'New Course',batch:body.batch||'',status:body.status||'New',duration:body.duration||'',fee:body.fee||'0',visible:true};
      cfg.courses.push(newC); setConfig(cfg);
      return { data: {ok:true,course:newC} };
    }
    if (path === '/api/demo-link') {
      var cfg = getConfig();
      if (method === 'GET') return { data: cfg.demoLink || {} };
      if (method === 'PUT') { cfg.demoLink = Object.assign(cfg.demoLink||{}, body); setConfig(cfg); return { data: {ok:true,demoLink:cfg.demoLink} }; }
      if (method === 'POST') return { data: {ok:true,data:cfg.demoLink} };
    }
    if (path === '/api/site-announcements' && method === 'POST') {
      var cfg = getConfig(); cfg.announcements = body.announcements || ''; setConfig(cfg); return { data: {ok:true} };
    }
    if (path === '/api/site-videos' && method === 'POST') {
      var cfg = getConfig(); cfg.videos = body.videos || []; setConfig(cfg); return { data: {ok:true} };
    }
    if (path === '/api/site-pdfs') {
      if (method === 'GET') return { data: (getConfig().pdfs || []) };
      if (method === 'POST') { var cfg = getConfig(); cfg.pdfs = body.pdfs || []; setConfig(cfg); return { data: {ok:true} }; }
    }
    if (path === '/api/deploy-website' || path === '/api/deploy-vercel') {
      return { data: {ok:true} };
    }
    if (path === '/api/student-inquiries' && method === 'GET') {
      return { data: getStore('student_inquiries') };
    }
    if (path === '/api/student-inquiry' && method === 'POST') {
      var inqs = getStore('student_inquiries');
      body.id = Date.now();
      body.status = 'new';
      body.created = new Date().toISOString();
      inqs.push(body);
      setStore('student_inquiries', inqs);
      return { data: {ok:true,id:body.id,adminWhatsApp:'https://wa.me/918309456545',studentWhatsApp:'https://wa.me/91'+(body.phone||'')} };
    }

    // ===== Fallback - handle any unmatched POST/PUT/DELETE gracefully =====
    if (method === 'POST' || method === 'PUT') {
      return { data: {id:nextId('_fallback'),ok:true,message:'Saved successfully'} };
    }
    if (method === 'DELETE') {
      return { data: {ok:true,message:'Deleted successfully'} };
    }
    return { data: [] };
  }

  console.log('[PMS Mock API] Active - all data stored in localStorage');
})();
