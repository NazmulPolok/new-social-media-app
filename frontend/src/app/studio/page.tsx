"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Eye,
  ListVideo,
  ThumbsUp,
  MessageSquare,
  Users,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Film,
  Check,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface StudioAnalytics {
  channels_count: number;
  total_subscribers: number;
  total_videos: number;
  total_views: number;
  total_likes: number;
  total_comments: number;
  top_videos: { id: number; title: string; views_count: number; created_at: string }[];
}

interface PlaylistItem {
  id: number;
  title: string;
  visibility: string;
  videos_count: number;
}

interface MyVideoItem {
  id: number;
  channel_id: number;
  channel_name: string;
  title: string;
  description: string;
  category: string;
  visibility: string;
  video_url: string;
  views_count: number;
  created_at: string;
}

export default function CreatorStudioPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"analytics" | "content">("content");
  const [analytics, setAnalytics] = useState<StudioAnalytics | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [myVideos, setMyVideos] = useState<MyVideoItem[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  // Edit Video Modal state
  const [editingVideo, setEditingVideo] = useState<MyVideoItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editVisibility, setEditVisibility] = useState("public");
  const [editCategory, setEditCategory] = useState("General");
  const [savingEdit, setSavingEdit] = useState(false);

  // New playlist state
  const [plTitle, setPlTitle] = useState("");
  const [plVisibility, setPlVisibility] = useState("public");

  const loadStudio = async () => {
    try {
      const [a, pls, vids] = await Promise.all([
        apiFetch<StudioAnalytics>("/api/videos/studio/analytics"),
        apiFetch<PlaylistItem[]>("/api/videos/playlists"),
        apiFetch<MyVideoItem[]>("/api/videos/my-videos"),
      ]);
      setAnalytics(a);
      setPlaylists(pls || []);
      setMyVideos(vids || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (user) loadStudio();
  }, [user?.id]);

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plTitle.trim()) return;
    await apiFetch("/api/videos/playlists", {
      method: "POST",
      body: JSON.stringify({ title: plTitle, visibility: plVisibility }),
    });
    setPlTitle("");
    loadStudio();
  };

  const handleOpenEdit = (v: MyVideoItem) => {
    setEditingVideo(v);
    setEditTitle(v.title);
    setEditDesc(v.description || "");
    setEditVisibility(v.visibility || "public");
    setEditCategory(v.category || "General");
  };

  const handleSaveVideoEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVideo) return;
    setSavingEdit(true);
    try {
      const updated = await apiFetch<MyVideoItem>(`/api/videos/${editingVideo.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc.trim(),
          visibility: editVisibility,
          category: editCategory,
        }),
      });
      setMyVideos((prev) =>
        prev.map((item) =>
          item.id === editingVideo.id
            ? {
                ...item,
                title: updated.title,
                description: updated.description,
                visibility: updated.visibility,
                category: updated.category,
              }
            : item
        )
      );
      setEditingVideo(null);
    } catch (err: any) {
      alert(err.message || "Failed to update video");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteVideo = async (videoId: number) => {
    if (!confirm("Are you sure you want to permanently delete this video?")) return;
    try {
      await apiFetch(`/api/videos/${videoId}`, { method: "DELETE" });
      setMyVideos((prev) => prev.filter((v) => v.id !== videoId));
      if (analytics) {
        setAnalytics({ ...analytics, total_videos: Math.max(0, analytics.total_videos - 1) });
      }
    } catch (err: any) {
      alert(err.message || "Failed to delete video");
    }
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-10 bg-fb-card border border-fb-border rounded-xl p-6 text-center space-y-3">
        <h1 className="text-lg font-bold">Creator Studio</h1>
        <p className="text-xs text-fb-muted">Sign in to manage your videos, channel metrics, and playlists.</p>
        <Link href="/auth" className="inline-block px-4 py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-fb-card border border-fb-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-fb-blue" />
            Creator Studio
          </h1>
          <p className="text-xs text-fb-muted">Manage your content, playlists, and view channel performance metrics.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab Navigation */}
          <div className="flex items-center bg-fb-input p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveTab("content")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === "content" ? "bg-fb-card text-fb-text shadow-sm" : "text-fb-muted hover:text-fb-text"
              }`}
            >
              Channel Content
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`px-3 py-1.5 rounded-lg transition ${
                activeTab === "analytics" ? "bg-fb-card text-fb-text shadow-sm" : "text-fb-muted hover:text-fb-text"
              }`}
            >
              Analytics &amp; Playlists
            </button>
          </div>
          <Link href="/tube" className="px-3.5 py-1.5 rounded-xl bg-fb-blue text-white text-xs font-semibold hover:bg-fb-blueHover shadow-sm transition">
            Tube Feed
          </Link>
        </div>
      </div>

      {/* Analytics KPI Ribbon */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Subscribers", val: analytics.total_subscribers, icon: Users },
            { label: "Total Views", val: analytics.total_views, icon: Eye },
            { label: "Videos", val: analytics.total_videos, icon: ListVideo },
            { label: "Likes", val: analytics.total_likes, icon: ThumbsUp },
            { label: "Comments", val: analytics.total_comments, icon: MessageSquare },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="bg-fb-card border border-fb-border rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-fb-muted">
                  <span>{stat.label}</span>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold mt-1">{stat.val}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Channel Content & Video Management */}
      {activeTab === "content" && (
        <div className="bg-fb-card border border-fb-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base text-fb-text">Channel Content</h2>
              <p className="text-xs text-fb-muted">All videos published across your channels. Edit details or adjust visibility.</p>
            </div>
            <Link
              href="/tube"
              className="px-3 py-1.5 rounded-lg bg-fb-blue text-white text-xs font-semibold inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Upload Video
            </Link>
          </div>

          {myVideos.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Film className="w-12 h-12 text-fb-muted mx-auto opacity-40" />
              <h3 className="font-bold text-sm text-fb-text">No videos uploaded yet</h3>
              <p className="text-xs text-fb-muted">Go to Creator / Tube to upload your first video.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-fb-border text-fb-muted">
                    <th className="pb-3 font-semibold">Video</th>
                    <th className="pb-3 font-semibold">Channel</th>
                    <th className="pb-3 font-semibold">Visibility</th>
                    <th className="pb-3 font-semibold">Category</th>
                    <th className="pb-3 font-semibold">Views</th>
                    <th className="pb-3 font-semibold">Date</th>
                    <th className="pb-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-fb-border">
                  {myVideos.map((v) => (
                    <tr key={v.id} className="hover:bg-fb-hover transition group">
                      <td className="py-3 pr-4 max-w-xs">
                        <div className="font-semibold text-fb-text truncate">{v.title}</div>
                        {v.description && <div className="text-fb-muted truncate text-[11px]">{v.description}</div>}
                      </td>
                      <td className="py-3 text-fb-muted">{v.channel_name}</td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-fb-input text-fb-text">
                          {v.visibility}
                        </span>
                      </td>
                      <td className="py-3 text-fb-muted">{v.category}</td>
                      <td className="py-3 font-semibold">{v.views_count}</td>
                      <td className="py-3 text-fb-muted">
                        {new Date(v.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3 text-right space-x-1">
                        <button
                          onClick={() => handleOpenEdit(v)}
                          className="p-1.5 text-fb-muted hover:text-fb-blue rounded-md hover:bg-fb-input transition"
                          title="Edit video metadata"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteVideo(v.id)}
                          className="p-1.5 text-fb-muted hover:text-red-600 rounded-md hover:bg-fb-input transition"
                          title="Delete video"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Analytics & Playlists */}
      {activeTab === "analytics" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-3 shadow-sm">
            <h2 className="font-bold text-sm">Top Videos</h2>
            {analytics?.top_videos.length ? (
              analytics.top_videos.map((v) => (
                <div key={v.id} className="flex items-center justify-between p-2.5 rounded-lg bg-fb-input text-xs">
                  <span className="font-semibold truncate pr-2">{v.title}</span>
                  <span className="text-fb-muted shrink-0">{v.views_count} views</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-fb-muted">No videos uploaded yet.</p>
            )}
          </div>

          <div className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-3 shadow-sm">
            <h2 className="font-bold text-sm">Playlists</h2>
            <form onSubmit={handleCreatePlaylist} className="flex gap-2">
              <input
                required
                value={plTitle}
                onChange={(e) => setPlTitle(e.target.value)}
                placeholder="New playlist title..."
                className="flex-1 px-3 py-2 rounded-lg bg-fb-input text-xs"
              />
              <select
                value={plVisibility}
                onChange={(e) => setPlVisibility(e.target.value)}
                className="px-2.5 py-2 rounded-lg bg-fb-input text-xs"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
              <button
                type="submit"
                className="px-3 py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </form>
            <div className="space-y-2">
              {playlists.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg bg-fb-input text-xs">
                  <span className="font-semibold">{p.title}</span>
                  <span className="text-fb-muted">
                    {p.visibility} • {p.videos_count} videos
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Video Modal */}
      {editingVideo && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-fb-card border border-fb-border rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-fb-border">
              <h3 className="font-bold text-base text-fb-text">Edit Video Details</h3>
              <button onClick={() => setEditingVideo(null)} className="text-fb-muted hover:text-fb-text">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveVideoEdit} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Title</label>
                <input
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-fb-input text-fb-text focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Description</label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-fb-input text-fb-text focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold block mb-1">Visibility</label>
                  <select
                    value={editVisibility}
                    onChange={(e) => setEditVisibility(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-fb-input text-fb-text focus:outline-none"
                  >
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-fb-input text-fb-text focus:outline-none"
                  >
                    <option value="General">General</option>
                    <option value="Tech">Tech</option>
                    <option value="Music">Music</option>
                    <option value="Gaming">Gaming</option>
                    <option value="Education">Education</option>
                    <option value="Vlogs">Vlogs</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-fb-border">
                <button
                  type="button"
                  onClick={() => setEditingVideo(null)}
                  className="px-4 py-2 rounded-lg bg-fb-input hover:bg-fb-hover font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-lg bg-fb-blue text-white font-semibold flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Check className="w-4 h-4" /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
