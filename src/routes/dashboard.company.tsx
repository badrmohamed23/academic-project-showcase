import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { AvatarUploader } from "@/components/avatar-uploader";
import { LocationPicker } from "@/components/location-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/company")({
  component: CompanyPage,
});

function CompanyPage() {
  const { user, profile, role, refresh } = useAuth();
  const [bio, setBio] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [companyName, setCompanyName] = useState(profile?.company_name ?? "");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [locAddress, setLocAddress] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<string>("pending");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    if (!user) return;
    void supabase
      .from("employer_profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setBio(data.bio ?? "");
          setAddress(data.address ?? "");
          setContact(data.contact_info ?? "");
          setLat(data.latitude);
          setLng(data.longitude);
          setLocAddress(data.location_address);
          setVerificationStatus(data.verification_status ?? "pending");
          setExists(true);
        }
        setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    setCompanyName(profile?.company_name ?? "");
  }, [profile]);

  if (role !== "employer") return <EmptyState title="Employers only" />;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const payload = {
      id: user.id,
      bio: bio.trim() || null,
      address: address.trim() || null,
      contact_info: contact.trim() || null,
      latitude: lat,
      longitude: lng,
      location_address: locAddress,
    };
    const res = exists
      ? await supabase.from("employer_profiles").update(payload).eq("id", user.id)
      : await supabase.from("employer_profiles").insert(payload);
    if (companyName !== profile?.company_name) {
      await supabase
        .from("profiles")
        .update({ company_name: companyName.trim() })
        .eq("id", user.id);
      await refresh();
    }
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    setExists(true);
    toast.success("Company profile saved");
  };

  const statusBadge = () => {
    if (verificationStatus === "approved")
      return <Badge className="bg-success text-success-foreground">Verified</Badge>;
    if (verificationStatus === "rejected") return <Badge variant="destructive">Rejected</Badge>;
    return <Badge variant="secondary">Pending review</Badge>;
  };

  return (
    <>
      <PageHeader
        title="Company profile"
        description="Tell students about your company and pin your location."
        actions={statusBadge()}
      />
      {loading ? (
        <div className="text-muted-foreground">Loading…</div>
      ) : (
        <div className="max-w-3xl space-y-6">
          <div className="rounded-lg border bg-card p-6">
            <AvatarUploader
              userId={user!.id}
              url={profile?.avatar_url ?? null}
              fallback={profile?.company_name ?? "C"}
              label="Company logo"
              onChange={() => {
                void refresh();
              }}
            />
          </div>

          <form onSubmit={save} className="space-y-4 rounded-lg border bg-card p-6">
            <div>
              <Label htmlFor="cn">Company name</Label>
              <Input id="cn" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="bio">Short biography</Label>
              <Textarea id="bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="addr">Address</Label>
              <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ct">Contact information</Label>
              <Input
                id="ct"
                placeholder="email / phone / website"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>

            <div>
              <Label>Company location on the map</Label>
              <div className="mt-2">
                <LocationPicker
                  lat={lat}
                  lng={lng}
                  address={locAddress}
                  onChange={(v) => {
                    setLat(v.lat);
                    setLng(v.lng);
                    setLocAddress(v.address);
                  }}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
