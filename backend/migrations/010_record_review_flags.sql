-- Whole-history review flags beyond medicines (MVP document 8.6).
--
-- New flag types:
--   inconsistent_detail  patient details, dates or units that disagree between records
--   needs_verification   a documented value the source itself marks as outside its range
--                        or abnormal; reported as written, never interpreted
--   unverified_finding   suspected / possible / unclear findings, and findings changed
--                        from the document's wording that no doctor has verified
--
-- reason:   why the flag needs attention (shown under the message)
-- evidence: page-level sources for flags that come from page text rather than a
--           finding, e.g. [{ "documentId", "page", "quoteStart", "quoteEnd", "quote", "label" }]

ALTER TABLE record_flags DROP CONSTRAINT record_flags_type_check;
ALTER TABLE record_flags
  ADD CONSTRAINT record_flags_type_check CHECK (type IN (
    'contradiction', 'duplicate', 'missing_field', 'ambiguous_date',
    'orphan_reference', 'stale_medication', 'active_after_stop',
    'inconsistent_detail', 'needs_verification', 'unverified_finding'
  ));

ALTER TABLE record_flags
  ADD COLUMN reason text,
  ADD COLUMN evidence jsonb NOT NULL DEFAULT '[]'::jsonb;
