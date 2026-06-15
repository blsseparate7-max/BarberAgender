
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, subtitle, headerAction, footer }) => {
  return (
    <div className={`premium-card ${className}`}>
      {(title || subtitle || headerAction) && (
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            {title && <h3 className="text-base font-semibold text-primary">{title}</h3>}
            {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className="p-6">
        {children}
      </div>
      {footer && (
        <div className="px-6 py-4 bg-zinc-50/50 border-t border-border">
          {footer}
        </div>
      )}
    </div>
  );
};
