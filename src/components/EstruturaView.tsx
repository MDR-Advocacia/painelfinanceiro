// ESTRUTURA DE FATURAMENTO — a proposta de reestruturação, na prática.
//
// Quem paga são os clientes: cada um é um CENTRO DE FATURAMENTO, com LINHAS
// onde a receita é individualizável. As EQUIPES (vocabulário do Flow) são
// ALOCADAS nas linhas com % de participação — a receita desce e o custo real
// da folha (DP) sobe pelo mesmo percentual. Quem não fatura vive nos CENTROS
// DE INFRAESTRUTURA. Regra da casa: equipes da mesma linha dividem em partes
// iguais; o % é editável.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Building2, Coins, Equal, Landmark, Loader2, Network, Pencil,
  Plus, Server, Trash2, Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Ajuda } from "@/components/dp/Ajuda";
import { Kpi, PageHeader, SectionTitle } from "@/components/Pagina";
import { usePermissions } from "@/hooks/usePermissions";
import { useApp } from "@/contexts/AppContext";
import { formatCurrency } from "@/utils/calculations";
import EquipesDialog from "@/components/EquipesDialog";
import {
  type EfAlocacao, type EfCentro, type EfEquipe, type EfEstrutura, type EfLinha,
  EF_EVENTOS, abrirDetalheCentro, abrirDetalheEquipe, avisarEstruturaMudou, estruturaApi,
} from "@/services/estrutura";

