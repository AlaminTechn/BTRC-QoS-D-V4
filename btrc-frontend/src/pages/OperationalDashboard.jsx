/**
 * OperationalDashboard — placeholder
 * TODO: implement O1/O2/O3 tabs after Regulatory + Executive are complete
 */
import React from 'react';
import { Result, Button } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';

export default function OperationalDashboard() {
  return (
    <div style={{ padding: 40 }}>
      <Result
        icon={<DatabaseOutlined style={{ color: '#1890ff' }} />}
        title="Operational Dashboard"
        subTitle="O1 Market Overview · O2 Package & Subscriber · O3 Geographic Coverage — coming soon"
        extra={<Button type="primary" disabled>Under Development</Button>}
      />
    </div>
  );
}
