// PÁGINA DA EQUIPE — quem está nela, com tudo que o DP sabe.
//
// Pessoas com matrícula, cargo, regime, salário e o CUSTO REAL da folha;
// composição por cargo; onde a equipe está alocada e quanto de receita a
// participação representa. Clique numa pessoa não abre nada daqui (a ficha
// vive no módulo Pessoal), mas o essencial está na linha.
import { useEffect, useState } from "react";
import {
  ArrowLeft, Briefcase, Coins, Loader2, Palmtree, Scale, Users,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TabelaRolavel } from "@/components/TabelaRolavel";
import { Kpi, PageHeader, SectionTitle, Vazio } from "@/components/Pagina";
import { formatCurrency } from "@/utils/calculations";
import {
  type EfEquipeDetalhe, abrirDetalheCentro, estruturaApi, useSelecionadoId,
} from "@/services/estrutura";
import { useApp } from "@/contexts/AppContext";

const GRUPO_LABEL: Record<string, string> = {
  passivo: "Contencioso Passivo",
  credito: "Recuperação de Crédito",
  especializada: "Especializada",
  infra: "Infraestrutura",
};

const REGIME_UI: Record<string, { rotulo: string; cls: string }> = {
  clt: { rotulo: "CLT", cls: "bg-emerald-100 text-emerald-700" },
  estagiario: { rotulo: "Estagiário", cls: "bg-sky-100 text-sky-700" },
  associado: { rotulo: "Associado", cls: "bg-violet-100 text-violet-700" },
  pj: { rotulo: "PJ", cls: "bg-amber-100 text-amber-800" },
};

