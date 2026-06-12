import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, ArrowLeft, RefreshCw, Check, X, Loader2, ExternalLink, Crown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { API_URL, ADMIN_URL, authHeaders, useAuth } from "@/hooks/useAuth";

interface AdminUser {
  id: number;
  email: string;
  username: string;
  nome: string;
  is_active: boolean;
  is_staff: boolean;
  last_login: string | null;
  date_joined: string | null;
}

const fmtData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function UserManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/users/`, { headers: authHeaders() });
      if (!res.ok) throw new Error(String(res.status));
      setUsers(await res.json());
    } catch {
      toast.error("Não foi possível carregar os usuários.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const patch = async (
    u: AdminUser,
    body: Partial<Pick<AdminUser, "is_active" | "is_staff">>,
    msg: string,
  ) => {
    setSavingId(u.id);
    try {
      const res = await fetch(`${API_URL}/users/${u.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        throw new Error(data.detail || `Erro ${res.status}`);
      }
      const atualizado: AdminUser = await res.json();
      setUsers((prev) => prev.map((x) => (x.id === atualizado.id ? atualizado : x)));
      toast.success(msg);
    } catch (e: any) {
      toast.error(e.message || "Falha ao atualizar.");
    } finally {
      setSavingId(null);
    }
  };

  const ehEuMesmo = (u: AdminUser) =>
    !!user && u.email?.toLowerCase() === user.email?.toLowerCase();

  return (
    <div className="min-h-screen bg-secondary p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar ao Painel
          </Button>
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>

        <Card className="border-primary/20 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading">
              <ShieldCheck className="w-5 h-5 text-primary" /> Gestão de Acesso
            </CardTitle>
            <CardDescription>
              Por padrão ninguém tem acesso. Libere apenas quem deve ver o painel.
              Revogar tira o acesso na hora (invalida o token).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="py-12 flex items-center justify-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando usuários...
              </div>
            ) : users.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Nenhum usuário encontrado.
              </p>
            ) : (
              users.map((u) => {
                const eu = ehEuMesmo(u);
                const saving = savingId === u.id;
                return (
                  <div
                    key={u.id}
                    className="flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-lg border border-border bg-card"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{u.nome}</span>
                        {u.is_staff && (
                          <Badge className="bg-primary/15 text-primary hover:bg-primary/15 gap-1">
                            <Crown className="w-3 h-3" /> Admin
                          </Badge>
                        )}
                        {u.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Liberado</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Sem acesso</Badge>
                        )}
                        {eu && <Badge variant="outline">você</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      <p className="text-[11px] text-muted-foreground/70">
                        Último acesso: {fmtData(u.last_login)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {u.is_active ? (
                        <Button
                          size="sm" variant="outline"
                          disabled={saving || eu}
                          title={eu ? "Você não pode revogar o próprio acesso" : ""}
                          onClick={() => patch(u, { is_active: false }, `Acesso de ${u.nome} revogado.`)}
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><X className="w-4 h-4 mr-1" /> Revogar</>}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={saving}
                          onClick={() => patch(u, { is_active: true }, `${u.nome} liberado.`)}
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" /> Liberar</>}
                        </Button>
                      )}

                      {u.is_staff ? (
                        <Button
                          size="sm" variant="ghost"
                          disabled={saving || eu}
                          title={eu ? "Você não pode rebaixar a própria conta" : ""}
                          onClick={() => patch(u, { is_staff: false }, `${u.nome} não é mais admin.`)}
                        >
                          Remover admin
                        </Button>
                      ) : (
                        <Button
                          size="sm" variant="ghost"
                          disabled={saving}
                          onClick={() => patch(u, { is_staff: true, is_active: true }, `${u.nome} agora é admin.`)}
                        >
                          Tornar admin
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <p className="text-center">
          <a
            href={ADMIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Administração avançada (Django)
          </a>
        </p>
      </div>
    </div>
  );
}
