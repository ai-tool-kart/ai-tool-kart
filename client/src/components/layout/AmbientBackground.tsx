/*
 * Global ambient background — the fixed glow/vignette/noise stack that sits
 * behind every page in the design.
 *
 * Source: AI Tool Kart Site.dc.html, the fixed layer directly inside [data-ak-root].
 * The home-only "wing" decoration (the [data-stage] block) is NOT part of this
 * component — it belongs to the Home hero (Phase 4).
 *
 * The outer group carries data-par="0.02" in the source; the parallax hook that
 * reads it lands in Phase 9, so the attribute is preserved here as the anchor.
 */

// Fractal-noise grain overlay. Kept as a data URI because it is a one-off
// decorative texture — expressing it as a Tailwind arbitrary value would be
// unreadable.
const NOISE_SVG =
  "url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22220%22 height=%22220%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.82%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3CfeColorMatrix type=%22saturate%22 values=%220%22/%3E%3C/filter%3E%3Crect width=%22220%22 height=%22220%22 filter=%22url%28%23n%29%22 opacity=%220.5%22/%3E%3C/svg%3E')"

export default function AmbientBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-canvas [contain:strict]"
    >
      {/* Parallax group — two soft purple blooms. */}
      <div data-par="0.02" className="absolute -inset-[12%] will-change-transform">
        <div className="absolute top-[6%] left-[-18%] h-[70%] w-[64%] bg-[radial-gradient(ellipse_58%_50%_at_50%_50%,rgba(126,84,242,0.1)_0%,rgba(96,64,220,0.032)_44%,rgba(96,64,220,0)_74%)] blur-[40px]" />
        <div className="absolute right-[-16%] bottom-[-24%] h-[78%] w-[66%] bg-[radial-gradient(ellipse_55%_52%_at_50%_50%,rgba(88,74,235,0.085)_0%,rgba(88,74,235,0.026)_46%,rgba(88,74,235,0)_76%)] blur-[48px]" />
      </div>

      {/* Vignette. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_66%_56%_at_50%_42%,rgba(0,0,0,0)_44%,rgba(2,2,5,0.55)_78%,rgba(2,2,5,0.86)_100%)]" />

      {/* Grain. */}
      <div
        className="absolute inset-0 opacity-[0.34] mix-blend-overlay"
        style={{ backgroundImage: NOISE_SVG, backgroundSize: '220px 220px' }}
      />
    </div>
  )
}
