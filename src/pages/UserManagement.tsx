// Menu do ADM — Usuários & Permissões (RBAC por cargo):
//  1) Gestão de acesso: liberar/revogar, admin, e ATRIBUIR CARGO a cada usuário.
//  2) Cargos & Permissões: tabela cargos × módulos (checkboxes) — a política de
//     visualização é POR CARGO; admin bypassa tudo.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ShieldCheck, ArrowLeft, RefreshCw, Check, X, Loader2, ExternalLink, Crown,
  Plus, Trash2, BadgeCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { API_URL, ADMIN_URL, authHeaders, useAuth } from "@/hooks/useAuth";
import { invalidatePermissionsCache } from "@/hooks/usePermissions";

interface AdminUser {
  id: number;
  email: string;
  username: string;
  nome: string;
  is_active: boolean;
  is_staff: boolean;
  cargo_id: string | null;
  cargo_nome: string | null;
  last_login: string | null;
  date_joined: string | null;
}

type Nivel = "nada" | "ver" | "editar";

interface Cargo {
  id: string;
  nome: string;
  // RBAC v2: níveis por módulo (boolean = legado, true→editar)
  modulos: Record<string, Nivel | boolean>;
}

const nivelDe = (v: Nivel | boolean | undefined): Nivel =>
  v === true || v === "editar" ? "editar" : v === "ver" ? "ver" : "nada";
const PROXIMO_NIVEL: Record<Nivel, Nivel> = { nada: "ver", ver: "editar", editar: "nada" };
const NIVEL_UI: Record<Nivel, { rotulo: string; cls: string; title: string }> = {
  nada:   { rotulo: "—",      cls: "border-muted-foreground/20 text-muted-foreground/50 hover:border-muted-foreground/40", title: "Sem acesso — clique pra dar Visualização" },
  ver:    { rotulo: "Ver",    cls: "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100", title: "Só visualização — clique pra dar Edição" },
  editar: { rotulo: "Editar", cls: "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100", title: "Ver + editar — clique pra remover o acesso" },
};

interface Modulo { key: string; label: string; }

const SEM_CARGO = "__none__";

const fmtData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

