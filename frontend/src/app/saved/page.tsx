"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Folder, Trash2, ExternalLink, Sparkles, Filter } from "lucide-react";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface SavedItem {
  id: string;
  target_type: "post" | "video" | "product" | "project";
  target_id: string;
  collection_name: string;
  title: string;
  image_url: string;
  snippet: string;
  created_at: string;
}

export default function SavedPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [collections, setCollections] = useState<string[]>(["All Items"]);
  const [activeCollection, setActiveCollection] = useState("All Items");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [collsRes, itemsRes] = await Promise.all([
        apiFetch<string[]>("/api/social/saved/collections"),
        apiFetch<SavedItem[]>(
          activeCollection === "All Items"
            ? "/api/social/saved"
            : `/api/social/saved?collection=${encodeURIComponent(activeCollection)}`
        ),
      ]);
      setCollections(collsRes || ["All Items"]);
      setItems(itemsRes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, activeCollection]);

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this item from your saved items?")) return;
    try {
      await apiFetch(`/api/social/saved/${id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      alert(err.message || "Failed to remove item");
    }
  };

  const getTargetLink = (item: SavedItem) => {
    switch (item.target_type) {
      case "video":
        return `/tube`;
      case "product":
        return `/shop`;
      case "project":
        return `/shop`;
      default:
        return `/#post-${item.target_id}`;
    }
  };

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <Bookmark className="w-16 h-16 text-fb-muted mx-auto" />
        <h2 className="text-2xl font-bold">Save items for later</h2>
        <p className="text-fb-muted text-sm">
          Log in to access your personal bookmarked posts, videos, and products.
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
    <div className="max-w-5xl mx-auto py-4 space-y-6">
      {/* Header */}
      <div className="bg-fb-card border border-fb-border rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <Bookmark className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-fb-text">Saved Items</h1>
            <p className="text-xs text-fb-muted">
              Organize and review content you bookmarked across Facebook, Tube, and Shop.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Collections Sidebar */}
        <div className="md:col-span-1 space-y-2">
          <div className="bg-fb-card border border-fb-border rounded-xl p-3 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wider text-fb-muted px-3 py-2 flex items-center gap-2">
              <Folder className="w-3.5 h-3.5" /> Collections
            </div>
            <div className="space-y-1">
              {collections.map((col) => (
                <button
                  key={col}
                  onClick={() => setActiveCollection(col)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition flex items-center justify-between ${
                    activeCollection === col
                      ? "bg-fb-blue text-white shadow-sm"
                      : "text-fb-text hover:bg-fb-hover"
                  }`}
                >
                  <span className="truncate">{col}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Saved Items List */}
        <div className="md:col-span-3 space-y-4">
          {loading ? (
            <div className="bg-fb-card border border-fb-border rounded-xl p-12 text-center text-fb-muted text-sm">
              Loading your saved items...
            </div>
          ) : items.length === 0 ? (
            <div className="bg-fb-card border border-fb-border rounded-xl p-12 text-center space-y-3">
              <Bookmark className="w-12 h-12 text-fb-muted mx-auto opacity-50" />
              <h3 className="font-bold text-lg text-fb-text">No saved items in this collection</h3>
              <p className="text-xs text-fb-muted max-w-sm mx-auto">
                Click the bookmark or save button on feed posts, creator videos, or shop items to save them here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-fb-card border border-fb-border rounded-xl p-4 shadow-sm flex flex-col justify-between hover:border-fb-blue/50 transition group"
                >
                  <div className="space-y-2.5">
                    {item.image_url && (
                      <div className="w-full h-36 rounded-lg overflow-hidden bg-fb-input">
                        <img
                          src={resolveMediaUrl(item.image_url)}
                          alt={item.title || "Saved media"}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-fb-input text-fb-muted">
                        {item.target_type}
                      </span>
                      <span className="text-[11px] text-fb-muted truncate">
                        {item.collection_name}
                      </span>
                    </div>
                    <h4 className="font-semibold text-sm text-fb-text line-clamp-2">
                      {item.title || item.snippet || "Saved item"}
                    </h4>
                    {item.snippet && item.title && (
                      <p className="text-xs text-fb-muted line-clamp-2">{item.snippet}</p>
                    )}
                  </div>

                  <div className="pt-4 mt-3 border-t border-fb-border flex items-center justify-between">
                    <Link
                      href={getTargetLink(item)}
                      className="text-xs text-fb-blue font-semibold hover:underline flex items-center gap-1"
                    >
                      View item <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-fb-muted hover:text-red-500 rounded-lg hover:bg-fb-input transition"
                      title="Remove from saved"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
