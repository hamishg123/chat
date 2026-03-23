import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { friendRequests, profiles } from "../../drizzle/schema";
import { eq, and, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const friendsRouter = router({
  // Send friend request
  sendRequest: protectedProcedure
    .input(z.object({ recipientId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (input.recipientId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot send friend request to yourself",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Check if request already exists
      const existing = await db
        .select()
        .from(friendRequests)
        .where(
          and(
            eq(friendRequests.senderId, ctx.user.id),
            eq(friendRequests.recipientId, input.recipientId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Friend request already sent",
        });
      }

      await db.insert(friendRequests).values({
        senderId: ctx.user.id,
        recipientId: input.recipientId,
        status: "pending",
      });

      return { success: true };
    }),

  // Accept friend request
  acceptRequest: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const request = await db
        .select()
        .from(friendRequests)
        .where(eq(friendRequests.id, input.requestId))
        .limit(1);

      if (request.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (request[0].recipientId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await db
        .update(friendRequests)
        .set({ status: "accepted" })
        .where(eq(friendRequests.id, input.requestId));

      return { success: true };
    }),

  // Reject friend request
  rejectRequest: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const request = await db
        .select()
        .from(friendRequests)
        .where(eq(friendRequests.id, input.requestId))
        .limit(1);

      if (request.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (request[0].recipientId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await db
        .update(friendRequests)
        .set({ status: "rejected" })
        .where(eq(friendRequests.id, input.requestId));

      return { success: true };
    }),

  // Get pending friend requests
  getPendingRequests: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const requests = await db
      .select({
        id: friendRequests.id,
        senderId: friendRequests.senderId,
        senderHandle: profiles.handle,
        senderDisplayName: profiles.displayName,
        senderAvatar: profiles.avatar,
        createdAt: friendRequests.createdAt,
      })
      .from(friendRequests)
      .innerJoin(profiles, eq(friendRequests.senderId, profiles.userId))
      .where(
        and(
          eq(friendRequests.recipientId, ctx.user.id),
          eq(friendRequests.status, "pending")
        )
      );

    return requests;
  }),

  // Get friends list
  getFriends: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const friends = await db
      .select({
        id: friendRequests.id,
        userId: profiles.userId,
        handle: profiles.handle,
        displayName: profiles.displayName,
        avatar: profiles.avatar,
        karma: profiles.karma,
      })
      .from(friendRequests)
      .innerJoin(profiles, eq(friendRequests.senderId, profiles.userId))
      .where(
        and(
          eq(friendRequests.recipientId, ctx.user.id),
          eq(friendRequests.status, "accepted")
        )
      );

    // Also get friends where current user is the sender
    const friendsReverse = await db
      .select({
        id: friendRequests.id,
        userId: profiles.userId,
        handle: profiles.handle,
        displayName: profiles.displayName,
        avatar: profiles.avatar,
        karma: profiles.karma,
      })
      .from(friendRequests)
      .innerJoin(profiles, eq(friendRequests.recipientId, profiles.userId))
      .where(
        and(
          eq(friendRequests.senderId, ctx.user.id),
          eq(friendRequests.status, "accepted")
        )
      );

    return [...friends, ...friendsReverse];
  }),

  // Remove friend
  removeFriend: protectedProcedure
    .input(z.object({ friendId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db
        .update(friendRequests)
        .set({ status: "rejected" })
        .where(
          or(
            and(
              eq(friendRequests.senderId, ctx.user.id),
              eq(friendRequests.recipientId, input.friendId)
            ),
            and(
              eq(friendRequests.senderId, input.friendId),
              eq(friendRequests.recipientId, ctx.user.id)
            )
          )
        );

      return { success: true };
    }),
});
