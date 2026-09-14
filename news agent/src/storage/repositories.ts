/*
 * Repository layer — the only SQL in the codebase outside schema.ts.
 *
 * Pipeline modules receive a `Repositories` object and never see a row shape,
 * a column name, or a SQLite quirk. Swapping to Postgres later means
 * reimplementing this file against the same function signatures.
 */

import type {
  ArticleDraft,
  CandidateStory,
  Claim,
  NewsItem,
  NewsSource,
  PipelineRun,
  SourceEvidence,
  StoryStatus,
  TrustTier,
} from '../domain/types.ts'
import type { EditorialCategory } from '../config/editorial.ts'
import { storageError } from '../domain/errors.ts'
import { nowIso } from '../utils/time.ts'
import { toArticleFormat } from '../editorial/format.ts'
import type { SeoBrief } from '../domain/types.ts'
import {
  fromJson,
  optionalNumber,
  optionalString,
  toBool,
  toSql,
  transaction,
  type Db,
} from './db.ts'

type Row = Record<string, unknown>

/* ── sources ──────────────────────────────────────────────────────────────── */

export interface SourceRepo {
  /** Mirrors the code-defined registry into the DB for fetch bookkeeping. */
  sync(sources: NewsSource[]): void
  recordFetch(sourceId: string, ok: boolean, status: string): void
  consecutiveFailures(sourceId: string): number
}

function createSourceRepo(db: Db): SourceRepo {
  const upsert = db.prepare(`
    INSERT INTO sources (id, name, type, url, publisher, trust_tier, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, type = excluded.type, url = excluded.url,
      publisher = excluded.publisher, trust_tier = excluded.trust_tier,
      enabled = excluded.enabled, updated_at = excluded.updated_at
  `)

  return {
    sync(sources) {
      const ts = nowIso()
      transaction(db, () => {
        for (const source of sources) {
          upsert.run(
            source.id,
            source.name,
            source.type,
            source.url,
            source.publisher,
            source.trustTier,
            toSql(source.enabled),
            ts,
            ts,
          )
        }
      })
    },

    recordFetch(sourceId, ok, status) {
      db.prepare(
        `UPDATE sources
            SET last_fetched_at = ?, last_status = ?, updated_at = ?,
                consecutive_failures = CASE WHEN ? = 1 THEN 0 ELSE consecutive_failures + 1 END
          WHERE id = ?`,
      ).run(nowIso(), status.slice(0, 200), nowIso(), ok ? 1 : 0, sourceId)
    },

    consecutiveFailures(sourceId) {
      const row = db
        .prepare('SELECT consecutive_failures AS n FROM sources WHERE id = ?')
        .get(sourceId) as Row | undefined
      return typeof row?.n === 'number' ? row.n : 0
    },
  }
}

/* ── news items ───────────────────────────────────────────────────────────── */

export interface NewsItemRepo {
  /** Level-1/2 dedupe: returns canonical URLs already known to the database. */
  findKnownCanonicalUrls(canonicalUrls: string[]): Set<string>
  /** Inserts an unseen item. Returns false when another row already claimed it. */
  insertIfNew(item: NewsItem, runId: string): boolean
  get(id: string): NewsItem | undefined
  listByIds(ids: string[]): NewsItem[]
  setStatus(id: string, status: NewsItem['status'], rejectionReason?: string): void
  attachStory(itemId: string, storyId: string): void
  /** Items discovered within the window, for title-similarity clustering. */
  listRecent(sinceIso: string): NewsItem[]
}

function rowToNewsItem(row: Row): NewsItem {
  return {
    id: String(row.id),
    sourceId: String(row.source_id),
    title: String(row.title),
    url: String(row.url),
    canonicalUrl: String(row.canonical_url),
    ...(optionalString(row.published_at) ? { publishedAt: String(row.published_at) } : {}),
    discoveredAt: String(row.discovered_at),
    ...(optionalString(row.raw_summary) ? { rawSummary: String(row.raw_summary) } : {}),
    status: String(row.status) as NewsItem['status'],
    ...(optionalString(row.rejection_reason)
      ? { rejectionReason: String(row.rejection_reason) }
      : {}),
    ...(optionalString(row.story_id) ? { storyId: String(row.story_id) } : {}),
  }
}

