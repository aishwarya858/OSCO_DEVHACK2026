import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { recordAuditSafely, requestIp } from '../services/audit.service.js';

/**
 * POST /api/auth/doctor/register  create an account; it starts 'pending' (MVP 5.3)
 * POST /api/auth/doctor/login     (MVP document 6.2.1, 8.9).
 *
 * Pending, rejected and revoked doctors can log in and see their status; they
 * are refused on every doctor route by requireVerifiedDoctor, which reads the
 * status from the database on each request. The token carries no status.
 */
const router = Router();
const PASSWORD_MAX_BYTES = 72;
const DUMMY_PASSWORD_HASH = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);

const STATUS_MESSAGES = {
	pending: 'Your account is awaiting verification by your hospital.',
	verified: null,
	rejected: 'Your registration was rejected by your hospital.',
	revoked: 'Your verification has been revoked by your hospital.',
};

const issueDoctorToken = (doctorId) =>
	jwt.sign({ role: 'doctor' }, env.jwtSecret, {
		algorithm: 'HS256',
		subject: doctorId,
		issuer: 'osco-api',
		audience: 'osco-doctor',
		expiresIn: '1h',
	});

const BCRYPT_ROUNDS = 12;
const isEmail = (email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const invalidInput = (res, message) => res.status(400).json({ error: { code: 'INVALID_INPUT', message } });

const sessionBody = (doctor) => ({
	data: {
		token: issueDoctorToken(doctor.id),
		doctor: {
			id: doctor.id,
			name: doctor.full_name,
			email: doctor.email,
			verificationStatus: doctor.verification_status,
			// A rejected or revoked doctor also sees the admin's reason.
			statusMessage: [STATUS_MESSAGES[doctor.verification_status], doctor.review_note && doctor.verification_status !== 'verified' ? `Reason: ${doctor.review_note}` : null]
				.filter(Boolean)
				.join(' ') || null,
		},
	},
});

/**
 * Self-registration. The account is always created as 'pending': the doctor can
 * sign in and see their status, but every patient route stays closed
 * (requireVerifiedDoctor) until their hospital verifies them.
 */
router.post('/register', async (req, res, next) => {
	const { name, email, password, licenseNumber } = req.body ?? {};
	if ([name, email, password, licenseNumber].some((v) => typeof v !== 'string')) {
		return invalidInput(res, 'Name, email, medical licence number and password are required.');
	}
	const fullName = name.trim();
	const normalizedEmail = email.trim().toLowerCase();
	const licence = licenseNumber.trim().toUpperCase();
	if (!fullName || fullName.length > 150) return invalidInput(res, 'Name must be between 1 and 150 characters.');
	if (!isEmail(normalizedEmail)) return invalidInput(res, 'Enter a valid email address.');
	if (!/^[A-Z0-9][A-Z0-9/.-]{3,39}$/.test(licence)) return invalidInput(res, 'Enter a valid medical licence / registration number (4–40 letters, digits, / . -).');
	if (password.length < 8 || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
		return invalidInput(res, 'Password must be at least 8 characters and no more than 72 UTF-8 bytes.');
	}
	try {
		const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
		const { rows } = await pool.query(
			`INSERT INTO doctors (full_name, email, password_hash, license_number, verification_status)
			 VALUES ($1, $2, $3, $4, 'pending')
			 RETURNING id, full_name, email, verification_status`,
			[fullName, normalizedEmail, passwordHash, licence],
		);
		const doctor = rows[0];
		await recordAuditSafely({
			actorType: 'doctor', actorId: doctor.id, action: 'doctor.register', resourceType: 'doctor', resourceId: doctor.id,
			outcome: 'allowed', details: { status: doctor.verification_status }, ipAddress: requestIp(req),
		});
		return res.status(201).json(sessionBody(doctor));
	} catch (error) {
		if (error.code === '23505') {
			const licenceTaken = /licen[sc]e/i.test(error.constraint ?? '');
			return res.status(409).json({
				error: {
					code: 'ACCOUNT_EXISTS',
					message: licenceTaken ? 'A doctor with this licence number is already registered.' : 'An account with this email already exists.',
				},
			});
		}
		return next(error);
	}
});

const invalid = (res) => res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });

router.post('/login', async (req, res, next) => {
	const { email, password } = req.body ?? {};
	if (typeof email !== 'string' || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
		return invalid(res);
	}
	try {
		const { rows } = await pool.query(
			'SELECT id, full_name, email, password_hash, verification_status, review_note FROM doctors WHERE lower(email) = $1 LIMIT 1',
			[email.trim().toLowerCase()],
		);
		const doctor = rows[0];
		// Compare against a dummy hash when the account does not exist, so timing does not reveal it.
		const ok = await bcrypt.compare(password, doctor?.password_hash ?? DUMMY_PASSWORD_HASH);
		if (!doctor || !ok) return invalid(res);

		await recordAuditSafely({
			actorType: 'doctor', actorId: doctor.id, action: 'doctor.login', resourceType: 'session',
			outcome: 'allowed', details: { status: doctor.verification_status }, ipAddress: requestIp(req),
		});
		return res.status(200).json(sessionBody(doctor));
	} catch (error) {
		return next(error);
	}
});

export default router;
