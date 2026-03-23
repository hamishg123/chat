import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Loader2, Check } from "lucide-react";
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
    if (checkHandleQuery.data) {
      setHandleAvailable(checkHandleQuery.data.available);
    }
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
      await updateProfileMutation.mutateAsync({
        handle,
        displayName,
        bio: bio || undefined,
      });
      toast.success("Profile updated successfully!");
      setLocation("/chat");
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
          <CardDescription>Set up your @handle and display name</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">@Handle</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground">@</span>
                <Input
                  type="text"
                  placeholder="yourhandle"
                  value={handle}
                  onChange={(e) => handleHandleChange(e.target.value)}
                  className="pl-7"
                  minLength={3}
                  maxLength={32}
                />
                {checkingHandle && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin" />}
                {!checkingHandle && handleAvailable && handle.length >= 3 && (
                  <Check className="absolute right-3 top-2.5 h-4 w-4 text-green-500" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {handle.length < 3 ? "At least 3 characters" : checkHandleQuery.isFetching ? "Checking..." : handleAvailable ? "Available!" : "Not available"}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Display Name</label>
              <Input
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Bio (Optional)</label>
              <Textarea
                placeholder="Tell us about yourself"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={500}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">{bio.length}/500</p>
            </div>

            <Button
              type="submit"
              className="w-full"
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
        </CardContent>
      </Card>
    </div>
  );
}
