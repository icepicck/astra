-- ═══════════════════════════════════════════
-- ASTRA — SUPABASE SCHEMA SETUP
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ═══════════════════════════════════════════

-- 1. ADDRESSES
CREATE TABLE IF NOT EXISTS addresses (
  id uuid PRIMARY KEY,
  address text NOT NULL DEFAULT '',
  street text DEFAULT '',
  suite text DEFAULT '',
  city text DEFAULT '',
  state text DEFAULT 'TX',
  zip text DEFAULT '',
  builder text DEFAULT '',
  subdivision text DEFAULT '',
  panel_type text DEFAULT '',
  amp_rating text DEFAULT '',
  breaker_type text DEFAULT '',
  service_type text DEFAULT '',
  panel_location text DEFAULT '',
  notes text DEFAULT '',
  lat double precision,
  lng double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. TECHS
CREATE TABLE IF NOT EXISTS techs (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  phone text DEFAULT '',
  license text DEFAULT '',
  active boolean DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. JOBS
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY,
  address text DEFAULT '',
  address_id uuid REFERENCES addresses(id),
  types text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'Not Started',
  notes text DEFAULT '',
  tech_notes text DEFAULT '',
  date date,
  archived boolean DEFAULT false,
  tech_id uuid REFERENCES techs(id),
  tech_name text DEFAULT '',
  photo_meta jsonb DEFAULT '[]',
  drawing_meta jsonb DEFAULT '[]',
  video_meta jsonb DEFAULT '[]',
  manually_added_to_vector boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. MATERIALS (linked to jobs)
CREATE TABLE IF NOT EXISTS materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  item_id text DEFAULT '',
  name text NOT NULL DEFAULT '',
  qty numeric DEFAULT 1,
  unit text DEFAULT 'EA',
  variant text,
  part_ref text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════
-- AUTO-UPDATE updated_at ON EVERY WRITE
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER addresses_updated_at BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER techs_updated_at BEFORE UPDATE ON techs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER materials_updated_at BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════
-- ROW LEVEL SECURITY — OPEN FOR NOW (SOLO USER)
-- ═══════════════════════════════════════════
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE techs ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON addresses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON techs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON materials FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════
-- ENABLE REALTIME (for live sync across devices)
-- ═══════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE addresses;
ALTER PUBLICATION supabase_realtime ADD TABLE techs;
ALTER PUBLICATION supabase_realtime ADD TABLE materials;
