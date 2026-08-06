import React from 'react';

export function Button({
  children,
  onClick,
  style,
  variant = 'primary',
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
  variant?: 'primary' | 'ghost' | 'outline' | 'custom';
  disabled?: boolean;
}) {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '8px 16px',
    borderRadius: 8,
    border: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    fontWeight: 600,
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s',
  };

  const variantStyles = {
    primary: {
      background: 'var(--text-primary)',
      color: 'var(--accent-text)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-secondary)',
    },
    outline: {
      background: 'transparent',
      border: '1px solid var(--border)',
      color: 'var(--text-secondary)',
    },
    custom: {}
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ ...baseStyle, ...variantStyles[variant], ...style }}
    >
      {children}
    </button>
  );
}
