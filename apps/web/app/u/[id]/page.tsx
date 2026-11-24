// Placeholder profile page: renders the raw Summary JSON. The real UI is built separately.
import { notFound } from 'next/navigation';
import { getProfileSummary } from '@/lib/summary';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const summary = await getProfileSummary(id);
  if (!summary) notFound();
  return (
    <main>
      <h1>Tokenburn /u/{id}</h1>
      <pre>{JSON.stringify(summary, null, 2)}</pre>
    </main>
  );
}
