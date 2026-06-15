
import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    const variants = {
      primary: 'premium-button-primary',
      secondary: 'premium-button-secondary',
      ghost: 'premium-button-ghost',
      danger: 'px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium transition-all hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2',
      success: 'px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${variants[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
