/**
 * Create a hospital admin account. Admins verify doctor registrations in the
 * admin portal (/admin). There is deliberately no admin self-registration.
 *
 *   npm run admin:create -- --email admin@hospital.example --password "a-long-password" --name "Hospital Admin"
 */
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/db.js';

const args = Object.fromEntries(
	process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const { email, password, name } = args;
if (!email || !password || !name) {
	console.error('Usage: npm run admin:create -- --email <email> --password <password> --name "<full name>"');
	process.exit(1);
}
if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
	console.error('Password must be 8 to 72 bytes long.');
	process.exit(1);
}

try {
	const hash = await bcrypt.hash(password, 12);
	const { rows } = await pool.query(
		'INSERT INTO admins (full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING full_name, email',
		[name.trim(), email.trim().toLowerCase(), hash],
	);
	console.log(`Created admin ${rows[0].full_name} <${rows[0].email}>. Sign in at /admin/login.`);
} catch (error) {
	if (error.code === '23505') console.error('An admin with this email already exists.');
	else console.error(`Could not create the admin: ${error.message}`);
	process.exitCode = 1;
} finally {
	await pool.end();
}
