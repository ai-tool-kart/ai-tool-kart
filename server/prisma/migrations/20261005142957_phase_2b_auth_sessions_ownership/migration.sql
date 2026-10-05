-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('USER', 'TOOL_OWNER', 'ADMIN', 'SUPER_ADMIN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'USER',
    "email_verified_at" TIMESTAMPTZ(3),
    "disabled_at" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_owners" (
    "tool_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "granted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tool_owners_pkey" PRIMARY KEY ("tool_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "tool_owners_user_id_idx" ON "tool_owners"("user_id");

-- CreateIndex
CREATE INDEX "submission_events_actor_user_id_idx" ON "submission_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "submissions_reviewer_id_idx" ON "submissions"("reviewer_id");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_events" ADD CONSTRAINT "submission_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_owners" ADD CONSTRAINT "tool_owners_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_owners" ADD CONSTRAINT "tool_owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_owners" ADD CONSTRAINT "tool_owners_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Hand-written: rules Prisma's schema language cannot express ───────────

-- The server stores emails trimmed and lowercased (auth/schema.ts). Enforcing
-- it here makes the unique index above case-insensitive in practice: a write
-- that bypasses normalization fails instead of creating a near-duplicate.
ALTER TABLE "users"
    ADD CONSTRAINT "users_email_normalized" CHECK ("email" = lower(btrim("email")) AND "email" <> ''),
    ADD CONSTRAINT "users_password_hash_format" CHECK ("password_hash" LIKE 'scrypt$%');

ALTER TABLE "sessions"
    ADD CONSTRAINT "sessions_token_hash_format" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    ADD CONSTRAINT "sessions_expiry_after_creation" CHECK ("expires_at" > "created_at");

-- Every submission has a submitting account, except rows imported from the
-- anonymous pre-database JSON store (Phase 2A importer).
ALTER TABLE "submissions"
    ADD CONSTRAINT "submissions_user_required" CHECK ("user_id" IS NOT NULL OR "source" = 'legacy_json');

-- A SYSTEM event has no human actor; an OWNER or ADMIN event must name one.
ALTER TABLE "submission_events"
    ADD CONSTRAINT "submission_events_actor_matches_type"
    CHECK (("actor_type" = 'SYSTEM') = ("actor_user_id" IS NULL));
