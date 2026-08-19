import { Fragment, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import ArticleContent from '@/components/blog/ArticleContent'
import BlogCategoryPill from '@/components/blog/BlogCategoryPill'
import BlogErrorState from '@/components/blog/BlogErrorState'
import BlogMedia from '@/components/blog/BlogMedia'
import Section from '@/components/layout/Section'
import Button from '@/components/ui/Button'
import { useBlogPost } from '@/hooks/useBlogPosts'
import type { BlogPost } from '@/types/blog'
import { formatPostDate } from '@/utils/blog'

/*
 * /blog/:slug — one article.
 *
 * The post is fetched by slug in a single request (see getPostBySlug); the
 * listing is never loaded to find it.
 *
 * The column is narrower than the listing's 1240px container — 760px, roughly
 * 70 characters at the body size — because this page is read top to bottom.
 */

function ArticleSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="h-[22px] w-[200px] rounded-pill bg-white/[0.06]" />
      <div className="mt-5 h-[44px] w-full rounded-[8px] bg-white/[0.06]" />
      <div className="mt-3 h-[44px] w-3/4 rounded-[8px] bg-white/[0.06]" />
      <div className="mt-8 aspect-[16/9] w-full rounded-card bg-white/[0.04]" />
      <div className="mt-10 space-y-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[16px] w-full rounded-[6px] bg-white/[0.05]" />
        ))}
      </div>
    </div>
  )
}

/** Author · date · reading time, with the pieces the post is missing dropped. */
function ArticleMeta({ post }: { post: BlogPost }) {
  const publishedAt = formatPostDate(post.publishedAt)
  const items: ReactNode[] = []

  if (post.author) items.push(post.author)
  if (publishedAt) items.push(<time dateTime={post.publishedAt}>{publishedAt}</time>)
  items.push(`${post.readingMinutes} min read`)

  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-[10px] gap-y-2 text-[13.5px] text-subtle-dim">
      {items.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <span aria-hidden="true" className="text-white/25">
              ·
            </span>
          )}
          {item}
        </Fragment>
      ))}
    </div>
  )
}

export default function BlogArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: post, isLoading, error, retry } = useBlogPost(slug)

  return (
    <Section spacing="sub" className="pb-4">
      <div className="mx-auto max-w-[760px]">
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 text-[13.5px] font-medium text-subtle-soft transition-colors duration-200 hover:text-ink"
        >
          <span aria-hidden="true">←</span> Back to the blog
        </Link>

        {isLoading && (
          <div className="mt-8">
            <ArticleSkeleton />
          </div>
        )}

        {!isLoading && error && (
          <div className="mt-8">
            <BlogErrorState message={error} onRetry={retry} />
          </div>
        )}

        {/* WordPress answered, but nothing is published under this slug. */}
        {!isLoading && !error && !post && (
          <div className="mt-8 rounded-card-lg border border-dashed border-white/[0.13] bg-white/[0.035] px-6 py-16 text-center">
            <h1 className="text-[24px] font-semibold text-ink">We couldn't find that story</h1>
            <p className="mx-auto mt-[10px] max-w-[46ch] text-[14.5px] leading-[1.6] text-pretty text-muted">
              It may have been unpublished or renamed since you last saw it.
            </p>
            <div className="mt-5">
              <Button variant="outline" to="/blog">
                Back to the blog
              </Button>
            </div>
          </div>
        )}

        {!isLoading && !error && post && (
          <article className="mt-8">
            <header>
              <BlogCategoryPill category={post.category} variant="featured" />

              <h1 className="mt-5 text-[clamp(30px,4.4vw,46px)] leading-[1.1] font-bold tracking-[-0.035em] text-balance text-ink-bright">
                {post.title}
              </h1>

              <ArticleMeta post={post} />

              {post.featuredImage && (
                <BlogMedia
                  src={post.featuredImage}
                  alt={post.featuredImageAlt}
                  radius="featured"
                  priority
                  className="mt-9 aspect-[16/9] w-full"
                />
              )}
            </header>

            <div className="mt-10">
              <ArticleContent html={post.content} />
            </div>

            <footer className="mt-14 border-t border-hairline pt-8">
              <Button variant="outline" to="/blog">
                ← More from the journal
              </Button>
            </footer>
          </article>
        )}
      </div>
    </Section>
  )
}
