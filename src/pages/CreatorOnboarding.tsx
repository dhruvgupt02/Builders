import { ArrowIcon, Button, PageContainer, PageHeader } from '../components/ui'

// Placeholder: creator onboarding form comes later.
export default function CreatorOnboarding() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="For creators"
        title="Join as an AI creator"
        subtitle="Showcase your AI films, animations and generative art with the tools and workflows behind them, get verified, and get discovered by brands. Creator sign-up opens soon."
      />
      <div className="mt-8 flex flex-wrap gap-3">
        <Button to="/login" icon={<ArrowIcon />}>Try the demo account</Button>
        <Button to="/creators" variant="outline">See other creators</Button>
      </div>
    </PageContainer>
  )
}
