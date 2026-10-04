-- Execute against the real project; fixtures and all financial writes are rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('6135c290-a19a-4892-9e9b-80d64ba14811','shards-a@example.invalid','{"role_name":"碎片甲"}'),
 ('6135c290-a19a-4892-9e9b-80d64ba14812','shards-b@example.invalid','{"role_name":"碎片乙","admin":true}'),
 ('6135c290-a19a-4892-9e9b-80d64ba14813','shards-admin@example.invalid','{"role_name":"审核者"}');
insert into moxiu_private.shard_admins values('6135c290-a19a-4892-9e9b-80d64ba14813');
set local role authenticated;
select set_config('request.jwt.claim.sub','6135c290-a19a-4892-9e9b-80d64ba14811',true);
do $$
declare x jsonb; n integer;
begin
 x := public.moxiu_shards();
 assert (x->>'balance')::integer=0 and not (x->>'admin')::boolean, 'New wallet starts empty';
 assert jsonb_array_length(x->'catalog')=6 and jsonb_array_length(x->'review')=0, 'Catalog / private admin queue';
 x := public.moxiu_shards('request','{"id":"7135c290-a19a-4892-9e9b-80d64ba14811","amount":100,"user_id":"6135c290-a19a-4892-9e9b-80d64ba14812"}');
 perform public.moxiu_shards('request','{"id":"7135c290-a19a-4892-9e9b-80d64ba14811","amount":100}');
 assert jsonb_array_length(x->'orders')=1 and (x->>'balance')::integer=0, 'Request cannot credit or choose recipient';
 begin
   perform public.moxiu_shards('approve','{"id":"7135c290-a19a-4892-9e9b-80d64ba14811","amount":100,"receipt":"test_receipt_001"}');
   raise exception 'Self approval accepted';
 exception when insufficient_privilege then null; end;
 begin
   update moxiu_private.shard_wallets set balance=999999;
   raise exception 'Direct balance update accepted';
 exception when insufficient_privilege then null; end;
 begin
   insert into moxiu_private.shard_admins values('6135c290-a19a-4892-9e9b-80d64ba14811');
   raise exception 'Admin escalation accepted';
 exception when insufficient_privilege then null; end;
 begin
   perform public.moxiu_shards('request','{"id":"7135c290-a19a-4892-9e9b-80d64ba14811","amount":1}');
   raise exception 'ID reused with different amount';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.moxiu_shards('request','{"id":"7135c290-a19a-4892-9e9b-80d64ba14812","amount":2}');
   raise exception 'Invalid tier accepted';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.moxiu_shards(null,'{}');
   raise exception 'Null action accepted';
 exception when invalid_parameter_value then null; end;
 for n in 1..4 loop
   perform public.moxiu_shards('request',jsonb_build_object('id',gen_random_uuid(),'amount',1));
 end loop;
 begin
   perform public.moxiu_shards('request',jsonb_build_object('id',gen_random_uuid(),'amount',5));
   raise exception 'Pending limit ignored';
 exception when invalid_parameter_value then null; end;
end;
$$;
select set_config('request.jwt.claim.sub','6135c290-a19a-4892-9e9b-80d64ba14813',true);
do $$
declare x jsonb;
begin
 x := public.moxiu_shards();
 assert (x->>'admin')::boolean and jsonb_array_length(x->'review')=5, 'Admin sees pending requests';
 begin
   perform public.moxiu_shards('approve','{"id":"7135c290-a19a-4892-9e9b-80d64ba14811","amount":50,"receipt":"test_receipt_001"}');
   raise exception 'Mismatched receipt amount accepted';
 exception when invalid_parameter_value then null; end;
 perform public.moxiu_shards('approve','{"id":"7135c290-a19a-4892-9e9b-80d64ba14811","amount":100,"receipt":"test_receipt_001"}');
 perform public.moxiu_shards('approve','{"id":"7135c290-a19a-4892-9e9b-80d64ba14811","amount":100,"receipt":"test_receipt_001"}');
 begin
   perform public.moxiu_shards('approve','{"id":"7135c290-a19a-4892-9e9b-80d64ba14811","amount":100,"receipt":"test_receipt_other"}');
   raise exception 'Already approved order accepts new receipt';
 exception when invalid_parameter_value then null; end;
 begin
   perform public.moxiu_shards('reject','{"id":"7135c290-a19a-4892-9e9b-80d64ba14811","note":"无收款"}');
   raise exception 'Approved order rejected';
 exception when invalid_parameter_value then null; end;
