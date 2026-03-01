/**
 * DrillDownMap — React-Leaflet choropleth with National→Division→District drill-down
 *
 * Props:
 *   height         {string}    CSS height e.g. '500px'
 *   divisionData   {object}    { 'Dhaka': { total, critical, high, medium, low }, ... }
 *   districtData   {object}    { 'Gazipur': { total, critical, high, medium, low }, ... }
 *   popMarkers     {array}     [{ id, name_en, latitude, longitude, violations, ... }]
 *   level          {string}    'national' | 'division' | 'district'
 *   selectedDiv    {string}    GeoJSON NAME_1 of selected division
 *   selectedDist   {string}    GeoJSON shapeName of selected district
 *   onDivClick     {function}  (geoName) => void
 *   onDistClick    {function}  (shapeName) => void
 *   onPopClick     {function}  (pop) => void
 *
 * Map layers (bottom → top):
 *   1. CartoDB No-Labels base tile (z-index default) — clean base
 *   2. Division / district choropleth GeoJSON (overlayPane 400)
 *   3. Division context outline GeoJSON (overlayPane 400)
 *   4. Bangladesh mask — inverted world polygon, hides surrounding countries (overlayPane 400)
 *   5. GeoLabelLayer — centroid labels (labelPane 450)
 *   6. PoP CircleMarker (popPane 500)
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MapContainer, TileLayer, GeoJSON, CircleMarker,
  Tooltip, useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { leafletLayer, paintRules } from 'protomaps-leaflet';
import { namedFlavor } from '@protomaps/basemaps';
import { Spin, Tooltip as AntTooltip } from 'antd';
import { FullscreenOutlined, FullscreenExitOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from '../../i18n';
// ── Tile sources ──────────────────────────────────────────────────────────────
const CARTO_NL_URL  = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png';
const CARTO_NL_ATTR = '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors &copy; CARTO';
const OSM_URL       = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR      = '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>';
// Martin XYZ tile URL — goes through Vite proxy (/tiles → martin:3000)
const PMTILES_URL = import.meta.env.VITE_TILE_URL;
// ── Bangladesh initial view ───────────────────────────────────────────────────
const BD_CENTER = [23.68, 90.35];
const BD_ZOOM   = 7;

// ── Severity colour helpers ────────────────────────────────────────────────────
const SEV_COLORS = {
  CRITICAL: '#dc2626', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#22c55e',
};

// Three-tier RAG (Red / Amber / Green) colour scale for choropleth
// 0 violations → gray (no issue)
// low ratio   → green (compliant)
// mid ratio   → yellow/amber (at-risk)
// high ratio  → red (non-compliant)
const getViolationColor = (value, max) => {
  if (!max || value === 0) return '#e5e7eb'; // gray — no violations
  const ratio = value / max;
  if (ratio > 0.60) return '#dc2626';        // red   — high
  if (ratio > 0.30) return '#eab308';        // yellow — moderate
  return '#22c55e';                           // green — low
};

const getDistrictColor = (value, max) => {
  if (!max || value === 0) return '#e5e7eb'; // gray — no violations
  const ratio = value / max;
  if (ratio > 0.60) return '#dc2626';        // red
  if (ratio > 0.30) return '#eab308';        // yellow
  return '#22c55e';                           // green
};

const popColor = (violations) =>
  violations >= 6 ? '#dc2626' : violations >= 3 ? '#f97316' : violations >= 1 ? '#eab308' : '#22c55e';

// ── FitBounds helper ──────────────────────────────────────────────────────────
const FitBounds = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    } else {
      map.setView(BD_CENTER, BD_ZOOM, { animate: true });
    }
  }, [bounds, map]);
  return null;
};

// ── MapPaneSetup — creates custom Leaflet panes ───────────────────────────────
const MapPaneSetup = () => {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane('labelPane')) map.createPane('labelPane').style.zIndex = 450;
    if (!map.getPane('popPane'))   map.createPane('popPane').style.zIndex   = 500;
  }, [map]);
  return null;
};

// ── GeoLabelLayer — centroid labels via Leaflet divIcon in labelPane ──────────
const GeoLabelLayer = ({ geoJSON, nameKey, getLabel }) => {
  const map = useMap();
  useEffect(() => {
    if (!geoJSON) return;
    // labelPane may not exist yet on very first mount; create if missing
    if (!map.getPane('labelPane')) {
      map.createPane('labelPane').style.zIndex = 450;
    }
    const markers = [];
    geoJSON.features.forEach((f) => {
      try {
        const center = L.geoJSON(f).getBounds().getCenter();
        const label  = getLabel ? getLabel(f) : f.properties[nameKey];
        if (!label) return;
        const m = L.marker(center, {
          pane:        'labelPane',
          icon:        L.divIcon({
            className: 'map-geo-label-wrapper',
            html:      `<span class="map-geo-label">${label}</span>`,
            iconSize:  [0, 0],
            iconAnchor:[0, 0],
          }),
          interactive: false,
          keyboard:    false,
        }).addTo(map);
        markers.push(m);
      } catch { /* skip malformed features */ }
    });
    return () => markers.forEach((m) => map.removeLayer(m));
  }, [map, geoJSON]); // getLabel excluded — component is remounted via key on lang change

  return null;
};

