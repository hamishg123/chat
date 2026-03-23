import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Loader2, MessageSquare, Users, Settings } from "lucide-react";

export default function Chat() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedChat, setSelectedChat] = useState<number | null>(null);

  if (!user) {
    setLocation("/auth");
    return null;
  }

  const conversationsQuery = trpc.messages.getConversations.useQuery();
  const friendsQuery = trpc.friends.getFriends.useQuery();
  const groupsQuery = trpc.groups.getMyGroups.useQuery();

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold">TopTier Chat</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20"
              onClick={() => setLocation("/profile")}
            >
              <Settings className="h-4 w-4 mr-2" />
              Profile
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20"
              onClick={logout}
            >
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 border-r bg-gray-50 flex flex-col">
          <Tabs defaultValue="chats" className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start border-b rounded-none">
              <TabsTrigger value="chats" className="flex-1">
                <MessageSquare className="h-4 w-4 mr-2" />
                Chats
              </TabsTrigger>
              <TabsTrigger value="friends" className="flex-1">
                <Users className="h-4 w-4 mr-2" />
                Friends
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chats" className="flex-1 overflow-y-auto p-2">
              {conversationsQuery.isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : conversationsQuery.data && conversationsQuery.data.length > 0 ? (
                <div className="space-y-2">
                  {conversationsQuery.data.map((conv) => (
                    <button
                      key={conv.contactId}
                      onClick={() => setSelectedChat(conv.contactId)}
                      className={`w-full text-left p-3 rounded-lg transition ${
                        selectedChat === conv.contactId
                          ? "bg-blue-100 border-2 border-blue-500"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      <p className="font-semibold text-sm">{conv.contactDisplayName}</p>
                      <p className="text-xs text-gray-600 truncate">@{conv.contactHandle}</p>
                      <p className="text-xs text-gray-500 truncate mt-1">
                        {conv.lastMessage || "No messages yet"}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-center">
                  <p className="text-muted-foreground">No conversations yet</p>
                </div>
              )}

              {/* Groups */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-semibold text-gray-600 mb-2">Groups</p>
                {groupsQuery.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : groupsQuery.data && groupsQuery.data.length > 0 ? (
                  <div className="space-y-2">
                    {groupsQuery.data.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => setSelectedChat(-group.id)}
                        className={`w-full text-left p-3 rounded-lg transition ${
                          selectedChat === -group.id
                            ? "bg-blue-100 border-2 border-blue-500"
                            : "hover:bg-gray-100"
                        }`}
                      >
                        <p className="font-semibold text-sm">{group.name}</p>
                        <p className="text-xs text-gray-500"># Group</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No groups yet</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="friends" className="flex-1 overflow-y-auto p-2">
              {friendsQuery.isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : friendsQuery.data && friendsQuery.data.length > 0 ? (
                <div className="space-y-2">
                  {friendsQuery.data.map((friend) => (
                    <button
                      key={friend.userId}
                      onClick={() => setSelectedChat(friend.userId)}
                      className={`w-full text-left p-3 rounded-lg transition ${
                        selectedChat === friend.userId
                          ? "bg-blue-100 border-2 border-blue-500"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      <p className="font-semibold text-sm">{friend.displayName}</p>
                      <p className="text-xs text-gray-600">@{friend.handle}</p>
                      <p className="text-xs text-amber-600 mt-1">Karma: {friend.karma}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-center">
                  <p className="text-muted-foreground">No friends yet</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedChat ? (
            <ChatWindow chatId={selectedChat} />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">Select a chat to start messaging</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatWindow({ chatId }: { chatId: number }) {
  const [message, setMessage] = useState("");
  const [isGroup] = useState(chatId < 0);
  const actualChatId = Math.abs(chatId);

  const dmHistoryQuery = !isGroup
    ? trpc.messages.getDMHistory.useQuery({ recipientId: actualChatId })
    : null;

  const groupMessagesQuery = isGroup
    ? trpc.groups.getMessages.useQuery({ groupId: actualChatId })
    : null;

  const sendDMMutation = trpc.messages.sendDM.useMutation();
  const sendGroupMessageMutation = trpc.groups.sendGroupMessage.useMutation();

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    try {
      if (isGroup) {
        await sendGroupMessageMutation.mutateAsync({
          groupId: actualChatId,
          content: message,
        });
      } else {
        await sendDMMutation.mutateAsync({
          recipientId: actualChatId,
          content: message,
        });
      }
      setMessage("");
    } catch (error: any) {
      toast.error(error.message || "Failed to send message");
    }
  };

  const messages = isGroup ? groupMessagesQuery?.data : dmHistoryQuery?.data;

  return (
    <>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages && messages.length > 0 ? (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.senderId === 1 ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-lg ${
                  msg.senderId === 1
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-900"
                }`}
              >
                {msg.type === "image" ? (
                  <img src={msg.imageUrl || ""} alt="Message" className="max-w-xs rounded" />
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
                <p className="text-xs opacity-70 mt-1">
                  {msg.senderHandle && `@${msg.senderHandle}`}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>No messages yet. Start the conversation!</p>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className="border-t p-4 bg-white">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={sendDMMutation.isPending || sendGroupMessageMutation.isPending}
          />
          <Button
            type="submit"
            disabled={sendDMMutation.isPending || sendGroupMessageMutation.isPending}
          >
            {(sendDMMutation.isPending || sendGroupMessageMutation.isPending) && (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            )}
            Send
          </Button>
        </div>
      </form>
    </>
  );
}
