-- ---------------------------------------------------------------------------
-- 0004 — follow-up columns for integrations added after 0003 was authored.
--
-- 0003 already ships on main, so anything new goes in its own migration to keep
-- `wrangler d1 migrations apply` idempotent for both local and remote DBs.
-- ---------------------------------------------------------------------------

-- Web Push: track failing endpoints so we stop hammering dead subscriptions.
ALTER TABLE push_subscriptions ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0;

-- Client error reports: keep the structured context the SPA attaches (page,
-- breadcrumbs, release channel) without stuffing it into `message`.
ALTER TABLE client_errors ADD COLUMN context TEXT;
ALTER TABLE client_errors ADD COLUMN level TEXT NOT NULL DEFAULT 'error';
ALTER TABLE client_errors ADD COLUMN source TEXT;
