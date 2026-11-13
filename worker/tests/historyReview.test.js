import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detect as contradictions } from '../src/reconcile/contradictions.js';
import { detect as duplicates } from '../src/reconcile/duplicates.js';
import { detect as gaps } from '../src/reconcile/gaps.js';
import { detect as reliability, outsideRange, parseRange } from '../src/reconcile/reliability.js';
import { agreedDateOfBirth, collectDetails, detect as patientDetails } from '../src/reconcile/patientDetails.js';

let n = 0;
const c = (overrides) => ({
	id: `h${++n}`,
	document_id: 'doc-a',
	document_name: 'a.pdf',
	subject: 'patient',
	assertion: 'present',
	category: 'condition',
	name: 'Hypertension',
	name_normalised: 'hypertension',
	dose: null,
	value: null,
	unit: null,
	ref_range: null,
	quote: null,
	normalised: {},
	event_date: null,
	document_date: '2024-01-10',
	source_type: 'ai_extracted',
	verification_status: 'unverified',
	...overrides,
});
const lab = (overrides) => c({ category: 'investigation', name: 'HbA1c', name_normalised: 'hba1c', value: '7.1', unit: '%', ref_range: '4.0 - 5.6', ...overrides });

const header = (name, dob, sex, extra = '') => `CITY HOSPITAL\nPATIENT NAME ${name} TEST PATIENT ID X-1\nDATE OF\nBIRTH \n${dob} SEX ${sex}\n${extra}\nReport body text`;
const doc = (id, date = '2024-01-10', type = 'lab_report') => ({ id, original_filename: `${id}.pdf`, document_date: date, document_type: type });
const page = (documentId, text, pageNumber = 1) => ({ document_id: documentId, page_number: pageNumber, page_text: text });

describe('contradictions beyond medicines', () => {
	test('a procedure documented and later denied names both records and the order', () => {
		const flags = contradictions({
			claims: [
				c({ category: 'event', name: 'Appendicectomy', name_normalised: 'appendicectomy', document_name: 'old.pdf', document_date: '2015-03-01' }),
				c({ category: 'event', name: 'Appendicectomy', name_normalised: 'appendicectomy', assertion: 'absent', document_id: 'doc-b', document_name: 'new.pdf', document_date: '2023-06-01' }),
			],
		});
		assert.equal(flags.length, 1);
		assert.match(flags[0].message, /old\.pdf.*new\.pdf.*A later record \(1 Jun 2023\) conflicts with the earlier one \(1 Mar 2015\)/);
		assert.ok(flags[0].reason);
	});

	test('different blood groups are a contradiction; the same group written differently is not', () => {
		const bg = (value, id) => c({ category: 'investigation', name: 'Blood group', name_normalised: 'blood group', value, document_id: id });
		assert.equal(contradictions({ claims: [bg('B Positive', 'd1'), bg('O +ve', 'd2')] }).length, 1);
		assert.equal(contradictions({ claims: [bg('B Positive', 'd1'), bg('B +ve', 'd2')] }).length, 0);
	});
});

