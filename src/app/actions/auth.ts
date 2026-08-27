"use server";

import { db } from "@/db";
import { users, emailVerificationTokens, passwordResetTokens, profiles } from "@/db/schema";
import { eq, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { redeemInviteAndCreateMemberWithCredentials, extractInviteToken } from "@/lib/invites";
import { sendVerificationEmail, sendPasswordResetEmail } from "@/lib/email";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export async function loginWithCredentialsAction(
  prevStateOrFormData: any,
  maybeFormData?: FormData
) {
  const formData = (maybeFormData instanceof FormData
    ? maybeFormData
    : prevStateOrFormData instanceof FormData
    ? prevStateOrFormData
    : null) as FormData;

  if (!formData) {
    return { success: false, error: "Data permintaan tidak valid." };
  }

  const identifier = (formData.get("identifier") as string)?.trim();
  const password = formData.get("password") as string;

  if (!identifier || !password) {
    return { success: false, error: "Email/username dan kata sandi wajib diisi." };
  }

  try {
    await signIn("credentials", {
      identifier,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.cause?.err?.message === "EmailNotVerified") {
        return {
          success: false,
          error: "Email Anda belum diverifikasi. Silakan periksa email Anda atau lakukan verifikasi.",
        };
      }
      if (error.cause?.err?.message?.startsWith("Account")) {
        return {
          success: false,
          error: "Status akun Anda tidak aktif atau ditangguhkan.",
        };
      }
      return {
        success: false,
        error: "Email/username atau kata sandi tidak cocok.",
      };
    }
    // Re-throw redirect error to allow Next.js to navigate
    throw error;
  }
  return { success: true, error: null };
}

const registerSchema = z.object({
  inviteInput: z.string().min(1, "Kode atau tautan undangan wajib diisi."),
  displayName: z.string().min(2, "Nama artist minimal 2 karakter.").max(50),
  username: z
    .string()
    .min(3, "Username minimal 3 karakter.")
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/, "Username hanya boleh huruf, angka, underscore, atau tanda hubung.")
    .optional()
    .or(z.literal("")),
  email: z.string().email("Format email tidak valid."),
  password: z.string().min(8, "Password minimal 8 karakter."),
  confirmPassword: z.string().min(8),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Konfirmasi password tidak cocok.",
  path: ["confirmPassword"],
});

export async function registerWithCredentialsAction(formData: FormData) {
  const rawData = {
    inviteInput: formData.get("inviteInput") as string,
    displayName: formData.get("displayName") as string,
    username: (formData.get("username") as string) || undefined,
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    confirmPassword: formData.get("confirmPassword") as string,
  };

  const parsed = registerSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || "Validasi gagal." };
  }

  const { inviteInput, displayName, username, email, password } = parsed.data;
  const rawToken = extractInviteToken(inviteInput);

  if (!rawToken) {
    return { success: false, error: "Kode undangan tidak valid." };
  }

  try {
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await redeemInviteAndCreateMemberWithCredentials({
      rawToken,
      email,
      passwordHash,
      displayName,
      username: username || undefined,
    });

    return {
      success: true,
      email: result.user.email,
      message: "Registrasi berhasil! Silakan periksa email Anda untuk verifikasi akun.",
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Gagal memproses registrasi.",
    };
  }
}

export async function verifyEmailAction(rawToken: string, email: string) {
  if (!rawToken || !email) {
    return { success: false, error: "Token atau email tidak lengkap." };
  }

  const tokenHash = crypto.createHash("sha256").update(rawToken.trim()).digest("hex");
  const normalizedEmail = email.toLowerCase().trim();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user) {
    return { success: false, error: "Akun dengan email ini tidak ditemukan." };
  }

  if (user.emailVerified) {
    return { success: true, message: "Email Anda telah terverifikasi sebelumnya. Silakan login." };
  }

  const [tokenRecord] = await db
    .select()
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.userId, user.id),
        eq(emailVerificationTokens.tokenHash, tokenHash),
        gt(emailVerificationTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!tokenRecord) {
    return { success: false, error: "Token verifikasi tidak valid atau telah kedaluwarsa." };
  }

  // Update user as email verified and clean up token
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ emailVerified: new Date() })
      .where(eq(users.id, user.id));

    await tx
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.id, tokenRecord.id));
  });

  return { success: true, message: "Email berhasil diverifikasi! Anda kini dapat masuk ke akun." };
}

export async function resendVerificationEmailAction(email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user) {
    return { success: false, error: "Email tidak ditemukan." };
  }

  if (user.emailVerified) {
    return { success: false, error: "Email ini sudah terverifikasi. Silakan langsung login." };
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  // Generate new verification token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.transaction(async (tx) => {
    await tx
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, user.id));

    await tx.insert(emailVerificationTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });
  });

  await sendVerificationEmail({
    email: user.email,
    token: rawToken,
    displayName: profile?.displayName || "Artist",
  });

  return { success: true, message: "Tautan verifikasi baru telah dikirim ke email Anda." };
}

export async function requestPasswordResetAction(email: string) {
  const normalizedEmail = email.toLowerCase().trim();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (!user) {
    // For security, do not disclose whether email exists
    return {
      success: true,
      message: "Jika email terdaftar, instruksi reset password telah dikirimkan ke email Anda.",
    };
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

  await db.transaction(async (tx) => {
    await tx
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, user.id));

    await tx.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });
  });

  await sendPasswordResetEmail({
    email: user.email,
    token: rawToken,
    displayName: profile?.displayName || "Artist",
  });

  return {
    success: true,
    message: "Instruksi reset password telah dikirimkan ke email Anda.",
  };
}

export async function resetPasswordAction(formData: FormData) {
  const rawToken = formData.get("token") as string;
  const email = (formData.get("email") as string)?.toLowerCase().trim();
  const newPassword = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!rawToken || !email || !newPassword) {
    return { success: false, error: "Data permintaan tidak lengkap." };
  }

  if (newPassword.length < 8) {
    return { success: false, error: "Password baru minimal 8 karakter." };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: "Konfirmasi password baru tidak cocok." };
  }

  const tokenHash = crypto.createHash("sha256").update(rawToken.trim()).digest("hex");

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return { success: false, error: "Akun tidak ditemukan." };
  }

  const [tokenRecord] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.userId, user.id),
        eq(passwordResetTokens.tokenHash, tokenHash),
        gt(passwordResetTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!tokenRecord) {
    return { success: false, error: "Tautan reset password tidak valid atau telah kedaluwarsa." };
  }

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(newPassword, salt);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, emailVerified: user.emailVerified || new Date() })
      .where(eq(users.id, user.id));

    await tx
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.id, tokenRecord.id));
  });

  return {
    success: true,
    message: "Password berhasil diperbarui! Silakan login dengan password baru Anda.",
  };
}
