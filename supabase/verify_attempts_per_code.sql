-- ═════════════════════════════════════════════════════════════════════════════
-- Per-CODE rate limiting.
--
-- The existing limiter counts failures per IP address, which stops somebody
-- hammering from one machine and stops nothing else. The real attack on this
-- gate is narrower and cheaper: the confirmation code is the secret, the
-- surname is not — surnames are on the public record — so an attacker who has
-- ONE code (from a forwarded email, a shared screenshot, a referrer log) needs
-- only to guess a surname, and can do it from as many addresses as they care to
-- rent. Per-IP counting never sees that run at all.
--
-- A PER-CODE COUNTER SEES IT WHEREVER IT COMES FROM. Ten failures against one
-- code and that code stops answering for an hour, no matter how many addresses
-- ask.
--
-- THE CODE IS HASHED, NEVER STORED. A rate-limit table holding plaintext
-- confirmation codes would be a new place the secret lives — a log that is also
-- a credential dump, accumulating every code anyone ever typed including the
-- correct ones. A SHA-256 with a server-side pepper counts exactly as well and
-- holds nothing worth stealing. The pepper is GUEST_SESSION_SECRET, which
-- already exists and already fails closed when absent.
-- ═════════════════════════════════════════════════════════════════════════════

alter table verify_attempts
  add column if not exists code_hash text;

comment on column verify_attempts.code_hash is
  'SHA-256 of the peppered confirmation code. Never the code itself — this table would otherwise become a list of every code anyone has typed.';

-- the per-code lookup: failures for one code inside a window
create index if not exists idx_verify_code_time
  on verify_attempts (code_hash, created_at)
  where success = false;

notify pgrst, 'reload schema';
