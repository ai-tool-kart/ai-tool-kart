import type { FeaturedMediaOverride } from '@/types/featured'
import type { ToolMediaFields } from '@/types/media'
import type { Tool } from '@/types/tool'

/*
 * Where a tool's picture comes from.
 *
 * One resolution order, in one place, so that the day the catalogue starts
 * serving imagery every surface picks it up at once and no component has to be
 * found and edited:
 *
 *   banner:  tool.interfaceScreenshotUrl → tool.bannerImageUrl → section
 *            override → nothing (the caller draws its media slot)
 *   logo:    tool.logoUrl → section override → nothing (the caller draws the
 *            record's monogram)
 *
 * The catalogue is first in both because a tool's own asset is the truth and a
 * section override is a stopgap; a curated banner hung on this week's pick must
 * not outrank the product's real screenshot once one exists.
 *
 * `undefined` is a normal, expected answer today — every one of these fields is
 * unset across all 66 records. The callers are built around that rather than
 * treating it as an error, which is why nothing here throws or logs.
 *
 * The parameter type is `Tool & Partial<ToolMediaFields>`: a plain `Tool`
 * satisfies it because every media field is optional, so callers pass a
 * catalogue record unchanged and this reads fields that are simply not there
 * yet. No cast, and no field invented on the API's contract type.
 */

/** A URL is only usable if it is a non-empty string. Trims defensively. */
function usable(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * The wide image for a featured card, or undefined when there is none.
 *
 * A screenshot of the product beats a curated banner: the section is telling a
 * reader what the tool looks like, and a marketing image is a weaker answer to
 * that question than the interface itself.
 */
export function resolveToolBanner(
  tool: Tool & Partial<ToolMediaFields>,
  override?: FeaturedMediaOverride,
): string | undefined {
  return (
    usable(tool.interfaceScreenshotUrl) ??
    usable(tool.bannerImageUrl) ??
    usable(override?.bannerImageUrl)
  )
}

/**
 * The tool's mark, or undefined — in which case the caller renders `tool.mono`.
 *
 * The monogram is not a placeholder to be replaced grudgingly; it is the
 * catalogue's own two-letter identity for the tool and is what Browse, the
 * assistant and the setup stacks already show. A logo, when one exists, simply
 * sits on top of it.
 */
export function resolveToolLogo(
  tool: Tool & Partial<ToolMediaFields>,
  override?: FeaturedMediaOverride,
): string | undefined {
  return usable(tool.logoUrl) ?? usable(override?.logoUrl)
}
