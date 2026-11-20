import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FileText, ExternalLink, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/employer-verification")({
  component: EmployerVerificationPage,
});

interface PendingEmployer {
  id: string;
  verification_status: string;
  verification_notes: string | null;
  tax_document_path: string | null;
  created_at: string;
  reviewed_at: string | null;
  profile: { email: string; company_name: string | null; avatar_url: string | null } | null;
}

function EmployerVerificationPage() {
  const { role, user } = useAuth();
  const [items, setItems] = useState<PendingEmployer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("employer_profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("verification_status", filter);
    const { data: emps, error } = await q;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const ids = (emps ?? []).map((e) => e.id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, email, company_name, avatar_url").in("id", ids)
      : {
          data: [] as Array<{
            id: string;
            email: string;
            company_name: string | null;
            avatar_url: string | null;
          }>,
        };
    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const uniqueEmps = new Map<string, PendingEmployer>();
    for (const employer of emps ?? []) {
      if (!uniqueEmps.has(employer.id)) uniqueEmps.set(employer.id, employer);
    }
    setItems(
      [...uniqueEmps.values()].map((e) => ({
        id: e.id,
        verification_status: e.verification_status,
        verification_notes: e.verification_notes,
        tax_document_path: e.tax_document_path,
        created_at: e.created_at,
        reviewed_at: e.reviewed_at,
        profile: profMap.get(e.id) ?? null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    if (role === "admin") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, filter]);

  if (role !== "admin") return <EmptyState title="Administrators only" />;

  const viewDoc = async (path: string) => {
    const { data } = await supabase.storage.from("employer-documents").createSignedUrl(path);
    if (!data?.signedUrl) return toast.error("Could not create link");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const downloadDoc = async (path: string) => {
    const { data, error } = await supabase.storage.from("employer-documents").download(path);
    if (error) return toast.error(error.message);
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = path.split("/").pop() ?? "tax-document";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const decide = async (id: string, status: "approved" | "rejected") => {
    setBusy(id);
    const { error } = await supabase
      .from("employer_profiles")
      .update({
        verification_status: status,
        verification_notes: notes[id]?.trim() || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id,
      })
      .eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(status === "approved" ? "Employer approved" : "Employer rejected");
    void load();
  };

  return (
    <>
      <PageHeader
        title="Employer verification"
        description="Review tax certificates and approve or reject company registrations."
        actions={
          <div className="flex gap-1">
            {(["pending", "approved", "rejected", "all"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                onClick={() => setFilter(f)}
              >
                {f[0].toUpperCase() + f.slice(1)}
              </Button>
            ))}
          </div>
        }
      />
      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No employers"
          description={`No ${filter === "all" ? "" : filter} employer registrations to show.`}
        />
      ) : (
        <div className="space-y-4">
          {items.map((e) => (
            <div key={e.id} className="rounded-lg border bg-card p-5 space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-serif text-lg font-bold">
                    {e.profile?.company_name ?? "(no company name)"}
                  </div>
                  <div className="text-sm text-muted-foreground">{e.profile?.email}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Submitted {new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
                <Badge
                  variant={
                    e.verification_status === "approved"
                      ? "default"
                      : e.verification_status === "rejected"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {e.verification_status}
                </Badge>
              </div>

              {e.tax_document_path ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void viewDoc(e.tax_document_path!)}
                  >
                    <FileText className="h-4 w-4" /> View tax certificate{" "}
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void downloadDoc(e.tax_document_path!)}
                  >
                    <Download className="h-4 w-4" /> Download
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground italic">No document uploaded.</div>
              )}

              {e.verification_notes && (
                <div className="text-sm rounded bg-muted/50 p-2 border">
                  <span className="font-medium">Previous notes: </span>
                  {e.verification_notes}
                </div>
              )}

              {e.verification_status === "pending" && (
                <div className="space-y-2 pt-2 border-t">
                  <Textarea
                    placeholder="Optional notes for the employer (especially on rejection)…"
                    rows={2}
                    value={notes[e.id] ?? ""}
                    onChange={(ev) => setNotes((n) => ({ ...n, [e.id]: ev.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy === e.id}
                      onClick={() => void decide(e.id, "approved")}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy === e.id}
                      onClick={() => void decide(e.id, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
