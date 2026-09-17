-- ===== ROLES =====
CREATE TYPE public.app_role AS ENUM ('admin', 'investigator');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  agency TEXT,
  job_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "user_roles_select_authenticated" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== SHARED HELPERS =====
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', split_part(COALESCE(NEW.email, 'investigator'), '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'investigator')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== CASES =====
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_ref TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'active',
  jurisdiction TEXT,
  reported_loss NUMERIC,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cases TO authenticated;
GRANT ALL ON public.cases TO service_role;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cases_select" ON public.cases FOR SELECT TO authenticated USING (true);
CREATE POLICY "cases_insert" ON public.cases FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "cases_update" ON public.cases FOR UPDATE TO authenticated
  USING (created_by IS NULL OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "cases_delete" ON public.cases FOR DELETE TO authenticated
  USING (created_by IS NULL OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER cases_updated_at BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== INVESTIGATIONS =====
CREATE TABLE public.investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_ref TEXT NOT NULL UNIQUE,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  target_address TEXT NOT NULL,
  blockchain TEXT NOT NULL DEFAULT 'ethereum',
  trace_depth INTEGER NOT NULL DEFAULT 3,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  min_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'draft',
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investigations TO authenticated;
GRANT ALL ON public.investigations TO service_role;
ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "investigations_select" ON public.investigations FOR SELECT TO authenticated USING (true);
CREATE POLICY "investigations_insert" ON public.investigations FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "investigations_update" ON public.investigations FOR UPDATE TO authenticated
  USING (created_by IS NULL OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "investigations_delete" ON public.investigations FOR DELETE TO authenticated
  USING (created_by IS NULL OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER investigations_updated_at BEFORE UPDATE ON public.investigations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX investigations_case_idx ON public.investigations(case_id);

-- ===== FINDINGS =====
CREATE TABLE public.findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_ref TEXT NOT NULL UNIQUE,
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  investigation_id UUID REFERENCES public.investigations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  confidence INTEGER NOT NULL DEFAULT 50,
  finding_type TEXT,
  related JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.findings TO authenticated;
GRANT ALL ON public.findings TO service_role;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "findings_select" ON public.findings FOR SELECT TO authenticated USING (true);
CREATE POLICY "findings_insert" ON public.findings FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "findings_update" ON public.findings FOR UPDATE TO authenticated
  USING (created_by IS NULL OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "findings_delete" ON public.findings FOR DELETE TO authenticated
  USING (created_by IS NULL OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER findings_updated_at BEFORE UPDATE ON public.findings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX findings_investigation_idx ON public.findings(investigation_id);

-- ===== EVIDENCE =====
CREATE TABLE public.evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_ref TEXT NOT NULL UNIQUE,
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  investigation_id UUID REFERENCES public.investigations(id) ON DELETE SET NULL,
  finding_id UUID REFERENCES public.findings(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  evidence_type TEXT NOT NULL DEFAULT 'transaction',
  description TEXT,
  source TEXT,
  attachment_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence TO authenticated;
GRANT ALL ON public.evidence TO service_role;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evidence_select" ON public.evidence FOR SELECT TO authenticated USING (true);
CREATE POLICY "evidence_insert" ON public.evidence FOR INSERT TO authenticated WITH CHECK (added_by = auth.uid());
CREATE POLICY "evidence_update" ON public.evidence FOR UPDATE TO authenticated
  USING (added_by IS NULL OR added_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "evidence_delete" ON public.evidence FOR DELETE TO authenticated
  USING (added_by IS NULL OR added_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER evidence_updated_at BEFORE UPDATE ON public.evidence FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== REPORTS =====
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_ref TEXT NOT NULL UNIQUE,
  case_id UUID REFERENCES public.cases(id) ON DELETE CASCADE,
  investigation_id UUID REFERENCES public.investigations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports_select" ON public.reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "reports_insert" ON public.reports FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "reports_update" ON public.reports FOR UPDATE TO authenticated
  USING (created_by IS NULL OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "reports_delete" ON public.reports FOR DELETE TO authenticated
  USING (created_by IS NULL OR created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER reports_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== SEED: COHERENT DEMO INVESTIGATION STORIES =====
INSERT INTO public.cases (id, case_ref, title, description, priority, status, jurisdiction, reported_loss, created_at)
VALUES
 ('11111111-1111-4111-8111-111111111101', 'CASE-2026-0142', 'Multi-victim USDT drainer campaign',
  'Seventeen complaints filed against a fake airdrop portal. Victim funds consolidated into a single drainer wallet before being layered through freshly created intermediaries.',
  'critical', 'active', 'Maharashtra Cyber, IN', 412500, now() - interval '9 days'),
 ('11111111-1111-4111-8111-111111111102', 'CASE-2026-0138', 'Ransomware payout tracing — "Kelpie" affiliate',
  'Hospital network paid a 6.4 ETH ransom. Tracing the payout wallet to determine cash-out venue and affiliate split behaviour.',
  'high', 'active', 'CERT-In coordination', 21800, now() - interval '16 days'),
 ('11111111-1111-4111-8111-111111111103', 'CASE-2026-0131', 'P2P mule network — fiat off-ramp cluster',
  'Suspected mule cluster receiving fragmented deposits from multiple unrelated fraud complaints and off-ramping via P2P desks.',
  'medium', 'under_review', 'Bengaluru City Police', 96400, now() - interval '28 days'),
 ('11111111-1111-4111-8111-111111111104', 'CASE-2026-0119', 'Investment scam — closed with report',
  'Ponzi-style staking scheme. Funds traced to an attributed exchange deposit address; report submitted to the requesting officer.',
  'low', 'closed', 'Delhi EOW', 58200, now() - interval '54 days');

INSERT INTO public.investigations (id, investigation_ref, case_id, name, description, target_address, blockchain, trace_depth, window_start, window_end, min_value, status, summary, created_at, completed_at)
VALUES
 ('22222222-2222-4222-8222-222222222201', 'INV-0311', '11111111-1111-4111-8111-111111111101',
  'Drainer consolidation wallet — 4 hop trace',
  'Trace from the primary consolidation wallet identified across 17 victim complaints. Objective: locate the VASP deposit endpoint.',
  '0x7f3a9c41d8b2e6a05c19fd4b7e82a1c60d5f93ab', 'ethereum', 4,
  now() - interval '30 days', now() - interval '1 day', 500, 'complete',
  '{"hops":4,"addresses":58,"transactions":214,"relevantPaths":6,"vaspCandidates":3,"valueTraced":"318,940 USDT","continuity":0.87}'::jsonb,
  now() - interval '8 days', now() - interval '7 days'),
 ('22222222-2222-4222-8222-222222222202', 'INV-0314', '11111111-1111-4111-8111-111111111101',
  'Secondary fan-out branch review',
  'Branch B of the drainer graph fragmented into 11 low-value outputs. Assessing whether this branch is decoy activity.',
  '0x2c9e7b0416f5a83d1e64c07b9d2af35810be47cd', 'ethereum', 3,
  now() - interval '30 days', now(), 100, 'processing',
  '{"hops":3,"addresses":31,"transactions":88,"relevantPaths":2,"vaspCandidates":1,"valueTraced":"41,220 USDT","continuity":0.42}'::jsonb,
  now() - interval '2 days', NULL),
 ('22222222-2222-4222-8222-222222222203', 'INV-0298', '11111111-1111-4111-8111-111111111102',
  'Ransom payout wallet trace',
  'Trace of the 6.4 ETH payout address. Rapid three-hop movement observed within 41 minutes of payment.',
  '0xa41d90f7cb35e28016dcb47f9a5e13b7042c68ff', 'ethereum', 3,
  now() - interval '20 days', now() - interval '2 days', 0.1, 'complete',
  '{"hops":3,"addresses":22,"transactions":47,"relevantPaths":3,"vaspCandidates":2,"valueTraced":"6.12 ETH","continuity":0.94}'::jsonb,
  now() - interval '14 days', now() - interval '13 days'),
 ('22222222-2222-4222-8222-222222222204', 'INV-0287', '11111111-1111-4111-8111-111111111103',
  'Mule cluster convergence analysis',
  'Convergence analysis across four complaint wallets suspected of funding one off-ramp cluster.',
  '0x5d18ba7c92e04f36a1c78d05be493f27061ac8d3', 'polygon', 4,
  now() - interval '45 days', now() - interval '5 days', 250, 'queued',
  '{}'::jsonb, now() - interval '4 days', NULL),
 ('22222222-2222-4222-8222-222222222205', 'INV-0244', '11111111-1111-4111-8111-111111111104',
  'Staking scheme deposit endpoint trace',
  'Completed trace terminating at an attributed exchange deposit address.',
  '0x93b7e5a10cd28f640b1e7a95c3d40f28169bde07', 'ethereum', 3,
  now() - interval '60 days', now() - interval '40 days', 100, 'complete',
  '{"hops":3,"addresses":19,"transactions":36,"relevantPaths":2,"vaspCandidates":1,"valueTraced":"52.4 ETH","continuity":0.91}'::jsonb,
  now() - interval '50 days', now() - interval '49 days');

INSERT INTO public.findings (id, finding_ref, case_id, investigation_id, title, description, severity, confidence, finding_type, related, status, created_at)
VALUES
 ('33333333-3333-4333-8333-333333333301', 'FND-0912', '11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222201',
  'Primary path terminates at attributed VASP deposit address',
  'The highest-continuity path (Target → A → C → Endpoint) preserves 87% of traced value and terminates at an address attributed to a centralised exchange deposit cluster. Temporal gap between hops is under 12 minutes throughout.',
  'critical', 84, 'vasp_endpoint',
  '{"addresses":["0x7f3a9c41d8b2e6a05c19fd4b7e82a1c60d5f93ab","0xd41b8fa2c7e590163bd8a4f2e07c9153ab6de820"],"entity":"Exchange candidate — Tier 1","paths":["PATH-A"],"txHashes":["0x9c1f...4ab7","0x33ea...80cd"]}'::jsonb,
  'open', now() - interval '7 days'),
 ('33333333-3333-4333-8333-333333333302', 'FND-0915', '11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222201',
  'Rapid multi-hop layering across freshly created wallets',
  'Four intermediary addresses in the primary path were first funded less than 90 minutes before receiving traced value, and held funds for an average of 6 minutes. Behaviour is consistent with automated layering.',
  'high', 78, 'behaviour',
  '{"addresses":["0x2c9e7b0416f5a83d1e64c07b9d2af35810be47cd"],"paths":["PATH-A","PATH-B"],"pattern":"layering"}'::jsonb,
  'open', now() - interval '7 days'),
 ('33333333-3333-4333-8333-333333333303', 'FND-0918', '11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222202',
  'Fan-out branch shows dust-level decoy characteristics',
  'Branch B distributed value across 11 outputs averaging 0.4% of the parent transaction. Value continuity drops to 0.42, suggesting deliberate noise rather than meaningful continuation.',
  'medium', 61, 'noise',
  '{"addresses":["0x2c9e7b0416f5a83d1e64c07b9d2af35810be47cd"],"paths":["PATH-B"],"pattern":"fan_out"}'::jsonb,
  'open', now() - interval '2 days'),
 ('33333333-3333-4333-8333-333333333304', 'FND-0881', '11111111-1111-4111-8111-111111111102', '22222222-2222-4222-8222-222222222203',
  'Ransom payout split between two affiliate wallets',
  'Payout was split 70/30 within 41 minutes. The 70% branch reaches a bridge contract; the 30% branch reaches an address with prior attribution to a swap service.',
  'high', 88, 'split',
  '{"addresses":["0xa41d90f7cb35e28016dcb47f9a5e13b7042c68ff"],"paths":["PATH-A","PATH-C"],"pattern":"affiliate_split"}'::jsonb,
  'confirmed', now() - interval '13 days'),
 ('33333333-3333-4333-8333-333333333305', 'FND-0874', '11111111-1111-4111-8111-111111111102', '22222222-2222-4222-8222-222222222203',
  'Trace confidence degrades after bridge interaction',
  'The dominant branch interacts with a cross-chain bridge contract at hop 2. On-chain continuity beyond this point is unavailable without destination-chain ingestion.',
  'medium', 45, 'uncertainty',
  '{"addresses":["0x0f9b21c7ad4e58316f0cb2d947ae15c8073bd6e1"],"paths":["PATH-A"],"pattern":"bridge"}'::jsonb,
  'open', now() - interval '13 days'),
 ('33333333-3333-4333-8333-333333333306', 'FND-0790', '11111111-1111-4111-8111-111111111104', '22222222-2222-4222-8222-222222222205',
  'Funds fully attributed to exchange deposit address',
  'All relevant paths converge on a single deposit address attributed to a registered VASP with a published law-enforcement contact channel.',
  'high', 92, 'vasp_endpoint',
  '{"addresses":["0x93b7e5a10cd28f640b1e7a95c3d40f28169bde07"],"entity":"Registered VASP","paths":["PATH-A"]}'::jsonb,
  'closed', now() - interval '49 days');

INSERT INTO public.evidence (evidence_ref, case_id, investigation_id, finding_id, title, evidence_type, description, source, metadata, created_at)
VALUES
 ('EVD-1204', '11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301',
  'Transaction record 0x9c1f…4ab7 — Target → Wallet A', 'transaction',
  'Primary outbound transfer of 214,300 USDT from the consolidation wallet, 11 minutes after the final victim deposit.',
  'Ethereum mainnet (provider ingest)',
  '{"txHash":"0x9c1f8b27ad4e0f6315c9b7de204a83f10bd5e4ab7","value":"214,300 USDT","blockNumber":21894113}'::jsonb,
  now() - interval '7 days'),
 ('EVD-1205', '11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333301',
  'Attribution record — exchange deposit cluster', 'reference',
  'Public attribution record associating the endpoint address with a centralised exchange deposit cluster. Source freshness: 14 days.',
  'Attribution knowledge base',
  '{"confidence":"medium-high","sourceType":"public_dataset","lastVerified":"14 days ago"}'::jsonb,
  now() - interval '7 days'),
 ('EVD-1211', '11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222201', '33333333-3333-4333-8333-333333333302',
  'Graph snapshot — primary path highlighted', 'graph_snapshot',
  'Investigation canvas snapshot with PATH-A isolated and hop timings annotated.',
  'VASPTRACE canvas',
  '{"nodes":12,"edges":15,"snapshotOf":"PATH-A"}'::jsonb,
  now() - interval '6 days'),
 ('EVD-1188', '11111111-1111-4111-8111-111111111102', '22222222-2222-4222-8222-222222222203', '33333333-3333-4333-8333-333333333304',
  'Wallet record — payout address activity profile', 'wallet',
  'First-seen, last-seen, counterparty count and holding-period profile for the ransom payout address.',
  'Ethereum mainnet (provider ingest)',
  '{"firstSeen":"22 days ago","counterparties":14,"avgHoldingPeriod":"6m 40s"}'::jsonb,
  now() - interval '13 days'),
 ('EVD-1190', '11111111-1111-4111-8111-111111111102', '22222222-2222-4222-8222-222222222203', '33333333-3333-4333-8333-333333333305',
  'Investigator note — bridge continuation limits', 'note',
  'Continuation beyond the bridge requires destination-chain ingestion. Flagged for the multi-chain ingestion backlog rather than treated as a dead end.',
  'Investigator note',
  '{"author":"Demo investigator"}'::jsonb,
  now() - interval '12 days'),
 ('EVD-1042', '11111111-1111-4111-8111-111111111104', '22222222-2222-4222-8222-222222222205', '33333333-3333-4333-8333-333333333306',
  'Signed report package — CASE-2026-0119', 'document',
  'Final investigation report submitted to the requesting officer, including path analysis and entity intelligence appendix.',
  'Report builder export',
  '{"pages":18,"format":"pdf"}'::jsonb,
  now() - interval '48 days');

INSERT INTO public.reports (report_ref, case_id, investigation_id, title, status, sections, notes, created_at)
VALUES
 ('RPT-0231', '11111111-1111-4111-8111-111111111101', '22222222-2222-4222-8222-222222222201',
  'CASE-2026-0142 — Interim tracing report', 'draft',
  '["case_summary","investigation_summary","key_findings","fund_paths","entity_intelligence","evidence","investigator_notes"]'::jsonb,
  'Interim report for the requesting officer. Awaiting confirmation on the Tier 1 exchange candidate before submission.',
  now() - interval '5 days'),
 ('RPT-0198', '11111111-1111-4111-8111-111111111104', '22222222-2222-4222-8222-222222222205',
  'CASE-2026-0119 — Final investigation report', 'submitted',
  '["case_summary","investigation_summary","key_findings","fund_paths","entity_intelligence","evidence"]'::jsonb,
  'Submitted to Delhi EOW. VASP contacted through published law-enforcement channel.',
  now() - interval '48 days');