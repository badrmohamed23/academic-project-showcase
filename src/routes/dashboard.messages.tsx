// Req #68–70 — Conversations list, send/receive private messages, realtime
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageCircle, Send, Search, UserPlus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { fullName } from "@/lib/validators";
import { startConversation } from "@/lib/messaging";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const LOCAL_DB_KEY = "bug-busters.json-db";

export const Route = createFileRoute("/dashboard/messages")({
  validateSearch: (s: Record<string, unknown>) => ({
    c: typeof s.c === "string" ? s.c : undefined,
  }),
  component: MessagesPage,
});

interface Conv {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string;
  other?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
    email: string;
    avatar_url: string | null;
  };
  preview?: string;
}

interface Msg {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

function formatConversationAge(value: string | null | undefined) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return formatDistanceToNow(date, { addSuffix: false });
}

function MessagesPage() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(search.c ?? null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadConvs = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("conversations")
      .select("id,user_a,user_b,last_message_at")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order("last_message_at", { ascending: false });
    const list = (data ?? []) as Conv[];
    if (list.length) {
      const otherIds = list.map((c) => (c.user_a === user.id ? c.user_b : c.user_a));
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,first_name,last_name,company_name,email,avatar_url")
        .in("id", otherIds);
      const m = new Map((profs ?? []).map((p) => [p.id as string, p]));
      // load preview = last message of each conversation
      const { data: lastMsgs } = await supabase
        .from("messages")
        .select("conversation_id,body,created_at")
        .in(
          "conversation_id",
          list.map((c) => c.id),
        )
        .order("created_at", { ascending: false });
      const seen = new Set<string>();
      const previews = new Map<string, string>();
      for (const lm of lastMsgs ?? []) {
        const cid = lm.conversation_id as string;
        if (seen.has(cid)) continue;
        seen.add(cid);
        previews.set(cid, lm.body as string);
      }
      for (const c of list) {
        c.other = (m.get(c.user_a === user.id ? c.user_b : c.user_a) as Conv["other"]) ?? undefined;
        c.preview = previews.get(c.id);
      }
    }
    setConvs(list);
    setLoading(false);
  };

  const loadMessages = async (conversationId: string | null = activeId) => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as Msg[]);
  };

  useEffect(() => {
    void loadConvs();
  }, [user]);

  // Realtime: subscribe to messages affecting this user
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("user-msgs-" + user.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as Msg;
          // refresh conversation list
          void loadConvs();
          if (activeId && m.conversation_id === activeId) {
            setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [user, activeId]);

  // Load messages when active changes
  useEffect(() => {
    void loadMessages(activeId);
  }, [activeId]);

  // Local JSON DB sync: refresh if another tab writes to the same storage key.
  useEffect(() => {
    if (!user) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LOCAL_DB_KEY) return;
      void loadConvs();
      void loadMessages(activeId);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [user, activeId]);

  // Sync URL ?c=
  useEffect(() => {
    if (search.c && search.c !== activeId) setActiveId(search.c);
  }, [search.c]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    if (!user || !activeId || !draft.trim()) return;
    setSending(true);
    const body = draft.trim();
    setDraft("");
    const { error } = await supabase.from("messages").insert({
      conversation_id: activeId,
      sender_id: user.id,
      body,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      setDraft(body);
      return;
    }
    await Promise.all([loadConvs(), loadMessages(activeId)]);
  };

  const active = useMemo(() => convs.find((c) => c.id === activeId) ?? null, [convs, activeId]);

  const openConv = (id: string) => {
    setActiveId(id);
    void navigate({ search: { c: id } as never, replace: true });
  };

  return (
    <>
      <PageHeader
        title="Messages"
        description="Private conversations with other users."
        actions={
          <Button variant="outline" onClick={() => setNewOpen(true)}>
            <UserPlus className="h-4 w-4" /> New conversation
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-[320px,1fr] h-[70vh]">
        {/* List */}
        <div
          className={cn(
            "rounded-lg border bg-card overflow-hidden flex flex-col",
            activeId && "hidden md:flex",
          )}
        >
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading…</div>
          ) : convs.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={MessageCircle}
                title="No conversations"
                description="Start one from a profile."
              />
            </div>
          ) : (
            <div className="overflow-y-auto divide-y">
              {convs.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConv(c.id)}
                  className={cn(
                    "w-full text-left p-3 hover:bg-muted/50 transition flex gap-3 items-start",
                    activeId === c.id && "bg-muted",
                  )}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    {c.other?.avatar_url && <AvatarImage src={c.other.avatar_url} alt="" />}
                    <AvatarFallback>
                      {(
                        c.other?.first_name?.[0] ??
                        c.other?.company_name?.[0] ??
                        c.other?.email?.[0] ??
                        "?"
                      ).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {c.other ? fullName(c.other) : "User"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.preview ?? "No messages yet"}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground shrink-0">
                    {formatConversationAge(c.last_message_at)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat */}
        <div
          className={cn(
            "rounded-lg border bg-card overflow-hidden flex flex-col",
            !activeId && "hidden md:flex",
          )}
        >
          {!active ? (
            <div className="m-auto text-sm text-muted-foreground">Select a conversation</div>
          ) : (
            <>
              <div className="p-3 border-b flex items-center gap-3">
                <Button
                  size="sm"
                  variant="ghost"
                  className="md:hidden"
                  onClick={() => {
                    setActiveId(null);
                    void navigate({ search: {} as never, replace: true });
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Avatar className="h-8 w-8">
                  {active.other?.avatar_url && <AvatarImage src={active.other.avatar_url} alt="" />}
                  <AvatarFallback>
                    {(active.other?.first_name?.[0] ?? "?").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="font-medium">{active.other ? fullName(active.other) : "User"}</div>
              </div>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
                {messages.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center mt-8">
                    No messages yet — say hi!
                  </div>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === user?.id;
                    return (
                      <div
                        key={m.id}
                        className={cn("flex", mine ? "justify-end" : "justify-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap wrap-break-word",
                            mine
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-card border rounded-bl-sm",
                          )}
                        >
                          {m.body}
                          <div
                            className={cn(
                              "text-[10px] mt-1 opacity-70",
                              mine ? "text-primary-foreground" : "text-muted-foreground",
                            )}
                          >
                            {new Date(m.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="p-3 border-t flex gap-2">
                <Input
                  placeholder="Type a message…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <Button onClick={send} disabled={sending || !draft.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {newOpen && (
        <NewConversationDialog
          onClose={(cid) => {
            setNewOpen(false);
            if (cid) openConv(cid);
            void loadConvs();
          }}
        />
      )}
    </>
  );
}

function NewConversationDialog({ onClose }: { onClose: (cid?: string) => void }) {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      company_name: string | null;
    }[]
  >([]);
  const [busy, setBusy] = useState(false);

  const runSearch = async (term: string) => {
    setBusy(true);
    let query = supabase
      .from("profiles")
      .select("id,first_name,last_name,email,company_name")
      .order("first_name", { ascending: true, nullsFirst: false })
      .limit(25);
    if (term) {
      query = query.or(
        `email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,company_name.ilike.%${term}%`,
      );
    }
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setResults(((data ?? []) as typeof results).filter((p) => p.id !== user?.id));
    setBusy(false);
  };

  // Load an initial directory when the dialog opens
  useEffect(() => {
    void runSearch("");
  }, []);

  // Debounced live search as the user types
  useEffect(() => {
    const t = setTimeout(() => {
      void runSearch(q.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const start = async (otherId: string) => {
    if (!user) return;
    const cid = await startConversation(user.id, otherId);
    if (!cid) return toast.error("Could not start conversation");
    onClose(cid);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={() => onClose()}
    >
      <div
        className="bg-background rounded-lg border max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-medium mb-3">Start new conversation</div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, email, or company…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <div className="mt-3 max-h-72 overflow-y-auto divide-y">
          {busy && results.length === 0 && (
            <div className="text-sm text-muted-foreground p-3">Loading users…</div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => start(r.id)}
              className="w-full text-left p-2 hover:bg-muted rounded"
            >
              <div className="text-sm font-medium">{fullName(r)}</div>
              <div className="text-xs text-muted-foreground">{r.email}</div>
            </button>
          ))}
          {!busy && results.length === 0 && (
            <div className="text-sm text-muted-foreground p-3">No users match your search.</div>
          )}
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" onClick={() => onClose()}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
