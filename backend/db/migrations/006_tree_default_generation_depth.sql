-- Owner-configurable "generations to show" for Focused mode - applied as
-- both ancestry_depth and progeny_depth (see setAncestryDepth/
-- setProgenyDepth in frontend/main.js's renderChart()). NULL means
-- unlimited (no cap applied at all, simply skipping those setters).
ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS default_generation_depth INTEGER;
