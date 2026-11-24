import { useRef, useState, type ReactNode } from 'react';

export type SwipeAction = {
  label: string;
  onClick: () => void;
  danger?: boolean; // red; a long swipe left does it at once (Delete)
};
export type Side = 'start' | 'end' | null;

const BUTTON = 88; // width of one action button, px
const LONG = 0.6; // a swipe past 60% of the row does the action at once
const HOLD_MS = 500; // a press this long opens the menu instead

// A list row you can swipe like in iPhone Mail (KAN-101):
// right shows `start` (Pin), left shows the `end` buttons (Share, Delete).
// The list says which row is open (`side`), so only one is open at a time.
// Swiping is extra: the same actions are in the menu a long press opens.
export function SwipeRow(props: {
  start: SwipeAction;
  end: SwipeAction[];
  side: Side;
  onSide: (side: Side) => void;
  onHold: () => void;
  children: ReactNode;
}) {
  const { start, end, side, onSide, onHold } = props;
  const [drag, setDrag] = useState<number | null>(null); // px, while a finger is down
  const [width, setWidth] = useState(320); // the row's width, measured on touch
  const touch = useRef({ x: 0, y: 0, from: 0, mode: '', timer: 0 });
  const swallowClick = useRef(false);

  const endWidth = end.length * BUTTON;
  const rest = side === 'start' ? BUTTON : side === 'end' ? -endWidth : 0;
  const x = drag ?? rest;
  const long = (dx: number) => Math.abs(dx) >= width * LONG;
  const last = end[end.length - 1];
  const fullEnd = x < 0 && last.danger && long(x); // only Delete fills the row

  function down(e: React.PointerEvent<HTMLDivElement>) {
    setWidth(e.currentTarget.offsetWidth || 320);
    swallowClick.current = false; // a new touch; phones send no click after a swipe
    touch.current = {
      x: e.clientX,
      y: e.clientY,
      from: rest,
      mode: '',
      timer: window.setTimeout(() => {
        swallowClick.current = true;
        buzz();
        onHold();
      }, HOLD_MS),
    };
  }

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const t = touch.current;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (!t.mode) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // still a tap
      clearTimeout(t.timer);
      // Mostly sideways is a swipe; mostly up or down is the page scrolling
      t.mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'scroll';
      if (t.mode === 'swipe') {
        swallowClick.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
      }
    }
    if (t.mode === 'swipe')
      setDrag(Math.max(-width, Math.min(width, t.from + dx)));
  }

  function up() {
    clearTimeout(touch.current.timer);
    if (drag === null) return;
    setDrag(null);
    if (drag > 0 && long(drag)) {
      buzz();
      onSide(null);
      start.onClick();
    } else if (fullEnd) {
      buzz();
      onSide(null);
      last.onClick();
    } else if (drag > BUTTON / 2) onSide('start');
    else if (drag < -endWidth / 2) onSide('end');
    else onSide(null);
  }

  // The click a mouse sends at the end of a swipe or long press must not open the
  // bill (or close the row it just opened); a real tap on an open row closes it
  function click(e: React.MouseEvent) {
    if (!swallowClick.current && !side) return;
    e.preventDefault();
    e.stopPropagation();
    if (swallowClick.current) swallowClick.current = false;
    else onSide(null);
  }

  const button = 'flex h-full items-center justify-center px-2 font-semibold';
  return (
    <div className="relative overflow-hidden rounded-[28px]">
      {x > 0 && (
        <div
          className="absolute inset-y-0 left-0 flex bg-raised"
          style={{ width: x }}
        >
          <button
            type="button"
            onClick={() => {
              onSide(null);
              start.onClick();
            }}
            className={`${button} min-w-[88px] text-ink`}
          >
            {start.label}
          </button>
        </div>
      )}
      {x < 0 && (
        <div
          className="absolute inset-y-0 right-0 flex justify-end"
          style={{ width: -x }}
        >
          {(fullEnd ? [last] : end).map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                onSide(null);
                a.onClick();
              }}
              className={`${button} flex-1 ${a.danger ? 'bg-danger text-on-ink' : 'bg-raised text-ink'}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div
        data-testid="swipe"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={click}
        onContextMenu={(e) => {
          e.preventDefault(); // right-click on a computer opens our menu instead
          clearTimeout(touch.current.timer);
          onHold();
        }}
        style={{ transform: `translateX(${x}px)` }}
        className={`touch-pan-y select-none [-webkit-touch-callout:none] ${drag === null ? 'transition-transform duration-200 motion-reduce:transition-none' : ''}`}
      >
        {props.children}
      </div>
    </div>
  );
}

// A tiny tap on phones that can (Android); iPhones ignore it
function buzz() {
  navigator.vibrate?.(10);
}
