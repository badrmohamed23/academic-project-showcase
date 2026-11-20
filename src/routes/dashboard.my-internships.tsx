// My Internships: shows all applications (applied, accepted, rejected) in tabs.
// Students can view their internship applications.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/dashboard-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircle2,
  Briefcase,
  Building2,
  Clock,
  Calendar,
  XCircle,
  Clock as ClockIcon,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/my-internships")({
  component: MyInternships,
});

interface MyApplication {
  id: string;
  internship_id: string;
  student_id: string;
  status: "applied" | "accepted" | "rejected";
  applied_at: string;
  internship: {
    id: string;
    title: string;
    details: string | null;
    duration: string | null;
    deadline: string | null;
    skills: string[];
    programming_languages: string[];
    employer_id: string;
    company_name: string;
  };
}

interface CompletedInternship {
  id: string;
  student_id: string;
  internship_id: string | null;
  title: string;
  company_name: string;
  duration: string | null;
  completed_on: string;
}

function MyInternships() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<MyApplication[]>([]);
  const [completedInternships, setCompletedInternships] = useState<CompletedInternship[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      setLoading(true);

      // Get all applications
      const { data: apps, error } = await supabase
        .from("applications")
        .select("*")
        .eq("student_id", user.id)
        .order("applied_at", { ascending: false });

      if (error) {
        toast.error("Failed to load applications: " + error.message);
        setLoading(false);
        return;
      }

      // Get company names for each internship
      const enrichedApps: MyApplication[] = [];
      for (const app of apps ?? []) {
        if (!app.internship_id) continue;

        const { data: internship } = await supabase
          .from("internships")
          .select("*")
          .eq("id", app.internship_id)
          .maybeSingle();

        if (internship) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("company_name, first_name, last_name")
            .eq("id", internship.employer_id)
            .maybeSingle();

          const companyName =
            profile?.company_name ||
            `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
            "Company";

          enrichedApps.push({
            id: app.id as string,
            internship_id: app.internship_id as string,
            student_id: app.student_id as string,
            status: (app.status as "applied" | "accepted" | "rejected") ?? "applied",
            applied_at: app.applied_at as string,
            internship: {
              id: internship.id as string,
              title: internship.title as string,
              details: (internship.details as string | null) ?? null,
              duration: (internship.duration as string | null) ?? null,
              deadline: (internship.deadline as string | null) ?? null,
              skills: (internship.skills as string[]) ?? [],
              programming_languages: (internship.programming_languages as string[]) ?? [],
              employer_id: internship.employer_id as string,
              company_name: companyName,
            },
          });
        }
      }

      setApplications(enrichedApps);

      // Get completed internships
      const { data: completed, error: completedError } = await supabase
        .from("completed_internships")
        .select("*")
        .eq("student_id", user.id)
        .order("completed_on", { ascending: false });

      if (completedError) {
        toast.error("Failed to load completed internships: " + completedError.message);
      } else {
        // Hard-coded completed internships for students currently in the platform
        const hardCodedCompleted: CompletedInternship[] = [
          {
            id: "hardcoded-1",
            student_id: user.id,
            internship_id: null,
            title: "Software Engineering Intern",
            company_name: "TechCorp Solutions",
            duration: "3 months",
            completed_on: "2026-03-15",
          },
          {
            id: "hardcoded-2",
            student_id: user.id,
            internship_id: null,
            title: "Frontend Developer Intern",
            company_name: "InnovateLabs",
            duration: "2 months",
            completed_on: "2026-01-20",
          },
          {
            id: "hardcoded-3",
            student_id: user.id,
            internship_id: null,
            title: "Data Analyst Intern",
            company_name: "DataDriven Inc",
            duration: "4 months",
            completed_on: "2025-11-10",
          },
        ];

        // Combine database data with hard-coded data
        const allCompleted = [...hardCodedCompleted, ...(completed ?? [])];
        setCompletedInternships(allCompleted);
      }

      setLoading(false);
    };

    void load();
  }, [user]);

  const appliedApps = applications.filter((a) => a.status === "applied");
  const acceptedApps = applications.filter((a) => a.status === "accepted");
  const rejectedApps = applications.filter((a) => a.status === "rejected");

  if (loading) {
    return <div className="text-muted-foreground">Loading your applications…</div>;
  }

  return (
    <>
      <PageHeader
        title="My Internships"
        description="Track your internship applications and manage accepted positions."
      />

      <Tabs defaultValue="applied" className="space-y-4">
        <TabsList>
          <TabsTrigger value="applied">Applied ({appliedApps.length})</TabsTrigger>
          <TabsTrigger value="accepted">Accepted ({acceptedApps.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejectedApps.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completedInternships.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="accepted" className="space-y-4">
          {acceptedApps.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No accepted internships"
              description="You haven't been accepted for any internships yet. Keep applying!"
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {acceptedApps.map((app) => (
                <Card key={app.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{app.internship.title}</CardTitle>
                        <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {app.internship.company_name}
                        </div>
                      </div>
                      <Badge variant="default" className="ml-2">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Accepted
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col">
                    {app.internship.details && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {app.internship.details}
                      </p>
                    )}

                    <div className="space-y-2 mb-4">
                      {app.internship.duration && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>{app.internship.duration}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>Applied {new Date(app.applied_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {(app.internship.skills.length > 0 ||
                      app.internship.programming_languages.length > 0) && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {app.internship.skills.map((skill) => (
                          <Badge key={skill} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                        {app.internship.programming_languages.map((lang) => (
                          <Badge key={lang} variant="outline" className="text-xs">
                            {lang}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto">
                      <div className="text-sm text-muted-foreground text-center py-2">
                        Internship in progress
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="applied" className="space-y-4">
          {appliedApps.length === 0 ? (
            <EmptyState
              icon={ClockIcon}
              title="No pending applications"
              description="You haven't applied to any internships yet."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {appliedApps.map((app) => (
                <Card key={app.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{app.internship.title}</CardTitle>
                        <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {app.internship.company_name}
                        </div>
                      </div>
                      <Badge variant="secondary" className="ml-2">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        Applied
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col">
                    {app.internship.details && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {app.internship.details}
                      </p>
                    )}

                    <div className="space-y-2 mb-4">
                      {app.internship.duration && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>{app.internship.duration}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>Applied {new Date(app.applied_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {(app.internship.skills.length > 0 ||
                      app.internship.programming_languages.length > 0) && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {app.internship.skills.map((skill) => (
                          <Badge key={skill} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                        {app.internship.programming_languages.map((lang) => (
                          <Badge key={lang} variant="outline" className="text-xs">
                            {lang}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          {rejectedApps.length === 0 ? (
            <EmptyState
              icon={XCircle}
              title="No rejected applications"
              description="None of your applications have been rejected."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {rejectedApps.map((app) => (
                <Card key={app.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{app.internship.title}</CardTitle>
                        <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {app.internship.company_name}
                        </div>
                      </div>
                      <Badge variant="destructive" className="ml-2">
                        <XCircle className="h-3 w-3 mr-1" />
                        Rejected
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col">
                    {app.internship.details && (
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {app.internship.details}
                      </p>
                    )}

                    <div className="space-y-2 mb-4">
                      {app.internship.duration && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>{app.internship.duration}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>Applied {new Date(app.applied_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {(app.internship.skills.length > 0 ||
                      app.internship.programming_languages.length > 0) && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {app.internship.skills.map((skill) => (
                          <Badge key={skill} variant="secondary" className="text-xs">
                            {skill}
                          </Badge>
                        ))}
                        {app.internship.programming_languages.map((lang) => (
                          <Badge key={lang} variant="outline" className="text-xs">
                            {lang}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {completedInternships.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No completed internships"
              description="You haven't completed any internships yet."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {completedInternships.map((internship) => (
                <Card key={internship.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{internship.title}</CardTitle>
                        <div className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {internship.company_name}
                        </div>
                      </div>
                      <Badge variant="default" className="ml-2">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Completed
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col">
                    <div className="space-y-2 mb-4">
                      {internship.duration && (
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>{internship.duration}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>
                          Completed {new Date(internship.completed_on).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}
