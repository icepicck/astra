-- ═══════════════════════════════════════════
-- ASTRA — TEST DATA FOR SUPABASE
-- Run this in Supabase SQL Editor AFTER supabase_setup.sql
-- 20 Houston electrician tickets, 2 techs, 10 addresses, materials
-- ═══════════════════════════════════════════

-- ───────────────────────────────────────────
-- TECHS
-- ───────────────────────────────────────────
INSERT INTO techs (id, name, phone, license, active) VALUES
  ('b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres', '832-555-0147', 'TECL-28491', true),
  ('b1a2c3d4-0001-4000-a000-000000000002', 'Jesse Garza', '281-555-0233', 'TECL-31205', true);

-- ───────────────────────────────────────────
-- ADDRESSES
-- ───────────────────────────────────────────
INSERT INTO addresses (id, address, city, builder, subdivision, notes, lat, lng) VALUES
  ('a0a0a0a0-0001-4000-b000-000000000001', '1247 Maple Ridge Dr', 'Katy', '', 'Maple Ridge Estates',
   'Gate code 4421. Dog in backyard (friendly). Panel: 200A Square D Homeline, Main Breaker, Plug-on, Garage — left wall. Panel recently upgraded by us.',
   29.7858, -95.7575),

  ('a0a0a0a0-0001-4000-b000-000000000002', '892 Cottonwood Ln', 'Cypress', '', 'Cottonwood Creek',
   'Irrigation lines on west side of yard. Call before trenching. Panel: 200A Eaton BR, Main Breaker, BR Series, Exterior — south side. Service: Overhead.',
   29.9691, -95.6970),

  ('a0a0a0a0-0001-4000-b000-000000000003', '3401 Birch Hollow Ct', 'Sugar Land', 'Perry Homes', 'Birch Hollow',
   '2019 build. Good access. Homeowner is an engineer, asks a lot of questions. Panel: 200A Siemens QP, Main Breaker, Garage — back wall.',
   29.5936, -95.6197),

  ('a0a0a0a0-0001-4000-b000-000000000004', '710 Sycamore Blvd, Unit B', 'Houston', 'Greystar Development', '',
   'Multi-family new construction. GC is Greystar. Super is Danny — call him not the office. Panel: 125A Eaton CH, Main Lug, Utility closet — hallway.',
   29.7604, -95.3698),

  ('a0a0a0a0-0001-4000-b000-000000000005', '2200 Elm Creek Pkwy', 'Pearland', '', 'Elm Creek',
   '1978 build. Zinsco panel — known fire hazard. Full rip and replace scheduled. May need POCO for meter reseat. Panel: 100A Zinsco (obsolete), Main Breaker, Interior — master closet. Service: Overhead.',
   29.5636, -95.2860),

  ('a0a0a0a0-0001-4000-b000-000000000006', '445 Pecan Grove Way', 'Richmond', 'Lennar', 'Pecan Grove',
   '2021 Lennar build. Decent wiring. Outdoor receptacles are all weather-rated but the in-use covers are builder grade junk. Panel: 200A Square D QO, Main Breaker, Garage — right wall.',
   29.5805, -95.7560),

  ('a0a0a0a0-0001-4000-b000-000000000007', '1580 Magnolia Ranch Rd', 'Tomball', 'Castlerock Homes', 'Magnolia Ranch',
   'New construction. Slab on grade. Working with Castlerock — they''re good to work with. Plans revision C is current. Panel: 200A Square D Homeline, Plug-on, Garage — left wall (planned).',
   30.0972, -95.6161),

  ('a0a0a0a0-0001-4000-b000-000000000008', '330 Juniper Springs Dr', 'Spring', 'Ashton Woods', 'Juniper Springs',
   'Spec home. Ashton Woods standard package. All LED throughout. Panel: 200A Eaton BR, Main Breaker, Garage — back wall.',
   30.0799, -95.4172),

  ('a0a0a0a0-0001-4000-b000-000000000009', '5612 Westheimer Rd', 'Houston', '', 'Galleria Area',
   'Strip mall tenant finish-out. Suite 104 — new nail salon. Landlord is MidTown Properties, contact Brenda. Existing 400A main, pulling from sub-panel #3.',
   29.7388, -95.4610),

  ('a0a0a0a0-0001-4000-b000-000000000010', '18922 Timber Forest Dr', 'Humble', 'David Weekley', 'Atascocita Shores',
   '2023 David Weekley build. Smart home pre-wire done. Panel: 200A Square D Homeline, Garage — left wall. Attic access is tight on the east side.',
   29.9546, -95.1726);

