'use client'

interface Props {
  elapsed: number
  label?: string
}

export function CubeLoader({ elapsed, label: labelProp }: Props) {
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const timeLabel = mins > 0
    ? `${mins}:${String(secs).padStart(2, '0')}`
    : `${secs}s`

  const label = labelProp ?? (elapsed < 60 ? 'Thinking...' : 'Building your project...')

  return (
    <div className="flex flex-col items-center justify-center gap-20">
      {/* 3D Cube */}
      <div className="relative w-24 h-24 flex items-center justify-center cube-preserve-3d">
        <div className="relative w-full h-full cube-preserve-3d cube-spin">
          {/* Core */}
          <div className="absolute inset-0 m-auto w-8 h-8 bg-white rounded-full blur-md shadow-[0_0_40px_rgba(255,255,255,0.8)] cube-pulse" />

          <div className="cube-side-wrapper cube-front">
            <div className="cube-face bg-cyan-500/10 border-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)]" />
          </div>
          <div className="cube-side-wrapper cube-back">
            <div className="cube-face bg-cyan-500/10 border-2 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)]" />
          </div>
          <div className="cube-side-wrapper cube-right">
            <div className="cube-face bg-purple-500/10 border-2 border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]" />
          </div>
          <div className="cube-side-wrapper cube-left">
            <div className="cube-face bg-purple-500/10 border-2 border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]" />
          </div>
          <div className="cube-side-wrapper cube-top">
            <div className="cube-face bg-indigo-500/10 border-2 border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.4)]" />
          </div>
          <div className="cube-side-wrapper cube-bottom">
            <div className="cube-face bg-indigo-500/10 border-2 border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.4)]" />
          </div>
        </div>

        {/* Floor shadow */}
        <div className="absolute -bottom-20 w-24 h-8 bg-black/40 blur-xl rounded-[100%] cube-shadow-breathe" />
      </div>

      {/* Text */}
      <div className="flex flex-col items-center gap-1">
        <h3 className="text-sm font-semibold tracking-[0.3em] text-cyan-600 uppercase">
          {label}
        </h3>
        <p className="text-xs text-slate-500 tabular-nums">{timeLabel}</p>
      </div>

      <style>{`
        .cube-preserve-3d {
          transform-style: preserve-3d;
        }
        @keyframes cubeSpin {
          0%   { transform: rotateX(0deg)   rotateY(0deg); }
          100% { transform: rotateX(360deg) rotateY(360deg); }
        }
        @keyframes cubeBreathe {
          0%, 100% { transform: translateZ(48px); opacity: 0.8; }
          50%       { transform: translateZ(80px); opacity: 0.4; border-color: rgba(255,255,255,0.8); }
        }
        @keyframes cubePulse {
          0%, 100% { transform: scale(0.8); opacity: 0.5; }
          50%       { transform: scale(1.2); opacity: 1; }
        }
        @keyframes cubeShadow {
          0%, 100% { transform: scale(1);   opacity: 0.4; }
          50%       { transform: scale(1.5); opacity: 0.2; }
        }
        .cube-spin           { animation: cubeSpin    8s linear      infinite; }
        .cube-pulse          { animation: cubePulse   2s ease-in-out infinite; }
        .cube-shadow-breathe { animation: cubeShadow  3s ease-in-out infinite; }
        .cube-side-wrapper {
          position: absolute; width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          transform-style: preserve-3d;
        }
        .cube-face {
          width: 100%; height: 100%; position: absolute;
          animation: cubeBreathe 3s ease-in-out infinite;
          backdrop-filter: blur(2px);
        }
        .cube-front  { transform: rotateY(0deg); }
        .cube-back   { transform: rotateY(180deg); }
        .cube-right  { transform: rotateY(90deg); }
        .cube-left   { transform: rotateY(-90deg); }
        .cube-top    { transform: rotateX(90deg); }
        .cube-bottom { transform: rotateX(-90deg); }
      `}</style>
    </div>
  )
}
