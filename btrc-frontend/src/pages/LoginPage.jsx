import React, { useState } from 'react';
import { Form, Input, Button, Card, Alert, Typography } from 'antd';
import { UserOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const { Title, Text } = Typography;

export default function LoginPage() {
  const { login, error } = useAuth();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const onFinish = async ({ email, password }) => {
    setLoading(true);
    try {
      await login(email, password);
      navigate('/executive');
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #001529 0%, #003a70 100%)',
    }}>
      <Card style={{ width: 400, borderRadius: 12 }} bodyStyle={{ padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <GlobalOutlined style={{ fontSize: 40, color: '#1890ff', marginBottom: 8 }} />
          <Title level={3} style={{ margin: 0 }}>BTRC QoS</Title>
          <Text type="secondary">v4 · POC Dashboard</Text>
        </div>

        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} showIcon />}

        <Form layout="vertical" onFinish={onFinish}
          initialValues={{
            email:    import.meta.env.VITE_METABASE_USER || '',
            password: import.meta.env.VITE_METABASE_PASS || '',
          }}>
          <Form.Item name="email" label="Email"
            rules={[{ required: true, message: 'Enter your email' }]}>
            <Input prefix={<UserOutlined />} placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item name="password" label="Password"
            rules={[{ required: true, message: 'Enter your password' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block size="large">
            Sign In via Metabase
          </Button>
        </Form>

        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 16, fontSize: 11 }}>
          Authenticates against Metabase at {import.meta.env.VITE_METABASE_URL || 'http://localhost:3000'}
        </Text>
      </Card>
    </div>
  );
}
