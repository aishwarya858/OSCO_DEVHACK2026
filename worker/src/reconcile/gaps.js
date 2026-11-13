/**
 * Missing information (MVP document 8.6): gaps in what the records say.
 * Wording is "information missing", never an error and never advice.
 *
 *  - a medicine without a dose; a numeric lab result without a unit
 *  - a numeric lab result without the laboratory's reference range (not vital signs)
 *  - a test documented as requested/advised with no result in any later record
 *  - a document with no date, or an ambiguous date (two valid readings)
 *  - medication-history flags from reconciliation: a "continue" with no
 *    earlier prescription, a medicine active again after a stop, and a
 *    medicine last documented long ago with no stop recorded
 */
import { dateOf, flag, formatDate, patientFindings, sourceOf } from './shared.js';

const NUMERIC = /^\s*[<>≤≥]?\s*\d/;
// Measurements normally recorded without a laboratory reference range.
const VITALS = /blood pressure|\bbp\b|pulse|heart rate|weight|height|\bbmi\b|temperature|\btemp\b|spo2|oxygen saturation|respiratory rate|\brr\b|waist|head circumference/i;
const REQUESTED = /\b(?:requested|advised|ordered|to be done|planned|pending|awaited|sent for|repeat)\b/i;

/**
 * @param {{ claims: object[], documents: object[], histories: object[] }} input
 *   documents: ready documents that have findings in the history
 *   histories: medication histories from medicationEpisodes (each with .flags)
 */
export const detect = ({ claims, documents = [], histories = [] }) => {
	const findings = patientFindings(claims);
	const flags = [];

	for (const c of findings.filter((f) => f.category === 'medication' && f.assertion === 'present' && !f.dose)) {
		flags.push(flag('missing_field', `${c.name} is recorded without a dose. Information missing.`, [c]));
	}
	for (const c of findings.filter((f) => f.category === 'investigation' && f.value && NUMERIC.test(f.value) && !f.unit)) {
		flags.push(flag('missing_field', `${c.name} result ${c.value} has no unit. Information missing.`, [c]));
	}
	for (const c of findings.filter((f) => f.category === 'investigation' && f.assertion === 'present' && f.value && NUMERIC.test(f.value) && !f.ref_range && !VITALS.test(f.name))) {
		flags.push(
			flag('missing_field', `${c.name} ${[c.value, c.unit].filter(Boolean).join(' ')} in ${sourceOf(c)} has no reference range recorded. Information missing.`, [c], [], {
				reason: "Without the laboratory's own range the result cannot be checked as the lab reported it. Ranges differ between laboratories, so none is assumed.",
			}),
		);
	}
	// A test asked for, with no result for it anywhere later in the history.
	const results = findings.filter((f) => f.category === 'investigation' && f.value);
	for (const c of findings.filter((f) => f.category === 'investigation' && !f.value && f.assertion !== 'absent' && REQUESTED.test(f.quote ?? ''))) {
		const asked = dateOf(c);
		const answered = results.some((r) => r.name_normalised === c.name_normalised && (!asked || !dateOf(r) || dateOf(r) >= asked));
		if (answered) continue;
		flags.push(
			flag('missing_field', `${c.name} was requested in ${sourceOf(c)}, but no result for it is documented in any later record. Information missing.`, [c], [], {
				reason: `The result may be in a report that has not been uploaded${asked ? ` (requested ${formatDate(asked)})` : ''}. A missing result is not taken to mean a normal one.`,
			}),
		);
	}

	for (const doc of documents) {
		if (doc.document_date) continue;
		const alternatives = doc.document_date_alternatives;
		const related = findings.filter((c) => c.document_id === doc.id);
		flags.push(
			alternatives?.length
				? flag('ambiguous_date', `The date "${doc.document_date_text}" on ${doc.original_filename} could be ${alternatives.join(' or ')}. Information missing.`, related, [doc.id])
				: flag('missing_field', `${doc.original_filename} has no date, so its findings cannot be placed in time. Information missing.`, related, [doc.id]),
		);
	}

	const byId = new Map(claims.map((c) => [c.id, c]));
	for (const history of histories) {
		for (const f of history.flags ?? []) {
			const involved = (f.claimIds ?? []).map((id) => byId.get(id)).filter(Boolean);
			flags.push(flag(f.type, f.message, involved));
		}
	}
	return flags;
};
