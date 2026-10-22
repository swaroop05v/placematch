// Runs every db/*.sql file in order: drops and recreates the whole schema.
import fs from 'node:fs';
import path from 'node:path';
import { getClient } from './lib.mjs';

const dir = path.join(process.cwd(), 'db');
const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();

const client = getClient();
await client.connect();
try {
  for (const file of files) {
    process.stdout.write(`Running ${file} ... `);
    await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    console.log('done');
  }
  console.log('Schema ready. Next: npm run db:seed');
} catch (err) {
  console.error('\nFAILED:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
