# UI reference: what the inspiration shows

Notes on the two references I chose for SplitLah's look, written down so the design can be explained and repeated. The rules the app actually follows are in [`ui-design.md`](ui-design.md); this file is the "why".

**Sources**

- A Dribbble still of a course app: three iPhone screens (a lesson player, a course list, a weekly schedule).
- A 45-second Dribbble video from the same studio.

The designs belong to their designers. SplitLah borrows the **style** (dark glass, glow, shapes, spacing); it uses none of their photos, artwork, icons, text or layouts as-is.

## The still image

### Overall feeling

Dark, soft and premium. The screen is almost black, but it never feels flat, because warm colour glows through from behind and every panel looks like a piece of frosted glass lying on top of that glow.

### Colour

| What         | What I see                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| Page         | Near-black with a slight plum tint, not pure `#000`                                                           |
| Glow         | Soft clouds of **plum**, **pink** and a little **amber/orange**, blurred, sitting in corners and behind cards |
| Glass panels | White at about 5–10% opacity, with a 1px lighter edge; what is behind them is blurred                         |
| Text         | White for names and numbers; a grey-lilac for secondary lines ("28 min", "Today, 15 Jan")                     |
| Main action  | **Solid white** with dark text or a dark icon (the "1x" chip, the "Active" badge, the lit icon circle)        |
| Highlight    | One lime-yellow, used only for progress (the day rings)                                                       |

There is no "brand colour" button. The brightest thing on a screen is white, and colour is atmosphere.

### Shapes

- **Everything is round.** Buttons and rows are full pills; cards have very large corners (about 28–32px).
- **Round icon buttons:** back, bookmark, bell, edit and add are 48px circles of glass with a thin edge.
- **List rows are pills:** a round badge on the left (white when it is the current one, dark glass otherwise), two lines of text, and on the right a small value and a `›` ("1 lesson ›").
- **Segmented tabs:** a glass track with two labels; the chosen one is a brighter piece of glass ("My Courses | Progress").
- **Hero card:** one large card per screen filled with a pink-to-plum gradient, holding the most important thing (the active course) with a big title and a small action in the corner ("Continue ›").
- **Floating bar:** the bottom navigation is a glass pill that floats above the content, with a separate round search button beside it.

### Type

- A clean geometric sans-serif.
- Titles are large but **medium weight**, with tight letter spacing ("Creative Sprint", "AI for Creators"). Nothing is heavy or shouting.
- Small labels sit above lists with a count on the far right ("Lessons … 14").
- Numbers that matter are bigger than their labels ("3/6", "67%").

### Layout

- Narrow side margins (about 16–20px); cards almost touch the edges.
- Generous space inside each card; tight, even gaps (about 8px) between rows in a list.
- A clear order on every screen: top bar with round buttons → title → one hero → a labelled list → floating actions.

## The video

The video is a **showreel**: about ten different apps in 45 seconds (earbuds, a health chart, flight booking, a mood tracker, food ordering, EV charging, a map). It is not a walkthrough of the course app, so it adds nothing about that app's screens. What it does show is how this studio makes things move:

- **Things arrive, they don't just appear:** cards and screens slide or fade up into place.
- **Movement is soft:** it starts quickly and settles slowly; nothing bounces hard or spins.
- **One thing moves at a time,** and the rest of the screen stays still.
- **Numbers and charts animate to their value** (a percentage counting up, bars growing).
- **Pressing responds:** the thing under your finger reacts straight away.

## What SplitLah takes from this

| From the reference                             | In SplitLah                                                                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A dark page with soft colour glowing behind it | A fixed glow behind every page (`body::before` in `index.css`), in my own colours: midnight blue with indigo, violet and teal |
| Frosted glass panels                           | The `glass` style on rows, cards, inputs and quiet buttons                                                                    |
| Solid white main action                        | `primaryButton`: a white pill with dark text, one per screen                                                                  |
| Round glass icon buttons                       | The round back button on every inner page                                                                                     |
| Pill rows with a round badge and `›`           | Bill rows and item rows: first letter in a badge, two lines, amount, `›`                                                      |
| Label with a count above a list                | "Bills 1", "Items 3"                                                                                                          |
| Segmented glass tabs                           | Log in / Register                                                                                                             |
| One gradient hero card                         | The totals card on Check items, with the total in large type                                                                  |
| Medium-weight, tight titles                    | Page titles are `font-semibold tracking-tight`                                                                                |
| Things arrive softly                           | Each page rises in over 0.45s; off when the phone has Reduce Motion on                                                        |
| Pressing responds                              | Buttons and rows shrink slightly when pressed                                                                                 |

**Not taken, on purpose**

- **The floating bottom bar:** SplitLah has one section so far, so there is nothing to switch between. It fits when Expenses and Profile exist.
- **Photos and avatars:** the app has no images of people; a badge with the first letter does the same job.
- **Counting numbers:** money should be readable at once, not animate.
- **A light version:** glass needs a dark page behind it, so the app is dark only.

**Changed, on purpose**

- **The colours are my own.** The reference is plum, pink and amber. SplitLah uses midnight blue with indigo, violet and teal, so it has the same feeling without looking like the reference.
- **The logo is my own:** a circle split into two halves, for a bill split into shares.

**Kept from my own site ([splitlah.sg](https://splitlah.sg))**

- The name **split lah** and the Plus Jakarta Sans font.
