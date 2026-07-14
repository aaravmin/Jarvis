-- 0019_instructions.sql, let the user attach freeform CONTEXT/INSTRUCTIONS to a template or a document,
-- so GOTT knows how to use it (e.g. "the bracketed parts are instructions, research the person and
-- fill them in"). Read by the email composers and the document tools; no behavior change until set.

alter table public.email_templates add column if not exists instructions text;
alter table public.documents add column if not exists instructions text;
