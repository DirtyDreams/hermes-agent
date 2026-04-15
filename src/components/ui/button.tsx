import * as React from 'react'
import { cn } from '../../lib/utils'

type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'destructive'

type ButtonSize = 'default' | 'sm' | 'lg'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    'bg-cyan-500 text-slate-950 border border-cyan-500 shadow-glow hover:bg-cyan-400',
  secondary:
    'bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700',
  ghost: 'bg-slate-950/40 text-slate-100 hover:bg-slate-900 border border-transparent',
  destructive:
    'bg-red-600 text-white border border-red-700 hover:bg-red-500',
}

const sizeStyles: Record<ButtonSize, string> = {
  default: 'h-11 px-4 py-2 text-sm',
  sm: 'h-9 px-3 text-sm',
  lg: 'h-12 px-5 text-base',
}

export function Button({ className, variant = 'default', size = 'default', type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-2xl font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-60',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  )
}
