import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-[#0f0f13] flex items-center justify-center p-4">
      <div className="text-center">
        <div className="inline-flex items-center justify-center bg-[#1a1a24] rounded-2xl p-5 mb-6">
          <MessageCircle className="h-12 w-12 text-indigo-500" />
        </div>
        <h1 className="text-6xl font-bold text-white mb-2">404</h1>
        <h2 className="text-xl font-semibold text-gray-300 mb-3">Page Not Found</h2>
        <p className="text-gray-500 mb-8 max-w-sm">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button
          onClick={() => setLocation("/")}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 h-12 rounded-xl"
        >
          Back to Chat
        </Button>
      </div>
    </div>
  );
}
