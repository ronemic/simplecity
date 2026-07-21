-- Remove provisional "agenda not posted" cards once the same meeting has a
-- substantive summary card. Runtime reconciliation prevents recurrence.
--
-- Safety constraints:
--   * Placeholder wording must appear in the card title itself.
--   * Cards with an official source-item ID, feature flag, admin note, or
--     decision outcome are protected.
--   * A different, non-placeholder card must exist for the same meeting.
--   * Every deleted row is copied to admin_audit_log in the same statement.
--     If the audit insert fails, PostgreSQL rolls the deletion back.

with card_titles as (
  select
    id,
    meeting_id,
    lower(agenda_item) as title,
    source_item_id,
    is_featured,
    admin_notes
  from public.summary_cards
),
agenda_placeholders as (
  select id, meeting_id
  from card_titles
  where
    title ~ '\magenda\M.{0,120}\m(is|was|has|have|had)?[[:space:]]*not[[:space:]]+(yet[[:space:]]+)?(been[[:space:]]+)?(posted|published|available|provided|released|uploaded)\M'
    or title ~ '\magenda\M.{0,120}\m(has|have|had)[[:space:]]+yet[[:space:]]+to[[:space:]]+be[[:space:]]+(posted|published|provided|released|uploaded)\M'
    or title ~ '\mno[[:space:]]+(meeting[[:space:]]+)?agenda\M.{0,80}\m(posted|published|available|provided|released|uploaded)\M'
    or title ~ '\magenda\M.{0,60}\m(unavailable|pending|forthcoming)\M'
    or title ~ '\magenda\M.{0,80}\mwill[[:space:]]+be[[:space:]]+(posted|published|available|provided|released|uploaded)[[:space:]]+(later|soon|closer[[:space:]]+to[[:space:]]+the[[:space:]]+meeting)\M'
),
deletable_placeholders as (
  select placeholder.id
  from agenda_placeholders as placeholder
  join card_titles as candidate on candidate.id = placeholder.id
  where candidate.source_item_id is null
    and coalesce(candidate.is_featured, false) = false
    and nullif(btrim(candidate.admin_notes), '') is null
    and not exists (
      select 1
      from public.decision_outcomes as outcome
      where outcome.summary_card_id = candidate.id
    )
    and exists (
      select 1
      from card_titles as substantive
      where substantive.meeting_id = candidate.meeting_id
        and substantive.id <> candidate.id
        and not exists (
          select 1
          from agenda_placeholders as other_placeholder
          where other_placeholder.id = substantive.id
        )
    )
),
deleted as (
  delete from public.summary_cards as card
  using deletable_placeholders
  where card.id = deletable_placeholders.id
  returning card.*
)
insert into public.admin_audit_log (
  admin_email,
  action,
  entity_type,
  entity_id,
  before
)
select
  'migration:20260721000000',
  'delete_obsolete_agenda_placeholder',
  'summary_card',
  deleted.id,
  to_jsonb(deleted)
from deleted;
