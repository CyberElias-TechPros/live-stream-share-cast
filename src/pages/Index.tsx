
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  ArrowRight, 
  Video, 
  Users, 
  Share, 
  Download, 
  Wifi, 
  Camera,
  Link as LinkIcon
} from "lucide-react";
import Navigation from "@/components/Navigation";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-16 md:py-24 container">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6 text-white">
               <span className="text-stream-light">Share Your Stream Instantly</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8">
              Stream live video, share it with anyone, and record your broadcasts
              all in one simple platform. No downloads required.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link to="/stream/create">
                <Button size="lg" className="gap-2">
                  Start Streaming <Video size={18} />
                </Button>
              </Link>
              <Link to="/stream">
                <Button size="lg" variant="outline" className="gap-2">
                  Watch Streams <Users size={18} />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 bg-muted/30">
          <div className="container">
            <h2 className="text-3xl font-bold text-center mb-12">
              Everything you need for seamless streaming
            </h2>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-card p-6 rounded-lg border border-border">
                <div className="h-12 w-12 rounded-full bg-stream/20 text-stream flex items-center justify-center mb-5">
                  <Share size={24} />
                </div>
                <h3 className="text-xl font-semibold mb-3">One-Click Sharing</h3>
                <p className="text-muted-foreground">
                  Generate a unique link and share your stream with anyone, 
                  anywhere in seconds.
                </p>
              </div>

              <div className="bg-card p-6 rounded-lg border border-border">
                <div className="h-12 w-12 rounded-full bg-stream/20 text-stream flex items-center justify-center mb-5">
                  <Wifi size={24} />
                </div>
                <h3 className="text-xl font-semibold mb-3">Local & Global</h3>
                <p className="text-muted-foreground">
                  Stream over your local network for minimal latency or go global 
                  and reach viewers worldwide.
                </p>
              </div>

              <div className="bg-card p-6 rounded-lg border border-border">
                <div className="h-12 w-12 rounded-full bg-stream/20 text-stream flex items-center justify-center mb-5">
                  <Download size={24} />
                </div>
                <h3 className="text-xl font-semibold mb-3">Record & Save</h3>
                <p className="text-muted-foreground">
                  Record your streams with a single click and download them 
                  later for sharing or archiving.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it Works Section */}
        <section className="py-16 container">
          <h2 className="text-3xl font-bold text-center mb-12">
            How LiveCast Works
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-stream text-white flex items-center justify-center mb-5 mx-auto">
                <Camera size={28} />
              </div>
              <h3 className="text-xl font-semibold mb-3">1. Start Your Stream</h3>
              <p className="text-muted-foreground">
                Click "Start Streaming" and allow camera access. 
                Choose your streaming quality and settings.
              </p>
            </div>

            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-stream text-white flex items-center justify-center mb-5 mx-auto">
                <LinkIcon size={28} />
              </div>
              <h3 className="text-xl font-semibold mb-3">2. Share Your Link</h3>
              <p className="text-muted-foreground">
                Copy your unique streaming link and send it to anyone 
                you want to share your broadcast with.
              </p>
            </div>

            <div className="text-center">
              <div className="h-16 w-16 rounded-full bg-stream text-white flex items-center justify-center mb-5 mx-auto">
                <Users size={28} />
              </div>
              <h3 className="text-xl font-semibold mb-3">3. Connect & Stream</h3>
              <p className="text-muted-foreground">
                Your viewers simply click the link to watch in their browser.
                No downloads or plugins required.
              </p>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 bg-stream/10 border-t border-b border-border">
          <div className="container text-center">
            <h2 className="text-3xl font-bold mb-6">
              Ready to start streaming?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Create an account to save your recordings or start streaming 
              instantly without signing up.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link to="/stream/create">
                <Button size="lg">
                  Start Streaming Now
                </Button>
              </Link>
              <Link to="/signup">
                <Button size="lg" variant="outline">
                  Create Account
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <Video className="h-5 w-5 text-stream" />
              <span className="text-lg font-semibold">LiveCast</span>
            </div>
            
            <div className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} LiveCast. All rights reserved.
            </div>
            
            <div className="flex gap-6 mt-4 md:mt-0">
              <a href="#" className="text-muted-foreground hover:text-foreground transition">
                Privacy
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition">
                Terms
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition">
                Help
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
