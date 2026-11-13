/**
 * Patient details across documents (MVP document 8.6): the name, date of birth,
 * sex and age printed on each document, compared with each other and with the
 * account. Read from the stored page text with fixed label patterns ("Patient
 * name", "DOB", "Age/Sex", ...); nothing is guessed. A detail that cannot be
 * read is simply not compared, and is never treated as matching.
 *
 * Every flag carries page evidence (document, page, exact characters) so the
 * Source Viewer can show the printed detail.
 */
import { normaliseWithMap } from '../utils/quoteMatch.js';
import { parseDate } from '../pipeline/6-normalise.js';
import { flag, formatDate } from './shared.js';

/** Only the header area of the first pages holds patient details. */
const PAGES_SCANNED = 2;
const CHARS_SCANNED = 4000;

const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'master', 'dr', 'smt', 'shri', 'sri', 'baby', 'mx']);
// Words that end a name: the next label on the line, never part of the name.
const STOP = new Set([
	'age', 'sex', 'gender', 'dob', 'd.o.b', 'date', 'birth', 'id', 'uhid', 'mrn', 'no', 'no.', 'number', 'reg', 'regn', 'registration',
	'ip', 'op', 'ipd', 'opd', 'ref', 'referred', 'by', 'doctor', 'test', 'patient', 'mobile', 'phone', 'contact', 'address', 'ward', 'bed',
	'hospital', 'sample', 'collected', 'report', 'consultant', 'visit', 'record', 'years', 'yrs', 'male', 'female', 'lab', 'unit',
	'department', 'dept', 'of', 'on', 'and', 'the', 's/o', 'd/o', 'w/o', 'c/o', 'relation', 'blood', 'group', 'weight', 'height',
]);

