
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Video, MessageSquare, Settings, Users, Bell } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function Navigation() {
  const isAuthenticated = false; // In a real app, this would come from an auth context

  return (
    <header className="border-b border-border bg-card py-3">
      <div className="container flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Video className="h-6 w-6 text-stream" />
          <span className="text-xl font-bold">LiveCast</span>
        </Link>
        
        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <>
              <Button variant="ghost" size="icon" className="relative">
                <Bell size={20} />
                <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500"></span>
              </Button>
              
              <Button variant="ghost" size="icon">
                <MessageSquare size={20} />
              </Button>
              
              <Link to="/dashboard">
                <Avatar className="h-9 w-9">
                  <AvatarImage src="" />
                  <AvatarFallback className="bg-stream-light text-white">
                    U
                  </AvatarFallback>
                </Avatar>
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/login">
                <Button variant="ghost">Log in</Button>
              </Link>
              <Link to="/signup">
                <Button>Sign up</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
