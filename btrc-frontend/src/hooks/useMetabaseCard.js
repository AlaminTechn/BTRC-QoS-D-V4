/**
 * useMetabaseCard — fetch + cache a single Metabase card
 *
 * Usage:
 *   const { rows, columns, loading, error, refetch } = useMetabaseCard(87, { division: 'Dhaka' });
 *
 * Returns rows as plain objects keyed by lowercased SQL alias:
 *   { division: 'Dhaka', district: 'Gazipur', total: 5, critical: 1, ... }
 *
 * Caching: sessionStorage with 5-minute TTL.
 *   - Survives component re-mounts and SPA navigation within a browser tab.
 *   - Cleared automatically when TTL expires or when refetch() is called.
 */

import { useState, useEffect, useCallback } from 'react';
import { metabaseAPI } from '../api/metabase';

const CACHE_PREFIX = 'mb_cache_v2_'; // v2: switched param type to 'category' for all tags
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const readCache = (key) => {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return data;
  } catch { return null; }
};

const writeCache = (key, data) => {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* storage quota exceeded or private mode — silently skip */ }
};

const toKey = (cardId, params) => `${cardId}:${JSON.stringify(params)}`;

export const parseRows = (result) => {
  if (!result?.columns?.length || !result?.rows?.length) return [];
  return result.rows.map(row =>
    Object.fromEntries(
      result.columns.map((col, i) => {
        const raw = col.name || col.displayName || `col${i}`;
        const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        return [key, row[i]];
      })
    )
  );
};

export const useMetabaseCard = (cardId, params = {}, deps = []) => {
  const [rows,    setRows]    = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async (bust = false) => {
    if (!cardId) { setLoading(false); return; }
    const key = toKey(cardId, params);

    if (!bust) {
      const cached = readCache(key);
      if (cached) {
        setRows(cached.rows);
        setColumns(cached.columns);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const result = await metabaseAPI.getCardData(cardId, params);
      const parsed = parseRows(result);
      writeCache(key, { rows: parsed, columns: result.columns });
      setRows(parsed);
      setColumns(result.columns);
    } catch (e) {
      setError(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [cardId, JSON.stringify(params), ...deps]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const refetch = useCallback(() => load(true), [load]);

  return { rows, columns, loading, error, refetch };
};
