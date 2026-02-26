/**
 * FilterContext — global filter state for all dashboard tabs.
 *
 * State: division, district, isp, preset, startDate, endDate
 * URL-synced via React Router useSearchParams.
 * Metadata (ISP list, districts per division, maxDate) loaded once from DB
 * via Metabase runQuery and cached in sessionStorage for 10 minutes.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { metabaseAPI } from '../api/metabase';
import { useAuth } from './AuthContext';

const FilterContext = createContext(null);

const DB_ID        = 2;                   // Metabase DB id (btrc_qos_poc)
const CACHE_KEY    = 'btrc_filter_meta';
const CACHE_TTL_MS = 10 * 60 * 1000;     // 10 min

const readMeta = () => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    return Date.now() - ts < CACHE_TTL_MS ? data : null;
  } catch { return null; }
};

const saveMeta = (data) => {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); }
  catch {}
};

// Extract plain rows from a Metabase runQuery result
const toRows = (result) => {
  if (!result?.columns?.length || !result?.rows?.length) return [];
  return result.rows.map(row =>
    Object.fromEntries(result.columns.map((col, i) => [col.name, row[i]]))
  );
};

export const FilterProvider = ({ children }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, role } = useAuth();

  // ── Filter values (read initial state from URL) ─────────────────────────
  const [division,  setDivisionState]  = useState(searchParams.get('div')   || '');
  const [district,  setDistrictState]  = useState(searchParams.get('dist')  || '');
  const [isp,       setIspState]       = useState(searchParams.get('isp')   || '');
  const [preset,    setPresetState]    = useState(searchParams.get('range') || '30d');
  const [startDate, setStartDate]      = useState(searchParams.get('from')  || null);
  const [endDate,   setEndDate]        = useState(searchParams.get('to')    || null);

  // ── RBAC: lock division/ISP for restricted roles ─────────────────────────
  const divisionLocked = role === 'regional_officer' && !!user?.division;
  const ispLocked      = role === 'isp_user'         && !!user?.isp;

  // Auto-set locked filters when user identity changes (e.g. after login)
  useEffect(() => {
    if (divisionLocked) setDivisionState(user.division);
    if (ispLocked)      setIspState(user.isp);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Metadata (loaded once, cached) ──────────────────────────────────────
  const [maxDate,      setMaxDate]      = useState(null);
  const [allDistricts, setAllDistricts] = useState({}); // { divName: [distName, ...] }
  const [ispList,      setIspList]      = useState([]);
  const [metaLoading,  setMetaLoading]  = useState(true);

  useEffect(() => {
    const cached = readMeta();
    if (cached) {
      setMaxDate(cached.maxDate);
      setAllDistricts(cached.allDistricts);
      setIspList(cached.ispList);
      setMetaLoading(false);
      return;
    }
    Promise.all([
      metabaseAPI.runQuery(DB_ID, 'SELECT MAX(detection_time) AS max_date FROM sla_violations'),
      metabaseAPI.runQuery(DB_ID, `
        SELECT d.name_en AS division, di.name_en AS district
        FROM geo_districts di
        JOIN geo_divisions d ON di.division_id = d.id
        ORDER BY d.name_en, di.name_en
      `),
      metabaseAPI.runQuery(DB_ID, `
        SELECT name_en AS isp FROM isps WHERE is_active = true ORDER BY name_en
      `),
    ])
      .then(([dateRes, distRes, ispRes]) => {
        const maxD = toRows(dateRes)[0]?.max_date || null;
        const divMap = {};
        toRows(distRes).forEach(({ division: dv, district: dt }) => {
          if (dv) { divMap[dv] = divMap[dv] || []; divMap[dv].push(dt); }
        });
        const isps = toRows(ispRes).map(r => r.isp).filter(Boolean);
        const meta = { maxDate: maxD, allDistricts: divMap, ispList: isps };
        saveMeta(meta);
        setMaxDate(maxD);
        setAllDistricts(divMap);
        setIspList(isps);
      })
      .catch(console.error)
      .finally(() => setMetaLoading(false));
  }, []);

  // ── Sync filter state → URL ──────────────────────────────────────────────
  useEffect(() => {
    const p = {};
    if (division)  p.div   = division;
    if (district)  p.dist  = district;
    if (isp)       p.isp   = isp;
    if (preset)    p.range = preset;
    if (startDate) p.from  = startDate;
    if (endDate)   p.to    = endDate;
    setSearchParams(p, { replace: true });
  }, [division, district, isp, preset, startDate, endDate]); // eslint-disable-line

  // ── Compute absolute start/end from preset + maxDate ────────────────────
  const resolvedDates = useMemo(() => {
    if (preset === 'all') return { start: null, end: null };
    if (preset === 'custom') return { start: startDate, end: endDate };
    if (!maxDate) return { start: null, end: null };
    const end  = dayjs(maxDate);
    const days = { '7d': 7, '14d': 14, '30d': 30 }[preset] ?? 30;
    return {
      start: end.subtract(days, 'day').toISOString(),
      end:   end.toISOString(),
    };
  }, [preset, maxDate, startDate, endDate]);

  // ── Build Metabase API params object ─────────────────────────────────────
  const activeParams = useMemo(() => {
    const p = {};
    if (division)              p.division   = division;
    if (district)              p.district   = district;
    if (isp)                   p.isp        = isp;
    if (resolvedDates.start)   p.start_date = resolvedDates.start;
    if (resolvedDates.end)     p.end_date   = resolvedDates.end;
    return p;
  }, [division, district, isp, resolvedDates]);

  // ── Districts available for selected division ────────────────────────────
  const availableDistricts = useMemo(
    () => (division ? allDistricts[division] || [] : []),
    [division, allDistricts]
  );

  // ── Setters with side effects ────────────────────────────────────────────
  const setDivision = useCallback((val) => {
    setDivisionState(val || '');
    setDistrictState('');  // clear district when division changes
  }, []);

  const setDistrict = useCallback((val) => setDistrictState(val || ''), []);
  const setIsp      = useCallback((val) => setIspState(val || ''),      []);
  const setPreset   = useCallback((val) => { setPresetState(val); }, []);

  const resetFilters = useCallback(() => {
    setDivisionState('');
    setDistrictState('');
    setIspState('');
    setPresetState('30d');
    setStartDate(null);
    setEndDate(null);
  }, []);

  const hasActiveFilters = !!(division || district || isp || preset !== '30d');

  return (
    <FilterContext.Provider value={{
      division, district, isp, preset, startDate, endDate,
      setDivision, setDistrict, setIsp, setPreset, setStartDate, setEndDate,
      resetFilters, hasActiveFilters,
      availableDistricts, ispList, maxDate, metaLoading,
      activeParams,
      divisionLocked, ispLocked,
    }}>
      {children}
    </FilterContext.Provider>
  );
};

export const useFilter = () => {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilter must be inside FilterProvider');
  return ctx;
};
