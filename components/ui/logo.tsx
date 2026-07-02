import React from 'react'

interface LogoProps {
  className?: string
  size?: number
  strokeWidth?: number // included for interface compatibility with existing usages
}

// Codemine cube mark — a glowing isometric wireframe cube (blue/violet gradients).
export function Logo({ className = 'w-10 h-10', size }: LogoProps) {
  const style = size ? { width: size, height: size } : {}

  return (
    <div
      className={className}
      style={{
        ...style,
        filter:
          'drop-shadow(0 0 9px rgba(92, 138, 226, 0.9)) drop-shadow(0 0 25px rgba(92, 138, 226, 0.7))',
        transition: 'all 0.3s ease-in-out',
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 220 230"
        className="w-full h-full hover:scale-110 transition-transform duration-300"
      >
        <defs>
          <linearGradient id="cm-logo-top" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#a88bff' }} />
            <stop offset="100%" style={{ stopColor: '#74a7ff' }} />
          </linearGradient>
          <linearGradient id="cm-logo-left" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#74a7ff' }} />
            <stop offset="100%" style={{ stopColor: '#628eff' }} />
          </linearGradient>
          <linearGradient id="cm-logo-right" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#74a7ff' }} />
            <stop offset="100%" style={{ stopColor: '#5c71ff' }} />
          </linearGradient>
        </defs>

        {/* Right face */}
        <polygon
          points="110,110 210,53.5 210,166.5 110,210"
          fill="none"
          stroke="url(#cm-logo-right)"
          strokeWidth="16"
          strokeLinejoin="round"
        />
        {/* Left face */}
        <polygon
          points="10,53.5 110,110 110,210 10,166.5"
          fill="none"
          stroke="url(#cm-logo-left)"
          strokeWidth="16"
          strokeLinejoin="round"
        />
        {/* Top face */}
        <polygon
          points="110,10 210,53.5 110,110 10,53.5"
          fill="none"
          stroke="url(#cm-logo-top)"
          strokeWidth="16"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

// Backward-compatible alias.
export const CubeLogo = Logo
