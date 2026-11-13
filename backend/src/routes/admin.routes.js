import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { isUuid, requireAdminAuth } from '../middleware/auth.js';
import { recordAudit, recordAuditSafely, requestIp } from '../services/audit.service.js';

/**
 * Hospital admin (MVP document 5.3): reviews doctor registrations.
 *
 *   POST /api/auth/admin/login                 (authRouter)
 *   GET  /api/admin/me
 *   GET  /api/admin/doctors?status=pending|verified|rejected|revoked|all
 *   POST /api/admin/doctors/:id/status         { status: 'verified' | 'rejected' | 'revoked', note? }
 *
 * There is no admin self-registration: accounts come from `npm run admin:create`.
 */

const PASSWORD_MAX_BYTES = 72;
const DUMMY_PASSWORD_HASH = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);
const STATUSES = ['pending', 'verified', 'rejected', 'revoked'];

/** Allowed review decisions from each current status. */
const TRANSITIONS = {
	pending: ['verified', 'rejected'],
	verified: ['revoked'],
	rejected: ['verified'],
	revoked: ['verified'],
};

const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });

const issueAdminToken = (adminId) =>
	jwt.sign({ role: 'admin' }, env.jwtSecret, { algorithm: 'HS256', subject: adminId, issuer: 'osco-api', audience: 'osco-admin', expiresIn: '1h' });

const publicAdmin = (row) => ({ id: row.id, name: row.full_name, email: row.email });

const publicDoctor = (row) => ({
	id: row.id,
	name: row.full_name,
	email: row.email,
	licenseNumber: row.license_number,
	status: row.verification_status,
	registeredAt: row.created_at,
	verifiedAt: row.verified_at,
	reviewedAt: row.reviewed_at,
	reviewedBy: row.reviewer_name ?? null,
	note: row.review_note,
});

// ---------------------------------------------------------------- login

export const adminAuthRouter = Router();

adminAuthRouter.post('/login', async (req, res, next) => {
	const { email, password } = req.body ?? {};
	const invalid = () => fail(res, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
	if (typeof email !== 'string' || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return invalid();
	try {
		const { rows } = await pool.query('SELECT id, full_name, email, password_hash FROM admins WHERE lower(email) = $1 LIMIT 1', [email.trim().toLowerCase()]);
		const admin = rows[0];
		// Compare against a dummy hash when the account does not exist, so timing does not reveal it.
		const ok = await bcrypt.compare(password, admin?.password_hash ?? DUMMY_PASSWORD_HASH);
		if (!admin || !ok) return invalid();
		await recordAuditSafely({ actorType: 'admin', actorId: admin.id, action: 'admin.login', resourceType: 'session', outcome: 'allowed', ipAddress: requestIp(req) });
		return res.status(200).json({ data: { token: issueAdminToken(admin.id), admin: publicAdmin(admin) } });
	} catch (error) {
		return next(error);
	}
});

// ---------------------------------------------------------------- admin routes

const router = Router();

/** Valid admin token AND the account still exists. */
const requireAdmin = [
	requireAdminAuth,
	async (req, res, next) => {
		try {
			const { rows } = await pool.query('SELECT id, full_name, email FROM admins WHERE id = $1', [req.auth.adminId]);
			if (!rows[0]) return fail(res, 401, 'UNAUTHORIZED', 'A valid admin access token is required.');
			req.admin = rows[0];
			return next();
		} catch (error) {
			return next(error);
		}
	},
];

router.use(requireAdmin);

router.get('/me', (req, res) => res.json({ data: { admin: publicAdmin(req.admin) } }));

router.get('/doctors', async (req, res, next) => {
	const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
	if (status !== 'all' && !STATUSES.includes(status)) return fail(res, 400, 'INVALID_INPUT', `status must be one of ${STATUSES.join(', ')} or all.`);
	try {
		const [list, counts] = await Promise.all([
			pool.query(
				`SELECT d.id, d.full_name, d.email, d.license_number, d.verification_status, d.created_at, d.verified_at,
				        d.reviewed_at, d.review_note, a.full_name AS reviewer_name
				   FROM doctors d LEFT JOIN admins a ON a.id = d.reviewed_by
				  WHERE ($1 = 'all' OR d.verification_status = $1)
				  ORDER BY CASE WHEN d.verification_status = 'pending' THEN d.created_at END ASC NULLS LAST,
				           coalesce(d.reviewed_at, d.created_at) DESC
				  LIMIT 500`,
				[status],
			),
			pool.query('SELECT verification_status, count(*)::int AS n FROM doctors GROUP BY verification_status'),
		]);
		const totals = Object.fromEntries(STATUSES.map((s) => [s, 0]));
		for (const row of counts.rows) totals[row.verification_status] = row.n;
		return res.json({ data: { doctors: list.rows.map(publicDoctor), counts: totals } });
	} catch (error) {
		return next(error);
	}
});

router.post('/doctors/:id/status', async (req, res, next) => {
	const { id } = req.params;
	const { status, note } = req.body ?? {};
	if (!isUuid(id)) return fail(res, 404, 'NOT_FOUND', 'Doctor not found.');
	if (!['verified', 'rejected', 'revoked'].includes(status)) return fail(res, 400, 'INVALID_INPUT', 'status must be verified, rejected or revoked.');
	if (note != null && (typeof note !== 'string' || note.trim().length > 500)) return fail(res, 400, 'INVALID_INPUT', 'The note can be up to 500 characters.');
	const reason = typeof note === 'string' && note.trim() ? note.trim() : null;
	if (status !== 'verified' && !reason) return fail(res, 400, 'INVALID_INPUT', 'Give a reason when rejecting or revoking, so the doctor knows why.');

	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const current = await client.query('SELECT verification_status FROM doctors WHERE id = $1 FOR UPDATE', [id]);
		if (!current.rows[0]) {
			await client.query('ROLLBACK');
			return fail(res, 404, 'NOT_FOUND', 'Doctor not found.');
		}
		const from = current.rows[0].verification_status;
		if (!TRANSITIONS[from]?.includes(status)) {
			await client.query('ROLLBACK');
			return fail(res, 409, 'INVALID_TRANSITION', `A ${from} doctor cannot be changed to ${status}.`);
		}
		// Revoking ends the doctor's active patient access in the same transaction (trigger from migration 004).
		const { rows } = await client.query(
			`UPDATE doctors
			    SET verification_status = $2,
			        verified_at = CASE WHEN $2 = 'verified' THEN now() ELSE verified_at END,
			        revoked_at = CASE WHEN $2 = 'revoked' THEN now() ELSE revoked_at END,
			        reviewed_by = $3, reviewed_at = now(), review_note = $4, updated_at = now()
			  WHERE id = $1
			  RETURNING id, full_name, email, license_number, verification_status, created_at, verified_at, reviewed_at, review_note`,
			[id, status, req.admin.id, reason],
		);
		await recordAudit(
			{
				actorType: 'admin', actorId: req.admin.id, action: `doctor.${status === 'verified' ? 'verify' : status === 'rejected' ? 'reject' : 'revoke'}`,
				resourceType: 'doctor', resourceId: id, outcome: 'allowed', details: { from, to: status }, ipAddress: requestIp(req),
			},
			client,
		);
		await client.query('COMMIT');
		return res.json({ data: { doctor: publicDoctor({ ...rows[0], reviewer_name: req.admin.full_name }) } });
	} catch (error) {
		await client.query('ROLLBACK').catch(() => {});
		return next(error);
	} finally {
		client.release();
	}
});

export default router;
