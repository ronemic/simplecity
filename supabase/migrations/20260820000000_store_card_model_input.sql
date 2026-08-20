-- Cards could not be audited after the fact: summary_cards.raw_llm_json keeps the
-- model's output, but the per-item text it was given was never stored.
-- meetings.llm_input_text is not a substitute -- it is assembled under a global
-- character budget, while the per-batch input the model receives is assembled
-- without one, so stored blocks are trimmed exactly on the busiest agendas.
alter table public.summary_cards
  add column if not exists model_input_text text;

comment on column public.summary_cards.model_input_text is
  'Verbatim agenda-item context supplied to the summary model for this card, for later accuracy auditing.';
