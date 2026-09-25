-- Pin the jurisdictions before the table is relied on.
--
-- mat_filings has held exactly one row since August — a Toronto Q2 report — and
-- nothing reads it. That is about to change: Katherine's Port Colborne filings
-- are being recorded so the overdue warning can tell a filed quarter from an
-- unfiled one, and a warning is only as trustworthy as the table under it.
--
-- WITHOUT THIS, 'port colborne' OR 'portcolborne' OR 'Port Colborne' WOULD ALL
-- INSERT, and each would be a jurisdiction the query looking for
-- 'port-colborne' cannot see. The failure would be silent and would look exactly
-- like a missing filing — the warning would fire on a quarter that was filed and
-- recorded, which is worse than not warning at all, because it teaches you to
-- ignore it.
--
-- Two values because there are two municipalities: Toronto for the Royal York
-- properties, Port Colborne for Nickel Beach. A third would be a real change and
-- should require editing this line.

alter table mat_filings drop constraint if exists mat_filings_jurisdiction_check;
alter table mat_filings
  add constraint mat_filings_jurisdiction_check
  check (jurisdiction in ('toronto', 'port-colborne'));

notify pgrst, 'reload schema';

-- Returns rows, so "Success. No rows returned." means it did not run.
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint where conname = 'mat_filings_jurisdiction_check';
