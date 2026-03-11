-- Seed default Roles
-- Runs once automatically via `prisma migrate deploy` on any fresh DB.
-- ON CONFLICT DO NOTHING ensures this is idempotent (safe to deploy multiple times).

INSERT INTO "roles" ("id", "name", "description", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'USER',  'Default role for all registered users', NOW(), NOW()),
  (gen_random_uuid(), 'ADMIN', 'Full access system administrator',      NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;
