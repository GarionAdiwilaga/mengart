/**
 * Studio Atelier Email Notification & Verification Dispatcher
 */

export async function sendVerificationEmail(params: {
  email: string;
  token: string;
  displayName: string;
}) {
  const appUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000";
  const verifyUrl = `${appUrl}/verify-email?token=${encodeURIComponent(params.token)}&email=${encodeURIComponent(params.email)}`;

  console.log("\n================ [EMAIL DISPATCH: VERIFIKASI AKUN] ================");
  console.log(`Penerima  : ${params.displayName} <${params.email}>`);
  console.log(`Subjek    : Verifikasi Akun Member Atelier Anda — Mengart`);
  console.log(`Kode/Token: ${params.token}`);
  console.log(`Tautan    : ${verifyUrl}`);
  console.log("===================================================================\n");

  return { success: true, verifyUrl };
}

export async function sendPasswordResetEmail(params: {
  email: string;
  token: string;
  displayName: string;
}) {
  const appUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000";
  const resetUrl = `${appUrl}/reset-password/${encodeURIComponent(params.token)}?email=${encodeURIComponent(params.email)}`;

  console.log("\n================ [EMAIL DISPATCH: RESET PASSWORD] ================");
  console.log(`Penerima  : ${params.displayName} <${params.email}>`);
  console.log(`Subjek    : Permintaan Reset Password Akun — Mengart`);
  console.log(`Kode/Token: ${params.token}`);
  console.log(`Tautan    : ${resetUrl}`);
  console.log("===================================================================\n");

  return { success: true, resetUrl };
}
