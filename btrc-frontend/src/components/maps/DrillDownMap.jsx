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
 * Tile source (offline):
 *   VITE_TILE_URL  → Martin PMTiles server (default: OSM fallback)
 *
 * GeoJSON files served from /geodata/:
 *   /geodata/bangladesh_divisions_8.geojson  — NAME_1 property
 *   /geodata/bgd_districts.geojson           — shapeName property
 *
 * Name mappings (DB → GeoJSON):
 *   Divisions:  Chattagram→Chittagong, Rajshahi→Rajshani
 *   Districts:  9 mappings (see CLAUDE.md → Name Mappings)
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MapContainer, TileLayer, GeoJSON, CircleMarker,
  Tooltip, useMap, LayersControl,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Spin } from 'antd';

// ── Tile sources ──────────────────────────────────────────────────────────────
const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>';

// ── Bangladesh initial view ───────────────────────────────────────────────────
const BD_CENTER = [23.68, 90.35];
const BD_ZOOM   = 7;

// ── Severity colour helpers ────────────────────────────────────────────────────
const SEV_COLORS = {
  CRITICAL: '#dc2626', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#22c55e',
};

const getViolationColor = (value, max) => {
  if (!max || value === 0) return '#e5e7eb';
  const ratio = value / max;
  if (ratio > 0.75) return '#b91c1c';
  if (ratio > 0.50) return '#ef4444';
  if (ratio > 0.25) return '#f87171';
  return '#fca5a5';
};

const getDistrictColor = (value, max) => {
  if (!max || value === 0) return '#fff7ed';
  const ratio = value / max;
  if (ratio > 0.75) return '#9a3412';
  if (ratio > 0.50) return '#ea580c';
  if (ratio > 0.25) return '#fb923c';
  return '#fed7aa';
};

const popColor = (violations) =>
  violations >= 6 ? '#dc2626' : violations >= 3 ? '#f97316' : violations >= 1 ? '#eab308' : '#22c55e';

// ── FitBounds helper (internal hook) ──────────────────────────────────────────
const FitBounds = ({ bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }, [bounds, map]);
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
  const [divGeoJSON,  setDivGeoJSON]  = useState(null);
  const [distGeoJSON, setDistGeoJSON] = useState(null);
  const [fitBounds,   setFitBounds]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const divLayerRef  = useRef(null);
  const distLayerRef = useRef(null);

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

  // ── Division layer style ─────────────────────────────────────────────────
  const divStyle = (feature) => {
    const name = feature.properties.NAME_1;
    const d    = divisionData[name] || {};
    const isSelected = name === selectedDiv;
    return {
      fillColor:   getViolationColor(d.total || 0, maxDiv),
      fillOpacity: isSelected ? 0.9 : 0.65,
      color:       isSelected ? '#1e3a5f' : '#fff',
      weight:      isSelected ? 3 : 1.2,
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
      const bounds = layer.getBounds();
      setFitBounds(bounds);
    });
    layer.on('mouseover', (e) => { e.target.setStyle({ weight: 2.5, fillOpacity: 0.85 }); });
    layer.on('mouseout',  (e) => { e.target.setStyle(divStyle(feature)); });
  };

  // ── District layer (shown after drilling) ────────────────────────────────
  // Filter: only show districts in selected division (by shapeName in districtData)
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
      fillOpacity: isSelected ? 0.9 : 0.65,
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
      const bounds = layer.getBounds();
      setFitBounds(bounds);
    });
    layer.on('mouseover', (e) => { e.target.setStyle({ weight: 2.5, fillOpacity: 0.88 }); });
    layer.on('mouseout',  (e) => { e.target.setStyle(distStyle(feature)); });
  };

  // ── Key props to force GeoJSON re-render when data changes ───────────────
  const divKey  = JSON.stringify(divisionData)  + selectedDiv;
  const distKey = JSON.stringify(districtData) + selectedDist;

  if (loading) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <Spin size="large" tip="Loading map…" />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height }}>
      <MapContainer
        center={BD_CENTER} zoom={BD_ZOOM}
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
      >
        <LayersControl position="topright">
          {/* OSM always shown by default — shows roads, buildings, labels */}
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={TILE_ATTR} />
          </LayersControl.BaseLayer>

          {/* Offline PMTiles via Martin — only available if bangladesh.pmtiles is downloaded */}
          {import.meta.env.VITE_TILE_URL && (
            <LayersControl.BaseLayer name="Offline (PMTiles)">
              <TileLayer
                url={TILE_URL}
                attribution="&copy; OpenStreetMap (offline)"
                maxZoom={18}
              />
            </LayersControl.BaseLayer>
          )}

          {/* ESRI Satellite */}
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="&copy; Esri"
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {/* Fit to selected area */}
        {fitBounds && <FitBounds bounds={fitBounds} />}

        {/* ── Division choropleth (national level) ── */}
        {divGeoJSON && level === 'national' && (
          <GeoJSON
            key={divKey}
            ref={divLayerRef}
            data={divGeoJSON}
            style={divStyle}
            onEachFeature={onEachDiv}
          />
        )}

        {/* ── District choropleth (division/district level) ── */}
        {filteredDistGeoJSON && level !== 'national' && (
          <GeoJSON
            key={distKey}
            ref={distLayerRef}
            data={filteredDistGeoJSON}
            style={distStyle}
            onEachFeature={onEachDist}
          />
        )}

        {/* ── POP / Node markers ── */}
        {popMarkers.map(pop => (
          <CircleMarker
            key={pop.id}
            center={[Number(pop.latitude), Number(pop.longitude)]}
            radius={pop.violations >= 6 ? 10 : pop.violations >= 3 ? 8 : pop.violations >= 1 ? 6 : 5}
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

      {/* Colour legend */}
      <div style={{
        position: 'absolute', bottom: 30, left: 10, zIndex: 1000,
        background: 'rgba(255,255,255,0.95)', borderRadius: 6,
        padding: '8px 12px', boxShadow: '0 1px 5px rgba(0,0,0,0.2)', fontSize: 11,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 5 }}>Violations</div>
        {[
          { color: '#e5e7eb', label: '0' },
          { color: '#fca5a5', label: 'Low' },
          { color: '#f87171', label: 'Medium' },
          { color: '#ef4444', label: 'High' },
          { color: '#b91c1c', label: 'Critical' },
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
