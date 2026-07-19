const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const deployDir = path.join(__dirname, 'deploy');
if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });

const blue = '#1a237e', gold = '#ffca28', green = '#2e7d32', red = '#c62828', gray = '#666';

function header(doc, title, subtitle) {
  doc.rect(0, 0, 612, 80).fill(blue);
  doc.fontSize(20).fillColor('#fff').text(title, 40, 25, { width: 532, align: 'center' });
  doc.fontSize(10).fillColor(gold).text(subtitle, 40, 52, { width: 532, align: 'center' });
  doc.fillColor('#333');
}

function sectionTitle(doc, text) {
  doc.moveDown(0.5);
  doc.fontSize(14).fillColor(blue).text(text);
  doc.moveTo(40, doc.y).lineTo(572, doc.y).strokeColor(gold).lineWidth(2).stroke();
  doc.moveDown(0.3);
  doc.fillColor('#333');
}

function subSection(doc, text) {
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor(green).text(text);
  doc.fillColor('#333');
  doc.moveDown(0.1);
}

function bullet(doc, text, indent = 50) {
  doc.fontSize(9).fillColor('#333').text('  ' + text, indent, doc.y, { width: 520 });
  doc.moveDown(0.1);
}

function checkPage(doc, needed = 80) {
  if (doc.y > 720 - needed) doc.addPage();
}

// ========== AR CALLING TRAINING PDF ==========
console.log('Creating AR Calling Training PDF...');
const arDoc = new PDFDocument({ size: 'A4', margin: 40 });
arDoc.pipe(fs.createWriteStream(path.join(deployDir, 'AR_Calling_Training_Course.pdf')));

header(arDoc, 'AR Calling Training Course', 'Provision AR Training Center | Complete Course Content');
arDoc.moveDown(1);

subSection(arDoc, 'Module 1: What is AR Calling?');
arDoc.fontSize(9).text('AR (Accounts Receivable) Calling is the process of following up with insurance companies to collect unpaid claims. As an AR Caller, you contact insurance payers to check claim status, resolve denials, and recover revenue for healthcare providers.');
arDoc.moveDown(0.3);
arDoc.text('Key Responsibilities:', { continued: true }).fillColor(gold);
arDoc.fillColor('#333');
bullet(arDoc, 'Monitor claims daily - check status, identify unpaid claims, track aging (0-30, 30-60, 60-90+ days)');
bullet(arDoc, 'Follow up with insurance - call for status, resolve denials, request reprocessing, file appeals');
bullet(arDoc, 'Document everything - log every call, record reference numbers, update claim status, track follow-up dates');
bullet(arDoc, 'Recover revenue - maximize collections, reduce denial rate, improve cash flow');

checkPage(arDoc);
subSection(arDoc, 'Module 2: Key Roles in US Healthcare');
arDoc.text('PCP (Primary Care Physician):');
bullet(arDoc, 'First point of contact for patients');
bullet(arDoc, 'General health checkups, preventive care, minor illness treatment');
bullet(arDoc, 'Manages ongoing conditions, provides referrals to specialists');
arDoc.moveDown(0.2);
arDoc.text('Provider (Any Healthcare Professional):');
bullet(arDoc, 'Any healthcare professional who delivers care - PCPs, Specialists, Hospitals, Nurses, Therapists');
bullet(arDoc, 'Every PCP is a Provider, but NOT every Provider is a PCP');
arDoc.moveDown(0.2);
arDoc.text('In Billing:');
bullet(arDoc, 'Rendering Provider = who saw the patient');
bullet(arDoc, 'Referring Provider = the PCP who sent them');
bullet(arDoc, 'Billing Provider = who gets paid');

