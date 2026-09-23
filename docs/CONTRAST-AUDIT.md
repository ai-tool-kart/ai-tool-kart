# Contrast audit — remaining findings

Measured 2026-09-23 against the local dev build, after commit `e942ce9`
(which moved every text use of `#615C7A` and `#7C7697` to the
`text-muted-dim` token). **Nothing below has been changed.** This is the
list of text that still falls under WCAG 2.1 AA, for a decision.

AA thresholds: **4.5:1** for normal text, **3:1** for large text (≥ 24px,
or ≥ 18.66px bold).

## Method

axe-core reports these as *incomplete*, not as violations, because it
cannot compute a background through gradients, background images, blurred
mesh glows or overlapping layers. So each one was measured from pixels
instead:

1. **Viewport** 1360 × 900, CSS pixels (device scale 1), Chromium via
   Playwright, dev server (`npm run dev`) with the API server running.
2. **Reveal everything.** Load the page, wait 3 s, scroll top to bottom in
   500 px steps (150 ms each) so every `[data-reveal]` element has entered,
   return to the top, wait 2 s.
3. **Freeze the animations at 12 points.** For every animation in
   `document.getAnimations()` with `iterations === Infinity` (the mesh
   glows, the ticker, the sheens — 1 to 19 per page), pause it and set
   `currentTime = delay + duration × k/12` for k = 0…11. Take a full-page
   screenshot at each k. This walks each glow through its whole cycle; it
   does not cover every *combination* of two glows peaking at once.
4. **Collect the text.** Every element with its own non-empty text node,
   visible, not `sr-only`, not inside `aria-hidden`, excluding the site
   header, nav and footer: its computed `color`, `font-size`,
   `font-weight`, `opacity` and document-space bounding box.
5. **Background = the most common pixel colour in the box** (quantised to
   4-level steps) that is not within 60 (sum of RGB differences) of the
   text colour — text strokes cover a minority of their box, and the
   exclusion stops large bold text being read as its own background.
