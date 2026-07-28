import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import logoMdr from "@/assets/logo-mdr.png";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const { signIn, signInWithMicrosoft } = useAuth();

  // Login oficial = SÓ Entra ID (Microsoft). O form de senha fica ESCONDIDO e
  // só aparece com /login?senha — porta de emergência (SSO fora do ar).
  // LOCALHOST: o SSO é impossível (cookie do oauth2-proxy é .dunatecnologia.com
  // e o rd cai no painel REAL) → esconde o Microsoft e mostra a senha direto.
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const senhaHabilitada = isLocal || new URLSearchParams(window.location.search).has("senha");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) {
      toast.error("Usuário ou senha inválidos. Tente novamente.");
    } else {
      window.location.href = "/";
    }
    setLoading(false);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, hsl(220 74% 10%) 0%, hsl(220 74% 16%) 55%, hsl(217 80% 26%) 100%)" }}
    >
      <Card className="w-full max-w-md border-0 shadow-2xl backdrop-blur-xl">
        <CardContent className="pt-8 pb-8 px-8">
          <div className="flex flex-col items-center mb-8">
            {/* logo adaptativa: preta no claro, branca no modo noturno */}
            <img src={logoMdr} alt="MDR Logo" className="logo-mdr-auto h-16 mb-4" />
            <h1 className="painel-wordmark font-heading text-xl font-bold">
              Painel Financeiro
            </h1>
            <p className="text-[10px] tracking-[0.2em] text-muted-foreground mt-1 uppercase">
              MDR Advocacia · powered by Duna.Tech
            </p>
          </div>

          <div className="space-y-4">
            {!isLocal && (
              <>
                <Button type="button" className="w-full glass-button border-0 h-11" onClick={signInWithMicrosoft}>
                  <svg width="16" height="16" viewBox="0 0 21 21" className="mr-2" aria-hidden="true">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                  </svg>
                  Entrar com Microsoft
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Use a sua conta corporativa <b>@mdradvocacia.com</b>.
                </p>
              </>
            )}

            {senhaHabilitada && (
              <form onSubmit={handleLogin} className={`space-y-4 ${isLocal ? "" : "border-t pt-4"}`}>
                <p className="text-center text-[10px] uppercase tracking-wider text-muted-foreground">
                  {isLocal ? "Ambiente local — login por senha" : "Acesso de emergência (senha)"}
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
                <Button type="submit" variant="outline" className="w-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar com senha"}
                </Button>
              </form>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