checkPage(arDoc);
subSection(arDoc, 'Module 3: Claim Processing Flow');
bullet(arDoc, '1. Patient Visit - Patient sees doctor, services provided');
bullet(arDoc, '2. Code Assignment - ICD-10 (diagnosis) + CPT (procedure) codes assigned');
bullet(arDoc, '3. Charge Entry - Charges entered into billing system');
bullet(arDoc, '4. Claim Creation - CMS-1500 form generated with all details');
bullet(arDoc, '5. Scrubbing - Auto validation checks (DOB, insurance ID, NPI, codes)');
bullet(arDoc, '6. Submission - Claim sent electronically (EDI 837 format) via clearinghouse');
bullet(arDoc, '7. Adjudication - Insurance reviews and decides (5 checks: Eligibility, Coverage, Auth, Network, Necessity)');
bullet(arDoc, '8. Payment/Denial - Insurance pays (ERA/835) or denies with reason code');
bullet(arDoc, '9. Follow-up - AR Caller resolves issues and recovers revenue');
bullet(arDoc, '10. Payment Posting - Payment applied to patient account');

checkPage(arDoc, 120);
subSection(arDoc, 'Module 4: Claim Adjudication - 5 Insurance Checks');
arDoc.text('When insurance receives a claim, they run 5 checks:');
bullet(arDoc, '1. ELIGIBILITY - Was patient insured on the Date of Service?');
bullet(arDoc, '2. COVERAGE - Are these services covered under the plan?');
bullet(arDoc, '3. PRIOR AUTHORIZATION - Was authorization obtained (if required)?');
bullet(arDoc, '4. IN-NETWORK - Is the provider contracted with the insurance?');
bullet(arDoc, '5. MEDICAL NECESSITY - Does the diagnosis match the procedure?');
arDoc.moveDown(0.3);
arDoc.text('Payment Calculation Example:', { continued: true }).fillColor(gold);
arDoc.fillColor('#333');
bullet(arDoc, 'Billed: $500 | Allowed: $400 | Write-off: $100 (contractual adjustment)');
bullet(arDoc, 'Insurance pays 80%: $320 | Patient owes 20%: $80');

checkPage(arDoc, 120);
subSection(arDoc, 'Module 5: 25 AR Calling Scenarios (Quick Reference)');

const scenarios = [
  { code: 'DED', name: 'Claim Applied Towards Deductible', action: 'Bill patient or secondary insurance' },
  { code: 'EFT/CIP', name: 'Claim Paid via EFT/Direct Deposit', action: 'Verify EFT#, check if cashed, post payment' },
  { code: 'PTWA', name: 'Paid to Incorrect Address', action: 'Send corrected W9, escalate to supervisor' },
  { code: 'COD', name: 'Denied as Inclusive/Incidental', action: 'Add modifier (-59), resubmit claim' },
  { code: 'DUP', name: 'Denied as Duplicate', action: 'Find original claim, work that one instead' },
  { code: 'BILL PT', name: 'Claim Paid to Patient', action: 'Check AOB, transfer balance to patient' },
  { code: 'CNOF', name: 'Claim Not on File', action: 'Get fax#, rebill. Check clearinghouse first' },
  { code: 'CIP', name: 'Claim in Process', action: 'Follow TAT, set reminder, call back' },
  { code: 'ELIG', name: 'Denied for Eligibility', action: 'Get corrected ID, bill patient if no other insurance' },
  { code: 'PCP', name: 'Denied for Referral', action: 'Get PCP info, add to claim, refile' },
  { code: 'PRIEOB', name: 'Denied for Primary EOB', action: 'Attach primary EOB, rebill' },
  { code: 'NOAUTH', name: 'Denied for Prior Authorization', action: 'Try retro auth, update PCP info' },
  { code: 'MAXB', name: 'Max Benefit Exhausted', action: 'Check secondary insurance, bill patient' },
  { code: 'NCS(P)', name: 'Non-Covered Services - Patient', action: 'Bill secondary payer / patient' },
  { code: 'NCS(Pr)', name: 'Non-Covered Services - Provider', action: 'Escalate to Coding team' },
  { code: 'NMN', name: 'Not Medically Necessary', action: 'Appeal with medical records' },
  { code: 'PPMAX', name: 'Primary Paid Maximum', action: 'Bill coinsurance or write off' },
  { code: 'ADDLINFO', name: 'Additional Info Required (Provider)', action: 'Request docs from practice' },
  { code: 'PT-ADDL', name: 'Additional Info Required (Patient)', action: 'Request letter to patient' },
  { code: 'PNC', name: 'Provider Not Contracted', action: 'Verify NPI, escalate or write off' },
  { code: 'DTF', name: 'Denied - Timely Filing', action: 'Appeal with POTF evidence' },
  { code: 'OFFSET', name: 'Applied Towards Offset', action: 'Escalate to posting team' },
  { code: 'RPRICE', name: 'Sent for Re-Pricing', action: 'Call repricing agency directly' },
  { code: 'CAP', name: 'Applied Towards Capitation', action: 'Adjust as capitation' },
  { code: 'PPMAX2', name: 'Primary Paid Maximum (Secondary)', action: 'Bill patient coinsurance' }
];

