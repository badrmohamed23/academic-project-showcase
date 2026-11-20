import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Users } from "lucide-react";
import { fullName, roleLabel } from "@/lib/validators";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/users")({
  component: UsersPage,
});

interface Row {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  is_active: boolean;
  role: string;
}

function UsersPage() {
  const { role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    // Fetch profiles and user_roles separately — there is no FK between them
    // so the embedded join `user_roles(role)` returns nothing.
    const [{ data: profs }, { data: roles }, { data: approvedEmployers }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, first_name, last_name, company_name, is_active, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase
        .from("employer_profiles")
        .select("id")
        .eq("verification_status", "approved"),
    ]);
    const approvedEmployerIds = new Set(
      (approvedEmployers ?? []).map((item) => item.id as string),
    );
    const roleMap = new Map<string, string>();
    for (const r of roles ?? []) roleMap.set(r.user_id as string, r.role as string);
    const merged: Row[] = (profs ?? [])
      .map((p) => ({
        id: p.id as string,
        email: p.email as string,
        first_name: p.first_name as string | null,
        last_name: p.last_name as string | null,
        company_name: p.company_name as string | null,
        is_active: p.is_active as boolean,
        role: roleMap.get(p.id as string) ?? "—",
      }))
      .filter((row) => row.role !== "employer" || approvedEmployerIds.has(row.id));
    setRows(merged);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const r0 = r.role ?? "";
        if (filter !== "all" && r0 !== filter) return false;
        if (search) {
          const hay =
            `${r.email} ${r.first_name ?? ""} ${r.last_name ?? ""} ${r.company_name ?? ""}`.toLowerCase();
          if (!hay.includes(search.toLowerCase())) return false;
        }
        return true;
      }),
    [rows, filter, search],
  );

  const toggleActive = async (id: string, current: boolean) => {
    const { error } = await supabase.from("profiles").update({ is_active: !current }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`User ${!current ? "activated" : "deactivated"}`);
    void load();
  };

  if (role !== "admin") return <EmptyState title="Admins only" />;

  return (
    <>
      <PageHeader title="Users" description="All accounts on the platform." />
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="student">Students</SelectItem>
            <SelectItem value="instructor">Instructors</SelectItem>
            <SelectItem value="employer">Employers</SelectItem>
            <SelectItem value="admin">Administrators</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="No users match" />
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const r0 = r.role ?? "—";
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{fullName(r)}</TableCell>
                    <TableCell className="text-muted-foreground">{r.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{roleLabel(r0)}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.is_active ? (
                        <Badge className="bg-success text-success-foreground hover:bg-success/90">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Deactivated</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={r.is_active ? "outline" : "default"}
                        onClick={() => toggleActive(r.id, r.is_active)}
                      >
                        {r.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
