-- Pricing signals from the first cohort: what they already pay for AI coding
-- (the anchor) and how many Issues they would hand over weekly (the volume).
-- Together with the delivery cost the Runner records, these set the price.
ALTER TABLE applications ADD COLUMN ai_spend TEXT;
ALTER TABLE applications ADD COLUMN issue_volume TEXT;
