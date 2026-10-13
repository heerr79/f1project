import { Activity, Menu, Radio, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api } from '../api/client'
import { LiveF1Car } from '../components/LiveF1Car'

const nav = [
  { to: '/', label: 'Research Overview', short: 'Overview' },
  { to: '/dataset', label: 'Dataset Explorer', short: 'Dataset' },
  { to: '/degradation', label: 'Tyre Degradation', short: 'Degradation' },
  { to: '/models', label: 'Model Comparison', short: 'Models' },
  { to: '/compound-circuit', label: 'Compound & Circuit', short: 'Segments' },
  { to: '/reliability', label: 'Reliability', short: 'Uncertainty' },
  { to: '/explainability', label: 'Explainability', short: 'SHAP' },
  { to: '/predict', label: 'Interactive Prediction', short: 'Predict' },
  { to: '/replay', label: 'Race Replay Studio', short: 'Replay' },
  { to: '/experiments', label: 'Experiments', short: 'Repro' },
]

export function AppLayout() {
  const [open, setOpen] = useState(false)
  const [health, setHealth] = useState<{ dataset: boolean; models: boolean } | null>(null)
  const location = useLocation()
  const showHeroCar = location.pathname === '/' || location.pathname === '/predict'

  useEffect(() => {
    api.health().then((h) => setHealth({ dataset: h.dataset, models: h.models })).catch(() => setHealth(null))
  }, [])

  return (
    <div className="min-h-screen lg:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-f1-border/80 bg-[#0a0c10]/95 backdrop-blur-xl transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="border-b border-f1-border/80 px-5 py-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-display text-[10px] uppercase tracking-[0.35em] text-f1-red">F1 Research Lab</p>
              <p className="mt-1 font-display text-base font-semibold leading-tight">Tyre Degradation ML</p>
              <p className="mt-1 text-[11px] text-f1-muted">M.Tech research platform</p>
            </div>
            <button className="rounded-lg border border-f1-border p-2 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${isActive
                  ? 'nav-active-glow bg-f1-red/10 font-medium text-f1-text'
                  : 'text-f1-muted hover:bg-f1-panel-2 hover:text-f1-text'
                }`
              }
            >
              <span className="hidden lg:inline">{item.label}</span>
              <span className="lg:hidden">{item.short}</span>
            </NavLink>
          ))}
        </nav>

        {!showHeroCar ? (
          <div className="border-t border-f1-border/80 p-4">
            <div className="panel-inner overflow-hidden p-2">
              <LiveF1Car compact />
            </div>
          </div>
        ) : null}
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-f1-border/80 bg-[#07080b]/85 backdrop-blur-xl">
          <div className="flex flex-col gap-3 px-4 py-3 md:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <button
                className="mt-0.5 rounded-lg border border-f1-border bg-f1-panel p-2 lg:hidden"
                onClick={() => setOpen(true)}
                aria-label="Open menu"
              >
                <Menu size={18} />
              </button>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-sm font-semibold tracking-tight md:text-base lg:max-w-2xl">
                    Reliability-Aware ML for F1 Tyre Degradation
                  </h1>
                  <span className="hidden rounded-full border border-f1-red/40 bg-f1-red/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-f1-red sm:inline">
                    2023 → 2024
                  </span>
                </div>
                <p className="mt-1 text-xs text-f1-muted">Real lap-level CSV · temporal hold-out evaluation</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusPill
                icon={<Radio size={12} />}
                label="Dataset"
                ok={health?.dataset}
                okText="Loaded"
                badText="Missing"
              />
              <StatusPill
                icon={<Activity size={12} />}
                label="Models"
                ok={health?.models}
                okText="Ready"
                badText="Train pipeline"
              />
            </div>
          </div>
        </header>

        <main className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
          {showHeroCar ? (
            <div className="animate-fade-up">
              <LiveF1Car />
            </div>
          ) : null}
          <div className="animate-fade-up" style={{ animationDelay: '0.05s' }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function StatusPill({
  icon,
  label,
  ok,
  okText,
  badText,
}: {
  icon: ReactNode
  label: string
  ok?: boolean
  okText: string
  badText: string
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-f1-border/80 bg-f1-panel/80 px-3 py-1.5 backdrop-blur-sm">
      <span className={ok ? 'text-emerald-400' : 'text-amber-400'}>{icon}</span>
      <span className="text-f1-muted">{label}:</span>
      <strong className={ok ? 'text-emerald-400' : 'text-amber-400'}>{ok ? okText : badText}</strong>
    </span>
  )
}
