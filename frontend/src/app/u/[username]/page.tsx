"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { UserPlus, Rss, Ban, MapPin, Globe, CheckCircle } from "lucide-react";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface PublicUser {
  id: number;
  username: string;
  display_name: string;
  is_verified: boolean;
  bio: string;
  location: string;
  website_url: string;
  avatar_url: string;
  cover_url: string;
  followers_count: number;
  following_count: number;
  friends_count: number;
}

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (params.username) {
      apiFetch<PublicUser>(`/api/auth/u/${params.username}`).then(setProfile).catch(() => {});
    }
  }, [params.username]);

  if (!profile) {
    return <div className="p-8 text-center text-sm text-fb-muted">Loading profile...</div>;
  }

  const coverSrc = resolveMediaUrl(profile.cover_url);
  const avatarSrc = resolveMediaUrl(profile.avatar_url);

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="bg-fb-card border border-fb-border rounded-xl overflow-hidden shadow-sm">
        <div className="h-36 sm:h-48 bg-fb-blue/15 border-b border-fb-border overflow-hidden">
          {coverSrc && <img src={coverSrc} alt="Cover" className="w-full h-full object-cover" />}
        </div>
        <div className="px-6 pb-6 -mt-12 flex flex-col sm:flex-row sm:items-end justify-between gap-4 relative z-10">
          <div className="flex items-end gap-4">
            <div className="w-24 h-24 rounded-full bg-fb-blue border-4 border-fb-card text-white flex items-center justify-center text-3xl font-bold overflow-hidden">
              {avatarSrc ? (
                <img src={avatarSrc} alt={profile.display_name} className="w-full h-full object-cover" />
              ) : (
                profile.display_name[0]?.toUpperCase()
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-1.5">
                {profile.display_name}
                {profile.is_verified && <CheckCircle className="w-5 h-5 text-fb-blue" />}
              </h1>
              <p className="text-sm text-fb-muted">@{profile.username}</p>
            </div>
          </div>

          {user && user.id !== profile.id && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  apiFetch(`/api/social/friends/request/${profile.id}`, { method: "POST" }).then(() =>
                    setMsg("Friend request sent!")
                  )
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold"
              >
                <UserPlus className="w-3.5 h-3.5" /> Add Friend
              </button>
              <button
                onClick={() =>
                  apiFetch(`/api/social/follow/${profile.id}`, { method: "POST" }).then(() =>
                    setMsg("Follow status updated!")
                  )
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs font-semibold"
              >
                <Rss className="w-3.5 h-3.5" /> Follow
              </button>
              <button
                onClick={() =>
                  apiFetch(`/api/social/block/${profile.id}`, { method: "POST" }).then(() =>
                    setMsg("Block status updated.")
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs font-semibold text-red-600"
              >
                <Ban className="w-3.5 h-3.5" /> Block
              </button>
            </div>
          )}
        </div>

        <div className="px-6 pb-5 space-y-2 text-xs text-fb-muted">
          <div className="flex gap-4 font-semibold text-fb-text">
            <span>{profile.friends_count} Friends</span>
            <span>{profile.followers_count} Followers</span>
            <span>{profile.following_count} Following</span>
          </div>
          {profile.bio && <p className="text-fb-text text-sm">{profile.bio}</p>}
          <div className="flex flex-wrap gap-4">
            {profile.location && (
              <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {profile.location}</span>
            )}
            {profile.website_url && (
              <a href={profile.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-fb-blue hover:underline">
                <Globe className="w-3.5 h-3.5" /> {profile.website_url}
              </a>
            )}
          </div>
        </div>
      </div>

      {msg && <div className="p-3 rounded-lg bg-fb-card border border-fb-border text-xs font-medium">{msg}</div>}
    </div>
  );
}
