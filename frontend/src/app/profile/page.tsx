"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Film,
  Image as ImageIcon,
  MessageSquare,
  Plus,
  Share2,
  Sparkles,
  ThumbsUp,
  X,
} from "lucide-react";
import { UserProfile, useAuth } from "@/context/AuthContext";
import { apiFetch, resolveMediaUrl } from "@/lib/api";

interface MediaItem {
  url: string;
  media_type: "image" | "video";
}

interface PostItem {
  id: string;
  author_display_name: string;
  author_username: string;
  author_avatar_url?: string;
  content: string;
  image_url: string;
  video_url?: string;
  media?: MediaItem[];
  post_type?: string;
  tags?: string[];
  likes_count: number;
  comments: { id: string }[];
  created_at: string;
}

interface StoryItem {
  id: string;
  author_id: number;
  author_display_name: string;
  text: string;
  image_url: string;
  bg_color: string;
  created_at: string;
}

interface PendingFile {
  file: File;
  previewUrl: string;
  mediaType: "image" | "video";
}

export default function ProfilePage() {
  const { user, setUserData } = useAuth();
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [showStoryForm, setShowStoryForm] = useState(false);
  const [storyText, setStoryText] = useState("");
  const [storyImg, setStoryImg] = useState("");

  // Profile & cover upload state
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [profileError, setProfileError] = useState("");

  // Profile post composer state (photos & videos from PC)
  const postMediaInputRef = useRef<HTMLInputElement | null>(null);
  const [postContent, setPostContent] = useState("");
  const [postTags, setPostTags] = useState("");
  const [postAudience, setPostAudience] = useState<"public" | "friends" | "only_me">("public");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  const loadProfileData = async () => {
    if (!user) return;
    const [p, s] = await Promise.all([
      apiFetch<PostItem[]>(`/api/social/posts?username=${encodeURIComponent(user.username)}`),
      apiFetch<StoryItem[]>("/api/social/stories"),
    ]);
    setPosts(p);
    setStories(s.filter((item) => item.author_id === user.id));
  };

  useEffect(() => {
    loadProfileData().catch(() => {});
  }, [user?.id]);

  // Clean up object URLs when pending files change/unmount
  useEffect(() => {
    return () => {
      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.previewUrl));
    };
  }, [pendingFiles]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProfileError("");
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const updated = await apiFetch<UserProfile>("/api/auth/me/avatar", {
        method: "POST",
        body: form,
      });
      setUserData(updated);
      loadProfileData().catch(() => {});
    } catch (err: any) {
      setProfileError(err.message || "Failed to upload profile picture");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProfileError("");
    setUploadingCover(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const updated = await apiFetch<UserProfile>("/api/auth/me/cover", {
        method: "POST",
        body: form,
      });
      setUserData(updated);
    } catch (err: any) {
      setProfileError(err.message || "Failed to upload cover picture");
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSelectPostFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    const added: PendingFile[] = files.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      mediaType: file.type.startsWith("video/") ? "video" : "image",
    }));
    setPendingFiles((prev) => [...prev, ...added]);
  };

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postContent.trim() && pendingFiles.length === 0) {
      setPostError("Write something or attach a photo/video from your PC.");
      return;
    }
    setPostError("");
    setPosting(true);
    try {
      let uploadedMedia: MediaItem[] = [];
      if (pendingFiles.length > 0) {
        const form = new FormData();
        pendingFiles.forEach((pf) => form.append("files", pf.file));
        const res = await apiFetch<{ items: MediaItem[] }>("/api/social/upload", {
          method: "POST",
          body: form,
        });
        uploadedMedia = res.items || [];
      }

      const firstImage = uploadedMedia.find((m) => m.media_type === "image")?.url || "";
      const firstVideo = uploadedMedia.find((m) => m.media_type === "video")?.url || "";
      const tags = postTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const created = await apiFetch<PostItem>("/api/social/posts", {
        method: "POST",
        body: JSON.stringify({
          content: postContent,
          image_url: firstImage,
          video_url: firstVideo,
          media: uploadedMedia,
          tags,
          audience: postAudience,
        }),
      });

      setPosts((prev) => [created, ...prev]);
      setPostContent("");
      setPostTags("");
      pendingFiles.forEach((pf) => URL.revokeObjectURL(pf.previewUrl));
      setPendingFiles([]);
    } catch (err: any) {
      setPostError(err.message || "Failed to publish post");
    } finally {
      setPosting(false);
    }
  };

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storyText.trim() && !storyImg.trim()) return;
    await apiFetch("/api/social/stories", {
      method: "POST",
      body: JSON.stringify({ text: storyText, image_url: storyImg }),
    });
    setStoryText("");
    setStoryImg("");
    setShowStoryForm(false);
    loadProfileData();
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-10 bg-fb-card border border-fb-border rounded-xl p-6 text-center space-y-4 shadow-sm">
        <h1 className="text-xl font-bold">Your NexusHub Profile</h1>
        <p className="text-sm text-fb-muted">Sign in or create an account to view your profile.</p>
        <Link
          href="/auth"
          className="inline-block px-5 py-2.5 rounded-lg bg-fb-blue hover:bg-fb-blueHover text-white text-sm font-semibold"
        >
          Sign In / Register
        </Link>
      </div>
    );
  }

  const avatarSrc = resolveMediaUrl(user.avatar_url);
  const coverSrc = resolveMediaUrl(user.cover_url);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Hidden file inputs for Cover & Profile Picture */}
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        onChange={handleCoverUpload}
        className="hidden"
      />
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        onChange={handleAvatarUpload}
        className="hidden"
      />

      {/* Cover + Profile Header */}
      <div className="bg-fb-card border border-fb-border rounded-xl overflow-hidden shadow-sm">
        <div className="relative h-40 sm:h-52 bg-fb-blue/15 border-b border-fb-border overflow-hidden">
          {coverSrc && (
            <img
              src={coverSrc}
              alt="Cover"
              className="w-full h-full object-cover"
            />
          )}
          <button
            type="button"
            disabled={uploadingCover}
            onClick={() => coverInputRef.current?.click()}
            className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/65 hover:bg-black/80 text-white text-xs font-semibold backdrop-blur-sm transition disabled:opacity-60"
          >
            <Camera className="w-3.5 h-3.5" />
            {uploadingCover ? "Uploading..." : coverSrc ? "Change Cover" : "Upload Cover"}
          </button>
        </div>

        <div className="px-6 pb-6 -mt-12 flex flex-wrap items-end justify-between gap-4 relative z-10">
          <div className="flex items-end gap-4">
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-fb-blue border-4 border-fb-card flex items-center justify-center text-white text-3xl font-bold shadow overflow-visible">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={user.display_name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span>{user.display_name[0]?.toUpperCase()}</span>
              )}
              <button
                type="button"
                disabled={uploadingAvatar}
                onClick={() => avatarInputRef.current?.click()}
                title="Upload profile picture"
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-fb-card border border-fb-border hover:bg-fb-hover text-fb-text flex items-center justify-center shadow transition disabled:opacity-60"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <div className="pb-1">
              <h1 className="text-2xl font-bold">{user.display_name}</h1>
              <p className="text-sm text-fb-muted">@{user.username}</p>
            </div>
          </div>

          <button
            onClick={() => setShowStoryForm(!showStoryForm)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-fb-blue hover:bg-fb-blueHover text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            Add Story
          </button>
        </div>

        {profileError && (
          <div className="px-6 pb-4 text-xs text-red-600 font-medium">{profileError}</div>
        )}
      </div>

      {showStoryForm && (
        <form onSubmit={handleCreateStory} className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-3 shadow-sm">
          <h2 className="text-sm font-bold">Share a 24h Story</h2>
          <input
            value={storyText}
            onChange={(e) => setStoryText(e.target.value)}
            placeholder="Write something for your story..."
            className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
          />
          <input
            value={storyImg}
            onChange={(e) => setStoryImg(e.target.value)}
            placeholder="Optional image URL..."
            className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm focus:outline-none"
          />
          <button type="submit" className="px-4 py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold">
            Publish Story
          </button>
        </form>
      )}

      {/* Profile Post Composer (Photos & Videos from PC) */}
      <section className="bg-fb-card border border-fb-border rounded-xl p-4 shadow-sm space-y-3">
        <form onSubmit={handleCreatePost} className="space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="w-10 h-10 rounded-full bg-fb-blue text-white flex items-center justify-center font-bold shrink-0 overflow-hidden">
              {avatarSrc ? (
                <img src={avatarSrc} alt={user.display_name} className="w-full h-full object-cover" />
              ) : (
                user.display_name[0]?.toUpperCase()
              )}
            </div>
            <textarea
              rows={2}
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder={`Share a photo, video, or update on your profile, ${user.display_name.split(" ")[0]}...`}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-fb-input text-sm text-fb-text placeholder:text-fb-muted focus:outline-none resize-none"
            />
          </div>

          {pendingFiles.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {pendingFiles.map((pf, idx) => (
                <div
                  key={idx}
                  className="relative rounded-lg overflow-hidden border border-fb-border bg-black/5 aspect-video"
                >
                  {pf.mediaType === "video" ? (
                    <video
                      src={pf.previewUrl}
                      controls
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={pf.previewUrl}
                      alt={pf.file.name}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removePendingFile(idx)}
                    aria-label="Remove media"
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={postTags}
              onChange={(e) => setPostTags(e.target.value)}
              placeholder="Tags (comma separated)"
              className="px-3 py-2 rounded-lg bg-fb-input text-xs focus:outline-none"
            />
            <select
              value={postAudience}
              onChange={(e) => setPostAudience(e.target.value as "public" | "friends" | "only_me")}
              className="px-3 py-2 rounded-lg bg-fb-input text-xs focus:outline-none"
            >
              <option value="public">Public</option>
              <option value="friends">Friends</option>
              <option value="only_me">Only Me</option>
            </select>
          </div>

          {postError && <p className="text-xs text-red-600">{postError}</p>}

          <input
            ref={postMediaInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleSelectPostFiles}
            className="hidden"
          />

          <div className="border-t border-fb-border pt-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => postMediaInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-fb-hover text-xs font-semibold text-fb-text"
              >
                <ImageIcon className="w-4 h-4 text-emerald-600" />
                Photo
              </button>
              <button
                type="button"
                onClick={() => postMediaInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-fb-hover text-xs font-semibold text-fb-text"
              >
                <Film className="w-4 h-4 text-rose-500" />
                Video
              </button>
            </div>

            <button
              type="submit"
              disabled={posting}
              className="px-5 py-1.5 rounded-lg bg-fb-blue hover:bg-fb-blueHover text-white text-xs font-semibold transition disabled:opacity-60"
            >
              {posting ? "Posting..." : "Post"}
            </button>
          </div>
        </form>
      </section>

      {/* User Stories */}
      <section className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-3 shadow-sm">
        <h2 className="font-bold text-sm flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-fb-blue" />
          Your Active Stories (24h)
        </h2>
        {stories.length === 0 ? (
          <p className="text-xs text-fb-muted">No active stories. Click &ldquo;Add Story&rdquo; to share one.</p>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {stories.map((s) => (
              <div
                key={s.id}
                className="shrink-0 w-32 h-44 rounded-xl p-3 flex flex-col justify-between text-white text-xs font-semibold shadow-sm overflow-hidden relative"
                style={{ backgroundColor: s.bg_color || "#DE4018" }}
              >
                {s.image_url && (
                  <img src={resolveMediaUrl(s.image_url)} alt="Story" className="absolute inset-0 w-full h-full object-cover opacity-80" />
                )}
                <span className="relative z-10 text-[10px] opacity-80">
                  {new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <p className="relative z-10 line-clamp-4">{s.text}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* User Posts & Shares */}
      <section className="space-y-4">
        <div className="bg-fb-card border border-fb-border rounded-xl px-4 py-3 shadow-sm">
          <h2 className="font-bold text-base">Posts &amp; Shares</h2>
        </div>

        {posts.length === 0 ? (
          <div className="bg-fb-card border border-fb-border rounded-xl p-8 text-center text-sm text-fb-muted shadow-sm">
            No posts or shares yet.
          </div>
        ) : (
          posts.map((p) => {
            const mediaItems: MediaItem[] =
              p.media && p.media.length > 0
                ? p.media
                : [
                    ...(p.image_url ? [{ url: p.image_url, media_type: "image" as const }] : []),
                    ...(p.video_url ? [{ url: p.video_url, media_type: "video" as const }] : []),
                  ];
            const postAvatar = resolveMediaUrl(p.author_avatar_url || user.avatar_url);

            return (
              <article key={p.id} className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-fb-blue text-white flex items-center justify-center font-bold text-sm overflow-hidden">
                      {postAvatar ? (
                        <img src={postAvatar} alt={p.author_display_name} className="w-full h-full object-cover" />
                      ) : (
                        p.author_display_name[0]?.toUpperCase()
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold">{p.author_display_name}</div>
                      <div className="text-xs text-fb-muted">{new Date(p.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  {p.post_type === "shared" && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-fb-blue">
                      <Share2 className="w-3 h-3" /> Shared
                    </span>
                  )}
                </div>

                {p.content && <p className="text-sm whitespace-pre-wrap">{p.content}</p>}

                {p.tags && p.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {p.tags.map((t, idx) => (
                      <span key={idx} className="text-xs font-medium text-fb-blue">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}

                {mediaItems.length > 0 && (
                  <div className={mediaItems.length > 1 ? "grid grid-cols-1 sm:grid-cols-2 gap-2" : "space-y-2"}>
                    {mediaItems.map((m, idx) =>
                      m.media_type === "video" ? (
                        <video
                          key={idx}
                          src={resolveMediaUrl(m.url)}
                          controls
                          className="w-full max-h-96 rounded-lg bg-black"
                        />
                      ) : (
                        <img
                          key={idx}
                          src={resolveMediaUrl(m.url)}
                          alt="Post media"
                          className="w-full max-h-96 object-cover rounded-lg"
                        />
                      )
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-fb-border flex gap-4 text-xs text-fb-muted">
                  <span className="inline-flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5" /> {p.likes_count}</span>
                  <span className="inline-flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> {p.comments.length}</span>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
