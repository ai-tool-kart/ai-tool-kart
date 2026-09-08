/*
 * Tool media, before there is any.
 *
 * The catalogue records no imagery today — verified against all 66: there is no
 * logo, banner or screenshot field on the wire, and no asset in the repository
 * pretends otherwise. That is a deliberate phase decision: media belongs to the
 * database/asset layer, not to a React file holding sixty-six hardcoded paths.
 *
 * What this file does is name the fields the catalogue is EXPECTED to grow, so
 * the components can be built to consume them now and light up later without
 * being rewritten. Every field is optional, which is why a plain `Tool` already
 * satisfies `Tool & Partial<ToolMediaFields>` and no cast is needed at any call
 * site — the resolver simply finds nothing there yet.
 *
 * These names are provisional. When the real schema lands, renaming them here
 * and in utils/toolMedia.ts is the whole migration; nothing in a component
 * mentions a media field by name.
 *
 * NOT declared on `Tool` itself: types/tool.ts mirrors the server's `ApiTool`
 * field for field and is the contract with a running API. Putting a field there
 * that the API does not serve would make that file wrong the moment someone
 * trusted it.
 */

export interface ToolMediaFields {
  /** The tool's mark. Falls back to the record's `mono` monogram. */
  logoUrl?: string
  /** A wide editorial banner, if the catalogue ever curates one. */
  bannerImageUrl?: string
  /** A shot of the product itself — what Today's Pick wants most. */
  interfaceScreenshotUrl?: string
}