// ── BangladeshMask — inverted world polygon that hides surrounding countries ──
// Builds a GeoJSON polygon covering the whole region EXCEPT Bangladesh.
// Each division's outer ring becomes a "hole" (evenodd fill rule → transparent).
const buildMaskGeoJSON = (divGeoJSON) => {
  if (!divGeoJSON) return null;
  const rings = [];
  divGeoJSON.features.forEach((f) => {
    const geom = f.geometry;
    if (geom.type === 'Polygon') {
      rings.push(geom.coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach((poly) => rings.push(poly[0]));
    }
  });
  if (!rings.length) return null;
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      // First ring = outer box (covers the region); subsequent rings = holes for Bangladesh
      // GeoJSON uses [lng, lat] — box covers South/Southeast Asia visible area
      coordinates: [
        [[30, -20], [150, -20], [150, 65], [30, 65], [30, -20]],
        ...rings,
      ],
    },
  };
};

// ── MapResizer — invalidates map size after container resize ──────────────────
const MapResizer = () => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 120);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
};

// ── ProtomapsBaseLayer — renders Protomaps vector tiles via Martin XYZ endpoint
// Uses explicit paintRules (no flavor) so we can pass labelRules: [] to suppress
// all built-in place-name labels. Our GeoLabelLayer handles labels instead.
// NOTE: when 'flavor' is set, protomaps-leaflet ignores explicit labelRules.
const _pmTheme = namedFlavor('light');
const _pmPaintRules = paintRules(_pmTheme);

const ProtomapsBaseLayer = ({ url }) => {
  const map = useMap();
  useEffect(() => {
    if (!url || !map) return;
    const layer = leafletLayer({
      url,
      paintRules:      _pmPaintRules,
      labelRules:      [],            // suppress all built-in labels
      backgroundColor: _pmTheme.background,
    });
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, url]);
  return null;
};