const NAME_LABEL =
	/(?:patient'?s? name|name of (?:the )?patient|patient\s*:|(?<!(?:doctor|father|mother|husband|wife|guardian|hospital|consultant|clinic|lab|test|spouse|relative|referring|physician|clinician|facility|centre|center|company|insurer|nominee) )\bname\s*:)\s*[:-]?\s*/g;
const DOB_LABEL = /\b(?:date of birth|d\.?\s?o\.?\s?b\.?|birth date)\s*[:-]?\s*/g;
const DATE_TOKEN = /^(\d{1,2}(?:st|nd|rd|th)?[\s/.-]+(?:[a-z]{3,9}\.?|\d{1,2})[\s/.,-]+\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|[a-z]{3,9}\.? \d{1,2},? \d{4})/;
const AGE_SEX = /\bage\s*\/\s*(?:sex|gender)\s*[:-]?\s*(\d{1,3})\s*(?:y|yr|yrs|years)?\s*\/\s*(male|female|m|f)\b/g;
const AGE_SLASH_SEX = /\b(\d{1,3})\s*(?:y|yrs?|years)\s*\/\s*(male|female|m|f)\b/g;
const SEX = /\b(?:sex|gender)\s*[:/-]?\s*(male|female|transgender|m|f)\b/g;
const AGE = /\b(?:age|aged)\s*[:-]?\s*(\d{1,3})\s*(?:y|yr|yrs|years)?\b/g;

const SEX_WORD = { m: 'male', male: 'male', f: 'female', female: 'female', transgender: 'transgender' };

/** First match of a /g regex at or after `from`. */
const firstMatch = (re, text) => {
	re.lastIndex = 0;
	return re.exec(text);
};

/**
 * Read the printed patient details from one page.
 * @returns {{ name?, dob?, sex?, age? }} each with { value, quote, quoteStart, quoteEnd }
 */
export const readPageDetails = (pageText) => {
	const original = (pageText ?? '').slice(0, CHARS_SCANNED);
	if (!original.trim()) return {};
	const { text, starts, ends } = normaliseWithMap(original);
	const span = (a, b) => ({ quoteStart: starts[a], quoteEnd: ends[b - 1], quote: original.slice(starts[a], ends[b - 1]) });
	const out = {};

	// Name: the words after a name label, up to the next label word.
	let m;
	NAME_LABEL.lastIndex = 0;
	while (!out.name && (m = NAME_LABEL.exec(text))) {
		const after = m.index + m[0].length;
		const tokens = text.slice(after, after + 60).split(' ');
		const kept = [];
		for (const token of tokens) {
			const word = token.replace(/[,;]+$/, '');
			if (!/^[a-z][a-z.'-]*$/.test(word) || STOP.has(word) || kept.length >= 5) break;
			kept.push(word);
			if (token !== word) break; // a trailing comma ends the name
		}
		const nameWords = kept.filter((w) => !TITLES.has(w.replace(/\.$/, '')));
		if (nameWords.some((w) => w.replace(/\./g, '').length >= 2)) {
			const end = after + kept.join(' ').length;
			out.name = { value: nameWords.map((w) => w.replace(/\.$/, '')), ...span(m.index, end) };
		}
	}

	// Date of birth.
	if ((m = firstMatch(DOB_LABEL, text))) {
		const after = m.index + m[0].length;
		const token = DATE_TOKEN.exec(text.slice(after, after + 30));
		if (token) {
			const parsed = parseDate(token[1]);
			const readings = parsed.event_date && parsed.date_precision === 'day' ? [parsed.event_date] : parsed.date_alternatives ?? [];
			if (readings.length) out.dob = { value: readings, ...span(m.index, after + token[1].length) };
		}
	}

	// Sex and age, together ("Age/Sex: 44/M", "44 Y / M") or separately.
	for (const re of [AGE_SEX, AGE_SLASH_SEX]) {
		if (!out.sex && (m = firstMatch(re, text))) {
			out.sex = { value: SEX_WORD[m[2]], ...span(m.index, m.index + m[0].length) };
			out.age = { value: Number(m[1]), ...span(m.index, m.index + m[0].length) };
		}
	}
	if (!out.sex && (m = firstMatch(SEX, text))) out.sex = { value: SEX_WORD[m[1]], ...span(m.index, m.index + m[0].length) };
	if (!out.age && (m = firstMatch(AGE, text))) {
		const years = Number(m[1]);
		if (years <= 130) out.age = { value: years, ...span(m.index, m.index + m[0].length) };
	}
	return out;
};

/**
 * Details for each document: the first value of each kind on its first pages.
 * @param {{ document_id: string, page_number: number, page_text: string }[]} pages
 * @returns {Map<string, { name?, dob?, sex?, age? }>} values carry { page } too
 */
export const collectDetails = (pages) => {
	const byDocument = new Map();
	for (const page of [...pages].sort((a, b) => a.page_number - b.page_number)) {
		if (page.page_number > PAGES_SCANNED) continue;
		const found = readPageDetails(page.page_text);
		const current = byDocument.get(page.document_id) ?? {};
		for (const [key, value] of Object.entries(found)) {
			if (!current[key]) current[key] = { ...value, page: page.page_number, documentId: page.document_id };
		}
		byDocument.set(page.document_id, current);
	}
	return byDocument;
};

/** Name tokens are compatible when every word of the shorter name matches one in the longer (initials allowed). */
export const namesCompatible = (a, b) => {
	const [short, long] = a.length <= b.length ? [a, b] : [b, a];
	const wordMatch = (x, y) => x === y || (x.replace(/\./g, '').length === 1 && y.startsWith(x[0])) || (y.replace(/\./g, '').length === 1 && x.startsWith(y[0]));
	return short.every((w) => long.some((v) => wordMatch(w, v)));
};

const nameTokens = (fullName) =>
	(fullName ?? '')
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[^a-z.' -]/g, ' ')
		.split(/\s+/)
		.map((w) => w.replace(/\.$/, ''))
		.filter((w) => w && !TITLES.has(w));

const display = (tokens) => tokens.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** Group documents whose values agree; `same` decides agreement. */
const cluster = (entries, same) => {
	const groups = [];
	for (const entry of entries) {
		const group = groups.find((g) => same(g[0].value, entry.value));
		if (group) group.push(entry);
		else groups.push([entry]);
	}
	return groups;
};

const evidenceOf = (entry, label) => ({
	documentId: entry.documentId,
	page: entry.page,
	quoteStart: entry.quoteStart,
	quoteEnd: entry.quoteEnd,
	quote: entry.quote,
	label,
});

const docList = (group, docName) => [...new Set(group.map((e) => docName(e.documentId)))].join(', ');

const yearsBetween = (fromIso, toIso) => {
	const [fy, fm, fd] = fromIso.split('-').map(Number);
	const [ty, tm, td] = toIso.split('-').map(Number);
	let years = ty - fy;
	if (tm < fm || (tm === fm && (td ?? 1) < (fd ?? 1))) years -= 1;
	return years;
};

/** The one date of birth every document agrees on, or null. */
export const agreedDateOfBirth = (details) => {
	const values = [...details.values()].map((d) => d.dob?.value).filter(Boolean);
	const single = values.filter((v) => v.length === 1).map((v) => v[0]);
	const distinct = [...new Set(single)];
	return distinct.length === 1 && values.every((v) => v.includes(distinct[0])) ? distinct[0] : null;
};

/**
 * @param {{ documents: { id, original_filename, document_date }[], pages: object[], registeredName?: string, details?: Map }} input
 */
export const detect = ({ documents, pages, registeredName = null, details = collectDetails(pages) }) => {
	const flags = [];
	const docs = new Map(documents.map((d) => [d.id, d]));
	const docName = (id) => docs.get(id)?.original_filename ?? 'a document';
	const entries = (key) => [...details.values()].map((d) => d[key]).filter((e) => e && docs.has(e.documentId));

	// --- Name: documents against the account, and against each other.
	const names = entries('name');
	const nameGroups = cluster(names, namesCompatible);
	const account = nameTokens(registeredName);
	const evidence = (group) => group.map((e) => evidenceOf(e, `Name printed: ${e.quote}`));
	if (account.length) {
		for (const group of nameGroups.filter((g) => !namesCompatible(g[0].value, account))) {
			flags.push(
				flag(
					'inconsistent_detail',
					`The patient name printed on ${docList(group, docName)} is “${display(group[0].value)}”, which does not match the name on this account (“${registeredName}”).`,
					[],
					group.map((e) => e.documentId),
					{
						reason: 'A record for a different person may have been added to this history, or a name is misspelt. Check the original before relying on its findings.',
						evidence: evidence(group),
					},
				),
			);
		}
	}
	if (nameGroups.length > 1 && (!account.length || nameGroups.every((g) => !namesCompatible(g[0].value, account)))) {
		flags.push(
			flag(
				'inconsistent_detail',
				`Documents give different patient names: ${nameGroups.map((g) => `“${display(g[0].value)}” on ${docList(g, docName)}`).join('; ')}.`,
				[],
				nameGroups.flat().map((e) => e.documentId),
				{ reason: 'These documents may not all belong to the same person. Confirm each one before combining their findings.', evidence: evidence(nameGroups.flat()) },
			),
		);
	}

	// --- Date of birth.
	const dobGroups = cluster(entries('dob'), (a, b) => a.some((x) => b.includes(x)));
	if (dobGroups.length > 1) {
		flags.push(
			flag(
				'inconsistent_detail',
				`Documents give different dates of birth: ${dobGroups.map((g) => `${g[0].value.map(formatDate).join(' or ')} on ${docList(g, docName)}`).join('; ')}.`,
				[],
				dobGroups.flat().map((e) => e.documentId),
				{
					reason: 'A date of birth does not change. One of these is a recording error, or the documents belong to different people.',
					evidence: dobGroups.flat().map((e) => evidenceOf(e, `Date of birth printed: ${e.quote}`)),
				},
			),
		);
	}

	// --- Sex.
	const sexGroups = cluster(entries('sex'), (a, b) => a === b);
	if (sexGroups.length > 1) {
		flags.push(
			flag(
				'inconsistent_detail',
				`Documents record different sex: ${sexGroups.map((g) => `${g[0].value} on ${docList(g, docName)}`).join('; ')}.`,
				[],
				sexGroups.flat().map((e) => e.documentId),
				{
					reason: 'This may be a recording error or a document belonging to another person. Check the originals.',
					evidence: sexGroups.flat().map((e) => evidenceOf(e, `Sex printed: ${e.quote}`)),
				},
			),
		);
	}

	// --- Age against the date of birth, or against each other over time.
	const dob = agreedDateOfBirth(details);
	const ages = entries('age')
		.map((e) => ({ ...e, date: docs.get(e.documentId)?.document_date ?? null }))
		.filter((e) => e.date);
	if (dob) {
		for (const e of ages) {
			const expected = yearsBetween(dob, e.date);
			if (expected >= 0 && Math.abs(e.value - expected) > 1) {
				flags.push(
					flag(
						'inconsistent_detail',
						`${docName(e.documentId)} (${formatDate(e.date)}) gives the age as ${e.value}, but the documented date of birth (${formatDate(dob)}) means the patient would have been ${expected}.`,
						[],
						[e.documentId],
						{ reason: 'The age, the date of birth or the document date is wrong. Check which one before using dates from this document.', evidence: [evidenceOf(e, `Age printed: ${e.quote}`)] },
					),
				);
			}
		}
	} else {
		const sorted = [...ages].sort((a, b) => a.date.localeCompare(b.date));
		for (let i = 1; i < sorted.length; i += 1) {
			const [a, b] = [sorted[i - 1], sorted[i]];
			const elapsed = (Date.parse(b.date) - Date.parse(a.date)) / (365.25 * 24 * 3600 * 1000);
			if (Math.abs(b.value - a.value - elapsed) > 1.5) {
				flags.push(
					flag(
						'inconsistent_detail',
						`The age is ${a.value} on ${docName(a.documentId)} (${formatDate(a.date)}) and ${b.value} on ${docName(b.documentId)} (${formatDate(b.date)}), which does not fit the ${elapsed.toFixed(1)} years between them.`,
						[],
						[a.documentId, b.documentId],
						{
							reason: 'An age or a document date is probably wrong, or the documents belong to different people.',
							evidence: [evidenceOf(a, `Age printed: ${a.quote}`), evidenceOf(b, `Age printed: ${b.quote}`)],
						},
					),
				);
			}
		}
	}

	// --- No patient name at all: the document cannot be matched to this patient.
	for (const doc of documents) {
		const read = details.get(doc.id);
		if (read && !read.name) {
			flags.push(
				flag('missing_field', `No patient name could be found in the text read from ${doc.original_filename}.`, [], [doc.id], {
					reason: 'It cannot be checked that this document belongs to this patient. Look at the original to confirm.',
				}),
			);
		}
	}
	return flags;
};
