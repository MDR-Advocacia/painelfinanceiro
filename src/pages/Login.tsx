import { useState } from "react";
import { useAuth } from "@/hooks/useAuth"; // <-- Importamos o seu novo hook!
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import logoMdr from "@/assets/logo-mdr.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "recovery">("login");
  
  // Puxamos a função signIn da nossa API Django
  const { signIn, signInWithMicrosoft } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Chama o login do Django
    const { error } = await signIn(email, password);
    
    if (error) {
      toast.error("Usuário ou senha inválidos. Tente novamente.");
    } else {
      // O PULO DO GATO: Se não deu erro, joga o usuário para dentro do sistema!
      window.location.href = "/";
    }
    
    setLoading(false);
  };

  const handleRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Informe seu e-mail ou usuário");
      return;
    }
    // Como a infraestrutura agora é interna (Django), a recuperação é feita pelo Admin.
    toast.info("Por favor, solicite a redefinição de senha ao administrador do sistema (MDR).");
    setMode("login");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, hsl(220 74% 10%) 0%, hsl(220 74% 16%) 55%, hsl(217 80% 26%) 100%)" }}
    >
      <Card className="w-full max-w-md border-0 shadow-2xl backdrop-blur-xl">
        <CardContent className="pt-8 pb-8 px-8">
          <div className="flex flex-col items-center mb-8">
            <img src={logoMdr} alt="MDR Logo" className="h-16 mb-4" />
            <h1 className="painel-wordmark font-heading text-xl font-bold">
              Painel Financeiro
            </h1>
            <p className="text-[10px] tracking-[0.2em] text-muted-foreground mt-1 uppercase">
              MDR Advocacia · powered by Duna.Tech
            </p>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Usuário ou E-mail</label>
                <Input
                  type="text" // <-- Mudamos para text para aceitar "admin" ou "seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Seu usuário ou e-mail"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Senha</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full glass-button border-0" disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
              </Button>
              <button
                type="button"
                onClick={() => setMode("recovery")}
                className="w-full text-xs text-primary hover:underline mt-2"
              >
                Esqueci minha senha
              </button>

              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center"><span className="bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground">ou</span></div>
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={signInWithMicrosoft}>
                <svg width="16" height="16" viewBox="0 0 21 21" className="mr-2" aria-hidden="true">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                </svg>
                Entrar com Microsoft
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRecovery} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center mb-2">
                Esqueceu a senha?
              </p>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Usuário ou E-mail</label>
                <Input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Seu usuário ou e-mail"
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                Solicitar Recuperação
              </Button>
              <button
                type="button"
                onClick={() => setMode("login")}
                className="w-full text-xs text-primary hover:underline mt-2"
              >
                Voltar ao login
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}