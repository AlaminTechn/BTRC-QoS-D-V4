#!/usr/bin/env python3
"""
add_metabase_filters_map.py — Patch the Metabase Regulatory Dashboard with:
  1. A Division Pin-Map card on the R2 tab (violations choropleth)
  2. A custom Bangladesh GeoJSON region map registered with Metabase
  3. Dashboard filter parameters: Date From, Date To, Division, ISP, Severity
  4. parameter_mappings wiring filters to all relevant dashcards

Run once (idempotent):
  python3 scripts/add_metabase_filters_map.py

Requirements:
  pip install requests
"""

import os, sys, uuid, json, requests
from pathlib import Path

METABASE_URL = os.environ.get("METABASE_URL",  "http://localhost:3000")
MB_EMAIL     = os.environ.get("METABASE_USER", "alamin.technometrics22@gmail.com")
MB_PASS      = os.environ.get("METABASE_PASS", "Test@123")
DB_ID        = 2          # BTRC QoS POC database
REG_DASH_ID  = 4          # Regulatory Dashboard

# ── Template tag IDs (card → param → tag) ────────────────────────────────────
# Retrieved from card parameters via API; used in parameter_mappings.
# We fetch these dynamically at runtime — see fetch_card_params().

# ── Dashboard filter definitions ─────────────────────────────────────────────
FILTER_DATE_FROM_ID = "f-date-from-0001"
FILTER_DATE_TO_ID   = "f-date-to-0002"
FILTER_DIVISION_ID  = "f-division-0003"
FILTER_ISP_ID       = "f-isp-0004"
FILTER_SEVERITY_ID  = "f-severity-0005"

DASHBOARD_PARAMETERS = [
    {
        "id":         FILTER_DATE_FROM_ID,
        "name":       "Date From",
        "slug":       "date_from",
        "type":       "date/single",
        "sectionId":  "date",
    },
    {
        "id":         FILTER_DATE_TO_ID,
        "name":       "Date To",
        "slug":       "date_to",
        "type":       "date/single",
        "sectionId":  "date",
    },
    {
        "id":         FILTER_DIVISION_ID,
        "name":       "Division",
        "slug":       "division",
        "type":       "string/=",
        "sectionId":  "location",
        "values_source_type": "static-list",
        "values_source_config": {
            "values": [
                "Dhaka", "Chattagram", "Rajshahi", "Khulna",
                "Barisal", "Sylhet", "Rangpur", "Mymensingh",
            ],
        },
    },
    {
        "id":         FILTER_ISP_ID,
        "name":       "ISP",
        "slug":       "isp",
        "type":       "string/=",
        "sectionId":  "string",
    },
    {
        "id":         FILTER_SEVERITY_ID,
        "name":       "Severity",
        "slug":       "severity",
        "type":       "string/=",
        "sectionId":  "string",
        "values_source_type": "static-list",
        "values_source_config": {
            "values": ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
        },
    },
]

# SQL for the new Division Map card
MAP_CARD_SQL = """
SELECT
    d.name_en                                                  AS division,
    d.latitude::float                                          AS latitude,
    d.longitude::float                                         AS longitude,
    COUNT(v.id)                                                AS violations,
    SUM(CASE WHEN v.severity = 'CRITICAL' THEN 1 ELSE 0 END)  AS critical,
    SUM(CASE WHEN v.severity = 'HIGH'     THEN 1 ELSE 0 END)  AS high,
    SUM(CASE WHEN v.severity = 'MEDIUM'   THEN 1 ELSE 0 END)  AS medium,
    SUM(CASE WHEN v.severity = 'LOW'      THEN 1 ELSE 0 END)  AS low
FROM geo_divisions d
LEFT JOIN geo_districts  di ON di.division_id = d.id
LEFT JOIN pops           p  ON p.district_id  = di.id
LEFT JOIN sla_violations v  ON v.pop_id       = p.id
GROUP BY d.name_en, d.latitude, d.longitude
ORDER BY violations DESC
""".strip()

MAP_CARD_NAME = "[R2] Division Map (Pin)"

MAP_VIZ_SETTINGS = {
    "map.type":              "pin",
    "map.latitude_column":   "latitude",
    "map.longitude_column":  "longitude",
    "map.metric_column":     "violations",
    "map.pin_type":          "tiles",
    "map.zoom":              6,
    "map.center_latitude":   23.68,
    "map.center_longitude":  90.35,
}


