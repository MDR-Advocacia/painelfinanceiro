import { useState, useEffect } from "react";

// Tipagens básicas para substituir as do Supabase
export interface User {
  id: string;
  email: string;
}

export interface Session {
  access_token: string;
}

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
      // Como você está usando o superusuário do Django, podemos cravar como true
      setIsAdmin(true); 
    }
    
    // 2. Desliga o loading imediatamente
    setLoading(false);
  }, []);

  // Nova função para fazer o login bater na nossa API Python
  const signIn = async (username: string, password: string) => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) throw new Error('Credenciais inválidas');

      const data = await res.json();
      
      // Salva o token e o usuário no navegador
      localStorage.setItem('django_token', data.token);
      localStorage.setItem('django_user', JSON.stringify(data.user));
      
      setSession({ access_token: data.token });
      setUser(data.user);
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
  return { user, session, loading, isAdmin, signOut, signIn };
}