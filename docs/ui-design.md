# UI design guide

The rules every SplitLah screen follows, so new screens look like the old ones. Read this before building or changing a screen. Where the look comes from is in [`ui-reference.md`](ui-reference.md).

**The look:** dark frosted glass over a cool glow. The page is midnight blue; indigo, violet and a little teal glow softly behind it; every panel is a piece of glass on top. Shapes are round, titles are calm, and the one solid white button is the thing to press. The name and font come from my site [splitlah.sg](https://splitlah.sg). Built for an iPhone held in one hand.

## Colours

Every colour is a named token in `apps/web/src/index.css` (`@theme`). Screens use the token names (`text-muted`, `bg-raised`), **never** raw Tailwind colours like `bg-slate-100` or hex codes. To change the look, change the token.

The app is **dark only**: glass needs a dark page behind it.

| Token                      | Value                           | Use it for                                 | Classes                       |
| -------------------------- | ------------------------------- | ------------------------------------------ | ----------------------------- |
| `bg`                       | `#080B18`                       | The page (midnight blue)                   | set on `html`                 |
| `surface`                  | white 6%                        | Glass: cards, rows, inputs                 | `glass`, `bg-surface`         |
| `raised`                   | white 13%                       | Brighter glass: the active tab, row badges | `bg-raised`                   |
| `line`                     | white 12%                       | The thin edge of glass                     | `border-line`                 |
| `ink`                      | `#F5F6FB`                       | Main text, amounts, **the main button**    | `text-ink`, `bg-ink`          |
| `on-ink`                   | `#0B0F1F`                       | Text on the main button                    | `text-on-ink`                 |
| `muted`                    | `#A8AEC4`                       | Labels, hints, second lines, `›`           | `text-muted`                  |
| `faint`                    | `#6F7690`                       | Placeholders                               | `placeholder:text-faint`      |
| `ok`                       | `#D9EE6A`                       | "All good" (our total matches the receipt) | `text-ok`                     |
| `warn`                     | `#F5B454`                       | "Check this" (our total ≠ the receipt's)   | `text-warn`, `bg-warn/10`     |
| `danger`                   | `#FF8F8F`                       | Errors, delete                             | `text-danger`, `bg-danger/10` |
| `indigo`, `violet`, `teal` | `#2F3AA3`, `#A78BFA`, `#2DD4BF` | The glow, the hero card and the logo only  | through `hero`                |

- **One main button per screen** (`bg-ink text-on-ink`, solid white). Everything else is glass or plain text.
- **Colour is atmosphere or meaning, never decoration on a control.** The glow, the hero card and the logo carry the colour; lime, amber and red mean ok, warning and error.

## Glass, glow and the hero card

Three styles defined once in `index.css`:

| Class   | What it is                                                                              | Use it for                                                      |
| ------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `glass` | See-through white, a 1px light edge, a soft top highlight, and a blur of what is behind | Rows, cards, quiet buttons, the tab track                       |
| `hero`  | An indigo-to-violet gradient card with a soft violet shadow                             | **One** per screen: the most important thing on it (the totals) |
| `rise`  | The page fades and slides up 12px over 0.45s when it opens                              | Already on `Page` and `AuthLayout`                              |

- The **glow** is three blurred colour clouds fixed behind every page (`body::before`). It needs no markup; do not add more glows inside screens.
- Do not put glass on glass more than one level deep: it turns muddy and unreadable.

## The logo

- **The idea:** one circle (the bill) split into two halves (the shares). One half is violet, the other teal, tilted with a gap between them.
- `<Logo size={n} />` (`components/Logo.tsx`): drawn as SVG in the code, so it is sharp at any size and needs no image file. The same shape is the browser tab icon (`public/favicon.svg`).
- `<Brand />`: a 28px logo and the name **split lah** (lowercase, extra bold). It sits at the top of top-level pages (log in, My bills); inner pages show the round back button there instead.
- `<Logo size={132} moving />`: the big one on the welcome screen, where the halves slide apart and back slowly. One big logo at most, and only on a welcome screen.
- The logo's movement and `rise` both stop when the phone has "Reduce Motion" on (`prefers-reduced-motion`). The logo has `aria-hidden`: the name beside it is what a screen reader reads.
- Don't recolour, stretch or rotate it, and don't put it on a busy photo.

## Type

- **Plus Jakarta Sans**, served from our own site through the `@fontsource-variable/plus-jakarta-sans` package: no request to Google, and it works offline.
- Titles are large but **medium weight**: page title `text-3xl font-semibold tracking-tight`; welcome headline `text-4xl leading-tight font-semibold tracking-tighter`, one sentence per line.
- A number that matters is bigger than its label (the total: `text-4xl font-semibold`).
- Body: the default size (16px). Second lines and labels: `text-sm text-muted`.
- **Inputs are always `text-base` (16px).** iPhone Safari zooms the page when an input's text is smaller.
- Money is shown with `formatCents()` (`$12.50`), never built by hand.

## Shapes and sizes

| Thing                  | Rule                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| Buttons                | Full pills: `rounded-full`, `h-14` (56px)                        |
| Round icon buttons     | `h-12 w-12 rounded-full` glass (the back button)                 |
| Inputs                 | Pills: `rounded-full`, `h-14`, glass                             |
| List rows              | Glass pills, `rounded-[28px]`, at least 72px tall                |
| Cards (forms, charges) | Glass, `rounded-[28px]`; the hero card `rounded-[32px]`          |
| Anything you can tap   | At least 44px tall (`h-11`); Apple's minimum                     |
| Page                   | `max-w-sm`, `px-5`, `gap-5` between blocks, `gap-2` between rows |

## Building blocks (use these, don't restyle)

All in `components/Page.tsx` unless a file is named.

| Need                       | Use                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A logged-in page           | `<Page title back action>`                                                                                                         |
| The main button            | `primaryButton` (one per screen)                                                                                                   |
| Any other button           | `plainButton`; small ones in the top bar: `smallButton`                                                                            |
| A round icon button        | `roundButton` (with an `aria-label`)                                                                                               |
| A row in a list            | `row`, with `<Initial of={name} />`, two lines of text, a value and `›`                                                            |
| A heading above a list     | `<SectionLabel count={n}>` ("Items 3")                                                                                             |
| The logo                   | `<Brand />`, `<Logo size moving>` (`components/Logo.tsx`)                                                                          |
| A text input with a label  | `<Field label name error hint>` (`components/Field.tsx`)                                                                           |
| An API error for the form  | `<FormError message>` (`components/FormError.tsx`)                                                                                 |
| A sheet over the page      | Like `AdjustSplit`: `role="dialog"` with an `aria-label`, a dark scrim, a panel rising from the bottom, one main button and Cancel |
| The login / register frame | `<AuthLayout>` (`components/AuthLayout.tsx`)                                                                                       |

## The order of a screen

Top bar (logo or back button, one small action) → title → the hero card if there is one → a labelled list of rows → the main button.

## Behaviour

- **Mobile first.** Design at 375px wide. Nothing may scroll sideways.
- **Every wait says what is happening** on the button itself ("Reading receipt…", "Logging in…"), and the button is disabled meanwhile.
- **Errors are sentences** next to what caused them: under the field, or in a `FormError` above the button. Never raw JSON, never only a colour.
- **Movement is soft and small:** pages rise in, pressed things shrink slightly (`active:scale-[0.96]`), the welcome logo's halves slide. Nothing else moves, and money never animates.
- **Accessible by default:** every input has a real `<label>`; errors use `role="alert"`; icon-only buttons have an `aria-label`; decoration (`Initial`, `›`, the logo) has `aria-hidden`; the focus ring (`:focus-visible`) is never removed. The tests find things by label and role, so breaking these breaks the tests.
- **Readable on glass:** text on glass is `ink` or `muted` only. Both stay above the 4.5:1 contrast that WCAG AA asks for on the dark page.

## Words

- **The welcome text covers the whole app, not one feature:** splitting a bill (scan, share a link, pay by PayNow) **and** tracking monthly expenses.
- Short and plain, like talking to a friend: "Split the bill. Track the spend.", "Check items", "Type it in".
- Buttons say what happens next: "Next: add items", "Read receipt", not "Submit" or "OK".
- Sentence case everywhere ("New bill", not "New Bill"). The logo is lowercase: **split lah**.

## Checklist for a new screen

1. Only token colours; no `slate-`, `emerald-`, `red-` or hex in the screen.
2. One solid white main button at most, and one `hero` card at most.
3. Built from `Page`, `row`, `SectionLabel`, `Field`, `FormError` and the shared buttons.
4. Works at 375px, inputs are `text-base`, tap targets ≥ 44px, no glass on glass on glass.
5. Loading, empty and error states all exist and have a test.