scenarios.forEach((s, i) => {
  checkPage(arDoc, 50);
  arDoc.fontSize(9).fillColor(blue).text((i+1) + '. ' + s.code + ' - ' + s.name);
  arDoc.fillColor('#333').text('    Action: ' + s.action);
  arDoc.moveDown(0.1);
});

checkPage(arDoc, 120);
subSection(arDoc, 'Module 6: Questions to Ask Insurance (by Scenario Type)');
arDoc.fillColor('#333').fontSize(9);

arDoc.fillColor(gold).text('DED - Deductible:');
arDoc.fillColor('#333');
bullet(arDoc, 'What is the processed date and claim #?');
bullet(arDoc, 'How much was allowed and applied towards deductible?');
bullet(arDoc, 'Was it processed in-network or out of network?');
bullet(arDoc, 'Do you find any other insurance for this patient?');
bullet(arDoc, 'Could you fax/mail me a copy of the EOB?');

checkPage(arDoc, 60);
arDoc.fillColor(gold).text('CNOF - Claim Not on File:');
arDoc.fillColor('#333');
bullet(arDoc, 'Do you have any Clearinghouse rejections at your end?');
bullet(arDoc, 'May I have the claims mailing address and Payer id?');
bullet(arDoc, 'Is the patient eligible for the DOS?');
bullet(arDoc, 'May I have the fax # so I can fax this claim?');
bullet(arDoc, 'May I have the filing limit for this claim?');

checkPage(arDoc, 60);
arDoc.fillColor(gold).text('NOAUTH - No Prior Authorization:');
arDoc.fillColor('#333');
bullet(arDoc, 'Which service requires authorization and why?');
bullet(arDoc, 'Can we appeal with Medical Records for retro authorization?');
bullet(arDoc, 'What is the time limit for appeal?');
bullet(arDoc, 'Could you give me the fax number/mailing address?');

checkPage(arDoc, 60);
arDoc.fillColor(gold).text('NCS - Non-Covered Services:');
arDoc.fillColor('#333');
bullet(arDoc, 'Could you tell me the services that are not covered under this plan?');
bullet(arDoc, 'Can we appeal with medical records?');
bullet(arDoc, 'Do you find any other insurance for this patient?');

checkPage(arDoc, 60);
arDoc.fillColor(gold).text('DTF - Denied Timely Filing:');
arDoc.fillColor('#333');
bullet(arDoc, 'May I have the date when the claim was received?');
bullet(arDoc, 'May I have the filing limit for this claim?');
bullet(arDoc, 'Do you accept electronic receipts as proof of timely filing?');
bullet(arDoc, 'What is the appealing limit and fax #?');

