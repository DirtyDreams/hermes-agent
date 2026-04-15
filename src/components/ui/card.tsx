import * as React from 'react'
import { cn } from '../../lib/utils'

type CardProps = React.HTMLAttributes<HTMLDivElement>

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[2rem] border border-slate-800/80 bg-slate-950/75 p-6 shadow-card backdrop-blur-xl',
        className,
      )}
      {...props}
    />
  )
}
