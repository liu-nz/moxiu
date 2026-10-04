alter table public.moxiu_test_saves drop constraint moxiu_test_saves_payload_check;
alter table public.moxiu_test_saves add constraint moxiu_test_saves_payload_check check ((
  jsonb_typeof(payload) = 'object'
  and jsonb_typeof(payload -> 'player') = 'object'
  and jsonb_typeof(payload -> 'currency') = 'object'
  and octet_length(payload::text) <= 1048576
) is true);
