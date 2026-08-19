/*
 * Renders WordPress `content.rendered`.
 *
 * The HTML comes from our own CMS, which is a trusted author surface, so it is
 * injected as-is rather than stripped — stripping would drop the editor's
 * formatting, embedded images and block markup.
 *
 * All typography lives in styles/article.css, scoped to `.article-content`, so
 * WordPress's markup cannot restyle anything outside this block.
 */

interface ArticleContentProps {
  html: string
}

export default function ArticleContent({ html }: ArticleContentProps) {
  return <div className="article-content" dangerouslySetInnerHTML={{ __html: html }} />
}
