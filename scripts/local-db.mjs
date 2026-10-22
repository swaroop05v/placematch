// Offline fallback: an embedded PostgreSQL (PGlite, Postgres compiled to WASM) with the
// pgvector extension, exposed on a normal Postgres TCP port so `pg` / the app can connect.
// Data is persisted in ./.pglite.  Usage:  npm run db:local   (leave it running)
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const port = Number(process.env.LOCAL_DB_PORT ?? 5433);

const db = await PGlite.create({ dataDir: './.pglite', extensions: { vector } });

// Protocol shim: after an error in an extended-protocol message (Parse/Bind/Execute...),
// real PostgreSQL discards messages until Sync and sends ONE ReadyForQuery. PGlite sends
// ReadyForQuery straight after the error and again on Sync, which desynchronises clients
// such as `pg`. Here we strip the early ReadyForQuery and skip messages until Sync.
const EXTENDED = new Set([0x50, 0x42, 0x44, 0x45, 0x43, 0x48]); // P B D E C H
const SYNC = 0x53;
const raw = db.execProtocolRawStream.bind(db);
let failedUntilSync = false;
db.execProtocolRawStream = async (msg, opts) => {
  const tag = msg[0];
  if (tag === SYNC) {
    failedUntilSync = false;
    return raw(msg, opts);
  }
  if (!EXTENDED.has(tag)) return raw(msg, opts);
  if (failedUntilSync) return;

  const chunks = [];
  const result = await raw(msg, { ...opts, onRawData: (d) => chunks.push(Buffer.from(d)) });
  let out = Buffer.concat(chunks);
  const parts = [];
  for (let i = 0; i + 5 <= out.length; i += 1 + out.readInt32BE(i + 1)) {
    parts.push(out.subarray(i, i + 1 + out.readInt32BE(i + 1)));
  }
  if (parts.some((p) => p[0] === 0x45 /* ErrorResponse */)) {
    failedUntilSync = true;
    out = Buffer.concat(parts.filter((p) => p[0] !== 0x5a /* ReadyForQuery */));
  }
  if (out.length) opts.onRawData(new Uint8Array(out));
  return result;
};

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 10 });
await server.start();

console.log(`Local PostgreSQL (PGlite + pgvector) listening on 127.0.0.1:${port}`);
console.log(`DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
