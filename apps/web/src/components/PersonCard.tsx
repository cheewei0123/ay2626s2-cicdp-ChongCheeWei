import { formatCents } from '../bills/money';
import type { PersonShare } from '../bills/types';
import { Initial } from './Page';

// One person on the summary: what they had, their part of the service charge
// and GST, and their total (big), so anyone can check the split is fair
export function PersonCard(props: {
  person: PersonShare;
  name: string; // "You" on your own phone
  items: string[]; // the names of what they had
  // Owner only, once the bill is locked: tick when this person has paid them back
  onTogglePaid?: () => void;
  busy?: boolean;
}) {
  const { person } = props;
  return (
    <article
      aria-label={props.name}
      className="glass flex flex-col gap-3 rounded-[28px] p-4"
    >
      <div className="flex items-center gap-3">
        <Initial of={props.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{props.name}</span>
          <span className="text-sm text-muted">
            {person.isOwner ? 'Paid the bill' : 'Owes'}
          </span>
        </span>
        {person.paid && !props.onTogglePaid && (
          <span className="rounded-full bg-ok/15 px-3 py-1 text-sm font-medium text-ok">
            Paid
          </span>
        )}
        <span className="text-2xl font-semibold tracking-tight">
          {formatCents(person.totalCents)}
        </span>
      </div>
      <p className="text-sm text-muted">
        {props.items.length === 0 ? 'Nothing yet' : props.items.join(', ')}
      </p>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-muted">Items</dt>
          <dd>{formatCents(person.itemsCents)}</dd>
        </div>
        <div>
          <dt className="text-muted">Service</dt>
          <dd>{formatCents(person.serviceCents)}</dd>
        </div>
        <div>
          <dt className="text-muted">GST</dt>
          <dd>{formatCents(person.gstCents)}</dd>
        </div>
      </dl>
      {props.onTogglePaid && (
        <button
          type="button"
          aria-pressed={person.paid}
          aria-label={`${props.name} has paid`}
          disabled={props.busy}
          onClick={props.onTogglePaid}
          className={`flex h-11 items-center justify-center gap-2 rounded-full text-sm font-medium transition active:scale-[0.96] disabled:opacity-50 ${person.paid ? 'bg-ok/15 text-ok' : 'bg-raised'}`}
        >
          {person.paid ? 'Paid ✓' : 'Mark as paid'}
        </button>
      )}
    </article>
  );
}
