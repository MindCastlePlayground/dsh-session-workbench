import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const SIGNATURE_VERSION = 1
const BATCH_SIZE = 8
const SCAN_BATCH_SIZE = 32

function searchableText(entry) {
  const parts = [entry.title]
  for (const question of entry.questions) {
    for (const part of question.parts) parts.push(part.text, ...part.files)
    for (const paragraph of question.paragraphs) parts.push(paragraph.text, ...paragraph.files)
  }
  return parts.join('\n').toLowerCase().replaceAll('\0', '\n')
}

function sessionSignature(header, record, source) {
  const persisted = record.revision ?? record.sizeBytes ?? record.updatedAt
  if (source !== null) return JSON.stringify([SIGNATURE_VERSION, header, persisted, source])
  return persisted == null ? null : JSON.stringify([SIGNATURE_VERSION, header, persisted])
}

export function createDiskIndex({ filename, catalog, read, readLive, reportError }) {
  let building = null
  let revision = 0
  let buildMs = 0
  let size = 0
  let progress = { active: false, done: 0, total: 0 }

  async function open({ readOnly = false } = {}) {
    const { DatabaseSync } = await import('node:sqlite')
    if (!readOnly) await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
    const db = new DatabaseSync(filename, { readOnly })
    try {
      if (readOnly) {
        db.exec('PRAGMA busy_timeout=5000')
        return db
      }
      db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL')
      db.exec([
        'CREATE TABLE IF NOT EXISTS sessions (id TEXT NOT NULL UNIQUE, created INTEGER NOT NULL, signature TEXT, payload TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)',
        'CREATE VIRTUAL TABLE IF NOT EXISTS body USING fts5(text, tokenize="trigram case_sensitive 1")',
        'CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL)',
      ].join(';'))
      return db
    } catch (error) {
      db.close()
      throw error
    }
  }

  function transaction(db, write) {
    db.exec('BEGIN IMMEDIATE')
    try {
      write()
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  async function rebuild(force) {
    const started = Date.now()
    progress = { active: true, done: 0, total: 0 }
    let db
    try {
      const records = await catalog()
      db = await open()
      progress.total = records.length
      const previous = new Map(db.prepare('SELECT id, signature FROM sessions').all().map(row => [row.id, row.signature]))
      const put = db.prepare([
        'INSERT INTO sessions (id,created,signature,payload) VALUES (?,?,?,?)',
        'ON CONFLICT(id) DO UPDATE SET created=excluded.created, signature=excluded.signature, payload=excluded.payload',
        'RETURNING rowid',
      ].join(' '))
      const removeText = db.prepare('DELETE FROM body WHERE rowid=?')
      const putText = db.prepare('INSERT INTO body (rowid,text) VALUES (?,?)')
      let unreadable = 0
      for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
        const batch = records.slice(offset, offset + BATCH_SIZE)
        const entries = await Promise.all(batch.map(async record => {
          const { header } = record
          try {
            if (record.deleted) return null
            const events = readLive(header.id)
            const last = events?.at(-1)
            const liveStamp = events ? [events.length, last?.seq, last?.time] : null
            const signature = sessionSignature(header, record, liveStamp)
            if (!force && signature !== null && previous.get(header.id) === signature) return null
            const entry = await read(record, events)
            return { entry, signature }
          } catch (error) {
            unreadable++
            reportError?.(header.id, error)
            return null
          } finally {
            progress.done++
          }
        }))
        transaction(db, () => {
          for (const item of entries) {
            if (!item) continue
            const { entry, signature } = item
            const { rowid } = put.get(entry.id, entry.createdAt, signature, JSON.stringify(entry))
            removeText.run(rowid)
            putText.run(rowid, searchableText(entry))
          }
        })
      }
      transaction(db, () => {
        db.exec('CREATE TEMP TABLE IF NOT EXISTS known_sessions (id TEXT PRIMARY KEY, deleted INTEGER NOT NULL)')
        const addKnown = db.prepare('INSERT INTO known_sessions VALUES (?,?)')
        for (const record of records) addKnown.run(record.header.id, Number(record.deleted === true))
        db.exec([
          'UPDATE sessions SET deleted=COALESCE((SELECT k.deleted FROM known_sessions k WHERE k.id=sessions.id),1)',
          'WHERE deleted<>COALESCE((SELECT k.deleted FROM known_sessions k WHERE k.id=sessions.id),1)',
        ].join(' '))
        const putMeta = db.prepare('INSERT INTO metadata VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
        const lastRevision = Number(db.prepare("SELECT value FROM metadata WHERE key='revision'").get()?.value || 0)
        revision = Math.max(Date.now(), revision + 1, lastRevision + 1)
        buildMs = Date.now() - started
        putMeta.run('revision', revision)
        putMeta.run('unreadable', unreadable)
        size = Number(db.prepare('SELECT count(*) AS count FROM sessions').get().count)
      })
      return { size }
    } finally {
      progress = { ...progress, active: false }
      db?.close()
    }
  }

  async function* scan(words, includeDeleted, ids) {
    const db = await open({ readOnly: true })
    // Use a single read snapshot and bounded payload batches. Only lightweight IDs
    // are materialized before hit verification and result shaping.
    try {
      db.exec('BEGIN')
      const direct = db.prepare('SELECT payload,deleted FROM sessions WHERE id=?')
      let found = ids
      if (found === undefined) {
        const args = []
        const where = includeDeleted ? [] : ['s.deleted=0']
        const long = words.filter(word => Array.from(word).length >= 3 && !word.includes('\0'))
        const short = words.filter(word => !long.includes(word) && !word.includes('\0'))
        if (long.length > 0) {
          where.push('body MATCH ?')
          args.push(long.map(word => '"' + word.replaceAll('"', '""') + '"').join(' AND '))
        }
        for (const word of short) {
          where.push('instr(body.text,?)>0')
          args.push(word)
        }
        const sql = [
          'SELECT s.id FROM body JOIN sessions s ON s.rowid=body.rowid',
          where.length ? 'WHERE ' + where.join(' AND ') : '',
          'ORDER BY s.created DESC, s.id',
        ].join(' ')
        found = db.prepare(sql).all(...args).map(row => row.id)
      }
      for (let offset = 0; offset < found.length; offset += SCAN_BATCH_SIZE) {
        for (const id of found.slice(offset, offset + SCAN_BATCH_SIZE)) {
          const row = direct.get(id)
          if (row && (includeDeleted || !row.deleted)) {
            yield { ...JSON.parse(row.payload), deleted: Boolean(row.deleted) }
          }
        }
      }
    } finally {
      db.close()
    }
  }

  return {
    warm(force = false) {
      building ??= rebuild(force).finally(() => { building = null })
      return building
    },
    async snapshot() {
      if (building) await building
      if (revision === 0) await this.warm()
      const db = await open({ readOnly: true })
      try {
        return {
          revision, buildMs, scan,
          indexed: Number(db.prepare('SELECT count(*) AS count FROM sessions').get().count),
          unreadable: Number(db.prepare("SELECT value FROM metadata WHERE key='unreadable'").get()?.value || 0),
        }
      } finally {
        db.close()
      }
    },
    status: () => ({ sessions: size, builtAt: revision, buildMs, progress }),
  }
}