export default function EquipeDetalhe() {
  const { setView } = useApp();
  const [dados, setDados] = useState<EfEquipeDetalhe | null>(null);
  const [erro, setErro] = useState(false);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const equipeId = useSelecionadoId();

  useEffect(() => {
    if (!equipeId) { setErro(true); return; }
    estruturaApi.equipeDetalhe(equipeId)
      .then(setDados)
      .catch((e) => { toast.error(e.message); setErro(true); });
  }, [equipeId]);

  if (erro) {
    return <Vazio icone={Users} titulo="Equipe não encontrada"
                  acao={<Button variant="outline" onClick={() => setView("estrutura" as any)}>Voltar</Button>} />;
  }
  if (!dados) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const inativos = dados.pessoas.filter((p) => p.status !== "ativo").length;
  const pessoas = dados.pessoas.filter((p) => mostrarInativos || p.status === "ativo");
  const t = dados.totais;
  const custoMedio = t.ativos ? t.custo_total / t.ativos : 0;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow={`Equipe · ${GRUPO_LABEL[dados.grupo] ?? dados.grupo}`}
        titulo={dados.nome}
        icone={<Users className="h-4.5 w-4.5" />}
        descricao={<>
          {dados.centro_custo && <>Centro de custo no DP: <b>{dados.centro_custo}</b></>}
          {dados.competencia_custo && <> · folha de <b>{dados.competencia_custo}</b>
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
        <Kpi icone={Users} rotulo="Pessoas ativas" valor={String(t.ativos)} />
        <Kpi icone={Coins} rotulo="Custo mensal" valor={formatCurrency(t.custo_total)}
             sub={`a pagar ${formatCurrency(t.a_pagar)}`} tom="negativo" corValor="text-destructive" />
        <Kpi icone={Briefcase} rotulo="Custo médio por pessoa" valor={formatCurrency(custoMedio)} />
        <Kpi icone={Scale} rotulo="Receita da participação" valor={formatCurrency(t.receita_participacao)}
             sub={dados.alocacoes.length ? `${dados.alocacoes.length} alocação(ões)` : "sem alocação"}
             tom={t.receita_participacao > 0 ? "positivo" : "atencao"}
             corValor={t.receita_participacao > 0 ? "text-success" : "text-warning"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ── Composição por cargo ── */}
        <Card className="glass-card border-0 lg:col-span-2">
          <CardContent className="pt-6">
            <SectionTitle eyebrow="Composição" titulo="Por cargo" />
            {dados.resumo_cargos.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Sem pessoas ativas.</p>
            ) : (
              <div className="space-y-2">
                {dados.resumo_cargos.map((r) => {
                  const pct = t.custo_total > 0 ? (r.custo / t.custo_total) * 100 : 0;
                  return (
                    <div key={r.cargo}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate">{r.cargo}</span>
                        <span className="shrink-0 font-mono-numbers text-xs">
                          {r.n}× · {formatCurrency(r.custo)}
                        </span>
                      </div>
                      <div className="track mt-1"><i style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Onde está alocada ── */}
        <Card className="glass-card border-0 lg:col-span-3">
          <CardContent className="pt-6">
            <SectionTitle eyebrow="Atuação" titulo="Onde a equipe está alocada"
                          acoes={<span className="text-xs text-muted-foreground">clique para abrir o centro</span>} />
            {dados.alocacoes.length === 0 ? (
              <p className="py-4 text-center text-sm text-warning">
                Equipe sem alocação — o custo dela não aparece em nenhum centro.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Centro</TableHead>
                    <TableHead className="text-xs">Linha</TableHead>
                    <TableHead className="text-right text-xs">Participação</TableHead>
                    <TableHead className="text-right text-xs">Receita da participação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.alocacoes.map((a) => (
                    <TableRow key={a.id} className="cursor-pointer hover:bg-[hsl(var(--dunatech-blue))]/5"
                              onClick={() => abrirDetalheCentro(a.centro_id, setView)}>
                      <TableCell className="text-sm font-medium">{a.centro}</TableCell>
                      <TableCell className="text-sm">{a.tipo === "centro" ? "— (alocação direta)" : a.destino}</TableCell>
                      <TableCell className="text-right font-mono-numbers text-sm">
                        {a.percentual.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
                      </TableCell>
                      <TableCell className="text-right font-mono-numbers text-sm">
                        {formatCurrency(a.receita_participacao)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── As pessoas ── */}
      <Card className="glass-card border-0">
        <CardContent className="pt-6">
          <SectionTitle eyebrow="Quem está na equipe" titulo={`Pessoas (${t.ativos} ativas)`}
                        acoes={inativos > 0 && (
                          <button onClick={() => setMostrarInativos((v) => !v)}
                                  className="text-xs text-[hsl(var(--dunatech-blue))] hover:underline">
                            {mostrarInativos ? "esconder" : "mostrar"} {inativos} desligado(s)
                          </button>
                        )}
          />
          <TabelaRolavel altura="max-h-[56vh]" className="rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur [&_th]:border-b">
                <TableRow>
                  <TableHead className="text-xs">Matrícula</TableHead>
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">Cargo</TableHead>
                  <TableHead className="text-xs">Contrato</TableHead>
                  <TableHead className="hidden text-xs md:table-cell">Supervisor</TableHead>
                  <TableHead className="text-right text-xs">Salário</TableHead>
                  <TableHead className="text-right text-xs">Custo na folha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pessoas.map((p) => {
                  const reg = REGIME_UI[p.regime];
                  return (
                    <TableRow key={p.id} className={p.status !== "ativo" ? "opacity-50" : ""}>
                      <TableCell className="font-mono text-xs">{p.matricula}</TableCell>
                      <TableCell className="max-w-[240px] text-sm">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{p.nome}</span>
                          {p.ferias_dias > 0 && (
                            <span title={`${p.ferias_dias} dia(s) de férias/recesso no mês`}>
                              <Palmtree className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            </span>
                          )}
                          {p.em_rescisao && (
                            <span className="shrink-0 rounded bg-rose-100 px-1 text-[9px] font-semibold uppercase text-rose-700">
                              rescisão
                            </span>
                          )}
                          {p.status !== "ativo" && (
                            <span className="shrink-0 rounded bg-muted px-1 text-[9px] font-semibold uppercase text-muted-foreground">
                              desligado
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[190px] truncate text-xs">{p.cargo ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`border-0 text-[0.6rem] ${reg?.cls ?? ""}`}>
                          {reg?.rotulo ?? p.regime}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden max-w-[150px] truncate text-xs md:table-cell">
                        {p.supervisor ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono-numbers text-xs">
                        {formatCurrency(p.salario_bruto)}
                      </TableCell>
                      <TableCell className="text-right font-mono-numbers text-xs font-semibold">
                        {p.custo_total != null ? formatCurrency(p.custo_total) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {pessoas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhuma pessoa enquadrada nesta equipe — o enquadramento é feito na ficha
                      do colaborador (módulo Pessoal) ou pela administração da estrutura.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabelaRolavel>
        </CardContent>
      </Card>
    </div>
  );
}
