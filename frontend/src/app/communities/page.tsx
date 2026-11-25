"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Flag, Users, Plus, ExternalLink, Check } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface PageItem {
  id: number;
  name: string;
  handle: string;
  category: string;
  about: string;
  followers_count: number;
}

interface GroupItem {
  id: number;
  name: string;
  privacy: string;
  description: string;
  members_count: number;
  joined: boolean;
}

export default function CommunitiesPage() {
  const { user } = useAuth();
  const [pages, setPages] = useState<PageItem[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [tab, setTab] = useState<"pages" | "groups">("pages");
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [privacy, setPrivacy] = useState("public");

  const loadAll = async () => {
    const [p, g] = await Promise.all([
      apiFetch<PageItem[]>("/api/communities/pages"),
      apiFetch<GroupItem[]>("/api/communities/groups"),
    ]);
    setPages(p);
    setGroups(g);
  };

  useEffect(() => {
    loadAll().catch(() => {});
  }, [user?.id]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch("/api/communities/groups", {
      method: "POST",
      body: JSON.stringify({ name, privacy, description: about }),
    });
    setName("");
    setAbout("");
    setShowForm(false);
    loadAll();
  };

  return (
    <div className="space-y-5">
      <div className="bg-fb-card border border-fb-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("pages")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold ${
              tab === "pages" ? "bg-fb-blue text-white" : "bg-fb-input hover:bg-fb-hover"
            }`}
          >
            <Flag className="w-4 h-4" />
            Business Pages ({pages.length})
          </button>
          <button
            onClick={() => setTab("groups")}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold ${
              tab === "groups" ? "bg-fb-blue text-white" : "bg-fb-input hover:bg-fb-hover"
            }`}
          >
            <Users className="w-4 h-4" />
            Groups ({groups.length})
          </button>
        </div>

        {user && tab === "groups" && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" />
            Create Group
          </button>
        )}
        {user && tab === "pages" && (
          <Link
            href="/settings"
            className="text-xs font-semibold text-fb-blue hover:underline"
          >
            Create a Page in Settings →
          </Link>
        )}
      </div>

      {showForm && tab === "groups" && (
        <form onSubmit={handleCreateGroup} className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-3 shadow-sm">
          <h2 className="text-sm font-bold">New Community Group</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Group Name" className="px-3 py-2 rounded-lg bg-fb-input text-sm" />
            <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} className="px-3 py-2 rounded-lg bg-fb-input text-sm">
              <option value="public">Public Group</option>
              <option value="private">Private Group</option>
            </select>
          </div>
          <input value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Description / About..." className="w-full px-3 py-2 rounded-lg bg-fb-input text-sm" />
          <button type="submit" className="px-4 py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold">
            Create Group
          </button>
        </form>
      )}

      {tab === "pages" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pages.map((p) => (
            <div key={p.id} className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-2.5 shadow-sm flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-fb-blue">{p.category}</span>
                  <Link
                    href={`/pages/${p.handle}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-fb-muted hover:text-fb-blue"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                <Link href={`/pages/${p.handle}`} className="block font-bold text-base hover:text-fb-blue">
                  {p.name}
                </Link>
                <div className="text-xs text-fb-muted">@{p.handle} • {p.followers_count} followers</div>
                <p className="text-xs text-fb-muted line-clamp-2">{p.about}</p>
              </div>
              <div className="flex gap-2 pt-1">
                <Link
                  href={`/pages/${p.handle}`}
                  className="flex-1 text-center py-2 rounded-lg bg-fb-blue/10 hover:bg-fb-blue/20 text-fb-blue text-xs font-semibold"
                >
                  View Page
                </Link>
                {user && (
                  <button
                    onClick={() => apiFetch(`/api/communities/pages/${p.id}/follow`, { method: "POST" }).then(loadAll)}
                    className="flex-1 py-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs font-semibold"
                  >
                    Follow / Unfollow
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((g) => (
            <div key={g.id} className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-2 shadow-sm">
              <div className="text-[11px] font-semibold uppercase text-fb-muted">{g.privacy} group</div>
              <h3 className="font-bold text-base">{g.name}</h3>
              <div className="text-xs text-fb-muted">{g.members_count} members</div>
              <p className="text-xs text-fb-muted line-clamp-2">{g.description}</p>
              {user && (
                <button
                  onClick={() => apiFetch(`/api/communities/groups/${g.id}/join`, { method: "POST" }).then(loadAll)}
                  className="w-full py-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs font-semibold inline-flex items-center justify-center gap-1"
                >
                  {g.joined ? <><Check className="w-3.5 h-3.5" /> Joined</> : "Join Group"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