end;
$$;
select set_config('request.jwt.claim.sub','6135c290-a19a-4892-9e9b-80d64ba14812',true);
do $$
declare x jsonb;
begin
 x := public.moxiu_shards();
 assert (x->>'balance')::integer=0 and jsonb_array_length(x->'orders')=0 and not (x->>'admin')::boolean,
   'Other user has isolated balance / orders; metadata cannot grant admin';
 begin
   perform public.moxiu_shards('purchase','{"id":"8135c290-a19a-4892-9e9b-80d64ba14811","sku":"title_cloud","price":0}');
   raise exception 'Free purchase accepted';
 exception when invalid_parameter_value then null; end;
 perform public.moxiu_shards('request','{"id":"7135c290-a19a-4892-9e9b-80d64ba14812","amount":100}');
 begin
   perform public.moxiu_shards('request','{"id":"7135c290-a19a-4892-9e9b-80d64ba14811","amount":100}');
   raise exception 'Foreign request replay accepted';
 exception when invalid_parameter_value then null; end;
end;
$$;
select set_config('request.jwt.claim.sub','6135c290-a19a-4892-9e9b-80d64ba14813',true);
do $$
begin
 begin
   perform public.moxiu_shards('approve','{"id":"7135c290-a19a-4892-9e9b-80d64ba14812","amount":100,"receipt":"test_receipt_001"}');
   raise exception 'Receipt reused across accounts';
 exception when invalid_parameter_value then null; end;
 perform public.moxiu_shards('reject','{"id":"7135c290-a19a-4892-9e9b-80d64ba14812","note":"未收到款项"}');
 begin
   perform public.moxiu_shards('approve','{"id":"7135c290-a19a-4892-9e9b-80d64ba14812","amount":100,"receipt":"test_receipt_002"}');
   raise exception 'Rejected order credited';
 exception when invalid_parameter_value then null; end;
end;
$$;
select set_config('request.jwt.claim.sub','6135c290-a19a-4892-9e9b-80d64ba14811',true);
do $$
declare x jsonb; sku text;
begin
 x := public.moxiu_shards();
 assert (x->>'balance')::integer=1000 and jsonb_array_length(x->'ledger')=1, 'Duplicate approval credits only once';
 perform public.moxiu_shards('purchase','{"id":"8135c290-a19a-4892-9e9b-80d64ba14811","sku":"farm_extra","price":1}');
 x := public.moxiu_shards('purchase','{"id":"8135c290-a19a-4892-9e9b-80d64ba14811","sku":"farm_extra"}');
 assert (x->>'balance')::integer=800 and jsonb_array_length(x->'owned')=1, 'Server price / idempotent purchase';
 begin
   perform public.moxiu_shards('purchase',jsonb_build_object('id',gen_random_uuid(),'sku','farm_extra'));
   raise exception 'Repeated entitlement charged';
 exception when invalid_parameter_value then null; end;
 foreach sku in array array['ranch_extra','suburb_extra','title_cloud','title_gate','title_ink'] loop
   perform public.moxiu_shards('purchase',jsonb_build_object('id',gen_random_uuid(),'sku',sku));
 end loop;
 x := public.moxiu_shards('equip','{"sku":"title_cloud"}');
 assert x->>'title'='title_cloud' and (x->>'balance')::integer=150 and jsonb_array_length(x->'owned')=6, 'All entitlements purchased / title selection';
 begin
   perform public.moxiu_shards('equip','{"sku":"farm_extra"}');
   raise exception 'Capacity equipped as title';
 exception when invalid_parameter_value then null; end;
 perform public.moxiu_shards('equip','{"sku":""}');
 -- Editable game state reset/import does not touch the financial wallet.
 perform public.moxiu_write_test_save('{"player":{},"currency":{},"shards":{"balance":999999,"owned":[]}}',0);
 x := public.moxiu_shards();
 assert (x->>'balance')::integer=150 and jsonb_array_length(x->'owned')=6, 'Snapshot cannot change financial data';
end;
$$;
-- Exercise all six amount tiers and verify exact conversion in real SQL transactions.
do $$
declare n integer; order_id uuid; x jsonb; before_balance integer;
begin
 foreach n in array array[1,5,10,25,50,100] loop
   perform set_config('request.jwt.claim.sub','6135c290-a19a-4892-9e9b-80d64ba14812',true);
   before_balance := (public.moxiu_shards()->>'balance')::integer;
   order_id := gen_random_uuid();
   perform public.moxiu_shards('request',jsonb_build_object('id',order_id,'amount',n));
   perform set_config('request.jwt.claim.sub','6135c290-a19a-4892-9e9b-80d64ba14813',true);
   perform public.moxiu_shards('approve',jsonb_build_object('id',order_id,'amount',n,'receipt','tier_test_'||n));
   perform set_config('request.jwt.claim.sub','6135c290-a19a-4892-9e9b-80d64ba14812',true);
   x := public.moxiu_shards();
   assert (x->>'balance')::integer = before_balance+n*10, 'Tier conversion';
 end loop;
end;
$$;
set local role anon;
do $$ begin
 begin perform public.moxiu_shards(); raise exception 'Anonymous money API access';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'shard permission, six tiers, manual review, replay, receipt uniqueness, purchase, snapshot isolation assertions passed; all fixtures rolled back' as result;
rollback;
