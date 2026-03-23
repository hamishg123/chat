import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb, getProfileByUserId } from "../db";
import { directMessages, profiles } from "../../drizzle/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { storagePut } from "../storage";

export const messagesRouter = router({
  // Send direct message
  sendDM: protectedProcedure
    .input(z.object({
      recipientId: z.number(),
      content: z.string().optional(),
      imageUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!input.content && !input.imageUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Message must have content or image",
        });
      }

      // Check karma for photo sharing
      if (input.imageUrl) {
        const senderProfile = await getProfileByUserId(ctx.user.id);
        if (!senderProfile || senderProfile.karma < 10) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Insufficient karma to share photos (need 10+)",
          });
        }
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const result = await db.insert(directMessages).values({
        senderId: ctx.user.id,
        recipientId: input.recipientId,
        content: input.content || null,
        type: input.imageUrl ? "image" : "text",
        imageUrl: input.imageUrl || null,
      });

      return { success: true, messageId: result[0] };
    }),

  // Get direct message history
  getDMHistory: protectedProcedure
    .input(z.object({
      recipientId: z.number(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const messages = await db
        .select({
          id: directMessages.id,
          senderId: directMessages.senderId,
          senderHandle: profiles.handle,
          senderAvatar: profiles.avatar,
          content: directMessages.content,
          type: directMessages.type,
          imageUrl: directMessages.imageUrl,
          isRead: directMessages.isRead,
          createdAt: directMessages.createdAt,
        })
        .from(directMessages)
        .leftJoin(profiles, eq(directMessages.senderId, profiles.userId))
        .where(
          or(
            and(
              eq(directMessages.senderId, ctx.user.id),
              eq(directMessages.recipientId, input.recipientId)
            ),
            and(
              eq(directMessages.senderId, input.recipientId),
              eq(directMessages.recipientId, ctx.user.id)
            )
          )
        )
        .orderBy(desc(directMessages.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return messages.reverse();
    }),

  // Get conversations list (latest message from each contact)
  getConversations: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    // Get all unique contacts with their latest message
    const conversations = await db
      .select({
        contactId: profiles.userId,
        contactHandle: profiles.handle,
        contactDisplayName: profiles.displayName,
        contactAvatar: profiles.avatar,
        lastMessage: directMessages.content,
        lastMessageType: directMessages.type,
        lastMessageTime: directMessages.createdAt,
        unreadCount: directMessages.isRead,
      })
      .from(directMessages)
      .innerJoin(profiles, 
        or(
          eq(directMessages.senderId, profiles.userId),
          eq(directMessages.recipientId, profiles.userId)
        )
      )
      .where(
        or(
          eq(directMessages.senderId, ctx.user.id),
          eq(directMessages.recipientId, ctx.user.id)
        )
      )
      .orderBy(desc(directMessages.createdAt));

    // Deduplicate by contactId, keeping the most recent
    const seen = new Set<number>();
    return conversations.filter(conv => {
      if (conv.contactId === ctx.user.id) return false;
      if (seen.has(conv.contactId)) return false;
      seen.add(conv.contactId);
      return true;
    });
  }),

  // Mark message as read
  markAsRead: protectedProcedure
    .input(z.object({ messageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(directMessages)
        .set({ isRead: true })
        .where(
          and(
            eq(directMessages.id, input.messageId),
            eq(directMessages.recipientId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  // Delete message
  deleteMessage: protectedProcedure
    .input(z.object({ messageId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const message = await db
        .select()
        .from(directMessages)
        .where(eq(directMessages.id, input.messageId))
        .limit(1);

      if (message.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (message[0].senderId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await db.delete(directMessages).where(eq(directMessages.id, input.messageId));

      return { success: true };
    }),
});