checkPage(arDoc, 120);
subSection(arDoc, 'Module 7: Common Denial Codes');
arDoc.fontSize(9);
const denialCodes = [
  ['CO-4', 'Procedure Code Issue', 'Check for duplicate/bundled codes'],
  ['CO-16', 'Missing Claim Info', 'Add missing diagnosis/referral'],
  ['CO-23', 'Exceeds Authorization Amount', 'Adjust to auth amount or appeal'],
  ['CO-29', 'Filing Deadline Passed', 'Appeal with valid reason'],
  ['CO-109', 'Provider Not in Network', 'Verify network status or balance bill'],
  ['CO-197', 'No Prior Authorization', 'Get auth retroactively or appeal'],
  ['PR-1', 'Patient Deductible', 'Bill patient for deductible'],
  ['PR-2', 'Patient Coinsurance', 'Bill patient for 20%'],
  ['PR-3', 'Patient Copay', 'Bill patient for copay amount']
];

denialCodes.forEach(d => {
  checkPage(arDoc, 30);
  arDoc.fillColor(blue).text(d[0] + ' - ' + d[1]);
  arDoc.fillColor('#333').text('    Fix: ' + d[2]);
  arDoc.moveDown(0.1);
});

checkPage(arDoc, 120);
subSection(arDoc, 'Module 8: Golden Rules of AR Calling');
arDoc.fillColor('#333');
bullet(arDoc, '1. Always ask for the EOB in every denial call');
bullet(arDoc, '2. Always get a reference number before hanging up');
bullet(arDoc, '3. Always document the call details');
bullet(arDoc, '4. Always check for secondary insurance before billing the patient');
bullet(arDoc, '5. Always verify NPI before calling');
bullet(arDoc, '6. Always check clearinghouse for rejections first');
bullet(arDoc, '7. Rendering Provider = who saw the patient');
bullet(arDoc, '8. Referring Provider = PCP who referred them');
bullet(arDoc, '9. Billing Provider = who gets paid');

checkPage(arDoc, 120);
subSection(arDoc, 'Module 9: Master Glossary');
const glossary = [
  ['AR', 'Accounts Receivable'], ['PCP', 'Primary Care Physician'], ['NPI', 'National Provider Identifier'],
  ['EOB', 'Explanation of Benefits'], ['ERA', 'Electronic Remittance Advice (EDI 835)'],
  ['EFT', 'Electronic Funds Transfer'], ['EDI 837', 'Electronic claim submission format'],
  ['CMS-1500', 'Professional services claim form'], ['ICD-10', 'Diagnosis codes'],
  ['CPT', 'Procedure codes'], ['DOS', 'Date of Service'], ['TAT', 'Turn Around Time'],
  ['COB', 'Coordination of Benefits'], ['AOB', 'Assignment of Benefits'],
  ['LCD', 'Local Coverage Determination'], ['NCD', 'National Coverage Determination'],
  ['W9', 'IRS tax form for provider payment'], ['POTF', 'Proof of Timely Filing'],
  ['Capitation', 'Per-member-per-month payment model']
];
glossary.forEach(g => {
  checkPage(arDoc, 20);
  arDoc.fillColor(blue).text(g[0] + ': ', { continued: true }).fillColor('#333').text(g[1]);
});

arDoc.moveDown(2);
arDoc.fontSize(10).fillColor(blue).text('Provision AR Training Center', { align: 'center' });
arDoc.fillColor(gray).text('Boduppal, Dwarakha Nagar, Hyderabad | 7095-101-102 | 8309456545', { align: 'center' });
arDoc.fillColor(gold).text('Good luck with your AR Calling career!', { align: 'center' });
arDoc.end();

// ========== MEDICAL BILLING TRAINING PDF ==========
console.log('Creating Medical Billing Training PDF...');
const mbDoc = new PDFDocument({ size: 'A4', margin: 40 });
mbDoc.pipe(fs.createWriteStream(path.join(deployDir, 'Medical_Billing_Training_Course.pdf')));

header(mbDoc, 'Medical Billing Training Course', 'Provision AR Training Center | Complete Course Content');
mbDoc.moveDown(1);

