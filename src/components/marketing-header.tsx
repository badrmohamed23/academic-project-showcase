import { Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export function MarketingHeader() {
  const { user, role } = useAuth();
  return (
    <header className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-40">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-serif text-lg font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <GraduationCap className="h-5 w-5" />
          </span>
          GUC Showcase
        </Link>
        <nav className="flex items-center gap-2">
          {user && role ? (
            <>
              <ThemeToggle className="shrink-0" />
              <Button asChild>
                <Link to="/dashboard">Open dashboard</Link>
              </Button>
            </>
          ) : (
            <>
              <ThemeToggle className="shrink-0" />
              <Button variant="ghost" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild>
                <Link to="/register">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
