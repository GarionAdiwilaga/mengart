import { validateInviteToken } from "@/lib/invites";
import Link from "next/link";
import { Palette, Sparkles, AlertCircle, ArrowRight, ShieldCheck, Clock } from "lucide-react";
import { InviteRedeemForm } from "@/components/auth/InviteRedeemForm";

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const validation = await validateInviteToken(token);

  if (!validation.isValid || !validation.invite) {
    let errorTitle = "Invalid Invitation";
    let errorDescription = "This invitation link is not recognized or may have been typed incorrectly.";

    if (validation.reason === "expired") {
      errorTitle = "Invitation Expired";
      errorDescription = "This invitation has passed its validity period. Please request a new invitation from a community moderator.";
    } else if (validation.reason === "exhausted") {
      errorTitle = "Invitation Exhausted";
      errorDescription = "This invitation has already reached its maximum redemption limit.";
    } else if (validation.reason === "revoked") {
      errorTitle = "Invitation Revoked";
      errorDescription = "This invitation link was revoked by a community administrator.";
    }

    return (
      <main className="min-h-screen flex flex-col justify-center items-center p-6 relative">
        <div className="w-full max-w-md glass-panel-elevated p-8 sm:p-10 rounded-3xl flex flex-col items-center text-center gap-6">
          <div className="h-12 w-12 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl text-white tracking-tight">{errorTitle}</h1>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{errorDescription}</p>
          </div>
          <Link
            href="/"
            className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            Back to Showcase
          </Link>
        </div>
      </main>
    );
  }

  const { invite } = validation;
  const formattedExpiry = invite.expiresAt
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Makassar",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(invite.expiresAt))
    : "No Expiry";

  return (
    <main className="min-h-screen flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Atelier Invite Card */}
      <div className="w-full max-w-lg glass-panel-elevated p-8 sm:p-10 rounded-3xl relative z-10 flex flex-col gap-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Palette className="h-6 w-6 text-black" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-mono mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              <span>OFFICIAL INVITATION</span>
            </div>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-white tracking-tight">
              Join Mengart Atelier
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              You have been invited to join the private digital art collective.
            </p>
          </div>
        </div>

        {/* Invite Details Capsule */}
        <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-xs">
          <div className="flex flex-col gap-1">
            <span className="text-zinc-500 font-mono">INVITATION CODE</span>
            <span className="text-zinc-200 font-mono font-medium">{invite.tokenPrefix}...</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-zinc-500 font-mono">VALID UNTIL</span>
            <span className="text-zinc-200 font-mono font-medium flex items-center gap-1">
              <Clock className="h-3 w-3 text-amber-400" />
              {formattedExpiry}
            </span>
          </div>
          {invite.label ? (
            <div className="col-span-2 flex flex-col gap-1 pt-2 border-t border-white/5">
              <span className="text-zinc-500 font-mono">INVITATION LABEL</span>
              <span className="text-zinc-300 font-sans">{invite.label}</span>
            </div>
          ) : null}
        </div>

        {/* Client-Side Registration Form */}
        <InviteRedeemForm rawToken={token} />
      </div>
    </main>
  );
}