export default function UserManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savingCargo, setSavingCargo] = useState<string | null>(null);
  const [novoCargo, setNovoCargo] = useState("");

  const carregar = async () => {
    setLoading(true);
    try {
      const [ru, rc, rm] = await Promise.all([
        fetch(`${API_URL}/users/`, { headers: authHeaders() }),
        fetch(`${API_URL}/cargos/`, { headers: authHeaders() }),
        fetch(`${API_URL}/cargos/modulos/`, { headers: authHeaders() }),
      ]);
      if (!ru.ok || !rc.ok || !rm.ok) throw new Error("http");
      setUsers(await ru.json());
      setCargos(await rc.json());
      setModulos(await rm.json());
    } catch {
      toast.error("Não foi possível carregar usuários/cargos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const patchUser = async (u: AdminUser, body: Record<string, unknown>, msg: string) => {
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
      invalidatePermissionsCache();
      toast.success(msg);
    } catch (e: any) {
      toast.error(e.message || "Falha ao atualizar.");
    } finally {
      setSavingId(null);
    }
  };

  // ── Cargos & Permissões ──
  const toggleModulo = async (cargo: Cargo, key: string) => {
    const novos = { ...cargo.modulos, [key]: PROXIMO_NIVEL[nivelDe(cargo.modulos[key])] };
    setSavingCargo(cargo.id);
    // otimista
    setCargos((prev) => prev.map((c) => (c.id === cargo.id ? { ...c, modulos: novos } : c)));
    try {
      const res = await fetch(`${API_URL}/cargos/${cargo.id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ modulos: novos }),
      });
      if (!res.ok) throw new Error(String(res.status));
      invalidatePermissionsCache();
    } catch {
      // desfaz
      setCargos((prev) => prev.map((c) => (c.id === cargo.id ? cargo : c)));
      toast.error("Falha ao salvar a permissão.");
    } finally {
      setSavingCargo(null);
    }
  };

  const criarCargo = async () => {
    const nome = novoCargo.trim();
    if (!nome) { toast.error("Dê um nome ao cargo."); return; }
    try {
      const res = await fetch(`${API_URL}/cargos/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ nome, modulos: {} }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as any));
        throw new Error(data.nome?.[0] || `Erro ${res.status}`);
      }
      const criado: Cargo = await res.json();
      setCargos((prev) => [...prev, criado].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNovoCargo("");
      toast.success(`Cargo "${nome}" criado — marque os módulos dele.`);
    } catch (e: any) {
      toast.error(e.message || "Falha ao criar cargo.");
    }
  };

  const excluirCargo = async (cargo: Cargo) => {
    const emUso = users.filter((u) => u.cargo_id === cargo.id).length;
    if (!confirm(`Excluir o cargo "${cargo.nome}"?${emUso ? ` ${emUso} usuário(s) ficarão sem cargo.` : ""}`)) return;
    try {
      const res = await fetch(`${API_URL}/cargos/${cargo.id}/`, {
        method: "DELETE", headers: authHeaders(),
      });
      if (!res.ok && res.status !== 204) throw new Error(String(res.status));
      setCargos((prev) => prev.filter((c) => c.id !== cargo.id));
      setUsers((prev) => prev.map((u) => (u.cargo_id === cargo.id ? { ...u, cargo_id: null, cargo_nome: null } : u)));
      invalidatePermissionsCache();
      toast.success(`Cargo "${cargo.nome}" excluído.`);
    } catch {
      toast.error("Falha ao excluir o cargo.");
    }
  };

  const ehEuMesmo = (u: AdminUser) =>
    !!user && u.email?.toLowerCase() === user.email?.toLowerCase();

  return (
    <div className="min-h-screen p-6 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar ao Painel
          </Button>
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>

        {/* ── CARGOS & PERMISSÕES (tabela por módulo) ── */}
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading">
              <BadgeCheck className="h-5 w-5 text-[hsl(var(--dunatech-blue))]" /> Cargos & Permissões
            </CardTitle>
            <CardDescription>
              A política é <b>por cargo</b> e em níveis: <b>Ver</b> = só visualização; <b>Editar</b> = ver +
              alterar. Clique na célula pra alternar (— → Ver → Editar). Admins (coroa) têm tudo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[160px] text-xs">Cargo</TableHead>
                        {modulos.map((m) => (
                          <TableHead key={m.key} className="text-center text-[11px]" title={m.label}>
                            {m.label.split(" (")[0]}
                          </TableHead>
                        ))}
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cargos.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm font-medium">
                            {c.nome}
                            {savingCargo === c.id && <Loader2 className="ml-2 inline h-3 w-3 animate-spin" />}
                            <span className="block text-[10px] text-muted-foreground">
                              {users.filter((u) => u.cargo_id === c.id).length} usuário(s)
                            </span>
                          </TableCell>
                          {modulos.map((m) => {
                            const nv = nivelDe(c.modulos[m.key]);
                            const ui = NIVEL_UI[nv];
                            return (
                              <TableCell key={m.key} className="text-center">
                                <button
                                  type="button"
                                  onClick={() => toggleModulo(c, m.key)}
                                  disabled={savingCargo === c.id}
                                  title={ui.title}
                                  className={`min-w-[52px] rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${ui.cls}`}
                                >
                                  {ui.rotulo}
                                </button>
                              </TableCell>
                            );
                          })}
                          <TableCell>
                            <button
                              onClick={() => excluirCargo(c)}
                              className="rounded p-1 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                              title="Excluir cargo"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    placeholder="Novo cargo (ex.: Coordenador, Controller…)"
                    value={novoCargo}
                    onChange={(e) => setNovoCargo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && criarCargo()}
                    className="h-9 max-w-xs text-sm"
                  />
                  <Button size="sm" onClick={criarCargo} className="glass-button gap-1 border-0">
                    <Plus className="h-4 w-4" /> Criar cargo
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── GESTÃO DE ACESSO (usuários) ── */}
        <Card className="glass-card border-0">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading">
              <ShieldCheck className="h-5 w-5 text-[hsl(var(--dunatech-blue))]" /> Gestão de Acesso
            </CardTitle>
            <CardDescription>
              Por padrão ninguém tem acesso. Libere quem deve ver o painel e atribua o <b>cargo</b> —
              é ele que define os módulos visíveis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando usuários...
              </div>
            ) : users.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
            ) : (
              users.map((u) => {
                const eu = ehEuMesmo(u);
                const saving = savingId === u.id;
                return (
                  <div
                    key={u.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-card/60 p-3 md:flex-row md:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{u.nome}</span>
                        {u.is_staff && (
                          <Badge className="gap-1 bg-primary/15 text-primary hover:bg-primary/15">
                            <Crown className="h-3 w-3" /> Admin
                          </Badge>
                        )}
                        {u.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Liberado</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Sem acesso</Badge>
                        )}
                        {eu && <Badge variant="outline">você</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      <p className="text-[11px] text-muted-foreground/70">Último acesso: {fmtData(u.last_login)}</p>
                    </div>

                    {/* Cargo do usuário (RBAC) */}
                    <div className="shrink-0">
                      <Select
                        value={u.cargo_id ?? SEM_CARGO}
                        onValueChange={(v) =>
                          patchUser(
                            u,
                            { cargo_id: v === SEM_CARGO ? null : v },
                            v === SEM_CARGO
                              ? `${u.nome} ficou sem cargo (sem módulos).`
                              : `Cargo de ${u.nome} atualizado.`,
                          )
                        }
                        disabled={saving}
                      >
                        <SelectTrigger className="h-8 w-[190px] text-xs">
                          <SelectValue placeholder="Sem cargo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SEM_CARGO}>— Sem cargo —</SelectItem>
                          {cargos.map((c) => (
                            <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {u.is_active ? (
                        <Button
                          size="sm" variant="outline"
                          disabled={saving || eu}
                          title={eu ? "Você não pode revogar o próprio acesso" : ""}
                          onClick={() => patchUser(u, { is_active: false }, `Acesso de ${u.nome} revogado.`)}
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><X className="mr-1 h-4 w-4" /> Revogar</>}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={saving}
                          onClick={() => patchUser(u, { is_active: true }, `${u.nome} liberado.`)}
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1 h-4 w-4" /> Liberar</>}
                        </Button>
                      )}

                      {u.is_staff ? (
                        <Button
                          size="sm" variant="ghost"
                          disabled={saving || eu}
                          title={eu ? "Você não pode rebaixar a própria conta" : ""}
                          onClick={() => patchUser(u, { is_staff: false }, `${u.nome} não é mais admin.`)}
                        >
                          Remover admin
                        </Button>
                      ) : (
                        <Button
                          size="sm" variant="ghost"
                          disabled={saving}
                          onClick={() => patchUser(u, { is_staff: true, is_active: true }, `${u.nome} agora é admin.`)}
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
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
          >
            <ExternalLink className="h-3 w-3" /> Administração avançada (Django)
          </a>
        </p>
      </div>
    </div>
  );
}
