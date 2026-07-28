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
  AlertTriangle, Building2, Coins, Equal, Landmark, Loader2, Network, Plus,
  Scale, Server, Trash2, Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Ajuda } from "@/components/dp/Ajuda";
import { Kpi, PageHeader, SectionTitle } from "@/components/Pagina";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/utils/calculations";
import {
  type EfAlocacao, type EfCentro, type EfEquipe, type EfEstrutura, type EfLinha,
  estruturaApi,
} from "@/services/estrutura";

const AREA_UI: Record<string, { rotulo: string; cls: string }> = {
  passivo: { rotulo: "Contencioso Passivo", cls: "bg-[hsl(var(--dunatech-blue))]/10 text-[hsl(var(--dunatech-blue))] border-[hsl(var(--dunatech-blue))]/30" },
  credito: { rotulo: "Recuperação de Crédito", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  especializada: { rotulo: "Especializada", cls: "bg-violet-500/10 text-violet-600 border-violet-500/30" },
};

export function EstruturaView() {
  const { podeEditar } = usePermissions();
  const editar = podeEditar("estrutura");
  const [dados, setDados] = useState<EfEstrutura | null>(null);
  const [equipes, setEquipes] = useState<EfEquipe[]>([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(() => {
    estruturaApi.carregar()
      .then(setDados)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    estruturaApi.equipes().then(setEquipes).catch(() => undefined);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

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

      {/* ── Centros de faturamento ── */}
      <div className="space-y-4">
        <SectionTitle eyebrow="Quem paga" titulo="Centros de faturamento"
                      acoes={<Ajuda titulo="Centros e linhas"
                                    texto="Cada cliente é um centro de faturamento. Dentro dele, cada receita individualizável é uma linha — e as equipes são alocadas na linha com um percentual de participação. A receita desce e o custo de pessoal sobe pelo mesmo percentual." />} />
        <div className="grid gap-4 xl:grid-cols-2">
          {dados.centros.map((c) => (
            <CentroCard key={c.id} centro={c} equipes={equipes} editar={editar} onMudou={carregar} />
          ))}
        </div>
      </div>

      {/* ── Infraestrutura ── */}
      <div className="space-y-4">
        <SectionTitle eyebrow="Quem sustenta" titulo="Centros de infraestrutura"
                      acoes={<Ajuda titulo="Infraestrutura"
                                    texto="Setores que não faturam: o custo deles é rateado entre as carteiras (é o que alimenta o VPD). Também recebem equipes." />} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dados.infraestrutura.map((c) => (
            <InfraCard key={c.id} centro={c} equipes={equipes} editar={editar} onMudou={carregar} />
          ))}
        </div>
      </div>

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

function CentroCard({ centro, equipes, editar, onMudou }: {
  centro: EfCentro; equipes: EfEquipe[]; editar: boolean; onMudou: () => void;
}) {
  const margem = centro.receita_total - centro.custo_total;
  return (
    <Card className="glass-card border-0">
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="flex items-center gap-2 font-heading text-base font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--dunatech-blue))]/10">
              <Landmark className="h-4 w-4 text-[hsl(var(--dunatech-blue))]" />
            </span>
            {centro.nome}
          </h3>
          <div className="text-right">
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
            <LinhaBloco key={l.id} linha={l} equipes={equipes} editar={editar} onMudou={onMudou} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LinhaBloco({ linha, equipes, editar, onMudou }: {
  linha: EfLinha; equipes: EfEquipe[]; editar: boolean; onMudou: () => void;
}) {
  const area = AREA_UI[linha.area];
  const fora = linha.alocacoes.length > 0 && Math.abs(linha.soma_percentual - 100) > 0.5;
  const [adicionando, setAdicionando] = useState(false);
  const jaAlocadas = new Set(linha.alocacoes.map((a) => a.equipe_id));

  return (
    <div className={`rounded-lg border p-2.5 ${fora ? "border-warning/60 bg-warning/5" : "bg-card/50"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={`text-[0.6rem] ${area.cls}`}>{area.rotulo}</Badge>
        <span className="text-sm font-semibold">{linha.nome}</span>
        {linha.setor_legado && (
          <span className="text-[0.62rem] text-muted-foreground" title="Setor do painel antigo que originou esta linha">
            ← {linha.setor_legado}
          </span>
        )}
        <span className="ml-auto font-mono-numbers text-sm font-bold">
          {formatCurrency(linha.receita_bruta)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {linha.alocacoes.map((a) => (
          <AlocacaoChip key={a.id} a={a} editar={editar} onMudou={onMudou} />
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
function AlocacaoChip({ a, editar, onMudou }: { a: EfAlocacao; editar: boolean; onMudou: () => void }) {
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
      <span className="font-medium">{a.equipe}</span>
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

function InfraCard({ centro, equipes, editar, onMudou }: {
  centro: EfCentro; equipes: EfEquipe[]; editar: boolean; onMudou: () => void;
}) {
  const [adicionando, setAdicionando] = useState(false);
  const jaAlocadas = new Set(centro.alocacoes.map((a) => a.equipe_id));
  return (
    <Card className="glass-card border-0">
      <CardContent className="space-y-2 pt-5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="flex items-center gap-2 font-heading text-sm font-bold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/70">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            {centro.nome}
          </h3>
          <span className="font-mono-numbers text-xs font-semibold text-muted-foreground">
            {formatCurrency(centro.custo_total)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {centro.alocacoes.map((a) => (
            <AlocacaoChip key={a.id} a={a} editar={editar} onMudou={onMudou} />
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