subSection(mbDoc, 'Module 1: What is Medical Billing?');
mbDoc.fontSize(9).text('Medical Billing is the process of submitting and following up on claims with health insurance companies to receive payment for services rendered by healthcare providers. It involves translating healthcare services into billing codes, creating claims, and ensuring proper reimbursement.');
mbDoc.moveDown(0.3);
mbDoc.text('Key Areas:', { continued: true }).fillColor(gold);
mbDoc.fillColor('#333');
bullet(mbDoc, 'Charge Entry - Entering patient charges with correct CPT and ICD-10 codes');
bullet(mbDoc, 'Claim Submission - Creating and sending claims (EDI 837 or CMS-1500)');
bullet(mbDoc, 'Payment Posting - Applying insurance payments and patient payments to accounts');
bullet(mbDoc, 'Denial Management - Identifying, investigating, and resolving claim denials');
bullet(mbDoc, 'AR Follow-up - Tracking unpaid claims and collecting revenue');

checkPage(mbDoc);
subSection(mbDoc, 'Module 2: Medical Billing Process Flow');
bullet(mbDoc, '1. Patient Registration - Collect demographics, insurance info, copy of card');
bullet(mbDoc, '2. Insurance Verification - Verify eligibility, benefits, copay, deductible');
bullet(mbDoc, '3. Pre-Authorization - Get approval for procedures requiring prior auth');
bullet(mbDoc, '4. Patient Visit - Doctor provides services, documents in EHR');
bullet(mbDoc, '5. Medical Coding - Assign ICD-10 (diagnosis) + CPT (procedure) codes');
bullet(mbDoc, '6. Charge Entry - Enter charges into billing system');
bullet(mbDoc, '7. Claim Scrubbing - Auto validation checks for errors');
bullet(mbDoc, '8. Claim Submission - Submit electronically via clearinghouse');
bullet(mbDoc, '9. Payment Posting - Post ERA/835 payments from insurance');
bullet(mbDoc, '10. Patient Billing - Bill patient for remaining balance');
bullet(mbDoc, '11. Follow-up - AR calling for unpaid claims');

checkPage(mbDoc);
subSection(mbDoc, 'Module 3: Key Billing Codes');
mbDoc.fillColor(blue).text('ICD-10 Codes (Diagnosis):');
mbDoc.fillColor('#333');
bullet(mbDoc, 'R07.9 - Chest Pain');
bullet(mbDoc, 'E11.9 - Type 2 Diabetes Mellitus');
bullet(mbDoc, 'I10 - Essential Hypertension');
bullet(mbDoc, 'J06.9 - Upper Respiratory Infection');
bullet(mbDoc, 'M54.5 - Low Back Pain');
bullet(mbDoc, 'F32.9 - Major Depressive Disorder');
mbDoc.moveDown(0.3);
mbDoc.fillColor(blue).text('CPT Codes (Procedures):');
mbDoc.fillColor('#333');
bullet(mbDoc, '99213 - Office Visit (Level 3)');
bullet(mbDoc, '99214 - Office Visit (Level 4)');
bullet(mbDoc, '99215 - Office Visit (Level 5)');
bullet(mbDoc, '99385 - Preventive Visit (New Patient)');
bullet(mbDoc, '85025 - Complete Blood Count');
bullet(mbDoc, '80053 - Metabolic Panel');
bullet(mbDoc, '93000 - ECG (12-Lead)');

