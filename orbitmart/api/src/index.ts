import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { webhooksRouter } from './routes/webhooks';
import { usersRouter } from './routes/users';
import { sellersRouter } from './routes/sellers';
import { productsRouter } from './routes/products';
import { categoriesRouter } from './routes/categories';

const app = express();
const PORT = parseInt(process.env.PORT ?? '4000', 10);

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3002').split(',');

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Raw body for Svix webhook verification
app.use('/v1/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'orbitmart-api', ts: new Date().toISOString() });
});

app.use('/v1/webhooks', webhooksRouter);
app.use('/v1/users', usersRouter);
app.use('/v1/sellers', sellersRouter);
app.use('/v1/products', productsRouter);
app.use('/v1/categories', categoriesRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

app.listen(PORT, () => {
  console.log(`OrbitMart API running on port ${PORT}`);
});

export default app;
