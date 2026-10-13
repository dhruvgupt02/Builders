import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Creators from './pages/Creators'
import CreatorProfile from './pages/CreatorProfile'
import PortfolioViewer from './pages/PortfolioViewer'
import BriefNew from './pages/BriefNew'
import BriefView from './pages/BriefView'
import Login from './pages/Login'
import CreatorOnboarding from './pages/CreatorOnboarding'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/creators" element={<Creators />} />
        <Route path="/creators/:id" element={<CreatorProfile />} />
        <Route path="/portfolio/:id" element={<PortfolioViewer />} />
        <Route path="/briefs/new" element={<BriefNew />} />
        <Route path="/briefs/:id" element={<BriefView />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding/creator" element={<CreatorOnboarding />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