checkPage(mbDoc);
subSection(mbDoc, 'Module 4: CMS-1500 Form Fields');
mbDoc.text('The CMS-1500 is the standard claim form for professional services:');
bullet(mbDoc, 'Box 1: Type of Insurance (Medicare, Medicaid, BCBS, etc.)');
bullet(mbDoc, 'Box 1a: Insured ID Number');
bullet(mbDoc, 'Box 2-6: Patient Name, DOB, Gender, Address');
bullet(mbDoc, 'Box 8: Patient Status (Single, Married, Other)');
bullet(mbDoc, 'Box 9: Other Insured Name (if secondary)');
bullet(mbDoc, 'Box 11: Insured Policy Group Number');
bullet(mbDoc, 'Box 12-13: Patient/Insured Signature');
bullet(mbDoc, 'Box 14: Date of Illness/Injury');
bullet(mbDoc, 'Box 21: Diagnosis Codes (ICD-10)');
bullet(mbDoc, 'Box 24: CPT Codes, Units, charges, Days');
bullet(mbDoc, 'Box 25: Tax ID Number');
bullet(mbDoc, 'Box 31: Rendering Provider Signature');
bullet(mbDoc, 'Box 33: Billing Provider Info + NPI');

checkPage(mbDoc, 120);
subSection(mbDoc, 'Module 5: Insurance Types');
mbDoc.fillColor(blue).text('Government Insurance:');
mbDoc.fillColor('#333');
bullet(mbDoc, 'Medicare - Federal program for patients 65+ or disabled');
bullet(mbDoc, 'Medicaid - State program for low-income patients');
bullet(mbDoc, 'TRICARE - Military/veterans insurance');
bullet(mbDoc, 'VA Benefits - Veterans Affairs healthcare');
mbDoc.moveDown(0.3);
mbDoc.fillColor(blue).text('Private Insurance:');
mbDoc.fillColor('#333');
bullet(mbDoc, 'HMO (Health Maintenance Organization) - Need PCP referral for specialists');
bullet(mbDoc, 'PPO (Preferred Provider Organization) - More flexibility, higher cost');
bullet(mbDoc, 'EPO (Exclusive Provider Organization) - No referrals needed, in-network only');
bullet(mbDoc, 'POS (Point of Service) - Mix of HMO and PPO');
bullet(mbDoc, 'HDHP (High Deductible Health Plan) - Lower premiums, higher deductible');

checkPage(mbDoc, 120);
subSection(mbDoc, 'Module 6: Payment & Adjustment Types');
bullet(mbDoc, 'Billed Amount - Total amount charged by provider');
bullet(mbDoc, 'Allowed Amount - Maximum insurance will pay for the service');
bullet(mbDoc, 'Contractual Adjustment - Difference between billed and allowed (write-off)');
bullet(mbDoc, 'Copay - Fixed amount patient pays at visit ($20-$50)');
bullet(mbDoc, 'Coinsurance - Percentage patient pays (usually 20%)');
bullet(mbDoc, 'Deductible - Amount patient pays before insurance kicks in');
bullet(mbDoc, 'Patient Responsibility - Copay + Coinsurance + Deductible');
bullet(mbDoc, 'Payment Calculation: Billed $500 | Allowed $400 | Write-off $100 | Insurance $320 | Patient $80');

checkPage(mbDoc, 120);
subSection(mbDoc, 'Module 7: Claim Scrubbing Checks');
arDoc.text('Before submission, claims are auto-validated:');
bullet(mbDoc, 'Patient DOB correct');
bullet(mbDoc, 'Insurance ID verified');
bullet(mbDoc, 'NPI valid and active');
bullet(mbDoc, 'CPT/ICD codes match (procedure matches diagnosis)');
bullet(mbDoc, 'No duplicate charges');
bullet(mbDoc, 'Modifier present if needed');
bullet(mbDoc, 'Filing limit not exceeded');
bullet(mbDoc, 'Provider is credentialed');

