/*
 * THE AUTHORITATIVE SUBMISSION SCHEMA — SPEC-submit-backend.md §6.
 *
 * `.strict()` throughout, the same reasoning as assistant/schema.ts: a
 * strict outer object with a loose inner one is not a closed schema, it is
 * a closed front door next to an open window. Here the concrete stake is
 * §11's own warning — if a client could smuggle an extra key through, that
 * key could be `"status":"approved"`, and anyone could self-approve
 * straight into the live catalogue. `.strict()` is what makes that
 * structurally impossible rather than merely unlikely.
 *
 * Every message is written for the person looking at the form, because the
 * route (a later slice) forwards `issues` straight into
 * `{ fields: { <name>: <message> } }` — these strings are not logs, they
 * are what the client renders next to the input.
 *
 * ── Why category and pricingModel are read from taxonomy.ts, not written
 *    here ─────────────────────────────────────────────────────────────────
 *
 * The client's own picker already restricts these to the taxonomy's values
 * — until the taxonomy fetch fails, at which point SubmitEssentialsSection
 * falls back to a free-text input and casts the result `as ToolCategoryName`,
 * a cast that is erased at runtime and enforces nothing. This schema is the
 * only place membership is actually checked, which is exactly why it must
 * read the same live arrays the catalogue validates records against
 * (catalogue/taxonomy.ts) rather than a second, driftable copy.
 *
 * ── The URL check, and what it is not ───────────────────────────────────
 *
 * http/https-only plus a localhost/private-range block. This is GARBAGE
 * REJECTION ONLY, not an SSRF fix (§6's own note) — nothing fetches this URL
 * yet. It exists so a submission cannot claim its "public website" is the
 * submitter's own loopback or LAN address, written as a literal IP or one of
 * the notations below. It does NOT and cannot catch a hostname that merely
 * *resolves* to a private address (`internal.corp`, a DNS rebinding target,
 * a domain someone points at 127.0.0.1 tomorrow) — that needs an actual DNS
 * lookup, which is not performed here and must not be added here. When
 * metadata fetching is built later, real SSRF protection — resolve, check
 * the resolved address, then fetch — belongs at that fetch site, checked
 * again at connection time, not bolted onto this string check.
 *
 * `new URL()` canonicalizes shorthand, decimal, hex and octal IPv4 notation
 * before this ever inspects `hostname` (verified empirically:
 * `http://2130706433/`, `http://0x7f.0.0.1/` and `http://0177.0.0.1/` all
 * resolve to hostname "127.0.0.1"), so the IPv4 check only has to compare
 * against the canonical dotted form. It similarly canonicalizes an
 * IPv4-mapped IPv6 literal's dotted suffix into two hex groups (verified:
 * `http://[::ffff:127.0.0.1]/` resolves to hostname "[::ffff:7f00:1]"), which
 * is why isBlockedIPv6 decodes that hex-group form rather than matching a
 * dotted one that never actually appears.
 */

import { z } from 'zod'
import { PRICING_MODELS, TOOL_CATEGORIES } from '../catalogue/taxonomy.ts'
import { SUBMISSIONS } from '../config/limits.ts'

/** 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 0.0.0.0/8. */
function isBlockedIPv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname)
  if (!match) return false
  const a = Number(match[1])
  const b = Number(match[2])
  if (a === 127) return true
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 0) return true
  return false
}

/**
 * The IPv4 address an `::ffff:` IPv4-mapped IPv6 literal encodes, as a
 * dotted-decimal string — or null if `inner` isn't that form. Checks the
 * hex-group form `new URL()` actually produces (`::ffff:7f00:1`) and, for
 * safety, a literal dotted suffix too, in case some input ever carries one
 * through unchanged.
 */
function ipv4FromMappedIPv6(inner: string): string | null {
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(inner)
  if (hex) {
    const high = parseInt(hex[1] as string, 16)
    const low = parseInt(hex[2] as string, 16)
    return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join('.')
  }
  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(inner)
  return dotted ? (dotted[1] as string) : null
}

/**
 * ::1 (loopback), :: (unspecified), fe80::/10 (link-local), fc00::/7
 * (unique local), and an IPv4-mapped literal (::ffff:a.b.c.d) whose mapped
 * address itself falls in a blocked IPv4 range. `url.hostname` keeps a
 * literal's brackets — "[::1]" — so this expects them and strips them itself.
 */