6. **Contrast** by the WCAG relative-luminance formula, with the text
   colour alpha-composited over that background. Each element keeps its
   **lowest ratio across the 12 frames**; "frame" below is which k produced
   it (0 = the animations' start, 5 = 5/12 of the way through).

The pages measured: `/automations?q=follow+up+with+clients+automatically`,
`/automations/Real%20Estate/i-want-to-write-a-listing-description-for-my-new-listing`,
`/browse`, `/new-launches`, `/` (home).

Readings move by a few hundredths with the glow; a style measured at, say,
4.48:1 should be treated as failing, not as a rounding case.

## For reference: the token fixed in `e942ce9`

`text-muted-dim` (`--color-muted-dim`, `#8e88a8`) worst frame per page:
automations list 5.10, automations detail 6.09, Browse 5.44, New Launches
**4.89** (the count on an active launch chip), Home 5.33. All pass.

## Not failures

| Text | Measured | Why it is excluded |
|---|---|---|
| Hero word "Business" (`Hero.tsx`, 88px/700) | 1.00:1 | Measurement artifact: the word is `text-transparent` with a clipped gradient (`#FFFFFF → #EADCFF → #BE9CFF`), so its computed colour means nothing. Visually it is near-white. |
| Browse "Reset" (`BrowseControls.tsx`) | 2.17:1 | Disabled control (`disabled:opacity-40`). WCAG 1.4.3 exempts inactive UI components. |

## Remaining findings

All but one are **literals** — a hex value in a Tailwind arbitrary class,
not a `@theme` token. "Worst" is the lowest ratio across the 12 frames.

### Browse

| Text | Colour | Where | Size | Worst | Frame | Literal / token |
|---|---|---|---|---|---|---|
| Refine section labels ("Pricing model", "Minimum rating") | `#6E6890` | `components/catalogue/RefineSidebar.tsx:90, :125` | 11.5px/400 | **3.31:1** | 4 | literal |

### New Launches

| Text | Colour | Where | Size | Worst | Frame | Literal / token |
|---|---|---|---|---|---|---|
| Hero card meta ("Video · added 6 Sept", "( 1,060 )") | `#6E6890` | `components/launches/LaunchHeroCard.tsx:85, :109` | 12.5px/400 | **3.76:1** | 0 | literal |

### Home

| Text | Colour | Where | Size | Worst | Frame | Literal / token |
|---|---|---|---|---|---|---|
| "Join the server" on the Discord button | `#FFFFFF` on the `#F0A6C6 → #9C3F82` gradient | `components/community/DiscordCard.tsx:88` (label from `data/community.ts`) | 14.5px/600 | **2.59:1** | 0 | literal (text and gradient) |
| Today's Pick review count ("25.1K reviews") | `#8D8474` | `components/featured/TodaysPickCard.tsx:120–122` | 13px/400 | **2.73:1** | 0 | literal |
| Hero subtitle ("One search gets you everything…") | `#C0B9D9` | `pages/home/sections/Hero.tsx` | 17px/400 | **3.19:1** | 5 | literal — fails only near the glow's peak |
| Plan idle state ("Ready · nothing generated yet") | `#6E6884` | `components/assistant/PlanIdleState.tsx:26` | 11.5px/400 | **3.40:1** | 0 | literal |
| Featured "Re-tested this month" | `#6E6884` | `pages/home/sections/FeaturedToolsSection.tsx:132` | 12px/400 | **3.44:1** | 0 | literal |
| Community social handles ("@aitoolkart", "AI Tool Kart") | `#726C8C` | `components/community/SocialCard.tsx:78` | 11.5px/400 | **3.59:1** | 0 | literal |
| Featured tile category ("Image", "Video", "Agents") | `#736D8A` | `components/featured/FeaturedToolTile.tsx:74` | 11.5px/400 | **3.61:1** | 0 | literal |
| Today's Pick badge ("Today's Pick") | `#F8F2E6` on the warm card band | `components/featured/TodaysPickCard.tsx` | 17px/600 | **3.85:1** | 0 | literal |
| Hero "Popular right now" chips ("Edit videos faster", "Grow my restaurant", …) | `#B9B3CC` | `pages/home/sections/HeroSearch.tsx` | 13px/500 | **3.93:1** | 5 | literal — fails only near the glow's peak |
| Plan "See these tools" (not-yet-available state) | `#7E7899` | `components/assistant/PlanPanel.tsx:162` | 12.5px/600 | **3.96:1** | 0 | literal — the `cursor-default` idle state; if it is treated as an inactive control it is exempt |
| "Illustrative setups written to show how the tools…" | `#7C6E73` | `pages/home/sections/HowPeopleAreUsingAISection.tsx:99` | 12.5px/400 | **3.99:1** | 0 | literal |
| Setup card tool list ("Perplexity · Claude · Grammarly") | `#8078A0` | `components/aiSetups/SetupCard.tsx:132` | 11.5px/400 | **4.18:1** | 0 | literal |
| Recently-added card tagline ("Text and image to video generation…") | `#7E7899` | `components/recentlyAdded/RecentToolCard.tsx:112` | 12.5px/400 | **4.23:1** | 0 | literal |
| Chat panel hint ("Describe the work — the plan builds itself") | `#7B7595` | `components/assistant/ChatPanel.tsx:88` | 11.5px/400 | **4.25:1** | 0 | **token** — `--color-subtle` |
| Hero "Popular right now:" label | `#8C86A6` | `pages/home/sections/HeroSearch.tsx:129` | 13px/400 | **4.39:1** | 4 | literal — fails only near the glow's peak |
| Savings table "Dimension" header | `#6F7A74` | `components/savings/SavingsComparisonTable.tsx:95` | 11px/400 | **4.39:1** | 3 | literal |
| Setup card counts ("3 tools · 1 workflow · 4 prompts") | `#7E7899` | `components/aiSetups/SetupCard.tsx:152` | 12px/400 | **4.48:1** | 0 | literal |

`#7E7899` also appears as text in `components/assistant/ChatPanel.tsx:107`
and `components/community/SocialCard.tsx:84`; those instances measured at
or above 4.5:1 on their backgrounds, but they share the colour of three
failing rows above and would move with any fix to it.

## If these are fixed

The pattern from `e942ce9` applies to most rows: an existing token,
no new colour. On the backgrounds measured here, `muted-dim` (`#8e88a8`)
clears 4.5:1 on dark surfaces; the glow-peak rows (hero subtitle, chips,
"Popular right now:") and the two warm/pink surfaces (Discord button,
Today's Pick) sit on lighter or saturated backgrounds and would need their
own check rather than a blanket swap.
