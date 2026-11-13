/**
 * Doctors viewing and correcting a patient's medical history under consent.
 * Needs a migrated throwaway database (consent rules live in triggers):
 *
 *   TEST_DATABASE_URL=postgresql://postgres:<password>@localhost:5432/osco_test npm test
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';

const TEST_DB = process.env.TEST_DATABASE_URL;

describe('doctor access to patient records', { skip: !TEST_DB && 'set TEST_DATABASE_URL to run' }, () => {
	let pool;
	let server;
	let baseUrl;
	let secret;
	let patient; // { id, publicId, token }
	let doctor; // { id, name, token }
	let documentId;
	let ids; // finding ids: { metformin, allergy, pending }

	const token = (role, id) =>
		jwt.sign({ role }, secret, { algorithm: 'HS256', subject: id, issuer: 'osco-api', audience: `osco-${role}`, expiresIn: '1h' });

	const call = async (method, path, bearer, body) => {
		const response = await fetch(`${baseUrl}${path}`, {
			method,
			headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
			body: body ? JSON.stringify(body) : undefined,
		});
		return { status: response.status, body: await response.json().catch(() => null) };
	};

	const createPatient = async () => {
		const { rows } = await pool.query(
			`INSERT INTO patients (full_name, email, password_hash) VALUES ('Records Patient', $1, 'x') RETURNING id, public_id`,
			[`rp-${randomUUID()}@test.local`],
		);
		return { id: rows[0].id, publicId: rows[0].public_id, token: token('patient', rows[0].id) };
	};

	const createDoctor = async (name = 'Dr Test Mehta') => {
		const { rows } = await pool.query(
			`INSERT INTO doctors (full_name, email, password_hash, license_number, verification_status)
			 VALUES ($1, $2, 'x', $3, 'verified') RETURNING id`,
			[name, `dr-${randomUUID()}@test.local`, `LIC-${randomUUID()}`],
		);
		return { id: rows[0].id, name, token: token('doctor', rows[0].id) };
	};

	const claim = async (patientId, docId, values) => {
		const fingerprint = createHash('sha256').update(randomUUID()).digest('hex');
		const { rows } = await pool.query(
			`INSERT INTO claims (patient_id, document_id, category, name, name_normalised, subject, assertion, action, dose, frequency,
			                     quote, page, quote_start, quote_end, match_type, source_type, extractor_version, fingerprint, review_status)
			 VALUES ($1, $2, $3, $4, lower($4), 'patient', 'present', $5, $6, $7, $8, 1, 0, $9, 'exact', 'ai_extracted', 'test', $10, $11)
			 RETURNING id`,
			[patientId, docId, values.category, values.name, values.action ?? null, values.dose ?? null, values.frequency ?? null,
				values.quote, values.quote.length, fingerprint, values.review],
		);
		return rows[0].id;
	};

	/** Doctor asks, patient decides; returns the request id. */
	const grant = async (requested, approveAs) => {
		const req = await call('POST', '/api/doctor/access-requests', doctor.token, { patientId: patient.publicId, purpose: 'Consultation', access: requested });
		assert.equal(req.status, 201);
		const decision = await call('POST', `/api/access/${req.body.data.request.id}/approve`, patient.token, approveAs ? { access: approveAs } : undefined);
		assert.equal(decision.status, 200, JSON.stringify(decision.body));
		return req.body.data.request.id;
	};

	const endAllSessions = () => pool.query('UPDATE doctor_access_sessions SET revoked_at = now() WHERE patient_id = $1 AND revoked_at IS NULL', [patient.id]);

	before(async () => {
		process.env.NODE_ENV = 'test';
		process.env.DATABASE_URL = TEST_DB;
		process.env.JWT_SECRET ||= 'integration-test-only-secret-0123456789abcdef';
		// An isolated Redis database, so test jobs never reach the real worker's queue.
		process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/2';
		secret = process.env.JWT_SECRET;
		const [{ createApp }, db] = await Promise.all([import('../src/server.js'), import('../src/config/db.js')]);
		pool = db.pool;
		server = createApp().listen(0);
		await new Promise((resolve) => server.once('listening', resolve));
		baseUrl = `http://127.0.0.1:${server.address().port}`;

		patient = await createPatient();
		doctor = await createDoctor();
		const hash = createHash('sha256').update(randomUUID()).digest('hex');
		const { rows } = await pool.query(
			`INSERT INTO documents (patient_id, original_filename, storage_key, mime_type, byte_size, original_sha256, status, document_type)
			 VALUES ($1, 'rx.pdf', $2, 'application/pdf', 100, $3, 'ready', 'prescription') RETURNING id`,
			[patient.id, `${patient.id}/${hash}.pdf`, hash],
		);
		documentId = rows[0].id;
		ids = {
			metformin: await claim(patient.id, documentId, { category: 'medication', name: 'Metformin', action: 'start', dose: '500 mg', frequency: 'twice daily', quote: 'Tab. Metformin 500 mg twice daily', review: 'confirmed' }),
			allergy: await claim(patient.id, documentId, { category: 'allergy', name: 'Penicillin', quote: 'Allergy: Penicillin - rash', review: 'confirmed' }),
			pending: await claim(patient.id, documentId, { category: 'condition', name: 'Hypertension', quote: 'Known hypertension, on treatment', review: 'pending' }),
		};
	});

	after(async () => {
		await new Promise((resolve) => server?.close(resolve));
		await (await import('../src/services/queue.service.js')).closeQueues().catch(() => {});
		await pool?.end();
	});

	test('the patient has a public ID and the doctor lookup shows limited identification only', async () => {
		assert.match(patient.publicId, /^OSCO-[2-9A-HJ-NP-Z]{8}$/);
		const res = await call('POST', '/api/doctor/lookup', doctor.token, { patientId: patient.publicId.toLowerCase() });
		assert.equal(res.status, 200);
		assert.deepEqual(Object.keys(res.body.data.patient).sort(), ['name', 'publicId']);
		assert.equal((await call('POST', '/api/doctor/lookup', doctor.token, { patientId: 'OSCO-ZZZZZZZZ' })).status, 404);
	});

	test('without consent the doctor sees nothing', async () => {
		const res = await call('GET', `/api/doctor/patients/${patient.publicId}/records`, doctor.token);
		assert.equal(res.status, 403);
		assert.equal(res.body.error.code, 'NO_ACCESS');
		const edit = await call('PATCH', `/api/doctor/patients/${patient.publicId}/documents/${documentId}/findings/${ids.metformin}`, doctor.token, { dose: '1 mg' });
		assert.equal(edit.status, 403);
	});

	test('the patient sees the request and can grant view-only instead of edit; edits are then refused', async () => {
		const req = await call('POST', '/api/doctor/access-requests', doctor.token, { patientId: patient.publicId, purpose: 'Consultation', access: 'edit' });
		const list = await call('GET', '/api/access', patient.token);
		const pending = list.body.data.requests.find((r) => r.id === req.body.data.request.id);
		assert.equal(pending.status, 'pending');
		assert.equal(pending.requestedAccess, 'edit');
		assert.equal(pending.doctor.name, doctor.name);

		assert.equal((await call('POST', `/api/access/${pending.id}/approve`, patient.token, { access: 'read' })).status, 200);

		// The doctor portal can pick up the approval after a reload: it is in the doctor's own list.
		const mine = await call('GET', '/api/doctor/access-requests', doctor.token);
		const listed = mine.body.data.requests.find((r) => r.id === pending.id);
		assert.equal(listed.status, 'approved');
		assert.equal(listed.session.active, true);
		const other = await call('GET', '/api/doctor/access-requests', (await createDoctor('Dr Elsewhere')).token);
		assert.ok(!other.body.data.requests.some((r) => r.id === pending.id)); // own requests only
		const status = await call('GET', `/api/doctor/access-requests/${pending.id}`, doctor.token);
		assert.equal(status.body.data.request.status, 'approved');
		assert.equal(status.body.data.request.session.accessLevel, 'read');

		const records = await call('GET', `/api/doctor/patients/${patient.publicId}/records`, doctor.token);
		assert.equal(records.status, 200);
		assert.equal(records.body.data.access.level, 'read');
		// The doctor sees the confirmed history, not what the patient has not reviewed yet.
		assert.deepEqual(records.body.data.findings.map((f) => f.name).sort(), ['Metformin', 'Penicillin']);
		assert.equal(records.body.data.pendingReview, undefined);

		const edit = await call('PATCH', `/api/doctor/patients/${patient.publicId}/documents/${documentId}/findings/${ids.metformin}`, doctor.token, { dose: '1000 mg' });
		assert.equal(edit.status, 403);
		assert.equal(edit.body.error.code, 'EDIT_NOT_PERMITTED');
		await endAllSessions();
	});

	test('a patient cannot grant more than was asked', async () => {
		const req = await call('POST', '/api/doctor/access-requests', doctor.token, { patientId: patient.publicId, purpose: 'Follow-up', access: 'read' });
		const res = await call('POST', `/api/access/${req.body.data.request.id}/approve`, patient.token, { access: 'edit' });
		assert.equal(res.status, 400);
	});

	test('with edit consent, a doctor correction is saved, labelled, audited and shown to the patient', async () => {
		await grant('edit');
		const res = await call('PATCH', `/api/doctor/patients/${patient.publicId}/documents/${documentId}/findings/${ids.metformin}`, doctor.token, {
			name: 'Metformin XR',
			dose: '1000 mg',
		});
		assert.equal(res.status, 200, JSON.stringify(res.body));
		const corrected = res.body.data.finding;
		assert.equal(corrected.sourceType, 'doctor_corrected');
		assert.equal(corrected.verificationStatus, 'doctor_verified');
		assert.equal(corrected.reviewStatus, 'confirmed');
		assert.equal(corrected.supersedesId, ids.metformin);
		assert.deepEqual(corrected.editedBy.type, 'doctor');
		assert.equal(corrected.editedBy.name, doctor.name);
		assert.equal(corrected.quote, 'Tab. Metformin 500 mg twice daily'); // the document's wording stays attached

		// The patient's dashboard shows the doctor's correction; the original is kept in the database.
		const mine = await call('GET', '/api/me/records', patient.token);
		const metformin = mine.body.data.findings.find((f) => f.supersedesId === ids.metformin);
		assert.equal(metformin.dose, '1000 mg');
		assert.equal(metformin.editedBy.name, doctor.name);
		const original = await pool.query('SELECT dose, verification_status FROM claims WHERE id = $1', [ids.metformin]);
		assert.equal(original.rows[0].dose, '500 mg');
		assert.equal(original.rows[0].verification_status, 'corrected');

		const audit = await pool.query(
			`SELECT actor_type, actor_id, details FROM audit_logs WHERE action = 'finding.edit' AND resource_id = $1`,
			[ids.metformin],
		);
		assert.equal(audit.rows[0].actor_type, 'doctor');
		assert.equal(audit.rows[0].actor_id, doctor.id);
		assert.deepEqual([...audit.rows[0].details.changedFields].sort(), ['dose', 'name']);
	});

	test('a doctor removal hides the finding for both, is attributed, and can be undone', async () => {
		const remove = await call('POST', `/api/doctor/patients/${patient.publicId}/documents/${documentId}/findings/${ids.allergy}/dismiss`, doctor.token);
		assert.equal(remove.status, 200);
		assert.equal(remove.body.data.finding.reviewStatus, 'dismissed');
		assert.equal(remove.body.data.finding.reviewedBy.name, doctor.name);

		const mine = await call('GET', '/api/me/records', patient.token);
		assert.ok(!mine.body.data.findings.some((f) => f.id === ids.allergy));
		const doctorView = await call('GET', `/api/doctor/patients/${patient.publicId}/documents/${documentId}`, doctor.token);
		assert.ok(doctorView.body.data.findings.some((f) => f.id === ids.allergy && f.reviewStatus === 'dismissed'));

		const restore = await call('POST', `/api/doctor/patients/${patient.publicId}/documents/${documentId}/findings/${ids.allergy}/restore`, doctor.token);
		assert.equal(restore.body.data.finding.reviewStatus, 'confirmed'); // back where it was
		const again = await call('GET', '/api/me/records', patient.token);
		assert.ok(again.body.data.findings.some((f) => f.id === ids.allergy));
	});

	test("a doctor cannot change findings the patient has not reviewed, or another patient's records", async () => {
		const pending = await call('PATCH', `/api/doctor/patients/${patient.publicId}/documents/${documentId}/findings/${ids.pending}`, doctor.token, { name: 'X' });
		assert.equal(pending.status, 404);

		const other = await createPatient();
		const otherDoc = await call('GET', `/api/doctor/patients/${other.publicId}/documents/${documentId}`, doctor.token);
		assert.equal(otherDoc.status, 403); // no consent from that patient at all

		const secondDoctor = await createDoctor('Dr Other');
		const res = await call('GET', `/api/doctor/patients/${patient.publicId}/records`, secondDoctor.token);
		assert.equal(res.status, 403); // consent is per doctor
	});

	test('when the patient ends access, the doctor is refused on the next request', async () => {
		const list = await call('GET', '/api/access', patient.token);
		const active = list.body.data.requests.find((r) => r.status === 'active');
		assert.ok(active, 'expected an active access');
		assert.equal((await call('POST', `/api/access/sessions/${active.session.id}/end`, patient.token)).status, 200);

		const res = await call('GET', `/api/doctor/patients/${patient.publicId}/records`, doctor.token);
		assert.equal(res.status, 403);
		const denied = await pool.query(
			`SELECT count(*)::int AS n FROM audit_logs WHERE actor_id = $1 AND action = 'patient_record.access' AND details->>'outcome' = 'denied'`,
			[doctor.id],
		);
		assert.ok(denied.rows[0].n >= 2);
	});

	test('patient-side review still works unchanged', async () => {
		const confirm = await call('POST', `/api/documents/${documentId}/confirm`, patient.token);
		assert.equal(confirm.status, 200);
		assert.equal(confirm.body.data.document.review.pending, 0);
		// Patients can view findings but no longer edit them.
		const edit = await call('PATCH', `/api/documents/${documentId}/findings/${ids.pending}`, patient.token, { name: 'Essential hypertension' });
		assert.equal(edit.status, 404);
	});
});
