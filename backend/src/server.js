import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pathToFileURL } from 'node:url';
import { checkDatabase, pool } from './config/db.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import accessRoutes from './routes/access.routes.js';
import authRoutes from './routes/auth.routes.js';
import doctorAuthRoutes from './routes/doctorAuth.routes.js';
import doctorRoutes from './routes/doctor.routes.js';
import documentRoutes from './routes/documents.routes.js';
import patientRoutes from './routes/patient.routes.js';
import recordsRoutes from './routes/records.routes.js';
import chatRoutes from './routes/chat.routes.js';
import adminRoutes, { adminAuthRouter } from './routes/admin.routes.js';

export const createApp = () => {
	const app = express();

	app.disable('x-powered-by');
	app.use(helmet());
	app.use(cors({ origin: env.corsOrigins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
	app.use(express.json({ limit: '1mb' }));
	app.use('/api/auth/patient', authRoutes);
	app.use('/api/auth/doctor', doctorAuthRoutes);
	app.use('/api/auth/admin', adminAuthRouter);
	app.use('/api/patients', patientRoutes);
	app.use('/api/access', accessRoutes);
	app.use('/api/documents', documentRoutes);
	app.use('/api/me', recordsRoutes);
	app.use('/api/me', chatRoutes);
	app.use('/api/doctor', doctorRoutes);
	app.use('/api/admin', adminRoutes);

	app.get('/health', (_req, res) => {
		res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
	});

	app.get('/health/db', async (_req, res) => {
		try {
			await checkDatabase();
			res.status(200).json({ status: 'ok', database: 'connected' });
		} catch (error) {
			console.error('Database health check failed:', error.message);
			res.status(503).json({ status: 'error', database: 'unavailable' });
		}
	});

	app.use(notFoundHandler);
	app.use(errorHandler);
	return app;
};

export const startServer = () => {
	const app = createApp();
	const server = app.listen(env.port, () => {
		console.info(`OSCO backend listening on port ${env.port} (${env.nodeEnv}).`);
	});

	const shutdown = (signal) => {
		console.info(`${signal} received; closing server.`);
		server.close(async (error) => {
			if (error) console.error('HTTP server shutdown failed:', error.message);
			try {
				await pool.end();
			} finally {
				process.exitCode = error ? 1 : 0;
			}
		});
	};

	process.once('SIGINT', () => shutdown('SIGINT'));
	process.once('SIGTERM', () => shutdown('SIGTERM'));
	return server;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		startServer();
	} catch (error) {
		console.error(`Backend startup failed: ${error.message}`);
		process.exitCode = 1;
	}
}
