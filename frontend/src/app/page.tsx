"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ThumbsUp,
  MessageSquare,
  Share2,
  Bookmark,
  Sparkles,
  Activity,
  History,
  Image as ImageIcon,
  Hash,
  MessageCircle,
  PlaySquare,
  ShoppingBag,
  Settings,
  Plus,
  Send,
} from "lucide-react";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface CommentItem {
  id: string;
  author_username: string;
  author_display_name: string;
  text: string;
  created_at: string;
}

interface PostMediaItem {
  url: string;
  media_type: "image" | "video";
}

interface PostItem {
  id: string;
  author_id: number;
  author_username: string;
  author_display_name: string;
  author_avatar_url?: string;
  content: string;
  image_url: string;
  video_url?: string;
  media?: PostMediaItem[];
  tags: string[];
  likes_count: number;
  liked_by_me: boolean;
  comments: CommentItem[];
  created_at: string;
}

interface ContactUser {
  id: number;
  username: string;
  display_name: string;
}

interface ShopProduct {
  id: number;
  name: string;
  price_dollars: number;
  shop_name: string;
  shop_slug: string;
  image_url: string;
}

export default function FacebookHomePage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [contacts, setContacts] = useState<ContactUser[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);

  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [showExtras, setShowExtras] = useState(false);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<PostItem[]>("/api/social/posts").then(setPosts).catch(() => {});
    apiFetch<ContactUser[]>("/api/auth/users").then(setContacts).catch(() => {});
    apiFetch<ShopProduct[]>("/api/shops/products/all").then((p) => setProducts(p.slice(0, 3))).catch(() => {});
  }, [user?.id]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setError("");
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const created = await apiFetch<PostItem>("/api/social/posts", {
        method: "POST",
        body: JSON.stringify({ content, image_url: imageUrl, tags }),
      });
      setPosts((prev) => [created, ...prev]);
      setContent("");
      setImageUrl("");
      setTagsInput("");
      setShowExtras(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLike = async (postId: string) => {
    try {
      const res = await apiFetch<{ liked: boolean; likes_count: number }>(
        `/api/social/posts/${postId}/like`,
        { method: "POST" }
      );
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, liked_by_me: res.liked, likes_count: res.likes_count } : p
        )
      );
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleComment = async (postId: string) => {
    const text = (commentText[postId] || "").trim();
    if (!text) return;
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

  const handleShare = async (post: PostItem) => {
    if (!user) return;
    try {
      const shared = await apiFetch<PostItem>("/api/social/posts", {
        method: "POST",
        body: JSON.stringify({
          content: `Shared from @${post.author_username}: ${post.content}`,
          image_url: post.image_url,
          post_type: "shared",
        }),
      });
      setPosts((prev) => [shared, ...prev]);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSavePost = async (post: PostItem) => {
    if (!user) {
      alert("Please sign in to save posts.");
      return;
    }
    try {
      await apiFetch("/api/social/saved", {
        method: "POST",
        body: JSON.stringify({
          target_type: "post",
          target_id: post.id,
          collection_name: "All Items",
          title: post.content.slice(0, 100) || `Post by @${post.author_username}`,
          image_url: post.image_url || post.media?.[0]?.url || "",
          snippet: post.content.slice(0, 200),
        }),
      });
      alert("Post saved to your Saved Items!");
    } catch (err: any) {
      alert(err.message || "Failed to save post");
    }
  };

  const otherContacts = contacts.filter((c) => c.id !== user?.id);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left Rail — Facebook-style Shortcuts */}
      <aside className="hidden lg:block lg:col-span-3 sticky top-20 space-y-1">
        <Link
          href={user ? "/profile" : "/auth"}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-fb-hover transition font-semibold text-sm"
        >
          <div className="w-8 h-8 rounded-full bg-fb-blue text-white flex items-center justify-center text-xs font-bold">
            {user ? user.display_name[0]?.toUpperCase() : "N"}
          </div>
          <span>{user ? user.display_name : "Sign In / Join NexusHub"}</span>
        </Link>

        <Link
          href="/messenger"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-fb-hover transition font-medium text-sm"
        >
          <MessageCircle className="w-5 h-5 text-fb-blue" />
          <span>Messenger</span>
        </Link>

        <Link
          href="/tube"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-fb-hover transition font-medium text-sm"
        >
          <PlaySquare className="w-5 h-5 text-red-600" />
          <span>Creator</span>
        </Link>

        <Link
          href="/shop"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-fb-hover transition font-medium text-sm"
        >
          <ShoppingBag className="w-5 h-5 text-emerald-600" />
          <span>Marketplace &amp; Shops</span>
        </Link>

        <Link
          href="/communities"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-fb-hover transition font-medium text-sm"
        >
          <MessageSquare className="w-5 h-5 text-fb-blue" />
          <span>Pages &amp; Groups</span>
        </Link>

        <Link
          href="/saved"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-fb-hover transition font-medium text-sm"
        >
          <Bookmark className="w-5 h-5 text-purple-600" />
          <span>Saved Items</span>
        </Link>

        <Link
          href="/memories"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-fb-hover transition font-medium text-sm"
        >
          <History className="w-5 h-5 text-indigo-500" />
          <span>Memories</span>
        </Link>

        <Link
          href="/activity-log"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-fb-hover transition font-medium text-sm"
        >
          <Activity className="w-5 h-5 text-emerald-500" />
          <span>Activity Log</span>
        </Link>

        <Link
          href="/seller"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-fb-hover transition font-medium text-sm"
        >
          <ShoppingBag className="w-5 h-5 text-emerald-600" />
          <span>Seller Dashboard</span>
        </Link>

        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-fb-hover transition font-medium text-sm"
        >
          <Settings className="w-5 h-5 text-fb-muted" />
          <span>Settings &amp; Theme</span>
        </Link>
      </aside>

      {/* Center Column — Facebook Home Feed */}
      <div className="lg:col-span-6 max-w-[600px] w-full mx-auto space-y-4">
        {/* Stories Strip */}
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          <Link
            href={user ? "/profile" : "/auth"}
            className="shrink-0 w-28 h-44 rounded-xl bg-fb-card border border-fb-border overflow-hidden flex flex-col justify-between shadow-sm hover:opacity-95 transition"
          >
            <div className="h-28 bg-fb-blue/10 flex items-center justify-center">
              <div className="w-9 h-9 rounded-full bg-fb-blue text-white flex items-center justify-center shadow">
                <Plus className="w-5 h-5" />
              </div>
            </div>
            <div className="p-2 text-center text-xs font-semibold">Create Story</div>
          </Link>

          {otherContacts.slice(0, 4).map((c) => (
            <Link
              key={c.id}
              href="/messenger"
              className="shrink-0 w-28 h-44 rounded-xl bg-fb-card border border-fb-border p-2.5 flex flex-col justify-between shadow-sm hover:border-fb-blue transition"
            >
              <div className="w-8 h-8 rounded-full bg-fb-blue text-white flex items-center justify-center text-xs font-bold ring-2 ring-fb-blue ring-offset-2 ring-offset-fb-card">
                {c.display_name[0]?.toUpperCase()}
              </div>
              <div className="text-xs font-semibold truncate">{c.display_name}</div>
            </Link>
          ))}
        </div>

        {/* Facebook-style Post Composer */}
        <div className="bg-fb-card border border-fb-border rounded-xl p-3.5 shadow-sm">
          {user ? (
            <form onSubmit={handleCreatePost} className="space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="w-10 h-10 rounded-full bg-fb-blue text-white flex items-center justify-center font-bold shrink-0">
                  {user.display_name[0]?.toUpperCase()}
                </div>
                <textarea
                  rows={2}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={`What's on your mind, ${user.display_name.split(" ")[0]}?`}
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-fb-input text-sm text-fb-text placeholder:text-fb-muted focus:outline-none resize-none"
                />
              </div>

              {showExtras && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="Image URL..."
                    className="px-3 py-2 rounded-lg bg-fb-input text-xs focus:outline-none"
                  />
                  <input
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="Tags (comma separated)"
                    className="px-3 py-2 rounded-lg bg-fb-input text-xs focus:outline-none"
                  />
                </div>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="border-t border-fb-border pt-2.5 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowExtras(!showExtras)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-fb-hover text-xs font-semibold text-fb-muted"
                  >
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowExtras(!showExtras)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-fb-hover text-xs font-semibold text-fb-muted"
                  >
                    <Hash className="w-4 h-4 text-fb-blue" />
                    Tag
                  </button>
                </div>

                <button
                  type="submit"
                  className="px-5 py-1.5 rounded-lg bg-fb-blue hover:bg-fb-blueHover text-white text-xs font-semibold transition"
                >
                  Post
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="text-sm text-fb-muted">Sign in to post updates, like, and comment.</span>
              <Link
                href="/auth"
                className="px-4 py-2 rounded-lg bg-fb-blue hover:bg-fb-blueHover text-white text-xs font-semibold shrink-0"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>

        {/* Feed Posts */}
        {posts.length === 0 ? (
          <div className="bg-fb-card border border-fb-border rounded-xl p-8 text-center text-sm text-fb-muted shadow-sm">
            No posts in your feed yet. Share your first update above!
          </div>
        ) : (
          posts.map((post) => (
            <article
              key={post.id}
              className="bg-fb-card border border-fb-border rounded-xl shadow-sm overflow-hidden"
            >
              <div className="p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-full bg-fb-blue text-white flex items-center justify-center font-bold text-sm overflow-hidden">
                    {post.author_avatar_url ? (
                      <img
                        src={resolveMediaUrl(post.author_avatar_url)}
                        alt={post.author_display_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      post.author_display_name[0]?.toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-bold leading-tight">{post.author_display_name}</div>
                    <div className="text-xs text-fb-muted">
                      @{post.author_username} • {new Date(post.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-3.5 pb-3 text-[15px] leading-relaxed whitespace-pre-wrap">
                {post.content}
                {post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {post.tags.map((t, i) => (
                      <span key={i} className="text-xs font-medium text-fb-blue">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {(() => {
                const mediaList: PostMediaItem[] =
                  post.media && post.media.length > 0
                    ? post.media
                    : [
                        ...(post.image_url ? [{ url: post.image_url, media_type: "image" as const }] : []),
                        ...(post.video_url ? [{ url: post.video_url, media_type: "video" as const }] : []),
                      ];
                if (mediaList.length === 0) return null;
                return (
                  <div className={mediaList.length > 1 ? "grid grid-cols-1 sm:grid-cols-2 gap-1 border-y border-fb-border" : "border-y border-fb-border"}>
                    {mediaList.map((m, idx) =>
                      m.media_type === "video" ? (
                        <video
                          key={idx}
                          src={resolveMediaUrl(m.url)}
                          controls
                          className="w-full max-h-[420px] bg-black"
                        />
                      ) : (
                        <img
                          key={idx}
                          src={resolveMediaUrl(m.url)}
                          alt="Post media"
                          className="w-full max-h-[420px] object-cover"
                        />
                      )
                    )}
                  </div>
                );
              })()}

              {/* Counts Bar */}
              <div className="px-3.5 py-2 flex items-center justify-between text-xs text-fb-muted border-b border-fb-border">
                <span>{post.likes_count} Likes</span>
                <span>{post.comments.length} Comments</span>
              </div>

              {/* Action Buttons */}
              <div className="px-2 py-1 grid grid-cols-4 gap-1 border-b border-fb-border">
                <button
                  onClick={() => handleLike(post.id)}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg hover:bg-fb-hover text-xs font-semibold transition ${
                    post.liked_by_me ? "text-fb-blue" : "text-fb-muted"
                  }`}
                >
                  <ThumbsUp className={`w-4 h-4 ${post.liked_by_me ? "fill-fb-blue" : ""}`} />
                  Like
                </button>
                <a
                  href={`#comment-${post.id}`}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg hover:bg-fb-hover text-xs font-semibold text-fb-muted"
                >
                  <MessageSquare className="w-4 h-4" />
                  Comment
                </a>
                <button
                  onClick={() => handleShare(post)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg hover:bg-fb-hover text-xs font-semibold text-fb-muted"
                >
                  <Share2 className="w-4 h-4" />
                  Share
                </button>
                <button
                  onClick={() => handleSavePost(post)}
                  className="flex items-center justify-center gap-1.5 py-2 rounded-lg hover:bg-fb-hover text-xs font-semibold text-fb-muted"
                  title="Save post to your Saved collection"
                >
                  <Bookmark className="w-4 h-4" />
                  Save
                </button>
              </div>

              {/* Comments */}
              <div className="p-3.5 space-y-2">
                {post.comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-fb-input flex items-center justify-center text-[11px] font-bold shrink-0">
                      {c.author_username[0]?.toUpperCase()}
                    </div>
                    <div className="bg-fb-input rounded-2xl px-3 py-1.5 text-xs">
                      <span className="font-bold mr-1.5">@{c.author_username}</span>
                      <span>{c.text}</span>
                    </div>
                  </div>
                ))}

                {user && (
                  <div id={`comment-${post.id}`} className="flex items-center gap-2 pt-1">
                    <div className="w-7 h-7 rounded-full bg-fb-blue text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                      {user.display_name[0]?.toUpperCase()}
                    </div>
                    <input
                      value={commentText[post.id] || ""}
                      onChange={(e) =>
                        setCommentText((prev) => ({ ...prev, [post.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleComment(post.id);
                        }
                      }}
                      placeholder="Write a comment..."
                      className="flex-1 px-3.5 py-1.5 rounded-full bg-fb-input text-xs focus:outline-none"
                    />
                    <button
                      onClick={() => handleComment(post.id)}
                      className="p-1.5 rounded-full text-fb-blue hover:bg-fb-hover"
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
      </div>

      {/* Right Rail — Marketplace Picks & Contacts */}
      <aside className="hidden xl:block xl:col-span-3 sticky top-20 space-y-4">
        {products.length > 0 && (
          <div className="bg-fb-card border border-fb-border rounded-xl p-3.5 shadow-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-fb-muted">Marketplace</h2>
              <Link href="/shop" className="text-xs text-fb-blue font-semibold hover:underline">
                See all
              </Link>
            </div>
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/shop/${p.shop_slug}`}
                className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-fb-hover transition"
              >
                <div className="w-12 h-12 rounded-lg bg-fb-input flex items-center justify-center overflow-hidden shrink-0">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <ShoppingBag className="w-4 h-4 text-fb-muted" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{p.name}</div>
                  <div className="text-xs font-bold text-fb-blue">${p.price_dollars.toFixed(2)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="bg-fb-card border border-fb-border rounded-xl p-3.5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-fb-muted">Contacts</h2>
            <Link href="/messenger" className="text-xs text-fb-blue font-semibold hover:underline">
              Messenger
            </Link>
          </div>
          {otherContacts.length === 0 ? (
            <p className="text-xs text-fb-muted py-2">No other contacts yet.</p>
          ) : (
            otherContacts.slice(0, 8).map((c) => (
              <Link
                key={c.id}
                href="/messenger"
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-fb-hover transition"
              >
                <div className="relative w-8 h-8 rounded-full bg-fb-blue text-white flex items-center justify-center text-xs font-bold">
                  {c.display_name[0]?.toUpperCase()}
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-fb-card" />
                </div>
                <span className="text-sm font-medium truncate">{c.display_name}</span>
              </Link>
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
