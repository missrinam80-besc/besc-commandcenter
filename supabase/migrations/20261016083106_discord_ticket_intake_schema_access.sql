-- Ticket intake is SECURITY INVOKER and calls private.discord_answers, which in
-- turn calls private.discord_utf16_length. Both already grant EXECUTE only to
-- service_role, but those grants cannot be used without schema USAGE.
-- Give only the existing server role schema lookup access; do not expose the
-- schema through the Data API or grant CREATE / object privileges to any role.
grant usage on schema private to service_role;
