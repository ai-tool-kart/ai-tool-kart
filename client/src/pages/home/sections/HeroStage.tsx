/*
 * Home hero backdrop — the two large 3D "wing" chevrons plus the focal/floor
 * glows and vignettes behind the headline.
 *
 * Source: AI Tool Kart Site.dc.html, the [data-stage] block (home only).
 *
 * The wings are a stroked chevron path filled with a linear gradient and run
 * through a depth filter: three bloom passes, an inner shadow, two inner/edge
 * highlights and a specular lighting pass, merged in order. Ported verbatim —
 * it is the most distinctive element of the hero.
 *
 * Both wings share the filter; only the gradient direction, path and animation
 * differ, so it is parameterised by side.
 */

function Wing({ side }: { side: 'left' | 'right' }) {
  const gradientId = `akGrad${side === 'left' ? 'L' : 'R'}`
  const filterId = `akDepth${side === 'left' ? 'L' : 'R'}`
  const path =
    side === 'left' ? 'M52 74 L636 620 L52 1166' : 'M648 74 L64 620 L648 1166'

  return (
    <svg
      viewBox="0 0 700 1240"
      width="700"
      height="1240"
      aria-hidden="true"
      className="absolute inset-0 block overflow-visible"
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1={side === 'left' ? '1' : '0'}
          y1="0.08"
          x2={side === 'left' ? '0' : '1'}
          y2="0.92"
        >
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.66" />
          <stop offset="13%" stopColor="#EFE3FF" stopOpacity="0.4" />
          <stop offset="36%" stopColor="#B084FA" stopOpacity="0.19" />
          <stop offset="62%" stopColor="#7848E4" stopOpacity="0.07" />
          <stop offset="90%" stopColor="#5A34C0" stopOpacity="0" />
        </linearGradient>

        <filter
          id={filterId}
          x="-45%"
          y="-18%"
          width="190%"
          height="136%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="38" result="bloomFar" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="13" result="bloomMid" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="bloomNear" />

          <feOffset in="SourceAlpha" dx="3.5" dy="6" result="isOff" />
          <feGaussianBlur in="isOff" stdDeviation="5.5" result="isBlur" />
          <feComposite
            in="isBlur"
            in2="SourceAlpha"
            operator="arithmetic"
            k2="-1"
            k3="1"
            result="isMask"
          />
          <feFlood floodColor="#150B2C" floodOpacity="0.8" result="isCol" />
          <feComposite in="isCol" in2="isMask" operator="in" result="innerShadow" />

          <feOffset in="SourceAlpha" dx="-2.5" dy="-4" result="ihOff" />
          <feGaussianBlur in="ihOff" stdDeviation="3.2" result="ihBlur" />
          <feComposite
            in="ihBlur"
            in2="SourceAlpha"
            operator="arithmetic"
            k2="-1"
            k3="1"
            result="ihMask"
          />
          <feFlood floodColor="#FFFFFF" floodOpacity="0.5" result="ihCol" />
          <feComposite in="ihCol" in2="ihMask" operator="in" result="innerHigh" />

          <feOffset in="SourceAlpha" dx="-0.9" dy="-1.1" result="ehOff" />
          <feGaussianBlur in="ehOff" stdDeviation="0.7" result="ehBlur" />
          <feComposite
            in="ehBlur"
            in2="SourceAlpha"
            operator="arithmetic"
            k2="-1"
            k3="1"
            result="ehMask"
          />
          <feFlood floodColor="#F6EEFF" floodOpacity="0.85" result="ehCol" />
          <feComposite in="ehCol" in2="ehMask" operator="in" result="edgeHigh" />

          <feGaussianBlur in="SourceAlpha" stdDeviation="4.5" result="bump" />
          <feSpecularLighting
            in="bump"
            surfaceScale="6"
            specularConstant="0.62"
            specularExponent="26"
            lightingColor="#E9DDFF"
            result="spec"
          >
            <feDistantLight azimuth="232" elevation="60" />
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceAlpha" operator="in" result="specClip" />

          <feMerge>
            <feMergeNode in="bloomFar" />
            <feMergeNode in="bloomMid" />
            <feMergeNode in="bloomNear" />
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="innerShadow" />
            <feMergeNode in="innerHigh" />
            <feMergeNode in="edgeHigh" />
            <feMergeNode in="specClip" />
          </feMerge>
        </filter>
      </defs>

      <path
        d={path}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="30"
        strokeLinejoin="round"
        strokeLinecap="round"
        filter={`url(#${filterId})`}
      />
    </svg>
  )
}

export default function HeroStage() {
  return (
    <div
      data-stage="1"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[1160px] overflow-hidden"
    >
      <div
        data-par="-0.05"
        className="absolute top-0 bottom-0 w-0 [left:min(15.5%,calc(50%_-_352px))] [perspective:2600px]"
      >
        <div className="absolute top-[62%] left-[-700px] mt-[-620px] h-[1240px] w-[700px] origin-center [animation:akIdleA_62s_cubic-bezier(.42,0,.58,1)_infinite]">
          <Wing side="left" />
        </div>
      </div>

      <div
        data-par="-0.045"
        className="absolute top-0 bottom-0 w-0 [left:max(84.5%,calc(50%_+_352px))] [perspective:2600px]"
      >
        <div className="absolute top-[32%] left-0 mt-[-620px] h-[1240px] w-[700px] origin-center [animation:akIdleB_74s_cubic-bezier(.42,0,.58,1)_infinite] [animation-delay:-25s]">
          <Wing side="right" />
        </div>
      </div>

      {/* Focal glow behind the headline. */}
      <div
        data-focal="1"
        className="absolute top-[360px] left-1/2 -ml-[510px] h-[500px] w-[1020px] bg-[radial-gradient(ellipse_44%_42%_at_50%_52%,rgba(116,78,236,0.16)_0%,rgba(104,70,224,0.045)_46%,rgba(104,70,224,0)_74%)] blur-[52px]"
      />
      {/* Floor bounce beneath the search bar. */}
      <div
        data-floor="1"
        className="absolute top-[700px] left-1/2 -ml-[590px] h-[230px] w-[1180px] bg-[radial-gradient(ellipse_40%_46%_at_50%_0%,rgba(168,136,252,0.11)_0%,rgba(120,80,232,0.03)_44%,rgba(120,80,232,0)_74%)] blur-[34px]"
      />
      {/* Centre vignette so the wings read as background. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_42%_44%_at_50%_28%,rgba(4,4,7,0.94)_0%,rgba(4,4,7,0.62)_46%,rgba(4,4,7,0)_78%)]" />
      {/* Fade the stage out into the page. */}
      <div className="absolute right-0 bottom-0 left-0 h-[340px] bg-[linear-gradient(180deg,rgba(4,4,7,0)_0%,#040407_92%)]" />
    </div>
  )
}
