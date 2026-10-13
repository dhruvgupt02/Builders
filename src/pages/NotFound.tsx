import { EmptyState } from '../components/ui'

export default function NotFound() {
  return <EmptyState title="Page not found" body="The page you are looking for does not exist." action={{ to: '/', label: 'Go home' }} />
}
