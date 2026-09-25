-- Which account paid an expense.
--
-- The column did not exist. Every expense recorded so far says what was bought
-- and for which property, and nothing about where the money left from — so
-- reconciling a card statement against the books means matching on amount and
-- date and hoping. bank_accounts has held the three real accounts since the
-- payments work; expenses simply never pointed at it.
--
-- NULLABLE, and no backfill. Every existing row genuinely does not know, and a
-- guessed account is worse than an absent one: it would reconcile against a
-- statement it never appeared on. They stay null until someone says otherwise.
alter table expenses add column if not exists account_id uuid references bank_accounts(id);
create index if not exists expenses_account_idx on expenses (account_id) where account_id is not null;

notify pgrst, 'reload schema';

-- Returns rows, so "Success. No rows returned." means it did not run.
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_name = 'expenses' and column_name = 'account_id';
