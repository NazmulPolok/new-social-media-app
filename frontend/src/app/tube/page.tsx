"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Play,
  Search,
  ThumbsUp,
  Upload,
  Video as VideoIcon,
  Check,
  X,
  Clock,
  Bookmark,
  History,
} from "lucide-react";
import { API_BASE, apiFetch, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Channel {
  id: number;
  owner_id: number;
  name: string;
  handle: string;
  description: string;
  image_url?: string;
  subscribers_count: number;
}

interface VideoItem {
  id: number;
  channel_id: number;
  channel_name: string;
  channel_handle: string;
  channel_image_url?: string;
  title: string;
  description: string;
  video_url: string;
  views_count: number;
  likes_count: number;
  comments: { id: string; author_username: string; text: string }[];
  created_at: string;
}

const CATEGORIES = ["All", "History", "Watch Later", "Tech", "Music", "Gaming", "Vlogs", "Education"];

export default function CreatorPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [subscribedIds, setSubscribedIds] = useState<Record<number, boolean>>({});
  const [watchLaterIds, setWatchLaterIds] = useState<Record<number, boolean>>({});

  const [showUploadModal, setShowUploadModal] = useState(false);

  const [uploadChannelId, setUploadChannelId] = useState<number>(0);
  const [vidTitle, setVidTitle] = useState("");
  const [vidDesc, setVidDesc] = useState("");
  const [vidFile, setVidFile] = useState<File | null>(null);
  const [commentText, setCommentText] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const loadData = async () => {
    try {
      const [chs, vids] = await Promise.all([
        apiFetch<Channel[]>("/api/videos/channels"),
        apiFetch<VideoItem[]>("/api/videos"),
      ]);
      setChannels(chs || []);
      setVideos(vids || []);
      if (!selectedVideo && vids && vids.length > 0) setSelectedVideo(vids[0]);

      if (user) {
        const wl = await apiFetch<any[]>("/api/videos/watch-later").catch(() => []);
        if (wl) {
          const map: Record<number, boolean> = {};
          wl.forEach((item) => {
            map[item.id] = true;
          });
          setWatchLaterIds(map);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData().catch(() => {});
  }, [user?.id]);

  const handleCategorySelect = async (cat: string) => {
    setActiveCategory(cat);
    if (cat === "History" && user) {
      try {
        const hist = await apiFetch<VideoItem[]>("/api/videos/history");
        setVideos(hist || []);
      } catch (e) {
        console.error(e);
      }
    } else if (cat === "Watch Later" && user) {
      try {
        const wl = await apiFetch<VideoItem[]>("/api/videos/watch-later");
        setVideos(wl || []);
      } catch (e) {
        console.error(e);
      }
    } else {
      const vids = await apiFetch<VideoItem[]>("/api/videos").catch(() => []);
      setVideos(vids || []);
    }
  };

  const handleToggleWatchLater = async (videoId: number) => {
    if (!user) {
      alert("Sign in to save videos to Watch Later");
      return;
    }
    try {
      const res = await apiFetch<{ saved: boolean }>(`/api/videos/watch-later/${videoId}`, { method: "POST" });
      setWatchLaterIds((prev) => ({ ...prev, [videoId]: res.saved }));
    } catch (err: any) {
      alert(err.message || "Failed to update Watch Later");
    }
  };

  const myChannels = channels.filter((c) => c.owner_id === user?.id);

  const handleUploadVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vidFile || !uploadChannelId) {
      setStatusMsg("Select a channel and a video file.");
      return;
    }
    setStatusMsg("Uploading video...");
    try {
      const fd = new FormData();
      fd.append("channel_id", String(uploadChannelId));
      fd.append("title", vidTitle);
      fd.append("description", vidDesc);
      fd.append("video_file", vidFile);

      const created = await apiFetch<VideoItem>("/api/videos/upload", {
        method: "POST",
        body: fd,
      });
      setVideos((prev) => [created, ...prev]);
      setSelectedVideo(created);
      setVidTitle("");
      setVidDesc("");
      setVidFile(null);
      setShowUploadModal(false);
      setStatusMsg("Video published.");
    } catch (err: any) {
      setStatusMsg(err.message);
    }
  };

  const handleSelectVideo = async (v: VideoItem) => {
    setSelectedVideo(v);
    try {
      const res = await apiFetch<{ views_count: number }>(`/api/videos/${v.id}/view`, {
        method: "POST",
      });
      setVideos((prev) =>
        prev.map((item) => (item.id === v.id ? { ...item, views_count: res.views_count } : item))
      );
      setSelectedVideo((prev) => (prev ? { ...prev, views_count: res.views_count } : null));
    } catch {
      // ignore
    }
  };

  const handleSubscribe = async (channelId: number) => {
    const res = await apiFetch<{ subscribed: boolean; subscribers_count: number }>(
      `/api/videos/channels/${channelId}/subscribe`,
      { method: "POST" }
    );
    setSubscribedIds((prev) => ({ ...prev, [channelId]: res.subscribed }));
    setChannels((prev) =>
      prev.map((c) => (c.id === channelId ? { ...c, subscribers_count: res.subscribers_count } : c))
    );
  };

  const handleLikeVideo = async (videoId: number) => {
    const res = await apiFetch<{ likes_count: number }>(`/api/videos/${videoId}/like`, {
      method: "POST",
    });
    setVideos((prev) =>
      prev.map((v) => (v.id === videoId ? { ...v, likes_count: res.likes_count } : v))
    );
    if (selectedVideo?.id === videoId) {
      setSelectedVideo({ ...selectedVideo, likes_count: res.likes_count });
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVideo || !commentText.trim()) return;
    const c = await apiFetch<{ id: string; author_username: string; text: string }>(
      `/api/videos/${selectedVideo.id}/comments`,
      { method: "POST", body: JSON.stringify({ text: commentText }) }
    );
    const updatedComments = [...selectedVideo.comments, c];
    setSelectedVideo({ ...selectedVideo, comments: updatedComments });
    setVideos((prev) =>
      prev.map((v) => (v.id === selectedVideo.id ? { ...v, comments: updatedComments } : v))
    );
    setCommentText("");
  };

  const filteredVideos = videos.filter((v) =>
    v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.channel_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeChannel = channels.find((c) => c.id === selectedVideo?.channel_id);

  return (
    <div className="space-y-5">
      {/* YouTube-style Top Sub-Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-6 rounded-md bg-fb-blue flex items-center justify-center text-white">
            <Play className="w-3.5 h-3.5 fill-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Creator</h1>
        </div>

        {/* Search Bar */}
        <div className="flex items-center flex-1 max-w-xl bg-fb-card border border-fb-border rounded-full overflow-hidden">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search videos or channels"
            className="flex-1 px-4 py-2 bg-transparent text-sm focus:outline-none"
          />
          <div className="px-4 py-2 bg-fb-input border-l border-fb-border text-fb-muted">
            <Search className="w-4 h-4" />
          </div>
        </div>

        {/* Creator Actions */}
        {user && (
          <div className="flex items-center gap-2">
            <Link
              href="/studio"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-fb-card border border-fb-border hover:bg-fb-hover text-xs font-semibold"
            >
              <BarChart3 className="w-4 h-4 text-fb-blue" />
              Creator Dashboard
            </Link>
            <button
              onClick={() => {
                if (myChannels.length > 0 && !uploadChannelId) setUploadChannelId(myChannels[0].id);
                setShowUploadModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-fb-blue hover:bg-fb-blueHover text-white text-xs font-semibold shadow-sm transition"
            >
              <Upload className="w-4 h-4" />
              Create
            </button>
          </div>
        )}
      </div>

      {/* Category Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategorySelect(cat)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
              activeCategory === cat
                ? "bg-fb-text text-fb-canvas"
                : "bg-fb-card border border-fb-border hover:bg-fb-hover"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-fb-card border border-fb-border text-xs font-medium">
          {statusMsg}
        </div>
      )}

      {/* Upload Video Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleUploadVideo}
            className="bg-fb-card border border-fb-border rounded-2xl p-5 max-w-md w-full space-y-3 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-base">Upload Video</h2>
              <button type="button" onClick={() => setShowUploadModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
            {myChannels.length === 0 ? (
              <p className="text-xs text-fb-muted">
                Create a channel in{" "}
                <Link href="/settings" className="text-fb-blue font-semibold hover:underline">
                  Settings
                </Link>{" "}
                first before uploading a video.
              </p>
            ) : (
              <>
                <select
                  value={uploadChannelId}
                  onChange={(e) => setUploadChannelId(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm"
                >
                  <option value={0}>Select channel</option>
                  {myChannels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (@{c.handle})
                    </option>
                  ))}
                </select>
                <input
                  required
                  value={vidTitle}
                  onChange={(e) => setVidTitle(e.target.value)}
                  placeholder="Video title"
                  className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm"
                />
                <textarea
                  rows={2}
                  value={vidDesc}
                  onChange={(e) => setVidDesc(e.target.value)}
                  placeholder="Description..."
                  className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm"
                />
                <input
                  required
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/ogg"
                  onChange={(e) => setVidFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-fb-muted"
                />
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-fb-blue hover:bg-fb-blueHover text-white text-sm font-semibold transition shadow-sm"
                >
                  Publish Video
                </button>
              </>
            )}
          </form>
        </div>
      )}

      {/* YouTube Watch Layout: Theater Player + Up Next */}
      {selectedVideo ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-3">
            <div className="rounded-xl overflow-hidden bg-black aspect-video shadow">
              <video
                key={selectedVideo.id}
                src={`${API_BASE}${selectedVideo.video_url}`}
                controls
                className="w-full h-full"
              />
            </div>

            <h2 className="text-lg sm:text-xl font-bold leading-snug">{selectedVideo.title}</h2>

            {/* Channel + Subscribe + Like Row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-fb-blue text-white flex items-center justify-center font-bold overflow-hidden shrink-0">
                  {activeChannel?.image_url || selectedVideo.channel_image_url ? (
                    <img
                      src={resolveMediaUrl(activeChannel?.image_url || selectedVideo.channel_image_url)}
                      alt={selectedVideo.channel_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    selectedVideo.channel_name[0]?.toUpperCase()
                  )}
                </div>
                <div>
                  <div className="font-bold text-sm">{selectedVideo.channel_name}</div>
                  <div className="text-xs text-fb-muted">
                    {activeChannel?.subscribers_count ?? 0} subscribers
                  </div>
                </div>
                {user && (
                  <button
                    onClick={() => handleSubscribe(selectedVideo.channel_id)}
                    className={`ml-2 px-4 py-2 rounded-full text-xs font-bold transition inline-flex items-center gap-1 ${
                      subscribedIds[selectedVideo.channel_id]
                        ? "bg-fb-input text-fb-text"
                        : "bg-fb-text text-fb-canvas hover:opacity-90"
                    }`}
                  >
                    {subscribedIds[selectedVideo.channel_id] ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Subscribed
                      </>
                    ) : (
                      "Subscribe"
                    )}
                  </button>
                )}
              </div>

              {user && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleLikeVideo(selectedVideo.id)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-fb-card border border-fb-border hover:bg-fb-hover text-xs font-bold"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    {selectedVideo.likes_count}
                  </button>
                  <button
                    onClick={() => handleToggleWatchLater(selectedVideo.id)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full border text-xs font-bold transition ${
                      watchLaterIds[selectedVideo.id]
                        ? "bg-fb-blue text-white border-fb-blue"
                        : "bg-fb-card border-fb-border hover:bg-fb-hover text-fb-text"
                    }`}
                    title="Save to Watch Later"
                  >
                    <Clock className="w-4 h-4" />
                    {watchLaterIds[selectedVideo.id] ? "Saved" : "Watch Later"}
                  </button>
                </div>
              )}
            </div>

            {/* Description Box */}
            <div className="bg-fb-card border border-fb-border rounded-xl p-3.5 text-xs space-y-1">
              <div className="font-bold">
                {selectedVideo.views_count} views •{" "}
                {new Date(selectedVideo.created_at).toLocaleDateString()}
              </div>
              <p className="text-fb-muted whitespace-pre-wrap">
                {selectedVideo.description || "No description provided."}
              </p>
            </div>

            {/* Comments */}
            <div className="pt-2 space-y-3">
              <h3 className="font-bold text-sm">{selectedVideo.comments.length} Comments</h3>
              {user && (
                <form onSubmit={handleComment} className="flex gap-2.5 items-center">
                  <div className="w-8 h-8 rounded-full bg-fb-blue text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {user.display_name[0]?.toUpperCase()}
                  </div>
                  <input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 bg-transparent border-b border-fb-border py-1.5 text-sm focus:outline-none focus:border-fb-blue"
                  />
                  <button className="px-3.5 py-1.5 rounded-full bg-fb-blue text-white text-xs font-semibold">
                    Comment
                  </button>
                </form>
              )}
              <div className="space-y-3">
                {selectedVideo.comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5 text-xs">
                    <div className="w-8 h-8 rounded-full bg-fb-input flex items-center justify-center font-bold shrink-0">
                      {c.author_username[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold">@{c.author_username}</div>
                      <p className="mt-0.5 text-fb-text">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Up Next */}
          <div className="lg:col-span-4 space-y-2.5">
            <h3 className="font-bold text-sm">Up Next</h3>
            {filteredVideos.map((v) => (
              <button
                key={v.id}
                onClick={() => handleSelectVideo(v)}
                className={`w-full text-left flex gap-2.5 p-2 rounded-xl transition ${
                  selectedVideo.id === v.id ? "bg-fb-hover" : "hover:bg-fb-hover"
                }`}
              >
                <div className="w-36 aspect-video rounded-lg bg-zinc-900 flex items-center justify-center shrink-0 text-white">
                  <Play className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold line-clamp-2">{v.title}</div>
                  <div className="text-[11px] text-fb-muted mt-1">{v.channel_name}</div>
                  <div className="text-[11px] text-fb-muted">{v.views_count} views</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-fb-card border border-fb-border rounded-xl p-12 text-center space-y-2">
          <VideoIcon className="w-10 h-10 text-fb-muted mx-auto" />
          <div className="font-bold text-base">No videos uploaded yet</div>
          <p className="text-xs text-fb-muted">
            Create a channel in{" "}
            <Link href="/settings" className="text-fb-blue font-semibold hover:underline">
              Settings
            </Link>{" "}
            and then click &ldquo;Create&rdquo; to upload your first Creator video.
          </p>
        </div>
      )}

      {/* Video Grid */}
      {filteredVideos.length > 0 && (
        <section className="pt-4 border-t border-fb-border space-y-3">
          <h3 className="font-bold text-base">All Creator Videos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVideos.map((v) => (
              <button
                key={v.id}
                onClick={() => handleSelectVideo(v)}
                className="text-left group space-y-2"
              >
                <div className="aspect-video rounded-xl bg-zinc-900 flex items-center justify-center text-white overflow-hidden relative">
                  <Play className="w-9 h-9 opacity-80 group-hover:scale-110 transition" />
                </div>
                <div className="flex gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-fb-blue text-white flex items-center justify-center text-xs font-bold shrink-0 overflow-hidden">
                    {v.channel_image_url ? (
                      <img
                        src={resolveMediaUrl(v.channel_image_url)}
                        alt={v.channel_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      v.channel_name[0]?.toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold line-clamp-2 group-hover:text-fb-blue">{v.title}</div>
                    <div className="text-xs text-fb-muted">{v.channel_name}</div>
                    <div className="text-xs text-fb-muted">{v.views_count} views</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
