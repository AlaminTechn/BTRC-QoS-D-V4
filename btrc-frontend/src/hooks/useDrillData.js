/**
 * useDrillData — drill-down state + data fetching via Metabase cards
 *
 * Fetches data using pre-configured Metabase card IDs (from cards.js).
 * No raw SQL in the frontend — all SQL lives in Metabase.
 *
 * Drill levels: national → division → district
 *
 * Returns:
 *   divisionData  { [geoName]: { total, critical, high, medium, low } }
 *   districtData  { [geoName]: { total, critical, high, medium, low } }
 *   popMarkers    [{ id, name_en, latitude, longitude, violations, critical, ... }]
 *   ispData       [{ isp, division, district, avg_download_mbps, ... }]
 *   level         'national' | 'division' | 'district'
 *   selectedDiv   GeoJSON NAME_1
 *   selectedDist  GeoJSON shapeName
 *   loading, error
 *   drillToDiv(geoName), drillToDist(geoName), drillUp(), resetDrill()
 */

import { useState, useEffect, useCallback } from 'react';
import { metabaseAPI } from '../api/metabase';
import {
  REG_R2_DIV_VIOLATIONS,
  REG_R2_DIST_VIOLATIONS,
  REG_R2_POP_MARKERS,
  REG_R2_ISP_BY_AREA,
} from '../config/cards';

// ── Name mappings (DB name_en → GeoJSON property) ──────────────────────────
// Division DB names match GeoJSON NAME_1 exactly — no mapping needed.
const DIV_DB_TO_GEO  = {};
const DIST_DB_TO_GEO = {
  Bogura: 'Bogra', Brahmanbaria: 'Brahamanbaria', Chapainawabganj: 'Nawabganj',
  Chattogram: 'Chittagong', Coxsbazar: "Cox's Bazar", Jashore: 'Jessore',
  Jhalakathi: 'Jhalokati', Moulvibazar: 'Maulvibazar', Netrokona: 'Netrakona',
};

export const toGeoDiv  = (n) => n;
export const toGeoDist = (n) => DIST_DB_TO_GEO[n] || n;
export const toDbDiv   = (n) => n;
export const toDbDist  = (n) => Object.entries(DIST_DB_TO_GEO).find(([, v]) => v === n)?.[0] || n;

// ── Parse Metabase result rows ──────────────────────────────────────────────
const parseRows = (result) => {
  if (!result?.columns?.length || !result?.rows?.length) return [];
  return result.rows.map((row) =>
    Object.fromEntries(
      result.columns.map((col, i) => {
        const raw = col.name || col.displayName || `col${i}`;
        const key = raw.toLowerCase()
          .replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        return [key, row[i]];
      })
    )
  );
};

// ── Build divisionData object from card rows ───────────────────────────────
const buildDivisionData = (rows) => {
  const d = {};
  rows.forEach((r) => {
    const geoName = toGeoDiv(r.division || r.name_en || '');
    if (geoName) d[geoName] = {
      total:    Number(r.total    || 0),
      critical: Number(r.critical || 0),
      high:     Number(r.high     || 0),
      medium:   Number(r.medium   || 0),
      low:      Number(r.low      || 0),
    };
  });
  return d;
};

// ── Build districtData object from card rows ───────────────────────────────
const buildDistrictData = (rows) => {
  const d = {};
  rows.forEach((r) => {
    const geoName = toGeoDist(r.district || r.name_en || '');
    if (geoName) d[geoName] = {
      total:    Number(r.total    || 0),
      critical: Number(r.critical || 0),
      high:     Number(r.high     || 0),
      medium:   Number(r.medium   || 0),
      low:      Number(r.low      || 0),
    };
  });
  return d;
};

// ── Card fetch helper ──────────────────────────────────────────────────────
const fetchCard = async (cardId, params = {}) => {
  if (!cardId) throw new Error(`Card ID not configured — run setup_metabase.py first`);
  const result = await metabaseAPI.getCardData(cardId, params);
  return parseRows(result);
};

