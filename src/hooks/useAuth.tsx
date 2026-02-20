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

    // Função para verificar se o utilizador é admin (sem bloquear o loading principal)
    async function checkAdminRole(userId: string) {
      try {
        const { data, error } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: "admin",
        });
        if (error) throw error;
        if (mounted) setIsAdmin(!!data);
      } catch (e) {
        console.error("Erro ao verificar permissões de admin:", e);
        if (mounted) setIsAdmin(false);
      }
    }

    async function initialize() {
      try {
        // 1. Tenta recuperar a sessão (o que o persistSession: true guardou)
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (!mounted) return;

        if (initialSession) {
          setSession(initialSession);
          setUser(initialSession.user);
          // Dispara a verificação de admin mas NÃO espera por ela para desligar o loading
          checkAdminRole(initialSession.user.id);
        }
      } catch (error) {
        console.error("Erro na inicialização do Auth:", error);
      } finally {
        // 2. DESLIGA O LOADING IMEDIATAMENTE após saber se há sessão ou não
        if (mounted) setLoading(false);
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!mounted) return;
        
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          checkAdminRole(currentSession.user.id);
        } else {
          setIsAdmin(false);
        }
        
        // Garante que o loading é desligado em qualquer evento de mudança (login/logout)
        setLoading(false);
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