import type { UsageStory } from '@/types/usageStory'
import { storyInitials } from '@/utils/usageStories'

/*
 * The 60px circle at the top of a story card.
 *
 * Source: AI Tool Kart Site.dc.html — the `image-slot shape="circle"` inside the
 * stories loop.
 *
 * ── Why initials rather than the handoff's dashed slot ───────────────────────
 *
 * Same decision FeaturedToolTile made for its square: at 60px a dashed ring is
 * mostly ring, and the record already carries a real identity to show. The
 * difference from the tool sections is that no photograph will ever be bundled
 * to replace it — a stock portrait standing in for a person who does not exist
 * is the one detail that would make an illustrative card read as a verified
 * customer. `avatarUrl` is supported so a real, sourced portrait can arrive with
 * a real, sourced story; until then the initials are the honest mark.
 *
 * When `src` arrives the frame is unchanged — same circle, same border — and the
 * image simply covers it, so nothing reflows on the day portraits land.
 */

interface StoryAvatarProps {
  story: UsageStory
}

export default function StoryAvatar({ story }: StoryAvatarProps) {
  const src = story.avatarUrl?.trim()

  return (
    <div className="relative h-[60px] w-[60px] flex-none overflow-hidden rounded-full border border-[rgba(248,224,224,0.2)] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_12px_24px_-16px_rgba(198,96,116,0.8)]">
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(158deg,rgba(240,169,180,0.16),rgba(28,16,18,0.9))] text-[19px] font-semibold tracking-[-0.02em] text-[#F2DADE]"
        >
          {storyInitials(story)}
        </span>
      )}
    </div>
  )
}
