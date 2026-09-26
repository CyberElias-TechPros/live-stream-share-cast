import { useEffect, useRef, useState } from "react";
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
  Bell,
  Film,
  CalendarClock,
  Shield,
  Gauge,
} from "lucide-react";
import { Input } from "./ui/input";
import ErrorBoundary from "./ErrorBoundary";
import SoundToggle from "./SoundToggle";
import AccentSwitcher from "./AccentSwitcher";
import { sanitizeInput } from "@/utils/validationUtils";
import { searchService, type Suggestion } from "@/services/searchService";
import { initials } from "@/utils/design";
import { useUnreadNotifications } from "@/hooks/useNotifications";

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

/**
 * Nav search with server-side typeahead (`/api/search/suggest`). Submitting
 * runs the full search on the browse page; picking a suggestion jumps straight
 * to the channel or stream.
 */
function SearchBox({ className, inputClassName, onNavigate }: { className?: string; inputClassName?: string; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void searchService.suggest(term).then((items) => {
        if (!cancelled) setSuggestions(items);
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  // Close the dropdown when the pointer lands anywhere else.
  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const term = sanitizeInput(query).trim();
    if (!term) return;
    setOpen(false);
    setQuery("");
    onNavigate?.();
    navigate(`/stream?q=${encodeURIComponent(term)}`);
  };

  const pick = (suggestion: Suggestion) => {
    setOpen(false);
    setQuery("");
    setSuggestions([]);
    onNavigate?.();
    navigate(suggestion.type === 'channel' ? `/profile/${suggestion.id}` : `/watch/${suggestion.id}`);
  };

  const visible = open && suggestions.length > 0;

  return (
    <form onSubmit={submit} className={className} role="search">
      <div className="relative w-full" ref={containerRef}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search live streams…"
          className={inputClassName}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          maxLength={100}
          aria-autocomplete="list"
        />

        {visible && (
          <ul className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 overflow-hidden rounded-2xl border border-white/10 bg-popover/95 shadow-xl backdrop-blur-xl">
            {suggestions.map((suggestion, index) => (
              <li key={`${suggestion.type}-${suggestion.id}-${index}`}>
                <button
                  type="button"
                  onClick={() => pick(suggestion)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-signature-soft ring-1 ring-white/10">
                    {suggestion.avatar ? (
                      <img src={suggestion.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-mono text-[9px]">{suggestion.type === 'stream' ? '▶' : initials(suggestion.label)}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{suggestion.label}</span>
                    {suggestion.sublabel && (
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">{suggestion.sublabel}</span>
                    )}
                  </span>
                  {suggestion.isLive && (
                    <span className="shrink-0 rounded-full bg-[hsl(349_86%_58%)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white">
                      live
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </form>
  );
}

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();
  const { unreadCount } = useUnreadNotifications();
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
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
      <Link to="/library" className={`nav-link ${isActive("/library") ? "nav-link-active" : ""}`}>
        <Film className="h-3.5 w-3.5" />
        Library
      </Link>
      <Link to="/schedule" className={`nav-link ${isActive("/schedule") ? "nav-link-active" : ""}`}>
        <CalendarClock className="h-3.5 w-3.5" />
        Schedule
      </Link>
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
            <SearchBox
              className="hidden xl:block flex-1 max-w-xs mx-2"
              inputClassName="h-9 rounded-full bg-white/[0.05] border-white/10 pl-9 text-[13px] placeholder:text-muted-foreground/70 focus-visible:ring-1 focus-visible:ring-ring"
            />

            {/* Sound + hue */}
            <div className="hidden lg:flex items-center gap-1.5">
              <SoundToggle />
              <AccentSwitcher />
            </div>

            {/* Desktop auth */}
            <div className="hidden lg:flex items-center gap-2">
              {isAuthenticated && (
                <Link
                  to="/notifications"
                  aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                  className="relative grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[hsl(349_86%_58%)] px-1 font-mono text-[9px] font-bold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Link>
              )}
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
                    <DropdownMenuItem className="rounded-md cursor-pointer" onClick={() => navigate("/notifications")}>
                      <Bell className="mr-2 h-4 w-4" /> Notifications
                    </DropdownMenuItem>
                    <DropdownMenuItem className="rounded-md cursor-pointer" onClick={() => navigate("/moderation")}>
                      <Shield className="mr-2 h-4 w-4" /> Moderation
                    </DropdownMenuItem>
                    {user?.isAdmin && (
                      <DropdownMenuItem className="rounded-md cursor-pointer" onClick={() => navigate("/admin")}>
                        <Gauge className="mr-2 h-4 w-4" /> Admin console
                      </DropdownMenuItem>
                    )}
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

                  <SearchBox
                    className="mb-6"
                    inputClassName="h-11 rounded-full bg-white/[0.05] border-white/10 pl-9 text-sm"
                    onNavigate={() => setMobileMenuOpen(false)}
                  />

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
                    <Link to="/library" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start rounded-xl font-medium">
                        <Film className="h-4 w-4" /> Library
                      </Button>
                    </Link>
                    <Link to="/schedule" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start rounded-xl font-medium">
                        <CalendarClock className="h-4 w-4" /> Schedule
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
                        <Link to="/notifications" onClick={() => setMobileMenuOpen(false)}>
                          <Button variant="ghost" className="w-full justify-start rounded-xl font-medium">
                            <Bell className="h-4 w-4" /> Notifications
                            {unreadCount > 0 && (
                              <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[hsl(349_86%_58%)] px-1 font-mono text-[10px] font-bold text-white">
                                {unreadCount > 9 ? '9+' : unreadCount}
                              </span>
                            )}
                          </Button>
                        </Link>
                        <Link to="/moderation" onClick={() => setMobileMenuOpen(false)}>
                          <Button variant="ghost" className="w-full justify-start rounded-xl font-medium">
                            <Shield className="h-4 w-4" /> Moderation
                          </Button>
                        </Link>
                        {user?.isAdmin && (
                          <Link to="/admin" onClick={() => setMobileMenuOpen(false)}>
                            <Button variant="ghost" className="w-full justify-start rounded-xl font-medium">
                              <Gauge className="h-4 w-4" /> Admin console
                            </Button>
                          </Link>
                        )}
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
