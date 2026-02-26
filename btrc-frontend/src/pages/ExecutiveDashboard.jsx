/**
 * ExecutiveDashboard — E1 / E2 / E3 tabs  (skeleton)
 *
 * All data via pre-configured Metabase cards (run setup_metabase.py first).
 * Card IDs from src/config/cards.js.
 *
 * E1 Performance Scorecard   — National score KPI + ISP table
 * E2 Geographic Intelligence — Division violation choropleth map (read-only)
 * E3 Compliance Overview     — Violation type/severity/trend charts + penalty KPI
 */

import React, { useMemo } from 'react';
import {
  Tabs, Card, Row, Col, Statistic, Table, Typography,
  Spin, Alert, Tag, Badge, Space, Progress,
} from 'antd';
import { GlobalOutlined, WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import DrillDownMap from '../components/maps/DrillDownMap';
import { useMetabaseCard } from '../hooks/useMetabaseCard';
import { toGeoDiv } from '../hooks/useDrillData';
import {
  EXEC_E1_NATIONAL_SCORE, EXEC_E1_ISP_PERFORMANCE, EXEC_E1_ISP_BY_CATEGORY,
  EXEC_E2_DIV_SUMMARY,
  EXEC_E3_VIOLATION_TYPE, EXEC_E3_VIOLATION_SEV, EXEC_E3_TREND, EXEC_E3_PENALTY,
} from '../config/cards';

const { Title, Text } = Typography;
const SEV_COLOR = { CRITICAL: '#dc2626', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#22c55e' };

function NotConfigured({ name }) {
  return (
    <Alert type="warning" showIcon
      message="Card not configured"
      description={<>Run <code>python scripts/setup_metabase.py</code>. Card: <b>{name}</b></>}
    />
  );
}

// ── E1 Performance Scorecard ──────────────────────────────────────────────
function E1Tab() {
  const { rows: scoreRows, loading: sl } = useMetabaseCard(EXEC_E1_NATIONAL_SCORE);
  const { rows: ispRows,   loading: il } = useMetabaseCard(EXEC_E1_ISP_PERFORMANCE);
  const { rows: catRows,   loading: cl } = useMetabaseCard(EXEC_E1_ISP_BY_CATEGORY);

  const score      = scoreRows[0]?.national_qos_score ?? '—';
  const compliant  = ispRows.filter(r => Number(r.violations || 0) === 0).length;
  const atRisk     = ispRows.filter(r => Number(r.violations || 0) > 0 && Number(r.violations) < 5).length;
  const inViolation= ispRows.filter(r => Number(r.violations || 0) >= 5).length;

  const catOpt = useMemo(() => ({
    tooltip: { trigger: 'item' },
    series: [{ type: 'pie', radius: ['40%','70%'],
      data: catRows.map(r => ({ name: r.category, value: Number(r.isp_count || 0) })),
      label: { fontSize: 11 },
    }],
  }), [catRows]);

  const ispCols = [
    { title: 'ISP',        dataIndex: 'isp',            ellipsis: true },
    { title: 'Category',   dataIndex: 'license_category',width: 110, ellipsis: true },
    { title: 'PoPs',       dataIndex: 'pop_count',       width: 55  },
    { title: 'DL Mbps',   dataIndex: 'avg_download',     width: 75, render: v => v != null ? Number(v).toFixed(1) : '—' },
    { title: 'UL Mbps',   dataIndex: 'avg_upload',       width: 75, render: v => v != null ? Number(v).toFixed(1) : '—' },
    { title: 'Latency',   dataIndex: 'avg_latency',      width: 70, render: v => v != null ? `${Number(v).toFixed(0)} ms` : '—' },
    { title: 'Violations',dataIndex: 'violations',        width: 80,
      render: v => <Badge count={Number(v || 0)} color={Number(v) === 0 ? 'green' : Number(v) < 5 ? 'orange' : 'red'} showZero />,
      sorter: (a, b) => Number(a.violations || 0) - Number(b.violations || 0) },
    { title: 'Score', dataIndex: 'score', width: 65,
      render: v => v != null ? Number(v).toFixed(0) : '—',
      sorter: (a, b) => Number(a.score || 0) - Number(b.score || 0), defaultSortOrder: 'descend' },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small" style={{ borderLeft: '4px solid #3b82f6' }}>
            {!EXEC_E1_NATIONAL_SCORE
              ? <NotConfigured name="EXEC_E1_NATIONAL_SCORE" />
              : <Statistic title="National QoS Score" value={sl ? '…' : score}
                  suffix="/100" valueStyle={{ color: '#3b82f6' }} loading={sl} />
            }
          </Card>
        </Col>
        <Col span={6}><Card size="small" style={{ borderLeft: '4px solid #22c55e' }}>
          <Statistic title="Compliant ISPs"  value={il ? '…' : compliant}  valueStyle={{ color: '#22c55e' }} prefix={<CheckCircleOutlined />} />
        </Card></Col>
        <Col span={6}><Card size="small" style={{ borderLeft: '4px solid #f97316' }}>
          <Statistic title="At-Risk ISPs"    value={il ? '…' : atRisk}     valueStyle={{ color: '#f97316' }} prefix={<WarningOutlined />} />
        </Card></Col>
        <Col span={6}><Card size="small" style={{ borderLeft: '4px solid #dc2626' }}>
          <Statistic title="Violation ISPs"  value={il ? '…' : inViolation} valueStyle={{ color: '#dc2626' }} prefix={<WarningOutlined />} />
        </Card></Col>
      </Row>

      <Row gutter={12}>
        <Col span={16}>
          <Card title="E1 — ISP Performance Table" size="small">
            {!EXEC_E1_ISP_PERFORMANCE
              ? <NotConfigured name="EXEC_E1_ISP_PERFORMANCE" />
              : <Table
                  dataSource={ispRows.map((r, i) => ({ ...r, key: i }))}
                  columns={ispCols}
                  loading={il}
                  size="small"
                  pagination={{ pageSize: 15, showSizeChanger: true }}
                  scroll={{ x: 650, y: 400 }}
                />
            }
          </Card>
        </Col>
        <Col span={8}>
          <Card title="E1 — ISPs by License Category" size="small" style={{ marginBottom: 12 }}>
            {!EXEC_E1_ISP_BY_CATEGORY
              ? <NotConfigured name="EXEC_E1_ISP_BY_CATEGORY" />
              : <ReactECharts option={catOpt} style={{ height: 200 }} showLoading={cl} />
            }
          </Card>
          <Card title="Compliance Breakdown" size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text type="success">Compliant ({compliant})</Text>
                <Progress percent={ispRows.length ? Math.round(compliant / ispRows.length * 100) : 0} strokeColor="#22c55e" size="small" />
              </div>
              <div>
                <Text style={{ color: '#f97316' }}>At Risk ({atRisk})</Text>
                <Progress percent={ispRows.length ? Math.round(atRisk / ispRows.length * 100) : 0} strokeColor="#f97316" size="small" />
              </div>
              <div>
                <Text type="danger">Violation ({inViolation})</Text>
                <Progress percent={ispRows.length ? Math.round(inViolation / ispRows.length * 100) : 0} strokeColor="#dc2626" size="small" />
              </div>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// ── E2 Geographic Intelligence ────────────────────────────────────────────
function E2Tab() {
  const { rows: divRows, loading } = useMetabaseCard(EXEC_E2_DIV_SUMMARY);

  const divisionData = useMemo(() => {
    const d = {};
    divRows.forEach(r => {
      const k = toGeoDiv(r.division || '');
      if (k) d[k] = {
        total:    Number(r.total    || r.violations || 0),
        critical: Number(r.critical || 0),
        high:     Number(r.high     || 0),
        medium:   Number(r.medium   || 0),
        low:      Number(r.low      || 0),
      };
    });
    return d;
  }, [divRows]);

  const rankOpt = useMemo(() => ({
    tooltip: { trigger: 'axis' },
    grid: { left: 110, right: 20, top: 10, bottom: 10 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: divRows.map(r => toGeoDiv(r.division || '')).reverse() },
    series: [
      { name: 'Critical', type: 'bar', stack: 's', data: divRows.map(r => Number(r.critical || 0)).reverse(), itemStyle: { color: '#dc2626' } },
      { name: 'High',     type: 'bar', stack: 's', data: divRows.map(r => Number(r.high     || 0)).reverse(), itemStyle: { color: '#f97316' } },
      { name: 'Medium',   type: 'bar', stack: 's', data: divRows.map(r => Number(r.medium   || 0)).reverse(), itemStyle: { color: '#eab308' } },
      { name: 'Low',      type: 'bar', stack: 's', data: divRows.map(r => Number(r.low      || 0)).reverse(), itemStyle: { color: '#22c55e' } },
    ],
  }), [divRows]);

  return (
    <Row gutter={12} style={{ padding: 16 }}>
      <Col span={14}>
        <Card title="E2 — Division Violation Heatmap" size="small" bodyStyle={{ padding: 0 }}>
          {!EXEC_E2_DIV_SUMMARY
            ? <div style={{ padding: 12 }}><NotConfigured name="EXEC_E2_DIV_SUMMARY" /></div>
            : loading
            ? <div style={{ height: 440, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin tip="Loading…" /></div>
            : <DrillDownMap height="440px" divisionData={divisionData} districtData={{}} popMarkers={[]} level="national" />
          }
        </Card>
      </Col>
      <Col span={10}>
        <Card title="Division Rankings" size="small" style={{ marginBottom: 12 }}>
          <ReactECharts option={rankOpt} style={{ height: 220 }} showLoading={loading} />
        </Card>
        <Card title="Division Summary" size="small">
          <Table
            dataSource={divRows.map(r => ({ ...r, key: r.division, geoName: toGeoDiv(r.division || '') }))}
            columns={[
              { title: 'Division', dataIndex: 'geoName', ellipsis: true },
              { title: 'Violations', dataIndex: 'violations', width: 75,
                render: (v, r) => Number(v || r.total || 0) },
              { title: 'Critical', dataIndex: 'critical', width: 65,
                render: v => v > 0 ? <Text type="danger">{v}</Text> : '—' },
            ]}
            loading={loading}
            size="small" pagination={false}
          />
        </Card>
      </Col>
    </Row>
  );
}

// ── E3 Compliance Overview ────────────────────────────────────────────────
function E3Tab() {
  const { rows: typeRows,    loading: tl } = useMetabaseCard(EXEC_E3_VIOLATION_TYPE);
  const { rows: sevRows,     loading: sl } = useMetabaseCard(EXEC_E3_VIOLATION_SEV);
  const { rows: trendRows,   loading: rl } = useMetabaseCard(EXEC_E3_TREND);
  const { rows: penaltyRows, loading: pl } = useMetabaseCard(EXEC_E3_PENALTY);

  const penalty = penaltyRows[0];

  const trendDays = useMemo(() => [...new Set(trendRows.map(r => r.day))].sort(), [trendRows]);
  const trendOpt  = useMemo(() => ({
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
      itemStyle: { color: col },
    })),
  }), [trendDays, trendRows]);

  const typeOpt = useMemo(() => ({
    tooltip: { trigger: 'item' },
    series: [{ type: 'pie', radius: ['40%','70%'],
      data: typeRows.map(r => ({ name: r.violation_type, value: Number(r.cnt || 0) })),
      label: { fontSize: 10 },
    }],
  }), [typeRows]);

  const sevOpt = useMemo(() => ({
    tooltip: { trigger: 'item' },
    series: [{ type: 'pie', radius: ['40%','70%'],
      data: sevRows.map(r => ({ name: r.severity, value: Number(r.cnt || 0),
        itemStyle: { color: SEV_COLOR[r.severity] } })),
      label: { fontSize: 10 },
    }],
  }), [sevRows]);

  return (
    <div style={{ padding: 16 }}>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        {Object.entries(SEV_COLOR).map(([sev, col]) => {
          const row = sevRows.find(r => r.severity === sev);
          return (
            <Col span={6} key={sev}>
              <Card size="small" style={{ borderLeft: `4px solid ${col}` }}>
                <Statistic title={sev} value={sl ? '…' : Number(row?.cnt || 0)} valueStyle={{ color: col }} />
              </Card>
            </Col>
          );
        })}
      </Row>

      {penalty && (
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col span={12}><Card size="small" style={{ borderLeft: '4px solid #6366f1' }}>
            <Statistic title="Total Penalty Exposure (BDT)"
              value={pl ? '…' : Number(penalty.total_penalty_bdt || 0).toLocaleString()}
              valueStyle={{ color: '#6366f1' }} />
          </Card></Col>
          <Col span={12}><Card size="small" style={{ borderLeft: '4px solid #8b5cf6' }}>
            <Statistic title="Avg Penalty per Violation (BDT)"
              value={pl ? '…' : Number(penalty.avg_per_violation || 0).toLocaleString()}
              valueStyle={{ color: '#8b5cf6' }} />
          </Card></Col>
        </Row>
      )}

      <Row gutter={12}>
        <Col span={10}>
          <Card title="Violations by Type" size="small" style={{ marginBottom: 12 }}>
            {!EXEC_E3_VIOLATION_TYPE
              ? <NotConfigured name="EXEC_E3_VIOLATION_TYPE" />
              : <ReactECharts option={typeOpt} style={{ height: 200 }} showLoading={tl} />
            }
          </Card>
          <Card title="Violations by Severity" size="small">
            {!EXEC_E3_VIOLATION_SEV
              ? <NotConfigured name="EXEC_E3_VIOLATION_SEV" />
              : <ReactECharts option={sevOpt} style={{ height: 200 }} showLoading={sl} />
            }
          </Card>
        </Col>
        <Col span={14}>
          <Card title="E3 — 14-Day Violation Trend by Severity" size="small">
            {!EXEC_E3_TREND
              ? <NotConfigured name="EXEC_E3_TREND" />
              : <ReactECharts option={trendOpt} style={{ height: 440 }} showLoading={rl} />
            }
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function ExecutiveDashboard() {
  const items = [
    { key: 'e1', label: 'E1  Performance Scorecard',    children: <E1Tab /> },
    { key: 'e2', label: 'E2  Geographic Intelligence',  children: <E2Tab /> },
    { key: 'e3', label: 'E3  Compliance Overview',       children: <E3Tab /> },
  ];

  return (
    <div style={{ padding: '12px 16px' }}>
      <Title level={4} style={{ margin: '0 0 12px' }}>
        <GlobalOutlined style={{ marginRight: 8, color: '#1890ff' }} />
        Executive Dashboard
      </Title>
      <Tabs defaultActiveKey="e1" items={items} type="card" />
    </div>
  );
}
