import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, LogOut, Radio, Search, Settings, UserRound, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo } from "@/components/Brand";
import { useAuth } from "@/contexts/AuthContext";
import { useIsLan } from "@/contexts/ConfigContext";
import { initialsOf } from "@/hooks/useElapsedSeconds";

export default function Navigation() {
  const { isAuthenticated, user, logout } = useAuth();
  const isLan = useIsLan();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (q) {
      navigate(`/browse?q=${encodeURIComponent(q)}`);
      setSearch("");
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm transition-colors duration-200 ${
      isActive ? "text-text bg-panel-2" : "text-text-muted hover:text-text hover:bg-panel/70"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="container-app flex h-16 items-center gap-3">
        <Link to="/" aria-label="I'm Live — home" className="flex items-center gap-2.5">
          <Logo className="text-lg" />
        </Link>
        {isLan && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="hidden items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent sm:inline-flex"
                aria-label="Local network mode — this app is served from a server on your LAN and works without internet"
              >
                <Wifi className="h-3 w-3" aria-hidden="true" /> LAN
              </span>
            </TooltipTrigger>
            <TooltipContent>Local network mode — served from a LAN host, works offline</TooltipContent>
          </Tooltip>
        )}

        <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Primary">
          <NavLink to="/browse" className={navLinkClass}>
            Browse
          </NavLink>
          {isAuthenticated && (
            <NavLink to="/dashboard" className={navLinkClass}>
              Dashboard
            </NavLink>
          )}
        </nav>

        <form onSubmit={handleSearch} role="search" className="relative ml-auto hidden w-56 sm:block lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" aria-hidden="true" />
          <Input
            type="search"
            placeholder="Search streams"
            className="h-9 rounded-full border-line bg-panel pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search live streams"
          />
        </form>

        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          {isAuthenticated ? (
            <>
              <Button asChild variant="live" size="sm" className="hidden sm:inline-flex">
                <Link to="/studio">
                  <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                  Go live
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                    aria-label="Account menu"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback style={{ background: `${user?.avatarColor ?? "#7C5CFF"}22`, color: user?.avatarColor }}>
                        {initialsOf(user?.displayName || user?.username || "?")}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>
                    <div className="truncate text-sm font-semibold text-text">{user?.displayName}</div>
                    <div className="truncate text-xs font-normal text-text-faint">@{user?.username}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to={`/profile/${user?.username}`}>
                      <UserRound aria-hidden="true" /> Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard">
                      <LayoutDashboard aria-hidden="true" /> Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings">
                      <Settings aria-hidden="true" /> Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void handleLogout()} className="text-live focus:text-live">
                    <LogOut aria-hidden="true" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild variant="live" size="sm">
                <Link to="/signup">Start streaming</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
