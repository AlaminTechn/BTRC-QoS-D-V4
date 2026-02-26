/**
 * RegulatoryDashboard — R1 / R2 / R3 tabs
 *
 * All data via pre-configured Metabase cards (run setup_metabase.py first).
 * Card IDs come from src/config/cards.js.
 *
 * R1 SLA Monitoring    — 3 KPI scalars + ISP SLA table
 * R2 Regional Drill-Down — DrillDownMap (National→Division→District) + ISP table
 * R3 Violation Analysis  — 3 scalars + trend chart + geo table + detail table
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  Tabs, Card, Row, Col, Statistic, Table, Typography,
  Spin, Alert, Tag, Button, Space, Breadcrumb, Badge, Select,
} from 'antd';
import {
  GlobalOutlined, WarningOutlined, CheckCircleOutlined,
  ArrowLeftOutlined, HomeOutlined, ReloadOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import DrillDownMap from '../components/maps/DrillDownMap';
import { useDrillData, toGeoDiv } from '../hooks/useDrillData';
import { useMetabaseCard } from '../hooks/useMetabaseCard';
import { useAuth } from '../contexts/AuthContext';
import { useFilteredCard } from '../hooks/useFilteredCard';
import FilterBar from '../components/layout/FilterBar';
import {
  REG_R1_COMPLIANT, REG_R1_AT_RISK, REG_R1_VIOLATION, REG_R1_ISP_SLA_TABLE,
  REG_R3_PENDING, REG_R3_DISPUTED, REG_R3_RESOLVED,
  REG_R3_DETAIL, REG_R3_TREND, REG_R3_GEO,
} from '../config/cards';

const { Title, Text } = Typography;

const SEV_COLOR  = { CRITICAL: '#dc2626', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#22c55e' };
const SEV_TAG    = { CRITICAL: 'red',     HIGH: 'orange',  MEDIUM: 'gold',    LOW: 'green'   };
const STATUS_TAG = {
  DETECTED: 'red', ACKNOWLEDGED: 'volcano',
  DISPUTED: 'orange', WAIVED: 'default', RESOLVED: 'green',
};

// ── Shared skeleton for unconfigured cards ─────────────────────────────────
function NotConfigured({ name }) {
  return (
    <Alert
      type="warning" showIcon
      message="Card not configured"
      description={<>Run <code>python scripts/setup_metabase.py</code> to create Metabase cards. Card: <b>{name}</b></>}
    />
  );
}

// ── KPI scalar card ────────────────────────────────────────────────────────
function KpiCard({ cardId, title, color, icon }) {
  const { rows, loading, error } = useMetabaseCard(cardId);
  const value = loading ? '…' : error ? '!' : (Object.values(rows[0] || {})[0] ?? '—');
  return (
    <Card size="small" style={{ borderLeft: `4px solid ${color}`, height: '100%' }}>
      {!cardId
        ? <NotConfigured name={title} />
        : <Statistic title={title} value={value} valueStyle={{ color }} prefix={icon} loading={loading} />
      }
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// R1 — SLA Monitoring
// ══════════════════════════════════════════════════════════════════════════════
function R1Tab() {
  const { rows: slaRows, loading, error } = useMetabaseCard(REG_R1_ISP_SLA_TABLE);

  const ispCols = [
    { title: 'ISP',              dataIndex: 'isp',             ellipsis: true, width: 160 },
    { title: 'Category',         dataIndex: 'license_category',ellipsis: true, width: 110 },
    { title: 'PoPs',             dataIndex: 'pop_count',       width: 55 },
    { title: 'Violations',       dataIndex: 'violations',      width: 80,
      render: v => <Badge count={Number(v || 0)} color={Number(v) === 0 ? 'green' : Number(v) < 5 ? 'orange' : 'red'} showZero /> },
    { title: 'Critical',         dataIndex: 'critical',        width: 70,
      render: v => Number(v) > 0 ? <Text type="danger">{v}</Text> : '—' },
    { title: 'Score',            dataIndex: 'compliance_score',width: 65,
      render: v => v != null ? Number(v).toFixed(0) : '—',
      sorter: (a, b) => Number(a.compliance_score || 0) - Number(b.compliance_score || 0) },
    { title: 'First Violation',  dataIndex: 'first_violation', width: 110,
      render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { title: 'Status',           dataIndex: 'status',          width: 100,
      filters: [
        { text: 'COMPLIANT', value: 'COMPLIANT' },
        { text: 'AT_RISK',   value: 'AT_RISK'   },
        { text: 'VIOLATION', value: 'VIOLATION' },
      ],
      onFilter: (val, r) => r.status === val,
      render: v => (
        <Tag color={v === 'COMPLIANT' ? 'green' : v === 'AT_RISK' ? 'orange' : 'red'}>
          {v || '—'}
        </Tag>
      ),
    },
  ];

  return (
    <div style={{ padding: 16 }}>
      {/* KPI row */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <KpiCard cardId={REG_R1_COMPLIANT} title="Compliant ISPs"  color="#22c55e" icon={<CheckCircleOutlined />} />
        </Col>
        <Col span={8}>
          <KpiCard cardId={REG_R1_AT_RISK}   title="At-Risk ISPs"   color="#f97316" icon={<WarningOutlined />} />
        </Col>
        <Col span={8}>
          <KpiCard cardId={REG_R1_VIOLATION} title="Violation ISPs" color="#dc2626" icon={<WarningOutlined />} />
        </Col>
      </Row>

      {/* ISP SLA table */}
      <Card title="R1 — ISP SLA Status Table" size="small">
        {!REG_R1_ISP_SLA_TABLE
          ? <NotConfigured name="REG_R1_ISP_SLA_TABLE" />
          : error
          ? <Alert type="error" message={error} showIcon />
          : (
            <Table
              dataSource={slaRows.map((r, i) => ({ ...r, key: i }))}
              columns={ispCols}
              size="small"
              loading={loading}
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} ISPs` }}
              scroll={{ x: 750, y: 420 }}
            />
          )
        }
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// R2 — Regional Drill-Down
// ══════════════════════════════════════════════════════════════════════════════
function R2Tab() {
  const {
    divisionData, districtData, popMarkers, ispData,
    level, selectedDiv, selectedDist,
    loading, error,
    drillToDiv, drillToDist, drillUp, resetDrill,
  } = useDrillData();

  const { user, role } = useAuth();

  // Auto-drill to assigned division for regional_officer role (once data is ready)
  useEffect(() => {
    if (
      role === 'regional_officer' &&
      user?.division &&
      level === 'national' &&
      !loading
    ) {
      drillToDiv(toGeoDiv(user.division));
    }
  }, [user?.id, role, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const ispCols = [
    { title: 'ISP',        dataIndex: 'isp',              ellipsis: true },
    { title: 'Division',   dataIndex: 'division',         width: 90,  ellipsis: true },
    ...(level !== 'national' ? [{ title: 'District', dataIndex: 'district', width: 90, ellipsis: true }] : []),
    { title: 'Category',   dataIndex: 'license_category', width: 100, ellipsis: true },
    { title: 'PoPs',       dataIndex: 'pop_count',        width: 55  },
    { title: 'DL Mbps',    dataIndex: 'avg_download_mbps',width: 75,
      render: v => v != null ? Number(v).toFixed(1) : '—' },
    { title: 'UL Mbps',    dataIndex: 'avg_upload_mbps',  width: 75,
      render: v => v != null ? Number(v).toFixed(1) : '—' },
    { title: 'Latency',    dataIndex: 'avg_latency_ms',   width: 75,
      render: v => v != null ? `${Number(v).toFixed(0)} ms` : '—' },
    { title: 'Violations', dataIndex: 'violations',       width: 80,
      render: v => (
        <Badge count={Number(v || 0)} color={Number(v) === 0 ? 'green' : Number(v) < 3 ? 'orange' : 'red'} showZero />
      ) },
  ];

  const breadcrumbItems = [
    {
      title: (
        <span onClick={resetDrill} style={{ cursor: 'pointer', color: '#1890ff' }}>
          <HomeOutlined /> National
        </span>
      ),
    },
    ...(selectedDiv ? [{
      title: (
        <span
          onClick={level === 'district' ? drillUp : undefined}
          style={{ cursor: level === 'district' ? 'pointer' : 'default', color: level === 'district' ? '#1890ff' : undefined }}
        >
          {selectedDiv}
        </span>
      ),
    }] : []),
    ...(selectedDist ? [{ title: selectedDist }] : []),
  ];

  const levelHint = {
    national: 'Click a division to drill down',
    division: `Showing districts in ${selectedDiv || ''} — click to drill further`,
    district: `Showing PoPs in ${selectedDist || ''}, ${selectedDiv || ''}`,
  }[level];

  return (
    <div style={{ padding: 16 }}>
      {/* Navigation bar */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row justify="space-between" align="middle">
          <Space>
            {level !== 'national' && (
              <Button size="small" icon={<ArrowLeftOutlined />} onClick={drillUp}>Back</Button>
            )}
            <Breadcrumb items={breadcrumbItems} />
          </Space>
          <Space>
            <Text type="secondary" style={{ fontSize: 11 }}>{levelHint}</Text>
            {level !== 'national' && (
              <Button size="small" onClick={resetDrill}>Reset</Button>
            )}
          </Space>
        </Row>
      </Card>

      {error && <Alert type="error" message={error} style={{ marginBottom: 12 }} showIcon />}

      <Row gutter={12}>
        {/* Map */}
        <Col span={15}>
          <Card
            title="R2 — Regional Drill-Down Map"
            size="small"
            bodyStyle={{ padding: 0 }}
          >
            {loading ? (
              <div style={{ height: 480, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spin size="large" tip="Fetching map data…" />
              </div>
            ) : (
              <DrillDownMap
                height="480px"
                divisionData={divisionData}
                districtData={districtData}
                popMarkers={popMarkers}
                level={level}
                selectedDiv={selectedDiv}
                selectedDist={selectedDist}
                onDivClick={drillToDiv}
                onDistClick={drillToDist}
              />
            )}
          </Card>
        </Col>

        {/* Side panel */}
        <Col span={9}>
          {/* Division table — national level */}
          {level === 'national' && (
            <Card title="R2.1 — Division Performance" size="small">
              <Table
                dataSource={
                  Object.entries(divisionData)
                    .map(([name, d]) => ({ key: name, name, ...d }))
                    .sort((a, b) => b.total - a.total)
                }
                loading={loading}
                columns={[
                  { title: 'Division', dataIndex: 'name',
                    render: v => <Button type="link" size="small" onClick={() => drillToDiv(v)}>{v}</Button> },
                  { title: 'Total', dataIndex: 'total', width: 55,
                    sorter: (a, b) => a.total - b.total, defaultSortOrder: 'descend' },
                  { title: 'Critical', dataIndex: 'critical', width: 65,
                    render: v => v > 0 ? <Text type="danger">{v}</Text> : '—' },
                  { title: 'High', dataIndex: 'high', width: 50,
                    render: v => v > 0 ? <Text style={{ color: '#f97316' }}>{v}</Text> : '—' },
                ]}
                size="small" pagination={false} rowKey="name"
              />
            </Card>
          )}

          {/* District table — division level */}
          {level === 'division' && (
            <Card title={`Districts — ${selectedDiv}`} size="small" style={{ marginBottom: 10 }}>
              <Table
                dataSource={
                  Object.entries(districtData)
                    .map(([name, d]) => ({ key: name, name, ...d }))
                    .sort((a, b) => b.total - a.total)
                }
                loading={loading}
                columns={[
                  { title: 'District', dataIndex: 'name',
                    render: v => <Button type="link" size="small" onClick={() => drillToDist(v)}>{v}</Button> },
                  { title: 'Total',    dataIndex: 'total',    width: 55 },
                  { title: 'Critical', dataIndex: 'critical', width: 65,
                    render: v => v > 0 ? <Text type="danger">{v}</Text> : '—' },
                ]}
                size="small" scroll={{ y: 190 }} pagination={false}
              />
            </Card>
          )}

          {/* ISP table — division / district level */}
          {level !== 'national' && (
            <Card
              title={`R2.3 — ISP Performance: ${selectedDist || selectedDiv}`}
              size="small"
            >
              <Table
                dataSource={ispData.map((r, i) => ({ ...r, key: i }))}
                columns={ispCols}
                loading={loading}
                size="small"
                scroll={{ x: 500, y: level === 'division' ? 200 : 380 }}
                pagination={{ pageSize: 10, size: 'small' }}
              />
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// R3 — Violation Analysis
// ══════════════════════════════════════════════════════════════════════════════
function R3Tab() {
  // Card-level overrides (severity + status only — division comes from global FilterBar)
  const [detailSev,    setDetailSev]    = useState(undefined);
  const [detailStatus, setDetailStatus] = useState(undefined);

  const detailCardParams = useMemo(() => {
    const p = {};
    if (detailSev)    p.severity = detailSev;
    if (detailStatus) p.status   = detailStatus;
    return p;
  }, [detailSev, detailStatus]);

  // Trend: no global time filter — always shows rolling 14-day window
  const { rows: trendRows,  loading: tl } = useMetabaseCard(REG_R3_TREND);
  // Geo + Detail: merge global filters (division, start_date, end_date) + card-level overrides
  const { rows: geoRows,    loading: gl } = useFilteredCard(REG_R3_GEO,    {},              ['division', 'start_date', 'end_date']);
  const { rows: detailRows, loading: dl } = useFilteredCard(REG_R3_DETAIL, detailCardParams, ['division', 'district', 'isp', 'start_date', 'end_date']);

  const trendDays = useMemo(() =>
    [...new Set(trendRows.map(r => r.day))].sort(), [trendRows]);

  const trendOpt = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    legend: { data: Object.keys(SEV_COLOR), top: 0 },
    grid:   { left: 40, right: 20, top: 36, bottom: 60 },
    xAxis:  { type: 'category', data: trendDays, axisLabel: { rotate: 30, fontSize: 9 } },
    yAxis:  { type: 'value', minInterval: 1 },
    series: Object.entries(SEV_COLOR).map(([sev, col]) => ({
      name: sev, type: 'line', smooth: true,
      data: trendDays.map(day => {
        const r = trendRows.find(t => t.day === day && t.severity === sev);
        return Number(r?.cnt || 0);
      }),
      itemStyle: { color: col }, lineStyle: { color: col },
    })),
  }), [trendDays, trendRows]);

  const detailCols = [
    { title: 'ID',         dataIndex: 'id',             width: 50 },
    { title: 'ISP',        dataIndex: 'isp',            ellipsis: true, width: 130 },
    { title: 'Type',       dataIndex: 'violation_type', ellipsis: true, width: 130 },
    { title: 'Severity',   dataIndex: 'severity',       width: 80,
      render: v => v ? <Tag color={SEV_TAG[v]}>{v}</Tag> : '—',
      filters: Object.keys(SEV_TAG).map(s => ({ text: s, value: s })),
      onFilter: (val, r) => r.severity === val },
    { title: 'Status',     dataIndex: 'status',         width: 85,
      render: v => v ? <Tag color={STATUS_TAG[v]}>{v}</Tag> : '—',
      filters: ['DETECTED','ACKNOWLEDGED','DISPUTED','WAIVED','RESOLVED'].map(s => ({ text: s, value: s })),
      onFilter: (val, r) => r.status === val },
    { title: 'Division',   dataIndex: 'division',       width: 90,  ellipsis: true },
    { title: 'District',   dataIndex: 'district',       width: 90,  ellipsis: true },
    { title: 'Detected',   dataIndex: 'detection_time', width: 105,
      render: v => v ? new Date(v).toLocaleDateString() : '—',
      sorter: (a, b) => new Date(a.detection_time) - new Date(b.detection_time),
      defaultSortOrder: 'descend' },
    { title: 'Deviation%', dataIndex: 'deviation_pct',  width: 85,
      render: v => v != null ? `${Number(v).toFixed(1)}%` : '—' },
    { title: 'Penalty (BDT)', dataIndex: 'penalty_amount_bdt', width: 110,
      render: v => v != null ? Number(v).toLocaleString() : '—' },
  ];

  const geoCols = [
    { title: 'Division', dataIndex: 'division', ellipsis: true },
    { title: 'District', dataIndex: 'district', ellipsis: true },
    { title: 'Total',    dataIndex: 'total',    width: 55,
      sorter: (a, b) => Number(a.total) - Number(b.total), defaultSortOrder: 'descend' },
    { title: 'Crit',     dataIndex: 'critical', width: 48,
      render: v => v > 0 ? <Text type="danger">{v}</Text> : '—' },
    { title: 'High',     dataIndex: 'high',     width: 48,
      render: v => v > 0 ? <Text style={{ color: '#f97316' }}>{v}</Text> : '—' },
  ];

  return (
    <div style={{ padding: 16 }}>
      {/* Scalars */}
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col span={8}>
          <KpiCard cardId={REG_R3_PENDING}  title="Pending / Open Violations" color="#dc2626" />
        </Col>
        <Col span={8}>
          <KpiCard cardId={REG_R3_DISPUTED} title="Active / Disputed"         color="#f97316" />
        </Col>
        <Col span={8}>
          <KpiCard cardId={REG_R3_RESOLVED} title="Resolved Violations"       color="#22c55e" icon={<CheckCircleOutlined />} />
        </Col>
      </Row>

      {/* Trend + Geography */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={15}>
          <Card title="R3.5 — 14-Day Violation Trend by Severity" size="small">
            {!REG_R3_TREND
              ? <NotConfigured name="REG_R3_TREND" />
              : <ReactECharts option={trendOpt} style={{ height: 240 }} showLoading={tl} />
            }
          </Card>
        </Col>
        <Col span={9}>
          <Card
            title="R3.6 — Violations by Geography"
            size="small"
          >
            {!REG_R3_GEO
              ? <NotConfigured name="REG_R3_GEO" />
              : (
                <Table
                  dataSource={geoRows.slice(0, 12).map((r, i) => ({ ...r, key: i }))}
                  columns={geoCols}
                  loading={gl}
                  size="small" pagination={false} scroll={{ y: 180 }}
                />
              )
            }
          </Card>
        </Col>
      </Row>

      {/* Violation detail table */}
      <Card
        title="R3.4 — Violation Detail Table"
        size="small"
        extra={
          <Space wrap size={4}>
            <Select
              placeholder="Severity"
              allowClear size="small"
              style={{ width: 100, fontSize: 11 }}
              onChange={setDetailSev}
              options={['CRITICAL','HIGH','MEDIUM','LOW'].map(v => ({ value: v, label: v }))}
            />
            <Select
              placeholder="Status"
              allowClear size="small"
              style={{ width: 128, fontSize: 11 }}
              onChange={setDetailStatus}
              options={['DETECTED','ACKNOWLEDGED','DISPUTED','WAIVED','RESOLVED'].map(v => ({ value: v, label: v }))}
            />
          </Space>
        }
      >
        {!REG_R3_DETAIL
          ? <NotConfigured name="REG_R3_DETAIL" />
          : (
            <Table
              dataSource={detailRows.map((r, i) => ({ ...r, key: i }))}
              columns={detailCols}
              loading={dl}
              size="small"
              pagination={{ pageSize: 20, showSizeChanger: true, showTotal: t => `${t} violations` }}
              scroll={{ x: 950, y: 360 }}
            />
          )
        }
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main page
// ══════════════════════════════════════════════════════════════════════════════
export default function RegulatoryDashboard() {
  const items = [
    { key: 'r1', label: 'R1  SLA Monitoring',      children: <R1Tab /> },
    { key: 'r2', label: 'R2  Regional Drill-Down',  children: <R2Tab /> },
    { key: 'r3', label: 'R3  Violation Analysis',   children: <R3Tab /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Global filter bar — division / district / ISP / date range */}
      <FilterBar />

      <div style={{ padding: '12px 16px', flex: 1, overflow: 'auto' }}>
        <Title level={4} style={{ margin: '0 0 12px' }}>
          <GlobalOutlined style={{ marginRight: 8, color: '#1890ff' }} />
          Regulatory Dashboard
        </Title>
        <Tabs defaultActiveKey="r2" items={items} type="card" />
      </div>
    </div>
  );
}
