import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { CompoundCircuitPage } from './pages/CompoundCircuitPage'
import { DatasetExplorerPage } from './pages/DatasetExplorerPage'
import { DegradationPage } from './pages/DegradationPage'
import { ExplainabilityPage } from './pages/ExplainabilityPage'
import { ModelsPage } from './pages/ModelsPage'
import { OverviewPage } from './pages/OverviewPage'
import { PredictPage } from './pages/PredictPage'
import { ReliabilityPage } from './pages/ReliabilityPage'
import { ReplayStudioPage } from './pages/ReplayStudioPage'
import { ExperimentsPage } from './pages/ExperimentsPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="/dataset" element={<DatasetExplorerPage />} />
          <Route path="/degradation" element={<DegradationPage />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/compound-circuit" element={<CompoundCircuitPage />} />
          <Route path="/reliability" element={<ReliabilityPage />} />
          <Route path="/explainability" element={<ExplainabilityPage />} />
          <Route path="/predict" element={<PredictPage />} />
          <Route path="/replay" element={<ReplayStudioPage />} />
          <Route path="/experiments" element={<ExperimentsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
