import { createFileRoute, Link } from "@tanstack/react-router";
import { MarketingHeader } from "@/components/marketing-header";
import { Button } from "@/components/ui/button";
import { GraduationCap, Users, Building2, BookOpen, Shield, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingHeader />

      <section className="hero-gradient relative overflow-hidden">
        <div className="container mx-auto px-4 py-20 md:py-28 max-w-5xl">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" /> The German University in Cairo
          </div>
          <h1 className="mt-6 font-serif text-4xl md:text-6xl font-bold tracking-tight text-balance">
            Where student work meets <span className="text-primary">opportunity</span>.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl text-balance">
            GUC Showcase is the official platform connecting students, instructors, and employers
            around academic projects — with moderation, course alignment, and in-app collaboration
            built in.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/register">Create your account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 max-w-5xl">
        <h2 className="font-serif text-3xl font-bold text-center">Built for everyone on campus</h2>
        <p className="text-muted-foreground text-center mt-2">
          Four roles, one connected experience.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: GraduationCap,
              title: "Students",
              desc: "Showcase projects, get notified of moderation, and appeal flags transparently.",
            },
            {
              icon: BookOpen,
              title: "Instructors",
              desc: "Link to your courses, view student work, and flag policy violations with reasons.",
            },
            {
              icon: Building2,
              title: "Employers",
              desc: "Maintain a company profile and discover talent through real student portfolios.",
            },
            {
              icon: Shield,
              title: "Administrators",
              desc: "Manage users, courses, link approvals, and project moderation in one place.",
            },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                className="rounded-xl border bg-card p-6 hover:shadow-md transition-shadow"
              >
                <Icon className="h-8 w-8 text-primary" />
                <h3 className="mt-4 font-serif text-lg font-semibold">{c.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{c.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="container mx-auto px-4 py-16 max-w-5xl">
        <div className="rounded-2xl border bg-card p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 font-serif text-2xl font-bold">Ready to get started?</h2>
          <p className="mt-2 text-muted-foreground">
            Use your GUC email to register as a student or instructor, or join as an employer.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/register">Register</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} GUC Showcase. A university platform.
        </div>
      </footer>
    </div>
  );
}
