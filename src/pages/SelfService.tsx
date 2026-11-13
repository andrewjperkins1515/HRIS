import { PageHeader } from '../components/ui';

export default function SelfServicePage({ tab }: { tab: 'home' | 'schedule' | 'time' | 'requests' }) {
  return <PageHeader title={`Self-service: ${tab}`} description="Under construction." />;
}
