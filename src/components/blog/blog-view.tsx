"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";
import { BookOpen, ExternalLink, Info, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getBlogStatus,
  listBlogPosts,
  refreshBlogPosts,
} from "@/lib/actions/blog";

export function BlogView() {
  const qc = useQueryClient();
  const { data: posts, isLoading } = useQuery({
    queryKey: ["blog-posts"],
    queryFn: () => listBlogPosts(),
  });
  const { data: status } = useQuery({
    queryKey: ["blog-status"],
    queryFn: () => getBlogStatus(),
  });

  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const refresh = useMutation({
    mutationFn: () => refreshBlogPosts(),
    onSuccess: (r) => {
      setNotice({ ok: r.ok, message: r.message });
      if (r.ok) {
        qc.invalidateQueries({ queryKey: ["blog-posts"] });
        qc.invalidateQueries({ queryKey: ["blog-status"] });
      }
    },
  });

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (posts ?? []).filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.summary ?? "").toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [posts, query, category]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">블로그</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {status?.blogId ? (
              <>
                네이버 블로그{" "}
                <a
                  href={`https://blog.naver.com/${status.blogId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  @{status.blogId}
                </a>
                {status.total > 0 && ` · ${status.total}개`}
                {status.total > 0 &&
                  status.withBody < status.total &&
                  ` (본문 ${status.withBody}개)`}
                {status.lastFetchedAt &&
                  ` · ${formatDistanceToNow(new Date(status.lastFetchedAt), {
                    addSuffix: true,
                    locale: ko,
                  })} 갱신`}
              </>
            ) : (
              "NAVER_BLOG_ID가 설정되어 있지 않습니다."
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={refresh.isPending || !status?.blogId}
          onClick={() => refresh.mutate()}
        >
          <RefreshCw className={cn("size-3.5", refresh.isPending && "animate-spin")} />
          {refresh.isPending ? "불러오는 중…" : "새로고침"}
        </Button>
      </header>

      {/* 성장 요약이 본문을 읽으려면 임베딩 색인이 필요하다 — 상태를 숨기지 않고 알려준다 */}
      {status?.blogId && status.withBody > 0 && !status.search.enabled && (
        <p className="text-xs text-muted-foreground">
          VOYAGE_API_KEY를 넣으면 본문을 검색 색인으로 만들어 성장 요약이 글 내용까지 읽습니다.
        </p>
      )}
      {status?.search.enabled && status.search.indexedPosts > 0 && (
        <p className="text-xs text-muted-foreground">
          성장 요약이 검색할 수 있는 글 {status.search.indexedPosts}개
        </p>
      )}

      {notice && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border p-3 text-sm",
            notice.ok
              ? "text-muted-foreground"
              : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
          )}
        >
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>{notice.message}</span>
        </div>
      )}

      {/* 검색 + 카테고리 필터 */}
      {(posts?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목·요약·태그 검색"
              className="h-8 pl-8 text-sm"
            />
          </div>
          {status && status.categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <Button
                variant={category === null ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setCategory(null)}
              >
                전체
              </Button>
              {status.categories.map((c) => (
                <Button
                  key={c}
                  variant={category === c ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setCategory(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {(posts?.length ?? 0) === 0 ? (
            <>
              아직 불러온 글이 없어요. &quot;새로고침&quot;을 눌러 네이버에서 글과 본문을
              가져오세요.
            </>
          ) : (
            "조건에 맞는 글이 없어요."
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((post) => (
            // 카드를 누르면 앱 안에서 읽고, 네이버로 나가는 건 아래 버튼이 맡는다.
            // 링크 안에 링크를 넣을 수 없어서 카드 전체를 덮는 오버레이 링크를 쓴다.
            <div
              key={post.id}
              className="group relative flex flex-col overflow-hidden rounded-lg border transition-colors hover:bg-accent/40"
            >
              {post.thumbnailUrl && (
                // 네이버 CDN 이미지라 next/image 최적화 대신 원본을 그대로 쓴다
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="h-32 w-full object-cover"
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col p-3">
                <div className="flex items-start gap-1">
                  <h2 className="line-clamp-2 flex-1 text-sm font-medium">{post.title}</h2>
                  <BookOpen className="mt-0.5 size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                {post.summary && (
                  <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {post.summary}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-1 pt-2 text-[11px] text-muted-foreground">
                  <span>{format(post.publishedAt, "yyyy.M.d", { locale: ko })}</span>
                  {post.category && (
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                      {post.category}
                    </Badge>
                  )}
                  {!post.bodyFetchedAt && <span>· 본문 없음</span>}
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    title="네이버 원문 열기"
                    aria-label={`${post.title} — 네이버 원문 열기`}
                    className="relative z-10 ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-accent hover:text-foreground"
                  >
                    <ExternalLink className="size-3" />
                    원문
                  </a>
                </div>
              </div>
              <Link
                href={`/blog/${post.logNo}`}
                className="absolute inset-0"
                aria-label={`${post.title} 앱에서 읽기`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
