#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const pool = require('./connection');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations() {
  try {
    // Create migrations table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Get executed migrations
    const { rows: executed } = await pool.query(
      'SELECT name FROM migrations ORDER BY id'
    );
    const executedNames = new Set(executed.map(r => r.name));

    // Read migration files
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.log('[migrate] No migrations directory found');
      return;
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Execute pending migrations
    for (const file of files) {
      if (executedNames.has(file)) {
        console.log(`[migrate] ✓ ${file} (already executed)`);
        continue;
      }

      console.log(`[migrate] → Running ${file}...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`[migrate] ✓ ${file} executed successfully`);
      } catch (err) {
        await pool.query('ROLLBACK');
        console.error(`[migrate] ✗ ${file} failed:`, err.message);
        throw err;
      }
    }

    console.log('[migrate] All migrations completed');
  } catch (err) {
    console.error('[migrate] Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
