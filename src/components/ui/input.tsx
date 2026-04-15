import * as React from 'react'
import { cn } from '../../lib/utils'

type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export function Input({ className, type = 'text', ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        'w-full rounded-2xl border border-slate-700/90 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 shadow-sm shadow-slate-950/20 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 disabled:cursor-not-allowed disabled:bg-slate-900',
        className,
      )}
      {...props}
    />
  )
}
