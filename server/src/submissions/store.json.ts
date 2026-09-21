/*
 * The JSON-file implementation of SubmissionStore — SPEC-submit-backend.md §3.
 *
 * THE ONLY MODULE THAT KNOWS SUBMISSIONS LIVE IN A FILE. store.ts is the
 * port; the service layer and the route import that, never this file.
 * (Tests are the deliberate exception — they exercise this adapter's own
 * on-disk behaviour directly, the same way catalogue/json.ts is tested
 * directly elsewhere in this codebase.)
 *
 * Two hazards a naive read-modify-write has, both handled here:
 *
 *  - Two concurrent creates racing the same read-modify-write cycle silently
 *    drop one submission: the second read happens before the first write
 *    lands, so the second write overwrites the first row right out of the
 *    array. Every write funnels through ONE promise chain held at module
 *    scope (see writeChain below — deliberately not per store instance), so
 *    writes are strictly serialized: a create's read can never observe a
 *    state older than every write already queued ahead of it.
 *
 *  - A crash mid-write leaves truncated, unparseable JSON on disk. Every
 *    write lands in a fresh temp file first, then an atomic rename over the
 *    real path, so a reader only ever sees the fully-old or fully-new file,
 *    never a partial one.
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { internalError } from '../domain/errors.ts'
import type { SubmissionStore } from './store.ts'
import type { Submission } from './types.ts'

/**
 * The single write queue for every store this process creates, not one per
 * instance — that is what "module scope" means here. Two stores pointing at
 * different files would, strictly, only need to serialize against
 * themselves, but a shared chain is simpler and costs nothing real at this
 * scale (a handful of writes a minute, one JSON file). A store still only
 * ever reads or writes its OWN file; this only orders the WORK, not which
 * file any given piece of work touches.
 */
let writeChain: Promise<void> = Promise.resolve()

/** Runs `task` after every write already queued, and becomes the new tail itself. */
function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const result = writeChain.then(task)
  // The chain itself must never reject, or every write queued after a
  // failure would wait on a promise that can never resolve. The caller still
  // observes the real failure through `result`.
  writeChain = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

export function createJsonSubmissionStore(filePath: string): SubmissionStore {
  async function readAll(): Promise<Submission[]> {
    let contents: string
    try {
      contents = await readFile(filePath, 'utf8')
    } catch (error) {
      // Missing file is not a failure — an unwritten store is an empty one.
      if (isErrnoException(error) && error.code === 'ENOENT') return []
      throw internalError('Could not read the submissions store.', error)
    }

    try {
      return JSON.parse(contents) as Submission[]
    } catch (error) {
      throw internalError('The submissions store is not valid JSON.', error)
    }
  }

  async function writeAll(records: Submission[]): Promise<void> {
    const tempPath = `${filePath}.${randomUUID()}.tmp`
    try {
      // Covers both "the file doesn't exist yet" and "the directory doesn't
      // either" — a fresh clone ships data/submissions.example.json, but a
      // test pointed at an isolated temp path has no directory at all yet.
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(tempPath, JSON.stringify(records, null, 2), 'utf8')
      await rename(tempPath, filePath)
    } catch (error) {
      throw internalError('Could not write the submissions store.', error)
    }
  }

  return {
    async create(input) {
      return enqueueWrite(async () => {
        const records = await readAll()
        const record: Submission = {
          ...input,
          id: randomUUID(),
          status: 'pending',
          createdAt: new Date().toISOString(),
        }
        records.push(record)
        await writeAll(records)
        return record
      })
    },

    async findByNormalizedUrl(url) {
      const records = await readAll()
      return records.find((record) => record.normalizedUrl === url) ?? null
    },

    async list(opts = {}) {
      const records = await readAll()
      const filtered = opts.status ? records.filter((record) => record.status === opts.status) : records
      return opts.limit !== undefined ? filtered.slice(0, opts.limit) : filtered
    },
  }
}
