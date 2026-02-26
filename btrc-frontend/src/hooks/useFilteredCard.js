/**
 * useFilteredCard — like useMetabaseCard but auto-merges global FilterContext params.
 *
 * Usage:
 *   const { rows, loading } = useFilteredCard(cardId);
 *   const { rows, loading } = useFilteredCard(cardId, { severity: 'CRITICAL' });
 *   const { rows, loading } = useFilteredCard(cardId, {}, ['division','start_date','end_date']);
 *
 * Priority: card-specific params OVERRIDE global filter params.
 *
 * @param {number}   cardId       - Metabase card ID
 * @param {object}   cardParams   - card-specific overrides (merged on top of global)
 * @param {string[]} filterKeys   - which global filters to forward (default: all 5)
 */

import { useMemo } from 'react';
import { useMetabaseCard } from './useMetabaseCard';
import { useFilter } from '../contexts/FilterContext';

const ALL_KEYS = ['division', 'district', 'isp', 'start_date', 'end_date'];

export const useFilteredCard = (
  cardId,
  cardParams  = {},
  filterKeys  = ALL_KEYS,
) => {
  const { activeParams } = useFilter();

  const mergedParams = useMemo(() => {
    // Take only the requested global filter keys
    const subset = Object.fromEntries(
      Object.entries(activeParams).filter(([k]) => filterKeys.includes(k))
    );
    // Card-specific params win over global params
    return { ...subset, ...cardParams };
  }, [JSON.stringify(activeParams), JSON.stringify(cardParams), filterKeys.join(',')]); // eslint-disable-line

  return useMetabaseCard(cardId, mergedParams, [JSON.stringify(mergedParams)]);
};
