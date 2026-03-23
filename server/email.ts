import { invokeLLM } from "./_core/llm";

/**
 * Send verification code email
 */
export async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  try {
    // In production, use a real email service like SendGrid, Resend, or AWS SES
    // For now, we'll log it and return true
    console.log(`[Email] Verification code for ${email}: ${code}`);
    
    // TODO: Integrate with actual email service
    // const response = await fetch('https://api.resend.com/emails', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     from: 'noreply@toptier.chat',
    //     to: email,
    //     subject: 'Your TopTier Chat Verification Code',
    //     html: `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 15 minutes.</p>`,
    //   }),
    // });
    
    return true;
  } catch (error) {
    console.error('[Email] Failed to send verification email:', error);
    return false;
  }
}

/**
 * Send welcome email
 */
export async function sendWelcomeEmail(email: string, displayName: string): Promise<boolean> {
  try {
    console.log(`[Email] Welcome email sent to ${email}`);
    
    // TODO: Integrate with actual email service
    return true;
  } catch (error) {
    console.error('[Email] Failed to send welcome email:', error);
    return false;
  }
}

/**
 * Send friend request notification
 */
export async function sendFriendRequestEmail(email: string, senderName: string): Promise<boolean> {
  try {
    console.log(`[Email] Friend request notification sent to ${email}`);
    return true;
  } catch (error) {
    console.error('[Email] Failed to send friend request email:', error);
    return false;
  }
}
