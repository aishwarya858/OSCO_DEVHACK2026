/**
 * Findings that need verification before they are relied on (MVP document 8.6).
 * Medicines are covered by the medication history rules and are left out here.
 *
 *  needs_verification
 *    - a result outside the reference range printed on the same report, or
 *      marked high/low/abnormal by the report itself. Reported exactly as
 *      written; nothing is interpreted and no severity is assigned.
 *  unverified_finding
 *    - a finding documented as possible / suspected / provisional / "?" that no
 *      other record confirms or rules out
 *    - a finding changed from the document's wording that no doctor verified
 *  inconsistent_detail
 *    - one test recorded in different units (values are never converted)
 *    - dates that cannot be right: a document dated in the future, a result or
 *      diagnosis dated after the document recording it, anything dated before
 *      the date of birth the documents agree on
 */
import { dateOf, flag, formatDate, groupBy, patientFindings, sourceOf, toIsoDate, valueText } from './shared.js';

const NUMBER = /^\s*(-?\d+(?:\.\d+)?)\s*(?:\*|\(?\s*(h|l|high|low|abnormal|abn)\s*\)?)?\s*$/i;
const MARKER = /(?:\*|\b(?:h|l|high|low|abnormal|abn)\b)\s*\)?\s*$/i;
const UNCERTAIN_NAME = /\?|\b(?:suspected|suspicion of|probable|probably|likely|query|provisional|rule out|r\/o|cannot be ruled out|differential|tentative|possible)\b/i;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The printed reference range as numbers. Only simple ranges are read
 * ("4.0 - 5.6", "< 200", ">= 40", "up to 35"); anything with several bands is skipped.
 */
export const parseRange = (text) => {
	if (!text) return null;
	const t = String(text).toLowerCase().replace(/,/g, '');
	if ((t.match(/\d+(?:\.\d+)?/g) ?? []).length > 2 || /:/.test(t)) return null;
	let m;
	if ((m = t.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/))) return { low: Number(m[1]), high: Number(m[2]), lowStrict: false, highStrict: false };
	if ((m = t.match(/(?:<=|≤|up ?to|upto|max(?:imum)?)\s*(\d+(?:\.\d+)?)/))) return { low: null, high: Number(m[1]), highStrict: false };
	if ((m = t.match(/(?:<|less than|below)\s*(\d+(?:\.\d+)?)/))) return { low: null, high: Number(m[1]), highStrict: true };
	if ((m = t.match(/(?:>=|≥|min(?:imum)?)\s*(\d+(?:\.\d+)?)/))) return { low: Number(m[1]), high: null, lowStrict: false };
	if ((m = t.match(/(?:>|more than|above|greater than)\s*(\d+(?:\.\d+)?)/))) return { low: Number(m[1]), high: null, lowStrict: true };
	return null;
};

/** Is `value` outside `range`? null when it cannot be decided from the text. */
export const outsideRange = (value, range) => {
	if (!range) return null;
	if (range.low != null && (range.lowStrict ? value <= range.low : value < range.low)) return true;
	if (range.high != null && (range.highStrict ? value >= range.high : value > range.high)) return true;
	return false;
};

const unitKey = (unit) => (unit ?? '').toString().normalize('NFKC').toLowerCase().replace(/\s+/g, '').replace(/μ/g, 'µ');

/**
 * @param {{ claims: object[], documents?: { id, original_filename, document_date }[], dateOfBirth?: string | null, today?: string }} input
 */
