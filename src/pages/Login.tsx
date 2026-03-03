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
  const { signIn } = useAuth();

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
    <div className="min-h-screen flex items-center justify-center bg-[hsl(207,59%,15%)] px-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardContent className="pt-8 pb-8 px-8">
          <div className="flex flex-col items-center mb-8">
            <img src={logoMdr} alt="MDR Logo" className="h-16 mb-4" />
            <h1 className="font-heading text-lg font-bold text-foreground">
              Painel Financeiro Jurídico
            </h1>
            <p className="text-xs text-muted-foreground mt-1">MDR Advogados</p>
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
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
              </Button>
              <button
                type="button"
                onClick={() => setMode("recovery")}
                className="w-full text-xs text-primary hover:underline mt-2"
              >
                Esqueci minha senha
              </button>
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