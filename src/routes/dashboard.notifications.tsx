// Req #35, #36, #91 — Unified notifications, mark read/unread, global toggle
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Check, Undo2, Trash2, BellOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/notifications")({
  component: NotificationsPage,
});

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  is_read: boolean;
  created_at: string;
}

function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [savingPref, setSavingPref] = useState(false);

  const load = async () => {
    if (!user) return;
    const [{ data: notifs }, { data: pref }] = await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("notification_preferences")
        .select("notifications_enabled")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    setItems((notifs ?? []) as Notif[]);
    setEnabled(pref?.notifications_enabled ?? true);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [user]);

  const togglePref = async (next: boolean) => {
    if (!user) return;
    setSavingPref(true);
    setEnabled(next);
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: user.id, notifications_enabled: next }, { onConflict: "user_id" });
    setSavingPref(false);
    if (error) {
      toast.error(error.message);
      return void load();
    }
    toast.success(next ? "Notifications enabled" : "All notifications muted");
  };

  const markAll = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    toast.success("All marked as read");
    void load();
  };

  const setRead = async (id: string, read: boolean) => {
    await supabase.from("notifications").update({ is_read: read }).eq("id", id);
    void load();
  };

  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    void load();
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="In-app alerts about your activity."
        actions={
          items.some((i) => !i.is_read) ? (
            <Button variant="outline" onClick={markAll}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {/* #91 Global notification toggle */}
      <div className="rounded-lg border bg-card p-4 mb-6 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          {enabled ? (
            <Bell className="h-5 w-5 mt-0.5 text-primary" />
          ) : (
            <BellOff className="h-5 w-5 mt-0.5 text-muted-foreground" />
          )}
          <div>
            <Label htmlFor="notif-toggle" className="text-sm font-medium">
              Receive notifications
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              When off, you won't get any new notifications across the platform.
            </p>
          </div>
        </div>
        <Switch
          id="notif-toggle"
          checked={enabled}
          disabled={savingPref}
          onCheckedChange={togglePref}
        />
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          description="We'll let you know when something needs attention."
        />
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div
              key={n.id}
              className={`rounded-lg border p-4 flex gap-4 items-start ${!n.is_read ? "bg-primary/5 border-primary/20" : "bg-card"}`}
            >
              <div
                className={`mt-1 h-2 w-2 rounded-full shrink-0 ${!n.is_read ? "bg-primary" : "bg-muted"}`}
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium">{n.title}</div>
                {n.body && <div className="text-sm text-muted-foreground mt-0.5">{n.body}</div>}
                <div className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRead(n.id, !n.is_read)}
                  aria-label={n.is_read ? "Mark unread" : "Mark read"}
                >
                  {n.is_read ? <Undo2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(n.id)} aria-label="Delete">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