describe('results and findings needing verification', () => {
	test('reference ranges are read only when simple', () => {
		assert.deepEqual(parseRange('4.0 - 5.6'), { low: 4, high: 5.6, lowStrict: false, highStrict: false });
		assert.equal(outsideRange(7.1, parseRange('4.0 - 5.6')), true);
		assert.equal(outsideRange(5.6, parseRange('4.0 - 5.6')), false);
		assert.equal(outsideRange(200, parseRange('< 200')), true);
		assert.equal(parseRange('Normal: <5.7, Prediabetes: 5.7-6.4, Diabetes: >=6.5'), null);
	});

	test('a result outside the report’s own range, or marked by the report, needs verification', () => {
		const flags = reliability({ claims: [lab({}), lab({ id: 'x', name: 'Glucose', name_normalised: 'glucose', value: '98 H', ref_range: null, unit: 'mg/dL' }), lab({ value: '5.0' })] });
		const needs = flags.filter((f) => f.type === 'needs_verification');
		assert.equal(needs.length, 2);
		assert.match(needs[0].message, /outside the reference range printed on the report \(4\.0 - 5\.6\)/);
		assert.match(needs[1].message, /marked “H” by the report/);
		assert.match(needs[0].reason, /not interpreted/);
	});

	test('one test in different units is an inconsistency (never converted)', () => {
		const flags = reliability({ claims: [lab({ ref_range: null }), lab({ value: '54', unit: 'mmol/mol', ref_range: null, document_id: 'doc-b' })] });
		assert.equal(flags.filter((f) => f.type === 'inconsistent_detail').length, 1);
	});

	test('a suspected finding is unverified until another record settles it', () => {
		const suspected = c({ name: 'Tuberculosis', name_normalised: 'tuberculosis', assertion: 'possible', document_date: '2023-01-01' });
		assert.equal(reliability({ claims: [suspected] }).filter((f) => f.type === 'unverified_finding').length, 1);
		const ruledOut = c({ name: 'Tuberculosis', name_normalised: 'tuberculosis', assertion: 'absent', document_date: '2023-02-01', document_id: 'doc-b' });
		assert.equal(reliability({ claims: [suspected, ruledOut] }).filter((f) => f.type === 'unverified_finding').length, 0);
		// "?" in the source wording also counts as suspected.
		const query = c({ name: 'Asthma', name_normalised: 'asthma', quote: 'Impression: ? Asthma' });
		assert.equal(reliability({ claims: [query] }).filter((f) => f.type === 'unverified_finding').length, 1);
	});

	test('a patient edit no doctor verified is unverified; once verified it is not', () => {
		const edited = c({ source_type: 'patient_corrected' });
		assert.equal(reliability({ claims: [edited] }).filter((f) => f.type === 'unverified_finding').length, 1);
		assert.equal(reliability({ claims: [{ ...edited, verification_status: 'doctor_verified' }] }).length, 0);
	});

	test('dates that cannot be right', () => {
		const flags = reliability({
			claims: [lab({ ref_range: null, event_date: '2024-02-01', document_date: '2024-01-10' })],
			documents: [doc('future', '2099-01-01')],
			today: '2026-01-01',
		});
		assert.equal(flags.filter((f) => f.type === 'inconsistent_detail').length, 2);
		const beforeBirth = reliability({ claims: [c({ event_date: '1970-01-01' })], dateOfBirth: '1980-06-14' });
		assert.match(beforeBirth[0].message, /before the patient’s documented date of birth/);
	});

	test('medicines are left to the medication rules', () => {
		assert.equal(reliability({ claims: [c({ category: 'medication', assertion: 'possible', name: 'Metformin', name_normalised: 'metformin' })] }).length, 0);
	});
});

describe('duplicates beyond medicines', () => {
	test('the same document uploaded twice is one flag, and its findings are not flagged again', () => {
		const text = header('Rahul Sharma', '14 June 1980', 'Male', 'HbA1c 7.1 %');
		const documents = [doc('d1'), doc('d2')];
		const pages = [page('d1', text), page('d2', text)];
		const claims = [lab({ document_id: 'd1', event_date: '2024-01-10' }), lab({ document_id: 'd2', event_date: '2024-01-10' })];
		const flags = duplicates({ claims, documents, pages });
		assert.equal(flags.length, 1);
		assert.match(flags[0].message, /exactly the same text/);
		assert.deepEqual(flags[0].documentIds.sort(), ['d1', 'd2']);
		assert.equal(flags[0].evidence.length, 2);
	});

	test('the same diagnosis on the same date in two documents is a possible duplicate', () => {
		const flags = duplicates({ claims: [c({ document_id: 'd1' }), c({ document_id: 'd2' })] });
		assert.equal(flags.length, 1);
		// On different dates it is the condition documented again, not a duplicate.
		assert.equal(duplicates({ claims: [c({ document_id: 'd1' }), c({ document_id: 'd2', document_date: '2024-05-01' })] }).length, 0);
	});
});

