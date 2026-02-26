import React, { useState } from 'react';
import { Layout, Menu, Button, Avatar, Dropdown, Space, Tag } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  BarChartOutlined, GlobalOutlined, DatabaseOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
  LogoutOutlined, UserOutlined,
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../i18n';

const { Sider, Header, Content } = Layout;

const NAV = [
  { key: '/executive',   icon: <BarChartOutlined />,   label: 'Executive Dashboard'   },
  { key: '/regulatory',  icon: <GlobalOutlined />,      label: 'Regulatory Dashboard'  },
  { key: '/operational', icon: <DatabaseOutlined />,    label: 'Operational Data'       },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout, roleLabel, roleColor } = useAuth();
  const { t, toggleLang } = useTranslation();
  const navigate  = useNavigate();
  const location  = useLocation();

  const userMenu = {
    items: [
      { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true },
    ],
    onClick: ({ key }) => key === 'logout' && logout(),
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null} collapsible collapsed={collapsed}
        width={240} collapsedWidth={72}
        style={{ background: '#001529' }}
      >
        {/* Logo */}
        <div style={{
          height: 64, display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? 0 : '0 20px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <GlobalOutlined style={{ fontSize: 22, color: '#1890ff' }} />
          {!collapsed && (
            <div style={{ marginLeft: 10 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>BTRC QoS</div>
              <div style={{ color: '#6b7280', fontSize: 10 }}>v4 · React-Leaflet</div>
            </div>
          )}
        </div>

        <Menu
          theme="dark" mode="inline"
          selectedKeys={[location.pathname]}
          items={NAV}
          onClick={({ key }) => navigate(key)}
          style={{ marginTop: 8, border: 'none' }}
        />
      </Sider>

      <Layout>
        <Header style={{
          background: '#fff', padding: '0 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0', height: 56,
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(c => !c)}
          />
          <Space>
            {/* Language toggle button */}
            <Button
              size="small"
              onClick={toggleLang}
              style={{ fontSize: 12, fontWeight: 600, minWidth: 36 }}
              title="Toggle language / ভাষা পরিবর্তন"
            >
              {t('lang.toggle')}
            </Button>

            <Dropdown menu={userMenu} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar icon={<UserOutlined />} size="small" style={{ background: roleColor || '#1890ff' }} />
                <span style={{ fontSize: 13 }}>{user?.name}</span>
                {roleLabel && (
                  <Tag
                    color={roleColor}
                    style={{ fontSize: 10, padding: '0 5px', lineHeight: '18px', margin: 0 }}
                  >
                    {roleLabel}
                  </Tag>
                )}
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ background: '#f0f2f5', overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
