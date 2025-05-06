
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
  FileVideo,
  LayoutDashboard,
  Search,
  Home
} from "lucide-react";
import { Input } from "./ui/input";

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  const isActive = (path: string) => {
    return location.pathname === path;
  };
  
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/stream?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  };
  
  const handleLogout = async () => {
    await logout();
    setMobileMenuOpen(false);
  };
  
  return (
    <nav className="border-b">
      <div className="container h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center">
          <FileVideo className="h-6 w-6 text-stream mr-2" />
          <span className="font-bold text-lg">LiveCast</span>
        </Link>
        
        {/* Desktop Navigation */}
        <div className="hidden md:flex md:items-center md:space-x-4">
          <Link to="/">
            <Button 
              variant={isActive("/") ? "default" : "ghost"}
              size="sm"
            >
              <Home className="h-4 w-4 mr-2" />
              Home
            </Button>
          </Link>
          
          <Link to="/stream">
            <Button 
              variant={isActive("/stream") ? "default" : "ghost"}
              size="sm"
            >
              <Video className="h-4 w-4 mr-2" />
              Browse
            </Button>
          </Link>
          
          {isAuthenticated && user?.isStreamer && (
            <Link to="/stream/create">
              <Button 
                variant={isActive("/stream/create") ? "default" : "ghost"}
                size="sm"
              >
                <FileVideo className="h-4 w-4 mr-2" />
                Stream
              </Button>
            </Link>
          )}
          
          {isAuthenticated && (
            <Link to="/dashboard">
              <Button 
                variant={isActive("/dashboard") ? "default" : "ghost"}
                size="sm"
              >
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
            </Link>
          )}
        </div>
        
        {/* Search */}
        <form onSubmit={handleSearch} className="hidden md:flex flex-1 max-w-sm mx-4">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search streams..."
              className="pl-8 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </form>
        
        {/* Desktop User Menu */}
        <div className="hidden md:flex md:items-center md:space-x-4">
          {isAuthenticated ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.avatar} alt={user?.username} />
                    <AvatarFallback>{user?.username?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                <DropdownMenuItem onClick={() => navigate(`/profile/${user?.username}`)}>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  <span>Dashboard</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>
        
        {/* Mobile Menu Button */}
        <div className="md:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85%] sm:w-[350px]">
              <div className="space-y-4 py-4">
                <form onSubmit={handleSearch} className="mb-6">
                  <div className="relative w-full">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="search"
                      placeholder="Search streams..."
                      className="pl-8 w-full"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </form>
                
                {isAuthenticated && (
                  <div className="flex items-center mb-6">
                    <Avatar className="h-9 w-9 mr-3">
                      <AvatarImage src={user?.avatar} alt={user?.username} />
                      <AvatarFallback>{user?.username?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{user?.displayName || user?.username}</p>
                      <p className="text-sm text-muted-foreground">@{user?.username}</p>
                    </div>
                  </div>
                )}
                
                <div className="space-y-1">
                  <Link to="/" onClick={() => setMobileMenuOpen(false)}>
                    <Button 
                      variant={isActive("/") ? "default" : "ghost"} 
                      className="w-full justify-start"
                    >
                      <Home className="mr-2 h-4 w-4" />
                      Home
                    </Button>
                  </Link>
                  
                  <Link to="/stream" onClick={() => setMobileMenuOpen(false)}>
                    <Button 
                      variant={isActive("/stream") ? "default" : "ghost"} 
                      className="w-full justify-start"
                    >
                      <Video className="mr-2 h-4 w-4" />
                      Browse Streams
                    </Button>
                  </Link>
                  
                  {isAuthenticated && user?.isStreamer && (
                    <Link to="/stream/create" onClick={() => setMobileMenuOpen(false)}>
                      <Button 
                        variant={isActive("/stream/create") ? "default" : "ghost"} 
                        className="w-full justify-start"
                      >
                        <FileVideo className="mr-2 h-4 w-4" />
                        Create Stream
                      </Button>
                    </Link>
                  )}
                  
                  {isAuthenticated && (
                    <>
                      <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)}>
                        <Button 
                          variant={isActive("/dashboard") ? "default" : "ghost"} 
                          className="w-full justify-start"
                        >
                          <LayoutDashboard className="mr-2 h-4 w-4" />
                          Dashboard
                        </Button>
                      </Link>
                      
                      <Link to={`/profile/${user?.username}`} onClick={() => setMobileMenuOpen(false)}>
                        <Button 
                          variant={isActive(`/profile/${user?.username}`) ? "default" : "ghost"} 
                          className="w-full justify-start"
                        >
                          <User className="mr-2 h-4 w-4" />
                          Profile
                        </Button>
                      </Link>
                      
                      <Link to="/settings" onClick={() => setMobileMenuOpen(false)}>
                        <Button 
                          variant={isActive("/settings") ? "default" : "ghost"} 
                          className="w-full justify-start"
                        >
                          <Settings className="mr-2 h-4 w-4" />
                          Settings
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
                
                <div className="mt-6 pt-6 border-t">
                  {isAuthenticated ? (
                    <Button 
                      variant="ghost" 
                      className="w-full justify-start" 
                      onClick={handleLogout}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <Button 
                        className="w-full" 
                        onClick={() => {
                          navigate("/login");
                          setMobileMenuOpen(false);
                        }}
                      >
                        Log in
                      </Button>
                      <Button 
                        variant="outline" 
                        className="w-full" 
                        onClick={() => {
                          navigate("/signup");
                          setMobileMenuOpen(false);
                        }}
                      >
                        Sign up
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
