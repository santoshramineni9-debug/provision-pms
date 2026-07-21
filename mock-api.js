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
      {id:1,patient_id:1,payer_name:'Aetna',policy_number:'AET-332190',group_number:'GRP-5521',subscriber_name:'John Smith',relationship:'Self',plan_type:'PPO',effective_date:'2026-01-01',termination_date:'2026-12-31',status:'active'},
      {id:2,patient_id:2,payer_name:'Blue Cross Blue Shield',policy_number:'BCBS-784521',group_number:'GRP-3344',subscriber_name:'Maria Garcia',relationship:'Self',plan_type:'HMO',effective_date:'2026-01-01',termination_date:'2026-12-31',status:'active'},
      {id:3,patient_id:3,payer_name:'UnitedHealthcare',policy_number:'UHC-991234',group_number:'GRP-7788',subscriber_name:'Robert Johnson',relationship:'Self',plan_type:'PPO',effective_date:'2026-03-01',termination_date:'2027-02-28',status:'active'},
      {id:4,patient_id:4,payer_name:'Cigna',policy_number:'CIG-445678',group_number:'GRP-2211',subscriber_name:'Sarah Williams',relationship:'Self',plan_type:'EPO',effective_date:'2026-01-01',termination_date:'2026-12-31',status:'active'},
      {id:5,patient_id:5,payer_name:'Aetna',policy_number:'AET-556789',group_number:'GRP-5521',subscriber_name:'David Brown',relationship:'Self',plan_type:'POS',effective_date:'2026-02-01',termination_date:'2027-01-31',status:'active'}
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
      return { data: getStore('patients') };
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
        return !q2 || (p.patient_id||'').toLowerCase().indexOf(q2) >= 0 || (p.mrn||'').toLowerCase().indexOf(q2) >= 0 || (p.first_name||'').toLowerCase().indexOf(q2) >= 0 || (p.last_name||'').toLowerCase().indexOf(q2) >= 0;
      });
      return { data: patients };
    }
    if ((m = path.match(/^\/api\/patients\/(\d+)\/360$/))) {
      var pid = parseInt(m[1]);
      var patient = getStore('patients').find(function(p){return p.id===pid;});
      if (!patient) return { status: 404, data: {error:'Not found'} };
      var ins = getStore('insurances').filter(function(i){return i.patient_id===pid;});
      var chg = getStore('charges').filter(function(c){return c.patient_id===pid;});
      var appts = getStore('appointments').filter(function(a){return a.patient_id===pid;});
      return { data: Object.assign({}, patient, {insurances:ins,charges:chg,appointments:appts}) };
    }
    if ((m = path.match(/^\/api\/patients\/(\d+)\/insurance\/(\d+)\/card$/))) {
      return { data: {ok:true} };
    }
    if ((m = path.match(/^\/api\/patients\/(\d+)\/dependents$/))) {
      if (method === 'POST') {
        return { data: {id:nextId('dependents'),ok:true} };
      }
      return { data: [] };
    }
    if ((m = path.match(/^\/api\/patients\/(\d+)\/dependents\/(\d+)$/)) && method === 'DELETE') {
      return { data: {ok:true} };
    }
    if ((m = path.match(/^\/api\/patients\/(\d+)\/insurance\/link$/))) {
      return { data: {ok:true,insurance:{id:nextId('insurances')}} };
    }
    if ((m = path.match(/^\/api\/patients\/(\d+)\/insurance\/reorder$/))) {
      return { data: {ok:true} };
    }
    if (path.match(/^\/api\/patients\/insurance\/lookup\//)) {
      return { data: {found:false} };
    }
    if ((m = path.match(/^\/api\/patients\/(\d+)$/))) {
      var pid = parseInt(m[1]);
      if (method === 'GET') {
        var patient = getStore('patients').find(function(p){return p.id===pid;});
        return patient ? { data: patient } : { status: 404, data: {error:'Not found'} };
      }
      if (method === 'PUT') {
        var patients = getStore('patients');
        var idx = patients.findIndex(function(p){return p.id===pid;});
        if (idx >= 0) { Object.assign(patients[idx], body); setStore('patients', patients); }
        return { data: {ok:true} };
      }
      if (method === 'DELETE') {
        setStore('patients', getStore('patients').filter(function(p){return p.id!==pid;}));
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
      var memberId = decodeURIComponent(m[1]);
      var ins = getStore('insurances').find(function(i){return (i.policy_number||'').toLowerCase()===memberId.toLowerCase();});
      if (!ins) return { data: {verified:false,error:'Member not found'} };
      return { data: {verified:true,insurance:ins,benefits:[{type:'Medical',covered:true,copay:'$30'}]} };
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
    if ((m = path.match(/^\/api\/eligibility\/benefit\/(\d+)$/))) {
      return { data: {ok:true} };
    }
    if ((m = path.match(/^\/api\/eligibility\/payer\/(.+)$/))) {
      return { data: [] };
    }
    if (path === '/api/eligibility/hospitals') {
      return { data: [{id:1,name:'Houston General Hospital'},{id:2,name:'Provision Medical Center'},{id:3,name:'Dallas Regional Medical'}] };
    }
    if (path === '/api/eligibility/benefit-types') {
      return { data: ['Medical','Surgical','Prescription','Mental Health','Dental','Vision','Emergency','Lab','Imaging','Rehabilitation'] };
    }
    if (path.match(/^\/api\/eligibility\/templates/)) {
      if (method === 'GET') return { data: getStore('eligibility_templates') };
      if (method === 'POST') { var tpls = getStore('eligibility_templates'); body.id=nextId('eligibility_templates'); tpls.push(body); setStore('eligibility_templates',tpls); return {data:body}; }
      if ((m = path.match(/\/set\//))) return { data: {ok:true} };
      if ((m = path.match(/\/copy$/))) return { data: {ok:true} };
      if ((m = path.match(/\/(\d+)$/)) && method === 'PUT') return { data: {ok:true} };
      if ((m = path.match(/\/(\d+)$/)) && method === 'DELETE') return { data: {ok:true} };
    }

    // ===== CHARGES =====
    if (path === '/api/charges' && method === 'GET') {
      return { data: getStore('charges') };
    }
    if (path === '/api/charges' && method === 'POST') {
      var chg = getStore('charges');
      body.id = nextId('charges');
      body.charge_id = body.charge_id || 'CHG' + String(body.id).padStart(3,'0');
      body.status = body.status || 'pending';
      chg.push(body);
      setStore('charges', chg);
      return { data: body };
    }
    if ((m = path.match(/^\/api\/charges\/check-eligibility\/(\d+)\/(\d+)$/))) {
      return { data: {eligible:true,verified:true} };
    }
    if ((m = path.match(/^\/api\/charges\/(\d+)$/))) {
      var cid = parseInt(m[1]);
      if (method === 'PUT') {
        var chg = getStore('charges');
        var idx = chg.findIndex(function(c){return c.id===cid;});
        if (idx >= 0) { Object.assign(chg[idx], body); setStore('charges', chg); }
        return { data: {ok:true} };
      }
    }
    if (path.indexOf('/api/charges') === 0 && path.indexOf('?') > 0) {
      var qPid = parseInt((q.patient_id || '0'));
      var chg = getStore('charges');
      if (qPid) chg = chg.filter(function(c){return c.patient_id===qPid;});
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
    if ((m = path.match(/^\/api\/providers\/(\d+)$/))) {
      var pid = parseInt(m[1]);
      var prov = getStore('providers').find(function(p){return p.id===pid;});
      return prov ? { data: prov } : { status: 404, data: {error:'Not found'} };
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
      if (method === 'GET') return { data: (getConfig().courses||[]).filter(function(c){return c.visible;}); }
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

    // ===== Fallback =====
    return { data: [] };
  }

  console.log('[PMS Mock API] Active - all data stored in localStorage');
})();
