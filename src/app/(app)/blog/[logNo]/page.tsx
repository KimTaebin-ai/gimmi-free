import { notFound } from "next/navigation";
import { PostReader } from "@/components/blog/post-reader";
import { getBlogPost } from "@/lib/actions/blog";

export default async function BlogPostPage({ params }: { params: Promise<{ logNo: string }> }) {
  const { logNo } = await params;
  const post = await getBlogPost(logNo);
  if (!post) notFound();

  return <PostReader post={post} />;
}
