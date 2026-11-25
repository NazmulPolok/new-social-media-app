"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  Flag,
  Globe,
  MessageSquare,
  Send,
  Share2,
  ThumbsUp,
} from "lucide-react";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface PageDetail {
  id: number;
  owner_id: number;
  name: string;
  handle: string;
  category: string;
  about: string;
  website: string;
  is_verified: boolean;
  followers_count: number;
  is_admin: boolean;
  is_following: boolean;
  created_at: string;
}

interface CommentItem {
  id: string;
  author_username: string;
  author_display_name: string;
  text: string;
  created_at: string;
}

interface PagePost {
  id: string;
  author_username: string;
  author_display_name: string;
  content: string;
  image_url: string;
  video_url?: string;
  post_type?: string;
  likes_count: number;
  liked_by_me: boolean;
  my_reaction?: string | null;
  comments: CommentItem[];
  created_at: string;
}

export default function PageDetailView() {
  const params = useParams<{ handle: string }>();
  const { user } = useAuth();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [posts, setPosts] = useState<PagePost[]>([]);
  const [postContent, setPostContent] = useState("");
  const [postImageUrl, setPostImageUrl] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState("");

  const loadPage = async () => {
    if (!params.handle) return;
    const p = await apiFetch<PageDetail>(`/api/communities/pages/${params.handle}`);
    setPage(p);
    const list = await apiFetch<PagePost[]>(`/api/communities/pages/${p.id}/posts`);
    setPosts(list);
  };

  useEffect(() => {
    loadPage().catch((err) => setError(err.message || "Failed to load page"));
  }, [params.handle, user?.id]);

  const handleFollowToggle = async () => {
    if (!page) return;
    await apiFetch(`/api/communities/pages/${page.id}/follow`, { method: "POST" });
    loadPage();
  };

  const handleAdminPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!page || (!postContent.trim() && !postImageUrl.trim())) return;
    setPosting(true);
    setError("");
    try {
      const created = await apiFetch<PagePost>(`/api/communities/pages/${page.id}/posts`, {
        method: "POST",
        body: JSON.stringify({
          content: postContent,
          image_url: postImageUrl,
          post_type: postImageUrl.trim() ? "image" : "text",
        }),
      });
      setPosts((prev) => [created, ...prev]);
      setPostContent("");
      setPostImageUrl("");
    } catch (err: any) {
      setError(err.message || "Failed to publish post");
    } finally {
      setPosting(false);
    }
  };

  const handleAdminShareOnPage = async (post: PagePost) => {
    if (!page || !page.is_admin) return;
    setError("");
    try {
      const shared = await apiFetch<PagePost>(`/api/communities/pages/${page.id}/posts`, {
        method: "POST",
        body: JSON.stringify({
          content: post.content,
          image_url: post.image_url,
          video_url: post.video_url || "",
          post_type: "shared",
        }),
      });
      setPosts((prev) => [shared, ...prev]);
      setStatusMsg("Shared onto Page!");
    } catch (err: any) {
      setError(err.message || "Failed to share on Page");
    }
  };

  const handleReact = async (postId: string) => {
    if (!user) return;
    try {
      const res = await apiFetch<{ liked: boolean; likes_count: number; my_reaction: string | null }>(
        `/api/social/posts/${postId}/react`,
        { method: "POST", body: JSON.stringify({ reaction: "like" }) }
      );
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, liked_by_me: res.liked, likes_count: res.likes_count, my_reaction: res.my_reaction }
            : p
        )
      );
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleComment = async (postId: string) => {
    const text = (commentText[postId] || "").trim();
    if (!text || !user) return;
    try {
      const c = await apiFetch<CommentItem>(`/api/social/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, comments: [...p.comments, c] } : p))
      );
      setCommentText((prev) => ({ ...prev, [postId]: "" }));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleShareToProfile = async (post: PagePost) => {
    if (!user || !page) return;
    setError("");
    try {
      await apiFetch("/api/social/posts", {
        method: "POST",
        body: JSON.stringify({
          content: `Shared from ${page.name} (@${page.handle}): ${post.content}`,
          image_url: post.image_url,
          video_url: post.video_url || "",
          post_type: "shared",
        }),
      });
      setStatusMsg("Shared to your profile!");
    } catch (err: any) {
      setError(err.message || "Failed to share to profile");
    }
  };

  if (!page) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center text-sm text-fb-muted">
        {error ? error : "Loading page..."}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <Link
        href="/communities"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-fb-muted hover:text-fb-text"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Pages &amp; Groups
      </Link>

      {/* Page Header */}
      <div className="bg-fb-card border border-fb-border rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-fb-blue text-white flex items-center justify-center font-bold text-2xl shrink-0">
              <Flag className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-1.5">
                {page.name}
                {page.is_verified && <CheckCircle className="w-4 h-4 text-fb-blue" />}
              </h1>
              <p className="text-xs text-fb-muted">
                @{page.handle} • {page.category} • {page.followers_count} followers
              </p>
            </div>
          </div>

          {user && !page.is_admin && (
            <button
              onClick={handleFollowToggle}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${
                page.is_following
                  ? "bg-fb-input hover:bg-fb-hover text-fb-text"
                  : "bg-fb-blue hover:bg-fb-blueHover text-white"
              }`}
            >
              {page.is_following ? "Following" : "Follow Page"}
            </button>
          )}
          {page.is_admin && (
            <span className="px-3 py-1 rounded-full bg-fb-blue/10 text-fb-blue text-xs font-semibold">
              Page Admin
            </span>
          )}
        </div>

        {page.about && <p className="text-sm text-fb-text">{page.about}</p>}
        {page.website && (
          <a
            href={page.website}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-fb-blue hover:underline"
          >
            <Globe className="w-3.5 h-3.5" /> {page.website}
          </a>
        )}
      </div>

      {statusMsg && (
        <div className="p-3 rounded-lg bg-fb-card border border-fb-border text-xs font-medium text-emerald-600">
          {statusMsg}
        </div>
      )}
      {error && (
        <div className="p-3 rounded-lg bg-fb-card border border-fb-border text-xs font-medium text-red-600">
          {error}
        </div>
      )}

      {/* Admin-Only Page Post Composer */}
      {page.is_admin && (
        <form onSubmit={handleAdminPost} className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-3 shadow-sm">
          <div className="text-xs font-bold text-fb-muted uppercase tracking-wider">
            Post on {page.name} (Admin Only)
          </div>
          <textarea
            rows={2}
            value={postContent}
            onChange={(e) => setPostContent(e.target.value)}
            placeholder={`Write an update as ${page.name}...`}
            className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none resize-none"
          />
          <input
            value={postImageUrl}
            onChange={(e) => setPostImageUrl(e.target.value)}
            placeholder="Optional image URL..."
            className="w-full px-3 py-2 rounded-lg bg-fb-input text-xs focus:outline-none"
          />
          <button
            type="submit"
            disabled={posting}
            className="px-4 py-2 rounded-lg bg-fb-blue hover:bg-fb-blueHover text-white text-xs font-semibold disabled:opacity-60"
          >
            {posting ? "Publishing..." : "Publish Page Post"}
          </button>
        </form>
      )}

      {/* Page Posts */}
      <section className="space-y-4">
        {posts.length === 0 ? (
          <div className="bg-fb-card border border-fb-border rounded-xl p-8 text-center text-sm text-fb-muted shadow-sm">
            No posts on this Page yet.
          </div>
        ) : (
          posts.map((post) => (
            <article key={post.id} className="bg-fb-card border border-fb-border rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-fb-blue text-white flex items-center justify-center font-bold text-sm">
                    {post.author_display_name[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-bold">{post.author_display_name}</div>
                    <div className="text-xs text-fb-muted">
                      @{post.author_username} • {new Date(post.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                {post.post_type === "shared" && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-fb-blue">
                    <Share2 className="w-3 h-3" /> Shared
                  </span>
                )}
              </div>

              <div className="px-4 pb-3 text-sm whitespace-pre-wrap">{post.content}</div>

              {post.image_url && (
                <img
                  src={resolveMediaUrl(post.image_url)}
                  alt="Page post"
                  className="w-full max-h-96 object-cover border-y border-fb-border"
                />
              )}

              <div className="px-4 py-2 flex items-center justify-between text-xs text-fb-muted border-t border-fb-border">
                <span>{post.likes_count} Reactions</span>
                <span>{post.comments.length} Comments</span>
              </div>

              {user && (
                <div className="px-2 py-1 flex flex-wrap items-center gap-1 border-t border-fb-border">
                  <button
                    onClick={() => handleReact(post.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg hover:bg-fb-hover text-xs font-semibold transition ${
                      post.liked_by_me ? "text-fb-blue" : "text-fb-muted"
                    }`}
                  >
                    <ThumbsUp className={`w-4 h-4 ${post.liked_by_me ? "fill-fb-blue" : ""}`} />
                    React
                  </button>
                  <button
                    onClick={() => handleShareToProfile(post)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg hover:bg-fb-hover text-xs font-semibold text-fb-muted"
                  >
                    <Share2 className="w-4 h-4" />
                    Share to Profile
                  </button>
                  {page.is_admin && (
                    <button
                      onClick={() => handleAdminShareOnPage(post)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg hover:bg-fb-hover text-xs font-semibold text-fb-blue"
                    >
                      <Share2 className="w-4 h-4" />
                      Share on Page
                    </button>
                  )}
                </div>
              )}

              {/* Comments */}
              <div className="px-4 py-3 bg-fb-input/40 border-t border-fb-border space-y-2.5">
                {post.comments.map((c) => (
                  <div key={c.id} className="text-xs flex items-start gap-2">
                    <span className="font-bold">@{c.author_username}</span>
                    <span className="text-fb-text">{c.text}</span>
                  </div>
                ))}
                {user && (
                  <div className="flex items-center gap-2 pt-1">
                    <MessageSquare className="w-3.5 h-3.5 text-fb-muted shrink-0" />
                    <input
                      value={commentText[post.id] || ""}
                      onChange={(e) => setCommentText((prev) => ({ ...prev, [post.id]: e.target.value }))}
                      placeholder="Write a comment..."
                      className="flex-1 px-3 py-1.5 rounded-full bg-fb-input text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleComment(post.id)}
                      className="p-1.5 rounded-full bg-fb-blue text-white"
                      aria-label="Send comment"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
