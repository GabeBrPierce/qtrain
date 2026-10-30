// Minimal D1 binding over node:sqlite, enough for worker/src/db.js in tests.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function stmt(db, sql, args) {
  const exec = () => {
    const s = db.prepare(sql);
    return /^\s*(select|with)/i.test(sql) ? { rows: s.all.apply(s, args) } : { info: s.run.apply(s, args) };
  };
  return {
    bind: (...a) => stmt(db, sql, a),
    first: col => Promise.resolve().then(() => { const r = exec().rows[0] || null; return r && col ? r[col] : r; }),
    all: () => Promise.resolve().then(() => ({ results: exec().rows })),
    run: () => Promise.resolve().then(() => ({ meta: { changes: Number(exec().info.changes) } })),
    _exec: exec,
  };
}

function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'worker', 'schema.sql'), 'utf8'));
  return {
    raw: db,
    prepare: sql => stmt(db, sql, []),
    batch: stmts => Promise.resolve().then(() => {
      db.exec('BEGIN');
      try {
        const out = stmts.map(s => {
          const r = s._exec();
          return r.rows ? { results: r.rows, meta: { changes: 0 } } : { meta: { changes: Number(r.info.changes) } };
        });
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }),
  };
}

module.exports = { createD1 };