checkPage(mbDoc, 120);
subSection(mbDoc, 'Module 8: Common Denial Reasons & Fixes');
const mbDenials = [
  ['CO-4', 'Procedure Code Issue', 'Check for duplicate/bundled codes, add modifier'],
  ['CO-16', 'Missing Claim Info', 'Add missing diagnosis, referral, or patient info'],
  ['CO-23', 'Exceeds Auth Amount', 'Adjust to authorized amount or appeal'],
  ['CO-29', 'Filing Deadline', 'Appeal with valid reason for late filing'],
  ['CO-109', 'Provider Not in Network', 'Verify network status, balance bill patient'],
  ['CO-197', 'No Prior Authorization', 'Get retro authorization or appeal'],
  ['PR-1', 'Patient Deductible', 'Bill patient for deductible amount'],
  ['PR-2', 'Patient Coinsurance', 'Bill patient for coinsurance percentage'],
  ['PR-3', 'Patient Copay', 'Bill patient for copay amount'],
  ['NCS', 'Non-Covered Services', 'Check other insurance, bill patient'],
  ['DUP', 'Duplicate Claim', 'Find and work the original claim'],
  ['DTF', 'Timely Filing', 'Appeal with proof of timely filing']
];
mbDenials.forEach(d => {
  checkPage(mbDoc, 30);
  mbDoc.fillColor(blue).text(d[0] + ' - ' + d[1]);
  mbDoc.fillColor('#333').text('    Fix: ' + d[2]);
  mbDoc.moveDown(0.1);
});

checkPage(mbDoc, 120);
subSection(mbDoc, 'Module 9: ERA/EOB Reading');
mbDoc.text('ERA (Electronic Remittance Advice) - Sent to Provider:');
bullet(mbDoc, 'EDI 835 format - electronic payment advice');
bullet(mbDoc, 'Contains: Claim#, Paid amount, Patient responsibility, Denial codes');
mbDoc.moveDown(0.2);
mbDoc.text('EOB (Explanation of Benefits) - Sent to Patient:');
bullet(ibDoc = mbDoc, 'Shows: What insurance paid, what patient owes, deductible remaining');
bullet(mbDoc, 'Sent by insurance company directly to patient');
mbDoc.moveDown(0.2);
mbDoc.text('Payment Posting from ERA:');
bullet(mbDoc, '1. Match claim# in system');
bullet(mbDoc, '2. Post insurance payment amount');
bullet(mbDoc, '3. Post contractual adjustment');
bullet(mbDoc, '4. Transfer patient responsibility');
bullet(mbDoc, '5. If denied - work the denial per AR calling process');

checkPage(mbDoc, 120);
subSection(mbDoc, 'Module 10: Medical Billing Key Terms');
const mbGlossary = [
  ['CMS-1500', 'Standard claim form for professional services'],
  ['EDI 837', 'Electronic Data Interchange claim format'],
  ['EDI 835', 'Electronic Remittance Advice (ERA)'],
  ['Clean Claim', 'Claim with no errors, ready for processing'],
  ['Scrubs', 'Auto-validation checks before submission'],
  ['Clearinghouse', 'Middleman that forwards claims to insurance'],
  ['Remittance', 'Payment + explanation from insurance'],
  ['Contractual Adjustment', 'Difference between billed and allowed amount'],
  ['Coordination of Benefits', 'Determines which insurance pays first'],
  ['Balance Billing', 'Billing patient for amount above allowed'],
  ['Credentialing', 'Process of becoming an approved insurance provider'],
  ['Re-pricing', 'Third-party recalculating the allowed amount'],
  ['Capitation', 'Provider gets paid per patient per month, not per visit']
];
mbGlossary.forEach(g => {
  checkPage(mbDoc, 20);
  mbDoc.fillColor(blue).text(g[0] + ': ', { continued: true }).fillColor('#333').text(g[1]);
});

mbDoc.moveDown(2);
mbDoc.fontSize(10).fillColor(blue).text('Provision AR Training Center', { align: 'center' });
mbDoc.fillColor(gray).text('Boduppal, Dwarakha Nagar, Hyderabad | 7095-101-102 | 8309456545', { align: 'center' });
mbDoc.fillColor(gold).text('Good luck with your Medical Billing career!', { align: 'center' });
mbDoc.end();

console.log('PDFs created successfully!');
console.log('AR Calling: deploy/AR_Calling_Training_Course.pdf');
console.log('Medical Billing: deploy/Medical_Billing_Training_Course.pdf');
