/**
 * Possible duplicates (MVP document 8.6). Flagged for review with every
 * source kept; never merged silently.
 *
 *  - the same document uploaded twice (identical text, or the same type and
 *    date with almost the same wording)
 *  - the same test result or prescription on the same date in two documents
 *  - the same diagnosis or procedure/event on the same date in two documents
 */
import { normaliseText } from '../utils/quoteMatch.js';
import { dateOf, doseKey, flag, formatDate, groupBy, pairs, patientFindings, resultKey, toIsoDate } from './shared.js';

/** Word-set overlap above which two same-date, same-type documents count as near copies. */
const NEAR_COPY = 0.9;
const MIN_WORDS = 30;

const wordsOf = (text) => new Set(text.split(' ').filter((w) => w.length > 2));
const overlap = (a, b) => {
	let shared = 0;
	for (const w of a) if (b.has(w)) shared += 1;
	return shared / Math.max(a.size, b.size);
};

/** First non-empty line of page 1, as page evidence for a whole document. */
const firstLineEvidence = (doc, pages) => {
	const page = pages.find((p) => p.document_id === doc.id && p.page_number === 1);
	if (!page?.page_text) return null;
	const match = /\S[^\n]*/.exec(page.page_text);
	if (!match) return null;
	const quote = match[0].slice(0, 120);
	return { documentId: doc.id, page: 1, quoteStart: match.index, quoteEnd: match.index + quote.length, quote, label: `First line of ${doc.original_filename}` };
};

/** Pairs of documents that look like copies of each other. */
export const duplicateDocuments = (documents, pages) => {
	const textOf = new Map();
	for (const doc of documents) {
		const text = pages
			.filter((p) => p.document_id === doc.id)
			.sort((a, b) => a.page_number - b.page_number)
			.map((p) => p.page_text ?? '')
			.join('\n');
		if (text.trim()) textOf.set(doc.id, normaliseText(text));
	}
	const found = [];
	for (const [a, b] of pairs(documents.filter((d) => textOf.has(d.id)))) {
		const [ta, tb] = [textOf.get(a.id), textOf.get(b.id)];
		if (ta === tb) {
			found.push({ a, b, identical: true });
			continue;
		}
		const sameDate = a.document_date && toIsoDate(a.document_date) === toIsoDate(b.document_date);
		if (!sameDate || !a.document_type || a.document_type !== b.document_type) continue;
		const [wa, wb] = [wordsOf(ta), wordsOf(tb)];
		if (wa.size >= MIN_WORDS && wb.size >= MIN_WORDS && overlap(wa, wb) >= NEAR_COPY) found.push({ a, b, identical: false });
	}
	return found;
};

/**
 * @param {{ claims: object[], documents?: object[], pages?: object[] }} input
 */
export const detect = ({ claims, documents = [], pages = [] }) => {
	const findings = patientFindings(claims).filter((c) => c.document_id);
	const flags = [];

	// Whole documents uploaded more than once.
	const copies = duplicateDocuments(documents, pages);
	const copyPair = new Set(copies.map(({ a, b }) => [a.id, b.id].sort().join('|')));
	for (const { a, b, identical } of copies) {
		flags.push(
			flag(
				'duplicate',
				identical
					? `${a.original_filename} and ${b.original_filename} contain exactly the same text: the same document appears to have been uploaded twice.`
					: `${a.original_filename} and ${b.original_filename} have the same type and date (${formatDate(toIsoDate(a.document_date))}) and almost the same wording: possibly the same document uploaded twice.`,
				[],
				[a.id, b.id],
				{
					reason: 'Duplicated documents make every finding in them appear twice in the history. Check the originals and keep the history counting each record once.',
					evidence: [firstLineEvidence(a, pages), firstLineEvidence(b, pages)].filter(Boolean),
				},
			),
		);
	}

	const sameKey = (c) => {
		const date = dateOf(c);
		if (!date) return null;
		if (c.category === 'investigation' && resultKey(c)) return `test:${c.name_normalised}@${date}=${resultKey(c)}`;
		if (c.category === 'medication' && doseKey(c)) return `med:${c.name_normalised}@${date}=${doseKey(c)}`;
		if ((c.category === 'condition' || c.category === 'event') && c.assertion === 'present') return `${c.category}:${c.name_normalised}@${date}`;
		return null;
	};

	for (const group of groupBy(findings, sameKey).values()) {
		for (const [a, b] of pairs(group)) {
			if (a.document_id === b.document_id) continue;
			// Already reported as a duplicated document.
			if (copyPair.has([a.document_id, b.document_id].sort().join('|'))) continue;
			const what =
				a.category === 'investigation'
					? `${a.name} ${[a.value, a.unit].filter(Boolean).join(' ')}`
					: a.category === 'medication'
						? `${a.name} ${a.dose}`
						: a.name;
			const docs = `${a.document_name ?? 'one document'} and ${b.document_name ?? 'another document'}`;
			flags.push(
				flag('duplicate', `Possible duplicate: ${what} on ${formatDate(dateOf(a))} appears in two documents (${docs}).`, [a, b], [], {
					reason:
						a.category === 'condition' || a.category === 'event'
							? 'The same diagnosis or procedure on the same date may be one event recorded twice. Check it is not counted as two separate events.'
							: 'The same result or prescription may have been printed in two documents. Check it is not counted twice.',
				}),
			);
		}
	}
	return flags;
};
