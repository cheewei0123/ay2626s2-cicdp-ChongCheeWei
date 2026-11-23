import { useState } from 'react';
import {
  dayLabel,
  monthGrid,
  monthLabel,
  periodLabel,
  presets,
  sgDay,
  shiftMonth,
  type Period,
} from '../expenses/dates';
import { plainButton, primaryButton } from './Page';

const MAX_DAYS = 366; // the API's limit: a year, leap years included
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const daysBetween = (from: string, to: string) =>
  (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;

// The calendar sheet (KAN-94): a quick pick, or any first and last day on a
// month calendar. Tap the first day, then the last (tap it twice for one day).
export function RangePicker(props: {
  period: Period;
  onPick: (period: Period) => void;
  onClose: () => void;
}) {
  const [today] = useState(() => sgDay(new Date()));
  const current =
    'month' in props.period
      ? null
      : { from: props.period.from, to: props.period.to };
  const [start, setStart] = useState<string | null>(current?.from ?? null);
  const [end, setEnd] = useState<string | null>(current?.to ?? null);
  const [shown, setShown] = useState(
    'month' in props.period
      ? props.period.month
      : props.period.from.slice(0, 7),
  );

  const tap = (day: string) => {
    if (!start || end || day < start) {
      setStart(day);
      setEnd(null);
    } else setEnd(day);
  };
  const days = start && end ? daysBetween(start, end) : 0;
  const tooLong = days > MAX_DAYS;
  const status = !start
    ? 'Tap the first day'
    : !end
      ? 'Now tap the last day'
      : tooLong
        ? `That's ${days} days. Pick ${MAX_DAYS} or fewer.`
        : `${periodLabel({ from: start, to: end })} · ${days} ${days === 1 ? 'day' : 'days'}`;
  const chosen = 'month' in props.period ? props.period.month : null;

  return (
    <div
      role="dialog"
      aria-label="Choose dates"
      onKeyDown={(e) => e.key === 'Escape' && props.onClose()}
      className="fixed inset-0 z-10 flex items-end bg-black/60"
    >
      <div className="rise mx-auto flex max-h-full w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-t-[32px] border border-line bg-bg p-5 pb-8">
        <h2 className="text-xl font-semibold tracking-tight">Choose dates</h2>

        <div className="grid grid-cols-2 gap-2">
          {presets(today).map((p) => {
            const on =
              'month' in p.period
                ? p.period.month === chosen
                : !chosen &&
                  p.period.from === current?.from &&
                  p.period.to === current?.to;
            return (
              <button
                key={p.label}
                type="button"
                aria-pressed={on}
                onClick={() => props.onPick(p.period)}
                className={`h-11 rounded-full border border-line text-sm font-medium ${on ? 'bg-raised text-ink' : 'bg-surface text-muted'}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="glass flex flex-col gap-2 rounded-[28px] p-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Show the month before"
              onClick={() => setShown(shiftMonth(shown, -1))}
              className="h-11 w-11 rounded-full text-xl text-muted active:scale-[0.96]"
            >
              ‹
            </button>
            <p className="font-semibold" aria-live="polite">
              {monthLabel(shown)}
            </p>
            <button
              type="button"
              aria-label="Show the month after"
              onClick={() => setShown(shiftMonth(shown, 1))}
              className="h-11 w-11 rounded-full text-xl text-muted active:scale-[0.96]"
            >
              ›
            </button>
          </div>
          <div
            aria-hidden="true"
            className="grid grid-cols-7 text-center text-xs text-muted"
          >
            {WEEKDAYS.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          {monthGrid(shown).map((week, w) => (
            <div key={w} className="grid grid-cols-7">
              {week.map((day, i) => {
                if (!day) return <span key={i} />;
                const edge = day === start || day === end;
                const inside = !!(start && end && day > start && day < end);
                // The band joins up across a week; it rounds off at the range's ends
                const band = inside
                  ? 'bg-surface'
                  : edge && start && end && start !== end
                    ? day === start
                      ? 'bg-gradient-to-r from-transparent from-50% to-surface to-50%'
                      : 'bg-gradient-to-l from-transparent from-50% to-surface to-50%'
                    : '';
                return (
                  <span key={day} className={`flex justify-center ${band}`}>
                    <button
                      type="button"
                      aria-label={dayLabel(day)}
                      aria-pressed={edge}
                      aria-current={day === today ? 'date' : undefined}
                      onClick={() => tap(day)}
                      className={`h-11 w-11 rounded-full text-sm ${edge ? 'bg-ink font-semibold text-on-ink' : day === today ? 'font-semibold text-ink underline underline-offset-4' : 'text-ink'}`}
                    >
                      {Number(day.slice(8))}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>

        <p
          role="status"
          className={tooLong ? 'text-warn' : 'text-sm text-muted'}
        >
          {status}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!start || !end || tooLong}
            onClick={() =>
              start && end && props.onPick({ from: start, to: end })
            }
            className={`${primaryButton} flex-1`}
          >
            Show these days
          </button>
          <button type="button" onClick={props.onClose} className={plainButton}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
