import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { friendsRouter } from "./routers/friends";
import { messagesRouter } from "./routers/messages";
import { groupsRouter } from "./routers/groups";
import {
  getUserByEmail,
  getUserById,
  getProfileByUserId,
  getProfileByHandle,
  createProfile,
  updateProfile,
  updateKarma,
  setEmailVerificationCode,
  verifyEmailCode,
  upsertUser,
} from "./db";
import {
  hashPassword,
  verifyPassword,
  generateVerificationCode,
  generateHandleSuggestion,
} from "./auth";
import { sendVerificationEmail, sendWelcomeEmail } from "./email";
import { TRPCError } from "@trpc/server";

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),

    // Email/password signup
    signupWithEmail: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string().min(8),
        displayName: z.string().min(1).max(100),
      }))
      .mutation(async ({ input }) => {
        const existingUser = await getUserByEmail(input.email);
        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email already registered",
          });
        }

        const passwordHash = hashPassword(input.password);
        const verificationCode = generateVerificationCode();

        // Create user with email/password
        await upsertUser({
          openId: `email_${input.email}_${Date.now()}`,
          email: input.email,
          passwordHash,
          loginMethod: "email",
          emailVerified: false,
        });

        const user = await getUserByEmail(input.email);
        if (!user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create user",
          });
        }

        // Set verification code
        await setEmailVerificationCode(user.id, verificationCode);

        // Send verification email
        await sendVerificationEmail(input.email, verificationCode);

        // Create profile with suggested handle
        const suggestedHandle = generateHandleSuggestion();
        await createProfile({
          userId: user.id,
          handle: suggestedHandle,
          displayName: input.displayName,
          karma: 0,
          photoSharingEnabled: true,
        });

        return {
          success: true,
          userId: user.id,
          message: "Verification code sent to your email",
        };
      }),

    // Verify email code
    verifyEmailCode: publicProcedure
      .input(z.object({
        userId: z.number(),
        code: z.string(),
      }))
      .mutation(async ({ input }) => {
        const verified = await verifyEmailCode(input.userId, input.code);
        if (!verified) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid or expired verification code",
          });
        }

        return { success: true };
      }),

    // Email/password login
    loginWithEmail: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string(),
      }))
      .mutation(async ({ input }) => {
        const user = await getUserByEmail(input.email);
        if (!user || !user.passwordHash) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        if (!user.emailVerified) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Email not verified. Please check your email for the verification code.",
          });
        }

        const passwordValid = verifyPassword(input.password, user.passwordHash);
        if (!passwordValid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        return {
          success: true,
          userId: user.id,
          openId: user.openId,
        };
      }),

    // Resend verification code
    resendVerificationCode: publicProcedure
      .input(z.object({
        userId: z.number(),
      }))
      .mutation(async ({ input }) => {
        const user = await getUserById(input.userId);
        if (!user || !user.email) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        const verificationCode = generateVerificationCode();
        await setEmailVerificationCode(input.userId, verificationCode);
        await sendVerificationEmail(user.email, verificationCode);

        return { success: true };
      }),
  }),

  profile: router({
    // Get current user's profile
    me: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getProfileByUserId(ctx.user.id);
      return profile;
    }),

    // Get profile by handle
    getByHandle: publicProcedure
      .input(z.object({ handle: z.string() }))
      .query(async ({ input }) => {
        const profile = await getProfileByHandle(input.handle);
        if (!profile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Profile not found",
          });
        }
        return profile;
      }),

    // Get profile by user ID
    getById: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        const profile = await getProfileByUserId(input.userId);
        if (!profile) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Profile not found",
          });
        }
        return profile;
      }),

    // Update profile
    update: protectedProcedure
      .input(z.object({
        handle: z.string().min(3).max(32).optional(),
        displayName: z.string().min(1).max(100).optional(),
        bio: z.string().max(500).optional(),
        avatar: z.string().url().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if handle is already taken
        if (input.handle) {
          const existingProfile = await getProfileByHandle(input.handle);
          if (existingProfile && existingProfile.userId !== ctx.user.id) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Handle already taken",
            });
          }
        }

        await updateProfile(ctx.user.id, input);
        const updated = await getProfileByUserId(ctx.user.id);
        return updated;
      }),

    // Check if handle is available
    checkHandleAvailable: publicProcedure
      .input(z.object({ handle: z.string() }))
      .query(async ({ input }) => {
        const profile = await getProfileByHandle(input.handle);
        return { available: !profile };
      }),

    // Get user karma
    getKarma: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        const profile = await getProfileByUserId(input.userId);
        return { karma: profile?.karma ?? 0 };
      }),
  }),

  friends: friendsRouter,
  messages: messagesRouter,
  groups: groupsRouter,
});

export type AppRouter = typeof appRouter;
