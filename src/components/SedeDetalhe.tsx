// PÁGINA DA SEDE — o que cada endereço produz e o que custa.
//
// A sede não é só um imóvel: é onde as linhas de faturamento são operadas.
// Aqui a receita vem das linhas vinculadas à sede, o custo operacional das
// equipes que as atendem (rateado pela participação), a infraestrutura entra
// pela fatia rateada de cada centro, e os custos de estrutura (aluguel, luz,
// patrimônio) vêm do lançamento por período do módulo de Sedes.
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Building2, Coins, Loader2, PencilLine, Scale, Server, Users,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Kpi, PageHeader, SectionTitle, Vazio } from "@/components/Pagina";
import { formatCurrency } from "@/utils/calculations";
import {
  type EfSedeDetalhe, abrirDetalheCentro, abrirDetalheEquipe, estruturaApi, useSelecionadoId,
} from "@/services/estrutura";
import { useApp } from "@/contexts/AppContext";
import { MONTH_NAMES } from "@/types/sector";

const AREA_UI: Record<string, { rotulo: string; cls: string }> = {
  passivo: { rotulo: "Contencioso Passivo", cls: "bg-[hsl(var(--dunatech-blue))]/10 text-[hsl(var(--dunatech-blue))] border-[hsl(var(--dunatech-blue))]/30" },
  credito: { rotulo: "Recuperação de Crédito", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  especializada: { rotulo: "Especializada", cls: "bg-violet-500/10 text-violet-600 border-violet-500/30" },
};

const REGIME_ROTULO: Record<string, string> = {
  clt: "CLT", associado: "Associados", estagiario: "Estagiários", pj: "PJ",
};

function mesCurto(per: string) {
  const [a, m] = per.split("-").map(Number);
  return `${MONTH_NAMES[m - 1].slice(0, 3)}/${String(a).slice(2)}`;
}

export default function SedeDetalhe() {
  const { setView } = useApp();
  const [dados, setDados] = useState<EfSedeDetalhe | null>(null);
  const [erro, setErro] = useState(false);
  const sedeId = useSelecionadoId();

  useEffect(() => {
    if (!sedeId) { setErro(true); return; }
    estruturaApi.sedeDetalhe(sedeId)
      .then(setDados)
      .catch((e) => { toast.error(e.message); setErro(true); });
  }, [sedeId]);

  const serie = useMemo(
    () => (dados ? dados.series.map((s) => ({ mes: mesCurto(s.mes), total: s.total })) : []),
    [dados]);

  if (erro) {
    return <Vazio icone={Building2} titulo="Sede não encontrada"
                  acao={<Button variant="outline" onClick={() => setView("estrutura" as any)}>Voltar</Button>} />;
  }
  if (!dados) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const t = dados.totais;
  const [anoU, mesU] = (dados.periodo ?? "—-—").split("-");
  const margemPct = t.receita > 0 ? (t.margem / t.receita) * 100 : null;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="Sede"
        titulo={dados.nome}
        icone={<Building2 className="h-4.5 w-4.5" />}
        descricao={<>
          Receita de <b>{mesU}/{anoU}</b>
          {dados.competencia_custo && <> · custo da folha de <b>{dados.competencia_custo}</b>
            {dados.custo_parcial && <span className="text-warning"> (parcial)</span>}</>}
        </>}
        acoes={
          <Button variant="outline" size="sm" className="gap-1"
                  onClick={() => setView("estrutura" as any)}>
            <ArrowLeft className="h-4 w-4" /> Estrutura
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi icone={Coins} rotulo={`Receita ${mesU}/${anoU}`} valor={formatCurrency(t.receita)}
             sub={`${t.linhas} linha${t.linhas === 1 ? "" : "s"} operada${t.linhas === 1 ? "" : "s"} aqui`} />
        <Kpi icone={Users} rotulo="Custo operacional" valor={formatCurrency(t.custo_operacional)}
             sub={`${t.pessoas} pessoa${t.pessoas === 1 ? "" : "s"} nas equipes`}
             tom="negativo" corValor="text-destructive" />
        <Kpi icone={Server} rotulo="Infraestrutura rateada" valor={formatCurrency(t.custo_infra)}
             sub={dados.infraestrutura.map((i) => `${i.nome} ${i.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`).join(" · ") || "sem rateio"}
             tom="negativo" corValor="text-destructive" />
        <Kpi icone={Scale} rotulo="Margem da sede" valor={formatCurrency(t.margem)}
             sub={margemPct != null ? `${margemPct.toFixed(1)}% da receita` : undefined}
             tom={t.margem >= 0 ? "positivo" : "negativo"}
             corValor={t.margem >= 0 ? "text-success" : "text-destructive"} />
      </div>

      {/* ── Receita mês a mês ── */}
      {serie.length > 0 && (
        <Card className="glass-card border-0">
          <CardContent className="pt-6">
            <SectionTitle eyebrow="Evolução" titulo="Receita da sede mês a mês"
                          acoes={<span className="text-xs text-muted-foreground">soma das linhas vinculadas a {dados.nome}</span>} />
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={serie}>
                <defs>
                  <linearGradient id="gsede" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1E7BFF" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#1E7BFF" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <RTooltip formatter={(v: number) => formatCurrency(v)} />
                <Area type="monotone" dataKey="total" stroke="#1E7BFF" strokeWidth={2} fill="url(#gsede)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Centros e linhas operados na sede ── */}
      <Card className="glass-card border-0">
        <CardContent className="pt-6">
          <SectionTitle eyebrow="O que é operado aqui" titulo="Centros de faturamento e linhas"
                        acoes={<span className="text-xs text-muted-foreground">clique no centro para abrir a página dele</span>} />
          {dados.centros.length === 0 ? (
            <Vazio icone={Coins} titulo="Nenhuma linha vinculada a esta sede"
                   descricao="Vincule linhas de faturamento à sede na administração da estrutura." />
          ) : (
            <div className="space-y-4">
              {dados.centros.map((c) => (
                <div key={c.id} className="rounded-xl border bg-card/50">
                  <button onClick={() => abrirDetalheCentro(c.id, setView)}
                          className="flex w-full items-center justify-between gap-3 border-b px-4 py-2.5 text-left transition-colors hover:bg-muted/40">
                    <span className="text-sm font-semibold">{c.nome}</span>
                    <span className="font-mono-numbers text-sm">{formatCurrency(c.receita)}</span>
                  </button>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Linha</TableHead>
                        <TableHead className="text-xs">Área</TableHead>
                        <TableHead className="text-xs">Equipes</TableHead>
                        <TableHead className="text-right text-xs">Receita {mesU}/{anoU}</TableHead>
                        <TableHead className="text-right text-xs">Custo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {c.linhas.map((l) => {
                        const area = AREA_UI[l.area];
                        const custo = l.alocacoes.reduce((acc, a) => acc + a.custo_total, 0);
                        return (
                          <TableRow key={l.id}>
                            <TableCell className="text-sm font-medium">{l.nome}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[0.6rem] ${area?.cls ?? ""}`}>
                                {area?.rotulo ?? l.area}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="flex flex-wrap gap-1">
                                {l.alocacoes.map((a) => (
                                  <button key={a.id} onClick={() => abrirDetalheEquipe(a.equipe_id, setView)}
                                          title={`Abrir a página da equipe ${a.equipe}`}
                                          className="rounded-full border border-[hsl(var(--dunatech-blue))]/30 bg-[hsl(var(--dunatech-blue))]/8 px-2 py-0.5 text-[0.68rem] transition-colors hover:bg-[hsl(var(--dunatech-blue))]/20">
                                    {a.equipe} <b className="text-[hsl(var(--dunatech-blue))]">{a.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</b>
                                  </button>
                                ))}
                                {l.alocacoes.length === 0 && <span className="text-xs italic text-muted-foreground">sem equipe</span>}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono-numbers text-sm">{formatCurrency(l.receita)}</TableCell>
                            <TableCell className="text-right font-mono-numbers text-xs text-destructive">{formatCurrency(custo)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Equipes na sede ── */}
      <Card className="glass-card border-0">
        <CardContent className="pt-6">
          <SectionTitle eyebrow="Quem trabalha aqui" titulo="Equipes alocadas nas linhas desta sede"
                        acoes={
                          <span className="flex flex-wrap gap-1">
                            {Object.entries(t.por_regime).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
                              <Badge key={r} variant="outline" className="text-[0.6rem]">
                                {n} {REGIME_ROTULO[r] ?? r}
                              </Badge>
                            ))}
                          </span>
                        } />
          {dados.equipes.length === 0 ? (
            <Vazio icone={Users} titulo="Nenhuma equipe alocada" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {dados.equipes.map((e) => (
                <button key={e.id} onClick={() => abrirDetalheEquipe(e.id, setView)}
                        className="card-hover rounded-xl border bg-card/60 p-3 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{e.nome}</span>
                    <Badge variant="outline" className="shrink-0 text-[0.6rem]">
                      {e.pessoas ?? 0} pessoa{(e.pessoas ?? 0) === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    custo nesta sede <span className="font-mono-numbers font-semibold text-foreground">{formatCurrency(e.custo_total)}</span>
                  </div>
                  <div className="mt-1 truncate text-[0.65rem] text-muted-foreground">
                    {e.linhas.join(" · ")}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Infra rateada + custos de estrutura ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="glass-card border-0">
          <CardContent className="pt-6">
            <SectionTitle eyebrow="Rateio" titulo="Infraestrutura atribuída à sede" />
            {dados.infraestrutura.length === 0 ? (
              <Vazio icone={Server} titulo="Nenhum centro de infraestrutura rateado"
                     descricao="Defina o rateio entre sedes na tela da estrutura." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Centro</TableHead>
                    <TableHead className="text-right text-xs">Custo total</TableHead>
                    <TableHead className="text-right text-xs">%</TableHead>
                    <TableHead className="text-right text-xs">Fatia desta sede</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.infraestrutura.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-sm font-medium">{i.nome}</TableCell>
                      <TableCell className="text-right font-mono-numbers text-xs text-muted-foreground">{formatCurrency(i.custo_centro)}</TableCell>
                      <TableCell className="text-right font-mono-numbers text-xs">{i.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</TableCell>
                      <TableCell className="text-right font-mono-numbers text-sm text-destructive">{formatCurrency(i.fatia)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card border-0">
          <CardContent className="pt-6">
            <SectionTitle eyebrow="Imóvel e patrimônio"
                          titulo="Custos de estrutura"
                          acoes={
                            <Button variant="outline" size="sm" className="gap-1"
                                    onClick={() => setView("sede" as any)}>
                              <PencilLine className="h-3.5 w-3.5" /> Lançar
                            </Button>
                          } />
            {dados.estrutura.itens.length === 0 ? (
              <Vazio icone={Building2} titulo="Nenhum custo de estrutura lançado"
                     descricao="Aluguel, energia, condomínio e patrimônio desta sede ainda não foram informados — por isso não entram na margem acima." />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Item</TableHead>
                      <TableHead className="text-right text-xs">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dados.estrutura.itens.map((i: any, ix: number) => (
                      <TableRow key={ix}>
                        <TableCell className="text-sm">{i.nome ?? i.descricao ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono-numbers text-sm">{formatCurrency(Number(i.valor) || 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
                  <span className="text-muted-foreground">Total {dados.estrutura.periodo ?? ""}</span>
                  <span className="font-mono-numbers font-semibold text-destructive">{formatCurrency(dados.estrutura.total)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
