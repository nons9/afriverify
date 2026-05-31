const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  info: (msg: string, meta?: unknown) => {
    if (isDev) console.log(`[INFO]  ${msg}`, meta ?? '');
    else console.log(JSON.stringify({ level: 'info', msg, ...flatMeta(meta) }));
  },
  warn: (msg: string, meta?: unknown) => {
    if (isDev) console.warn(`[WARN]  ${msg}`, meta ?? '');
    else console.warn(JSON.stringify({ level: 'warn', msg, ...flatMeta(meta) }));
  },
  error: (msg: string, meta?: unknown) => {
    if (isDev) console.error(`[ERROR] ${msg}`, meta ?? '');
    else console.error(JSON.stringify({ level: 'error', msg, ...flatMeta(meta) }));
  },
};

function flatMeta(meta: unknown): Record<string, unknown> {
  if (!meta || typeof meta !== 'object') return {};
  return meta as Record<string, unknown>;
}
