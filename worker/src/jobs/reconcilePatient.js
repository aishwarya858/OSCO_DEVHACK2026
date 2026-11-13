/**
 * Step 8 - Reconcile: rebuild one patient's medication histories and review
 * flags from the confirmed history across all documents (MVP document 8.6):
 * contradictions, duplicates (findings and whole documents), missing
 * information, inconsistent patient details / dates / units, results the
 * report itself marks as outside its range, and unconfirmed findings.
 *
 * Runs as its own job, under a per-patient transaction-scoped advisory lock, so
 * two documents finishing at once cannot corrupt the same patient's timeline.
 * Reconciliation is deterministic: same confirmed findings in, same output out.
 * Flags are never resolved automatically (flagStore.js keeps doctors' resolutions).
 */
import { UnrecoverableError } from 'bullmq';
import { withTransaction } from '../db.js';
import * as medicationEpisodes from '../reconcile/medicationEpisodes.js';
import * as contradictions from '../reconcile/contradictions.js';
import * as duplicates from '../reconcile/duplicates.js';
import * as gaps from '../reconcile/gaps.js';
import * as patientDetails from '../reconcile/patientDetails.js';
import * as reliability from '../reconcile/reliability.js';
import { saveFlags } from '../reconcile/flagStore.js';

// Namespace for pg_advisory_xact_lock(int, int); the second key is derived from the patient id.
const RECONCILE_LOCK_NAMESPACE = 5508;

export const reconcilePatient = async (job) => {
	const { patientId } = job.data ?? {};
	if (!patientId) throw new UnrecoverableError('Job data must include patientId.');

	return withTransaction(async (client) => {
		await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [RECONCILE_LOCK_NAMESPACE, patientId]);

		// The confirmed history, current versions only (document findings and doctor-entered records).
		const { rows: claims } = await client.query(
			`SELECT c.*, d.created_at AS document_created_at, COALESCE(d.document_date, r.consultation_date) AS document_date,
			        COALESCE(d.original_filename, CASE WHEN r.id IS NOT NULL THEN 'a doctor-entered visit record' END) AS document_name
			 FROM claims c
			 LEFT JOIN documents d ON d.id = c.document_id
			 LEFT JOIN clinical_records r ON r.id = c.clinical_record_id
			 WHERE c.patient_id = $1 AND c.retired_at IS NULL AND c.verification_status <> 'rejected'
			   AND c.review_status = 'confirmed'
			   AND NOT EXISTS (SELECT 1 FROM claims newer WHERE newer.supersedes_id = c.id AND newer.retired_at IS NULL)
			 ORDER BY c.event_date NULLS LAST, d.created_at, c.created_at, c.id`,
			[patientId],
		);
		// Documents that contribute to the history (date gaps only matter for those).
		const { rows: documents } = await client.query(
			`SELECT d.id, d.original_filename, d.document_date, d.document_date_text, d.document_date_alternatives, d.document_type
			 FROM documents d
			 WHERE d.patient_id = $1 AND d.status = 'ready' AND d.id = ANY($2::uuid[])`,
			[patientId, [...new Set(claims.map((c) => c.document_id).filter(Boolean))]],
		);

		// The page text (patient details, duplicated documents) and the name on the account.
		const { rows: pages } = await client.query(
			'SELECT document_id, page_number, page_text FROM document_pages WHERE document_id = ANY($1::uuid[])',
			[documents.map((d) => d.id)],
		);
		const { rows: patientRows } = await client.query('SELECT full_name FROM patients WHERE id = $1', [patientId]);

		const histories = await medicationEpisodes.run({ client, patientId, claims });
		const details = patientDetails.collectDetails(pages);
		const flags = [
			...contradictions.detect({ claims }),
			...duplicates.detect({ claims, documents, pages }),
			...gaps.detect({ claims, documents, histories }),
			...patientDetails.detect({ documents, pages, registeredName: patientRows[0]?.full_name ?? null, details }),
			...reliability.detect({ claims, documents, dateOfBirth: patientDetails.agreedDateOfBirth(details) }),
		];
		const { saved, cleared } = await saveFlags(client, patientId, flags);

		return { patientId, claims: claims.length, medicationHistories: histories.length, flags: saved, flagsCleared: cleared };
	});
};
