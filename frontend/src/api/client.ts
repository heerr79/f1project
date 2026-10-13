const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(detail || `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(detail || `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => get<{ status: string; dataset: boolean; models: boolean }>('/health'),
  datasetSummary: () => get<Record<string, unknown>>('/dataset/summary'),
  datasetColumns: () => get<{ columns: Array<Record<string, unknown>> }>('/dataset/columns'),
  datasetMissing: () => get<{ missing: Array<{ column: string; count: number; pct: number }> }>('/dataset/missing-values'),
  datasetQuality: () => get<Record<string, unknown>>('/dataset/quality'),
  datasetDictionary: () => get<{ dictionary: Array<Record<string, string>> }>('/dataset/dictionary'),
  datasetFilters: () => get<Record<string, (string | number)[]>>('/dataset/filters'),
  datasetLaps: (params: URLSearchParams) => get<{ total: number; rows: Record<string, unknown>[] }>(`/dataset/laps?${params}`),
  datasetExport: (params: URLSearchParams) => fetch(`${BASE}/dataset/export?${params}`).then((r) => r.text()),
  chart: (column: string) => get<{ available: boolean; bins?: Array<{ start: number; end: number; count: number }> }>(`/dataset/chart/${column}`),
  chartFiltered: (column: string, params: URLSearchParams) =>
    get<{ available: boolean; bins?: Array<{ start: number; end: number; count: number }> }>(
      `/dataset/chart-filtered/${column}?${params}`,
    ),
  degradation: (params: URLSearchParams) => get<Record<string, unknown>>(`/analysis/degradation?${params}`),
  subgroups: () => get<Record<string, unknown>>('/analysis/subgroups'),
  modelComparison: () => get<Record<string, unknown>>('/models/comparison'),
  modelSchema: () => get<Record<string, unknown>>('/models/schema'),
  predictions: (n = 2000) => get<{ predictions: Array<Record<string, number>> }>(`/models/predictions?sample=${n}`),
  compounds: () => get<{ evaluated: boolean; compounds: Array<Record<string, unknown>> }>('/analysis/compounds'),
  circuits: () => get<{ evaluated: boolean; circuits: Array<Record<string, unknown>> }>('/analysis/circuits'),
  reliabilitySummary: () => get<Record<string, unknown>>('/reliability/summary'),
  reliabilityDetails: () => get<{ rows: Array<Record<string, number | string>> }>('/reliability/details?limit=3000'),
  reliabilityBootstrap: () => get<Record<string, unknown>>('/reliability/bootstrap'),
  shap: () => get<{ available: boolean; importance: Array<{ feature: string; mean_abs_shap: number }> }>('/explainability/importance'),
  shapExplain: (rowId: number, feature?: string) =>
    get<Record<string, unknown>>(`/explainability/shap?row_id=${rowId}${feature ? `&feature=${feature}` : ''}`),
  shapSampleRows: () => get<{ available: boolean; rows: Array<Record<string, number>> }>('/explainability/sample-rows'),
  ablation: () => get<{ available: boolean; experiments: Array<Record<string, unknown>> }>('/experiments/ablation'),
  stability: () => get<{ runs: Array<Record<string, number>>; summary: Record<string, number> | null }>('/experiments/stability'),
  experimentManifest: () => get<Record<string, unknown>>('/experiments/manifest'),
  predict: (body: Record<string, unknown>) => post<Record<string, unknown>>('/predict', body),
  predictCompare: (body: Record<string, unknown>) => post<Record<string, unknown>>('/predict/compare', body),
  replaySessions: () => get<{ sessions: Array<Record<string, unknown>> }>('/replay/sessions'),
  replaySession: (year: number, race: string, session_key: number) =>
    get<Record<string, unknown>>(`/replay/session?year=${year}&race=${encodeURIComponent(race)}&session_key=${session_key}`),
}
