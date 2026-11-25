"use client";

import React, { useEffect, useState } from "react";
import { Webhook, Send, Trash2, Database, Activity } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Subscription {
  id: string;
  name: string;
  target_url: string;
  events: string[];
  active: boolean;
  created_at: string;
}

interface Delivery {
  id: string;
  event_type: string;
  target_url: string;
  status_code: number;
  signature: string;
  delivered_at: string;
}

export default function WebhooksPage() {
  const { user } = useAuth();
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("http://localhost:8001/api/webhooks/receive");
  const [eventsInput, setEventsInput] = useState("message.created,order.created,video.uploaded");
  const [statusMsg, setStatusMsg] = useState("");

  const loadAll = async () => {
    const delivs = await apiFetch<Delivery[]>("/api/webhooks/deliveries");
    setDeliveries(delivs);
    if (user) {
      const s = await apiFetch<Subscription[]>("/api/webhooks/subscriptions");
      setSubs(s);
    }
  };

  useEffect(() => {
    loadAll().catch(() => {});
  }, [user?.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const events = eventsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    await apiFetch("/api/webhooks/subscriptions", {
      method: "POST",
      body: JSON.stringify({ name, target_url: targetUrl, events }),
    });
    setName("");
    setStatusMsg("Webhook subscription registered in MongoDB.");
    loadAll();
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/webhooks/subscriptions/${id}`, { method: "DELETE" });
    loadAll();
  };

  const handleTest = async () => {
    await apiFetch("/api/webhooks/test", {
      method: "POST",
      body: JSON.stringify({ event_type: "webhook.test", message: "Test event from VibeLink!" }),
    });
    setStatusMsg("Test webhook dispatched & logged.");
    loadAll();
  };

  return (
    <div className="space-y-5">
      <div className="bg-fb-card border border-fb-border rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Webhook className="w-5 h-5 text-fb-blue" />
            Webhooks &amp; Data Architecture
          </h1>
          <p className="text-xs text-fb-muted">
            PostgreSQL (relational), MongoDB (non-relational), Redis (cache), and HMAC-SHA256 Webhooks.
          </p>
        </div>
        {user && (
          <button
            onClick={handleTest}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fb-blue hover:bg-fb-blueHover text-white text-xs font-semibold"
          >
            <Send className="w-3.5 h-3.5" />
            Fire Test Webhook
          </button>
        )}
      </div>

      {statusMsg && (
        <div className="p-3 rounded-lg bg-fb-card border border-fb-border text-xs font-medium">
          {statusMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-2 shadow-sm">
          <div className="flex items-center gap-2 text-fb-blue font-bold text-sm">
            <Database className="w-4 h-4" />
            PostgreSQL (Relational)
          </div>
          <ul className="text-xs text-fb-muted space-y-1 list-disc list-inside">
            <li><code>users</code> — Hashed email (HMAC-SHA256) &amp; password (bcrypt)</li>
            <li><code>follows</code>, <code>channels</code>, <code>channel_subscriptions</code>, <code>videos</code></li>
            <li><code>shops</code>, <code>products</code>, <code>orders</code>, <code>order_items</code></li>
          </ul>
        </div>
        <div className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-2 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
            <Activity className="w-4 h-4" />
            MongoDB (Non-Relational) + Redis (Cache)
          </div>
          <ul className="text-xs text-fb-muted space-y-1 list-disc list-inside">
            <li><code>posts</code>, <code>conversations</code>, <code>messages</code>, <code>video_engagements</code></li>
            <li><code>webhook_subscriptions</code>, <code>webhook_deliveries</code>, <code>notifications</code></li>
            <li><strong>Redis</strong> caches feed, Creator videos/channels, and shop catalogs</li>
          </ul>
        </div>
      </div>

      {user && (
        <form onSubmit={handleCreate} className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-3 shadow-sm">
          <h2 className="text-sm font-bold">Register Outbound Webhook</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Webhook Name"
              className="px-3 py-2 rounded-lg bg-fb-input text-xs focus:outline-none"
            />
            <input
              required
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="Target URL"
              className="px-3 py-2 rounded-lg bg-fb-input text-xs focus:outline-none"
            />
            <input
              value={eventsInput}
              onChange={(e) => setEventsInput(e.target.value)}
              placeholder="Events (comma-separated or *)"
              className="px-3 py-2 rounded-lg bg-fb-input text-xs focus:outline-none"
            />
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg bg-fb-blue text-white text-xs font-semibold">
            Register Webhook
          </button>

          {subs.length > 0 && (
            <div className="pt-3 space-y-2">
              {subs.map((s) => (
                <div key={s.id} className="flex items-center justify-between p-2.5 rounded-lg bg-fb-input text-xs">
                  <div>
                    <span className="font-semibold">{s.name}</span>{" "}
                    <span className="text-fb-muted">→ {s.target_url}</span>
                    <div className="text-[11px] text-fb-blue">Events: {s.events.join(", ")}</div>
                  </div>
                  <button type="button" onClick={() => handleDelete(s.id)} className="text-fb-muted hover:text-red-500 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </form>
      )}

      <div className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-3 shadow-sm">
        <h2 className="text-sm font-bold">Recent Webhook Deliveries</h2>
        {deliveries.length === 0 ? (
          <p className="text-xs text-fb-muted">No deliveries yet.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {deliveries.map((d) => (
              <div key={d.id} className="p-3 rounded-lg bg-fb-input text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-fb-blue">{d.event_type}</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">
                    HTTP {d.status_code}
                  </span>
                </div>
                <div className="text-fb-muted truncate">Target: {d.target_url}</div>
                <div className="text-fb-muted font-mono text-[10px] truncate">Sig: {d.signature}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
