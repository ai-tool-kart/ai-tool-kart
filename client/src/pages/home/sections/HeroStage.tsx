/*
 * Home hero backdrop — the tall column of drifting violet light behind the
 * headline, search and assistant panel.
 *
 * Source: AI Tool Kart Site.dc.html, the [data-stage] block (home only).
 *
 * This REPLACES the two 3D "wing" chevrons the first design export used. They
 * are gone from the final design: it reads the hero's depth from stacked
 * radial blooms on independent drift cycles instead of from a foreground
 * object, which is why the wings, their SVG depth filter and the akIdleA/akIdleB
 * keyframes all left with them.
 *
 * Every layer is anchored to the same origin (left 50%, top 38% of a 1720px
 * stage) and offset by its own negative margins, so the whole stack scales as
 * one when the stage height changes.
 *
 * [data-focal] and [data-floor] keep their attributes because the design's
 * hero-search focus handler brightens exactly those two layers when the input
 * takes focus. That wiring arrives with the hero search's focus lighting.
 */

/** left:50%; top:38% with a size and its centring offsets, as px. */
function anchored(width: number, height: number, marginTop: number): React.CSSProperties {
  return {
    width: `${width}px`,
    height: `${height}px`,
    marginLeft: `${-width / 2}px`,
    marginTop: `${marginTop}px`,
  }
}

export default function HeroStage() {
  return (
    <div
      data-stage="1"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[1720px] overflow-hidden"
    >
      {/* Vertical wash: the canvas warms toward violet across the hero, then cools back. */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#040409_0%,#06051200_0%,#070614_14%,#0A0720_28%,#0D0929_38%,#0A0722_50%,#070517_68%,#050410_84%,#040409_100%)]" />

      {/* Outermost bloom — slow, huge, sets the overall glow. */}
      <div
        data-lighta="1"
        style={anchored(2600, 1720, -900)}
        className="absolute top-[38%] left-1/2 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(124,80,240,0.2)_0%,rgba(102,58,214,0.085)_30%,rgba(88,46,196,0.028)_52%,rgba(88,46,196,0)_72%)] blur-[120px] will-change-[transform,opacity] [animation:akDrift1_13s_cubic-bezier(.42,0,.58,1)_infinite]"
      />
      {/* Focal bloom behind the headline. Brightens on hero-search focus. */}
      <div
        data-focal="1"
        style={anchored(1760, 1060, -560)}
        className="absolute top-[38%] left-1/2 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(186,152,255,0.42)_0%,rgba(146,100,248,0.2)_26%,rgba(112,66,228,0.075)_48%,rgba(96,52,206,0)_72%)] blur-[92px] transition-opacity duration-1000 ease-[cubic-bezier(.2,.8,.2,1)] will-change-[transform,opacity] [animation:akDrift2_19s_cubic-bezier(.42,0,.58,1)_infinite]"
      />
      {/* Bright core, breathing on its own cycle. */}
      <div
        data-pulse="1"
        style={anchored(940, 540, -296)}
        className="absolute top-[38%] left-1/2 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(228,214,255,0.62)_0%,rgba(172,136,252,0.36)_24%,rgba(128,82,240,0.15)_46%,rgba(96,52,206,0)_74%)] blur-[64px] will-change-[transform,opacity] [animation:akBloomPulse_9.5s_ease-in-out_infinite]"
      />
      {/* Floor bounce under the search bar. Brightens on hero-search focus. */}
      <div
        data-floor="1"
        style={anchored(1240, 430, 86)}
        className="absolute top-[38%] left-1/2 bg-[radial-gradient(ellipse_50%_54%_at_50%_10%,rgba(206,186,255,0.2)_0%,rgba(154,110,248,0.09)_36%,rgba(120,74,236,0.04)_58%,rgba(120,74,236,0)_78%)] blur-[72px] transition-opacity duration-1000 ease-[cubic-bezier(.2,.8,.2,1)] will-change-[transform,opacity] [animation:akDrift3_23s_ease-in-out_infinite]"
      />
      {/* Ceiling haze above the headline. */}
      <div
        style={anchored(1180, 680, -700)}
        className="absolute top-[38%] left-1/2 bg-[radial-gradient(ellipse_50%_52%_at_50%_96%,rgba(178,142,255,0.2)_0%,rgba(134,88,242,0.08)_38%,rgba(110,64,220,0.02)_62%,rgba(110,64,220,0)_80%)] blur-[84px] will-change-[transform,opacity] [animation:akHaze_29s_ease-in-out_infinite]"
      />

      {/* Two skewed light shafts, out of phase with each other. */}
      <div className="absolute top-[14%] left-[34%] h-[56%] w-[7%] skew-x-[-9deg] bg-[linear-gradient(180deg,rgba(196,170,255,0)_0%,rgba(196,170,255,0.05)_50%,rgba(196,170,255,0)_100%)] blur-[42px] [animation:akShaft_17s_ease-in-out_infinite]" />
      <div className="absolute top-[16%] right-[33%] h-[52%] w-[6%] skew-x-[7deg] bg-[linear-gradient(180deg,rgba(214,196,255,0)_0%,rgba(214,196,255,0.045)_54%,rgba(214,196,255,0)_100%)] blur-[46px] [animation:akShaft_23s_ease-in-out_-8s_infinite]" />

      {/* Vignette, header fade, and the fade back into the page below. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_54%_40%_at_50%_38%,rgba(3,2,10,0)_20%,rgba(3,2,10,0.5)_58%,rgba(2,2,7,0.92)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,3,8,0.9)_0%,rgba(3,3,8,0.42)_9%,rgba(3,3,8,0)_20%)]" />
      <div className="absolute right-0 bottom-0 left-0 h-[520px] bg-[linear-gradient(180deg,rgba(4,4,7,0)_0%,rgba(4,4,7,0.5)_34%,rgba(4,4,7,0.85)_68%,#040407_96%)]" />
    </div>
  )
}