function createNewsItemRepo(db: Db): NewsItemRepo {
  return {
    findKnownCanonicalUrls(canonicalUrls) {
      const known = new Set<string>()
      if (canonicalUrls.length === 0) return known
      // Chunked to stay well under SQLite's variable limit.
      for (let i = 0; i < canonicalUrls.length; i += 400) {
        const chunk = canonicalUrls.slice(i, i + 400)
        const placeholders = chunk.map(() => '?').join(',')
        const rows = db
          .prepare(`SELECT canonical_url FROM news_items WHERE canonical_url IN (${placeholders})`)
          .all(...chunk) as Row[]
        for (const row of rows) known.add(String(row.canonical_url))
      }
      return known
    },

    insertIfNew(item, runId) {
      const result = db
        .prepare(
          `INSERT OR IGNORE INTO news_items
             (id, source_id, title, url, canonical_url, published_at, discovered_at,
              raw_summary, status, rejection_reason, story_id, first_run_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          item.id,
          item.sourceId,
          item.title,
          item.url,
          item.canonicalUrl,
          toSql(item.publishedAt),
          item.discoveredAt,
          toSql(item.rawSummary),
          item.status,
          toSql(item.rejectionReason),
          toSql(item.storyId),
          runId,
        )
      return Number(result.changes) > 0
    },

    get(id) {
      const row = db.prepare('SELECT * FROM news_items WHERE id = ?').get(id) as Row | undefined
      return row ? rowToNewsItem(row) : undefined
    },

    listByIds(ids) {
      if (ids.length === 0) return []
      const placeholders = ids.map(() => '?').join(',')
      const rows = db
        .prepare(`SELECT * FROM news_items WHERE id IN (${placeholders})`)
        .all(...ids) as Row[]
      return rows.map(rowToNewsItem)
    },

    setStatus(id, status, rejectionReason) {
      db.prepare('UPDATE news_items SET status = ?, rejection_reason = ? WHERE id = ?').run(
        status,
        toSql(rejectionReason),
        id,
      )
    },

    attachStory(itemId, storyId) {
      db.prepare('UPDATE news_items SET story_id = ?, status = ? WHERE id = ?').run(
        storyId,
        'clustered',
        itemId,
      )
    },

    listRecent(sinceIso) {
      const rows = db
        .prepare('SELECT * FROM news_items WHERE discovered_at >= ? ORDER BY discovered_at DESC')
        .all(sinceIso) as Row[]
      return rows.map(rowToNewsItem)
    },
  }
}

/* ── stories ──────────────────────────────────────────────────────────────── */

export interface StoryRepo {
  findByFingerprint(fingerprint: string): CandidateStory | undefined
  get(id: string): CandidateStory | undefined
  upsert(story: CandidateStory): void
  linkItem(storyId: string, newsItemId: string): void
  itemIds(storyId: string): string[]
  setStatus(id: string, status: StoryStatus, rejectionReason?: string): void
  setEvidenceState(id: string, state: CandidateStory['evidenceState']): void
  /** Stories seen within the window, used for cross-run title clustering. */
  listSince(sinceIso: string): CandidateStory[]
  listByStatus(status: StoryStatus): CandidateStory[]
}

function rowToStory(row: Row): CandidateStory {
  return {
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    normalizedTitle: String(row.normalized_title),
    title: String(row.title),
    ...(optionalString(row.category)
      ? { category: String(row.category) as EditorialCategory }
      : {}),
    newsItemIds: [],
    scores: {
      relevance: Number(row.relevance ?? 0),
      importance: Number(row.importance ?? 0),
      freshness: Number(row.freshness ?? 0),
      sourceTrust: Number(row.source_trust ?? 0),
      weighted: Number(row.weighted ?? 0),
    },
    evidenceState: String(row.evidence_state) as CandidateStory['evidenceState'],
    ...(optionalString(row.duplicate_of_story_id)
      ? { duplicateOfStoryId: String(row.duplicate_of_story_id) }
      : {}),
    status: String(row.status) as StoryStatus,
    ...(optionalString(row.rejection_reason)
      ? { rejectionReason: String(row.rejection_reason) }
      : {}),
    ambiguousMerge: toBool(row.ambiguous_merge),
    firstSeenAt: String(row.first_seen_at),
    lastUpdatedAt: String(row.last_updated_at),
  }
}

function createStoryRepo(db: Db): StoryRepo {
  const withItems = (story: CandidateStory): CandidateStory => ({
    ...story,
    newsItemIds: (
      db
        .prepare('SELECT news_item_id FROM story_sources WHERE story_id = ? ORDER BY linked_at')
        .all(story.id) as Row[]
    ).map((row) => String(row.news_item_id)),
  })

  return {
    findByFingerprint(fingerprint) {
      const row = db.prepare('SELECT * FROM stories WHERE fingerprint = ?').get(fingerprint) as
        | Row
        | undefined
      return row ? withItems(rowToStory(row)) : undefined
    },

    get(id) {
      const row = db.prepare('SELECT * FROM stories WHERE id = ?').get(id) as Row | undefined
      return row ? withItems(rowToStory(row)) : undefined
    },

    upsert(story) {
      db.prepare(
        `INSERT INTO stories
           (id, fingerprint, normalized_title, title, category, relevance, importance,
            freshness, source_trust, weighted, evidence_state, duplicate_of_story_id,
            status, rejection_reason, ambiguous_merge, first_seen_at, last_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           normalized_title = excluded.normalized_title,
           title = excluded.title,
           category = excluded.category,
           relevance = excluded.relevance,
           importance = excluded.importance,
           freshness = excluded.freshness,
           source_trust = excluded.source_trust,
           weighted = excluded.weighted,
           evidence_state = excluded.evidence_state,
           duplicate_of_story_id = excluded.duplicate_of_story_id,
           status = excluded.status,
           rejection_reason = excluded.rejection_reason,
           ambiguous_merge = excluded.ambiguous_merge,
           last_updated_at = excluded.last_updated_at`,
      ).run(
        story.id,
        story.fingerprint,
        story.normalizedTitle,
        story.title,
        toSql(story.category),
        story.scores.relevance,
        story.scores.importance,
        story.scores.freshness,
        story.scores.sourceTrust,
        story.scores.weighted,
        story.evidenceState,
        toSql(story.duplicateOfStoryId),
        story.status,
        toSql(story.rejectionReason),
        toSql(story.ambiguousMerge ?? false),
        story.firstSeenAt,
        story.lastUpdatedAt,
      )
    },

    linkItem(storyId, newsItemId) {
      db.prepare(
        'INSERT OR IGNORE INTO story_sources (story_id, news_item_id, linked_at) VALUES (?, ?, ?)',
      ).run(storyId, newsItemId, nowIso())
    },

    itemIds(storyId) {
      return (
        db
          .prepare('SELECT news_item_id FROM story_sources WHERE story_id = ? ORDER BY linked_at')
          .all(storyId) as Row[]
      ).map((row) => String(row.news_item_id))
    },

    setStatus(id, status, rejectionReason) {
      db.prepare(
        'UPDATE stories SET status = ?, rejection_reason = ?, last_updated_at = ? WHERE id = ?',
      ).run(status, toSql(rejectionReason), nowIso(), id)
    },

    setEvidenceState(id, state) {
      db.prepare('UPDATE stories SET evidence_state = ?, last_updated_at = ? WHERE id = ?').run(
        state,
        nowIso(),
        id,
      )
    },

    listSince(sinceIso) {
      const rows = db
        .prepare('SELECT * FROM stories WHERE first_seen_at >= ? ORDER BY first_seen_at DESC')
        .all(sinceIso) as Row[]
      return rows.map((row) => withItems(rowToStory(row)))
    },

    listByStatus(status) {
      const rows = db
        .prepare('SELECT * FROM stories WHERE status = ? ORDER BY weighted DESC')
        .all(status) as Row[]
      return rows.map((row) => withItems(rowToStory(row)))
    },
  }
}

/* ── evidence + claims ────────────────────────────────────────────────────── */

export interface EvidenceRepo {
  /** Persists evidence metadata. Cleaned text is not stored — see note below. */
  upsert(evidence: SourceEvidence): void
  listForStory(storyId: string): Array<Omit<SourceEvidence, 'cleanedText' | 'extractedFacts'>>
}

function createEvidenceRepo(db: Db): EvidenceRepo {
  return {
    /*
     * Only metadata and a content hash are stored, never the fetched body. The
     * database is pipeline bookkeeping, not a copy of other publications'
     * articles (NEWS_AGENT.md §29); the hash is enough to detect a source that
     * changed underneath us between runs.
     */
    upsert(evidence) {
      db.prepare(
        `INSERT INTO story_evidence
           (id, story_id, url, publisher, title, published_at, trust_tier, source_type,
            content_hash, injection_suspected, retrieved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(story_id, url) DO UPDATE SET
           title = excluded.title,
           published_at = excluded.published_at,
           content_hash = excluded.content_hash,
           injection_suspected = excluded.injection_suspected,
           retrieved_at = excluded.retrieved_at`,
      ).run(
        evidence.id,
        evidence.storyId,
        evidence.url,
        evidence.publisher,
        evidence.title,
        toSql(evidence.publishedAt),
        evidence.trustTier,
        evidence.sourceType,
        evidence.contentHash,
        toSql(evidence.injectionSuspected ?? false),
        evidence.retrievedAt,
      )
    },

    listForStory(storyId) {
      const rows = db
        .prepare('SELECT * FROM story_evidence WHERE story_id = ? ORDER BY trust_tier ASC')
        .all(storyId) as Row[]
      return rows.map((row) => ({
        id: String(row.id),
        storyId: String(row.story_id),
        url: String(row.url),
        publisher: String(row.publisher),
        title: String(row.title),
        ...(optionalString(row.published_at) ? { publishedAt: String(row.published_at) } : {}),
        trustTier: Number(row.trust_tier) as TrustTier,
        sourceType: String(row.source_type) as SourceEvidence['sourceType'],
        retrievedAt: String(row.retrieved_at),
        contentHash: String(row.content_hash),
        injectionSuspected: toBool(row.injection_suspected),
      }))
    },
  }
}

export interface ClaimRepo {
  replaceForStory(storyId: string, claims: Claim[]): void
  listForStory(storyId: string): Claim[]
}

function createClaimRepo(db: Db): ClaimRepo {
  return {
    replaceForStory(storyId, claims) {
      transaction(db, () => {
        db.prepare('DELETE FROM claims WHERE story_id = ?').run(storyId)
        const insert = db.prepare(
          `INSERT INTO claims
             (id, story_id, evidence_id, text, claim_type, support_level, best_tier,
              evidence_urls, conflict_note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        const ts = nowIso()
        for (const claim of claims) {
          insert.run(
            claim.id,
            storyId,
            null,
            claim.text,
            claim.claimType,
            claim.supportLevel,
            toSql(claim.bestTier),
            JSON.stringify(claim.evidenceUrls),
            toSql(claim.conflictNote),
            ts,
          )
        }
      })
    },

    listForStory(storyId) {
      const rows = db
        .prepare('SELECT * FROM claims WHERE story_id = ? ORDER BY created_at')
        .all(storyId) as Row[]
      return rows.map((row) => ({
        id: String(row.id),
        text: String(row.text),
        evidenceUrls: fromJson<string[]>(row.evidence_urls, []),
        supportLevel: String(row.support_level) as Claim['supportLevel'],
        claimType: String(row.claim_type) as Claim['claimType'],
        ...(optionalNumber(row.best_tier) ? { bestTier: Number(row.best_tier) as TrustTier } : {}),
        ...(optionalString(row.conflict_note) ? { conflictNote: String(row.conflict_note) } : {}),
      }))
    },
  }
}

/* ── generated articles ───────────────────────────────────────────────────── */

export interface ArticleRepo {
  findByStory(storyId: string): ArticleDraft | undefined
  upsert(article: ArticleDraft, runId: string): void
  /**
   * Records the WordPress post id. Written before the run is finalised so a
   * crash cannot lose the link between a story and a live draft (§17, §36).
   */
  recordWordPressPost(articleId: string, wpPostId: number): void
  slugTaken(slug: string, exceptArticleId: string): boolean
  /** Titles already sent to WordPress, for the editor's duplication check. */
  listPublishedTitles(limit?: number): Array<{ title: string; storyId: string }>
  /**
   * Slugs of articles that actually reached WordPress.
   *
   * The only /blog/:slug targets an internal link may point at, because they are
   * the only ones this agent can confirm exist — it created them.
   */
  listPublishedSlugs(limit?: number): Array<{ slug: string; title: string }>
  /**
   * The publication work queue: approved articles that never reached WordPress
   * (editorial_status = 'approved' AND wp_post_id IS NULL).
   *
   * An article that was written, approved and persisted but whose WordPress call
   * failed is finished editorial work waiting on one HTTP request. §24 requires
   * it to be retried on a later run rather than regenerated, and the underlying
   * news items are duplicates by then, so nothing upstream will ever re-offer it.
   * This query is how the retry stage finds it. Oldest first, so a backlog drains
   * in the order it was generated.
   */
  listAwaitingPublication(limit?: number): ArticleDraft[]
}

function rowToArticle(row: Row): ArticleDraft {
  return {
    id: String(row.id),
    storyId: String(row.story_id),
    title: String(row.title),
    slug: String(row.slug),
    excerpt: String(row.excerpt),
    sections: fromJson<ArticleDraft['sections']>(row.sections, []),
    content: String(row.content),
    category: String(row.category) as EditorialCategory,
    tags: fromJson<string[]>(row.tags, []),
    sourceUrls: fromJson<string[]>(row.source_urls, []),
    claimIds: fromJson<string[]>(row.claim_ids, []),
    wordCount: Number(row.word_count ?? 0),
    generatedAt: String(row.generated_at),
    model: String(row.model),
    format: toArticleFormat(row.format),
    ...(row.seo ? { seo: fromJson<SeoBrief>(row.seo, undefined as never) } : {}),
    schemaVersion: Number(row.schema_version ?? 1),
    confidence: Number(row.confidence ?? 0),
    editorialStatus: String(row.editorial_status) as ArticleDraft['editorialStatus'],
    ...(optionalString(row.editorial_notes) ? { editorialNotes: String(row.editorial_notes) } : {}),
    editorialIssues: fromJson<string[]>(row.editorial_issues, []),
    revisionCount: Number(row.revision_count ?? 0),
    ...(optionalNumber(row.wp_post_id) ? { wpPostId: Number(row.wp_post_id) } : {}),
    ...(optionalString(row.wp_status) ? { wpStatus: 'draft' as const } : {}),
    ...(optionalString(row.published_to_wp_at)
      ? { publishedToWpAt: String(row.published_to_wp_at) }
      : {}),
  }
}

function createArticleRepo(db: Db): ArticleRepo {
  return {
    findByStory(storyId) {
      const row = db.prepare('SELECT * FROM generated_articles WHERE story_id = ?').get(storyId) as
        | Row
        | undefined
      return row ? rowToArticle(row) : undefined
    },

    upsert(article, runId) {
      db.prepare(
        `INSERT INTO generated_articles
           (id, story_id, title, slug, excerpt, sections, content, category, tags,
            source_urls, claim_ids, word_count, generated_at, model, format, seo, schema_version,
            confidence, editorial_status, editorial_notes, editorial_issues,
            revision_count, wp_post_id, wp_status, published_to_wp_at, run_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(story_id) DO UPDATE SET
           title = excluded.title, slug = excluded.slug, excerpt = excluded.excerpt,
           sections = excluded.sections, content = excluded.content,
           category = excluded.category, tags = excluded.tags,
           source_urls = excluded.source_urls, claim_ids = excluded.claim_ids,
           word_count = excluded.word_count, generated_at = excluded.generated_at,
           model = excluded.model, format = excluded.format, seo = excluded.seo,
           schema_version = excluded.schema_version,
           confidence = excluded.confidence, editorial_status = excluded.editorial_status,
           editorial_notes = excluded.editorial_notes,
           editorial_issues = excluded.editorial_issues,
           revision_count = excluded.revision_count,
           run_id = excluded.run_id`,
        // wp_post_id is intentionally absent from the UPDATE clause: once a
        // draft exists in WordPress, regenerating the article must never
        // detach it, or the next run would create a duplicate post.
      ).run(
        article.id,
        article.storyId,
        article.title,
        article.slug,
        article.excerpt,
        JSON.stringify(article.sections),
        article.content,
        article.category,
        JSON.stringify(article.tags),
        JSON.stringify(article.sourceUrls),
        JSON.stringify(article.claimIds),
        article.wordCount,
        article.generatedAt,
        article.model,
        article.format,
        article.seo ? JSON.stringify(article.seo) : null,
        article.schemaVersion,
        article.confidence,
        article.editorialStatus,
        toSql(article.editorialNotes),
        JSON.stringify(article.editorialIssues ?? []),
        article.revisionCount,
        toSql(article.wpPostId),
        toSql(article.wpStatus),
        toSql(article.publishedToWpAt),
        runId,
      )
    },

    recordWordPressPost(articleId, wpPostId) {
      const result = db
        .prepare(
          `UPDATE generated_articles
              SET wp_post_id = ?, wp_status = 'draft', published_to_wp_at = ?
            WHERE id = ? AND wp_post_id IS NULL`,
        )
        .run(wpPostId, nowIso(), articleId)
      if (Number(result.changes) === 0) {
        throw storageError(
          `Refused to overwrite an existing WordPress post id for article ${articleId}`,
        )
      }
    },

    slugTaken(slug, exceptArticleId) {
      const row = db
        .prepare('SELECT id FROM generated_articles WHERE slug = ? AND id <> ?')
        .get(slug, exceptArticleId) as Row | undefined
      return row !== undefined
    },

    listPublishedSlugs(limit = 20) {
      const rows = db
        .prepare(
          `SELECT slug, title FROM generated_articles
            WHERE wp_post_id IS NOT NULL AND slug IS NOT NULL
            ORDER BY published_to_wp_at DESC LIMIT ?`,
        )
        .all(limit) as Row[]
      return rows.map((row) => ({ slug: String(row.slug), title: String(row.title) }))
    },

    listPublishedTitles(limit = 200) {
      const rows = db
        .prepare(
          `SELECT title, story_id FROM generated_articles
            WHERE wp_post_id IS NOT NULL
            ORDER BY published_to_wp_at DESC LIMIT ?`,
        )
        .all(limit) as Row[]
      return rows.map((row) => ({ title: String(row.title), storyId: String(row.story_id) }))
    },

    listAwaitingPublication(limit) {
      const rows = db
        .prepare(
          `SELECT * FROM generated_articles
            WHERE editorial_status = 'approved' AND wp_post_id IS NULL
            ORDER BY generated_at ASC
            LIMIT ?`,
        )
        // SQLite treats a negative LIMIT as "no limit", which keeps the
        // unbounded call sites (inspection, tests) on one code path.
        .all(limit === undefined ? -1 : limit) as Row[]
      return rows.map(rowToArticle)
    },
  }
}

/* ── pipeline runs ────────────────────────────────────────────────────────── */

export interface RunRepo {
  /** Atomically claims the run lock, or returns the run already holding it. */
  claimLock(run: PipelineRun, staleMinutes: number): { acquired: true } | { acquired: false; heldBy: PipelineRun }
  finish(run: PipelineRun): void
  get(id: string): PipelineRun | undefined
  listRecent(limit: number): PipelineRun[]
}

function rowToRun(row: Row): PipelineRun {
  return {
    id: String(row.id),
    startedAt: String(row.started_at),
    ...(optionalString(row.finished_at) ? { finishedAt: String(row.finished_at) } : {}),
    status: String(row.status) as PipelineRun['status'],
    dryRun: toBool(row.dry_run),
    counters: fromJson(row.counters, {} as PipelineRun['counters']),
    llmUsage: fromJson(row.llm_usage, { calls: 0, inputTokens: 0, outputTokens: 0 }),
    errors: fromJson<PipelineRun['errors']>(row.errors, []),
    ...(optionalString(row.note) ? { note: String(row.note) } : {}),
  }
}

function createRunRepo(db: Db): RunRepo {
  return {
    /*
     * BEGIN IMMEDIATE makes the check-and-insert atomic, so two processes
     * starting simultaneously cannot both conclude the lock was free (§23).
     */
    claimLock(run, staleMinutes) {
      return transaction(db, () => {
        const active = db
          .prepare("SELECT * FROM pipeline_runs WHERE status = 'running' ORDER BY started_at DESC")
          .all() as Row[]

        const cutoff = Date.now() - staleMinutes * 60_000
        for (const row of active) {
          const startedAt = Date.parse(String(row.started_at))
          // <= rather than <, so a staleMinutes of 0 means "reclaim now" instead
          // of depending on sub-millisecond timing.
          const stale = Number.isNaN(startedAt) || startedAt <= cutoff
          if (!stale) {
            return { acquired: false as const, heldBy: rowToRun(row) }
          }
          // A run older than the stale threshold crashed without finalising.
          db.prepare(
            "UPDATE pipeline_runs SET status = 'failed', finished_at = ?, note = ? WHERE id = ?",
          ).run(
            nowIso(),
            'Marked failed: run exceeded stale threshold without finishing',
            String(row.id),
          )
        }

        db.prepare(
          `INSERT INTO pipeline_runs
             (id, started_at, status, dry_run, counters, llm_usage, errors)
           VALUES (?, ?, 'running', ?, ?, ?, ?)`,
        ).run(
          run.id,
          run.startedAt,
          toSql(run.dryRun),
          JSON.stringify(run.counters),
          JSON.stringify(run.llmUsage),
          JSON.stringify(run.errors),
        )
        return { acquired: true as const }
      })
    },

    finish(run) {
      db.prepare(
        `UPDATE pipeline_runs
            SET finished_at = ?, status = ?, counters = ?, llm_usage = ?, errors = ?, note = ?
          WHERE id = ?`,
      ).run(
        run.finishedAt ?? nowIso(),
        run.status,
        JSON.stringify(run.counters),
        JSON.stringify(run.llmUsage),
        JSON.stringify(run.errors),
        toSql(run.note),
        run.id,
      )
    },

    get(id) {
      const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(id) as Row | undefined
      return row ? rowToRun(row) : undefined
    },

    listRecent(limit) {
      const rows = db
        .prepare('SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT ?')
        .all(limit) as Row[]
      return rows.map(rowToRun)
    },
  }
}

/* ── facade ───────────────────────────────────────────────────────────────── */

export interface Repositories {
  db: Db
  sources: SourceRepo
  newsItems: NewsItemRepo
  stories: StoryRepo
  evidence: EvidenceRepo
  claims: ClaimRepo
  articles: ArticleRepo
  runs: RunRepo
  close(): void
}

export function createRepositories(db: Db): Repositories {
  return {
    db,
    sources: createSourceRepo(db),
    newsItems: createNewsItemRepo(db),
    stories: createStoryRepo(db),
    evidence: createEvidenceRepo(db),
    claims: createClaimRepo(db),
    articles: createArticleRepo(db),
    runs: createRunRepo(db),
    close: () => db.close(),
  }
}