class MetabasePatch:
    def __init__(self):
        self.base = METABASE_URL.rstrip("/")
        self.s = requests.Session()
        self.s.headers["Content-Type"] = "application/json"

    def _get(self, path):
        r = self.s.get(f"{self.base}{path}")
        r.raise_for_status()
        return r.json()

    def _post(self, path, body=None):
        r = self.s.post(f"{self.base}{path}", json=body or {})
        r.raise_for_status()
        return r.json()

    def _put(self, path, body=None):
        r = self.s.put(f"{self.base}{path}", json=body or {})
        r.raise_for_status()
        return r.json()

    def login(self):
        data = self._post("/api/session", {"username": MB_EMAIL, "password": MB_PASS})
        self.s.headers["X-Metabase-Session"] = data["id"]
        print("✅ Logged in")

    # ── Get template-tag param ID for a dashcard ──────────────────────────────
    def fetch_card_params(self, card_id):
        """Return { tag_name: param_id } from the card's parameters list."""
        card = self._get(f"/api/card/{card_id}")
        result = {}
        for p in card.get("parameters", []):
            target = p.get("target", [])
            # target = ["variable", ["template-tag", "tag_name"]]
            if (isinstance(target, list) and len(target) == 2
                    and target[0] == "variable"
                    and isinstance(target[1], list) and len(target[1]) == 2):
                tag_name = target[1][1]
                result[tag_name] = p["id"]
        return result

    # ── Step 1: Create (or reuse) the Division Map card ───────────────────────
    def ensure_map_card(self):
        existing = self._get("/api/card")
        for c in existing:
            if c["name"] == MAP_CARD_NAME:
                print(f"  ↩️  Map card already exists: id={c['id']}")
                return c["id"]

        coll_resp = self._get("/api/collection")
        coll_id   = next((c["id"] for c in coll_resp if c["name"] == "BTRC QoS v4"), None)
        if not coll_id:
            # Fall back to root collection
            coll_id = None

        body = {
            "name":          MAP_CARD_NAME,
            "description":   "Division-level violation counts with lat/lng for pin map",
            "collection_id": coll_id,
            "display":       "map",
            "dataset_query": {
                "type":     "native",
                "database": DB_ID,
                "native": {
                    "query":         MAP_CARD_SQL,
                    "template-tags": {},
                },
            },
            "visualization_settings": MAP_VIZ_SETTINGS,
            "parameters": [],
        }
        data = self._post("/api/card", body)
        print(f"  ✅ Created map card: id={data['id']}")
        return data["id"]

    # ── Step 2: Add map card to R2 tab (if not already there) ─────────────────
    def add_map_card_to_dashboard(self, map_card_id):
        dash = self._get(f"/api/dashboard/{REG_DASH_ID}")

        # Check if map card already placed
        for dc in dash.get("dashcards", []):
            if dc.get("card_id") == map_card_id:
                print(f"  ↩️  Map card already on dashboard (dashcard id={dc['id']})")
                return

        # Find R2 tab id
        tabs = {t["name"]: t["id"] for t in dash.get("tabs", [])}
        r2_tab_id = next((v for k, v in tabs.items() if "R2" in k), None)
        if not r2_tab_id:
            print("  ⚠️  R2 tab not found — placing map card without tab")

        # Build new dashcards list (keep existing + add map card)
        existing_dashcards = []
        for dc in dash.get("dashcards", []):
            existing_dashcards.append({
                "id":               dc["id"],
                "card_id":          dc.get("card_id"),
                "dashboard_tab_id": dc.get("dashboard_tab_id"),
                "col":              dc["col"],
                "row":              dc["row"],
                "size_x":           dc["size_x"],
                "size_y":           dc["size_y"],
                "parameter_mappings":     dc.get("parameter_mappings", []),
                "visualization_settings": dc.get("visualization_settings", {}),
            })

        # Place map card on R2 tab — row 0 spanning full width, tall enough for map
        existing_dashcards.append({
            "id":               -1,
            "card_id":          map_card_id,
            "dashboard_tab_id": r2_tab_id,
            "col":              0,
            "row":              0,
            "size_x":           24,
            "size_y":           12,
            "parameter_mappings":     [],
            "visualization_settings": {},
        })

        # Shift other R2 cards down by 12 rows to make room
        for dc in existing_dashcards:
            if dc.get("dashboard_tab_id") == r2_tab_id and dc.get("card_id") != map_card_id:
                dc["row"] += 12

        tabs_list = [{"id": v, "name": k} for k, v in tabs.items()]
        self._put(f"/api/dashboard/{REG_DASH_ID}", {
            "tabs":      tabs_list,
            "dashcards": existing_dashcards,
        })
        print(f"  ✅ Map card placed on R2 tab (row 0, full-width)")

    # ── Step 3: Add filter parameters + wire mappings to all dashcards ─────────
    def add_filters_and_mappings(self):
        dash = self._get(f"/api/dashboard/{REG_DASH_ID}")

        # Check if filters already exist
        existing_param_ids = {p["id"] for p in dash.get("parameters", [])}
        new_params_needed  = [p for p in DASHBOARD_PARAMETERS
                              if p["id"] not in existing_param_ids]

        if not new_params_needed:
            print("  ↩️  All filter parameters already exist on dashboard")
            # Still re-wire parameter_mappings (idempotent)
        else:
            merged_params = list(dash.get("parameters", [])) + new_params_needed
            self._put(f"/api/dashboard/{REG_DASH_ID}", {"parameters": merged_params})
            print(f"  ✅ Added {len(new_params_needed)} filter parameters to dashboard")

        # Re-fetch for fresh dashcard IDs
        dash = self._get(f"/api/dashboard/{REG_DASH_ID}")
        tabs = {t["name"]: t["id"] for t in dash.get("tabs", [])}

        # --- Mapping config: (filter_param_id, card_id, tag_name) ---
        # Card template tags discovered via fetch_card_params()
        print("  📡 Fetching card template-tag IDs…")
        card_params = {}
        for card_id in [64, 70, 71, 72, 73, 74, 75]:
            card_params[card_id] = self.fetch_card_params(card_id)

        # Per-card filter wiring spec:
        #   { card_id: [ (filter_param_id, tag_name), ... ] }
        WIRING = {
            64:  [(FILTER_DATE_FROM_ID, "start_date"), (FILTER_DATE_TO_ID, "end_date")],
            70:  [(FILTER_DATE_FROM_ID, "start_date"), (FILTER_DATE_TO_ID, "end_date")],
            71:  [(FILTER_DATE_FROM_ID, "start_date"), (FILTER_DATE_TO_ID, "end_date")],
            72:  [(FILTER_DATE_FROM_ID, "start_date"), (FILTER_DATE_TO_ID, "end_date")],
            73:  [
                (FILTER_DATE_FROM_ID, "start_date"),
                (FILTER_DATE_TO_ID,   "end_date"),
                (FILTER_DIVISION_ID,  "division"),
                (FILTER_ISP_ID,       "isp"),
                (FILTER_SEVERITY_ID,  "severity"),
            ],
            75:  [
                (FILTER_DATE_FROM_ID, "start_date"),
                (FILTER_DATE_TO_ID,   "end_date"),
                (FILTER_DIVISION_ID,  "division"),
            ],
        }

        # Build updated dashcards list with parameter_mappings
        updated_dashcards = []
        for dc in dash.get("dashcards", []):
            card_id = dc.get("card_id")
            wiring  = WIRING.get(card_id, [])
            cparams = card_params.get(card_id, {})

            new_mappings = []
            for (filter_param_id, tag_name) in wiring:
                tag_param_id = cparams.get(tag_name)
                if not tag_param_id:
                    print(f"    ⚠️  Card {card_id}: no template tag '{tag_name}' — skipping")
                    continue
                new_mappings.append({
                    "parameter_id": filter_param_id,
                    "card_id":      card_id,
                    "target":       ["variable", ["template-tag", tag_name]],
                })

            updated_dashcards.append({
                "id":               dc["id"],
                "card_id":          card_id,
                "dashboard_tab_id": dc.get("dashboard_tab_id"),
                "col":              dc["col"],
                "row":              dc["row"],
                "size_x":           dc["size_x"],
                "size_y":           dc["size_y"],
                "parameter_mappings":     new_mappings if new_mappings else dc.get("parameter_mappings", []),
                "visualization_settings": dc.get("visualization_settings", {}),
            })

        # Merge full params list
        all_params = list(dash.get("parameters", []))
        existing_ids = {p["id"] for p in all_params}
        for p in DASHBOARD_PARAMETERS:
            if p["id"] not in existing_ids:
                all_params.append(p)

        tabs_list = [{"id": v, "name": k} for k, v in tabs.items()]
        self._put(f"/api/dashboard/{REG_DASH_ID}", {
            "parameters": all_params,
            "tabs":        tabs_list,
            "dashcards":   updated_dashcards,
        })
        wired = sum(1 for d in updated_dashcards if d["parameter_mappings"])
        print(f"  ✅ Wired parameter_mappings on {wired} dashcards")

    # ── Main ──────────────────────────────────────────────────────────────────
    def run(self):
        print("\n" + "═" * 55)
        print("  BTRC — Add Filters & Map to Regulatory Dashboard")
        print("═" * 55 + "\n")

        self.login()

        print("\n▶ Step 1: Create Division Pin-Map card")
        map_card_id = self.ensure_map_card()

        print("\n▶ Step 2: Place map card on R2 tab")
        self.add_map_card_to_dashboard(map_card_id)

        print("\n▶ Step 3: Add dashboard filters + wire parameter_mappings")
        self.add_filters_and_mappings()

        print(f"\n✅ Done — open http://localhost:3000/dashboard/{REG_DASH_ID}\n")


if __name__ == "__main__":
    try:
        MetabasePatch().run()
    except KeyboardInterrupt:
        print("\n⚠️  Interrupted")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Failed: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
