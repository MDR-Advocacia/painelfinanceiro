import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, RefreshCw, LogOut } from "lucide-react";
import logoMdr from "@/assets/logo-mdr.png";
import { API_URL } from "@/hooks/useAuth";

// Tela onde caem os logins NOVOS (via Microsoft) cuja conta ainda não foi
// liberada por um admin. O backend retorna 403 {pending:true} em /api/sso/.
export default function Aguardando() {
  const ssoBase = import.meta.env.VITE_SSO_AUTHORIZE_BASE || "https://auth.dunatecnologia.com";

  // Re-checa o acesso sempre que esta tela abre/recarrega. Se o admin JÁ liberou,
  // o /api/sso/ passa a devolver 200 → guarda o token e entra no painel sozinha.
  // Se ainda está pendente (403), continua aqui. Isso conserta o "verificar" que
  // antes só recarregava /aguardando e ficava preso (a rota não re-checava nada).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/sso/`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data?.token && data?.user) {
            localStorage.setItem("django_token", data.token);
            localStorage.setItem("django_user", JSON.stringify(data.user));
            window.location.href = "/";
          }
        }
      } catch {
        /* sem rede / SSO indisponível — segue na tela de espera */
      }
    })();
  }, []);

  const sair = () => {
    localStorage.removeItem("django_token");
    localStorage.removeItem("django_user");
    // Encerra também a sessão do oauth2-proxy (Microsoft) e volta pro login.
    const rd = `${window.location.origin}/login`;
    window.location.href = `${ssoBase}/oauth2/sign_out?rd=${encodeURIComponent(rd)}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(207,59%,15%)] px-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardContent className="pt-8 pb-8 px-8 flex flex-col items-center text-center">
          <img src={logoMdr} alt="MDR Logo" className="h-14 mb-6" />

          <div className="h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center mb-5">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>

          <h1 className="font-heading text-lg font-bold text-foreground">
            Acesso aguardando liberação
          </h1>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            Sua conta foi criada com o login Microsoft, mas o acesso ao Painel
            Financeiro ainda precisa ser <strong>liberado por um administrador</strong>.
            Assim que liberarem, é só recarregar esta página.
          </p>

          <div className="w-full mt-7 space-y-2">
            <Button className="w-full" onClick={() => window.location.reload()}>
              <RefreshCw className="w-4 h-4 mr-2" /> Já fui liberado — verificar
            </Button>
            <Button variant="ghost" className="w-full" onClick={sair}>
              <LogOut className="w-4 h-4 mr-2" /> Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
