import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { Loader2, MessageCircle } from "lucide-react";

export default function Auth() {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [userId, setUserId] = useState<number | null>(null);
  const [step, setStep] = useState<"signup" | "verify">("signup");

  const signupMutation = trpc.auth.signupWithEmail.useMutation();
  const verifyMutation = trpc.auth.verifyEmailCode.useMutation();
  const loginMutation = trpc.auth.loginWithEmail.useMutation();
  const resendMutation = trpc.auth.resendVerificationCode.useMutation();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !displayName) {
      toast.error("Please fill in all fields");
      return;
    }
    try {
      const result = await signupMutation.mutateAsync({ email, password, displayName });
      setUserId(result.userId);
      setStep("verify");
      toast.success("Verification code sent to your email!");
    } catch (error: any) {
      toast.error(error.message || "Signup failed");
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !verificationCode) {
      toast.error("Please enter the verification code");
      return;
    }
    try {
      await verifyMutation.mutateAsync({ userId, code: verificationCode });
      toast.success("Email verified! You can now log in.");
      setStep("signup");
      setVerificationCode("");
      setActiveTab("login");
    } catch (error: any) {
      toast.error(error.message || "Verification failed");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    try {
      await loginMutation.mutateAsync({ email, password });
      toast.success("Logged in successfully!");
    } catch (error: any) {
      toast.error(error.message || "Login failed");
    }
  };

  const handleResendCode = async () => {
    if (!userId) return;
    try {
      await resendMutation.mutateAsync({ userId });
      toast.success("Verification code resent!");
    } catch (error: any) {
      toast.error(error.message || "Failed to resend code");
    }
  };

  if (isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-white text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-slate-400" />
          <p className="text-slate-400">Redirecting...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-950">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800 p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full bg-white blur-3xl" />
          <div className="absolute bottom-20 right-20 w-80 h-80 rounded-full bg-white blur-3xl" />
        </div>
        <div className="relative z-10 text-center">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-slate-700/50 backdrop-blur-sm rounded-2xl p-4">
              <MessageCircle className="h-12 w-12 text-slate-200" />
            </div>
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">TopTier Chat</h1>
          <p className="text-xl text-slate-300 max-w-sm leading-relaxed">
            Connect with friends, share moments, and stay in touch — all in one place.
          </p>
          <div className="mt-10 grid grid-cols-3 gap-6 text-center">
            <div className="bg-slate-700/30 backdrop-blur-sm rounded-xl p-4">
              <p className="text-2xl font-bold text-white">DMs</p>
              <p className="text-slate-400 text-sm mt-1">Direct Messages</p>
            </div>
            <div className="bg-slate-700/30 backdrop-blur-sm rounded-xl p-4">
              <p className="text-2xl font-bold text-white">Groups</p>
              <p className="text-slate-400 text-sm mt-1">Group Chats</p>
            </div>
            <div className="bg-slate-700/30 backdrop-blur-sm rounded-xl p-4">
              <p className="text-2xl font-bold text-white">Karma</p>
              <p className="text-slate-400 text-sm mt-1">Photo Sharing</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right auth panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="bg-slate-700 rounded-xl p-2">
              <MessageCircle className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">TopTier Chat</h1>
          </div>

          {step === "verify" ? (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Check your email</h2>
              <p className="text-slate-400 mb-8">We sent a 6-digit code to <span className="text-slate-300">{email}</span></p>
              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Verification Code</label>
                  <Input
                    type="text"
                    placeholder="000000"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    maxLength={6}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 focus:border-slate-500 text-center text-2xl tracking-widest h-14"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl"
                  disabled={verifyMutation.isPending}
                >
                  {verifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify Email
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-slate-400 hover:text-white"
                  onClick={handleResendCode}
                  disabled={resendMutation.isPending}
                >
                  {resendMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Resend Code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-slate-500 hover:text-slate-300 text-sm"
                  onClick={() => setStep("signup")}
                >
                  Back to sign up
                </Button>
              </form>
            </div>
          ) : (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {activeTab === "login" ? "Welcome back" : "Create an account"}
              </h2>
              <p className="text-slate-400 mb-8">
                {activeTab === "login" ? "Sign in to continue to TopTier Chat" : "Join TopTier Chat today"}
              </p>

              {/* Tab switcher */}
              <div className="flex bg-slate-800 rounded-xl p-1 mb-6">
                <button
                  onClick={() => setActiveTab("login")}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === "login"
                      ? "bg-slate-700 text-white shadow-lg"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => setActiveTab("signup")}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === "signup"
                      ? "bg-slate-700 text-white shadow-lg"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Sign Up
                </button>
              </div>

              {/* Google OAuth button */}
              <a href={getLoginUrl()} className="block mb-6">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 bg-slate-800 border-slate-700 text-white hover:bg-slate-700 hover:border-slate-600 rounded-xl font-medium"
                >
                  <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </Button>
              </a>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-700" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-slate-950 px-3 text-xs text-slate-500 uppercase tracking-wider">or</span>
                </div>
              </div>

              {activeTab === "login" ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 focus:border-slate-500 h-12 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 focus:border-slate-500 h-12 rounded-xl"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-12 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl mt-2"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign In
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleSignup} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Display Name</label>
                    <Input
                      type="text"
                      placeholder="Your name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 focus:border-slate-500 h-12 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 focus:border-slate-500 h-12 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                    <Input
                      type="password"
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-600 focus:border-slate-500 h-12 rounded-xl"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-12 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-xl mt-2"
                    disabled={signupMutation.isPending}
                  >
                    {signupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
