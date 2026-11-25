"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface SearchResults {
  users: { id: number; username: string; display_name: string }[];
  pages: { id: number; name: string; handle: string; category: string }[];
  groups: { id: number; name: string; privacy: string }[];
  channels: { id: number; name: string; handle: string }[];
  videos: { id: number; title: string; views_count: number }[];
  shops: { id: number; name: string; slug: string }[];
  products: { id: number; name: string; price_dollars: number; shop_slug: string }[];
  projects: { id: number; title: string; slug: string; price_dollars: number }[];
}

function SearchContent() {
  const params = useSearchParams();
  const initialQ = params.get("q") || "";
  const [q, setQ] = useState(initialQ);
  const [results, setResults] = useState<SearchResults | null>(null);

  const runSearch = async (term: string) => {
    const res = await apiFetch<SearchResults>(`/api/search?q=${encodeURIComponent(term)}`);
    setResults(res);
  };

  useEffect(() => {
    if (initialQ) runSearch(initialQ).catch(() => {});
  }, [initialQ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(q).catch(() => {});
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <form onSubmit={handleSubmit} className="bg-fb-card border border-fb-border rounded-xl p-3 flex gap-2 shadow-sm">
        <Search className="w-5 h-5 text-fb-muted my-auto ml-2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people, pages, groups, channels, videos, shops, products, or projects..."
          className="flex-1 bg-transparent text-sm focus:outline-none"
        />
        <button type="submit" className="px-4 py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold">
          Search
        </button>
      </form>

      {results && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {results.users.length > 0 && (
            <div className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-2">
              <h2 className="font-bold text-sm">People</h2>
              {results.users.map((u) => (
                <Link key={u.id} href={`/u/${u.username}`} className="block p-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs">
                  <strong>{u.display_name}</strong> <span className="text-fb-muted">@{u.username}</span>
                </Link>
              ))}
            </div>
          )}

          {results.projects.length > 0 && (
            <div className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-2">
              <h2 className="font-bold text-sm">Digital Projects</h2>
              {results.projects.map((p) => (
                <Link key={p.id} href="/projects" className="flex justify-between p-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs">
                  <strong>{p.title}</strong>
                  <span className="text-fb-blue font-bold">${p.price_dollars.toFixed(2)}</span>
                </Link>
              ))}
            </div>
          )}

          {results.products.length > 0 && (
            <div className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-2">
              <h2 className="font-bold text-sm">Products</h2>
              {results.products.map((p) => (
                <Link key={p.id} href={`/shop/${p.shop_slug}`} className="flex justify-between p-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs">
                  <strong>{p.name}</strong>
                  <span className="text-fb-blue font-bold">${p.price_dollars.toFixed(2)}</span>
                </Link>
              ))}
            </div>
          )}

          {results.videos.length > 0 && (
            <div className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-2">
              <h2 className="font-bold text-sm">Creator Videos</h2>
              {results.videos.map((v) => (
                <Link key={v.id} href="/tube" className="flex justify-between p-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs">
                  <strong>{v.title}</strong>
                  <span className="text-fb-muted">{v.views_count} views</span>
                </Link>
              ))}
            </div>
          )}

          {results.shops.length > 0 && (
            <div className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-2">
              <h2 className="font-bold text-sm">Shops</h2>
              {results.shops.map((s) => (
                <Link key={s.id} href={`/shop/${s.slug}`} className="block p-2 rounded-lg bg-fb-input hover:bg-fb-hover text-xs">
                  <strong>{s.name}</strong>
                </Link>
              ))}
            </div>
          )}

          {(results.pages.length > 0 || results.groups.length > 0) && (
            <div className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-2">
              <h2 className="font-bold text-sm">Pages &amp; Groups</h2>
              {results.pages.map((p) => (
                <Link key={`p-${p.id}`} href="/communities" className="block p-2 rounded-lg bg-fb-input text-xs">
                  Page: <strong>{p.name}</strong> (@{p.handle})
                </Link>
              ))}
              {results.groups.map((g) => (
                <Link key={`g-${g.id}`} href="/communities" className="block p-2 rounded-lg bg-fb-input text-xs">
                  Group: <strong>{g.name}</strong> ({g.privacy})
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-fb-muted">Loading search...</div>}>
      <SearchContent />
    </Suspense>
  );
}
