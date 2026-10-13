import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { ChartPanel } from '../components/ChartPanel'
import { EmptyState } from '../components/EmptyState'
import { LoadingBlock } from '../components/LoadingBlock'
import { PageHeader } from '../components/PageHeader'

export function ExperimentsPage() {
  const [manifest, setManifest] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.experimentManifest().then(setManifest).catch((e) => setError(String(e)))
  }, [])

  const downloadJson = () => {
    if (!manifest) return
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'experiment_manifest.json'
    a.click()
  }

  if (error) return <EmptyState title="Experiment manifest error" message={error} />
  if (!manifest) return <LoadingBlock />

  const cfg = (manifest.config as Record<string, unknown>) || {}

  return (
    <div className="space-y-6">
      <PageHeader
        title="Experiment & Reproducibility"
        subtitle="Target definition, temporal split, preprocessing, hyperparameters, and exported artifacts."
      />
      <div className="flex gap-2">
        <button type="button" onClick={downloadJson} className="rounded-lg bg-f1-red px-4 py-2 text-sm font-semibold text-white">
          Export manifest JSON
        </button>
      </div>

      {!cfg.available && cfg.available !== undefined ? (
        <EmptyState title="Experiment not generated" message={String(cfg.message || 'Run training pipeline.')} />
      ) : (
        <>
          <ChartPanel title="Configuration">
            <pre className="max-h-[520px] overflow-auto rounded-lg bg-black/40 p-4 text-xs text-f1-muted">{JSON.stringify(cfg, null, 2)}</pre>
          </ChartPanel>
          <ChartPanel title="Data dictionary">
            <pre className="max-h-80 overflow-auto text-xs">{JSON.stringify(manifest.dictionary, null, 2)}</pre>
          </ChartPanel>
        </>
      )}
    </div>
  )
}
