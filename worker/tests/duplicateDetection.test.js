import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../src/reconcile/duplicates.js';

const lab = (doc, value = '126', extra = {}) => ({
	id: `${doc}-${value}`,
	document_id: doc,
	subject: 'patient',
	assertion: 'present',
	category: 'investigation',
	name: 'Fasting glucose',
	name_normalised: 'fasting glucose',
	value,
	unit: 'mg/dL',
	normalised: {},
	event_date: '2024-01-08',
	document_date: '2024-01-08',
	...extra,
});

test('the same result on the same date in two documents is a possible duplicate', () => {
	const flags = detect({ claims: [lab('metropolis'), lab('thyrocare')] });
	assert.equal(flags.length, 1);
	assert.equal(flags[0].type, 'duplicate');
	assert.match(flags[0].message, /Possible duplicate: Fasting glucose 126 mg\/dL on 8 Jan 2024 appears in two documents/);
	assert.deepEqual(flags[0].documentIds.sort(), ['metropolis', 'thyrocare']);
});

test('not a duplicate: same document, different value, different date, or undated', () => {
	assert.equal(detect({ claims: [lab('a'), { ...lab('a'), id: 'other' }] }).length, 0);
	assert.equal(detect({ claims: [lab('a'), lab('b', '131')] }).length, 0);
	assert.equal(detect({ claims: [lab('a'), lab('b', '126', { event_date: '2024-02-01', document_date: '2024-02-01' })] }).length, 0);
	assert.equal(detect({ claims: [lab('a', '126', { event_date: null, document_date: null }), lab('b', '126', { event_date: null, document_date: null })] }).length, 0);
});

test('the same dose of a medicine on the same date in two documents', () => {
	const med = (doc) => ({ ...lab(doc), category: 'medication', name: 'Metformin', name_normalised: 'metformin', value: null, unit: null, dose: '500 mg' });
	assert.equal(detect({ claims: [med('rx1'), med('rx2')] })[0].type, 'duplicate');
});
