/**
 * Hospital admin: login, doctor review list, verify / reject / revoke.
 * Needs a migrated throwaway database:
 *
 *   TEST_DATABASE_URL=postgresql://postgres:<password>@localhost:5432/osco_test npm test
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

const TEST_DB = process.env.TEST_DATABASE_URL;

describe('hospital admin', { skip: !TEST_DB && 'set TEST_DATABASE_URL to run' }, () => {
	let pool;
	let server;
	let baseUrl;
	let adminToken;
	let doctor;
	const adminEmail = `admin-${randomUUID()}@test.local`;

	const call = async (method, path, body, token) => {
		const response = await fetch(`${baseUrl}${path}`, {
			method,
			headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
			body: body ? JSON.stringify(body) : undefined,
		});
		return { status: response.status, body: await response.json().catch(() => null) };
	};
	const setStatus = (status, note) => call('POST', `/api/admin/doctors/${doctor.id}/status`, { status, note }, adminToken);

	before(async () => {
		process.env.NODE_ENV = 'test';
		process.env.DATABASE_URL = TEST_DB;
		process.env.JWT_SECRET ||= 'integration-test-only-secret-0123456789abcdef';
		process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/2';
		const [{ createApp }, db] = await Promise.all([import('../src/server.js'), import('../src/config/db.js')]);
		pool = db.pool;
		server = createApp().listen(0);
		await new Promise((resolve) => server.once('listening', resolve));
		baseUrl = `http://127.0.0.1:${server.address().port}`;

		await pool.query('INSERT INTO admins (full_name, email, password_hash) VALUES ($1, $2, $3)', ['Test Admin', adminEmail, await bcrypt.hash('Admin@12345', 4)]);
		const reg = await call('POST', '/api/auth/doctor/register', {
			name: 'Dr Review', email: `dr-review-${randomUUID()}@test.local`, password: 'Doctor@12345', licenseNumber: `REV-${randomUUID().slice(0, 8)}`,
		});
		doctor = { id: reg.body.data.doctor.id, token: reg.body.data.token };
	});

	after(async () => {
		await new Promise((resolve) => server?.close(resolve));
		await (await import('../src/services/queue.service.js')).closeQueues().catch(() => {});
		await pool?.end();
	});

	test('admin login: wrong password refused, right password gives an admin token', async () => {
		assert.equal((await call('POST', '/api/auth/admin/login', { email: adminEmail, password: 'wrong-password' })).status, 401);
		const ok = await call('POST', '/api/auth/admin/login', { email: adminEmail.toUpperCase(), password: 'Admin@12345' });
		assert.equal(ok.status, 200);
		assert.equal(ok.body.data.admin.name, 'Test Admin');
		adminToken = ok.body.data.token;
	});

	test('admin routes refuse missing, doctor and patient tokens', async () => {
		assert.equal((await call('GET', '/api/admin/doctors')).status, 401);
		assert.equal((await call('GET', '/api/admin/doctors', null, doctor.token)).status, 401);
		const fakePatient = jwt.sign({ role: 'patient' }, process.env.JWT_SECRET, { algorithm: 'HS256', subject: randomUUID(), issuer: 'osco-api', audience: 'osco-patient', expiresIn: '1h' });
		assert.equal((await call('GET', '/api/admin/doctors', null, fakePatient)).status, 401);
		// A well-formed admin token for an account that does not exist.
		const ghost = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { algorithm: 'HS256', subject: randomUUID(), issuer: 'osco-api', audience: 'osco-admin', expiresIn: '1h' });
		assert.equal((await call('GET', '/api/admin/doctors', null, ghost)).status, 401);
	});

	test('pending doctors are listed with their licence number and counts', async () => {
		const res = await call('GET', '/api/admin/doctors?status=pending', null, adminToken);
		assert.equal(res.status, 200);
		const row = res.body.data.doctors.find((d) => d.id === doctor.id);
		assert.ok(row, 'new doctor is in the pending list');
		assert.match(row.licenseNumber, /^REV-/);
		assert.ok(res.body.data.counts.pending >= 1);
		assert.equal((await call('GET', '/api/admin/doctors?status=bogus', null, adminToken)).status, 400);
	});

	test('reject needs a reason; the doctor then sees it and stays blocked', async () => {
		assert.equal((await setStatus('rejected')).status, 400);
		const res = await setStatus('rejected', 'Licence number could not be confirmed.');
		assert.equal(res.status, 200);
		assert.equal(res.body.data.doctor.status, 'rejected');
		assert.equal(res.body.data.doctor.reviewedBy, 'Test Admin');
		const blocked = await call('GET', '/api/doctor/me', null, doctor.token);
		assert.equal(blocked.status, 403);
		assert.match(blocked.body.error.message, /Licence number could not be confirmed/);
	});

	test('verify unblocks the doctor; revoke blocks again; invalid changes are refused', async () => {
		assert.equal((await setStatus('verified')).status, 200);
		assert.equal((await call('GET', '/api/doctor/me', null, doctor.token)).status, 200);
		assert.equal((await setStatus('rejected', 'x')).status, 409); // verified -> rejected is not a valid step
		assert.equal((await setStatus('revoked', 'Left the hospital.')).status, 200);
		assert.equal((await call('GET', '/api/doctor/me', null, doctor.token)).status, 403);
		assert.equal((await call('POST', `/api/admin/doctors/${randomUUID()}/status`, { status: 'verified' }, adminToken)).status, 404);

		const audit = await pool.query(`SELECT action FROM audit_logs WHERE actor_type = 'admin' AND resource_id = $1 ORDER BY created_at`, [doctor.id]);
		assert.deepEqual(audit.rows.map((r) => r.action), ['doctor.reject', 'doctor.verify', 'doctor.revoke']);
	});
});
