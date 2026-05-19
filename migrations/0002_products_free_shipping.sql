-- Adds the free_shipping flag to products so the admin can toggle a
-- "🚚 FREE SHIPPING" chip on the customer-facing product card.
-- Idempotent — safe to re-run.

alter table public.products add column if not exists free_shipping boolean default false;
