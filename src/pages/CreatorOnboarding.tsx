import { Link } from 'react-router-dom'
import { PageContainer } from '../components/ui'

// Placeholder: creator onboarding form comes later.
export default function CreatorOnboarding() {
  return (
    <PageContainer>
      <h1 className="text-3xl font-bold text-gray-900">Join BRIVIO as an AI creator</h1>
      <p className="mt-2 text-gray-600 max-w-2xl">
        Showcase your AI films, animations and generative art with the tools and workflows behind them,
        get verified, and get discovered by brands. Creator sign-up opens soon.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/login" className="px-5 py-2.5 rounded-lg bg-brand text-white font-medium hover:bg-brand-dark">
          Try the demo creator account
        </Link>
        <Link to="/creators" className="px-5 py-2.5 rounded-lg border border-gray-300 font-medium hover:border-brand hover:text-brand">
          See other creators
        </Link>
      </div>
    </PageContainer>
  )
}
