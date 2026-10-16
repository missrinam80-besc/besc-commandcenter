-- Build the requester's transcript from the immutable form snapshot, never from
-- a later edited type or internal conversation. One delivery remains one effect.
create function private.discord_intake_transcript(p_snapshot jsonb,p_answers jsonb)
returns table(part integer,content text) language plpgsql immutable set search_path='' as $$
declare q jsonb; answer jsonb; normalized jsonb; rendered text; document text:='';
 ch text; buffer text:=''; units integer:=0; width integer; begin
 normalized:=private.discord_answers(p_snapshot,p_answers);
 for q in select value from jsonb_array_elements(p_snapshot->'questions') loop
  answer:=normalized->(q->>'id');
  if jsonb_typeof(answer)='array' then
   select string_agg(option_row.value->>'label',', ' order by option_row.ordinality) into rendered
   from jsonb_array_elements(q->'options') with ordinality option_row(value,ordinality)
   where answer @> jsonb_build_array(option_row.value->>'value');
  else rendered:=answer#>>'{}'; end if;
  document:=document||(q->>'label')||E'\n'||coalesce(nullif(rendered,''),'(Niet ingevuld)')||E'\n\n';
 end loop;
 part:=1;
 -- Discord and the existing bot validator count UTF-16 units. Splitting on
 -- Unicode code points keeps emoji intact; 3800 leaves room for the heading.
 foreach ch in array string_to_array(document,null) loop
  width:=case when ascii(ch)>65535 then 2 else 1 end;
  if units+width>3800 then
   content:='Jouw ingevulde antwoorden (deel '||part||E')\n\n'||buffer;
   return next;part:=part+1;buffer:='';units:=0;
  end if;
  buffer:=buffer||ch;units:=units+width;
 end loop;
 if buffer<>'' then
  content:='Jouw ingevulde antwoorden (deel '||part||E')\n\n'||buffer;return next;
 end if;
end$$;
revoke all on function private.discord_intake_transcript(jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.discord_intake_transcript(jsonb,jsonb) to service_role;

create function private.enqueue_discord_intake_transcript()
returns trigger language plpgsql security invoker set search_path='' as $$
declare snapshot jsonb; chunk record; message uuid; begin
 select r.payload into snapshot from public.discord_ticket_type_revisions r
 where r.organization_id=new.organization_id and r.id=new.type_revision_id and r.type_id=new.type_id;
 if snapshot is null or snapshot is distinct from new.intake_snapshot then
  raise exception 'invalid_intake_snapshot';
 end if;
 for chunk in select * from private.discord_intake_transcript(snapshot,new.intake_answers) order by part loop
  insert into public.support_ticket_messages(organization_id,ticket_id,direction,author_discord_id,content,created_at)
  values(new.organization_id,new.id,'requester',new.requester_discord_id,chunk.content,
   new.created_at+chunk.part*interval '1 microsecond') returning id into message;
  insert into public.support_ticket_deliveries(organization_id,ticket_id,message_id,client_id,guild_id,parent_channel_id,kind,payload)
  values(new.organization_id,new.id,message,new.client_id,new.guild_id,new.parent_channel_id,'send_message',
   jsonb_build_object('message_id',message,'content',chunk.content));
 end loop;
 return new;
end$$;
revoke all on function private.enqueue_discord_intake_transcript() from public,anon,authenticated;
grant execute on function private.enqueue_discord_intake_transcript() to service_role;

-- Initial snapshot attachment is in the same transaction as ticket creation and
-- idempotency recording. Replays do not update the ticket. No historical backfill.
create trigger discord_intake_transcript
after update of intake_snapshot,intake_answers on public.support_tickets
for each row when (old.intake_snapshot is null and old.intake_answers is null
 and new.intake_snapshot is not null and new.intake_answers is not null)
execute function private.enqueue_discord_intake_transcript();
