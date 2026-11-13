import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detect as contradictions } from '../src/reconcile/contradictions.js';
import { detect as gaps } from '../src/reconcile/gaps.js';
import { fingerprintOf, uniqueFlags } from '../src/reconcile/flagStore.js';

let n = 0;
const c = (overrides) => ({
	id: `c${++n}`,
	document_id: 'doc-a',
	subject: 'patient',
	assertion: 'present',
	category: 'condition',
	name: 'Hypertension',
	name_normalised: 'hypertension',
	dose: null,
	value: null,
	unit: null,
	normalised: {},
	event_date: null,
	document_date: '2024-01-10',
	...overrides,
});

describe('contradictions (8.6)', () => {
	test('a specific allergy vs a later "no known drug allergies" statement', () => {
		const flags = contradictions({
			claims: [
				c({ category: 'allergy', name: 'Penicillin', name_normalised: 'penicillin', document_id: 'doc-a' }),
				c({ category: 'allergy', name: 'any drug, general statement', name_normalised: 'any drug, general statement', assertion: 'absent', document_id: 'doc-b' }),
			],
		});
		assert.equal(flags.length, 1);
		assert.equal(flags[0].type, 'contradiction');
		assert.match(flags[0].message, /Penicillin.*Records disagree, needs review/);
		assert.deepEqual(flags[0].documentIds.sort(), ['doc-a', 'doc-b']);
	});

	test('the same condition recorded as present and as absent', () => {
		const flags = contradictions({ claims: [c({}), c({ assertion: 'absent', document_id: 'doc-b' })] });
		assert.equal(flags.length, 1);
	});

	test('two different doses for one medicine on the same date; same dose is fine', () => {
		const med = (dose, extra = {}) => c({ category: 'medication', name: 'Metformin', name_normalised: 'metformin', dose, event_date: '2024-01-10', ...extra });
		assert.equal(contradictions({ claims: [med('500 mg'), med('1000 mg', { document_id: 'doc-b' })] }).length, 1);
		assert.equal(contradictions({ claims: [med('500 mg'), med('500 mg', { document_id: 'doc-b' })] }).length, 0);
		// Different dates are a dose change, not a contradiction.
		assert.equal(contradictions({ claims: [med('500 mg'), med('1000 mg', { event_date: '2024-03-01' })] }).length, 0);
	});

	test('different results for the same test on the same date', () => {
		const lab = (value) => c({ category: 'investigation', name: 'HbA1c', name_normalised: 'hba1c', value, unit: '%', event_date: '2024-01-10' });
		assert.equal(contradictions({ claims: [lab('7.1'), lab('7.8')] }).length, 1);
	});

	test('possible and family findings are never contradictions', () => {
		assert.equal(contradictions({ claims: [c({ assertion: 'possible' }), c({ assertion: 'absent' })] }).length, 0);
		assert.equal(contradictions({ claims: [c({ subject: 'family' }), c({ assertion: 'absent' })] }).length, 0);
	});
});

describe('gaps (8.6)', () => {
	test('a medicine without a dose and a numeric result without a unit', () => {
		const flags = gaps({
			claims: [
				c({ category: 'medication', name: 'Pantoprazole', name_normalised: 'pantoprazole' }),
				c({ category: 'investigation', name: 'Creatinine', value: '0.9', ref_range: '0.7-1.3' }),
				c({ category: 'investigation', name: 'Chest X-ray', value: 'clear' }), // not numeric: no unit expected
			],
		});
		assert.deepEqual(flags.map((f) => f.type), ['missing_field', 'missing_field']);
		assert.match(flags[0].message, /Information missing/);
	});

	test('undated and ambiguously dated documents', () => {
		const flags = gaps({
			claims: [c({ document_id: 'd1' }), c({ document_id: 'd2' })],
			documents: [
				{ id: 'd1', original_filename: 'lab.pdf', document_date: null, document_date_text: '04/05/2021', document_date_alternatives: ['2021-05-04', '2021-04-05'] },
				{ id: 'd2', original_filename: 'note.pdf', document_date: null, document_date_text: null, document_date_alternatives: null },
			],
		});
		assert.deepEqual(flags.map((f) => f.type), ['ambiguous_date', 'missing_field']);
		assert.match(flags[0].message, /2021-05-04 or 2021-04-05/);
	});

	test('medication-history flags are carried over with their findings', () => {
		const claim = c({ id: 'm1', category: 'medication', dose: '500 mg' });
		const flags = gaps({ claims: [claim], histories: [{ drug: 'x', flags: [{ type: 'stale_medication', message: 'stale', claimIds: ['m1'] }] }] });
		assert.equal(flags[0].type, 'stale_medication');
		assert.deepEqual(flags[0].findingIds, ['m1']);
	});
});

describe('flag identity', () => {
	test('the fingerprint ignores order, so the same problem keeps the same row', () => {
		const a = { type: 'contradiction', findingIds: ['x', 'y'], documentIds: ['d1', 'd2'] };
		const b = { type: 'contradiction', findingIds: ['y', 'x'], documentIds: ['d2', 'd1'] };
		assert.equal(fingerprintOf(a), fingerprintOf(b));
		assert.equal(uniqueFlags([a, b]).length, 1);
		assert.notEqual(fingerprintOf(a), fingerprintOf({ ...a, type: 'duplicate' }));
	});
});
