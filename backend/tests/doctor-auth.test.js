/**
 * Doctor self-registration: accounts start pending and cannot reach patient
 * routes until verified. Needs a migrated throwaway database:
 *
 *   TEST_DATABASE_URL=postgresql://postgres:<password>@localhost:5432/osco_test npm test
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const TEST_DB = process.env.TEST_DATABASE_URL;

describe('doctor sign-up', { skip: !TEST_DB && 'set TEST_DATABASE_URL to run' }, () => {
	let pool;
	let server;
	let baseUrl;
	const email = `dr-signup-${randomUUID()}@test.local`;
	const licence = `TEST-${randomUUID().slice(0, 8)}`;

	const call = async (method, path, body, token) => {
		const response = await fetch(`${baseUrl}${path}`, {
			method,
			headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
			body: body ? JSON.stringify(body) : undefined,
		});
		return { status: response.status, body: await response.json().catch(() => null) };
	};

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
	});

	after(async () => {
		await new Promise((resolve) => server?.close(resolve));
		await (await import('../src/services/queue.service.js')).closeQueues().catch(() => {});
		await pool?.end();
	});

	test('rejects missing or invalid fields', async () => {
		assert.equal((await call('POST', '/api/auth/doctor/register', { name: 'Dr X', email, password: 'Doctor@12345' })).status, 400);
		assert.equal((await call('POST', '/api/auth/doctor/register', { name: 'Dr X', email: 'nope', password: 'Doctor@12345', licenseNumber: licence })).status, 400);
		assert.equal((await call('POST', '/api/auth/doctor/register', { name: 'Dr X', email, password: 'short', licenseNumber: licence })).status, 400);
		assert.equal((await call('POST', '/api/auth/doctor/register', { name: 'Dr X', email, password: 'Doctor@12345', licenseNumber: '!!' })).status, 400);
	});

	test('a new doctor is pending and cannot reach patient routes until verified', async () => {
		const reg = await call('POST', '/api/auth/doctor/register', { name: '  Dr Signup ', email: email.toUpperCase(), password: 'Doctor@12345', licenseNumber: licence });
		assert.equal(reg.status, 201, JSON.stringify(reg.body));
		assert.equal(reg.body.data.doctor.verificationStatus, 'pending');
		assert.equal(reg.body.data.doctor.name, 'Dr Signup');
		assert.equal(reg.body.data.doctor.email, email);
		const token = reg.body.data.token;

		const blocked = await call('GET', '/api/doctor/me', null, token);
		assert.equal(blocked.status, 403);

		// Same email or licence again: refused.
		assert.equal((await call('POST', '/api/auth/doctor/register', { name: 'Dr Y', email, password: 'Doctor@12345', licenseNumber: 'OTHER-123' })).status, 409);
		const dupLicence = await call('POST', '/api/auth/doctor/register', { name: 'Dr Y', email: `other-${email}`, password: 'Doctor@12345', licenseNumber: licence.toLowerCase() });
		assert.equal(dupLicence.status, 409);

		const login = await call('POST', '/api/auth/doctor/login', { email, password: 'Doctor@12345' });
		assert.equal(login.status, 200);
		assert.equal(login.body.data.doctor.verificationStatus, 'pending');

		await pool.query(`UPDATE doctors SET verification_status = 'verified', verified_at = now() WHERE email = $1`, [email]);
		assert.equal((await call('GET', '/api/doctor/me', null, token)).status, 200);
	});
});
