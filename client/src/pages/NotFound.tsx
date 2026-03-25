import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="inline-flex items-center justify-center bg-slate-800 rounded-2xl p-5 mb-6">
          <MessageCircle className="h-12 w-12 text-slate-600" />
        </div>
        <h1 className="text-6xl font-bold text-white mb-2">404</h1>
        <h2 className="text-xl font-semibold text-slate-300 mb-3">Page Not Found</h2>
        <p className="text-slate-500 mb-8 max-w-sm">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button
          onClick={() => setLocation("/")}
          className="bg-slate-700 hover:bg-slate-600 text-white font-semibold px-8 h-12 rounded-xl"
        >
          Back to Chat
        </Button>
      </div>
    </div>
  );
}
