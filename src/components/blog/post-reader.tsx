import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Film } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BlogPostDetail } from "@/lib/actions/blog";
import type { PostBlock } from "@/lib/naver/post-body";

/**
 * 앱 안에서 글 전문을 읽는 화면.
 *
 * 네이버 HTML을 그대로 심지 않고 블록 배열을 우리 컴포넌트로 그린다
 * (XSS도 막고, 다크모드·본문 폭 같은 앱의 규칙을 그대로 따르게 된다).
 * 원문으로 나가는 링크는 **따로 있는 버튼** 하나뿐이다 — 글을 누르면 앱 안에서 읽히고,
 * 네이버로 나갈지는 사용자가 정한다.
 */
function Block({ block }: { block: PostBlock }) {
  switch (block.type) {
    case "heading":
      return <h2 className="mt-8 text-lg font-semibold first:mt-0">{block.text}</h2>;

    case "text":
      return <p className="leading-[1.9] whitespace-pre-wrap">{block.text}</p>;

    case "quote":
      return (
        <blockquote className="border-l-2 pl-4 text-muted-foreground italic">
          <p className="leading-[1.9]">{block.text}</p>
          {block.cite && <cite className="mt-1 block text-xs not-italic">— {block.cite}</cite>}
        </blockquote>
      );

    case "image":
      return (
        <figure className="my-2">
          {/* 네이버 CDN 이미지라 next/image 최적화 대신 원본을 그대로 쓴다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.url}
            alt={block.caption ?? ""}
            loading="lazy"
            className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg"
          />
          {block.caption && (
            <figcaption className="mt-1.5 text-center text-xs text-muted-foreground">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );

    case "link":
      return (
        <a
          href={block.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-accent/40"
        >
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{block.title ?? block.url}</span>
        </a>
      );

    case "video":
      // 네이버 동영상은 플레이어 주소를 안정적으로 뽑을 수 없어 원문으로 보낸다
      return (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <Film className="size-4 shrink-0" />
          <span>{block.caption ?? "동영상 — 원문에서 볼 수 있어요"}</span>
        </div>
      );

    case "divider":
      return <hr className="my-2" />;
  }
}

export function PostReader({ post }: { post: BlogPostDetail }) {
  return (
    <article className="mx-auto max-w-2xl p-4 pb-16">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/blog">
            <ArrowLeft className="size-3.5" />
            목록
          </Link>
        </Button>
        {/* 원문으로 나가는 유일한 출구 — 카드 전체가 아니라 이 버튼이 맡는다 */}
        <Button variant="outline" size="sm" asChild>
          <a href={post.url} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" />
            네이버에서 보기
          </a>
        </Button>
      </div>

      <header className="border-b pb-4">
        <h1 className="text-2xl font-bold leading-snug">{post.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <span>{format(new Date(post.publishedAt), "yyyy년 M월 d일", { locale: ko })}</span>
          {post.category && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
              {post.category}
            </Badge>
          )}
          {post.tags.map((t) => (
            <Badge key={t} variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
              #{t}
            </Badge>
          ))}
        </div>
      </header>

      {post.blocks && post.blocks.length > 0 ? (
        <div className="mt-6 space-y-4 text-[15px]">
          {post.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 본문을 가져오지 못했어요. 목록에서 &quot;새로고침&quot;을 누르면 받아옵니다.
        </div>
      )}

      {(post.prev || post.next) && (
        <nav className="mt-10 grid gap-2 border-t pt-4 sm:grid-cols-2">
          {post.prev ? (
            <Link
              href={`/blog/${post.prev.logNo}`}
              className="group flex min-w-0 items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-accent/40"
            >
              <ChevronLeft className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-[11px] text-muted-foreground">이전 글</span>
                <span className="block truncate text-sm">{post.prev.title}</span>
              </span>
            </Link>
          ) : (
            <span />
          )}
          {post.next && (
            <Link
              href={`/blog/${post.next.logNo}`}
              className="group flex min-w-0 items-center justify-end gap-2 rounded-lg border p-3 text-right transition-colors hover:bg-accent/40"
            >
              <span className="min-w-0">
                <span className="block text-[11px] text-muted-foreground">다음 글</span>
                <span className="block truncate text-sm">{post.next.title}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          )}
        </nav>
      )}
    </article>
  );
}
