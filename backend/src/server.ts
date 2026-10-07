import 'dotenv/config';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { appRoot, config } from './config';
import { api } from './routes';

const app = express();
app.disable('x-powered-by');
app.use('/api/import', express.json({ limit: '3mb' })); // a piece of a sheet with long job descriptions is bigger than the normal limit
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
  next();
});
// state-changing calls must be JSON: a plain cross-site form post cannot send that
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && !req.is('application/json')) return void res.status(415).json({ error: 'JSON only' });
  next();
});
app.use('/api', api);
app.use(express.static(path.join(appRoot, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') })); // revalidate, so a deploy is seen without a hard reload

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return void res.status(400).json({ error: 'Invalid request', issues: err.issues.map((i) => i.message) });
  console.error('request failed', (err as Error)?.message);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(config.port, () => console.log(`http://localhost:${config.port}`));