export const detect = ({ claims, documents = [], dateOfBirth = null, today = new Date().toISOString().slice(0, 10) }) => {
	const findings = patientFindings(claims).filter((c) => c.category !== 'medication');
	const flags = [];

	// --- Results outside the report's own range, or marked abnormal by the report.
	for (const c of findings.filter((f) => f.category === 'investigation' && f.value && f.assertion !== 'absent')) {
		const m = NUMBER.exec(c.value);
		if (!m) continue;
		const value = Number(m[1]);
		const outside = outsideRange(value, parseRange(c.ref_range));
		const marked = MARKER.test(c.value);
		if (!outside && !marked) continue;
		const why = [
			outside ? `outside the reference range printed on the report (${c.ref_range})` : null,
			marked ? `marked “${c.value.match(MARKER)[0].trim()}” by the report` : null,
		].filter(Boolean);
		flags.push(
			flag('needs_verification', `${c.name} ${valueText(c)} in ${sourceOf(c)} is ${why.join(' and ')}.`, [c], [], {
				reason: 'Shown exactly as the report wrote it; it is not interpreted here. Confirm the value against the original and have a clinician review it.',
			}),
		);
	}

	// --- One test recorded in different units.
	const withUnits = findings.filter((f) => f.category === 'investigation' && f.value && f.unit && NUMBER.test(f.value));
	for (const group of groupBy(withUnits, (c) => c.name_normalised).values()) {
		const byUnit = groupBy(group, (c) => unitKey(c.unit));
		if (byUnit.size < 2) continue;
		const firsts = [...byUnit.values()].map((g) => g[0]);
		flags.push(
			flag(
				'inconsistent_detail',
				`${group[0].name} is recorded in different units: ${firsts.map((c) => `${valueText(c)} in ${sourceOf(c)}`).join('; ')}.`,
				[...byUnit.values()].flat(),
				[],
				{ reason: 'Results in different units cannot be compared directly, and they have not been converted. Check the units before comparing results over time.' },
			),
		);
	}

	// --- Suspected / possible findings that no other record confirms or rules out.
	const byName = groupBy(findings, (c) => `${c.category}:${c.name_normalised}`);
	for (const c of findings) {
		const tentative = c.assertion === 'possible' || UNCERTAIN_NAME.test(c.name) || (c.quote && new RegExp(`(?:\\?|suspected|query|provisional|r/o|rule out)\\s*(?:of\\s*)?${escapeRe(c.name)}`, 'i').test(c.quote));
		if (!tentative) continue;
		const settled = (byName.get(`${c.category}:${c.name_normalised}`) ?? []).some(
			(other) => other.id !== c.id && other.assertion !== 'possible' && !UNCERTAIN_NAME.test(other.name) && (!dateOf(c) || !dateOf(other) || dateOf(other) >= dateOf(c)),
		);
		if (settled) continue;
		flags.push(
			flag('unverified_finding', `${c.name} is documented as possible or suspected, not confirmed, in ${sourceOf(c)}.`, [c], [], {
				reason: 'No later record confirms or rules it out. Treat it as unconfirmed until a clinician verifies it.',
			}),
		);
	}

	// --- Changed from the document's wording and not verified by a doctor.
	for (const c of findings.filter((f) => f.source_type === 'patient_corrected' && f.verification_status !== 'doctor_verified')) {
		flags.push(
			flag('unverified_finding', `${c.name} was edited by the patient and now differs from what ${sourceOf(c)} says.`, [c], [], {
				reason: 'The edited version has not been checked by a doctor. Compare it with the original document.',
			}),
		);
	}

	// --- Dates that cannot be right.
	for (const doc of documents.filter((d) => d.document_date && toIsoDate(d.document_date) > today)) {
		flags.push(
			flag('inconsistent_detail', `${doc.original_filename} is dated ${formatDate(toIsoDate(doc.document_date))}, which is in the future.`, [], [doc.id], {
				reason: 'The date was probably misread or mistyped, so its findings may be placed at the wrong point in the history.',
			}),
		);
	}
	for (const c of findings.filter((f) => (f.category === 'condition' || f.category === 'investigation') && f.event_date && f.document_date && f.assertion !== 'possible')) {
		const event = toIsoDate(c.event_date);
		const docDate = toIsoDate(c.document_date);
		if (event && docDate && event > docDate) {
			flags.push(
				flag('inconsistent_detail', `${c.name} is dated ${formatDate(event)}, after the date of the document that records it (${c.document_name ?? 'record'}, ${formatDate(docDate)}).`, [c], [], {
					reason: 'A result or diagnosis cannot be recorded before it happens. One of the two dates is probably wrong.',
				}),
			);
		}
	}
	if (dateOfBirth) {
		for (const c of findings.filter((f) => f.event_date && toIsoDate(f.event_date) < dateOfBirth)) {
			flags.push(
				flag('inconsistent_detail', `${c.name} in ${sourceOf(c)} is dated before the patient’s documented date of birth (${formatDate(dateOfBirth)}).`, [c], [], {
					reason: 'A finding cannot predate the patient’s birth. The date, the date of birth, or the patient on the document is wrong.',
				}),
			);
		}
		for (const doc of documents.filter((d) => d.document_date && toIsoDate(d.document_date) < dateOfBirth)) {
			flags.push(
				flag('inconsistent_detail', `${doc.original_filename} is dated ${formatDate(toIsoDate(doc.document_date))}, before the documented date of birth (${formatDate(dateOfBirth)}).`, [], [doc.id], {
					reason: 'The document date or the date of birth is wrong, or the document belongs to someone else.',
				}),
			);
		}
	}

	return flags;
};
