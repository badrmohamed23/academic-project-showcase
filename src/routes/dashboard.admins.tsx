import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ShieldCheck, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PasswordInput } from "@/components/password-input";

export const Route = createFileRoute("/dashboard/admins")({
  component: AdminsPage,
});

interface Admin {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
}

function AdminsPage() {
  const { role } = useAuth();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    const ids = (roles ?? []).map((r) => r.user_id as string);
    if (ids.length === 0) {
      setAdmins([]);
      setLoading(false);
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,email,first_name,last_name,is_active")
      .in("id", ids);
    setAdmins((profs ?? []) as Admin[]);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  if (role !== "admin") return <EmptyState title="Admins only" />;

  return (
    <>
      <PageHeader
        title="Administrators"
        description="View and create administrator accounts."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> New admin
              </Button>
            </DialogTrigger>
            <NewAdminDialog
              onClose={() => {
                setOpen(false);
                void load();
              }}
            />
          </Dialog>
        }
      />
      <Alert className="mb-4">
        <AlertDescription className="text-xs">
          New admin accounts can use any valid email address + password. The new admin will appear
          here once they confirm their email or sign in for the first time.
        </AlertDescription>
      </Alert>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : admins.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No admins" />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    {[a.first_name, a.last_name].filter(Boolean).join(" ") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{a.email}</TableCell>
                  <TableCell>{a.is_active ? "Active" : "Deactivated"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

function NewAdminDialog({ onClose }: { onClose: () => void }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Email is required.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be ≥ 8 characters.");
      return;
    }
    setBusy(true);
    try {
      // Use a server-side edge function so the caller's session is never
      // touched. The function uses the service role to create the new admin.
      const { data, error } = await supabase.functions.invoke("create-admin", {
        body: {
          email: email.trim(),
          password,
          first_name: first.trim(),
          last_name: last.trim(),
        },
      });
      if (error) throw error;
      if (data && (data as { error?: string }).error)
        throw new Error((data as { error: string }).error);
      toast.success("Admin account created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create administrator</DialogTitle>
        <DialogDescription>The new admin can sign in immediately.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="f">First name</Label>
            <Input id="f" required value={first} onChange={(e) => setFirst(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="l">Last name</Label>
            <Input id="l" required value={last} onChange={(e) => setLast(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="e">Email</Label>
          <Input
            id="e"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="p">Password</Label>
          <PasswordInput
            id="p"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>
            {busy ? "Creating…" : "Create admin"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
