import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@/lib/useTheme";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  TreePine,
  Map,
  BarChart3,
  LogOut,
  Home,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeft,
  Search,
  Bell,
  Settings,
  User,
  ChevronRight,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", icon: Home, label: "Accueil" },
  { to: "/dashboard", icon: Map, label: "Carte & Analyse" },
  { to: "/kpi", icon: BarChart3, label: "KPI Terrain" },
];

function SidebarLink({
  to,
  icon: Icon,
  label,
  collapsed,
  active,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
  active: boolean;
}) {
  const inner = (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-2"
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }
  return inner;
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { resolved, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Fermer le drawer mobile quand on change de page
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "U";

  // Find active breadcrumb
  const activeNav = NAV_ITEMS.find((n) => n.to === location.pathname);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen overflow-hidden">
        {/* Mobile backdrop */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* ── Sidebar ── */}
        <aside
          className={cn(
            "flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200",
            // Desktop : flow normal
            "md:relative md:translate-x-0",
            collapsed ? "md:w-[60px]" : "md:w-[240px]",
            // Mobile : overlay drawer
            "fixed inset-y-0 left-0 z-40 w-[240px]",
            mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          )}
        >
          {/* Brand */}
          <div className={cn("flex h-14 items-center gap-2 px-4 shrink-0", collapsed && "justify-center px-2")}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
              <TreePine className="h-5 w-5 text-primary" />
            </div>
            {!collapsed && <span className="font-bold text-base tracking-tight">TechFOREST</span>}
          </div>

          <Separator className="bg-sidebar-border" />

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
            {!collapsed && (
              <span className="px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
                Navigation
              </span>
            )}
            {NAV_ITEMS.map((item) => (
              <SidebarLink
                key={item.to}
                {...item}
                collapsed={collapsed}
                active={location.pathname === item.to}
              />
            ))}
          </nav>

          <Separator className="bg-sidebar-border" />

          {/* Bottom section */}
          <div className={cn("flex items-center gap-2 p-3 shrink-0", collapsed && "justify-center")}>
            <Avatar className="h-8 w-8 shrink-0 bg-sidebar-accent">
              <AvatarFallback className="bg-primary/20 text-primary text-xs">{initials}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.full_name}</p>
                <p className="text-[11px] text-sidebar-muted truncate">{user?.email}</p>
              </div>
            )}
          </div>
        </aside>

        {/* ── Main area ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar */}
          <header className="flex h-14 items-center gap-3 border-b bg-background/80 backdrop-blur-sm px-4 shrink-0">
            {/* Mobile menu */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>

            {/* Desktop collapse toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hidden md:inline-flex"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>

            {/* Breadcrumb */}
            <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>TechFOREST</span>
              {activeNav && (
                <>
                  <ChevronRight className="h-3.5 w-3.5" />
                  <span className="font-medium text-foreground">{activeNav.label}</span>
                </>
              )}
            </div>

            {/* Search placeholder */}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" className="hidden sm:flex gap-2 text-muted-foreground h-8 px-3">
                <Search className="h-3.5 w-3.5" />
                <span className="text-xs">Rechercher...</span>
                <kbd className="pointer-events-none ml-2 hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium sm:inline-block">
                  ⌘K
                </kbd>
              </Button>

              {/* Notifications */}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                <Bell className="h-4 w-4" />
              </Button>

              {/* Theme toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
              >
                {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>

              {/* User dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/15 text-primary text-xs">{initials}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{user?.full_name}</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                    <User className="mr-2 h-4 w-4" /> Profil
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/kpi")}>
                    <Settings className="mr-2 h-4 w-4" /> Paramètres
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" /> Déconnexion
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
