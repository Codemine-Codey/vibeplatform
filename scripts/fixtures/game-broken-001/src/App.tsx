import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import NotFound from './components/NotFound'
// DEFECT (failure class 2): ./pages/Game does not exist and is NOT in the manifest.
// The resolve rung (in-memory, before write) must flag this: the import resolves to
// nothing in (manifest ∪ written-files ∪ node_modules).
import Game from './pages/Game'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/game" element={<Game />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
