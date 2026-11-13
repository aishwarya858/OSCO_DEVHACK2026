/**
 * DEVELOPMENT ONLY: set a registered doctor's verification status.
 *
 * Doctors who sign up start as 'pending'. In the MVP design a hospital admin
 * verifies them; that admin page is not built yet, so this script stands in.
 *
 *   npm run doctor:verify -- --email dr.mehta@example.test [--status verified|pending|rejected|revoked]
 */
import { pool } from '../src/config/db.js';

const args = Object.fromEntries(
	process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const { email, status = 'verified' } = args;
if (!email || !['verified', 'pending', 'rejected', 'revoked'].includes(status)) {
	console.error('Usage: npm run doctor:verify -- --email <email> [--status verified|pending|rejected|revoked]');
	process.exit(1);
}

try {
	const { rows } = await pool.query(
		`UPDATE doctors SET verification_status = $2, verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE verified_at END, updated_at = now()
		 WHERE lower(email) = $1 RETURNING full_name, email, verification_status`,
		[email.trim().toLowerCase(), status],
	);
	if (!rows.length) {
		console.error(`No doctor registered with ${email}.`);
		process.exitCode = 1;
	} else {
		console.log(`${rows[0].full_name} <${rows[0].email}> is now ${rows[0].verification_status}.`);
	}
} catch (error) {
	console.error(`Could not update the doctor: ${error.message}`);
	process.exitCode = 1;
} finally {
	await pool.end();
}