-- ───────────────────────────────────────────
-- JOBS (20 tickets)
-- ───────────────────────────────────────────
INSERT INTO jobs (id, address, address_id, types, status, notes, tech_notes, date, archived, tech_id, tech_name, created_at, updated_at) VALUES

  -- Job 1: Panel Upgrade — COMPLETE / ARCHIVED
  ('c0c0c0c0-0001-4000-c000-000000000001',
   '1247 Maple Ridge Dr',
   'a0a0a0a0-0001-4000-b000-000000000001',
   ARRAY['Panel Upgrade'], 'Complete',
   '200A panel upgrade. Old Federal Pacific swapped for Square D Homeline. Permit #2026-0412. Inspector passed first try. Drywall patch needed on south wall.',
   '', '2026-03-15', true,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-10T08:00:00Z', '2026-03-15T16:30:00Z'),

  -- Job 2: EV Charger + Trenching — IN PROGRESS
  ('c0c0c0c0-0001-4000-c000-000000000002',
   '892 Cottonwood Ln',
   'a0a0a0a0-0001-4000-b000-000000000002',
   ARRAY['EV Charger', 'Trenching'], 'In Progress',
   'Tesla Wall Connector Gen 3. 60A circuit from panel. 40ft trench from panel to detached garage. Customer wants conduit buried 18in. Call before digging — irrigation lines on west side.',
   '', '2026-03-22', false,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-18T07:15:00Z', '2026-03-22T09:00:00Z'),

  -- Job 3: Service Call — COMPLETE / ARCHIVED
  ('c0c0c0c0-0001-4000-c000-000000000003',
   '3401 Birch Hollow Ct',
   'a0a0a0a0-0001-4000-b000-000000000003',
   ARRAY['Service Call'], 'Complete',
   'Intermittent tripping on kitchen 20A. Found loose neutral at panel bus. Torqued to spec and tested under load. Ran for 30 min with microwave + dishwasher no trip.',
   '', '2026-03-14', true,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-14T06:45:00Z', '2026-03-14T11:00:00Z'),

  -- Job 4: Rough-In + Fixture Install — NEEDS CALLBACK
  ('c0c0c0c0-0001-4000-c000-000000000004',
   '710 Sycamore Blvd, Unit B',
   'a0a0a0a0-0001-4000-b000-000000000004',
   ARRAY['Rough-In', 'Fixture Install'], 'Needs Callback',
   'Rough-in complete for 3BR/2BA unit. 22 circuits. Waiting on GC for fixture selections — they keep changing the kitchen island layout. Callback scheduled for Thursday.',
   '', '2026-03-20', false,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-16T07:00:00Z', '2026-03-20T14:00:00Z'),

  -- Job 5: Panel Upgrade + EV Charger — NOT STARTED
  ('c0c0c0c0-0001-4000-c000-000000000005',
   '2200 Elm Creek Pkwy',
   'a0a0a0a0-0001-4000-b000-000000000005',
   ARRAY['Panel Upgrade', 'EV Charger'], 'Not Started',
   'Customer wants 200A upgrade from 100A AND a Tesla charger. Need to pull permit first. Existing panel is Zinsco — full rip and replace. Meter socket looks rough, may need POCO coordination.',
   '', '2026-03-25', false,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-21T10:00:00Z', '2026-03-21T10:00:00Z'),

  -- Job 6: Service Call — WAITING ON MATERIALS
  ('c0c0c0c0-0001-4000-c000-000000000006',
   '445 Pecan Grove Way',
   'a0a0a0a0-0001-4000-b000-000000000006',
   ARRAY['Service Call'], 'Waiting on Materials',
   'GFCI keeps tripping on outdoor receptacle. Found water intrusion in the in-use cover — cracked. Ordered Intermatic WP5220 from supply house. Should be in Monday.',
   '', '2026-03-19', false,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-19T08:30:00Z', '2026-03-19T15:00:00Z'),

  -- Job 7: Service Call — NOT STARTED (callback from job 1)
  ('c0c0c0c0-0001-4000-c000-000000000007',
   '1247 Maple Ridge Dr',
   'a0a0a0a0-0001-4000-b000-000000000001',
   ARRAY['Service Call'], 'Not Started',
   'Callback from panel upgrade job. Customer says one bedroom circuit feels warm at the outlet. Probably a backstab connection in the old wiring. Need to check.',
   '', '2026-03-26', false,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-22T11:00:00Z', '2026-03-22T11:00:00Z'),

  -- Job 8: EV Charger — NOT STARTED
  ('c0c0c0c0-0001-4000-c000-000000000008',
   '3401 Birch Hollow Ct',
   'a0a0a0a0-0001-4000-b000-000000000003',
   ARRAY['EV Charger'], 'Not Started',
   'Same customer from the kitchen breaker fix. Wants a ChargePoint Home Flex now. Panel has space. 50A circuit, about 25ft run to garage. Easy job.',
   '', '2026-03-28', false,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-22T13:00:00Z', '2026-03-22T13:00:00Z'),

  -- Job 9: Rough-In — IN PROGRESS
  ('c0c0c0c0-0001-4000-c000-000000000009',
   '1580 Magnolia Ranch Rd',
   'a0a0a0a0-0001-4000-b000-000000000007',
   ARRAY['Rough-In'], 'In Progress',
   'New construction 4BR/3BA. 32 circuits. Working with Castlerock Homes. Slab is poured, framing complete. Running all home runs today and tomorrow. Low voltage rough-in scheduled for Wednesday.',
   '', '2026-03-21', false,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-17T06:30:00Z', '2026-03-21T17:00:00Z'),

  -- Job 10: Fixture Install — COMPLETE / ARCHIVED
  ('c0c0c0c0-0001-4000-c000-000000000010',
   '330 Juniper Springs Dr',
   'a0a0a0a0-0001-4000-b000-000000000008',
   ARRAY['Fixture Install'], 'Complete',
   'Trim out on spec home. 14 recessed lights, 3 ceiling fans, 2 bath fans, kitchen pendant over island. All LED retrofit cans. Done in 5 hours.',
   '', '2026-03-13', true,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-13T07:00:00Z', '2026-03-13T14:00:00Z'),

  -- Job 11: Commercial tenant finish-out — IN PROGRESS
  ('c0c0c0c0-0001-4000-c000-000000000011',
   '5612 Westheimer Rd',
   'a0a0a0a0-0001-4000-b000-000000000009',
   ARRAY['Rough-In', 'Panel Upgrade'], 'In Progress',
   'Nail salon tenant finish-out. 100A sub-panel off main 400A. 12 circuits — heavy on 20A for dryer stations. All EMT per code for commercial. Inspector wants to see before drywall.',
   'Watch the drop ceiling grid — it''s already hung. Route conduit above the grid ties.', '2026-03-24', false,
   'b1a2c3d4-0001-4000-a000-000000000002', 'Jesse Garza',
   '2026-03-20T07:00:00Z', '2026-03-24T16:00:00Z'),

  -- Job 12: Whole-house rewire — NOT STARTED
  ('c0c0c0c0-0001-4000-c000-000000000012',
   '2200 Elm Creek Pkwy',
   'a0a0a0a0-0001-4000-b000-000000000005',
   ARRAY['Rewire'], 'Not Started',
   'Full rewire after panel upgrade (Job 5). 1978 aluminum branch circuits — all need to go. Homeowner approved full copper replacement. Permit pending. This is a 3-day job minimum.',
   '', '2026-04-01', false,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-22T14:00:00Z', '2026-03-22T14:00:00Z'),

  -- Job 13: Generator install — NOT STARTED
  ('c0c0c0c0-0001-4000-c000-000000000013',
   '18922 Timber Forest Dr',
   'a0a0a0a0-0001-4000-b000-000000000010',
   ARRAY['Generator'], 'Not Started',
   'Generac 24kW whole-house. 200A ATS. Gas line by plumber already stubbed out. Concrete pad poured. Need to mount unit, wire ATS, and program. Permit pulled.',
   '', '2026-03-29', false,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-23T09:00:00Z', '2026-03-23T09:00:00Z'),

  -- Job 14: Pool equipment — IN PROGRESS
  ('c0c0c0c0-0001-4000-c000-000000000014',
   '18922 Timber Forest Dr',
   'a0a0a0a0-0001-4000-b000-000000000010',
   ARRAY['Service Call'], 'In Progress',
   'Pool pump motor tripping breaker after 10min. Checked amp draw — pulling 18A on a 20A circuit. Motor is oversized for the breaker. Need to upsize to 30A with #10 THHN. Also bonding lug on pool rail is corroded.',
   'Bonding wire at the deck box is green but looks original — test continuity before reusing.', '2026-03-24', false,
   'b1a2c3d4-0001-4000-a000-000000000002', 'Jesse Garza',
   '2026-03-24T07:30:00Z', '2026-03-24T12:00:00Z'),

  -- Job 15: Outdoor lighting — COMPLETE
  ('c0c0c0c0-0001-4000-c000-000000000015',
   '445 Pecan Grove Way',
   'a0a0a0a0-0001-4000-b000-000000000006',
   ARRAY['Fixture Install'], 'Complete',
   'Low voltage landscape lighting — 12 path lights + 4 uplights on oaks. Transformer on timer at garage. Ran 12/2 UF direct burial from transformer to junction boxes. Customer happy.',
   '', '2026-03-17', true,
   'b1a2c3d4-0001-4000-a000-000000000002', 'Jesse Garza',
   '2026-03-15T07:00:00Z', '2026-03-17T15:00:00Z'),

  -- Job 16: Smoke/CO detector upgrade — COMPLETE
  ('c0c0c0c0-0001-4000-c000-000000000016',
   '892 Cottonwood Ln',
   'a0a0a0a0-0001-4000-b000-000000000002',
   ARRAY['Service Call'], 'Complete',
   'Replaced all 8 smoke/CO detectors with Kidde i12010SCO. Hardwired with battery backup. All interconnected and tested. Customer had expired units — some from 2011.',
   '', '2026-03-16', true,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-16T08:00:00Z', '2026-03-16T12:00:00Z'),

  -- Job 17: Ceiling fan installs — NEEDS CALLBACK
  ('c0c0c0c0-0001-4000-c000-000000000017',
   '1580 Magnolia Ranch Rd',
   'a0a0a0a0-0001-4000-b000-000000000007',
   ARRAY['Fixture Install'], 'Needs Callback',
   'Hung 4 of 5 ceiling fans — master bedroom fan box is old work and wobbles. Need to swap for a Castlerock-approved fan-rated box. Ordered Arlington FBX900. GC says hold on 5th fan until texture is done.',
   'Fan box in master is plastic — replace with steel Arlington.', '2026-03-23', false,
   'b1a2c3d4-0001-4000-a000-000000000002', 'Jesse Garza',
   '2026-03-22T07:00:00Z', '2026-03-23T10:00:00Z'),

  -- Job 18: Spa/hot tub hookup — NOT STARTED
  ('c0c0c0c0-0001-4000-c000-000000000018',
   '3401 Birch Hollow Ct',
   'a0a0a0a0-0001-4000-b000-000000000003',
   ARRAY['Service Call'], 'Not Started',
   'Customer bought a Jacuzzi J-335. Needs 50A 240V GFCI disconnect within line of sight. Panel has space. Run is about 35ft. Customer wants conduit, not direct burial. Permit needed.',
   '', '2026-04-02', false,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-24T10:00:00Z', '2026-03-24T10:00:00Z'),

  -- Job 19: Transfer switch — WAITING ON MATERIALS
  ('c0c0c0c0-0001-4000-c000-000000000019',
   '1247 Maple Ridge Dr',
   'a0a0a0a0-0001-4000-b000-000000000001',
   ARRAY['Generator'], 'Waiting on Materials',
   'Customer wants manual transfer switch for portable generator. Reliance PB30 kit ordered. 6 circuits selected: fridge, master BR, garage, sump pump, internet, kitchen counter. Supply house says Thursday.',
   '', '2026-03-27', false,
   'b1a2c3d4-0001-4000-a000-000000000001', 'Mike Torres',
   '2026-03-23T14:00:00Z', '2026-03-23T14:00:00Z'),

  -- Job 20: Troubleshoot flickering — COMPLETE
  ('c0c0c0c0-0001-4000-c000-000000000020',
   '330 Juniper Springs Dr',
   'a0a0a0a0-0001-4000-b000-000000000008',
   ARRAY['Service Call'], 'Complete',
   'Flickering lights in living room and kitchen. Traced to a loose connection at the neutral bus bar — 3 neutrals under one screw. Separated and torqued each. Tested with hair dryer load, solid now.',
   '', '2026-03-22', false,
   'b1a2c3d4-0001-4000-a000-000000000002', 'Jesse Garza',
   '2026-03-22T08:00:00Z', '2026-03-22T11:30:00Z');

-- ───────────────────────────────────────────
-- MATERIALS (samples across several jobs)
-- ───────────────────────────────────────────
INSERT INTO materials (job_id, item_id, name, qty, unit, variant, part_ref) VALUES

  -- Job 1: Panel upgrade
  ('c0c0c0c0-0001-4000-c000-000000000001', 'SQD-HOM4080M200', 'Square D Homeline 200A Panel', 1, 'EA', '40-space 80-circuit', 'HOM4080M200PQCVP'),
  ('c0c0c0c0-0001-4000-c000-000000000001', 'SQD-HOM120', 'Square D 20A 1-Pole Breaker', 15, 'EA', 'Plug-on', 'HOM120CP'),
  ('c0c0c0c0-0001-4000-c000-000000000001', 'SQD-HOM230', 'Square D 30A 2-Pole Breaker', 2, 'EA', 'Plug-on', 'HOM230CP'),
  ('c0c0c0c0-0001-4000-c000-000000000001', 'WIRE-4CU', '#4 Copper THHN', 25, 'FT', 'Black', ''),
  ('c0c0c0c0-0001-4000-c000-000000000001', 'GND-6CU', '#6 Bare Copper Ground', 10, 'FT', '', ''),

  -- Job 2: EV charger
  ('c0c0c0c0-0001-4000-c000-000000000002', 'TESLA-WC3', 'Tesla Wall Connector Gen 3', 1, 'EA', '48A / 240V', '1457768-01-F'),
  ('c0c0c0c0-0001-4000-c000-000000000002', 'SQD-HOM260', 'Square D 60A 2-Pole Breaker', 1, 'EA', 'Plug-on', 'HOM260CP'),
  ('c0c0c0c0-0001-4000-c000-000000000002', 'WIRE-6CU', '#6 Copper THHN', 120, 'FT', 'Black/Red/White/Green', ''),
  ('c0c0c0c0-0001-4000-c000-000000000002', 'COND-1EMT', '1" EMT Conduit', 8, 'EA', '10ft sticks', ''),
  ('c0c0c0c0-0001-4000-c000-000000000002', 'PVC-1SCH40', '1" PVC Schedule 40', 45, 'FT', 'For trench', ''),

  -- Job 5: Zinsco replacement + EV
  ('c0c0c0c0-0001-4000-c000-000000000005', 'SQD-HOM4080M200', 'Square D Homeline 200A Panel', 1, 'EA', '40-space 80-circuit', 'HOM4080M200PQCVP'),
  ('c0c0c0c0-0001-4000-c000-000000000005', 'METER-200', '200A Meter Socket', 1, 'EA', 'Milbank', 'U5168-XL-200'),
  ('c0c0c0c0-0001-4000-c000-000000000005', 'WIRE-2/0AL', '2/0 Aluminum SER Cable', 30, 'FT', 'Service entrance', ''),

  -- Job 6: GFCI cover
  ('c0c0c0c0-0001-4000-c000-000000000006', 'INT-WP5220', 'Intermatic WP5220 In-Use Cover', 1, 'EA', 'Weatherproof 2-Gang', 'WP5220C'),
  ('c0c0c0c0-0001-4000-c000-000000000006', 'LEV-GFNT2', 'Leviton 20A GFCI Receptacle', 1, 'EA', 'Weather-Resistant', 'GFNT2-W'),

  -- Job 9: Rough-in (new construction)
  ('c0c0c0c0-0001-4000-c000-000000000009', 'WIRE-14/2', '14/2 NM-B Romex', 1000, 'FT', '', ''),
  ('c0c0c0c0-0001-4000-c000-000000000009', 'WIRE-12/2', '12/2 NM-B Romex', 500, 'FT', '', ''),
  ('c0c0c0c0-0001-4000-c000-000000000009', 'WIRE-10/3', '10/3 NM-B Romex', 75, 'FT', 'Range/dryer', ''),
  ('c0c0c0c0-0001-4000-c000-000000000009', 'BOX-1G', '1-Gang New Work Box', 38, 'EA', 'Nail-on', ''),
  ('c0c0c0c0-0001-4000-c000-000000000009', 'BOX-4O', '4" Octagon Box', 18, 'EA', 'Nail-on', ''),

  -- Job 13: Generator
  ('c0c0c0c0-0001-4000-c000-000000000013', 'GEN-24KW', 'Generac Guardian 24kW', 1, 'EA', 'Wi-Fi enabled', '7210'),
  ('c0c0c0c0-0001-4000-c000-000000000013', 'GEN-ATS200', 'Generac 200A ATS', 1, 'EA', 'Whole-house', 'RXSW200A3'),
  ('c0c0c0c0-0001-4000-c000-000000000013', 'WIRE-2CU', '#2 Copper THHN', 40, 'FT', 'For ATS to panel', ''),

  -- Job 16: Smoke detectors
  ('c0c0c0c0-0001-4000-c000-000000000016', 'KID-I12010', 'Kidde i12010SCO Smoke/CO Combo', 8, 'EA', 'Hardwired + Battery', 'i12010SCO'),

  -- Job 19: Transfer switch
  ('c0c0c0c0-0001-4000-c000-000000000019', 'REL-PB30', 'Reliance PB30 Transfer Switch Kit', 1, 'EA', '30A / 6-circuit', 'PB30');

-- ═══════════════════════════════════════════
-- VERIFY COUNTS
-- ═══════════════════════════════════════════
SELECT 'techs' AS tbl, count(*) FROM techs
UNION ALL SELECT 'addresses', count(*) FROM addresses
UNION ALL SELECT 'jobs', count(*) FROM jobs
UNION ALL SELECT 'materials', count(*) FROM materials;
