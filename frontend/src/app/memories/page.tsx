"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { History, Sparkles, Heart, MessageCircle, Share2, Calendar } from "lucide-react";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface MemoryPost {
  id: string;
  author_id: number;
  author_username: string;
  author_display_name: string;
  author_avatar_url?: string;
  content: string;
  image_url?: string;
  video_url?: string;
  memory_label?: string;
  likes_count: number;
  comments: any[];
  created_at: string;
}

interface MemoriesData {
  title: string;
  description: string;
  memories: MemoryPost[];
}

export default function MemoriesPage() {
  const { user } = useAuth();
  const [data, setData] = useState<MemoriesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      apiFetch<MemoriesData>("/api/social/memories")
        .then((res) => setData(res))
        .catch((err) => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <History className="w-16 h-16 text-fb-muted mx-auto" />
        <h2 className="text-2xl font-bold">Relive your memories</h2>
        <p className="text-fb-muted text-sm">
          Sign in to see posts and milestones you shared in the past.
        </p>
        <Link
          href="/auth"
          className="inline-block px-6 py-2.5 bg-fb-blue text-white rounded-lg font-semibold"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-6">
      {/* Memories Banner */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-4 -bottom-6 opacity-10">
          <Calendar className="w-48 h-48" />
        </div>
        <div className="relative z-10 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> On This Day
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Memories</h1>
          <p className="text-sm text-white/90 max-w-md">
            Look back at the moments, memories, and photos you shared across the platform.
          </p>
        </div>
      </div>

      {/* Content Feed */}
      {loading ? (
        <div className="bg-fb-card border border-fb-border rounded-xl p-12 text-center text-fb-muted text-sm">
          Scanning your archives for memories...
        </div>
      ) : !data || data.memories.length === 0 ? (
        <div className="bg-fb-card border border-fb-border rounded-xl p-12 text-center space-y-3">
          <Calendar className="w-12 h-12 text-fb-muted mx-auto opacity-50" />
          <h3 className="font-bold text-lg text-fb-text">No memories today</h3>
          <p className="text-xs text-fb-muted max-w-sm mx-auto">
            We didn&apos;t find any posts from this exact day in previous years or past milestones. Keep sharing to build memories for tomorrow!
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.memories.map((post) => (
            <div
              key={post.id}
              className="bg-fb-card border border-fb-border rounded-xl p-4 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between pb-2 border-b border-fb-border">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fb-blue">
                  <Sparkles className="w-3.5 h-3.5" />
                  {post.memory_label || "Milestone Memory"}
                </span>
                <span className="text-xs text-fb-muted">
                  {new Date(post.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>

              {/* Author Info */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-fb-blue text-white flex items-center justify-center font-bold overflow-hidden">
                  {post.author_avatar_url ? (
                    <img
                      src={resolveMediaUrl(post.author_avatar_url)}
                      alt={post.author_display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    post.author_display_name[0]
                  )}
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-fb-text">{post.author_display_name}</h4>
                  <p className="text-xs text-fb-muted">@{post.author_username}</p>
                </div>
              </div>

              {/* Post Body */}
              {post.content && (
                <p className="text-sm text-fb-text whitespace-pre-line">{post.content}</p>
              )}

              {/* Post Media */}
              {post.image_url && (
                <div className="rounded-lg overflow-hidden bg-fb-input max-h-96">
                  <img
                    src={resolveMediaUrl(post.image_url)}
                    alt="Memory photo"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Engagement Stats */}
              <div className="flex items-center justify-between pt-2 text-xs text-fb-muted border-t border-fb-border">
                <span>{post.likes_count} reactions</span>
                <span>{post.comments?.length || 0} comments</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
