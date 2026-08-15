const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.connect()
  .then(() => {
    console.log('Connected. Adding column...');
    return client.query('ALTER TABLE checkpoints ADD COLUMN IF NOT EXISTS color text;');
  })
  .then(() => { console.log('SUCCESS: color column added.'); return client.end(); })
  .catch((err) => { console.error('ERROR:', err.message); process.exit(1); });