describe('missing information beyond medicines', () => {
	test('a numeric lab result without a reference range; vital signs are exempt', () => {
		const flags = gaps({ claims: [lab({ ref_range: null }), c({ category: 'investigation', name: 'Blood pressure', name_normalised: 'blood pressure', value: '120', unit: 'mmHg' })] });
		assert.equal(flags.length, 1);
		assert.match(flags[0].message, /HbA1c 7\.1 % in a\.pdf \(10 Jan 2024\) has no reference range/);
	});

	test('a requested test with no later result; a later result clears it', () => {
		const requested = c({ category: 'investigation', name: 'Lipid profile', name_normalised: 'lipid profile', quote: 'Repeat lipid profile requested in three months.' });
		assert.equal(gaps({ claims: [requested] }).length, 1);
		const result = c({ category: 'investigation', name: 'Lipid profile', name_normalised: 'lipid profile', value: '180', unit: 'mg/dL', ref_range: '< 200', document_date: '2024-04-10' });
		assert.equal(gaps({ claims: [requested, result] }).length, 0);
	});
});

describe('patient details across documents', () => {
	const documents = [doc('d1', '2022-11-18'), doc('d2', '2024-08-12')];

	test('matching details raise nothing', () => {
		const pages = [page('d1', header('Rahul Sharma', '14 June 1980', 'Male')), page('d2', header('RAHUL SHARMA', '14/06/1980', 'M'))];
		assert.equal(patientDetails({ documents, pages, registeredName: 'Rahul Sharma' }).length, 0);
		assert.equal(agreedDateOfBirth(collectDetails(pages)), '1980-06-14');
	});

	test('a different name, date of birth and sex are each flagged with page evidence', () => {
		const pages = [page('d1', header('Rahul Sharma', '14 June 1980', 'Male')), page('d2', header('Priya Nair', '02 March 1975', 'Female'))];
		const flags = patientDetails({ documents, pages, registeredName: 'Rahul Sharma' });
		assert.equal(flags.length, 3);
		assert.ok(flags.every((f) => f.type === 'inconsistent_detail' && f.reason && f.evidence.length));
		assert.match(flags[0].message, /“Priya Nair”.*does not match the name on this account/);
		const ev = flags[0].evidence[0];
		assert.equal(pages[1].page_text.slice(ev.quoteStart, ev.quoteEnd), ev.quote);
	});

	test('an age that does not fit the date of birth is flagged', () => {
		const pages = [page('d1', 'Patient: Rahul Sharma\nDOB: 14 June 1980\nAge: 30 years')];
		const flags = patientDetails({ documents: [doc('d1', '2022-11-18')], pages, registeredName: 'Rahul Sharma' });
		assert.equal(flags.length, 1);
		assert.match(flags[0].message, /age as 30.*would have been 42/);
	});

	test('a document with no patient name is missing information, not a match', () => {
		const flags = patientDetails({ documents: [doc('d1')], pages: [page('d1', 'Lab report\nHbA1c 7.1 %')], registeredName: 'Rahul Sharma' });
		assert.equal(flags.length, 1);
		assert.equal(flags[0].type, 'missing_field');
	});
});

test('no flag assigns severity (major, critical, emergency, severe)', () => {
	const all = [
		...contradictions({ claims: [c({ name: 'Myocardial infarction', name_normalised: 'mi' }), c({ name: 'Myocardial infarction', name_normalised: 'mi', assertion: 'absent', document_id: 'doc-b' })] }),
		...reliability({ claims: [lab({}), c({ assertion: 'possible' })] }),
		...gaps({ claims: [lab({ ref_range: null })] }),
	];
	assert.ok(all.length > 0);
	for (const f of all) assert.doesNotMatch(`${f.message} ${f.reason ?? ''}`, /\b(major|critical|emergency|severe|serious)\b/i);
});
