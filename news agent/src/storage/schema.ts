/*
 * Database schema.
 *
 * Migrations are additive and applied in order; each is recorded in
 * schema_migrations so reruns are no-ops. Existing data is never dropped —
 * the pipeline's whole defence against duplicate drafts is its memory of what it
 * has already done (NEWS_AGENT.md §9).
 */

export interface Migration {
  version: number
  name: string
  sql: string
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial',
    sql: `
      CREATE TABLE IF NOT EXISTS sources (
        id                   TEXT PRIMARY KEY,
        name                 TEXT NOT NULL,
        type                 TEXT NOT NULL,
        url                  TEXT NOT NULL,
        publisher            TEXT NOT NULL,
        trust_tier           INTEGER NOT NULL,
        enabled              INTEGER NOT NULL,
        last_fetched_at      TEXT,
        last_status          TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        created_at           TEXT NOT NULL,
        updated_at           TEXT NOT NULL
      );

      -- canonical_url is the level-2 dedupe key and must be globally unique.
      CREATE TABLE IF NOT EXISTS news_items (
        id               TEXT PRIMARY KEY,
        source_id        TEXT NOT NULL,
        title            TEXT NOT NULL,
        url              TEXT NOT NULL,
        canonical_url    TEXT NOT NULL UNIQUE,
        published_at     TEXT,
        discovered_at    TEXT NOT NULL,
        raw_summary      TEXT,
        status           TEXT NOT NULL,
        rejection_reason TEXT,
        story_id         TEXT,
        first_run_id     TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_news_items_status ON news_items(status);
      CREATE INDEX IF NOT EXISTS idx_news_items_story ON news_items(story_id);
      CREATE INDEX IF NOT EXISTS idx_news_items_discovered ON news_items(discovered_at);

      CREATE TABLE IF NOT EXISTS stories (
        id                    TEXT PRIMARY KEY,
        fingerprint           TEXT NOT NULL,
        normalized_title      TEXT NOT NULL,
        title                 TEXT NOT NULL,
        category              TEXT,
        relevance             REAL NOT NULL DEFAULT 0,
        importance            REAL NOT NULL DEFAULT 0,
        freshness             REAL NOT NULL DEFAULT 0,
        source_trust          REAL NOT NULL DEFAULT 0,
        weighted              REAL NOT NULL DEFAULT 0,
        evidence_state        TEXT NOT NULL DEFAULT 'none',
        duplicate_of_story_id TEXT,
        status                TEXT NOT NULL,
        rejection_reason      TEXT,
        ambiguous_merge       INTEGER NOT NULL DEFAULT 0,
        first_seen_at         TEXT NOT NULL,
        last_updated_at       TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_stories_fingerprint ON stories(fingerprint);
      CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
      CREATE INDEX IF NOT EXISTS idx_stories_seen ON stories(first_seen_at);

      CREATE TABLE IF NOT EXISTS story_sources (
        story_id     TEXT NOT NULL,
        news_item_id TEXT NOT NULL,
        linked_at    TEXT NOT NULL,
        PRIMARY KEY (story_id, news_item_id)
      );

      CREATE TABLE IF NOT EXISTS story_evidence (
        id                  TEXT PRIMARY KEY,
        story_id            TEXT NOT NULL,
        url                 TEXT NOT NULL,
        publisher           TEXT NOT NULL,
        title               TEXT NOT NULL,
        published_at        TEXT,
        trust_tier          INTEGER NOT NULL,
        source_type         TEXT NOT NULL,
        content_hash        TEXT NOT NULL,
        injection_suspected INTEGER NOT NULL DEFAULT 0,
        retrieved_at        TEXT NOT NULL,
        UNIQUE (story_id, url)
      );
      CREATE INDEX IF NOT EXISTS idx_evidence_story ON story_evidence(story_id);

      CREATE TABLE IF NOT EXISTS claims (
        id            TEXT PRIMARY KEY,
        story_id      TEXT NOT NULL,
        evidence_id   TEXT,
        text          TEXT NOT NULL,
        claim_type    TEXT NOT NULL,
        support_level TEXT NOT NULL,
        best_tier     INTEGER,
        evidence_urls TEXT NOT NULL,
        conflict_note TEXT,
        created_at    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_claims_story ON claims(story_id);

      -- One story yields at most one article; wp_post_id is the publish-time
      -- idempotency key (NEWS_AGENT.md §17).
      CREATE TABLE IF NOT EXISTS generated_articles (
        id                 TEXT PRIMARY KEY,
        story_id           TEXT NOT NULL UNIQUE,
        title              TEXT NOT NULL,
        slug               TEXT NOT NULL,
        excerpt            TEXT NOT NULL,
        sections           TEXT NOT NULL,
        content            TEXT NOT NULL,
        category           TEXT NOT NULL,
        tags               TEXT NOT NULL,
        source_urls        TEXT NOT NULL,
        claim_ids          TEXT NOT NULL,
        word_count         INTEGER NOT NULL DEFAULT 0,
        generated_at       TEXT NOT NULL,
        model              TEXT NOT NULL,
        schema_version     INTEGER NOT NULL DEFAULT 1,
        confidence         REAL NOT NULL DEFAULT 0,
        editorial_status   TEXT NOT NULL,
        editorial_notes    TEXT,
        editorial_issues   TEXT,
        revision_count     INTEGER NOT NULL DEFAULT 0,
        wp_post_id         INTEGER,
        wp_status          TEXT,
        published_to_wp_at TEXT,
        run_id             TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_slug ON generated_articles(slug);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_wp
        ON generated_articles(wp_post_id) WHERE wp_post_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_articles_status ON generated_articles(editorial_status);

      CREATE TABLE IF NOT EXISTS pipeline_runs (
        id          TEXT PRIMARY KEY,
        started_at  TEXT NOT NULL,
        finished_at TEXT,
        status      TEXT NOT NULL,
        dry_run     INTEGER NOT NULL DEFAULT 0,
        counters    TEXT NOT NULL,
        llm_usage   TEXT NOT NULL,
        errors      TEXT NOT NULL,
        note        TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_runs_status ON pipeline_runs(status);
      CREATE INDEX IF NOT EXISTS idx_runs_started ON pipeline_runs(started_at);
    `,
  },
]

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0
