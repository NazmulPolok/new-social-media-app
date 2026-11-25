"use client";

import React, { useEffect, useState } from "react";
import { ShieldAlert, CheckCircle, Ban } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface AdminOverview {
  total_users: number;
  total_pages: number;
  total_groups: number;
  total_channels: number;
  total_videos: number;
  total_shops: number;
  total_products: number;
  total_projects: number;
  total_orders: number;
  total_revenue_dollars: number;
  open_reports: number;
}

interface AdminUser {
  id: number;
  username: string;
  display_name: string;
  role: string;
  is_verified: boolean;
  is_suspended: boolean;
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");

  const loadAdmin = async () => {
    try {
      const [ov, us] = await Promise.all([
        apiFetch<AdminOverview>("/api/admin/overview"),
        apiFetch<AdminUser[]>("/api/admin/users"),
      ]);
      setOverview(ov);
      setUsers(us);
    } catch (err: any) {
      setError(err.message || "Admin privileges required");
    }
  };

  useEffect(() => {
    if (user) loadAdmin();
  }, [user?.id]);

  if (!user || error) {
    return (
      <div className="max-w-md mx-auto mt-10 bg-fb-card border border-fb-border rounded-xl p-6 text-center space-y-2">
        <ShieldAlert className="w-8 h-8 text-red-600 mx-auto" />
        <h1 className="font-bold text-lg">Super Admin</h1>
        <p className="text-xs text-fb-muted">{error || "Sign in with an administrator account."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-fb-card border border-fb-border rounded-xl p-4 shadow-sm">
        <h1 className="text-xl font-bold">Platform Super Admin</h1>
        <p className="text-xs text-fb-muted">System-wide metrics, user verification/suspension, and audit trail.</p>
      </div>

      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            ["Users", overview.total_users],
            ["Pages", overview.total_pages],
            ["Groups", overview.total_groups],
            ["Channels", overview.total_channels],
            ["Videos", overview.total_videos],
            ["Shops", overview.total_shops],
            ["Products", overview.total_products],
            ["Projects", overview.total_projects],
            ["Orders", overview.total_orders],
            ["Revenue", `$${overview.total_revenue_dollars.toFixed(2)}`],
            ["Open Reports", overview.open_reports],
          ].map(([k, v]) => (
            <div key={String(k)} className="bg-fb-card border border-fb-border rounded-xl p-3 shadow-sm">
              <div className="text-[11px] text-fb-muted">{k}</div>
              <div className="text-lg font-bold">{v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-fb-card border border-fb-border rounded-xl p-4 space-y-3 shadow-sm">
        <h2 className="font-bold text-sm">User Management</h2>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-fb-input text-xs">
              <div>
                <strong>{u.display_name}</strong> (@{u.username}) • <span className="uppercase">{u.role}</span>
                {u.is_verified && <span className="ml-2 text-fb-blue font-semibold">Verified</span>}
                {u.is_suspended && <span className="ml-2 text-red-600 font-semibold">Suspended</span>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => apiFetch(`/api/admin/users/${u.id}/verify`, { method: "POST" }).then(loadAdmin)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-fb-card border border-fb-border hover:bg-fb-hover"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-fb-blue" /> Verify
                </button>
                <button
                  onClick={() => apiFetch(`/api/admin/users/${u.id}/suspend`, { method: "POST" }).then(loadAdmin)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-fb-card border border-fb-border hover:bg-fb-hover"
                >
                  <Ban className="w-3.5 h-3.5 text-red-600" /> Suspend
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
