import 'dotenv/config';
import cors from 'cors';
import express from 'express';

import { pool } from './src/db.js';
import { isSttConfigured } from './src/lib/stt.js';
import { isTtsConfigured } from './src/lib/tts.js';
import { authRouter } from './src/routes/auth.js';
import { customersRouter } from './src/routes/customers.js';
import { insightsRouter } from './src/routes/insights.js';
import { itemsRouter } from './src/routes/items.js';
import { ledgerRouter } from './src/routes/ledger.js';

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json({ limit: '8mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    return res.json({
      ok: true,
      service: 'sautiledger',
      db: 'up',
      stt: isSttConfigured() ? 'elevenlabs' : 'unset',
      tts: isTtsConfigured() ? 'elevenlabs' : 'unset',
    });
  } catch {
    return res.status(503).json({ ok: false, service: 'sautiledger', db: 'down' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/items', itemsRouter);
app.use('/api/customers', customersRouter);
app.use('/api', ledgerRouter);
app.use('/api', insightsRouter);

app.use((_req, res) => {
  res.status(404).json({ message: 'That endpoint does not exist.' });
});

app.use((error, _req, res, _next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ message: 'Something went wrong on our side. Please try again.' });
});

const server = app.listen(PORT, () => {
  console.log(`SautiLedger API listening on http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. On macOS, AirPlay Receiver often binds 5000. ` +
        'Set PORT in backend/.env or disable AirPlay Receiver.'
    );
    process.exit(1);
  }
  throw error;
});