function isBlockedIPv6(bracketedHostname: string): boolean {
  const inner = bracketedHostname.slice(1, -1)
  if (inner === '::1' || inner === '::') return true
  if (/^fe[89ab][0-9a-f]:/.test(inner)) return true
  if (/^f[cd][0-9a-f]{2}:/.test(inner)) return true

  const mappedIPv4 = ipv4FromMappedIPv6(inner)
  if (mappedIPv4 && isBlockedIPv4(mappedIPv4)) return true

  return false
}

function isBlockedHost(hostname: string): boolean {
  if (hostname === 'localhost') return true
  if (hostname.startsWith('[') && hostname.endsWith(']')) return isBlockedIPv6(hostname)
  return isBlockedIPv4(hostname)
}

const SiteUrlSchema = z
  .string({ message: 'Enter your website address.' })
  .trim()
  .min(1, { message: 'Enter your website address.' })
  .max(SUBMISSIONS.maxSiteUrlChars, {
    message: `Website address must be ${SUBMISSIONS.maxSiteUrlChars} characters or fewer.`,
  })
  .superRefine((value, ctx) => {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid website address, like https://example.com.' })
      return
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', message: 'Website address must start with http:// or https://.' })
      return
    }
    if (isBlockedHost(url.hostname)) {
      ctx.addIssue({ code: 'custom', message: "That address isn't a public website." })
    }
  })

/** `required, trimmed, 1–max` — the shape name/tagline/description share. */
function requiredText(label: string, max: number) {
  return z
    .string({ message: `Enter ${label}.` })
    .trim()
    .min(1, { message: `Enter ${label}.` })
    .max(max, { message: `${capitalize(label)} must be ${max} characters or fewer.` })
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const FaqSchema = z
  .object({
    question: requiredText('a question', SUBMISSIONS.maxFaqQuestionChars),
    answer: requiredText('an answer', SUBMISSIONS.maxFaqAnswerChars),
  })
  .strict()

export const SubmissionInputSchema = z
  .object({
    siteUrl: SiteUrlSchema,
    name: requiredText('your tool’s name', SUBMISSIONS.maxNameChars),
    tagline: requiredText('a tagline', SUBMISSIONS.maxTaglineChars),
    description: requiredText('a description', SUBMISSIONS.maxDescriptionChars),

    category: z.enum(TOOL_CATEGORIES, { message: 'Choose a category from the list.' }),
    pricingModel: z.enum(PRICING_MODELS, { message: 'Choose a pricing model from the list.' }),

    price: z
      .string()
      .trim()
      .max(SUBMISSIONS.maxPriceChars, {
        message: `Price must be ${SUBMISSIONS.maxPriceChars} characters or fewer.`,
      })
      .optional(),

    tags: z
      .array(
        z.string().trim().min(1).max(SUBMISSIONS.maxTagChars, {
          message: `Each tag must be ${SUBMISSIONS.maxTagChars} characters or fewer.`,
        }),
        { message: 'Tags must be a list.' },
      )
      .max(SUBMISSIONS.maxTags, { message: `Add up to ${SUBMISSIONS.maxTags} tags.` }),

    audience: z
      .string()
      .trim()
      .max(SUBMISSIONS.maxAudienceChars, {
        message: `Audience must be ${SUBMISSIONS.maxAudienceChars} characters or fewer.`,
      })
      .optional(),

    alternatives: z
      .array(
        z.string().trim().min(1).max(SUBMISSIONS.maxAlternativeChars, {
          message: `Each alternative must be ${SUBMISSIONS.maxAlternativeChars} characters or fewer.`,
        }),
        { message: 'Alternatives must be a list.' },
      )
      .max(SUBMISSIONS.maxAlternatives, {
        message: `Add up to ${SUBMISSIONS.maxAlternatives} alternatives.`,
      }),

    faqs: z
      .array(FaqSchema, { message: 'Questions must be a list.' })
      .max(SUBMISSIONS.maxFaqs, { message: `Add up to ${SUBMISSIONS.maxFaqs} questions.` }),

    launchStory: z
      .string()
      .trim()
      .max(SUBMISSIONS.maxLaunchStoryChars, {
        message: `Launch story must be ${SUBMISSIONS.maxLaunchStoryChars} characters or fewer.`,
      })
      .optional(),

    plan: z.enum(['free', 'featured'], { message: 'Choose Free or Featured.' }),

    launchWeekId: z
      .string({ message: 'Choose a launch week.' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Choose a valid launch week.' }),
  })
  .strict()

export type SubmissionInput = z.infer<typeof SubmissionInputSchema>
