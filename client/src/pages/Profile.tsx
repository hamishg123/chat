import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Loader2, Edit2, Save, X, ArrowLeft, Star, Camera } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");

  const profileQuery = trpc.profile.me.useQuery();
  const updateProfileMutation = trpc.profile.update.useMutation();
  const profile = profileQuery.data;

  const handleEdit = () => {
    if (profile) {
      setDisplayName(profile.displayName);
      setBio(profile.bio || "");
      setAvatar(profile.avatar || "");
      setIsEditing(true);
    }
  };

  const handleCancel = () => setIsEditing(false);

  const handleSave = async () => {
    try {
      await updateProfileMutation.mutateAsync({
        displayName,
        bio: bio || undefined,
        avatar: avatar || undefined,
      });
      toast.success("Profile updated!");
      setIsEditing(false);
      profileQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
    }
  };

  if (!user) {
    setLocation("/auth");
    return null;
  }

  if (profileQuery.isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0f13] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#0f0f13] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Profile not found</p>
          <Button
            variant="ghost"
            className="mt-4 text-indigo-400 hover:text-indigo-300"
            onClick={() => setLocation("/chat")}
          >
            Go to Chat
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f13] text-white">
      {/* Header */}
      <div className="bg-[#16161f] border-b border-[#2a2a38] px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-gray-400 hover:text-white hover:bg-[#2a2a38] rounded-lg"
            onClick={() => setLocation("/chat")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-white">Profile Settings</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Profile Card */}
        <div className="bg-[#16161f] rounded-2xl border border-[#2a2a38] overflow-hidden">
          {/* Cover gradient */}
          <div className="h-24 bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600" />

          {/* Avatar + Info */}
          <div className="px-6 pb-6">
            <div className="flex items-end justify-between -mt-10 mb-4">
              <div className="relative">
                <Avatar className="h-20 w-20 ring-4 ring-[#16161f]">
                  <AvatarImage src={isEditing ? avatar : profile.avatar || undefined} />
                  <AvatarFallback className="bg-indigo-600 text-white text-2xl font-bold">
                    {profile.displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              {!isEditing ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEdit}
                  className="bg-[#1e1e2a] border-[#2a2a38] text-gray-300 hover:text-white hover:bg-[#2a2a38] rounded-xl"
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit Profile
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={updateProfileMutation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
                  >
                    {updateProfileMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancel}
                    disabled={updateProfileMutation.isPending}
                    className="text-gray-400 hover:text-white hover:bg-[#2a2a38] rounded-xl"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Display Name
                  </label>
                  <Input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={100}
                    className="bg-[#1e1e2a] border-[#2a2a38] text-white focus:border-indigo-500 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Avatar URL
                  </label>
                  <Input
                    type="url"
                    placeholder="https://example.com/avatar.jpg"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    className="bg-[#1e1e2a] border-[#2a2a38] text-white placeholder:text-gray-600 focus:border-indigo-500 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Bio
                  </label>
                  <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="Tell us about yourself..."
                    className="bg-[#1e1e2a] border-[#2a2a38] text-white placeholder:text-gray-600 focus:border-indigo-500 rounded-xl resize-none"
                  />
                  <p className="text-xs text-gray-600 mt-1 text-right">{bio.length}/500</p>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-bold text-white">{profile.displayName}</h2>
                <p className="text-indigo-400 text-sm mt-0.5">@{profile.handle}</p>
                {profile.bio && (
                  <p className="text-gray-400 text-sm mt-2 leading-relaxed">{profile.bio}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Karma Card */}
          <div className="bg-[#16161f] rounded-2xl border border-[#2a2a38] p-5">
            <div className="flex items-center gap-2 mb-3">
              <Star className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Karma</span>
            </div>
            <p className="text-3xl font-bold text-amber-500">{profile.karma}</p>
            <p className="text-xs text-gray-500 mt-1">
              {profile.karma >= 10
                ? "Photo sharing unlocked"
                : `${10 - profile.karma} more to unlock photos`}
            </p>
            {profile.karma < 10 && (
              <div className="mt-3 h-1.5 bg-[#2a2a38] rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (profile.karma / 10) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Account Info Card */}
          <div className="bg-[#16161f] rounded-2xl border border-[#2a2a38] p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-4 w-4 rounded-full bg-green-500" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Account</span>
            </div>
            <p className="text-sm font-medium text-white truncate">{user.email}</p>
            <p className="text-xs text-gray-500 mt-1">
              {user.loginMethod === "google" ? "Google Account" : "Email Account"}
            </p>
            <p className="text-xs text-gray-600 mt-2">
              Member since {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Handle Info */}
        <div className="bg-[#16161f] rounded-2xl border border-[#2a2a38] p-5">
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Your Handle
          </label>
          <div className="flex items-center gap-3">
            <div className="bg-[#2a2a38] rounded-xl px-4 py-3 flex-1">
              <span className="text-indigo-400 font-mono text-lg">@{profile.handle}</span>
            </div>
            <p className="text-xs text-gray-500">Unique identifier — visible to others</p>
          </div>
          <p className="text-xs text-gray-600 mt-2">
            To change your handle, use the Profile Setup page
          </p>
        </div>
      </div>
    </div>
  );
}
