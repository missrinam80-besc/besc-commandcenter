do $$
begin
  if to_regclass('private.newsletter_subscription_requests') is not null then
    create index if not exists newsletter_subscription_requests_org_list_idx
      on private.newsletter_subscription_requests(organization_id, mailing_list_id);
  end if;
  if to_regclass('private.newsletter_unsubscribe_requests') is not null then
    create index if not exists newsletter_unsubscribe_requests_org_list_idx
      on private.newsletter_unsubscribe_requests(organization_id, mailing_list_id);
  end if;
end $$;
