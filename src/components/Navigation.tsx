
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Video, MessageSquare, Settings, Bell, Menu, X, Search } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose
} from "@/components/ui/sheet";

export default function Navigation() {
  const { user, isAuthenticated, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (searchQuery.trim()) {
      navigate(`/stream?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };
  
  return (
    <header className="border-b border-border bg-card py-3 sticky top-0 z-40">
      <div className="container flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2">
            <Video className="h-6 w-6 text-stream" />
            <span className="text-xl font-bold hidden sm:inline-block">LiveCast</span>
          </Link>
          
          {/* Desktop navigation links */}
          <nav className="hidden md:flex gap-4">
            <Link to="/stream" className="text-muted-foreground hover:text-foreground transition-colors">
              Browse
            </Link>
            <Link to="/stream/create" className="text-muted-foreground hover:text-foreground transition-colors">
              Create
            </Link>
          </nav>
        </div>
        
        {/* Desktop search */}
        <div className="hidden md:block flex-1 max-w-md mx-8">
          <form onSubmit={handleSearch}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search streams..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </form>
        </div>
        
        {/* Mobile search and menu button */}
        <div className="flex md:hidden items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsSearchOpen(!isSearchOpen)}
          >
            <Search size={20} />
          </Button>
          
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu size={20} />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription>
                  Navigate through LiveCast
                </SheetDescription>
              </SheetHeader>
              <div className="py-6 flex flex-col gap-4">
                <SheetClose asChild>
                  <Link to="/" className="flex items-center gap-2 px-2 py-2 hover:bg-muted rounded-lg">
                    <Video className="h-5 w-5" />
                    <span>Home</span>
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link to="/stream" className="flex items-center gap-2 px-2 py-2 hover:bg-muted rounded-lg">
                    <Search className="h-5 w-5" />
                    <span>Browse</span>
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link to="/stream/create" className="flex items-center gap-2 px-2 py-2 hover:bg-muted rounded-lg">
                    <Video className="h-5 w-5" />
                    <span>Create Stream</span>
                  </Link>
                </SheetClose>
                
                {isAuthenticated ? (
                  <>
                    <SheetClose asChild>
                      <Link 
                        to={`/profile/${user?.username}`}
                        className="flex items-center gap-2 px-2 py-2 hover:bg-muted rounded-lg"
                      >
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={user?.avatar} />
                          <AvatarFallback className="text-xs">
                            {user?.username?.charAt(0).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <span>Profile</span>
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <button 
                        onClick={logout}
                        className="flex items-center gap-2 px-2 py-2 hover:bg-muted rounded-lg"
                      >
                        <X className="h-5 w-5" />
                        <span>Log out</span>
                      </button>
                    </SheetClose>
                  </>
                ) : (
                  <>
                    <SheetClose asChild>
                      <Link to="/login" className="flex items-center gap-2 px-2 py-2 hover:bg-muted rounded-lg">
                        <span>Log in</span>
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link 
                        to="/signup"
                        className="bg-stream text-white flex items-center justify-center gap-2 px-4 py-2 rounded-lg"
                      >
                        <span>Sign up</span>
                      </Link>
                    </SheetClose>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
        
        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <Button variant="ghost" size="icon" className="relative hidden sm:flex">
                <Bell size={20} />
                <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500"></span>
              </Button>
              
              <Button variant="ghost" size="icon" className="hidden sm:flex">
                <MessageSquare size={20} />
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Avatar className="h-9 w-9 cursor-pointer">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback className="bg-stream-light text-white">
                      {user?.username?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to={`/profile/${user?.username}`}>Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/stream/create">New Stream</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard">Dashboard</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login">
                <Button variant="ghost" className="hidden sm:flex">Log in</Button>
                <Button variant="ghost" size="icon" className="sm:hidden">
                  <span className="sr-only">Log in</span>
                  <Video size={20} />
                </Button>
              </Link>
              <Link to="/signup">
                <Button>Sign up</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
      
      {/* Mobile search - expanded */}
      {isSearchOpen && (
        <div className="p-4 border-t border-border md:hidden">
          <form onSubmit={handleSearch}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search streams..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
          </form>
        </div>
      )}
    </header>
  );
}
