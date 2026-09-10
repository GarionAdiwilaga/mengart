"use client";

import { logoutAction } from "@/app/actions/auth";
import { invalidateActiveDraftOnLogout } from "@/lib/utils/draftStorage";
import { ReactNode } from "react";

interface SignOutButtonProps {
  className?: string;
  children: ReactNode;
}

export function SignOutButton({ className, children }: SignOutButtonProps) {
  const handleLogout = async () => {
    await invalidateActiveDraftOnLogout();
    await logoutAction();
  };

  return (
    <form action={handleLogout} className="w-full">
      <button
        type="submit"
        className={className}
      >
        {children}
      </button>
    </form>
  );
}
