// PÁGINA DO CENTRO DE FATURAMENTO — a visão dedicada de UM cliente.
//
// Tudo que existe sobre ele em um lugar: a receita mês a mês aberta por linha
// (empilhada, pra ver a composição), as linhas com suas equipes e percentuais,
// as equipes envolvidas com gente e custo real da folha, e a margem.
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Coins, Landmark, Loader2, Network, Scale, Users,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
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
  type EfCentroDetalhe, abrirDetalheEquipe, estruturaApi, useSelecionadoId,
} from "@/services/estrutura";
import { useApp } from "@/contexts/AppContext";
import { MONTH_NAMES } from "@/types/sector";

const CORES = ["#1E7BFF", "#0A1940", "#27AE60", "#F39C12", "#8B5CF6", "#E74C3C", "#7FB5FF", "#14B8A6"];

const AREA_UI: Record<string, { rotulo: string; cls: string }> = {
  passivo: { rotulo: "Contencioso Passivo", cls: "bg-[hsl(var(--dunatech-blue))]/10 text-[hsl(var(--dunatech-blue))] border-[hsl(var(--dunatech-blue))]/30" },
  credito: { rotulo: "Recuperação de Crédito", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" },
  especializada: { rotulo: "Especializada", cls: "bg-violet-500/10 text-violet-600 border-violet-500/30" },
};

function mesCurto(per: string) {
  const [a, m] = per.split("-").map(Number);
  return `${MONTH_NAMES[m - 1].slice(0, 3)}/${String(a).slice(2)}`;
}

export default function CentroDetalhe() {
  const { setView } = useApp();
  const [dados, setDados] = useState<EfCentroDetalhe | null>(null);
  const [erro, setErro] = useState(false);
  const centroId = useSelecionadoId();

  useEffect(() => {
    if (!centroId) { setErro(true); return; }
    estruturaApi.centroDetalhe(centroId)
      .then(setDados)
      .catch((e) => { toast.error(e.message); setErro(true); });
  }, [centroId]);

  const serie = useMemo(() => {
    if (!dados) return [];
    return dados.series.map((s) => ({ mes: mesCurto(s.mes), ...s.por_linha, total: s.total }));
  }, [dados]);

  const nomesLinhas = useMemo(
    () => (dados ? dados.linhas.map((l) => l.nome) : []), [dados]);

  if (erro) {
    return <Vazio icone={Landmark} titulo="Centro não encontrado"
                  acao={<Button variant="outline" onClick={() => setView("estrutura" as any)}>Voltar</Button>} />;
  }
  if (!dados) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const [anoU, mesU] = (dados.periodo ?? "—").split("-");
  const margemPct = dados.receita_ultimo > 0 ? (dados.margem / dados.receita_ultimo) * 100 : null;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="Centro de faturamento"
        titulo={dados.nome}
        icone={<Landmark className="h-4.5 w-4.5" />}
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
        <Kpi icone={Coins} rotulo={`Receita ${mesU}/${anoU}`} valor={formatCurrency(dados.receita_ultimo)} />
        <Kpi icone={Users} rotulo="Custo de pessoal" valor={formatCurrency(dados.custo_total)}
             sub={`a pagar ${formatCurrency(dados.a_pagar)}`} tom="negativo" corValor="text-destructive" />
        <Kpi icone={Scale} rotulo="Margem sobre pessoal" valor={formatCurrency(dados.margem)}
             sub={margemPct != null ? `${margemPct.toFixed(1)}% da receita` : undefined}
             tom={dados.margem >= 0 ? "positivo" : "negativo"}
             corValor={dados.margem >= 0 ? "text-success" : "text-destructive"} />
        <Kpi icone={Network} rotulo="Receita acumulada" valor={formatCurrency(dados.receita_acumulada)}
             sub={`${dados.meses.length} meses de histórico`} />
      </div>

      {/* ── Receita mês a mês, empilhada por linha ── */}
      {serie.length > 0 && (
        <Card className="glass-card border-0">
          <CardContent className="pt-6">
            <SectionTitle eyebrow="Evolução" titulo="Receita mês a mês por linha"
                          acoes={<span className="text-xs text-muted-foreground">cada cor é uma linha de faturamento</span>} />
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <RTooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {nomesLinhas.map((n, i) => (
                  <Bar key={n} dataKey={n} stackId="r" fill={CORES[i % CORES.length]}
                       radius={i === nomesLinhas.length - 1 ? [4, 4, 0, 0] : undefined} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Linhas ── */}
      <Card className="glass-card border-0">
        <CardContent className="pt-6">
          <SectionTitle eyebrow="Composição" titulo="Linhas de faturamento" />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Linha</TableHead>
                <TableHead className="text-xs">Área</TableHead>
                <TableHead className="text-xs">Equipes</TableHead>
                <TableHead className="text-right text-xs">Receita {mesU}/{anoU}</TableHead>
                <TableHead className="text-right text-xs">Acumulada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.linhas.map((l) => {
                const area = AREA_UI[l.area];
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
                    <TableCell className="text-right font-mono-numbers text-sm">{formatCurrency(l.receita_ultimo)}</TableCell>
                    <TableCell className="text-right font-mono-numbers text-xs text-muted-foreground">{formatCurrency(l.receita_acumulada)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Equipes do centro ── */}
      <Card className="glass-card border-0">
        <CardContent className="pt-6">
          <SectionTitle eyebrow="Quem atende" titulo="Equipes deste centro"
                        acoes={<span className="text-xs text-muted-foreground">clique para abrir a página da equipe</span>} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dados.equipes.map((e) => (
              <button key={e.id} onClick={() => abrirDetalheEquipe(e.id, setView)}
                      className="card-hover rounded-xl border bg-card/60 p-3 text-left">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{e.nome}</span>
                  <Badge variant="outline" className="shrink-0 text-[0.6rem]">
                    {e.pessoas} pessoa{e.pessoas === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="mt-1.5 text-xs text-muted-foreground">
                  custo <span className="font-mono-numbers font-semibold text-foreground">{formatCurrency(e.custo_total)}</span>
                </div>
                <div className="mt-1 truncate text-[0.65rem] text-muted-foreground">
                  {e.linhas.map((x) => `${x.linha} (${x.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`).join(" · ")}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
