import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Loader2, Edit2, Save, X } from "lucide-react";

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

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    try {
      await updateProfileMutation.mutateAsync({
        displayName,
        bio: bio || undefined,
        avatar: avatar || undefined,
      });
      toast.success("Profile updated!");
      setIsEditing(false);
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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Profile not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-2xl">Profile</CardTitle>
              <CardDescription>Manage your account settings</CardDescription>
            </div>
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
              >
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar Section */}
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profile.avatar || undefined} />
                <AvatarFallback className="text-lg font-bold">
                  {profile.displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm text-muted-foreground">Profile Picture</p>
                {isEditing && (
                  <Input
                    type="url"
                    placeholder="Image URL"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    className="mt-2"
                  />
                )}
              </div>
            </div>

            {/* Handle */}
            <div className="space-y-2">
              <label className="text-sm font-medium">@Handle</label>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">@{profile.handle}</span>
              </div>
              <p className="text-xs text-muted-foreground">Your unique identifier</p>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Display Name</label>
              {isEditing ? (
                <Input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={100}
                />
              ) : (
                <p className="text-lg">{profile.displayName}</p>
              )}
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Bio</label>
              {isEditing ? (
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Tell us about yourself"
                />
              ) : (
                <p className="text-muted-foreground">{profile.bio || "No bio yet"}</p>
              )}
              {isEditing && <p className="text-xs text-muted-foreground">{bio.length}/500</p>}
            </div>

            {/* Karma Section */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-900">Karma Points</p>
                  <p className="text-xs text-amber-700">Earn karma by sharing photos and engaging with friends</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-amber-600">{profile.karma}</p>
                  <p className="text-xs text-amber-700">
                    {profile.karma >= 10 ? "✓ Can share photos" : `${10 - profile.karma} more to unlock`}
                  </p>
                </div>
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <p className="text-muted-foreground">{user.email}</p>
            </div>

            {/* Edit Actions */}
            {isEditing && (
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleSave}
                  disabled={updateProfileMutation.isPending}
                  className="flex-1"
                >
                  {updateProfileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={updateProfileMutation.isPending}
                  className="flex-1"
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