// ══════════════════════════════════════════════════════════════════════════════
// Hook
// ══════════════════════════════════════════════════════════════════════════════
export const useDrillData = () => {
  const [level,        setLevel]        = useState('national');
  const [selectedDiv,  setSelectedDiv]  = useState(null); // GeoJSON NAME_1
  const [selectedDist, setSelectedDist] = useState(null); // GeoJSON shapeName

  const [divisionData, setDivisionData] = useState({});
  const [districtData, setDistrictData] = useState({});
  const [popMarkers,   setPopMarkers]   = useState([]);
  const [ispData,      setIspData]      = useState([]);

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // ── Load national division data ───────────────────────────────────────────
  const loadNational = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchCard(REG_R2_DIV_VIOLATIONS);
      setDivisionData(buildDivisionData(rows));
    } catch (e) {
      setError(e.message || 'Failed to load division data');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Drill to division ─────────────────────────────────────────────────────
  const drillToDiv = useCallback(async (geoName) => {
    setLoading(true);
    setError(null);
    setSelectedDiv(geoName);
    setSelectedDist(null);
    setLevel('division');
    const dbName = toDbDiv(geoName);
    try {
      const [distRows, popRows, ispRows] = await Promise.all([
        fetchCard(REG_R2_DIST_VIOLATIONS, { division: dbName }),
        fetchCard(REG_R2_POP_MARKERS,     { division: dbName }),
        fetchCard(REG_R2_ISP_BY_AREA,     { division: dbName }),
      ]);
      setDistrictData(buildDistrictData(distRows));
      setPopMarkers(_normalisePopRows(popRows));
      setIspData(ispRows);
    } catch (e) {
      setError(e.message || 'Failed to load division detail');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Drill to district ─────────────────────────────────────────────────────
  const drillToDist = useCallback(async (geoDistName) => {
    if (!selectedDiv) return;
    setLoading(true);
    setError(null);
    setSelectedDist(geoDistName);
    setLevel('district');
    const dbDivName  = toDbDiv(selectedDiv);
    const dbDistName = toDbDist(geoDistName);
    try {
      const [popRows, ispRows] = await Promise.all([
        fetchCard(REG_R2_POP_MARKERS, { division: dbDivName, district: dbDistName }),
        fetchCard(REG_R2_ISP_BY_AREA, { division: dbDivName, district: dbDistName }),
      ]);
      setPopMarkers(_normalisePopRows(popRows));
      setIspData(ispRows);
    } catch (e) {
      setError(e.message || 'Failed to load district detail');
    } finally {
      setLoading(false);
    }
  }, [selectedDiv]);

  // ── Navigate up ───────────────────────────────────────────────────────────
  const drillUp = useCallback(() => {
    if (level === 'district') {
      setLevel('division');
      setSelectedDist(null);
      if (selectedDiv) {
        // re-fetch division level data
        drillToDiv(selectedDiv);
        return;
      }
    } else if (level === 'division') {
      setLevel('national');
      setSelectedDiv(null);
      setDistrictData({});
      setPopMarkers([]);
      setIspData([]);
    }
  }, [level, selectedDiv, drillToDiv]);

  const resetDrill = useCallback(() => {
    setLevel('national');
    setSelectedDiv(null);
    setSelectedDist(null);
    setDistrictData({});
    setPopMarkers([]);
    setIspData([]);
  }, []);

  useEffect(() => { loadNational(); }, [loadNational]);

  return {
    divisionData,
    districtData,
    popMarkers,
    ispData,
    level,
    selectedDiv,
    selectedDist,
    loading,
    error,
    drillToDiv,
    drillToDist,
    drillUp,
    resetDrill,
  };
};

// ── Helpers ────────────────────────────────────────────────────────────────
function _normalisePopRows(rows) {
  return rows
    .filter(r => r.latitude && r.longitude)
    .map(r => ({
      ...r,
      violations: Number(r.violations || 0),
      critical:   Number(r.critical   || 0),
      latitude:   Number(r.latitude),
      longitude:  Number(r.longitude),
    }));
}
