import { useState, useEffect } from "react";

// Tipagens básicas para substituir as do Supabase
export interface User {
  id: string;
  email: string;
}

export interface Session {
  access_token: string;
}

// Puxa o domínio oficial que configuramos no .env
export const API_URL = import.meta.env.VITE_API_URL;
export const ADMIN_URL = import.meta.env.VITE_ADMIN_URL || API_URL?.replace('/api', '/admin');

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // 1. Verifica no cache do navegador se o usuário já logou no Django
    const token = localStorage.getItem('django_token');
    const savedUser = localStorage.getItem('django_user');

    if (token && savedUser) {
      setSession({ access_token: token });
      setUser(JSON.parse(savedUser));
      setIsAdmin(true);
      setLoading(false);
      return;
    }

    // 2. Sem token salvo: tenta o SSO (cookie .dunatecnologia.com, same-origin).
    //    Quem voltou do login Microsoft (ou já tem sessão do portal) entra direto.
    (async () => {
      try {
        const res = await fetch(`${API_URL}/sso/`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data?.token && data?.user) {
            localStorage.setItem('django_token', data.token);
            localStorage.setItem('django_user', JSON.stringify(data.user));
            setSession({ access_token: data.token });
            setUser(data.user);
            setIsAdmin(true);
          }
        }
      } catch {
        // SSO indisponível (ex.: SSO_ENABLED=false) — cai no login por senha.
      }
      setLoading(false);
    })();
  }, []);

  // Inicia o fluxo SSO: vai pro oauth2-proxy (Entra) e volta pra cá com o cookie
  // .dunatecnologia.com. No retorno, o bootstrap acima chama /api/sso/ e loga.
  const signInWithMicrosoft = () => {
    const base = import.meta.env.VITE_SSO_AUTHORIZE_BASE || 'https://auth.dunatecnologia.com';
    const rd = `${window.location.origin}/`;
    window.location.href = `${base}/oauth2/start?rd=${encodeURIComponent(rd)}`;
  };

  // Nova função para fazer o login bater na nossa API Python
  const signIn = async (username: string, password: string) => {
    setLoading(true);
    try {
      if (!API_URL) throw new Error('API_URL não configurada');

      // Autentica via rota oficial do Django (retorna token + user)
      const res = await fetch(`${API_URL}/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) throw new Error('Credenciais inválidas');

      const data = await res.json();
      
      const token = data.token ?? data.access ?? data.access_token;
      const userData = data.user ?? { id: data.user_id, email: username };

      if (!token) throw new Error('Token ausente no login');
      if (!userData?.id) throw new Error('Usuário sem ID válido no login');
      
      // Salva o token e o usuário no navegador
      localStorage.setItem('django_token', token);
      localStorage.setItem('django_user', JSON.stringify(userData));
      
      setSession({ access_token: token });
      setUser(userData);
      setIsAdmin(true);
      
      return { error: null };
    } catch (error: any) {
      console.error("Erro no login:", error);
      return { error };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    // Limpa tudo do navegador e desloga o usuário
    localStorage.removeItem('django_token');
    localStorage.removeItem('django_user');
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    
    // Opcional: recarrega a página para limpar os estados do React
    window.location.reload();
  };

  // Exporta a exata mesma estrutura que o seu frontend já esperava!
  return { user, session, loading, isAdmin, signOut, signIn, signInWithMicrosoft };
}
