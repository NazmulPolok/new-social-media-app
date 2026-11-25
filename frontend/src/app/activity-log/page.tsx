"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Shield, MessageSquare, Heart, Clock, Filter, CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface ActivityItem {
  id: string;
  type: "post" | "security" | "comment" | "reaction";
  action: string;
  target: string;
  details: string;
  created_at: string;
}

interface ActivityLogResponse {
  user_id: number;
  total_activities: number;
  activities: ActivityItem[];
}

export default function ActivityLogPage() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [filterType, setFilterType] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const url =
        filterType === "all"
          ? "/api/social/activity-log"
          : `/api/social/activity-log?action_type=${encodeURIComponent(filterType)}`;
      const res = await apiFetch<ActivityLogResponse>(url);
      setActivities(res.activities || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchLogs();
    }
  }, [user, filterType]);

  const getIcon = (type: string) => {
    switch (type) {
      case "security":
        return <Shield className="w-4 h-4 text-emerald-500" />;
      case "post":
        return <MessageSquare className="w-4 h-4 text-fb-blue" />;
      case "comment":
        return <MessageSquare className="w-4 h-4 text-indigo-500" />;
      default:
        return <Activity className="w-4 h-4 text-purple-500" />;
    }
  };

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <Activity className="w-16 h-16 text-fb-muted mx-auto" />
        <h2 className="text-2xl font-bold">Your Activity Log</h2>
        <p className="text-fb-muted text-sm">
          Sign in to view your secure audit history and platform interactions.
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
    <div className="max-w-4xl mx-auto py-4 space-y-6">
      {/* Header */}
      <div className="bg-fb-card border border-fb-border rounded-xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-fb-blue flex items-center justify-center">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-fb-text">Activity Log</h1>
            <p className="text-xs text-fb-muted">
              Review and manage your activities, posts, and security audit log.
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-fb-input p-1 rounded-xl text-xs font-semibold">
          {[
            { id: "all", label: "All" },
            { id: "post", label: "Posts" },
            { id: "security", label: "Security & Auth" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={`px-3 py-1.5 rounded-lg transition ${
                filterType === f.id
                  ? "bg-fb-card text-fb-text shadow-sm"
                  : "text-fb-muted hover:text-fb-text"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-fb-card border border-fb-border rounded-xl p-5 shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-fb-muted text-sm">
            Retrieving your activity timeline...
          </div>
        ) : activities.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-fb-muted mx-auto opacity-50" />
            <h3 className="font-bold text-base text-fb-text">No activity recorded</h3>
            <p className="text-xs text-fb-muted">No entries match your current filter selection.</p>
          </div>
        ) : (
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-fb-border">
            {activities.map((act) => (
              <div key={act.id} className="relative group flex items-start gap-3">
                <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-fb-card border-2 border-fb-border flex items-center justify-center shadow-sm">
                  {getIcon(act.type)}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm text-fb-text">{act.action}</span>
                    <span className="text-[11px] text-fb-muted flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(act.created_at).toLocaleString()}
                    </span>
                  </div>
                  {act.target && (
                    <p className="text-xs text-fb-muted font-medium bg-fb-input p-2 rounded-lg">
                      {act.target}
                    </p>
                  )}
                  {act.details && (
                    <p className="text-[11px] text-fb-muted">{act.details}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
