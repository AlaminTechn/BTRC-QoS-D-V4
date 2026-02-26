/**
 * cards.js — Metabase card ID constants
 *
 * Populated by:  python scripts/setup_metabase.py
 * Source file:   src/config/metabase_cards.json
 *
 * Usage:
 *   import { CARDS } from '../config/cards';
 *   const { rows } = useMetabaseCard(CARDS.REG_R2_DIV_VIOLATIONS);
 *   const { rows } = useMetabaseCard(CARDS.REG_R2_ISP_BY_AREA, { division: 'Dhaka' });
 */

import cardsData from './metabase_cards.json';

export const CARDS = cardsData;

// ── Regulatory ────────────────────────────────────────────────────────────
// R1 SLA Monitoring
export const REG_R1_COMPLIANT       = cardsData.REG_R1_COMPLIANT;
export const REG_R1_AT_RISK         = cardsData.REG_R1_AT_RISK;
export const REG_R1_VIOLATION       = cardsData.REG_R1_VIOLATION;
export const REG_R1_ISP_SLA_TABLE   = cardsData.REG_R1_ISP_SLA_TABLE;

// R2 Regional Drill-Down
export const REG_R2_DIV_VIOLATIONS   = cardsData.REG_R2_DIV_VIOLATIONS;
export const REG_R2_DIST_VIOLATIONS  = cardsData.REG_R2_DIST_VIOLATIONS;   // param: division
export const REG_R2_POP_MARKERS      = cardsData.REG_R2_POP_MARKERS;       // params: division, district
export const REG_R2_ISP_BY_AREA      = cardsData.REG_R2_ISP_BY_AREA;       // params: division, district
export const REG_R2_DIV_PERF_SUMMARY = cardsData.REG_R2_DIV_PERF_SUMMARY;

// R3 Violation Analysis
export const REG_R3_PENDING   = cardsData.REG_R3_PENDING;
export const REG_R3_DISPUTED  = cardsData.REG_R3_DISPUTED;
export const REG_R3_RESOLVED  = cardsData.REG_R3_RESOLVED;
export const REG_R3_DETAIL    = cardsData.REG_R3_DETAIL;    // params: division, district, isp, severity, status
export const REG_R3_TREND     = cardsData.REG_R3_TREND;
export const REG_R3_GEO       = cardsData.REG_R3_GEO;       // param: division

// ── Executive ─────────────────────────────────────────────────────────────
export const EXEC_E1_NATIONAL_SCORE  = cardsData.EXEC_E1_NATIONAL_SCORE;
export const EXEC_E1_ISP_PERFORMANCE = cardsData.EXEC_E1_ISP_PERFORMANCE;
export const EXEC_E1_ISP_BY_CATEGORY = cardsData.EXEC_E1_ISP_BY_CATEGORY;

export const EXEC_E2_DIV_SUMMARY     = cardsData.EXEC_E2_DIV_SUMMARY;

export const EXEC_E3_VIOLATION_TYPE  = cardsData.EXEC_E3_VIOLATION_TYPE;
export const EXEC_E3_VIOLATION_SEV   = cardsData.EXEC_E3_VIOLATION_SEV;
export const EXEC_E3_TREND           = cardsData.EXEC_E3_TREND;
export const EXEC_E3_PENALTY         = cardsData.EXEC_E3_PENALTY;
