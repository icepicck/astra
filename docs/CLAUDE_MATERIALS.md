# CLAUDE_MATERIALS — Profile 1–2 Cheat Sheet
*Load for: catalog additions, material picker bugs, bulk template changes, variant updates.*
*Token budget: ~500–2,000. Load with astra-materials.js source (or relevant snippet for Profile 1).*
*FLYWHEEL TRIPWIRE: If the task modifies materials[] structure on jobs, dedup logic, or cost intelligence inputs — escalate to Profile 2. See ASTRA_CONTEXT_STRATEGY.md.*

---

## MATERIALS CATALOG MODULE RULES

**Catalog structure:**
- 222 total items: rough-in (95 items) + trim-out (127 items)
- Source files: rough_materials.json, trim_materials.json
- Each item: code, name, category, unit, estimatedCost, variants (optional)
- Variant support: toggle/decora, breaker brands (Eaton/Square D/Siemens), part refs
- Categories: Wire, Boxes, Devices, Connectors, Conduit, Fittings, Panels, Breakers, etc.

**Key Patterns Already Implemented (DO NOT REINVENT):**
- autoLoadBuiltInLibraries() → fetches JSON catalogs, merges into IDB config
- loadMaterialLibrary() → merges rough + trim from _configCache
- Material picker: searchable overlay, category-filtered, variant selection
- Frequent flyers: auto-surfaces top 10 most-used materials per job
- Bulk templates: pre-built material lists for common job types
- "Previously at this address": surfaces materials from prior jobs at same address

**DO NOT:**
- Duplicate material codes across rough and trim catalogs.
- Remove variant support (electricians need brand-specific part selection).
- Change the materialId UUID pattern (sync depends on it for upsert).
- Modify material structure without updating jobToCloud/jobFromCloud mappers in sync.

**Verification:**
- New material appears in picker search.
- Material has correct code, name, category, and unit.
- Catalog loads correctly offline (from IDB, not network).
- Adding material to job triggers _markDirty() for auto-sync.
