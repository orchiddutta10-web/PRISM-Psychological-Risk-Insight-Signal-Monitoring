import React from 'react';

export function Card({
  children,
  style,
  className = '',
  onClick,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        padding: '24px 28px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
