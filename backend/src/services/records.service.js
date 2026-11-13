import { pool } from '../config/db.js';
import { CURRENT_VERSION, FINDING_COLUMNS, toFinding } from './findings.service.js';

/**
 * A patient's medical history in the frontend's PatientRecords shape
 * (MVP document 6.1.5), shared by the patient and doctor dashboards.
 *
 * Only findings the patient has CONFIRMED appear, in their current version (a
 * correction replaces what it corrects; the original stays in the database as
 * evidence). Findings still waiting for the patient's review are counted, not shown.
 *
 * @param {string} patientId  internal patient UUID
 * @param {{ fileUrl: (documentId: string) => string }} options  where the original file is served for this viewer
 */
export const buildPatientRecords = async (patientId, { fileUrl }) => {
	const [patient, documents, findings, pages, histories, review, flags, clinical] = await Promise.all([
		pool.query('SELECT full_name, public_id FROM patients WHERE id = $1', [patientId]),
		pool.query(
			`SELECT d.id, d.original_filename, d.mime_type, d.status, d.document_type, d.page_count, d.extraction_stats,
			        to_char(d.document_date, 'YYYY-MM-DD') AS document_date, d.document_date_text, d.document_date_alternatives
			 FROM documents d WHERE d.patient_id = $1 ORDER BY d.created_at`,
			[patientId],
		),
		pool.query(
			`SELECT ${FINDING_COLUMNS} FROM claims c
			 WHERE c.patient_id = $1 AND c.review_status = 'confirmed' AND ${CURRENT_VERSION}
			 ORDER BY c.document_id, c.page, c.quote_start`,
			[patientId],
		),
		pool.query(
			`SELECT p.document_id, p.page_number, p.page_text
			 FROM document_pages p JOIN documents d ON d.id = p.document_id
			 WHERE d.patient_id = $1 ORDER BY p.document_id, p.page_number`,
			[patientId],
		),
		pool.query('SELECT history FROM medication_histories WHERE patient_id = $1 ORDER BY drug', [patientId]),
		pool.query(
			`SELECT count(DISTINCT c.document_id)::int AS documents, count(*)::int AS findings
			 FROM claims c WHERE c.patient_id = $1 AND c.review_status = 'pending' AND ${CURRENT_VERSION}`,
			[patientId],
		),
		// Review flags (8.6): open ones to act on and resolved ones as history; cleared ones are gone.
		pool.query(
			`SELECT f.id, f.type, f.message, f.reason, f.evidence, f.finding_ids, f.document_ids, f.status, f.resolution_note, f.resolved_at, f.created_at,
			        d.full_name AS resolved_by
			 FROM record_flags f LEFT JOIN doctors d ON d.id = f.resolved_by_doctor_id
			 WHERE f.patient_id = $1 AND f.status IN ('open', 'resolved')
			 ORDER BY f.status, f.created_at`,
			[patientId],
		),
		// Doctor-entered clinical records (6.2.8).
		pool.query(
			`SELECT r.id, to_char(r.consultation_date, 'YYYY-MM-DD') AS consultation_date, r.facility, r.observations, r.created_at, d.full_name AS doctor_name
			 FROM clinical_records r JOIN doctors d ON d.id = r.doctor_id
			 WHERE r.patient_id = $1 ORDER BY r.consultation_date, r.created_at`,
			[patientId],
		),
	]);

	// Findings a flag points at that are no longer current (e.g. corrected since): shown as the version the flag was about.
	const currentIds = new Set(findings.rows.map((f) => f.id));
	const missingIds = [...new Set(flags.rows.flatMap((f) => f.finding_ids))].filter((id) => !currentIds.has(id));
	const referenced = missingIds.length
		? await pool.query(`SELECT ${FINDING_COLUMNS} FROM claims c WHERE c.patient_id = $1 AND c.id = ANY($2::uuid[])`, [patientId, missingIds])
		: { rows: [] };

	const pagesByDocument = new Map();
	for (const page of pages.rows) {
		if (!pagesByDocument.has(page.document_id)) pagesByDocument.set(page.document_id, []);
		pagesByDocument.get(page.document_id).push({ pageNumber: page.page_number, text: page.page_text });
	}

	const totals = { returned: 0, accepted: 0, rejected: 0, rejectedByReason: {}, pageCorrections: 0 };
	for (const doc of documents.rows) {
		const stats = doc.extraction_stats;
		if (!stats) continue;
		totals.returned += stats.returned ?? 0;
		totals.accepted += stats.accepted ?? 0;
		totals.rejected += stats.rejected ?? 0;
		totals.pageCorrections += stats.pageCorrections ?? 0;
		for (const [reason, n] of Object.entries(stats.rejectedByReason ?? {})) totals.rejectedByReason[reason] = (totals.rejectedByReason[reason] ?? 0) + n;
	}

	return {
		patientId: patient.rows[0]?.public_id ?? '',
		patientName: patient.rows[0]?.full_name ?? '',
		builtAt: new Date().toISOString().slice(0, 10),
		extractionStats: totals,
		pendingReview: review.rows[0],
		documents: [
			...documents.rows.map((doc) => ({
			id: doc.id,
			kind: 'document',
			name: doc.original_filename,
			// PDFs open in the Source Viewer; images fall back to their OCR text with the quote marked.
			fileUrl: doc.mime_type === 'application/pdf' ? fileUrl(doc.id) : null,
			documentType: doc.document_type ?? 'other',
			documentDate: doc.document_date,
			documentDateText: doc.document_date_text,
			dateAlternatives: doc.document_date_alternatives,
			status: doc.status,
			pageCount: doc.page_count ?? 0,
			pages: pagesByDocument.get(doc.id) ?? [],
			})),
			// Clinical records are listed like documents so timelines and briefs place them by date.
			...clinical.rows.map((r) => ({
				id: r.id,
				kind: 'clinical_record',
				name: `Clinical record by ${r.doctor_name}`,
				fileUrl: null,
				documentType: 'clinical_note',
				documentDate: r.consultation_date,
				documentDateText: r.consultation_date,
				dateAlternatives: null,
				status: 'ready',
				pageCount: 0,
				pages: [],
				clinicalRecord: { doctorName: r.doctor_name, facility: r.facility, observations: r.observations, createdAt: r.created_at },
			})),
		],
		findings: findings.rows.map(toFinding),
		referencedFindings: referenced.rows.map(toFinding),
		medicationHistories: histories.rows.map((row) => row.history),
		flags: flags.rows.map((f) => ({
			id: f.id,
			type: f.type,
			message: f.message,
			// Why it needs attention, and page sources for flags read from page text (patient details, copies).
			reason: f.reason ?? null,
			evidence: Array.isArray(f.evidence) ? f.evidence : [],
			findingIds: f.finding_ids,
			documentIds: f.document_ids,
			status: f.status,
			createdAt: f.created_at,
			resolution: f.status === 'resolved' ? { note: f.resolution_note, by: f.resolved_by, at: f.resolved_at } : null,
		})),
	};
};
