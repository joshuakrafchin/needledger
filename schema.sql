CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE needs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) <= 500),
  description TEXT CHECK (char_length(description) <= 10000),
  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_by TEXT,
  anonymity_level TEXT DEFAULT 'public',
  source TEXT,
  fulfillments_wanted TEXT DEFAULT 'unlimited',
  flagged BOOLEAN DEFAULT false,
  review_status TEXT DEFAULT 'ok',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE fulfillments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id UUID NOT NULL REFERENCES needs(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) <= 500),
  description TEXT CHECK (char_length(description) <= 10000),
  metadata JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  created_by TEXT,
  anonymity_level TEXT DEFAULT 'public',
  source TEXT,
  flagged BOOLEAN DEFAULT false,
  review_status TEXT DEFAULT 'ok',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_needs_tags ON needs USING GIN(tags);
CREATE INDEX idx_needs_metadata ON needs USING GIN(metadata);
CREATE INDEX idx_needs_flagged ON needs(flagged);
CREATE INDEX idx_needs_created_at ON needs(created_at DESC);
CREATE INDEX idx_fulfillments_need ON fulfillments(need_id);
CREATE INDEX idx_fulfillments_flagged ON fulfillments(flagged);
