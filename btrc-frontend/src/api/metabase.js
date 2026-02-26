/**
 * Metabase REST API client — BTRC QoS v4
 *
 * Credentials (set in .env):
 *   VITE_METABASE_URL  = http://localhost:3000
 *   VITE_METABASE_USER = alamin.technometrics22@gmail.com
 *   VITE_METABASE_PASS = Test@123
 *
 * Cards used (fill in IDs after Metabase setup):
 *   Executive  — E1, E2, E3 tabs
 *   Regulatory — R1, R2, R3 tabs
 *   Operational — O1, O2, O3 tabs
 *   Card IDs documented in CLAUDE.md
 */

import axios from 'axios';

// Empty string → relative URLs → all /api/... calls go through Vite proxy.
// Full URL (e.g. http://localhost:3000) → direct calls (local dev without Docker).
const BASE = import.meta.env.VITE_METABASE_URL ?? '';

class MetabaseAPI {
  constructor() {
    this.client = axios.create({
      baseURL: BASE,
      headers: { 'Content-Type': 'application/json' },
    });
    this.sessionToken = null;

    // Attach session token to every request
    this.client.interceptors.request.use(cfg => {
      if (this.sessionToken) cfg.headers['X-Metabase-Session'] = this.sessionToken;
      return cfg;
    });

    // On 401 (token expired / Metabase restarted), clear the token and notify
    // the app so AuthContext can redirect to the login page.
    this.client.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401 && this.sessionToken) {
          this.sessionToken = null;
          window.dispatchEvent(new CustomEvent('mb-session-expired'));
        }
        return Promise.reject(err);
      }
    );
  }

  async login(username, password) {
    const { data } = await this.client.post('/api/session', { username, password });
    this.sessionToken = data.id;
    return data.id;
  }

  async getCurrentUser() {
    const { data: u } = await this.client.get('/api/user/current');
    return {
      id:      u.id,
      email:   u.email,
      name:    u.common_name || `${u.first_name} ${u.last_name}`.trim(),
      isAdmin: u.is_superuser,
      groupIds: u.group_ids || [],
    };
  }

  /**
   * Query a saved Metabase card/question
   * @param {number} cardId
   * @param {object} params  { division, district, isp, start_date, end_date }
   */
  async getCardData(cardId, params = {}) {
    const body = this._formatParams(params);
    const { data } = await this.client.post(`/api/card/${cardId}/query`, body);
    return this._parse(data);
  }

  /**
   * Run a native SQL query
   * @param {number} databaseId
   * @param {string} sql
   */
  async runQuery(databaseId, sql) {
    const { data } = await this.client.post('/api/dataset', {
      database: databaseId,
      type: 'native',
      native: { query: sql },
    });
    return this._parse(data);
  }

  /**
   * Find database ID by name substring (case-insensitive).
   * Falls back to first postgres DB, then first DB.
   * @param {string} [name] - substring to match in DB name
   */
  async getDatabaseId(name) {
    const { data } = await this.client.get('/api/database');
    const dbs = data?.data || data || [];
    const needle = (name || '').toLowerCase();
    const db = (needle
      ? dbs.find(d => d.name?.toLowerCase().includes(needle))
      : null)
      ?? dbs.find(d => d.engine === 'postgres')
      ?? dbs[0];
    return db?.id ?? null;
  }

  _formatParams(params) {
    if (!params || !Object.keys(params).length) return {};
    const DATE_KEYS = new Set(['start_date', 'end_date']);
    const parameters = Object.entries(params)
      .filter(([, v]) => v != null && v !== '')
      .map(([key, value]) => ({
        type:   DATE_KEYS.has(key) ? 'date/single' : 'category',
        target: ['variable', ['template-tag', key]],
        value,
      }));
    return parameters.length ? { parameters } : {};
  }

  _parse(data) {
    if (!data?.data) return { columns: [], rows: [], total: 0 };
    const { cols, rows } = data.data;
    return {
      columns: cols.map(c => ({
        name:        c.name,
        displayName: c.display_name,
        type:        c.base_type,
      })),
      rows,
      total: rows.length,
    };
  }

  isAuthenticated() { return !!this.sessionToken; }
  logout()          { this.sessionToken = null; }
}

export const metabaseAPI = new MetabaseAPI();
export default metabaseAPI;
