// UI primitives copied from the main RehabSync repo (packages/ui/src) so the internal tools
// match the platform exactly. Deliberate copy — the repos are decoupled; sync from the platform.
import React from 'react';

// ── Button ───────────────────────────────────────────────────────────────────

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  children,
  disabled,
  className,
  style,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 cursor-pointer';

  const sizes: Record<'sm' | 'md' | 'lg', string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  const variantStyles: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
    primary: { backgroundColor: 'var(--brand-primary)', color: '#ffffff' },
    secondary: {
      backgroundColor: 'transparent',
      border: '1px solid var(--border-primary)',
      color: 'var(--text-primary)',
    },
    ghost: { backgroundColor: 'transparent', color: 'var(--text-primary)' },
    danger: { backgroundColor: 'var(--color-error)', color: '#ffffff' },
  };

  return (
    <button
      {...props}
      disabled={disabled ?? loading}
      style={{ ...variantStyles[variant], ...style }}
      className={`${base} ${sizes[size]} ${disabled ?? loading ? 'opacity-60 cursor-not-allowed' : ''} ${className ?? ''}`}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

export interface CardProps {
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, description, footer, children, className }: CardProps) {
  return (
    <div
      className={`rounded-xl border ${className ?? ''}`}
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-primary)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {(title ?? description) && (
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-secondary)' }}>
          {title && (
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h3>
          )}
          {description && (
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {description}
            </p>
          )}
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
      {footer && (
        <div
          className="px-6 py-4 border-t rounded-b-xl"
          style={{ borderColor: 'var(--border-secondary)', backgroundColor: 'var(--bg-secondary)' }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const badgeStyles: Record<BadgeVariant, React.CSSProperties> = {
  success: { backgroundColor: 'var(--color-success-bg)', color: 'var(--color-success-text)' },
  warning: { backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
  error: { backgroundColor: 'var(--color-error-bg)', color: 'var(--color-error-text)' },
  info: { backgroundColor: 'var(--color-info-bg)', color: 'var(--color-info-text)' },
  neutral: { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' },
};

export function Badge({
  variant = 'neutral',
  children,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={badgeStyles[variant]}
    >
      {children}
    </span>
  );
}

// ── Input ────────────────────────────────────────────────────────────────────

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, id, className, style, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-sm font-medium mb-1"
          style={{ color: 'var(--text-secondary)' }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        {...props}
        className={`block w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-0 ${className ?? ''}`}
        style={{
          backgroundColor: 'var(--bg-input)',
          borderColor: error ? 'var(--color-error-text)' : 'var(--border-primary)',
          color: 'var(--text-primary)',
          ...style,
        }}
      />
      {hint && !error && (
        <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </p>
      )}
      {error && (
        <p className="mt-1 text-xs" style={{ color: 'var(--color-error-text)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ── RehabSync wordmark (from apps/web (platform)/Sidebar.tsx) ────────────────

export function RehabSyncWordmark({ color = '#0d9488', badge }: { color?: string; badge?: string }) {
  return (
    <span className="flex items-center gap-2" aria-label={`RehabSync ${badge ?? ''}`.trim()}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 9.5 13" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="12" cy="12" r="3.5" fill={color} />
      </svg>
      <span className="text-base font-bold tracking-tight" style={{ color: '#ffffff' }}>
        Rehab<span style={{ color }}>Sync</span>
      </span>
      {badge && (
        <span
          className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{ backgroundColor: `${color}26`, color }}
        >
          {badge}
        </span>
      )}
    </span>
  );
}
