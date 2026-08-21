-- True all-or-nothing invoice creation.
--
-- PostgREST issues one statement per request, so a multi-table create from the
-- API cannot be atomic: if a line item fails after the invoice row lands, the
-- invoice is left behind with nothing on it. A plpgsql function runs inside a
-- single transaction, so any exception rolls the whole thing back.
--
-- Idempotent: the caller supplies the invoice id, so a repeat submit raises
-- unique_violation and returns already=true rather than creating a second copy.

create or replace function create_invoice_full(payload jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  inv_id uuid := (payload->>'invoice_id')::uuid;
  item   jsonb;
  n_items int := 0;
  n_adj   int := 0;
  n_pay   int := 0;
begin
  insert into invoices (
    id, title, contractor_name, contractor_contact, company,
    property_id, category, notes, hst_amount, status, share_token, due_date
  ) values (
    inv_id,
    payload->>'title',
    coalesce(payload->>'contractor_name', ''),   -- NOT NULL; the table's convention is '' not null
    nullif(payload->>'contractor_contact',''),
    nullif(payload->>'company',''),
    nullif(payload->>'property_id',''),
    nullif(payload->>'category',''),
    nullif(payload->>'notes',''),
    coalesce((payload->>'hst_amount')::numeric, 0),
    'open',
    encode(gen_random_bytes(8), 'hex'),
    (payload->>'due_date')::date
  );

  for item in select * from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) loop
    insert into invoice_items (id, invoice_id, description, amount)
    values ((item->>'id')::uuid, inv_id, item->>'description', (item->>'amount')::numeric);
    n_items := n_items + 1;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(payload->'adjustments','[]'::jsonb)) loop
    insert into invoice_adjustments (id, invoice_id, description, amount, reason)
    values ((item->>'id')::uuid, inv_id, item->>'description', (item->>'amount')::numeric,
            coalesce(item->>'reason','other'));
    n_adj := n_adj + 1;
  end loop;

  if payload->'payment' is not null and payload->'payment' <> 'null'::jsonb then
    insert into invoice_payments (id, invoice_id, amount, paid_at, method, status, due_date)
    values (
      (payload->'payment'->>'id')::uuid, inv_id,
      (payload->'payment'->>'amount')::numeric,
      nullif(payload->'payment'->>'paid_at','')::date,
      nullif(payload->'payment'->>'method',''),
      coalesce(payload->'payment'->>'status','paid'),
      nullif(payload->'payment'->>'due_date','')::date
    );
    n_pay := 1;
  end if;

  return jsonb_build_object('ok', true, 'invoice_id', inv_id,
                            'items', n_items, 'adjustments', n_adj, 'payments', n_pay);
exception
  when unique_violation then
    -- the same client-generated id already landed: a repeat submit
    return jsonb_build_object('ok', true, 'already', true, 'invoice_id', inv_id);
end;
$$;

grant execute on function create_invoice_full(jsonb) to service_role;
