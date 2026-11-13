/**
 * Re-run reconciliation (medication histories and review flags) for every
 * patient with a confirmed history. Use after the flag rules change, so
 * records uploaded earlier are checked with the new rules too. The worker
 * must be running; flags a doctor already reviewed stay reviewed.
 *
 *   npm run flags:recheck
 */
import { pool } from '../src/config/db.js';
import { closeQueues, enqueueReconcile } from '../src/services/queue.service.js';

try {
	const { rows } = await pool.query(`SELECT DISTINCT patient_id FROM claims WHERE review_status = 'confirmed' AND retired_at IS NULL`);
	let queued = 0;
	for (const { patient_id: patientId } of rows) {
		if (await enqueueReconcile(patientId, 'flags_recheck')) queued += 1;
	}
	console.log(`Queued a re-check for ${queued} of ${rows.length} patient(s). The worker updates their flags in a few seconds.`);
} catch (error) {
	console.error(`Could not queue the re-check: ${error.message}`);
	process.exitCode = 1;
} finally {
	await closeQueues().catch(() => {});
	await pool.end();
}
