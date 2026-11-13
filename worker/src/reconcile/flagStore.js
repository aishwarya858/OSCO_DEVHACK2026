/**
 * Persist the flags reconciliation computed for one patient.
 *
 * Each flag is identified by its type and the findings/documents involved, so
 * the same problem keeps the same row across re-runs. A doctor's resolution is
 * never undone by a re-run. Open flags that the records no longer produce (for
 * example after a correction) are marked "cleared", not deleted.
 */
import { createHash } from 'node:crypto';

export const fingerprintOf = (f) =>
	createHash('sha256').update(JSON.stringify([f.type, [...f.findingIds].sort(), [...f.documentIds].sort()])).digest('hex');

/** Deduplicate by fingerprint (two rules can raise the same flag). */
export const uniqueFlags = (flags) => {
	const seen = new Map();
	for (const f of flags) {
		const fp = fingerprintOf(f);
		if (!seen.has(fp)) seen.set(fp, { ...f, fingerprint: fp });
	}
	return [...seen.values()];
};

export const saveFlags = async (client, patientId, flags) => {
	const unique = uniqueFlags(flags);
	for (const f of unique) {
		await client.query(
			`INSERT INTO record_flags (patient_id, type, message, finding_ids, document_ids, fingerprint, reason, evidence)
			 VALUES ($1, $2, $3, $4::uuid[], $5::uuid[], $6, $7, $8::jsonb)
			 ON CONFLICT (patient_id, fingerprint) DO UPDATE SET
			   message = EXCLUDED.message,
			   reason = EXCLUDED.reason,
			   evidence = EXCLUDED.evidence,
			   last_seen_at = now(),
			   -- a cleared flag that comes back is open again; a resolved one stays resolved
			   status = CASE WHEN record_flags.status = 'cleared' THEN 'open' ELSE record_flags.status END,
			   cleared_at = CASE WHEN record_flags.status = 'cleared' THEN NULL ELSE record_flags.cleared_at END`,
			[patientId, f.type, f.message, f.findingIds, f.documentIds, f.fingerprint, f.reason ?? null, JSON.stringify(f.evidence ?? [])],
		);
	}
	const { rowCount: cleared } = await client.query(
		`UPDATE record_flags SET status = 'cleared', cleared_at = now()
		 WHERE patient_id = $1 AND status = 'open' AND NOT (fingerprint = ANY($2::char(64)[]))`,
		[patientId, unique.map((f) => f.fingerprint)],
	);
	return { saved: unique.length, cleared };
};
