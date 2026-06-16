import { Hono } from 'hono';
import { cors } from 'hono/cors';
import admin from './routes/admin';
import media from './routes/media';
import v1 from './routes/v1';
import { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use(
	'*',
	cors({
		origin: ['http://localhost:5173', 'https://pteprep.com.np'],
		allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
		allowHeaders: ['Content-Type', 'X-Admin-Key', 'Authorization'],
	}),
);

app.route('/admin', admin);
app.route('/media', media);
app.route('/v1', v1);

app.get('/', (c) => c.json({ service: 'pteprep-api', status: 'running' }));

export default app;
