import React from 'react';

export function Badge({
  children,
  variant = 'default',
  style,
}: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  style?: React.CSSProperties;
}) {
  const getColors = () => {
    switch (variant) {
      case 'danger':
        return { color: '#EF4444', borderColor: '#EF4444', bg: 'rgba(239,68,68,0.1)' };
      case 'warning':
        return { color: '#F59E0B', borderColor: '#F59E0B', bg: 'rgba(245,158,11,0.1)' };
      case 'success':
        return { color: '#10B981', borderColor: '#10B981', bg: 'rgba(16,185,129,0.1)' };
      default:
        return { color: 'var(--text-secondary)', borderColor: 'var(--border)', bg: 'transparent' };
    }
  };
  const { color, borderColor, bg } = getColors();
  return (
    <span
      style={{
        fontSize: 10,
        padding: '3px 10px',
        borderRadius: 20,
        border: `1.5px solid ${borderColor}`,
        backgroundColor: bg,
        color: color,
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
