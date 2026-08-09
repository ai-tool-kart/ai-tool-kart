import mark from '@/assets/mark.png'

/*
 * TEMPORARY — Phase 1 only.
 *
 * This is a design-token specimen, not the real application shell. It exists so
 * the tokens in src/styles/index.css can be verified against the Claude Design
 * handoff before any layout work starts.
 *
 * Phase 2 replaces this file entirely with the router's <Routes> table.
 */

const swatches: Array<{ label: string; className: string }> = [
  { label: 'canvas', className: 'bg-canvas' },
  { label: 'ink', className: 'bg-ink' },
  { label: 'body', className: 'bg-body' },
  { label: 'muted', className: 'bg-muted' },
  { label: 'subtle', className: 'bg-subtle' },
  { label: 'accent', className: 'bg-accent' },
  { label: 'accent-soft', className: 'bg-accent-soft' },
  { label: 'link', className: 'bg-link' },
  { label: 'pink', className: 'bg-pink' },
  { label: 'grad-from', className: 'bg-grad-from' },
  { label: 'grad-mid', className: 'bg-grad-mid' },
  { label: 'grad-to', className: 'bg-grad-to' },
]

const radii: Array<{ label: string; className: string }> = [
  { label: 'tag 8', className: 'rounded-tag' },
  { label: 'chip 10', className: 'rounded-chip' },
  { label: 'field 14', className: 'rounded-field' },
  { label: 'tile 16', className: 'rounded-tile' },
  { label: 'card 18', className: 'rounded-card' },
  { label: 'card-lg 22', className: 'rounded-card-lg' },
  { label: 'panel 24', className: 'rounded-panel' },
  { label: 'panel-lg 28', className: 'rounded-panel-lg' },
  { label: 'hero 30', className: 'rounded-hero' },
  { label: 'pill 999', className: 'rounded-pill' },
]

function App() {
  return (
    <div className="min-h-screen bg-canvas text-body">
      <div className="mx-auto max-w-site px-8 py-16 flex flex-col gap-16">
        <header className="flex items-center gap-3">
          <img src={mark} alt="" className="w-6 h-6 brightness-0 invert" />
          <span className="text-ink font-semibold tracking-[-0.032em]">AI Tool Kart</span>
          <span className="ml-auto text-[12px] uppercase tracking-[0.22em] text-subtle">
            Phase 1 · token specimen
          </span>
        </header>

        <section className="flex flex-col gap-5">
          <h1 className="text-hero text-ink font-bold">Every AI tool, sorted.</h1>
          <p className="max-w-[560px] text-[16px] leading-[1.65] text-muted">
            Body copy at 16px renders in Schibsted Grotesk. This paragraph checks the
            base text colour, line-height and the <a href="#specimen">link colour</a> on
            hover.
          </p>
        </section>

        <section id="specimen" className="flex flex-col gap-4">
          <h2 className="text-[12px] uppercase tracking-[0.22em] text-subtle">Colour</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {swatches.map((s) => (
              <div key={s.label} className="flex flex-col gap-2">
                <div
                  className={`h-14 rounded-chip border border-hairline ${s.className}`}
                />
                <span className="text-[12px] text-subtle">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[12px] uppercase tracking-[0.22em] text-subtle">Radius</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
            {radii.map((r) => (
              <div key={r.label} className="flex flex-col gap-2">
                <div
                  className={`h-14 border border-hairline bg-[image:var(--gradient-glass)] ${r.className}`}
                />
                <span className="text-[12px] text-subtle">{r.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[12px] uppercase tracking-[0.22em] text-subtle">
            Surfaces &amp; shadows
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
            <div className="rounded-card-lg border border-hairline bg-[image:var(--gradient-glass)] p-6 shadow-card">
              <p className="text-ink text-[17px] font-semibold">Glow card</p>
              <p className="mt-2 text-[14px] text-muted-dim">shadow-card · radius 22</p>
            </div>
            <div className="rounded-nav border border-hairline bg-nav-glass p-6 shadow-nav backdrop-blur-[28px]">
              <p className="text-ink text-[17px] font-semibold">Nav glass</p>
              <p className="mt-2 text-[14px] text-muted-dim">shadow-nav · radius 22</p>
            </div>
            <div className="rounded-search border border-hairline-strong bg-[image:var(--gradient-search)] p-6 shadow-search">
              <p className="text-ink text-[17px] font-semibold">Search shell</p>
              <p className="mt-2 text-[14px] text-muted-dim">shadow-search · radius 52</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[12px] uppercase tracking-[0.22em] text-subtle">Gradients</h2>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="rounded-pill bg-[image:var(--gradient-cta)] px-5 py-2.5 text-[14px] font-semibold text-white shadow-button"
            >
              Get started free
            </button>
            <div className="grid h-12 w-12 place-items-center rounded-field bg-[image:var(--gradient-monogram)] text-[15px] font-semibold text-white">
              NW
            </div>
            <div className="rounded-panel-lg bg-[image:var(--gradient-banner)] px-6 py-4 text-[15px] text-white">
              CTA banner gradient
            </div>
            <span className="rounded-pill bg-pink-bg px-3 py-1 text-[12px] font-semibold text-pink">
              Trending
            </span>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-[12px] uppercase tracking-[0.22em] text-subtle">Motion</h2>
          <p className="text-[15px] text-muted-dim">
            Keyframes load from animations.css — this bar uses{' '}
            <code className="text-accent-soft">akShine</code>.
          </p>
          <div className="relative h-14 overflow-hidden rounded-card border border-hairline bg-[image:var(--gradient-glass)]">
            <div className="absolute inset-y-0 w-1/3 bg-white/20 [animation:akShine_14s_cubic-bezier(.4,0,.6,1)_infinite]" />
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
