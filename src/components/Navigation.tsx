import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import {
  Menu,
  LogOut,
  User,
  Video,
  Settings,
  Radio,
  LayoutDashboard,
  Search,
  Home,
} from "lucide-react";
import { Input } from "./ui/input";
import ErrorBoundary from "./ErrorBoundary";
import SoundToggle from "./SoundToggle";
import AccentSwitcher from "./AccentSwitcher";
import { sanitizeInput } from "@/utils/validationUtils";
import { initials } from "@/utils/design";

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 select-none">
      <span className="relative grid h-8 w-8 place-items-center rounded-[10px] bg-signature shadow-glow">
        <Radio className="h-4 w-4 text-white" strokeWidth={2.5} />
        <span className="absolute inset-0 rounded-[10px] ring-1 ring-white/25" />
      </span>
      {!compact && (
        <span className="font-display text-[17px] font-bold tracking-tight text-foreground">
          I&rsquo;m&nbsp;Live
        </span>
      )}
    </span>
  );
}

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const sanitizedQuery = sanitizeInput(searchQuery);
      if (sanitizedQuery.trim()) {
        navigate(`/stream?q=${encodeURIComponent(sanitizedQuery.trim())}`);
        setSearchQuery("");
        setMobileMenuOpen(false);
      }
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setMobileMenuOpen(false);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const navLinks = (
    <>
      <Link to="/" className={`nav-link ${isActive("/") ? "nav-link-active" : ""}`}>
        <Home className="h-3.5 w-3.5" />
        Home
      </Link>
      <Link to="/stream" className={`nav-link ${isActive("/stream") ? "nav-link-active" : ""}`}>
        <Video className="h-3.5 w-3.5" />
        Browse
      </Link>
      {isAuthenticated && user?.isStreamer && (
        <Link to="/stream/create" className={`nav-link ${isActive("/stream/create") ? "nav-link-active" : ""}`}>
          <Radio className="h-3.5 w-3.5" />
          Stream
        </Link>
      )}
      {isAuthenticated && (
        <Link to="/dashboard" className={`nav-link ${isActive("/dashboard") ? "nav-link-active" : ""}`}>
          <LayoutDashboard className="h-3.5 w-3.5" />
          Dashboard
        </Link>
      )}
    </>
  );

  return (
    <ErrorBoundary>
      <style>{`
        .nav-link {
          display: inline-flex; align-items: center; gap: 0.4rem;
          font-size: 13px; font-weight: 500; letter-spacing: 0.01em;
          color: hsl(var(--muted-foreground));
          padding: 0.45rem 0.85rem; border-radius: 999px;
          transition: color .25s ease, background-color .25s ease;
        }
        .nav-link:hover { color: hsl(var(--foreground)); background: hsl(250 30% 96% / 0.06); }
        .nav-link-active, .nav-link-active:hover {
          color: hsl(var(--foreground));
          background: linear-gradient(120deg, hsl(var(--stream-h) / 0.16), hsl(var(--signal-h) / 0.12));
          box-shadow: inset 0 0 0 1px hsl(var(--stream-h) / 0.22);
        }
        .nav-link-active::after {
          content: ""; width: 4px; height: 4px; border-radius: 999px;
          background: hsl(var(--accent-mid)); display: inline-block;
          box-shadow: 0 0 8px hsl(var(--accent-mid));
        }
      `}</style>

      {/* Floating pill */}
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="container">
          <nav className="mt-3 flex h-14 items-center justify-between gap-3 rounded-2xl glass-deep px-3 shadow-card md:px-4">
            <Link to="/" aria-label="I'm Live — home" className="shrink-0">
              <Logo />
            </Link>

            {/* Desktop links */}
            <div className="hidden lg:flex items-center gap-1">{navLinks}</div>

            {/* Search (desktop) */}
            <form onSubmit={handleSearch} className="hidden xl:block flex-1 max-w-xs mx-2">
              <div className="relative w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search live streams…"
                  className="h-9 rounded-full bg-white/[0.05] border-white/10 pl-9 text-[13px] placeholder:text-muted-foreground/70 focus-visible:ring-1 focus-visible:ring-ring"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  maxLength={100}
                />
              </div>
            </form>

            {/* Sound + hue */}
            <div className="hidden lg:flex items-center gap-1.5">
              <SoundToggle />
              <AccentSwitcher />
            </div>

            {/* Desktop auth */}
            <div className="hidden lg:flex items-center gap-2">
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="grid h-9 w-9 place-items-center rounded-full ring-2 ring-white/10 hover:ring-[hsl(285_95%_70%/0.5)] transition-all overflow-hidden"
                      aria-label="Account menu"
                    >
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={user?.avatar} alt={user?.username} />
                        <AvatarFallback className="bg-signature text-xs font-semibold text-white">
                          {initials(user?.displayName || user?.username)}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-xl glass-deep">
                    <DropdownMenuLabel className="font-mono text-[10px] tracking-[0.25em] uppercase">
                      My account
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="rounded-md cursor-pointer" onClick={() => navigate(`/profile/${user?.username}`)}>
                      <User className="mr-2 h-4 w-4" /> Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem className="rounded-md cursor-pointer" onClick={() => navigate("/dashboard")}>
                      <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
                    </DropdownMenuItem>
                    <DropdownMenuItem className="rounded-md cursor-pointer" onClick={() => navigate("/settings")}>
                      <Settings className="mr-2 h-4 w-4" /> Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="rounded-md cursor-pointer text-destructive focus:text-destructive" onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" /> Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Button variant="ghost" size="sm" asChild className="rounded-full">
                    <Link to="/login">Log in</Link>
                  </Button>
                  <Button variant="glow" size="sm" asChild className="rounded-full">
                    <Link to="/signup">Sign up</Link>
                  </Button>
                </>
              )}
              {isAuthenticated && user?.isStreamer && (
                <Button variant="glow" size="sm" asChild className="rounded-full">
                  <Link to="/stream/create">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                    Go live
                  </Link>
                </Button>
              )}
            </div>

            {/* Mobile menu trigger */}
            <div className="lg:hidden">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="glass" size="icon" className="rounded-full">
                    <Menu />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="right"
                  className="w-[85%] sm:w-[380px] glass-deep border-l border-white/10 bg-[hsl(252_36%_6%/0.97)] p-6"
                >
                  <div className="flex items-center justify-between mb-6">
                    <Logo />
                    <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
                      ✕
                    </Button>
                  </div>

                  <form onSubmit={handleSearch} className="mb-6">
                    <div className="relative w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        type="search"
                        placeholder="Search live streams…"
                        className="h-11 rounded-full bg-white/[0.05] border-white/10 pl-9 text-sm"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                  </form>

                  <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] border border-white/8 p-3">
                    <span className="flex items-center gap-2.5">
                      <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
                        Ambient sound
                      </span>
                    </span>
                    <SoundToggle />
                  </div>

                  <div className="mb-6">
                    <AccentSwitcher variant="row" />
                  </div>

                  {isAuthenticated && (
                    <div className="mb-6 flex items-center gap-3 rounded-2xl bg-white/[0.04] border border-white/8 p-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user?.avatar} alt={user?.username} />
                        <AvatarFallback className="bg-signature text-white text-xs font-semibold">
                          {initials(user?.displayName || user?.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-sm">
                          {user?.displayName || user?.username}
                        </p>
                        <p className="font-mono text-[11px] text-muted-foreground">@{user?.username}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <Link to="/" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start rounded-xl font-medium">
                        <Home className="h-4 w-4" /> Home
                      </Button>
                    </Link>
                    <Link to="/stream" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start rounded-xl font-medium">
                        <Video className="h-4 w-4" /> Browse streams
                      </Button>
                    </Link>
                    {isAuthenticated && user?.isStreamer && (
                      <Link to="/stream/create" onClick={() => setMobileMenuOpen(false)}>
                        <Button variant="ghost" className="w-full justify-start rounded-xl font-medium">
                          <Radio className="h-4 w-4" /> Go live
                        </Button>
                      </Link>
                    )}
                    {isAuthenticated && (
                      <>
                        <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                          <Button variant="ghost" className="w-full justify-start rounded-xl font-medium">
                            <LayoutDashboard className="h-4 w-4" /> Dashboard
                          </Button>
                        </Link>
                        <Link to={`/profile/${user?.username}`} onClick={() => setMobileMenuOpen(false)}>
                          <Button variant="ghost" className="w-full justify-start rounded-xl font-medium">
                            <User className="h-4 w-4" /> Profile
                          </Button>
                        </Link>
                        <Link to="/settings" onClick={() => setMobileMenuOpen(false)}>
                          <Button variant="ghost" className="w-full justify-start rounded-xl font-medium">
                            <Settings className="h-4 w-4" /> Settings
                          </Button>
                        </Link>
                      </>
                    )}
                  </div>

                  <div className="mt-6 pt-6 border-t border-white/8">
                    {isAuthenticated ? (
                      <Button variant="outline" className="w-full rounded-full" onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" /> Log out
                      </Button>
                    ) : (
                      <div className="space-y-3">
                        <Button variant="glow" className="w-full rounded-full" onClick={() => { navigate("/login"); setMobileMenuOpen(false); }}>
                          Log in
                        </Button>
                        <Button variant="glass" className="w-full rounded-full" onClick={() => { navigate("/signup"); setMobileMenuOpen(false); }}>
                          Sign up
                        </Button>
                      </div>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </nav>
        </div>
      </header>
    </ErrorBoundary>
  );
}
