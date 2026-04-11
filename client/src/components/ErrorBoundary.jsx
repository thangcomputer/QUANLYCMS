import React from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR BOUNDARY — Ngăn trắng trang khi component crash
// ═══════════════════════════════════════════════════════════════════════════════

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary] Component crash:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Nếu có custom fallback UI từ props → dùng nó
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({ error: this.state.error, reset: this.handleReset })
          : this.props.fallback;
      }

      // Default fallback UI
      const isInline = this.props.inline;

      if (isInline) {
        return (
          <div style={{
            background: '#1a0a0a',
            border:     '1px solid #ef444433',
            borderRadius: '10px',
            padding:    '1.5rem',
            color:      '#fca5a5',
            textAlign:  'center',
            fontSize:   '0.875rem',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
            <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Có lỗi xảy ra trong tính năng này</p>
            <p style={{ opacity: 0.7, marginBottom: '1rem', fontSize: '0.75rem' }}>
              {this.state.error?.message || 'Lỗi không xác định'}
            </p>
            <button
              onClick={this.handleReset}
              style={{
                background:   '#ef4444',
                color:        '#fff',
                border:       'none',
                borderRadius: '6px',
                padding:      '0.4rem 1rem',
                cursor:       'pointer',
                fontSize:     '0.8rem',
              }}
            >
              Thử lại
            </button>
          </div>
        );
      }

      // Full page error
      return (
        <div style={{
          minHeight:   '100vh',
          background:  '#0f172a',
          display:     'flex',
          alignItems:  'center',
          justifyContent: 'center',
          padding:     '2rem',
          fontFamily:  'Inter, system-ui, sans-serif',
        }}>
          <div style={{
            background:   '#1e293b',
            border:       '1px solid #ef444433',
            borderRadius: '16px',
            padding:      '2.5rem',
            maxWidth:     '480px',
            width:        '100%',
            textAlign:    'center',
          }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>💥</div>
            <h2 style={{ color: '#f87171', fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Ứng dụng gặp lỗi không mong muốn
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              {this.state.error?.message || 'Đã xảy ra lỗi. Vui lòng tải lại trang.'}
            </p>

            {/* Chi tiết lỗi (development only) */}
            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <pre style={{
                background:   '#0f172a',
                border:       '1px solid #334155',
                borderRadius: '8px',
                padding:      '1rem',
                fontSize:     '0.7rem',
                color:        '#94a3b8',
                textAlign:    'left',
                overflow:     'auto',
                maxHeight:    '200px',
                marginBottom: '1.5rem',
              }}>
                {this.state.errorInfo.componentStack}
              </pre>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={this.handleReset}
                style={{
                  background:   '#3b82f6',
                  color:        '#fff',
                  border:       'none',
                  borderRadius: '8px',
                  padding:      '0.6rem 1.5rem',
                  cursor:       'pointer',
                  fontWeight:   600,
                  fontSize:     '0.875rem',
                }}
              >
                Thử lại
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background:   '#1e293b',
                  color:        '#94a3b8',
                  border:       '1px solid #334155',
                  borderRadius: '8px',
                  padding:      '0.6rem 1.5rem',
                  cursor:       'pointer',
                  fontWeight:   600,
                  fontSize:     '0.875rem',
                }}
              >
                Tải lại trang
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
