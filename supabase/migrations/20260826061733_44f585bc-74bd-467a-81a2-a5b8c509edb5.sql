-- 1. Backfill ownerless demo rows to the existing workspace account.
with u as (select id from auth.users order by created_at limit 1)
update public.cases set created_by = (select id from u) where created_by is null;
with u as (select id from auth.users order by created_at limit 1)
update public.investigations set created_by = (select id from u) where created_by is null;
with u as (select id from auth.users order by created_at limit 1)
update public.findings set created_by = (select id from u) where created_by is null;
with u as (select id from auth.users order by created_at limit 1)
update public.evidence set added_by = (select id from u) where added_by is null;
with u as (select id from auth.users order by created_at limit 1)
update public.reports set created_by = (select id from u) where created_by is null;

-- 2. Ownership is mandatory and self-assigning from here on.
alter table public.cases alter column created_by set default auth.uid();
alter table public.cases alter column created_by set not null;
alter table public.investigations alter column created_by set default auth.uid();
alter table public.investigations alter column created_by set not null;
alter table public.findings alter column created_by set default auth.uid();
alter table public.findings alter column created_by set not null;
alter table public.evidence alter column added_by set default auth.uid();
alter table public.evidence alter column added_by set not null;
alter table public.reports alter column created_by set default auth.uid();
alter table public.reports alter column created_by set not null;

-- 3. Owner-or-admin writes, with WITH CHECK so ownership cannot be reassigned.
drop policy if exists cases_update on public.cases;
create policy cases_update on public.cases for update to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists cases_delete on public.cases;
create policy cases_delete on public.cases for delete to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists investigations_update on public.investigations;
create policy investigations_update on public.investigations for update to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists investigations_delete on public.investigations;
create policy investigations_delete on public.investigations for delete to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists findings_update on public.findings;
create policy findings_update on public.findings for update to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists findings_delete on public.findings;
create policy findings_delete on public.findings for delete to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists evidence_update on public.evidence;
create policy evidence_update on public.evidence for update to authenticated
  using (added_by = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (added_by = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists evidence_delete on public.evidence;
create policy evidence_delete on public.evidence for delete to authenticated
  using (added_by = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports for update to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'))
  with check (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));
drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports for delete to authenticated
  using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'));