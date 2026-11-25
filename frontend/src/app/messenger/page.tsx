"use client";

import React, { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  MessageCircle,
  Send,
  UserPlus,
  ArrowLeft,
  Users,
  Link2,
  Check,
  X,
  Copy,
  ShieldCheck,
  Image as ImageIcon,
  Pencil,
  Smile,
  Mic,
  Archive,
  Inbox,
  Volume2,
} from "lucide-react";
import { apiFetch, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Peer {
  id: number;
  username: string;
  display_name: string;
}

interface Conversation {
  id: string;
  is_group?: boolean;
  name?: string;
  admin_id?: number;
  invite_code?: string;
  pending_count?: number;
  participants: number[];
  peer: Peer | null;
  last_message: string;
  is_archived?: boolean;
  is_request?: boolean;
  updated_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: number;
  sender_username: string;
  text: string;
  media_url?: string;
  media_type?: string;
  edited?: boolean;
  created_at: string;
}

const EMOJI_CATEGORIES = [
  {
    label: "Smileys",
    emojis: ["😀", "😂", "🥹", "😍", "🤩", "😎", "🥳", "🤔", "😴", "😭", "😡", "🤯", "😇", "🤗", "🙃", "😜"],
  },
  {
    label: "Gestures",
    emojis: ["👍", "👎", "👏", "🙌", "🤝", "🙏", "✌️", "🤞", "🫶", "❤️", "🧡", "💛", "💚", "💙", "💜", "🔥"],
  },
  {
    label: "Nature",
    emojis: ["🐶", "🐱", "🐼", "🦊", "🦁", "🌸", "🌹", "🌻", "🌈", "☀️", "🌙", "⭐", "🌊", "🍀", "🦋", "🌴"],
  },
  {
    label: "Food & Fun",
    emojis: ["🍕", "🍔", "🍟", "🍩", "🍰", "☕", "🧋", "🍓", "🎉", "🎊", "🎁", "🎈", "🎮", "🎵", "🏆", "⚽"],
  },
  {
    label: "Symbols",
    emojis: ["✅", "❌", "💯", "⚡", "💡", "📌", "🚀", "💎", "🔔", "📣", "💬", "👀", "✨", "💫", "🎯", "🛡️"],
  },
];

function MessengerContent() {
  const { user, liveEvents } = useAuth();
  const searchParams = useSearchParams();
  const joinCodeParam = searchParams.get("join") || "";

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [users, setUsers] = useState<Peer[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");

  const [activeFolder, setActiveFolder] = useState<"inbox" | "requests" | "archived">("inbox");
  const [showNewChat, setShowNewChat] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showJoinLink, setShowJoinLink] = useState(Boolean(joinCodeParam));
  const [groupName, setGroupName] = useState("");
  const [joinInput, setJoinInput] = useState(joinCodeParam);
  const [joinStatus, setJoinStatus] = useState("");
  const [pendingRequests, setPendingRequests] = useState<Peer[]>([]);
  const [showRequests, setShowRequests] = useState(false);
  const [copied, setCopied] = useState(false);
  const [groupMembers, setGroupMembers] = useState<Peer[]>([]);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const lastTypingSentRef = React.useRef<number>(0);
  const typingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Media upload, emoji picker & group message edit state
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingMedia, setPendingMedia] = useState<{
    file: File;
    previewUrl: string;
    mediaType: "image" | "video" | "audio";
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiTab, setEmojiTab] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const loadConversations = async () => {
    if (!user) return;
    try {
      const data = await apiFetch<Conversation[]>(`/api/messenger/conversations?folder=${activeFolder}`);
      setConversations(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadConversations();
    apiFetch<Peer[]>("/api/auth/users").then((u) =>
      setUsers(u.filter((item) => item.id !== user.id))
    );
  }, [user?.id, activeFolder]);

  useEffect(() => {
    if (joinCodeParam) {
      setJoinInput(joinCodeParam);
      setShowJoinLink(true);
    }
  }, [joinCodeParam]);

  useEffect(() => {
    if (!activeId || !user) return;
    apiFetch<Message[]>(`/api/messenger/conversations/${activeId}/messages`).then(setMessages);
    apiFetch<Peer[]>(`/api/messenger/conversations/${activeId}/members`).then(setGroupMembers).catch(() => {});
    setShowRequests(false);
    setTypingUser(null);
  }, [activeId, user?.id]);

  useEffect(() => {
    const latest = liveEvents[0];
    if (!latest) return;
    if (latest.event === "message.created") {
      const msgData = latest.data as Message;
      if (msgData.conversation_id === activeId) {
        setMessages((prev) => (prev.some((m) => m.id === msgData.id) ? prev : [...prev, msgData]));
        setTypingUser(null);
      }
      loadConversations();
    } else if (latest.event === "message.edited") {
      const editedMsg = latest.data as Message;
      if (editedMsg.conversation_id === activeId) {
        setMessages((prev) => prev.map((m) => (m.id === editedMsg.id ? editedMsg : m)));
      }
    } else if (latest.event === "typing") {
      const t = latest.data as { conversation_id: string; user_id: number; username: string };
      if (t.conversation_id === activeId && t.user_id !== user?.id) {
        setTypingUser(t.username);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setTypingUser(null), 3000);
      }
    } else if (latest.event === "group.join_request" || latest.event === "group.member_approved") {
      loadConversations();
    }
  }, [liveEvents]);

  const startChat = async (recipientId: number) => {
    const convo = await apiFetch<Conversation>("/api/messenger/conversations", {
      method: "POST",
      body: JSON.stringify({ recipient_id: recipientId }),
    });
    setShowNewChat(false);
    await loadConversations();
    setActiveId(convo.id);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    const created = await apiFetch<Conversation>("/api/messenger/groups", {
      method: "POST",
      body: JSON.stringify({ name: groupName }),
    });
    setGroupName("");
    setShowCreateGroup(false);
    await loadConversations();
    setActiveId(created.id);
  };

  const handleJoinByLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinInput.trim()) return;
    setJoinStatus("");
    try {
      const code = joinInput.trim().split("/").pop() || joinInput.trim();
      const res = await apiFetch<{ status: string; group_name?: string; conversation_id?: string }>(
        `/api/messenger/groups/join/${code}`,
        { method: "POST" }
      );
      if (res.status === "already_member" && res.conversation_id) {
        setJoinStatus(`Already a member of ${res.group_name}! Opening chat...`);
        await loadConversations();
        setActiveId(res.conversation_id);
        setShowJoinLink(false);
      } else {
        setJoinStatus(`Join request sent for ${res.group_name}! Waiting for admin approval.`);
        setJoinInput("");
      }
    } catch (err: any) {
      setJoinStatus(err.message || "Failed to join group");
    }
  };

  const loadJoinRequests = async (convoId: string) => {
    const reqs = await apiFetch<Peer[]>(`/api/messenger/groups/${convoId}/requests`);
    setPendingRequests(reqs);
    setShowRequests(true);
  };

  const handleApprove = async (convoId: string, uid: number) => {
    await apiFetch(`/api/messenger/groups/${convoId}/approve/${uid}`, { method: "POST" });
    loadJoinRequests(convoId);
    loadConversations();
  };

  const handleReject = async (convoId: string, uid: number) => {
    await apiFetch(`/api/messenger/groups/${convoId}/reject/${uid}`, { method: "POST" });
    loadJoinRequests(convoId);
    loadConversations();
  };

  const handleToggleArchive = async (convoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiFetch(`/api/messenger/conversations/${convoId}/archive`, { method: "POST" });
      await loadConversations();
    } catch (err: any) {
      alert(err.message || "Failed to update archive");
    }
  };

  const handleSelectMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (pendingMedia) URL.revokeObjectURL(pendingMedia.previewUrl);
    setChatError("");
    let mediaType: "image" | "video" | "audio" = "image";
    if (file.type.startsWith("video/")) {
      mediaType = "video";
    } else if (file.type.startsWith("audio/")) {
      mediaType = "audio";
    }
    setPendingMedia({
      file,
      previewUrl: URL.createObjectURL(file),
      mediaType,
    });
  };

  const clearPendingMedia = () => {
    if (pendingMedia) URL.revokeObjectURL(pendingMedia.previewUrl);
    setPendingMedia(null);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeId || (!text.trim() && !pendingMedia)) return;
    setChatError("");
    setSending(true);
    try {
      let media_url = "";
      let media_type = "";
      if (pendingMedia) {
        const form = new FormData();
        form.append("file", pendingMedia.file);
        const uploaded = await apiFetch<{ url: string; media_type: string }>("/api/messenger/upload", {
          method: "POST",
          body: form,
        });
        media_url = uploaded.url;
        media_type = uploaded.media_type;
      }

      const sent = await apiFetch<Message>(`/api/messenger/conversations/${activeId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text, media_url, media_type }),
      });
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      setText("");
      setShowEmojiPicker(false);
      clearPendingMedia();
      loadConversations();
    } catch (err: any) {
      setChatError(err.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const handleStartEdit = (msg: Message) => {
    setEditingId(msg.id);
    setEditDraft(msg.text);
  };

  const handleSaveEdit = async (messageId: string) => {
    if (!editDraft.trim()) return;
    setSavingEdit(true);
    try {
      const updated = await apiFetch<Message>(`/api/messenger/messages/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ text: editDraft.trim() }),
      });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? updated : m)));
      setEditingId(null);
      setEditDraft("");
    } catch (err: any) {
      alert(err.message || "Failed to edit message");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const handleAddEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
  };

  const copyInviteLink = (code: string) => {
    const fullUrl = `${window.location.origin}/messenger?join=${code}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeConvo = conversations.find((c) => c.id === activeId);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <MessageCircle className="w-16 h-16 text-fb-muted mx-auto" />
        <h2 className="text-2xl font-bold">Connect with friends on Messenger</h2>
        <p className="text-fb-muted text-sm">Sign in to start private chats or join group conversations.</p>
        <Link href="/auth" className="inline-block px-6 py-2.5 bg-fb-blue text-white rounded-lg font-semibold">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-fb-card border border-fb-border rounded-xl overflow-hidden grid grid-cols-1 md:grid-cols-3 h-[calc(100vh-8.5rem)] min-h-[500px] shadow-sm">
      {/* Conversation List */}
      <div className={`border-r border-fb-border flex flex-col ${activeId ? "hidden md:flex" : "flex"}`}>
        <div className="p-3.5 border-b border-fb-border space-y-2.5">
          <div className="flex items-center justify-between">
            <h1 className="font-bold text-lg">Chats</h1>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setShowNewChat(!showNewChat);
                  setShowCreateGroup(false);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-fb-input hover:bg-fb-hover text-xs font-semibold"
                title="New 1:1 Chat"
              >
                <UserPlus className="w-3.5 h-3.5 text-fb-blue" />
                New
              </button>
              <button
                onClick={() => {
                  setShowCreateGroup(!showCreateGroup);
                  setShowNewChat(false);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-fb-blue text-white text-xs font-semibold"
                title="Create Group Chat"
              >
                <Users className="w-3.5 h-3.5" />
                Group
              </button>
              <button
                onClick={() => setShowJoinLink(!showJoinLink)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-fb-input hover:bg-fb-hover text-xs font-semibold"
                title="Join Group via Link"
              >
                <Link2 className="w-3.5 h-3.5 text-emerald-600" />
              </button>
            </div>
          </div>

          {/* Folder Switcher */}
          <div className="flex items-center gap-1 bg-fb-input p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveFolder("inbox")}
              className={`flex-1 py-1 rounded-lg text-center transition flex items-center justify-center gap-1 ${
                activeFolder === "inbox" ? "bg-fb-card text-fb-text shadow-sm" : "text-fb-muted hover:text-fb-text"
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              Chats
            </button>
            <button
              onClick={() => setActiveFolder("requests")}
              className={`flex-1 py-1 rounded-lg text-center transition flex items-center justify-center gap-1 ${
                activeFolder === "requests" ? "bg-fb-card text-fb-text shadow-sm" : "text-fb-muted hover:text-fb-text"
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Requests
            </button>
            <button
              onClick={() => setActiveFolder("archived")}
              className={`flex-1 py-1 rounded-lg text-center transition flex items-center justify-center gap-1 ${
                activeFolder === "archived" ? "bg-fb-card text-fb-text shadow-sm" : "text-fb-muted hover:text-fb-text"
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              Archived
            </button>
          </div>

          {showCreateGroup && (
            <form onSubmit={handleCreateGroup} className="flex gap-1.5 pt-1">
              <input
                required
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-fb-input text-xs focus:outline-none"
              />
              <button type="submit" className="px-3 py-1.5 rounded-lg bg-fb-blue text-white text-xs font-semibold">
                Create
              </button>
            </form>
          )}

          {showJoinLink && (
            <form onSubmit={handleJoinByLink} className="space-y-1.5 pt-1">
              <div className="flex gap-1.5">
                <input
                  required
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  placeholder="Paste group invite link or code..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-fb-input text-xs focus:outline-none"
                />
                <button type="submit" className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold">
                  Join
                </button>
              </div>
              {joinStatus && <p className="text-[11px] text-fb-blue font-medium">{joinStatus}</p>}
            </form>
          )}
        </div>

        {showNewChat && (
          <div className="p-3 bg-fb-input border-b border-fb-border space-y-1.5 max-h-48 overflow-y-auto">
            <div className="text-[11px] font-semibold text-fb-muted">Select user to message:</div>
            {users.length === 0 ? (
              <p className="text-xs text-fb-muted">No other users registered yet.</p>
            ) : (
              users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => startChat(u.id)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-fb-card hover:bg-fb-hover text-xs flex justify-between"
                >
                  <span className="font-semibold">{u.display_name}</span>
                  <span className="text-fb-muted">@{u.username}</span>
                </button>
              ))
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-fb-border">
          {conversations.length === 0 ? (
            <p className="text-xs text-fb-muted p-6 text-center">
              No chats in this folder. Start a 1:1 chat or create a group!
            </p>
          ) : (
            conversations.map((c) => {
              const title = c.is_group ? c.name : c.peer?.display_name || "Chat";
              return (
                <div
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full text-left p-3.5 hover:bg-fb-hover transition flex items-center justify-between gap-2 cursor-pointer group ${
                    activeId === c.id ? "bg-fb-blue/10" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-fb-blue text-white flex items-center justify-center font-bold shrink-0">
                      {c.is_group ? <Users className="w-5 h-5" /> : title?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{title}</div>
                      <div className="text-xs text-fb-muted truncate">{c.last_message || "Start chatting..."}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(c.pending_count || 0) > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-bold">
                        {c.pending_count}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleToggleArchive(c.id, e)}
                      className="p-1 text-fb-muted hover:text-fb-text rounded-md hover:bg-fb-input transition opacity-0 group-hover:opacity-100"
                      title={c.is_archived ? "Unarchive conversation" : "Archive conversation"}
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Window */}
      <div className={`md:col-span-2 flex flex-col ${activeId ? "flex" : "hidden md:flex"}`}>
        {activeConvo ? (
          <>
            {/* Header */}
            <div className="p-3.5 border-b border-fb-border flex items-center justify-between gap-3 bg-fb-card">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setActiveId(null)}
                  className="md:hidden p-1.5 rounded-full hover:bg-fb-hover text-fb-muted"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-9 h-9 rounded-full bg-fb-blue text-white flex items-center justify-center font-bold shrink-0">
                  {activeConvo.is_group ? <Users className="w-4 h-4" /> : activeConvo.peer?.display_name?.[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {activeConvo.is_group ? activeConvo.name : activeConvo.peer?.display_name}
                  </div>
                  <div className="text-xs text-fb-muted truncate">
                    {activeConvo.is_group
                      ? `${groupMembers.length || activeConvo.participants.length} members`
                      : `@${activeConvo.peer?.username}`}
                  </div>
                </div>
              </div>

              {/* Group Admin & Invite Controls */}
              {activeConvo.is_group && (
                <div className="flex items-center gap-2">
                  {activeConvo.invite_code && (
                    <button
                      onClick={() => copyInviteLink(activeConvo.invite_code!)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-fb-input hover:bg-fb-hover text-xs font-semibold"
                      title="Copy invite link to share"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span className="hidden sm:inline">{copied ? "Copied" : "Invite"}</span>
                    </button>
                  )}

                  {activeConvo.admin_id === user.id && (
                    <button
                      onClick={() =>
                        showRequests ? setShowRequests(false) : loadJoinRequests(activeConvo.id)
                      }
                      className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                      title="Review pending member requests"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Requests</span>
                      {(activeConvo.pending_count || 0) > 0 && (
                        <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Pending Requests Drawer */}
            {showRequests && activeConvo.is_group && activeConvo.admin_id === user.id && (
              <div className="p-3 bg-fb-input border-b border-fb-border space-y-2">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>Pending Join Requests ({pendingRequests.length})</span>
                  <button onClick={() => setShowRequests(false)} className="text-fb-muted hover:text-fb-text">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {pendingRequests.length === 0 ? (
                  <p className="text-xs text-fb-muted">No pending requests right now.</p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {pendingRequests.map((req) => (
                      <div
                        key={req.id}
                        className="p-2 rounded-lg bg-fb-card flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <span className="font-semibold">{req.display_name}</span>{" "}
                          <span className="text-fb-muted">@{req.username}</span>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleApprove(activeConvo.id, req.id)}
                            className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                            title="Approve"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleReject(activeConvo.id, req.id)}
                            className="p-1 rounded bg-red-600 text-white hover:bg-red-700"
                            title="Reject"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center text-xs text-fb-muted">
                  No messages yet. Send a greeting, photo, or audio note!
                </div>
              )}
              {messages.map((m) => {
                const mine = m.sender_id === user.id;
                const isEditing = editingId === m.id;
                return (
                  <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"} group`}>
                    <div
                      className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm space-y-1.5 ${
                        mine
                          ? "bg-fb-blue text-white rounded-br-sm"
                          : "bg-fb-input text-fb-text rounded-bl-sm"
                      }`}
                    >
                      {activeConvo.is_group && !mine && (
                        <div className="text-[10px] font-bold opacity-75">@{m.sender_username}</div>
                      )}

                      {m.media_url && (
                        <div className="rounded-xl overflow-hidden bg-black/10">
                          {m.media_type === "video" ? (
                            <video
                              src={resolveMediaUrl(m.media_url)}
                              controls
                              className="max-h-64 w-full rounded-xl bg-black"
                            />
                          ) : m.media_type === "audio" ? (
                            <div className="p-2 bg-black/20 rounded-xl my-1 flex items-center gap-2">
                              <audio
                                src={resolveMediaUrl(m.media_url)}
                                controls
                                className="w-56 max-w-full"
                              />
                            </div>
                          ) : (
                            <img
                              src={resolveMediaUrl(m.media_url)}
                              alt="Shared media"
                              className="max-h-64 w-full object-cover rounded-xl"
                            />
                          )}
                        </div>
                      )}

                      {isEditing ? (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <input
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            className="flex-1 px-2.5 py-1 rounded-lg bg-white text-black text-xs focus:outline-none"
                          />
                          <button
                            onClick={() => handleSaveEdit(m.id)}
                            disabled={savingEdit}
                            className="p-1 rounded bg-emerald-600 text-white text-xs font-bold"
                            title="Save Edit"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-1 rounded bg-gray-500 text-white text-xs"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        m.text && <div className="whitespace-pre-line break-words">{m.text}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-fb-muted px-1 mt-0.5">
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {m.edited && <span className="italic">(edited)</span>}
                      {/* Allow editing own messages in group chat */}
                      {mine && activeConvo.is_group && !isEditing && (
                        <button
                          onClick={() => handleStartEdit(m)}
                          className="opacity-0 group-hover:opacity-100 hover:text-fb-blue transition flex items-center gap-0.5 ml-1"
                          title="Edit message"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>edit</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Typing Indicator */}
            {typingUser && (
              <div className="px-4 py-1.5 text-xs text-fb-muted bg-fb-canvas/50 flex items-center gap-1.5">
                <span className="font-semibold text-fb-blue">@{typingUser}</span>
                <span>is typing</span>
                <span className="inline-flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-fb-muted animate-bounce" />
                  <span className="w-1 h-1 rounded-full bg-fb-muted animate-bounce [animation-delay:150ms]" />
                  <span className="w-1 h-1 rounded-full bg-fb-muted animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            )}

            {/* @Mention Autocomplete in Group Chat */}
            {activeConvo.is_group && /(^|\s)@([a-zA-Z0-9_]*)$/.test(text) && (
              <div className="px-3 py-2 border-t border-fb-border bg-fb-input flex flex-wrap gap-1.5">
                {groupMembers
                  .filter((gm) => {
                    const match = text.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
                    const q = (match?.[1] || "").toLowerCase();
                    return gm.id !== user.id && gm.username.toLowerCase().includes(q);
                  })
                  .map((gm) => (
                    <button
                      key={gm.id}
                      type="button"
                      onClick={() => {
                        setText((prev) => prev.replace(/@([a-zA-Z0-9_]*)$/, `@${gm.username} `));
                      }}
                      className="px-2.5 py-1 rounded-full bg-fb-card border border-fb-border hover:border-fb-blue text-xs font-semibold"
                    >
                      @{gm.username} <span className="text-fb-muted font-normal">({gm.display_name})</span>
                    </button>
                  ))}
              </div>
            )}

            {chatError && (
              <div className="px-4 py-1.5 text-xs text-red-600 bg-fb-card border-t border-fb-border">
                {chatError}
              </div>
            )}

            {/* Pending Media Preview */}
            {pendingMedia && (
              <div className="px-3 py-2 border-t border-fb-border bg-fb-input/60 flex items-center gap-3">
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-fb-border bg-black/10 shrink-0">
                  {pendingMedia.mediaType === "video" ? (
                    <video src={pendingMedia.previewUrl} className="w-full h-full object-cover" />
                  ) : pendingMedia.mediaType === "audio" ? (
                    <div className="w-full h-full flex items-center justify-center bg-fb-blue text-white">
                      <Mic className="w-6 h-6" />
                    </div>
                  ) : (
                    <img src={pendingMedia.previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-xs">
                  <div className="font-semibold truncate">{pendingMedia.file.name}</div>
                  <div className="text-fb-muted capitalize">{pendingMedia.mediaType} ready to send</div>
                </div>
                <button
                  type="button"
                  onClick={clearPendingMedia}
                  className="p-1.5 rounded-full hover:bg-fb-hover"
                  aria-label="Remove attachment"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Categorized Emoji Picker */}
            {showEmojiPicker && (
              <div className="border-t border-fb-border bg-fb-card p-2.5 space-y-2">
                <div className="flex gap-1 overflow-x-auto pb-1 border-b border-fb-border">
                  {EMOJI_CATEGORIES.map((cat, idx) => (
                    <button
                      key={cat.label}
                      type="button"
                      onClick={() => setEmojiTab(idx)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap ${
                        emojiTab === idx ? "bg-fb-blue text-white" : "bg-fb-input hover:bg-fb-hover"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-8 sm:grid-cols-12 gap-1.5 max-h-36 overflow-y-auto">
                  {EMOJI_CATEGORIES[emojiTab].emojis.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => handleAddEmoji(em)}
                      className="text-xl p-1.5 rounded-lg hover:bg-fb-hover text-center transition"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <input
              ref={mediaInputRef}
              type="file"
              accept="image/*,video/*,audio/*"
              onChange={handleSelectMedia}
              className="hidden"
            />

            <form onSubmit={handleSend} className="p-3 border-t border-fb-border flex items-center gap-2">
              <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                title="Share Photo, Video or Audio file"
                className="p-2 rounded-full bg-fb-input hover:bg-fb-hover text-emerald-600 shrink-0"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                title="Send Audio / Voice Note"
                className="p-2 rounded-full bg-fb-input hover:bg-fb-hover text-purple-600 shrink-0"
              >
                <Mic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowEmojiPicker((v) => !v)}
                title="Insert Emoji"
                className={`p-2 rounded-full shrink-0 ${
                  showEmojiPicker ? "bg-fb-blue text-white" : "bg-fb-input hover:bg-fb-hover text-amber-500"
                }`}
              >
                <Smile className="w-4 h-4" />
              </button>
              <input
                value={text}
                onChange={(e) => {
                  const val = e.target.value;
                  setText(val);
                  const now = Date.now();
                  if (activeId && val.trim() && now - lastTypingSentRef.current > 2000) {
                    lastTypingSentRef.current = now;
                    apiFetch(`/api/messenger/conversations/${activeId}/typing`, { method: "POST" }).catch(() => {});
                  }
                }}
                placeholder={activeConvo.is_group ? "Aa (type @ to mention)" : "Aa"}
                className="flex-1 px-4 py-2 rounded-full bg-fb-input text-sm focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending}
                className="px-4 py-2 rounded-full bg-fb-blue hover:bg-fb-blueHover text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-fb-muted">
            Select a conversation or create a group to start messaging
          </div>
        )}
      </div>
    </div>
  );
}

export default function MessengerPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-fb-muted">Loading Messenger...</div>}>
      <MessengerContent />
    </Suspense>
  );
}
