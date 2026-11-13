import { pool } from '../config/db.js';
import { recordAuditSafely, requestIp } from '../services/audit.service.js';
import { requireDoctorAuth } from './auth.js';

const STATUS_MESSAGES = {
	pending: 'Your account is awaiting verification by your hospital.',
	rejected: 'Your registration was rejected by your hospital.',
	revoked: 'Your verification has been revoked by your hospital.',
};

/**
 * Section 7.1, step 3: for doctor routes, read the doctor's CURRENT status from
 * the database on every request. Pending, rejected and revoked doctors are
 * refused, so a revocation takes effect on the very next request instead of
 * when the token expires. Nothing about the status is trusted from the token.
 *
 * Must run after requireDoctorAuth (which sets req.auth.doctorId).
 * On success sets req.doctor = { id, name, verificationStatus }.
 */
export const requireVerifiedDoctor = async (req, res, next) => {
	const doctorId = req.auth?.doctorId;
	if (!doctorId) {
		return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'A valid doctor access token is required.' } });
	}

	let doctor;
	try {
		const result = await pool.query(
			'SELECT id, full_name, verification_status, review_note FROM doctors WHERE id = $1',
			[doctorId],
		);
		doctor = result.rows[0];
	} catch (error) {
		// Fail closed: if the status cannot be read, the request is not allowed.
		return next(error);
	}

	if (!doctor) {
		return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'This doctor account is no longer available.' } });
	}

	if (doctor.verification_status !== 'verified') {
		await recordAuditSafely({
			actorType: 'doctor',
			actorId: doctor.id,
			action: 'doctor.request_blocked',
			resourceType: 'route',
			outcome: 'denied',
			details: { reason: `doctor_${doctor.verification_status}`, method: req.method, path: req.originalUrl },
			ipAddress: requestIp(req),
		});
		return res.status(403).json({
			error: {
				code: 'DOCTOR_NOT_VERIFIED',
				status: doctor.verification_status,
				message: [STATUS_MESSAGES[doctor.verification_status] ?? 'Your account is not verified.', doctor.review_note ? `Reason: ${doctor.review_note}` : null]
					.filter(Boolean)
					.join(' '),
			},
		});
	}

	req.doctor = { id: doctor.id, name: doctor.full_name, verificationStatus: doctor.verification_status };
	return next();
};

/** Token check + live status check, in order. Use on every doctor-only route. */
export const doctorOnly = [requireDoctorAuth, requireVerifiedDoctor];
