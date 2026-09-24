import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import McpToolSection from '@/components/catalogue/McpToolSection'
import { useToolIndex } from '@/hooks/useToolIndex'
import AddToKartSection from '@/pages/home/sections/AddToKartSection'
import CommunitySection from '@/pages/home/sections/CommunitySection'
import Hero from '@/pages/home/sections/Hero'
import HowPeopleAreUsingAISection from '@/pages/home/sections/HowPeopleAreUsingAISection'
import SavingsSection from '@/pages/home/sections/SavingsSection'
import type { Tool } from '@/types/tool'

/*
 * /mcp-servers — the MCP kind's own version of Home.
 *
 * Source: no design screen exists for this yet. Home is the "AI Workflows"
 * kind's main page, so this reuses its exact shape for the "MCP Servers" kind:
 * Hero and How People Are Using AI, same components, then three tool sections
 * standing in for Home's AI for Your Work / Featured / Recently Added, then
 * Home's closing three sections VERBATIM (Savings, Community, Add to Kart).
 * Only Blog Insights is dropped — nothing about a WordPress journal is
 * specific to a kind.
 *
 * Hero and How People Are Using AI are not quite verbatim: each takes an
 * optional override (`Hero`'s `headlineSuffix`, `HowPeopleAreUsingAISection`
 * `heading`, `SavingsSection` `heading`) so THIS page can read "Get the Best
 * MCP for It.", "How People Are Using MCP" and "See What MCP Can Save You"
 * without a second copy of any of them — Home passes none of these props, so
 * its own wording is untouched.
 *
 * There is no assistant here. Hero is given `onSearch` instead of an
 * assistant, which drops the chat panel, the plan panel and the setup card and
 * sends the search box and its task chips to Browse. Real tool names (e.g.
 * "Notion AI"), the site's own brand ("AI Tool Kart"), and the usage stories'
 * "AI setup" chips are deliberately left alone: those stories are generic
 * illustrative content that doesn't actually feature MCP servers, so relabelling
 * them would misdescribe what they show.
 *
 * The three tool sections are not Home's own Featured/Recently
 * Added/AiForYourWork components: those own their own catalogue reads and
 * editorial config (FEATURED_SELECTION, AI_SETUPS) built for the whole
 * catalogue, not for an arbitrary subset. McpToolSection is the shared shape
 * instead — same eyebrow/heading/band language, same CatalogueToolGrid/Card —
 * fed three different slices of ONE array this page holds.
 *
 * ── The data path ────────────────────────────────────────────────────────────
 *
 *   McpServersPage
 *     └─ useToolIndex ─ services/tools.ts ─ GET /api/tools (shared, cached once)
 *
 * The SAME module-level read every other catalogue-backed page waits on,
 * filtered to `tool.isMcpServer` over the array this page already holds — no
 * new endpoint, no new query parameter. `isMcpServer` is real catalogue data
 * (server/src/catalogue/data/tools.json), not a client-side guess — a tool's
 * own record says so, or it doesn't.
 */

/** How many of the MCP-flagged tools "Featured" and "Recently Added" show. */
const SECTION_COUNT = 6

export default function McpServersPage() {
  const navigate = useNavigate()
  const { index, isLoading, failed, retry } = useToolIndex()

  /*
   * No assistant on this page, so the hero search is a Browse search. Browse
   * has no MCP-only filter, so this searches the whole catalogue.
   */
  const search = useCallback(
    (query: string) => navigate(`/browse?${new URLSearchParams({ q: query })}`),
    [navigate],
  )

  const servers = useMemo(() => {
    if (!index) return []
    return [...index.values()].filter((tool) => tool.isMcpServer)
  }, [index])

  const forWork = useMemo(
    () => [...servers].sort((a, b) => a.name.localeCompare(b.name)),
    [servers],
  )

  const featured = useMemo(
    () => [...servers].sort((a, b) => b.pop - a.pop || b.rating - a.rating).slice(0, SECTION_COUNT),
    [servers],
  )

  const recentlyAdded = useMemo(
    () =>
      servers
        .filter((tool) => tool.addedAt)
        .sort((a, b) => (b.addedAt as string).localeCompare(a.addedAt as string))
        .slice(0, SECTION_COUNT),
    [servers],
  )

  const compare = useCallback(
    (tool: Tool) => navigate(`/compare?tool=${encodeURIComponent(tool.slug)}`),
    [navigate],
  )

  // One retry covers every section below: they all read the same failed index.
  const showError = failed && !isLoading

  return (
    <>
      <Hero onSearch={search} headlineSuffix="Get the Best MCP for It." />
      <HowPeopleAreUsingAISection heading="How People Are Using MCP" />

      {showError ? (
        <section className="relative mx-auto max-w-site px-8 py-16">
          <div
            role="alert"
            className="rounded-panel border border-dashed border-white/[0.13] bg-[linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.016)_100%)] px-6 py-16 text-center"
          >
            <p className="text-[20px] font-semibold text-ink">The catalogue could not be loaded</p>
            <p className="mt-[10px] text-[14.5px] leading-[1.55] text-muted-dim">
              The MCP server sections below need the catalogue and could not reach it.
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-5 inline-flex h-[46px] cursor-pointer items-center gap-2 rounded-pill border border-white/[0.22] bg-[linear-gradient(180deg,#B08CFF_0%,#8858F2_48%,#6A32DC_100%)] px-[22px] text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_16px_32px_-20px_rgba(116,80,244,0.95)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-px"
            >
              Try again
            </button>
          </div>
        </section>
      ) : (
        <>
          <McpToolSection
            tone="violet"
            eyebrow="Built for the job"
            heading="MCP for Your Work"
            description="Every catalogue tool that ships an official MCP server — a connector an AI assistant can call directly, rather than a workflow a person runs by hand."
            tools={forWork}
            isLoading={isLoading}
            onCompare={compare}
          />

          <McpToolSection
            tone="gold"
            eyebrow="Editors' desk"
            heading="Featured MCPs"
            tools={featured}
            isLoading={isLoading}
            onCompare={compare}
          />

          <McpToolSection
            tone="blue"
            eyebrow="Fresh off the platform"
            heading="Recently Added MCPs"
            tools={recentlyAdded}
            isLoading={isLoading}
            onCompare={compare}
          />
        </>
      )}

      <SavingsSection heading="See What MCP Can Save You" />
      <CommunitySection />
      <AddToKartSection />
    </>
  )
}
