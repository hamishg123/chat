import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Loader2, Check, X, MessageCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function ProfileSetup() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [handleAvailable, setHandleAvailable] = useState(true);
  const [checkingHandle, setCheckingHandle] = useState(false);

  const profileQuery = trpc.profile.me.useQuery();
  const updateProfileMutation = trpc.profile.update.useMutation();

  useEffect(() => {
    if (profileQuery.data) {
      setHandle(profileQuery.data.handle);
      setDisplayName(profileQuery.data.displayName);
      setBio(profileQuery.data.bio || "");
    }
  }, [profileQuery.data]);

  const checkHandleQuery = trpc.profile.checkHandleAvailable.useQuery(
    { handle },
    { enabled: handle.length >= 3 }
  );

  useEffect(() => {
    if (checkHandleQuery.data) setHandleAvailable(checkHandleQuery.data.available);
  }, [checkHandleQuery.data]);

  useEffect(() => {
    setCheckingHandle(checkHandleQuery.isFetching);
  }, [checkHandleQuery.isFetching]);

  const handleHandleChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_]/g, "");
    setHandle(sanitized);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle || !displayName) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (!handleAvailable) {
      toast.error("Handle is not available");
      return;
    }
    try {
      await updateProfileMutation.mutateAsync({ handle, displayName, bio: bio || undefined });
      toast.success("Profile set up successfully!");
      setLocation("/chat");
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#0f0f13] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center bg-indigo-600 rounded-2xl p-3 mb-4">
            <MessageCircle className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Complete Your Profile</h1>
          <p className="text-gray-400 mt-2">Set up your unique handle and display name</p>
        </div>

        <div className="bg-[#16161f] rounded-2xl border border-[#2a2a38] p-6">
          <form onSubmit={handleSave} className="space-y-5">
            {/* Handle */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                @Handle <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 font-medium">@</span>
                <Input
                  type="text"
                  placeholder="yourhandle"
                  value={handle}
                  onChange={(e) => handleHandleChange(e.target.value)}
                  className="pl-8 bg-[#1e1e2a] border-[#2a2a38] text-white placeholder:text-gray-600 focus:border-indigo-500 h-12 rounded-xl"
                  minLength={3}
                  maxLength={32}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {checkingHandle && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
                  {!checkingHandle && handle.length >= 3 && handleAvailable && (
                    <Check className="h-4 w-4 text-green-500" />
                  )}
                  {!checkingHandle && handle.length >= 3 && !handleAvailable && (
                    <X className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
              <p className={`text-xs mt-1.5 ${
                handle.length < 3
                  ? "text-gray-600"
                  : checkHandleQuery.isFetching
                  ? "text-gray-500"
                  : handleAvailable
                  ? "text-green-500"
                  : "text-red-400"
              }`}>
                {handle.length < 3
                  ? "At least 3 characters, lowercase letters, numbers, underscores"
                  : checkHandleQuery.isFetching
                  ? "Checking availability..."
                  : handleAvailable
                  ? "Handle is available!"
                  : "Handle is already taken"}
              </p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Display Name <span className="text-red-400">*</span>
              </label>
              <Input
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={100}
                className="bg-[#1e1e2a] border-[#2a2a38] text-white placeholder:text-gray-600 focus:border-indigo-500 h-12 rounded-xl"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Bio <span className="text-gray-500">(Optional)</span>
              </label>
              <Textarea
                placeholder="Tell us about yourself..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                rows={3}
                className="bg-[#1e1e2a] border-[#2a2a38] text-white placeholder:text-gray-600 focus:border-indigo-500 rounded-xl resize-none"
              />
              <p className="text-xs text-gray-600 mt-1 text-right">{bio.length}/500</p>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl"
              disabled={
                updateProfileMutation.isPending ||
                !handle ||
                !displayName ||
                !handleAvailable ||
                checkHandleQuery.isFetching
              }
            >
              {updateProfileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue to Chat
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
