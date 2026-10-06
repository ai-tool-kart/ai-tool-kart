-- Phase 6: admin moderation and the administrative audit trail.
--
-- Additive only. No existing column, constraint, index or trigger changes,
-- so the Phase 2A/2B rules (append-only submission_events, the live-URL
-- partial unique index, the actor CHECKs) keep holding exactly as before.
--
-- ADD VALUE is safe inside the migration's transaction on PostgreSQL 12+
-- because nothing below USES the new values in the same transaction.

-- Moderation decisions recorded on a submission's own timeline.
-- NOTE_ADDED is an internal, admin-only note: never part of the owner view.
ALTER TYPE "submission_event_type" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "submission_event_type" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TYPE "submission_event_type" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';
ALTER TYPE "submission_event_type" ADD VALUE IF NOT EXISTS 'NOTE_ADDED';

-- CreateEnum
CREATE TYPE "admin_action" AS ENUM ('TOOL_UPDATED', 'TOOL_OWNER_GRANTED', 'TOOL_OWNER_REVOKED', 'USER_ROLE_CHANGED');

-- CreateTable
CREATE TABLE "admin_audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" "admin_action" NOT NULL,
    "target_tool_id" TEXT,
    "target_user_id" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_audit_events_created_at_idx" ON "admin_audit_events"("created_at");

-- CreateIndex
CREATE INDEX "admin_audit_events_actor_user_id_idx" ON "admin_audit_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "admin_audit_events_target_tool_id_created_at_idx" ON "admin_audit_events"("target_tool_id", "created_at");

-- CreateIndex
CREATE INDEX "admin_audit_events_target_user_id_created_at_idx" ON "admin_audit_events"("target_user_id", "created_at");

-- CreateIndex
CREATE INDEX "submission_events_created_at_idx" ON "submission_events"("created_at");

-- CreateIndex
CREATE INDEX "submissions_updated_at_idx" ON "submissions"("updated_at");

-- AddForeignKey
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_target_tool_id_fkey" FOREIGN KEY ("target_tool_id") REFERENCES "tools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Hand-written: rules Prisma's schema language cannot express ───────────

ALTER TABLE "admin_audit_events"
    ADD CONSTRAINT "admin_audit_events_metadata_is_object" CHECK (jsonb_typeof("metadata") = 'object'),
    -- Every action is about something: a tool, a user, or both.
    ADD CONSTRAINT "admin_audit_events_has_target" CHECK ("target_tool_id" IS NOT NULL OR "target_user_id" IS NOT NULL);

-- Append-only, exactly like submission_events. A new function rather than
-- reusing forbid_audit_mutation(), whose message names submission_events;
-- that function is left untouched.
CREATE FUNCTION "forbid_admin_audit_mutation"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'admin_audit_events is append-only (% rejected)', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER "admin_audit_events_append_only"
    BEFORE UPDATE OR DELETE ON "admin_audit_events"
    FOR EACH ROW EXECUTE FUNCTION "forbid_admin_audit_mutation"();

CREATE TRIGGER "admin_audit_events_no_truncate"
    BEFORE TRUNCATE ON "admin_audit_events"
    FOR EACH STATEMENT EXECUTE FUNCTION "forbid_admin_audit_mutation"();
