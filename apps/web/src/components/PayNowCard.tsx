import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { formatCents, formatMobile } from '../bills/money';
import type { PersonShare, Summary } from '../bills/types';
import { smallButton } from './Page';

// What a friend sees at the top of their Summary tab: how to pay the owner back.
// The QR is made by the API for exactly their amount; scanning it in a bank app fills
// in the number, amount and reference. SplitLah itself never moves money.
export function PayNowCard(props: {
  me: PersonShare;
  paynow: NonNullable<Summary['paynow']>;
  locked: boolean;
}) {
  const { me, paynow, locked } = props;
  const [copied, setCopied] = useState('');
  const owner = paynow.name;

  async function copy(what: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(what);
  }

  const box = 'glass flex flex-col gap-4 rounded-[28px] p-5';

  if (me.totalCents === 0) return null;
  if (me.paid)
    return (
      <p className={`${box} font-medium text-ok`}>
        {owner} marked you as paid ✓
      </p>
    );
  // While the bill is open the amount can still change, so there is nothing to pay yet
  if (!locked)
    return (
      <p className={`${box} text-muted`}>
        Your PayNow QR appears here once {owner} locks the bill.
      </p>
    );
  if (!paynow.mobile || !me.paynowPayload)
    return (
      <p className={`${box} text-muted`}>
        {owner} hasn't added a PayNow number yet. Ask them how to pay{' '}
        {formatCents(me.totalCents)}.
      </p>
    );

  const amount = formatCents(me.totalCents);
  return (
    <section aria-label="Pay by PayNow" className={box}>
      <p>
        <span className="block text-sm text-muted">Pay {owner} by PayNow</span>
        <span className="text-4xl font-semibold tracking-tight">{amount}</span>
      </p>
      {/* A QR code needs dark squares on white for a camera to read it */}
      <div className="self-center rounded-[24px] bg-white p-4">
        <QRCodeSVG
          value={me.paynowPayload}
          size={200}
          title={`PayNow QR code to pay ${owner} ${amount}`}
        />
      </div>
      <p className="text-sm text-muted">
        Scan it in your bank app. On this phone? Copy the number and amount
        instead.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => copy('number', paynow.mobile!)}
          className={`${smallButton} flex-1 justify-center`}
        >
          Copy number
        </button>
        <button
          type="button"
          onClick={() => copy('amount', amount.slice(1))}
          className={`${smallButton} flex-1 justify-center`}
        >
          Copy amount
        </button>
      </div>
      {copied && (
        <p role="status" className="text-center text-sm">
          {copied === 'number'
            ? `Copied ${formatMobile(paynow.mobile)}`
            : `Copied ${amount.slice(1)}`}
        </p>
      )}
      <p className="text-sm text-muted">
        SplitLah never moves money. The QR only fills in your bank app; you
        still press Pay there.
      </p>
    </section>
  );
}
