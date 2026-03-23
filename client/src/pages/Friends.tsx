import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Loader2, UserPlus, Check, X } from "lucide-react";

export default function Friends() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [searchHandle, setSearchHandle] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  if (!user) {
    setLocation("/auth");
    return null;
  }

  const friendsQuery = trpc.friends.getFriends.useQuery();
  const pendingQuery = trpc.friends.getPendingRequests.useQuery();
  const searchProfileQuery = trpc.profile.getByHandle.useQuery(
    { handle: searchHandle },
    { enabled: false }
  );
  const sendRequestMutation = trpc.friends.sendRequest.useMutation();
  const acceptRequestMutation = trpc.friends.acceptRequest.useMutation();
  const rejectRequestMutation = trpc.friends.rejectRequest.useMutation();

  const handleSearch = async () => {
    if (!searchHandle.trim()) {
      toast.error("Please enter a handle");
      return;
    }

    setIsSearching(true);
    try {
      const result = await searchProfileQuery.refetch();
      if (result.data) {
        setSearchResult(result.data);
      }
    } catch (error: any) {
      toast.error("User not found");
      setSearchResult(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async (recipientId: number) => {
    try {
      await sendRequestMutation.mutateAsync({ recipientId });
      toast.success("Friend request sent!");
      setSearchResult(null);
      setSearchHandle("");
    } catch (error: any) {
      toast.error(error.message || "Failed to send request");
    }
  };

  const handleAccept = async (requestId: number) => {
    try {
      await acceptRequestMutation.mutateAsync({ requestId });
      toast.success("Friend request accepted!");
      pendingQuery.refetch();
      friendsQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to accept request");
    }
  };

  const handleReject = async (requestId: number) => {
    try {
      await rejectRequestMutation.mutateAsync({ requestId });
      toast.success("Friend request rejected");
      pendingQuery.refetch();
    } catch (error: any) {
      toast.error(error.message || "Failed to reject request");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Friends</h1>
          <p className="text-gray-600">Manage your friends and friend requests</p>
        </div>

        <Tabs defaultValue="friends" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="friends">Friends</TabsTrigger>
            <TabsTrigger value="requests">Requests</TabsTrigger>
            <TabsTrigger value="add">Add Friend</TabsTrigger>
          </TabsList>

          {/* Friends Tab */}
          <TabsContent value="friends" className="space-y-4 mt-4">
            {friendsQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : friendsQuery.data && friendsQuery.data.length > 0 ? (
              <div className="grid gap-4">
                {friendsQuery.data.map((friend) => (
                  <Card key={friend.userId} className="hover:shadow-lg transition">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={friend.avatar || undefined} />
                          <AvatarFallback>
                            {friend.displayName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-semibold">{friend.displayName}</p>
                          <p className="text-sm text-gray-600">@{friend.handle}</p>
                          <p className="text-xs text-amber-600 mt-1">Karma: {friend.karma}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/chat?friend=${friend.userId}`)}
                        >
                          Message
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground">No friends yet. Add some friends to get started!</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests" className="space-y-4 mt-4">
            {pendingQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : pendingQuery.data && pendingQuery.data.length > 0 ? (
              <div className="grid gap-4">
                {pendingQuery.data.map((request) => (
                  <Card key={request.id} className="hover:shadow-lg transition">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={request.senderAvatar || undefined} />
                          <AvatarFallback>
                            {request.senderDisplayName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-semibold">{request.senderDisplayName}</p>
                          <p className="text-sm text-gray-600">@{request.senderHandle}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Sent {new Date(request.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleAccept(request.id)}
                            disabled={acceptRequestMutation.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReject(request.id)}
                            disabled={rejectRequestMutation.isPending}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-muted-foreground">No pending friend requests</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Add Friend Tab */}
          <TabsContent value="add" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Find Friends</CardTitle>
                <CardDescription>Search for users by their @handle</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Enter @handle (e.g., swiftfox123)"
                    value={searchHandle}
                    onChange={(e) => setSearchHandle(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={isSearching || searchProfileQuery.isFetching}
                  >
                    {(isSearching || searchProfileQuery.isFetching) && (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    )}
                    Search
                  </Button>
                </div>

                {searchResult && (
                  <Card className="border-2 border-blue-200 bg-blue-50">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16">
                          <AvatarImage src={searchResult.avatar || undefined} />
                          <AvatarFallback>
                            {searchResult.displayName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="font-semibold text-lg">{searchResult.displayName}</p>
                          <p className="text-gray-600">@{searchResult.handle}</p>
                          {searchResult.bio && (
                            <p className="text-sm text-gray-700 mt-2">{searchResult.bio}</p>
                          )}
                          <p className="text-sm text-amber-600 mt-2">Karma: {searchResult.karma}</p>
                        </div>
                        <Button
                          onClick={() => handleSendRequest(searchResult.userId)}
                          disabled={sendRequestMutation.isPending}
                        >
                          {sendRequestMutation.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          )}
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add Friend
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
