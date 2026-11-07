-- Human-reviewed safety findings are separate from star ratings and reports.
BEGIN;
CREATE TABLE public."SafetyNotice" (
  "id" TEXT PRIMARY KEY,
  "subject_id" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "dispute_id" TEXT NOT NULL REFERENCES public."Dispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "issued_by" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "category" TEXT NOT NULL,
  "private_reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "removed_at" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SafetyNotice_category_check" CHECK (category IN ('misrepresentation','unexpected_fees','unsafe_conduct','other')),
  CONSTRAINT "SafetyNotice_reason_check" CHECK (length(btrim(private_reason)) BETWEEN 30 AND 2000),
  CONSTRAINT "SafetyNotice_status_check" CHECK ((status='active' AND removed_at IS NULL) OR (status='removed' AND removed_at IS NOT NULL)),
  CONSTRAINT "SafetyNotice_not_self_check" CHECK (subject_id<>issued_by)
);
CREATE UNIQUE INDEX "SafetyNotice_dispute_id_subject_id_key" ON public."SafetyNotice"("dispute_id","subject_id");
CREATE INDEX "SafetyNotice_subject_id_status_createdAt_idx" ON public."SafetyNotice"("subject_id","status","createdAt" DESC);
CREATE INDEX "SafetyNotice_issued_by_idx" ON public."SafetyNotice"("issued_by");
CREATE TABLE public."SafetyAppeal" (
  "id" TEXT PRIMARY KEY,
  "notice_id" TEXT NOT NULL REFERENCES public."SafetyNotice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "appellant_id" TEXT NOT NULL REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "statement" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decided_by" TEXT REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "decision_reason" TEXT,
  "decided_at" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "SafetyAppeal_statement_check" CHECK (length(btrim(statement)) BETWEEN 30 AND 4000),
  CONSTRAINT "SafetyAppeal_status_check" CHECK ((status='pending' AND decided_by IS NULL AND decision_reason IS NULL AND decided_at IS NULL) OR (status IN ('upheld','removed') AND decided_by IS NOT NULL AND decision_reason IS NOT NULL AND length(btrim(decision_reason)) BETWEEN 30 AND 2000 AND decided_at IS NOT NULL)),
  CONSTRAINT "SafetyAppeal_not_self_check" CHECK (appellant_id IS DISTINCT FROM decided_by)
);
CREATE UNIQUE INDEX "SafetyAppeal_notice_id_key" ON public."SafetyAppeal"("notice_id");
CREATE INDEX "SafetyAppeal_status_createdAt_idx" ON public."SafetyAppeal"("status","createdAt");
CREATE INDEX "SafetyAppeal_appellant_id_createdAt_idx" ON public."SafetyAppeal"("appellant_id","createdAt" DESC);
CREATE INDEX "SafetyAppeal_decided_by_idx" ON public."SafetyAppeal"("decided_by");
ALTER TABLE public."SafetyNotice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SafetyAppeal" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."SafetyNotice", public."SafetyAppeal" FROM PUBLIC, anon, authenticated;

-- The configured staff allowlist is checked server-side. Database constraints also
-- reject unrelated subjects, self-review and rewriting the initial evidence.
CREATE FUNCTION public.rentral_guard_safety_notice() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE report record;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Safety review history cannot be deleted' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.id,NEW.subject_id,NEW.dispute_id,NEW.issued_by,NEW.category,NEW.private_reason,NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD.subject_id,OLD.dispute_id,OLD.issued_by,OLD.category,OLD.private_reason,OLD."createdAt") OR OLD.status<>'active' OR NEW.status<>'removed' THEN
      RAISE EXCEPTION 'Safety finding evidence is immutable' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public."SafetyAppeal" a WHERE a.notice_id=NEW.id AND a.status='removed') THEN
      RAISE EXCEPTION 'Notice removal requires an appeal decision' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT d.opened_by,b.seeker_id,b.lister_id INTO report FROM public."Dispute" d JOIN public."Booking" b ON b.id=d.booking_id WHERE d.id=NEW.dispute_id;
  IF report IS NULL OR NOT ((report.opened_by=report.seeker_id AND NEW.subject_id=report.lister_id) OR (report.opened_by=report.lister_id AND NEW.subject_id=report.seeker_id)) OR NEW.issued_by IN (report.seeker_id,report.lister_id) OR NEW.status<>'active' THEN
    RAISE EXCEPTION 'A safety notice requires an independent report review' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rentral_guard_safety_notice() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER "SafetyNotice_integrity" BEFORE INSERT OR UPDATE OR DELETE ON public."SafetyNotice" FOR EACH ROW EXECUTE FUNCTION public.rentral_guard_safety_notice();

CREATE FUNCTION public.rentral_guard_safety_appeal() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE finding record;
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Safety appeal history cannot be deleted' USING ERRCODE='23514'; END IF;
  SELECT n.subject_id,n.status,n.issued_by,b.seeker_id,b.lister_id INTO finding FROM public."SafetyNotice" n JOIN public."Dispute" d ON d.id=n.dispute_id JOIN public."Booking" b ON b.id=d.booking_id WHERE n.id=NEW.notice_id;
  IF finding IS NULL OR NEW.appellant_id<>finding.subject_id OR finding.status<>'active' THEN RAISE EXCEPTION 'Only an affected account can appeal an active notice' USING ERRCODE='23514'; END IF;
  IF TG_OP='INSERT' AND NEW.status<>'pending' THEN RAISE EXCEPTION 'Appeals must start pending' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.id,NEW.notice_id,NEW.appellant_id,NEW.statement,NEW."createdAt") IS DISTINCT FROM ROW(OLD.id,OLD.notice_id,OLD.appellant_id,OLD.statement,OLD."createdAt") OR OLD.status<>'pending' OR NEW.status NOT IN ('upheld','removed') OR NEW.decided_by IN (finding.issued_by,finding.seeker_id,finding.lister_id) THEN
      RAISE EXCEPTION 'An independent decision is required; appeal history is immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rentral_guard_safety_appeal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER "SafetyAppeal_integrity" BEFORE INSERT OR UPDATE OR DELETE ON public."SafetyAppeal" FOR EACH ROW EXECUTE FUNCTION public.rentral_guard_safety_appeal();
COMMIT;
