import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { getDb, getProfileByUserId } from "../db";
import { groups, groupMembers, groupMessages, profiles } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const groupsRouter = router({
  // Create group
  createGroup: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      memberIds: z.array(z.number()),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Create group
      const result = await db.insert(groups).values({
        name: input.name,
        description: input.description,
        creatorId: ctx.user.id,
        isPrivate: false,
      });

      // Note: In production, you'd need to get the actual group ID from the insert result
      // For now, we'll fetch it back
      const newGroup = await db
        .select()
        .from(groups)
        .where(and(eq(groups.creatorId, ctx.user.id), eq(groups.name, input.name)))
        .orderBy(desc(groups.createdAt))
        .limit(1);

      if (newGroup.length === 0) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }

      const groupId = newGroup[0].id;

      // Add creator as admin
      await db.insert(groupMembers).values({
        groupId: groupId,
        userId: ctx.user.id,
        role: "admin",
      });

      // Add other members
      for (const memberId of input.memberIds) {
        if (memberId !== ctx.user.id) {
          await db.insert(groupMembers).values({
            groupId: groupId,
            userId: memberId,
            role: "member",
          });
        }
      }

      return { success: true, groupId };
    }),

  // Get user's groups
  getMyGroups: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const userGroups = await db
      .select({
        id: groups.id,
        name: groups.name,
        description: groups.description,
        avatar: groups.avatar,
        creatorId: groups.creatorId,
        isPrivate: groups.isPrivate,
        role: groupMembers.role,
        memberCount: groupMembers.id,
        createdAt: groups.createdAt,
      })
      .from(groups)
      .innerJoin(groupMembers, eq(groups.id, groupMembers.groupId))
      .where(eq(groupMembers.userId, ctx.user.id));

    return userGroups;
  }),

  // Get group details
  getGroup: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      // Check if user is member
      const membership = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, input.groupId),
            eq(groupMembers.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (membership.length === 0) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const group = await db
        .select()
        .from(groups)
        .where(eq(groups.id, input.groupId))
        .limit(1);

      return group[0] || null;
    }),

  // Get group members
  getMembers: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const members = await db
        .select({
          userId: profiles.userId,
          handle: profiles.handle,
          displayName: profiles.displayName,
          avatar: profiles.avatar,
          karma: profiles.karma,
          role: groupMembers.role,
          joinedAt: groupMembers.joinedAt,
        })
        .from(groupMembers)
        .innerJoin(profiles, eq(groupMembers.userId, profiles.userId))
        .where(eq(groupMembers.groupId, input.groupId));

      return members;
    }),

  // Send group message
  sendGroupMessage: protectedProcedure
    .input(z.object({
      groupId: z.number(),
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

      // Verify user is member
      const membership = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, input.groupId),
            eq(groupMembers.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (membership.length === 0) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await db.insert(groupMessages).values({
        groupId: input.groupId,
        senderId: ctx.user.id,
        content: input.content || null,
        type: input.imageUrl ? "image" : "text",
        imageUrl: input.imageUrl || null,
      });

      return { success: true };
    }),

  // Get group messages
  getMessages: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      limit: z.number().default(50),
      offset: z.number().default(0),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const messages = await db
        .select({
          id: groupMessages.id,
          senderId: groupMessages.senderId,
          senderHandle: profiles.handle,
          senderDisplayName: profiles.displayName,
          senderAvatar: profiles.avatar,
          content: groupMessages.content,
          type: groupMessages.type,
          imageUrl: groupMessages.imageUrl,
          createdAt: groupMessages.createdAt,
        })
        .from(groupMessages)
        .leftJoin(profiles, eq(groupMessages.senderId, profiles.userId))
        .where(eq(groupMessages.groupId, input.groupId))
        .orderBy(desc(groupMessages.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return messages.reverse();
    }),

  // Add member to group
  addMember: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      userId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Check if user is admin
      const adminCheck = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, input.groupId),
            eq(groupMembers.userId, ctx.user.id),
            eq(groupMembers.role, "admin")
          )
        )
        .limit(1);

      if (adminCheck.length === 0) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Check if user already member
      const existing = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, input.groupId),
            eq(groupMembers.userId, input.userId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "User already in group" });
      }

      await db.insert(groupMembers).values({
        groupId: input.groupId,
        userId: input.userId,
        role: "member",
      });

      return { success: true };
    }),

  // Remove member from group
  removeMember: protectedProcedure
    .input(z.object({
      groupId: z.number(),
      userId: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Check if user is admin or removing themselves
      const adminCheck = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, input.groupId),
            eq(groupMembers.userId, ctx.user.id),
            eq(groupMembers.role, "admin")
          )
        )
        .limit(1);

      if (adminCheck.length === 0 && ctx.user.id !== input.userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await db
        .delete(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, input.groupId),
            eq(groupMembers.userId, input.userId)
          )
        );

      return { success: true };
    }),

  // Delete group (admin only)
  deleteGroup: protectedProcedure
    .input(z.object({ groupId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Check if user is creator
      const group = await db
        .select()
        .from(groups)
        .where(eq(groups.id, input.groupId))
        .limit(1);

      if (group.length === 0 || group[0].creatorId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await db.delete(groups).where(eq(groups.id, input.groupId));
      await db.delete(groupMembers).where(eq(groupMembers.groupId, input.groupId));
      await db.delete(groupMessages).where(eq(groupMessages.groupId, input.groupId));

      return { success: true };
    }),
});
