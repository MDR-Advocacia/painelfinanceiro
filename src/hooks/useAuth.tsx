import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        // Tenta pegar a sessão atual (o que o persistSession salvou)
        const { data: { session: initialSession }, error: sessionError } = await supabase.auth.getSession();
        
        if (!mounted) return;
        if (sessionError) throw sessionError;

        setSession(initialSession);
        setUser(initialSession?.user ?? null);

        if (initialSession?.user) {
          // Tenta verificar se é admin, mas se falhar, apenas assume que não é
          try {
            const { data, error: rpcError } = await supabase.rpc("has_role", {
              _user_id: initialSession.user.id,
              _role: "admin",
            });
            if (rpcError) throw rpcError;
            if (mounted) setIsAdmin(!!data);
          } catch (e) {
            console.error("Erro ao verificar permissões:", e);
            if (mounted) setIsAdmin(false);
          }
        }
      } catch (error) {
        console.error("Erro na inicialização do Auth:", error);
      } finally {
        // ESSENCIAL: Garante que o estado de "Loading" saia da tela
        if (mounted) setLoading(false);
      }
    }

    // Listener para mudanças de estado (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!mounted) return;
        
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          const { data } = await supabase.rpc("has_role", {
            _user_id: currentSession.user.id,
            _role: "admin",
          });
          if (mounted) setIsAdmin(!!data);
        } else {
          if (mounted) setIsAdmin(false);
        }
        
        // Se o evento disparar antes do initialize, também encerramos o loading aqui
        if (mounted) setLoading(false);
      }
    );

    initialize();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, session, loading, isAdmin, signOut };
}