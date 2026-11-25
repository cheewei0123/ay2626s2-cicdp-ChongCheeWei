import { formatCents } from '../bills/money';
import type { Bill } from '../bills/types';
import { plainButton } from './Page';

// The menu a long press (or the hidden "More" button) opens on a bill in My bills
// (KAN-101): the same actions as swiping, for anyone who can't or doesn't swipe
export function BillActions(props: {
  bill: Bill;
  onPin: () => void;
  onShare: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { bill, onClose } = props;
  const open = bill.status === 'OPEN';
  const pick = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <div
      role="dialog"
      aria-label={`${bill.title} actions`}
      className="fixed inset-0 z-10 flex items-end bg-black/60"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className="rise mx-auto flex w-full max-w-sm flex-col gap-2 rounded-t-[32px] border border-line bg-bg p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="truncate text-xl font-semibold tracking-tight">
          {bill.title}
        </h2>
        <p className="mb-2 text-sm text-muted">
          {formatCents(bill.totals.totalCents)}
        </p>
        <button
          type="button"
          autoFocus
          onClick={pick(props.onPin)}
          className={plainButton}
        >
          {bill.pinnedAt ? 'Unpin' : 'Pin to top'}
        </button>
        <button
          type="button"
          onClick={pick(props.onShare)}
          className={plainButton}
        >
          Share
        </button>
        {/* A locked bill may already be paid, so the API keeps it (409) */}
        {open ? (
          <button
            type="button"
            onClick={pick(props.onDelete)}
            className={plainButton.replace('text-ink', 'text-danger')}
          >
            Delete
          </button>
        ) : (
          <p className="px-2 text-sm text-muted">
            A locked bill can't be deleted: friends may have paid already.
            Unlock it from its summary first.
          </p>
        )}
        <button type="button" onClick={onClose} className={plainButton}>
          Cancel
        </button>
      </div>
    </div>
  );
}
