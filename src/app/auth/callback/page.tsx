"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function AuthCallbackContent() {
  const router = useRouter();
  const search = useSearchParams();
  useEffect(() => {
    const finish = async () => {
      try {
        const code = search.get("code");
        if (code) {
          const { error } = await getSupabaseBrowserClient().auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        router.replace(search.get("next") || "/");
      } catch (error) {
        console.error("Supabase auth callback failed", error);
        router.replace("/auth");
      }
    };
    void finish();
  }, [router, search]);
  return <div className="min-h-screen bg-[#0a0f0a] flex items-center justify-center"><div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4ade80] mx-auto mb-4" /><p className="text-white">Completing sign-in...</p></div></div>;
}

export default function AuthCallback() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0f0a] flex items-center justify-center"><p className="text-white">Completing sign-in...</p></div>}>
      <AuthCallbackContent />
    </Suspense>
  );
}
