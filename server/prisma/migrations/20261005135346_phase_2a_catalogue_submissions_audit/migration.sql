-- CreateEnum
CREATE TYPE "tool_status" AS ENUM ('active', 'draft');

-- CreateEnum
CREATE TYPE "tool_source" AS ENUM ('seed', 'submission');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "launch_plan" AS ENUM ('free', 'featured');

-- CreateEnum
CREATE TYPE "submission_source" AS ENUM ('form', 'legacy_json');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('OWNER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "submission_event_type" AS ENUM ('SUBMISSION_CREATED', 'LEGACY_IMPORTED');

-- CreateTable
CREATE TABLE "tools" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mono" TEXT NOT NULL,
    "cat" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "plain_line" TEXT,
    "rating" DOUBLE PRECISION NOT NULL,
    "reviews" INTEGER NOT NULL,
    "price" TEXT NOT NULL,
    "trend" TEXT NOT NULL,
    "badge" TEXT NOT NULL,
    "tags" TEXT[],
    "pop" INTEGER NOT NULL,
    "is_mcp_server" BOOLEAN NOT NULL DEFAULT false,
    "api" TEXT NOT NULL,
    "ctx" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "trial" TEXT NOT NULL,
    "integr" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalized_url" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "roles" TEXT[],
    "use_cases" TEXT[],
    "stages" TEXT[],
    "pricing_tier" TEXT NOT NULL,
    "status" "tool_status" NOT NULL DEFAULT 'active',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "added_at" DATE,
    "source" "tool_source" NOT NULL DEFAULT 'seed',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "status" "submission_status" NOT NULL DEFAULT 'SUBMITTED',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "source" "submission_source" NOT NULL DEFAULT 'form',
    "user_id" UUID,
    "tool_id" TEXT,
    "site_url" TEXT NOT NULL,
    "normalized_url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "pricing_model" TEXT NOT NULL,
    "price" TEXT,
    "tags" TEXT[],
    "audience" TEXT,
    "alternatives" TEXT[],
    "faqs" JSONB NOT NULL DEFAULT '[]',
    "launch_story" TEXT,
    "plan" "launch_plan" NOT NULL DEFAULT 'free',
    "launch_week_id" TEXT NOT NULL,
    "owner_message" TEXT,
    "rejection_reason" TEXT,
    "reviewer_id" UUID,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_events" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_type" "actor_type" NOT NULL,
    "event_type" "submission_event_type" NOT NULL,
    "from_status" "submission_status",
    "to_status" "submission_status",
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_import_runs" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "source_sha256" TEXT NOT NULL,
    "record_count" INTEGER NOT NULL,
    "inserted" INTEGER NOT NULL,
    "unchanged" INTEGER NOT NULL,
    "conflicts" INTEGER NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "data_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tools_slug_key" ON "tools"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tools_normalized_url_key" ON "tools"("normalized_url");

-- CreateIndex
CREATE INDEX "tools_status_idx" ON "tools"("status");

-- CreateIndex
CREATE INDEX "tools_cat_idx" ON "tools"("cat");

-- CreateIndex
CREATE INDEX "tools_added_at_idx" ON "tools"("added_at");

-- CreateIndex
CREATE INDEX "submissions_status_submitted_at_idx" ON "submissions"("status", "submitted_at");

-- CreateIndex
CREATE INDEX "submissions_user_id_idx" ON "submissions"("user_id");

-- CreateIndex
CREATE INDEX "submissions_tool_id_idx" ON "submissions"("tool_id");

-- CreateIndex
CREATE INDEX "submissions_normalized_url_idx" ON "submissions"("normalized_url");

-- CreateIndex
CREATE INDEX "submissions_created_at_idx" ON "submissions"("created_at");

-- CreateIndex
CREATE INDEX "submission_events_submission_id_created_at_idx" ON "submission_events"("submission_id", "created_at");

-- CreateIndex
CREATE INDEX "submission_events_event_type_created_at_idx" ON "submission_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "data_import_runs_source_started_at_idx" ON "data_import_runs"("source", "started_at");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_events" ADD CONSTRAINT "submission_events_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Hand-written: constraints Prisma's schema language cannot express ──────
-- Prisma ignores these when diffing, so later migrations will not drop them.

-- One live submission per site. Rejected and archived submissions are kept
-- (never deleted) but stop blocking a fresh submission of the same site.
-- The service's duplicate check gives the friendly 409; this index is what
-- makes two concurrent requests unable to both get through it.
CREATE UNIQUE INDEX "submissions_normalized_url_live_key"
    ON "submissions"("normalized_url")
    WHERE "status" NOT IN ('REJECTED', 'ARCHIVED');

-- Range checks that mirror catalogue/schema.ts, as a last line of defence for
-- writes that bypass the application (psql, a future script).
ALTER TABLE "tools"
    ADD CONSTRAINT "tools_rating_range" CHECK ("rating" >= 0 AND "rating" <= 5),
    ADD CONSTRAINT "tools_reviews_nonnegative" CHECK ("reviews" >= 0),
    ADD CONSTRAINT "tools_pop_range" CHECK ("pop" >= 0 AND "pop" <= 100);

ALTER TABLE "submissions"
    ADD CONSTRAINT "submissions_revision_positive" CHECK ("revision" >= 1),
    ADD CONSTRAINT "submissions_launch_week_format" CHECK ("launch_week_id" ~ '^\d{4}-\d{2}-\d{2}$'),
    ADD CONSTRAINT "submissions_faqs_is_array" CHECK (jsonb_typeof("faqs") = 'array');

ALTER TABLE "submission_events"
    ADD CONSTRAINT "submission_events_metadata_is_object" CHECK (jsonb_typeof("metadata") = 'object');

-- The audit trail is append-only. Enforced in the database, not just by
-- convention, so no code path (or a mistaken psql session) can rewrite
-- history. A deliberate correction is a new event, never an edit.
CREATE FUNCTION "forbid_audit_mutation"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'submission_events is append-only (% rejected)', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "submission_events_append_only"
    BEFORE UPDATE OR DELETE ON "submission_events"
    FOR EACH ROW EXECUTE FUNCTION "forbid_audit_mutation"();

-- TRUNCATE bypasses row triggers, so it needs its own statement-level one.
CREATE TRIGGER "submission_events_no_truncate"
    BEFORE TRUNCATE ON "submission_events"
    FOR EACH STATEMENT EXECUTE FUNCTION "forbid_audit_mutation"();
