import { formatCents } from '../bills/money';
import type { SharedItem, Summary } from '../bills/types';
import { SectionLabel } from './Page';
import { PersonCard } from './PersonCard';

// The breakdown everyone sees: the owner on /bills/:id/summary, and a friend
// on the Summary tab of the share link. The API does the maths; this only shows it.
export function SummaryView(props: {
  summary: Summary;
  items: SharedItem[];
  me?: string; // my participant id, so my card says "You"
}) {
  const { summary, items, me } = props;
  const owner = summary.people.find((p) => p.isOwner);
  const nameOf = (id: string, displayName: string) =>
    id === me ? 'You' : displayName;

  // Each person's item names. Nobody tapped an item? The owner pays for it.
  const itemsOf = (id: string, isOwner: boolean) =>
    items.flatMap((item) => {
      const claimers = item.claims.map((c) => c.participantId);
      if (claimers.includes(id))
        return [claimers.length > 1 ? `${item.name} (shared)` : item.name];
      if (isOwner && claimers.length === 0) return [`${item.name} (unclaimed)`];
      return [];
    });

  // The API promises this always holds; showing it is how people trust the split
  const addsUp =
    summary.people.reduce((sum, p) => sum + p.totalCents, 0) ===
    summary.totalCents;

  return (
    <>
      {summary.unclaimedCents > 0 && owner && (
        <p role="status" className="rounded-[28px] bg-warn/10 p-4 text-warn">
          {formatCents(summary.unclaimedCents)} unclaimed, assigned to{' '}
          {owner.participantId === me ? 'you' : owner.displayName}
        </p>
      )}
      <SectionLabel count={summary.people.length}>People</SectionLabel>
      <ul className="flex flex-col gap-2">
        {summary.people.map((person) => (
          <li key={person.participantId}>
            <PersonCard
              person={person}
              name={nameOf(person.participantId, person.displayName)}
              items={itemsOf(person.participantId, person.isOwner)}
            />
          </li>
        ))}
      </ul>
      <dl className="hero grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-[32px] p-6">
        <dt>Subtotal</dt>
        <dd>{formatCents(summary.subtotalCents)}</dd>
        <dt>Service charge</dt>
        <dd>{formatCents(summary.serviceCents)}</dd>
        <dt>GST</dt>
        <dd>{formatCents(summary.gstCents)}</dd>
        <dt className="mt-2 self-end text-lg font-medium">Bill total</dt>
        <dd className="mt-2 text-4xl font-semibold tracking-tight">
          {formatCents(summary.totalCents)}
        </dd>
      </dl>
      {addsUp ? (
        <p className="px-2 font-medium text-ok">
          Everyone's totals add up to {formatCents(summary.totalCents)} ✓
        </p>
      ) : (
        <p role="alert" className="rounded-[28px] bg-warn/10 p-4 text-warn">
          Everyone's totals don't add up to {formatCents(summary.totalCents)}.
          Refresh to try again.
        </p>
      )}
    </>
  );
}
