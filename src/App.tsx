import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Creators from './pages/Creators'
import CreatorProfile from './pages/CreatorProfile'
import PortfolioViewer from './pages/PortfolioViewer'
import PortfolioForm from './pages/PortfolioForm'
import CreatorDashboard from './pages/CreatorDashboard'
import BriefEditor from './pages/BriefEditor'
import BriefsBoard from './pages/BriefsBoard'
import BrandDashboard from './pages/BrandDashboard'
import BriefView from './pages/BriefView'
import BriefMatches from './pages/BriefMatches'
import EngagementPage from './pages/EngagementPage'
import ConfirmWork from './pages/ConfirmWork'
import Trust from './pages/Trust'
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
        <Route path="/portfolio/new" element={<PortfolioForm />} />
        <Route path="/portfolio/:id/edit" element={<PortfolioForm key="edit" />} />
        <Route path="/portfolio/:id" element={<PortfolioViewer />} />
        <Route path="/dashboard/creator" element={<CreatorDashboard />} />
        <Route path="/briefs" element={<BriefsBoard />} />
        <Route path="/briefs/new" element={<BriefEditor key="new" />} />
        <Route path="/briefs/:id/edit" element={<BriefEditor key="edit" />} />
        <Route path="/dashboard/brand" element={<BrandDashboard />} />
        <Route path="/briefs/:id/matches" element={<BriefMatches />} />
        <Route path="/briefs/:id" element={<BriefView />} />
        <Route path="/engagements/:id" element={<EngagementPage />} />
        <Route path="/confirm/:token" element={<ConfirmWork />} />
        <Route path="/trust" element={<Trust />} />
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding/creator" element={<CreatorOnboarding />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
