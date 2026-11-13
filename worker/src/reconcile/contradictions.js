/**
 * Contradictions (MVP document 8.6): records that disagree. Never resolved
 * automatically; a doctor reviews both versions side by side.
 *
 *  - an allergy recorded as present in one document and as absent in another
 *    (including a later "no known drug allergies" general statement)
 *  - the same condition, allergy or procedure/event documented as present and
 *    as absent, saying which record is earlier when the dates differ
 *  - different blood groups in different records (a blood group does not change)
 *  - two different doses for the same medicine on the same date
 *  - incompatible results for the same test on the same date
 *
 * Possible and family findings are never contradictions (7.3 rule 6).
 */
import { dateOf, doseKey, flag, formatDate, groupBy, pairs, patientFindings, resultKey, sourceOf } from './shared.js';

const GENERAL_STATEMENT = /general statement/i;
const BLOOD_GROUP = /\bblood group\b|\babo\b|\brh\s*(?:type|factor|typing)\b|\bblood type\b/i;
/** "B Positive", "B +ve", "b+" -> "b+". */
const bloodGroupKey = (value) =>
	value
		.toLowerCase()
		.replace(/\s+/g, '')
		.replace(/positive|\+ve|pos/g, '+')
		.replace(/negative|-ve|neg/g, '-')
		.replace(/[^abo+-]/g, '');
const fmt = (iso) => iso ?? 'an undated record';

export const detect = ({ claims }) => {
	const findings = patientFindings(claims).filter((c) => c.assertion !== 'possible');
	const flags = [];

	// Allergy present vs a general "no known drug allergies" statement in another document.
	const allergies = findings.filter((c) => c.category === 'allergy');
	const generalAbsent = allergies.filter((c) => c.assertion === 'absent' && GENERAL_STATEMENT.test(c.name));
	for (const present of allergies.filter((c) => c.assertion === 'present')) {
		for (const absent of generalAbsent) {
			if (present.document_id && present.document_id === absent.document_id) continue;
			flags.push(
				flag(
					'contradiction',
					`An allergy to ${present.name} is recorded in ${sourceOf(present)}, but ${sourceOf(absent)} says there are no known drug allergies. Records disagree, needs review.`,
					[present, absent],
					[],
					{ reason: 'An allergy that is missed can be given again. Check which record is right; the absence of allergies is not assumed.' },
				),
			);
		}
	}

	// The same condition, allergy or procedure/event recorded as present and as absent.
	const byName = groupBy(
		findings.filter((c) => ['condition', 'allergy', 'event'].includes(c.category) && !GENERAL_STATEMENT.test(c.name)),
		(c) => `${c.category}:${c.name_normalised}`,
	);
	for (const group of byName.values()) {
		for (const present of group.filter((c) => c.assertion === 'present')) {
			for (const absent of group.filter((c) => c.assertion === 'absent')) {
				const [pd, ad] = [dateOf(present), dateOf(absent)];
				const order =
					pd && ad && pd !== ad
						? pd < ad
							? ` A later record (${formatDate(ad)}) conflicts with the earlier one (${formatDate(pd)}).`
							: ` A later record (${formatDate(pd)}) conflicts with the earlier one (${formatDate(ad)}).`
						: '';
				flags.push(
					flag(
						'contradiction',
						`${present.name} is documented as present in ${sourceOf(present)} but as absent in ${sourceOf(absent)}.${order} Records disagree, needs review.`,
						[present, absent],
						[],
						{
							reason:
								'This may be a change over time or a recording error. It has not been resolved automatically; compare both originals before relying on either.',
						},
					),
				);
			}
		}
	}

	// Blood group: one value for life, so two different values cannot both be right.
	const bloodGroups = findings.filter((c) => c.category === 'investigation' && BLOOD_GROUP.test(c.name) && c.value);
	const groupsByValue = groupBy(bloodGroups, (c) => bloodGroupKey(c.value));
	if (groupsByValue.size > 1) {
		const firsts = [...groupsByValue.values()].map((g) => g[0]);
		flags.push(
			flag(
				'contradiction',
				`Different blood groups are recorded: ${firsts.map((c) => `${c.value} in ${sourceOf(c)}`).join('; ')}. Records disagree, needs review.`,
				[...groupsByValue.values()].flat(),
				[],
				{ reason: 'A blood group does not change. One record is wrong or belongs to someone else; check before any transfusion-related use.' },
			),
		);
	}

	// Two doses for the same medicine on the same date.
	const medicines = groupBy(
		findings.filter((c) => c.category === 'medication' && doseKey(c) && dateOf(c)),
		(c) => `${c.name_normalised}@${dateOf(c)}`,
	);
	for (const group of medicines.values()) {
		for (const [a, b] of pairs(group)) {
			if (doseKey(a) !== doseKey(b)) {
				flags.push(
					flag('contradiction', `${a.name} is recorded with two different doses (${a.dose} and ${b.dose}) on ${fmt(dateOf(a))}. Records disagree, needs review.`, [a, b], [], {
						reason: 'Only one dose can be right for that date. Check the originals.',
					}),
				);
			}
		}
	}

	// Different results for the same test on the same date.
	const tests = groupBy(
		findings.filter((c) => c.category === 'investigation' && resultKey(c) && dateOf(c) && !BLOOD_GROUP.test(c.name)), // blood group: own rule above
		(c) => `${c.name_normalised}@${dateOf(c)}`,
	);
	for (const group of tests.values()) {
		for (const [a, b] of pairs(group)) {
			if (resultKey(a) !== resultKey(b)) {
				flags.push(
					flag(
						'contradiction',
						`${a.name} has two different results on ${fmt(dateOf(a))}: ${[a.value, a.unit].filter(Boolean).join(' ')} in ${sourceOf(a)} and ${[b.value, b.unit].filter(Boolean).join(' ')} in ${sourceOf(b)}. Records disagree, needs review.`,
						[a, b],
						[],
						{ reason: 'One test on one date should have one result. One value may be misread, mistyped or from another sample.' },
					),
				);
			}
		}
	}

	return flags;
};
