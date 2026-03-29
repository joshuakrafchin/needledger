-- Migration: Add status and references_id to fulfillments
-- Run this in Supabase SQL Editor on existing databases

ALTER TABLE fulfillments
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offering'
    CHECK (status IN ('offering', 'in_progress', 'completed', 'withdrawn'));

ALTER TABLE fulfillments
  ADD COLUMN IF NOT EXISTS references_id UUID REFERENCES fulfillments(id);
