/**
 * FilterBar — global filter toolbar for the Regulatory Dashboard.
 *
 * Filters:
 *   Division  → clear District when changed
 *   District  → dynamic list based on selected Division
 *   ISP       → searchable dropdown
 *   Date range → presets (7d / 14d / 30d / All) + Custom date-range picker
 *   Reset     → clears all filters
 *
 * All state lives in FilterContext (URL-synced).
 */

import React from 'react';
import { Row, Col, Select, Button, Space, DatePicker, Tag, Tooltip } from 'antd';
import { FilterOutlined, CloseCircleOutlined, QuestionCircleOutlined, LockOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useFilter } from '../../contexts/FilterContext';

const { RangePicker } = DatePicker;

const DIVISIONS = [
  'Dhaka', 'Chattagram', 'Rajshahi', 'Khulna',
  'Barisal', 'Sylhet', 'Rangpur', 'Mymensingh',
];

const DATE_PRESETS = [
  { label: '7d',  value: '7d'  },
  { label: '14d', value: '14d' },
  { label: '30d', value: '30d' },
  { label: 'All', value: 'all' },
];

export default function FilterBar() {
  const {
    division, district, isp, preset, startDate, endDate,
    setDivision, setDistrict, setIsp, setPreset, setStartDate, setEndDate,
    resetFilters, hasActiveFilters,
    availableDistricts, ispList, metaLoading, maxDate,
    divisionLocked, ispLocked,
  } = useFilter();

  return (
    <div style={{
      background: '#fff',
      borderBottom: '1px solid #e5e7eb',
      padding: '8px 16px',
      flexShrink: 0,
    }}>
      <Row gutter={[8, 6]} align="middle" wrap>
        {/* Label */}
        <Col flex="none">
          <Space size={4}>
            <FilterOutlined style={{ color: '#1890ff' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Filters</span>
            {maxDate && (
              <Tooltip title={`Data window ends: ${dayjs(maxDate).format('DD MMM YYYY')}`}>
                <QuestionCircleOutlined style={{ color: '#9ca3af', fontSize: 11 }} />
              </Tooltip>
            )}
          </Space>
        </Col>

        {/* Division */}
        <Col>
          <Tooltip title={divisionLocked ? 'Restricted to your assigned area' : undefined}>
            <Select
              placeholder="All Divisions"
              allowClear={!divisionLocked}
              style={{ width: 148 }}
              size="small"
              value={division || undefined}
              onChange={setDivision}
              disabled={divisionLocked}
              suffixIcon={divisionLocked ? <LockOutlined /> : undefined}
              options={DIVISIONS.map(v => ({ value: v, label: v }))}
            />
          </Tooltip>
        </Col>

        {/* District — dynamic, based on division */}
        <Col>
          <Select
            placeholder="All Districts"
            allowClear
            style={{ width: 148 }}
            size="small"
            value={district || undefined}
            onChange={setDistrict}
            disabled={!division}
            loading={metaLoading}
            options={availableDistricts.map(v => ({ value: v, label: v }))}
            showSearch
            filterOption={(input, opt) =>
              opt.label.toLowerCase().includes(input.toLowerCase())
            }
          />
        </Col>

        {/* ISP */}
        <Col>
          <Tooltip title={ispLocked ? 'Restricted to your assigned ISP' : undefined}>
            <Select
              placeholder="All ISPs"
              allowClear={!ispLocked}
              style={{ width: 180 }}
              size="small"
              value={isp || undefined}
              onChange={setIsp}
              disabled={ispLocked}
              suffixIcon={ispLocked ? <LockOutlined /> : undefined}
              loading={metaLoading}
              options={ispList.map(v => ({ value: v, label: v }))}
              showSearch
              filterOption={(input, opt) =>
                opt.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Tooltip>
        </Col>

        {/* Divider */}
        <Col flex="none">
          <span style={{ color: '#e5e7eb' }}>|</span>
        </Col>

        {/* Date presets */}
        <Col flex="none">
          <Space size={2}>
            {DATE_PRESETS.map(p => (
              <Button
                key={p.value}
                size="small"
                type={preset === p.value ? 'primary' : 'default'}
                onClick={() => setPreset(p.value)}
                style={{ fontSize: 11, padding: '0 8px', height: 24 }}
              >
                {p.label}
              </Button>
            ))}
            <Button
              size="small"
              type={preset === 'custom' ? 'primary' : 'default'}
              onClick={() => setPreset('custom')}
              style={{ fontSize: 11, padding: '0 8px', height: 24 }}
            >
              Custom
            </Button>
          </Space>
        </Col>

        {/* Custom date range picker */}
        {preset === 'custom' && (
          <Col>
            <RangePicker
              size="small"
              style={{ fontSize: 11 }}
              value={[
                startDate ? dayjs(startDate) : null,
                endDate   ? dayjs(endDate)   : null,
              ]}
              onChange={(dates) => {
                setStartDate(dates?.[0]?.startOf('day').toISOString() || null);
                setEndDate(dates?.[1]?.endOf('day').toISOString() || null);
              }}
            />
          </Col>
        )}

        {/* Active filter tags */}
        {(division || district || isp) && (
          <Col flex="none">
            <Space size={2}>
              {division && <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{division}</Tag>}
              {district && <Tag color="geekblue" style={{ fontSize: 11, margin: 0 }}>{district}</Tag>}
              {isp      && <Tag color="purple" style={{ fontSize: 11, margin: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{isp}</Tag>}
            </Space>
          </Col>
        )}

        {/* Reset */}
        {hasActiveFilters && (
          <Col flex="none" style={{ marginLeft: 'auto' }}>
            <Button
              size="small"
              icon={<CloseCircleOutlined />}
              onClick={resetFilters}
              style={{ fontSize: 11 }}
            >
              Reset
            </Button>
          </Col>
        )}
      </Row>
    </div>
  );
}
