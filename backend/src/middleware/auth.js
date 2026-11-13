import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const unauthorized = (res, who) =>
	res.status(401).json({
		error: { code: 'UNAUTHORIZED', message: `A valid ${who} access token is required.` },
	});

/**
 * Verify the bearer token for one role (section 7.1, steps 1 and 2).
 * Patient tokens are rejected on doctor routes and vice versa, because each role
 * has its own audience as well as its own role claim.
 * @returns {string | null} the subject (account id) when valid
 */
const verifyBearer = (req, role) => {
	const match = /^Bearer\s+([^\s]+)$/i.exec(req.get('authorization') || '');
	if (!match) return null;
	try {
		const claims = jwt.verify(match[1], env.jwtSecret, {
			algorithms: ['HS256'],
			issuer: 'osco-api',
			audience: `osco-${role}`,
		});
		if (typeof claims === 'string' || claims.role !== role || typeof claims.sub !== 'string' || !UUID.test(claims.sub)) {
			return null;
		}
		return claims.sub;
	} catch {
		return null;
	}
};

export const requirePatientAuth = (req, res, next) => {
	const patientId = verifyBearer(req, 'patient');
	if (!patientId) return unauthorized(res, 'patient');
	req.auth = { patientId };
	return next();
};

/**
 * Authenticates a doctor token only. Doctor routes must also use
 * requireVerifiedDoctor, which checks the doctor's current status in the database.
 */
export const requireDoctorAuth = (req, res, next) => {
	const doctorId = verifyBearer(req, 'doctor');
	if (!doctorId) return unauthorized(res, 'doctor');
	req.auth = { doctorId };
	return next();
};

/**
 * Authenticates a hospital admin token. Admin routes also confirm the account still
 * exists (requireAdmin in admin.routes.js), so a deleted admin loses access at once.
 */
export const requireAdminAuth = (req, res, next) => {
	const adminId = verifyBearer(req, 'admin');
	if (!adminId) return unauthorized(res, 'admin');
	req.auth = { adminId };
	return next();
};

export const isUuid = (value) => typeof value === 'string' && UUID.test(value);
