/**
 * useDrillData — drill-down state + data fetching via Metabase cards
 *
 * Fetches data using pre-configured Metabase card IDs (from cards.js).
 * No raw SQL in the frontend — all SQL lives in Metabase.
 *
 * Drill levels: national → division → district
 *
 * Global filters (ISP / date range / division from FilterBar) are merged into
 * every fetchCard call so the map choropleth and PoP markers reflect the
 * active filter selection.  Drill-state division/district OVERRIDE any
 * same-key values coming from the global filter.
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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { metabaseAPI } from '../api/metabase';
import { useFilter } from '../contexts/FilterContext';
import {
  REG_R2_DIV_VIOLATIONS,
  REG_R2_DIST_VIOLATIONS,
  REG_R2_POP_MARKERS,
  REG_R2_ISP_BY_AREA,
} from '../config/cards';

// ── Name mappings (DB name_en → GeoJSON property) ──────────────────────────
// Division DB names match GeoJSON NAME_1 exactly — no mapping needed.
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
    const geoName = r.division || r.name_en || '';
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

// ── Normalise PoP rows ─────────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
// Hook
// ══════════════════════════════════════════════════════════════════════════════
export const useDrillData = () => {
  // ── Global filter params (ISP + date range + optional division from FilterBar)
  const { activeParams } = useFilter();

  // We forward ALL global filter keys to the card queries.
  // At drill levels, drill-state division/district are spread AFTER filterParams
  // so they take priority over any same-key values from the FilterBar.
  const filterParams = useMemo(() => {
    const p = {};
    if (activeParams.isp)        p.isp        = activeParams.isp;
    if (activeParams.start_date) p.start_date = activeParams.start_date;
    if (activeParams.end_date)   p.end_date   = activeParams.end_date;
    // Include FilterBar's division/district — only meaningful at national level;
    // at drill levels the drill-state values override these below.
    if (activeParams.division)   p.division   = activeParams.division;
    if (activeParams.district)   p.district   = activeParams.district;
    return p;
  }, [
    activeParams.isp,
    activeParams.start_date,
    activeParams.end_date,
    activeParams.division,
    activeParams.district,
  ]);

  // ── Drill state ────────────────────────────────────────────────────────────
  const [level,        setLevel]        = useState('national');
  const [selectedDiv,  setSelectedDiv]  = useState(null); // GeoJSON NAME_1
  const [selectedDist, setSelectedDist] = useState(null); // GeoJSON shapeName

  // ── Data ───────────────────────────────────────────────────────────────────
  const [divisionData, setDivisionData] = useState({});
  const [districtData, setDistrictData] = useState({});
  const [popMarkers,   setPopMarkers]   = useState([]);
  const [ispData,      setIspData]      = useState([]);

  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // ── Single effect: re-fetch whenever drill state OR global filters change ──
  // Cancellation flag prevents stale setState after unmount or rapid changes.
  const filterKey = JSON.stringify(filterParams);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        if (level === 'national') {
          // Card 65 only has: division, isp, start_date, end_date — strip district.
          // (A district filter makes no sense on a national division choropleth.)
          // eslint-disable-next-line no-unused-vars
          const { district: _d, ...card65Params } = filterParams;
          const rows = await fetchCard(REG_R2_DIV_VIOLATIONS, card65Params);
          if (!cancelled) setDivisionData(buildDivisionData(rows));

        } else if (level === 'division' && selectedDiv) {
          // Drill-state division overrides FilterBar division
          const params = { ...filterParams, division: toDbDiv(selectedDiv) };
          delete params.district; // district not applicable at division level
          const [distRows, popRows, ispRows] = await Promise.all([
            fetchCard(REG_R2_DIST_VIOLATIONS, params),
            fetchCard(REG_R2_POP_MARKERS,     params),
            fetchCard(REG_R2_ISP_BY_AREA,     params),
          ]);
          if (!cancelled) {
            setDistrictData(buildDistrictData(distRows));
            setPopMarkers(_normalisePopRows(popRows));
            setIspData(ispRows);
          }

        } else if (level === 'district' && selectedDiv && selectedDist) {
          // Drill-state division + district override FilterBar values
          const params = {
            ...filterParams,
            division: toDbDiv(selectedDiv),
            district: toDbDist(selectedDist),
          };
          const [popRows, ispRows] = await Promise.all([
            fetchCard(REG_R2_POP_MARKERS, params),
            fetchCard(REG_R2_ISP_BY_AREA, params),
          ]);
          if (!cancelled) {
            setPopMarkers(_normalisePopRows(popRows));
            setIspData(ispRows);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load map data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [level, selectedDiv, selectedDist, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drill actions — update state only; the effect above handles fetching ──

  const drillToDiv = useCallback((geoName) => {
    setLoading(true); // show spinner immediately before effect fires
    setSelectedDiv(geoName);
    setSelectedDist(null);
    setLevel('division');
    setDistrictData({});
    setPopMarkers([]);
    setIspData([]);
  }, []);

  const drillToDist = useCallback((geoDistName) => {
    setLoading(true);
    setSelectedDist(geoDistName);
    setLevel('district');
    setPopMarkers([]);
    setIspData([]);
  }, []);

  const drillUp = useCallback(() => {
    if (level === 'district') {
      setLoading(true);
      setLevel('division');
      setSelectedDist(null);
      // districtData stays visible; effect re-fetches PoPs+ISPs for division level
    } else if (level === 'division') {
      setLevel('national');
      setSelectedDiv(null);
      setSelectedDist(null);
      setDistrictData({});
      setPopMarkers([]);
      setIspData([]);
    }
  }, [level]);

  const resetDrill = useCallback(() => {
    setLevel('national');
    setSelectedDiv(null);
    setSelectedDist(null);
    setDistrictData({});
    setPopMarkers([]);
    setIspData([]);
  }, []);

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