const AREA_UI: Record<string, { rotulo: string; cls: string }> = {
  passivo: { rotulo: "Contencioso Passivo", cls: "bg-[hsl(var(--dunatech-blue))]/10 text-[hsl(var(--dunatech-blue))] border-[hsl(var(--dunatech-blue))]/30" },
  credito: { rotulo: "Recuperação de Crédito", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  especializada: { rotulo: "Especializada", cls: "bg-violet-500/10 text-violet-600 border-violet-500/30" },
};

export function EstruturaView() {
  const { setView } = useApp();
  const { podeEditar } = usePermissions();
  const editar = podeEditar("estrutura");
  const [dados, setDados] = useState<EfEstrutura | null>(null);
  const [equipes, setEquipes] = useState<EfEquipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [gerindoEquipes, setGerindoEquipes] = useState(false);
  const [novoCentro, setNovoCentro] = useState<"faturamento" | "infraestrutura" | null>(null);
  const [sedes, setSedes] = useState<{ id: string; nome: string }[]>([]);
  useEffect(() => { estruturaApi.sedes().then(setSedes).catch(() => undefined); }, []);

  const carregar = useCallback(() => {
    estruturaApi.carregar()
      .then(setDados)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    estruturaApi.equipes().then(setEquipes).catch(() => undefined);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // mutação em qualquer lugar (inclusive no gerenciador) → recarrega e avisa a sidebar
  const mudou = useCallback(() => { carregar(); avisarEstruturaMudou(); }, [carregar]);

  // a sidebar pede foco num centro ou abre o gerenciador de equipes
  useEffect(() => {
    const focar = (ev: Event) => {
      const id = (ev as CustomEvent).detail?.centroId;
      if (!id) return;
      setTimeout(() => {
        const el = document.getElementById(`centro-${id}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
        el?.classList.add("ring-2", "ring-[hsl(var(--dunatech-blue))]");
        setTimeout(() => el?.classList.remove("ring-2", "ring-[hsl(var(--dunatech-blue))]"), 1800);
      }, 150);
    };
    const abrirEq = () => setGerindoEquipes(true);
    window.addEventListener(EF_EVENTOS.foco, focar);
    window.addEventListener(EF_EVENTOS.equipes, abrirEq);
    return () => {
      window.removeEventListener(EF_EVENTOS.foco, focar);
      window.removeEventListener(EF_EVENTOS.equipes, abrirEq);
    };
  }, []);

  const resumo = useMemo(() => {
    if (!dados) return null;
    const receita = dados.centros.reduce((a, c) => a + c.receita_total, 0);
    const custo = dados.centros.reduce((a, c) => a + c.custo_total, 0)
      + dados.infraestrutura.reduce((a, c) => a + c.custo_total, 0);
    const linhas = dados.centros.flatMap((c) => c.linhas);
    const desbalanceadas = linhas.filter((l) => l.alocacoes.length > 0 && Math.abs(l.soma_percentual - 100) > 0.5);
    return { receita, custo, linhas: linhas.length, desbalanceadas };
  }, [dados]);

  if (loading || !dados || !resumo) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const [anoR, mesR] = (dados.periodo ?? "—").split("-");

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="Proposta de reestruturação"
        titulo="Estrutura de Faturamento"
        icone={<Network className="h-4.5 w-4.5" />}
        acoes={<Button size="sm" variant="outline" className="gap-1" onClick={() => setGerindoEquipes(true)}>
          <Users className="h-4 w-4" /> Equipes
        </Button>}
        descricao={<>
          Receita de <b>{mesR}/{anoR}</b>
          {dados.competencia_custo && <> · custo de pessoal da folha de <b>{dados.competencia_custo}</b>
            {dados.custo_parcial && <span className="text-warning"> (competência ainda aberta — número parcial)</span>}
          </>}
        </>}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi icone={Coins} rotulo="Receita mapeada" valor={formatCurrency(resumo.receita)} />
        <Kpi icone={Users} rotulo="Custo de pessoal alocado" valor={formatCurrency(resumo.custo)} tom="negativo" corValor="text-destructive" />
        <Kpi icone={Network} rotulo="Linhas de faturamento" valor={String(resumo.linhas)} />
        <Kpi icone={AlertTriangle} rotulo="Linhas fora de 100%" valor={String(resumo.desbalanceadas.length)}
             tom={resumo.desbalanceadas.length ? "atencao" : "positivo"}
             corValor={resumo.desbalanceadas.length ? "text-warning" : "text-success"} />
      </div>

      {/* ── Por sede ── */}
      {dados.por_sede?.length > 0 && (
        <div className="space-y-4">
          <SectionTitle eyebrow="Onde é operado" titulo="Por sede"
                        acoes={<Ajuda titulo="Rateio por sede"
                                      texto="A sede vem da área da linha: Recuperação de Crédito é Manhattan, Contencioso Passivo é Capim Macio (dá pra mudar linha a linha). O custo dos centros de infraestrutura é dividido entre as sedes pelo rateio configurado." />} />
          <div className="grid gap-4 md:grid-cols-2">
            {dados.por_sede.map((s) => {
              const pct = s.receita > 0 ? (s.margem / s.receita) * 100 : null;
              return (
                <Card key={s.id} className="glass-card border-0">
                  <CardContent className="pt-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="flex items-center gap-2 font-heading text-base font-bold">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--dunatech-blue))]/10">
                          <Building2 className="h-4 w-4 text-[hsl(var(--dunatech-blue))]" />
                        </span>
                        {s.nome}
                      </h3>
                      <span className="font-mono-numbers text-sm font-bold">{formatCurrency(s.receita)}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <div className="font-mono-numbers text-xs font-semibold text-destructive">
                          {formatCurrency(s.custo_operacional)}
                        </div>
                        <div className="eyebrow mt-0.5 text-[0.55rem]">Custo operacional</div>
                      </div>
                      <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                        <div className="font-mono-numbers text-xs font-semibold text-destructive">
                          {formatCurrency(s.custo_infra)}
                        </div>
                        <div className="eyebrow mt-0.5 text-[0.55rem]">Infra rateada</div>
                      </div>
                      <div className="rounded-lg bg-success/10 px-2 py-1.5">
                        <div className="font-mono-numbers text-xs font-semibold text-success">
                          {formatCurrency(s.margem)}
                        </div>
                        <div className="eyebrow mt-0.5 text-[0.55rem]">
                          Margem{pct != null ? ` · ${pct.toFixed(1)}%` : ""}
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 text-[0.65rem] text-muted-foreground">
                      {s.linhas} linha(s) de faturamento · {s.equipes} equipe(s)
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Centros de faturamento ── */}
      <div className="space-y-4">
        <SectionTitle eyebrow="Quem paga" titulo="Centros de faturamento"
                      acoes={<>
                        {editar && (
                          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                                  onClick={() => setNovoCentro("faturamento")}>
                            <Plus className="h-3.5 w-3.5" /> Novo centro
                          </Button>
                        )}
                        <Ajuda titulo="Centros e linhas"
                                    texto="Cada cliente é um centro de faturamento. Dentro dele, cada receita individualizável é uma linha — e as equipes são alocadas na linha com um percentual de participação." />
                      </>} />
        <div className="grid gap-4 xl:grid-cols-2">
          {dados.centros.map((c) => (
            <CentroCard key={c.id} centro={c} equipes={equipes} editar={editar} onMudou={mudou}
                        aoAbrirDetalhe={setView} sedes={sedes} />
          ))}
        </div>
      </div>

      {/* ── Infraestrutura ── */}
      <div className="space-y-4">
        <SectionTitle eyebrow="Quem sustenta" titulo="Centros de infraestrutura"
                      acoes={<>
                        {editar && (
                          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                                  onClick={() => setNovoCentro("infraestrutura")}>
                            <Plus className="h-3.5 w-3.5" /> Novo centro
                          </Button>
                        )}
                        <Ajuda titulo="Infraestrutura"
                               texto="Setores que não faturam: o custo deles é rateado entre as carteiras (é o que alimenta o VPD). Também recebem equipes." />
                      </>} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dados.infraestrutura.map((c) => (
            <InfraCard key={c.id} centro={c} equipes={equipes} editar={editar} onMudou={mudou}
                       aoAbrirDetalhe={setView} sedes={sedes} />
          ))}
        </div>
      </div>

      {gerindoEquipes && (
        <EquipesDialog editar={editar} onClose={() => { setGerindoEquipes(false); mudou(); }} />
      )}
      {novoCentro && (
        <NovoCentroDialog tipo={novoCentro} onClose={() => setNovoCentro(null)}
                          onCriou={() => { setNovoCentro(null); mudou(); }} />
      )}

      {dados.sem_alocacao.length > 0 && (
        <Card className="glass-card border-0 border-l-2 border-l-warning">
          <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="font-medium">Equipes ainda sem alocação:</span>
            {dados.sem_alocacao.map((e) => (
              <Badge key={e.id} variant="outline" className="text-xs">{e.equipe}</Badge>
            ))}
            <span className="text-xs text-muted-foreground">— aloque numa linha ou centro para o custo delas aparecer.</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────── centro de faturamento ─────────────────────── */

function CentroCard({ centro, equipes, editar, onMudou, aoAbrirDetalhe, sedes }: {
  centro: EfCentro; equipes: EfEquipe[]; editar: boolean; onMudou: () => void;
  aoAbrirDetalhe: (v: any) => void; sedes: { id: string; nome: string }[];
}) {
  const margem = centro.receita_total - centro.custo_total;
  const [novaLinha, setNovaLinha] = useState(false);
  return (
    <Card id={`centro-${centro.id}`} className="glass-card scroll-mt-6 border-0 transition-shadow">
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="group flex items-center gap-2 font-heading text-base font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--dunatech-blue))]/10">
              <Landmark className="h-4 w-4 text-[hsl(var(--dunatech-blue))]" />
            </span>
            <button onClick={() => abrirDetalheCentro(centro.id, aoAbrirDetalhe)}
                    title="Abrir a página deste centro"
                    className="transition-colors hover:text-[hsl(var(--dunatech-blue))] hover:underline">
              {centro.nome}
            </button>
            {editar && (
              <span className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <BotaoRenomear atual={centro.nome}
                               onSalvar={(nome) => estruturaApi.renomearCentro(centro.id, nome)
                                 .then(() => { toast.success("Centro renomeado."); onMudou(); })
                                 .catch((e) => toast.error(e.message))} />
                <button title="Excluir centro (só vazio)"
                        onClick={() => window.confirm(`Excluir o centro ${centro.nome}?`)
                          && estruturaApi.excluirCentro(centro.id)
                            .then(() => { toast.success("Centro excluído."); onMudou(); })
                            .catch((e) => toast.error(e.message))}
                        className="rounded p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </h3>
          <div className="text-right">
            {centro.sedes?.length > 0 && (
              <div className="mb-0.5 flex justify-end gap-1">
                {centro.sedes.map((s) => (
                  <span key={s.sede_id} className="rounded-full bg-muted/70 px-1.5 py-0.5 text-[0.58rem] font-medium text-muted-foreground">
                    {s.sede}
                  </span>
                ))}
              </div>
            )}
            <div className="font-mono-numbers text-sm font-bold">{formatCurrency(centro.receita_total)}</div>
            <div className="text-[0.65rem] text-muted-foreground">
              custo {formatCurrency(centro.custo_total)} ·{" "}
              <span className={margem >= 0 ? "text-success" : "text-destructive"}>
                {centro.receita_total > 0 ? `${((margem / centro.receita_total) * 100).toFixed(1)}%` : "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {centro.linhas.map((l) => (
            <LinhaBloco key={l.id} linha={l} equipes={equipes} editar={editar} onMudou={onMudou}
                        aoAbrirDetalhe={aoAbrirDetalhe} sedes={sedes} />
          ))}
          {editar && (novaLinha ? (
            <NovaLinhaInline centroId={centro.id}
                             onFechar={() => setNovaLinha(false)}
                             onCriou={() => { setNovaLinha(false); onMudou(); }} />
          ) : (
            <button onClick={() => setNovaLinha(true)}
                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-muted-foreground/30 py-1.5 text-xs text-muted-foreground transition-colors hover:border-[hsl(var(--dunatech-blue))] hover:text-[hsl(var(--dunatech-blue))]">
              <Plus className="h-3.5 w-3.5" /> nova linha de faturamento
            </button>
          ))}

          {/* equipes alocadas DIRETO no centro (atendem o cliente sem linha própria) */}
          {(centro.alocacoes.length > 0 || editar) && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 px-2.5 py-2">
              <span className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Equipes do centro
              </span>
              {centro.alocacoes.map((a) => (
                <AlocacaoChip key={a.id} a={a} editar={editar} onMudou={onMudou} aoAbrirDetalhe={aoAbrirDetalhe} />
              ))}
              {editar && <AdicionarEquipeCentro centro={centro} equipes={equipes} onMudou={onMudou} />}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Chip da sede da linha — clique troca a sede (regra: crédito=Manhattan,
    passivo=Capim Macio, mas a exceção é permitida). */
function SedeChip({ linha, sedes, editar, onMudou }: {
  linha: EfLinha; sedes: { id: string; nome: string }[]; editar: boolean; onMudou: () => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  if (editar && abrindo) {
    return (
      <Select defaultValue={linha.sede_id ?? ""}
              onValueChange={(v) => {
                estruturaApi.definirSedeLinha(linha.id, v || null)
                  .then(() => { toast.success("Sede atualizada."); onMudou(); })
                  .catch((e) => toast.error(e.message))
                  .finally(() => setAbrindo(false));
              }}>
        <SelectTrigger className="h-5 w-[140px] text-[0.65rem]" autoFocus><SelectValue /></SelectTrigger>
        <SelectContent>
          {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  return (
    <button disabled={!editar} onClick={() => setAbrindo(true)}
            title={editar ? "Trocar a sede desta linha" : undefined}
            className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium ${
              linha.sede
                ? "bg-muted/70 text-muted-foreground"
                : "bg-warning/15 text-warning"
            } ${editar ? "hover:bg-muted" : ""}`}>
      <Building2 className="h-2.5 w-2.5" />
      {linha.sede ?? "sem sede"}
    </button>
  );
}

/** Rateio do custo de um centro de infraestrutura entre as sedes. */
function RateioSedes({ centro, editar, onMudou }: {
  centro: EfCentro; editar: boolean; onMudou: () => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  if (!centro.sedes?.length) return null;
  const soma = centro.sedes.reduce(
    (a, s) => a + Number(valores[s.sede_id] ?? s.percentual ?? 0), 0);
  const fora = Math.abs(soma - 100) > 0.5;

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted/30 px-2 py-1.5">
      <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted-foreground">
        Rateio por sede
      </span>
      {centro.sedes.map((s) => (
        <span key={s.sede_id} className="flex items-center gap-1 rounded-full border bg-card px-1.5 py-0.5 text-[0.65rem]">
          {s.sede}
          {editar ? (
            <Input value={valores[s.sede_id] ?? String(s.percentual ?? 0)}
                   onChange={(e) => setValores((v) => ({ ...v, [s.sede_id]: e.target.value }))}
                   onBlur={() => {
                     const rateio = centro.sedes.map((x) => ({
                       sede_id: x.sede_id,
                       percentual: Number(valores[x.sede_id] ?? x.percentual ?? 0),
                     }));
                     if (Math.abs(rateio.reduce((a, r) => a + r.percentual, 0) - 100) > 0.5) return;
                     estruturaApi.definirRateioSedes(centro.id, rateio)
                       .then(() => { toast.success("Rateio atualizado."); onMudou(); })
                       .catch((e) => toast.error(e.message));
                   }}
                   className="h-4 w-10 border-0 bg-transparent p-0 text-center font-mono text-[0.65rem]" />
          ) : (
            <b className="font-mono">{s.percentual}</b>
          )}
          <span className="text-muted-foreground">%</span>
        </span>
      ))}
      {fora && <span className="text-[0.6rem] font-semibold text-warning">soma {soma.toFixed(0)}%</span>}
    </div>
  );
}

/** Adicionar equipe direto no centro (sem linha específica). */
function AdicionarEquipeCentro({ centro, equipes, onMudou }: {
  centro: EfCentro; equipes: EfEquipe[]; onMudou: () => void;
}) {
  const [adicionando, setAdicionando] = useState(false);
  const jaAlocadas = new Set(centro.alocacoes.map((a) => a.equipe_id));
  if (!adicionando) {
    return (
      <button onClick={() => setAdicionando(true)} title="Alocar equipe direto no centro"
              className="flex h-6 items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-2 text-[0.65rem] text-muted-foreground transition-colors hover:border-[hsl(var(--dunatech-blue))] hover:text-[hsl(var(--dunatech-blue))]">
        <Plus className="h-3 w-3" /> equipe
      </button>
    );
  }
  return (
    <Select onValueChange={(equipeId) => {
      estruturaApi.alocar({ centro_id: centro.id }, equipeId)
        .then(() => { toast.success("Equipe alocada no centro."); onMudou(); })
        .catch((e) => toast.error(e.message))
        .finally(() => setAdicionando(false));
    }}>
      <SelectTrigger className="h-6 w-[190px] text-xs" autoFocus>
        <SelectValue placeholder="Escolher equipe…" />
      </SelectTrigger>
      <SelectContent>
        {equipes.filter((e) => !jaAlocadas.has(e.id)).map((e) => (
          <SelectItem key={e.id} value={e.id}>{e.nome ?? e.equipe}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Lápis que abre edição de nome em linha (Enter salva, Esc cancela). */
function BotaoRenomear({ atual, onSalvar }: { atual: string; onSalvar: (nome: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(atual);
  if (editando) {
    return (
      <Input autoFocus value={valor} onChange={(e) => setValor(e.target.value)}
             onKeyDown={(e) => {
               if (e.key === "Enter" && valor.trim()) { onSalvar(valor.trim()); setEditando(false); }
               if (e.key === "Escape") setEditando(false);
             }}
             onBlur={() => setEditando(false)}
             className="h-6 w-44 text-sm font-normal" />
    );
  }
  return (
    <button title="Renomear" onClick={() => { setValor(atual); setEditando(true); }}
            className="rounded p-1 text-muted-foreground/50 hover:bg-muted hover:text-foreground">
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );
}

/** Formulário compacto de nova linha, dentro do card do centro. */
function NovaLinhaInline({ centroId, onFechar, onCriou }: {
  centroId: string; onFechar: () => void; onCriou: () => void;
}) {
  const [nome, setNome] = useState("");
  const [area, setArea] = useState("passivo");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[hsl(var(--dunatech-blue))]/40 bg-[hsl(var(--dunatech-blue))]/5 p-2">
      <Input autoFocus placeholder="Nome da linha…" value={nome}
             onChange={(e) => setNome(e.target.value)} className="h-7 w-48 text-xs" />
      <Select value={area} onValueChange={setArea}>
        <SelectTrigger className="h-7 w-[180px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="passivo">Contencioso Passivo</SelectItem>
          <SelectItem value="credito">Recuperação de Crédito</SelectItem>
          <SelectItem value="especializada">Especializada</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" className="glass-button h-7 border-0 text-xs"
              onClick={() => {
                if (!nome.trim()) { toast.error("Informe o nome da linha."); return; }
                estruturaApi.criarLinha(centroId, nome.trim(), area)
                  .then(() => { toast.success("Linha criada."); onCriou(); })
                  .catch((e) => toast.error(e.message));
              }}>
        Criar
      </Button>
      <button onClick={onFechar} className="text-xs text-muted-foreground hover:text-foreground">cancelar</button>
    </div>
  );
}

/** Diálogo de novo centro (faturamento ou infraestrutura). */
function NovoCentroDialog({ tipo, onClose, onCriou }: {
  tipo: "faturamento" | "infraestrutura"; onClose: () => void; onCriou: () => void;
}) {
  const [nome, setNome] = useState("");
  const criar = () => {
    if (!nome.trim()) { toast.error("Informe o nome."); return; }
    estruturaApi.criarCentro(nome.trim(), tipo)
      .then(() => { toast.success("Centro criado."); onCriou(); })
      .catch((e) => toast.error(e.message));
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">
            {tipo === "faturamento" ? "Novo centro de faturamento" : "Novo centro de infraestrutura"}
          </DialogTitle>
          <DialogDescription>
            {tipo === "faturamento"
              ? "Um cliente novo — as linhas de faturamento e as equipes entram depois, dentro dele."
              : "Um agrupador de setores que não faturam (o custo vai pro rateio)."}
          </DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder={tipo === "faturamento" ? "Ex.: Caixa Econômica" : "Ex.: Jurídico Interno"}
               value={nome} onChange={(e) => setNome(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && criar()} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="glass-button border-0" onClick={criar}>Criar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LinhaBloco({ linha, equipes, editar, onMudou, aoAbrirDetalhe, sedes }: {
  linha: EfLinha; equipes: EfEquipe[]; editar: boolean; onMudou: () => void;
  aoAbrirDetalhe: (v: any) => void; sedes: { id: string; nome: string }[];
}) {
  const area = AREA_UI[linha.area];
  const fora = linha.alocacoes.length > 0 && Math.abs(linha.soma_percentual - 100) > 0.5;
  const [adicionando, setAdicionando] = useState(false);
  const jaAlocadas = new Set(linha.alocacoes.map((a) => a.equipe_id));

  return (
    <div className={`group/linha rounded-lg border p-2.5 ${fora ? "border-warning/60 bg-warning/5" : "bg-card/50"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={`text-[0.6rem] ${area.cls}`}>{area.rotulo}</Badge>
        <span className="text-sm font-semibold">{linha.nome}</span>
        <SedeChip linha={linha} sedes={sedes} editar={editar} onMudou={onMudou} />
        {editar && (
          <span className="flex gap-0.5 opacity-0 transition-opacity group-hover/linha:opacity-100">
            <BotaoRenomear atual={linha.nome}
                           onSalvar={(nome) => estruturaApi.editarLinha(linha.id, { nome })
                             .then(() => { toast.success("Linha renomeada."); onMudou(); })
                             .catch((e) => toast.error(e.message))} />
            <button title="Excluir linha (só sem receita lançada)"
                    onClick={() => window.confirm(`Excluir a linha ${linha.nome}?`)
                      && estruturaApi.excluirLinha(linha.id)
                        .then(() => { toast.success("Linha excluída."); onMudou(); })
                        .catch((e) => toast.error(e.message))}
                    className="rounded p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        )}
        <span className="ml-auto font-mono-numbers text-sm font-bold">
          {formatCurrency(linha.receita_bruta)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {linha.alocacoes.map((a) => (
          <AlocacaoChip key={a.id} a={a} editar={editar} onMudou={onMudou} aoAbrirDetalhe={aoAbrirDetalhe} />
        ))}
        {linha.alocacoes.length === 0 && (
          <span className="text-xs italic text-muted-foreground">nenhuma equipe alocada</span>
        )}

        {editar && (
          adicionando ? (
            <Select onValueChange={(equipeId) => {
              estruturaApi.alocar({ linha_id: linha.id }, equipeId)
                .then(() => { toast.success("Equipe alocada — percentuais redivididos por igual."); onMudou(); })
                .catch((e) => toast.error(e.message))
                .finally(() => setAdicionando(false));
            }}>
              <SelectTrigger className="h-6 w-[190px] text-xs" autoFocus>
                <SelectValue placeholder="Escolher equipe…" />
              </SelectTrigger>
              <SelectContent>
                {equipes.filter((e) => !jaAlocadas.has(e.id)).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome ?? e.equipe}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <button onClick={() => setAdicionando(true)} title="Alocar equipe nesta linha"
                    className="flex h-6 items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-2 text-[0.65rem] text-muted-foreground transition-colors hover:border-[hsl(var(--dunatech-blue))] hover:text-[hsl(var(--dunatech-blue))]">
              <Plus className="h-3 w-3" /> equipe
            </button>
          )
        )}

        {editar && linha.alocacoes.length > 1 && (
          <button title="Redividir em percentuais iguais (regra da casa)"
                  onClick={() => estruturaApi.igualar(linha.id)
                    .then(() => { toast.success("Percentuais igualados."); onMudou(); })
                    .catch((e) => toast.error(e.message))}
                  className="flex h-6 items-center gap-1 rounded-full border border-muted-foreground/25 px-2 text-[0.65rem] text-muted-foreground transition-colors hover:border-[hsl(var(--dunatech-blue))] hover:text-[hsl(var(--dunatech-blue))]">
            <Equal className="h-3 w-3" /> igualar
          </button>
        )}

        {fora && (
          <span className="flex items-center gap-1 text-[0.65rem] font-semibold text-warning">
            <AlertTriangle className="h-3 w-3" /> soma {linha.soma_percentual}%
          </span>
        )}
      </div>
    </div>
  );
}

/** Chip da equipe na linha: nome · % (editável) · custo rateado. */
function AlocacaoChip({ a, editar, onMudou, aoAbrirDetalhe }: {
  a: EfAlocacao; editar: boolean; onMudou: () => void; aoAbrirDetalhe: (v: any) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(a.percentual));

  const salvar = () => {
    const n = Number(valor.replace(",", "."));
    if (Number.isNaN(n)) { setEditando(false); return; }
    estruturaApi.editarPercentual(a.id, n)
      .then(() => { toast.success(`${a.equipe}: ${n}%`); onMudou(); })
      .catch((e) => toast.error(e.message))
      .finally(() => setEditando(false));
  };

  return (
    <span className="group flex h-6 items-center gap-1 rounded-full border border-[hsl(var(--dunatech-blue))]/30 bg-[hsl(var(--dunatech-blue))]/8 pl-2 pr-1 text-[0.7rem]"
          title={a.custo_total != null
            ? `${a.equipe} — ${a.pessoas} pessoa(s) no CC "${a.centro_custo}" · custo rateado ${formatCurrency(a.custo_total)}`
            : `${a.equipe} — sem centro de custo do DP vinculado ainda`}>
      <button onClick={() => abrirDetalheEquipe(a.equipe_id, aoAbrirDetalhe)}
              title={`Abrir a página da equipe ${a.equipe}`}
              className="font-medium transition-colors hover:text-[hsl(var(--dunatech-blue))] hover:underline">
        {a.equipe}
      </button>
      {editando ? (
        <Input autoFocus value={valor} onChange={(e) => setValor(e.target.value)}
               onBlur={salvar} onKeyDown={(e) => e.key === "Enter" && salvar()}
               className="h-5 w-12 border-0 bg-transparent p-0 text-center font-mono text-[0.7rem]" />
      ) : (
        <button disabled={!editar} onClick={() => { setValor(String(a.percentual)); setEditando(true); }}
                title={editar ? "Editar percentual de participação" : undefined}
                className={`rounded-full bg-[hsl(var(--dunatech-blue))]/15 px-1.5 font-mono font-semibold text-[hsl(var(--dunatech-blue))] ${editar ? "hover:bg-[hsl(var(--dunatech-blue))]/30" : ""}`}>
          {a.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
        </button>
      )}
      {a.custo_total != null && (
        <span className="hidden font-mono-numbers text-[0.62rem] text-muted-foreground sm:inline">
          {formatCurrency(a.custo_total)}
        </span>
      )}
      {editar && (
        <button onClick={() => estruturaApi.remover(a.id)
                  .then(() => { toast.success("Alocação removida."); onMudou(); })
                  .catch((e) => toast.error(e.message))}
                title="Remover equipe da linha"
                className="hidden rounded-full p-0.5 text-muted-foreground/50 hover:bg-destructive/15 hover:text-destructive group-hover:inline-flex">
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/* ─────────────────────── centro de infraestrutura ─────────────────────── */

function InfraCard({ centro, equipes, editar, onMudou, aoAbrirDetalhe, sedes }: {
  centro: EfCentro; equipes: EfEquipe[]; editar: boolean; onMudou: () => void;
  aoAbrirDetalhe: (v: any) => void; sedes: { id: string; nome: string }[];
}) {
  const [adicionando, setAdicionando] = useState(false);
  const [novaLinha, setNovaLinha] = useState(false);
  const jaAlocadas = new Set(centro.alocacoes.map((a) => a.equipe_id));
  return (
    <Card className="glass-card border-0">
      <CardContent className="space-y-2 pt-5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="flex items-center gap-2 font-heading text-sm font-bold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/70">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <button onClick={() => abrirDetalheCentro(centro.id, aoAbrirDetalhe)}
                    title="Abrir a página deste centro"
                    className="transition-colors hover:text-[hsl(var(--dunatech-blue))] hover:underline">
              {centro.nome}
            </button>
          </h3>
          <span className="font-mono-numbers text-xs font-semibold text-muted-foreground">
            {formatCurrency(centro.custo_total)}
          </span>
        </div>
        {/* linhas de infraestrutura (subdivisões internas do centro) */}
        {centro.linhas.length > 0 && (
          <div className="space-y-2">
            {centro.linhas.map((l) => (
              <LinhaBloco key={l.id} linha={l} equipes={equipes} editar={editar} onMudou={onMudou}
                          aoAbrirDetalhe={aoAbrirDetalhe} sedes={sedes} />
            ))}
          </div>
        )}
        {editar && (novaLinha ? (
          <NovaLinhaInline centroId={centro.id}
                           onFechar={() => setNovaLinha(false)}
                           onCriou={() => { setNovaLinha(false); onMudou(); }} />
        ) : (
          <button onClick={() => setNovaLinha(true)}
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-muted-foreground/30 py-1 text-[0.65rem] text-muted-foreground transition-colors hover:border-[hsl(var(--dunatech-blue))] hover:text-[hsl(var(--dunatech-blue))]">
            <Plus className="h-3 w-3" /> linha de infraestrutura
          </button>
        ))}
        {/* rateio do custo entre as sedes */}
        <RateioSedes centro={centro} editar={editar} onMudou={onMudou} />

        <div className="flex flex-wrap items-center gap-1.5">
          {centro.alocacoes.map((a) => (
            <AlocacaoChip key={a.id} a={a} editar={editar} onMudou={onMudou} aoAbrirDetalhe={aoAbrirDetalhe} />
          ))}
          {editar && (
            adicionando ? (
              <Select onValueChange={(equipeId) => {
                estruturaApi.alocar({ centro_id: centro.id }, equipeId)
                  .then(() => { toast.success("Equipe alocada."); onMudou(); })
                  .catch((e) => toast.error(e.message))
                  .finally(() => setAdicionando(false));
              }}>
                <SelectTrigger className="h-6 w-[190px] text-xs" autoFocus>
                  <SelectValue placeholder="Escolher equipe…" />
                </SelectTrigger>
                <SelectContent>
                  {equipes.filter((e) => !jaAlocadas.has(e.id)).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome ?? e.equipe}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <button onClick={() => setAdicionando(true)}
                      className="flex h-6 items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-2 text-[0.65rem] text-muted-foreground transition-colors hover:border-[hsl(var(--dunatech-blue))] hover:text-[hsl(var(--dunatech-blue))]">
                <Plus className="h-3 w-3" /> equipe
              </button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default EstruturaView;