// ── Main component ─────────────────────────────────────────────────────────────
const DrillDownMap = ({
  height         = '520px',
  divisionData   = {},
  districtData   = {},
  popMarkers     = [],
  level          = 'national',
  selectedDiv    = null,
  selectedDist   = null,
  onDivClick,
  onDistClick,
  onPopClick,
}) => {
  const { lang } = useTranslation();

  const [divGeoJSON,  setDivGeoJSON]  = useState(null);
  const [distGeoJSON, setDistGeoJSON] = useState(null);
  const [fitBounds,   setFitBounds]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [maximized,  setMaximized]  = useState(false);
  const [resizeKey,  setResizeKey]  = useState(0);
  // 'carto' | 'osm' | 'satellite' | 'pmtiles'
  const [activeTile, setActiveTile] = useState('pmtiles');
  const divLayerRef  = useRef(null);
  const distLayerRef = useRef(null);

  const toggleMaximize = useCallback(() => {
    setMaximized(v => !v);
    // Bump key so MapResizer fires after DOM settles
    setResizeKey(k => k + 1);
  }, []);

  // Lock body scroll when maximized
  useEffect(() => {
    document.body.style.overflow = maximized ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [maximized]);

  // Load GeoJSON on mount
  useEffect(() => {
    Promise.all([
      fetch('/geodata/bangladesh_divisions_8.geojson').then(r => r.json()),
      fetch('/geodata/bgd_districts.geojson').then(r => r.json()),
    ]).then(([div, dist]) => {
      setDivGeoJSON(div);
      setDistGeoJSON(dist);
    }).finally(() => setLoading(false));
  }, []);

  // Max values for colour scale
  const maxDiv  = useMemo(() =>
    Math.max(1, ...Object.values(divisionData).map(d => d.total || 0)),
  [divisionData]);

  const maxDist = useMemo(() =>
    Math.max(1, ...Object.values(districtData).map(d => d.total || 0)),
  [districtData]);

  // ── Division layer style — dim non-selected when a division is active ────
  // When PM offline tiles are active, use lower opacity so base tiles show through
  const pm = activeTile === 'pmtiles';
  const divStyle = (feature) => {
    const name = feature.properties.NAME_1;
    const d    = divisionData[name] || {};
    const isSelected = name === selectedDiv;
    return {
      fillColor:   getViolationColor(d.total || 0, maxDiv),
      fillOpacity: isSelected ? (pm ? 0.55 : 0.9) : (selectedDiv ? (pm ? 0.12 : 0.2) : (pm ? 0.4 : 0.65)),
      color:       isSelected ? '#1e3a5f' : (selectedDiv ? '#aaa' : '#fff'),
      weight:      isSelected ? 3.5 : (selectedDiv ? 0.8 : 1.2),
    };
  };

  const onEachDiv = (feature, layer) => {
    const name = feature.properties.NAME_1;
    const d    = divisionData[name] || {};
    layer.bindTooltip(`
      <strong>${name}</strong><br/>
      Violations: <b>${d.total || 0}</b>
      ${d.critical ? ` • 🔴 ${d.critical} Critical` : ''}
    `, { sticky: true });
    layer.on('click', () => {
      onDivClick?.(name);
      setFitBounds(layer.getBounds());
    });
    layer.on('mouseover', (e) => { e.target.setStyle({ weight: 2.5, fillOpacity: 0.85 }); });
    layer.on('mouseout',  (e) => { e.target.setStyle(divStyle(feature)); });
  };

  // ── District layer — filter by districts that have data ─────────────────
  const filteredDistGeoJSON = useMemo(() => {
    if (!distGeoJSON || level === 'national') return null;
    const allowed = new Set(Object.keys(districtData));
    return {
      ...distGeoJSON,
      features: distGeoJSON.features.filter(f => allowed.has(f.properties.shapeName)),
    };
  }, [distGeoJSON, districtData, level]);

  const distStyle = (feature) => {
    const name = feature.properties.shapeName;
    const d    = districtData[name] || {};
    const isSelected = name === selectedDist;
    return {
      fillColor:   getDistrictColor(d.total || 0, maxDist),
      fillOpacity: isSelected ? (pm ? 0.55 : 0.9) : (pm ? 0.4 : 0.65),
      color:       isSelected ? '#7c2d12' : '#fff',
      weight:      isSelected ? 3 : 1,
    };
  };

  const onEachDist = (feature, layer) => {
    const name = feature.properties.shapeName;
    const d    = districtData[name] || {};
    layer.bindTooltip(`
      <strong>${name}</strong><br/>
      Violations: <b>${d.total || 0}</b>
      ${d.critical ? ` • 🔴 ${d.critical}` : ''}
    `, { sticky: true });
    layer.on('click', () => {
      onDistClick?.(name);
      setFitBounds(layer.getBounds());
    });
    layer.on('mouseover', (e) => { e.target.setStyle({ weight: 2.5, fillOpacity: 0.88 }); });
    layer.on('mouseout',  (e) => { e.target.setStyle(distStyle(feature)); });
  };

  // ── Inverted mask — built once when divGeoJSON loads ─────────────────────
  const bangMaskData = useMemo(() => buildMaskGeoJSON(divGeoJSON), [divGeoJSON]);

  // ── Division context outline (division/district level) ───────────────────
  const selectedDivOutlineGeoJSON = useMemo(() => {
    if (!divGeoJSON || level === 'national' || !selectedDiv) return null;
    return {
      ...divGeoJSON,
      features: divGeoJSON.features.filter(f => f.properties.NAME_1 === selectedDiv),
    };
  }, [divGeoJSON, selectedDiv, level]);

  // ── Keys to force GeoJSON re-render when data/selection/tile changes ─────
  const divKey  = JSON.stringify(divisionData) + selectedDiv  + activeTile;
  const distKey = JSON.stringify(districtData) + selectedDist + activeTile;

  if (loading) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <Spin size="large" tip="Loading map…" />
      </div>
    );
  }

  const containerStyle = maximized
    ? {
        position: 'fixed', inset: 0, zIndex: 2000,
        background: '#f0f2f5', display: 'flex', flexDirection: 'column',
      }
    : { position: 'relative', height };

  const mapStyle = maximized
    ? { flex: 1, width: '100%' }
    : { height: '100%', width: '100%' };

  return (
    <div style={containerStyle}>
      <MapContainer
        key={`map-${maximized}`}
        center={BD_CENTER} zoom={maximized ? 7 : BD_ZOOM}
        style={mapStyle}
        zoomControl={true}
      >
        <MapResizer key={resizeKey} />
        {/* 1. Pane setup (runs first, before GeoLabelLayer) */}
        <MapPaneSetup />

        {/* 2. Base tile layers — controlled by activeTile state */}
        {activeTile === 'carto' && (
          <TileLayer url={CARTO_NL_URL} attribution={CARTO_NL_ATTR} />
        )}
        {activeTile === 'osm' && (
          <TileLayer url={OSM_URL} attribution={OSM_ATTR} />
        )}
        {activeTile === 'satellite' && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="&copy; Esri"
          />
        )}
        {activeTile === 'pmtiles' && (
          <ProtomapsBaseLayer url={PMTILES_URL} />
        )}

        <FitBounds bounds={fitBounds} />

        {/* 3. Division choropleth (national level only) */}
        {divGeoJSON && level === 'national' && (
          <GeoJSON
            key={divKey}
            ref={divLayerRef}
            data={divGeoJSON}
            style={divStyle}
            onEachFeature={onEachDiv}
          />
        )}

        {/* 4. Division context outline (dashed border, no fill, at division/district level) */}
        {selectedDivOutlineGeoJSON && (
          <GeoJSON
            key={`div-outline-${selectedDiv}`}
            data={selectedDivOutlineGeoJSON}
            style={() => ({
              fillOpacity: 0,
              color:       '#1e3a5f',
              weight:      2,
              dashArray:   '6,4',
            })}
          />
        )}

        {/* 5. District choropleth */}
        {filteredDistGeoJSON && level !== 'national' && (
          <GeoJSON
            key={distKey}
            ref={distLayerRef}
            data={filteredDistGeoJSON}
            style={distStyle}
            onEachFeature={onEachDist}
          />
        )}

        {/* 5b. Bangladesh mask — inverted polygon; evenodd fill rule cuts holes revealing BD */}
        {bangMaskData && (
          <GeoJSON
            key="bangladesh-mask"
            data={bangMaskData}
            style={() => ({
              fillColor:   '#f0f2f5',
              fillOpacity: 1,
              fillRule:    'evenodd',
              stroke:      false,
              weight:      0,
            })}
          />
        )}

        {/* 6. Centroid labels — read name_en / name_bn from enriched GeoJSON */}
        {divGeoJSON && level === 'national' && (
          <GeoLabelLayer
            key={`div-labels-${lang}`}
            geoJSON={divGeoJSON}
            getLabel={(f) => lang === 'bn'
              ? (f.properties.name_bn || f.properties.NAME_1)
              : (f.properties.name_en || f.properties.NAME_1)}
          />
        )}
        {filteredDistGeoJSON && level !== 'national' && (
          <GeoLabelLayer
            key={`dist-labels-${lang}`}
            geoJSON={filteredDistGeoJSON}
            getLabel={(f) => lang === 'bn'
              ? (f.properties.name_bn || f.properties.shapeName)
              : (f.properties.name_en || f.properties.shapeName)}
          />
        )}

        {/* 7. PoP markers in popPane (500) */}
        {popMarkers.map(pop => (
          <CircleMarker
            key={pop.id}
            center={[Number(pop.latitude), Number(pop.longitude)]}
            radius={pop.violations >= 6 ? 10 : pop.violations >= 3 ? 8 : pop.violations >= 1 ? 6 : 5}
            pane="popPane"
            pathOptions={{
              fillColor:   popColor(pop.violations || 0),
              fillOpacity: 0.85,
              color:       '#fff',
              weight:      1.5,
            }}
            eventHandlers={{
              click: () => onPopClick?.(pop),
            }}
          >
            <Tooltip>
              <strong>{pop.name_en}</strong><br />
              {pop.district_name} · {pop.division_name}<br />
              Violations: <b>{pop.violations || 0}</b>
              {pop.critical > 0 && <span style={{ color: '#dc2626' }}> • {pop.critical} Critical</span>}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* ── Map controls — Maximize / Reset / Tile selector ── */}
      <div style={{
        position: 'absolute', top: 10, right: 10, zIndex: 1001,
        display: 'flex', flexDirection: 'column',
        background: 'rgba(255,255,255,0.95)',
        border: '2px solid rgba(0,0,0,0.2)',
        borderRadius: 4,
        boxShadow: '0 1px 5px rgba(0,0,0,0.25)',
        overflow: 'hidden',
      }}>
        {/* Fullscreen */}
        <AntTooltip title={maximized ? 'Exit fullscreen' : 'Fullscreen map'} placement="left">
          <button
            onClick={toggleMaximize}
            style={{
              width: 30, height: 30, border: 'none', cursor: 'pointer',
              background: 'transparent', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: '#333', transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f4f4f4'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {maximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          </button>
        </AntTooltip>

        <div style={{ height: 1, background: 'rgba(0,0,0,0.2)', margin: '0 4px' }} />

        {/* Reset view */}
        <AntTooltip title="Reset to Bangladesh view" placement="left">
          <button
            onClick={() => setFitBounds(null)}
            style={{
              width: 30, height: 30, border: 'none', cursor: 'pointer',
              background: 'transparent', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 14, color: '#333', transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f4f4f4'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <ReloadOutlined />
          </button>
        </AntTooltip>

        <div style={{ height: 1, background: 'rgba(0,0,0,0.2)', margin: '0 4px' }} />

        {/* Tile selector — one button per source, active tile highlighted */}
        {[
          { key: 'carto',     label: 'CL',  title: 'Clean (No Labels)' },
          { key: 'osm',       label: 'OS',  title: 'OpenStreetMap' },
          { key: 'satellite', label: 'SAT', title: 'Satellite (Esri)' },
          { key: 'pmtiles',   label: 'PM',  title: 'Offline PMTiles' },
        ].map(({ key, label, title }, idx, arr) => (
          <React.Fragment key={key}>
            <AntTooltip title={title} placement="left">
              <button
                onClick={() => setActiveTile(key)}
                style={{
                  width: 30, height: 30, border: 'none', cursor: 'pointer',
                  background: activeTile === key ? '#e6f4ff' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700,
                  color: activeTile === key ? '#1677ff' : '#555',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = activeTile === key ? '#bae0ff' : '#f4f4f4'}
                onMouseLeave={e => e.currentTarget.style.background = activeTile === key ? '#e6f4ff' : 'transparent'}
              >
                {label}
              </button>
            </AntTooltip>
            {idx < arr.length - 1 && (
              <div style={{ height: 1, background: 'rgba(0,0,0,0.1)', margin: '0 4px' }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Colour legend */}
      <div style={{
        position: 'absolute', bottom: 30, left: 10, zIndex: 1000,
        background: 'rgba(255,255,255,0.95)', borderRadius: 6,
        padding: '8px 12px', boxShadow: '0 1px 5px rgba(0,0,0,0.2)', fontSize: 11,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 5 }}>Violations</div>
        {[
          { color: '#e5e7eb', label: 'None (0)' },
          { color: '#22c55e', label: 'Low' },
          { color: '#eab308', label: 'Moderate' },
          { color: '#dc2626', label: 'High' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <div style={{ width: 14, height: 10, background: color, border: '1px solid #ccc' }} />
            <span>{label}</span>
          </div>
        ))}
        <div style={{ marginTop: 6, borderTop: '1px solid #f0f0f0', paddingTop: 4 }}>
          <strong>PoP markers</strong>
          <div style={{ display: 'flex', gap: 6, marginTop: 3 }}>
            {Object.entries(SEV_COLORS).map(([sev, col]) => (
              <span key={sev} style={{ fontSize: 9 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: col, marginRight: 2 }} />
                {sev[0]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrillDownMap;
