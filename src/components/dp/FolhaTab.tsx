// DP — F2: aba "Folha" — esteira da competência mensal.
// Aberta → lançar ocorrências/recalcular → Em revisão → Fechada (4-olhos).
// Fechada é intocável (reabrir só com justificativa, tudo auditado).
import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays, CalendarPlus, CheckCircle2, Coins, Download, FileText, Loader2, Lock,
  MoreVertical, PencilLine, PieChart, RefreshCw, RotateCcw, Search, SendHorizonal,
  Sliders, UserMinus, Unlock,
  Palmtree,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ajuda, TituloAjuda } from "@/components/dp/Ajuda";
import { CcPicker } from "@/components/dp/Pickers";
import CalendarioFaltas, { type FaltaDia } from "@/components/dp/CalendarioFaltas";
import FeriasDialog from "@/components/dp/FeriasDialog";
import { TabelaRolavel } from "@/components/TabelaRolavel";
import ResumoCentroCusto from "@/components/dp/ResumoCentroCusto";
import {
  type DpCompetencia, type DpFolhaItem, type DpFolhaTotais, type DpRateio,
  REGIME_LABELS, dpApi, fmtBRL, fmtData, folhaApi, relatoriosApi,
} from "@/services/dp";

const PAGE = 50;
const TODOS = "__todos__";

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  aberta: { label: "Aberta", cls: "bg-sky-100 text-sky-700" },
  em_revisao: { label: "Em revisão", cls: "bg-amber-100 text-amber-800" },
  fechada: { label: "Fechada", cls: "bg-emerald-100 text-emerald-700" },
};

export default function FolhaTab({ editar }: { editar: boolean }) {
  const [comps, setComps] = useState<DpCompetencia[]>([]);
  const [ativa, setAtiva] = useState<DpCompetencia | null>(null);
  const [abrirDialog, setAbrirDialog] = useState(false);

  const carregar = useCallback(() => {
    folhaApi.competencias().then((cs) => {
      setComps(cs);
      setAtiva((prev) => (prev ? cs.find((c) => c.id === prev.id) ?? cs[0] ?? null : cs[0] ?? null));
    }).catch(() => undefined);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={ativa?.id ?? ""} onValueChange={(v) => setAtiva(comps.find((c) => c.id === v) ?? null)}>
          <SelectTrigger className="h-9 w-[230px] text-sm">
            <SelectValue placeholder="Escolha a competência…" />
          </SelectTrigger>
          <SelectContent>
            {comps.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.mes_nome} {c.ano} — {STATUS_UI[c.status].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {editar && (
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setAbrirDialog(true)}>
            <CalendarPlus className="h-4 w-4" /> Abrir competência
          </Button>
        )}
      </div>

      {ativa ? (
        <CompetenciaDetalhe key={ativa.id + ativa.status} comp={ativa} editar={editar} onMudou={carregar} />
      ) : (
        <Card className="glass-card border-0">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma competência aberta ainda{editar ? " — clique em “Abrir competência”." : "."}
          </CardContent>
        </Card>
      )}

      {abrirDialog && (
        <AbrirDialog onClose={() => setAbrirDialog(false)} onAbriu={() => { setAbrirDialog(false); carregar(); }} />
      )}
    </div>
  );
}

/**
 * Célula de dinheiro da folha, com o SINAL explícito.
 *
 * Sem isso, INSS e desconto de VT apareciam como "R$ 130,93" — visualmente
 * idênticos a um vale-transporte de "R$ 225,00" que SOMA. Quem olha a linha
 * não conseguia dizer o que entra e o que sai, e a conta não fechava de olho.
 *
 *   desconto → sinal "−" e vermelho     (sai do que a pessoa recebe)
 *   provento → sinal "+" e verde        (entra)
 *   neutro   → sem sinal                (salário base e subtotais: nem um nem outro)
 *   total    → sem sinal, em negrito    (o resultado da linha)
 *
 * Valor zero vira travessão em vez de "R$ 0,00": zero repetido em dez colunas
 * vira ruído e esconde os números que importam.
 */
function Val({ v, tipo = "neutro", titulo, className = "" }: {
  v: number | undefined | null;
  tipo?: "desconto" | "provento" | "neutro" | "total";
  titulo?: string;
  className?: string;
}) {
  const n = v ?? 0;
  if (!n) return <span className="text-muted-foreground">—</span>;

  // acerto contábil e ajustes podem vir negativos já na origem: o sinal do
  // NÚMERO manda sobre o papel da coluna, senão um estorno apareceria somando
  const negativo = tipo === "desconto" ? n > 0 : n < 0;
  const cor = tipo === "total" ? "font-semibold"
    : negativo ? "text-rose-600"
    : tipo === "provento" ? "text-emerald-700"
    : "";
  const sinal = tipo === "total" || tipo === "neutro" ? ""
    : negativo ? "−" : "+";

  return (
    <span className={`${cor} ${className}`} title={titulo}>
      {sinal}{fmtBRL(Math.abs(n))}
    </span>
  );
}

function AbrirDialog({ onClose, onAbriu }: { onClose: () => void; onAbriu: () => void }) {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [diasMes, setDiasMes] = useState(30);
  const [diasUteis, setDiasUteis] = useState(22);
  const [rodando, setRodando] = useState(false);

  const abrir = async () => {
    setRodando(true);
    try {
      const c = await folhaApi.abrir(ano, mes, diasMes, diasUteis);
      toast.success(`${c.mes_nome} ${c.ano} aberta — ${c.total_itens} colaboradores na prévia.`);
      onAbriu();
    } catch (e: any) { toast.error(e.message); }
    finally { setRodando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Abrir competência</DialogTitle>
          <DialogDescription>Importa o quadro ativo e calcula a primeira prévia da folha.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs text-muted-foreground">Mês</Label>
            <Input type="number" min={1} max={12} value={mes} onChange={(e) => setMes(Number(e.target.value))} /></div>
          <div><Label className="text-xs text-muted-foreground">Ano</Label>
            <Input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} /></div>
          <div><Label className="text-xs text-muted-foreground">Dias do mês (folha)</Label>
            <Input type="number" value={diasMes} onChange={(e) => setDiasMes(Number(e.target.value))} /></div>
          <div><Label className="text-xs text-muted-foreground">Dias úteis</Label>
            <Input type="number" value={diasUteis} onChange={(e) => setDiasUteis(Number(e.target.value))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={rodando}>Cancelar</Button>
          <Button className="glass-button border-0" onClick={abrir} disabled={rodando}>
            {rodando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-1 h-4 w-4" />}
            Abrir e calcular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompetenciaDetalhe({ comp, editar, onMudou }: {
  comp: DpCompetencia; editar: boolean; onMudou: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [regime, setRegime] = useState(TODOS);
  const [ccFiltro, setCcFiltro] = useState(TODOS);
  const [ajustando, setAjustando] = useState<DpFolhaItem | null>(null);
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [totais, setTotais] = useState<DpFolhaTotais | null>(null);
  const [items, setItems] = useState<DpFolhaItem[]>([]);
  const [rateio, setRateio] = useState<DpRateio | null>(null);
  const [editandoDias, setEditandoDias] = useState(false);
  const [diasMes, setDiasMes] = useState(comp.dias_mes);
  const [diasUteis, setDiasUteis] = useState(comp.dias_uteis);
  const [verRateio, setVerRateio] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agindo, setAgindo] = useState(false);
  const [lancando, setLancando] = useState<DpFolhaItem | null>(null);
  const [ferias, setFerias] = useState<DpFolhaItem | null>(null);
  const [reabrindo, setReabrindo] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  // ordenação clicável: "" = ordem natural; "-campo" = decrescente.
  // Vai pro SERVIDOR porque a tabela é paginada — ordenar só a página visível
  // enganaria (o "maior valor" poderia estar em outra página).
  const [ordem, setOrdem] = useState("");

  const ordenarPor = (campo: string, numerica: boolean) => {
    setPagina(0);
    setOrdem((atual) => {
      // numérica começa pelo MAIOR (é o que se procura); texto começa pelo A
      const primeira = numerica ? `-${campo}` : campo;
      const segunda = numerica ? campo : `-${campo}`;
      if (atual === primeira) return segunda;
      if (atual === segunda) return "";
      return primeira;
    });
  };

  const TH = ({ campo, numerica = true, children, className = "" }: {
    campo: string; numerica?: boolean; children: React.ReactNode; className?: string;
  }) => (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground ${className}`}
      onClick={() => ordenarPor(campo, numerica)}
      title="Clique para ordenar"
    >
      <span className="inline-flex items-center gap-0.5">
        {children}
        {ordem === campo && <span aria-hidden>▲</span>}
        {ordem === `-${campo}` && <span aria-hidden>▼</span>}
      </span>
    </TableHead>
  );

  const fechada = comp.status === "fechada";
  const aberta = comp.status === "aberta";

  const carregarItens = useCallback(() => {
    setLoading(true);
    folhaApi.itens(comp.id, {
      busca, regime: regime === TODOS ? "" : regime,
      cc: ccFiltro === TODOS ? "" : ccFiltro, ordem: ordem || undefined,
      limit: PAGE, offset: pagina * PAGE,
    })
      .then((r) => { setItems(r.items); setTotal(r.total); setTotais(r.totais); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    folhaApi.rateio(comp.id).then(setRateio).catch(() => undefined);
  }, [comp.id, busca, regime, ccFiltro, ordem, pagina]);

  useEffect(() => { carregarItens(); }, [carregarItens]);

  const acao = async (fn: () => Promise<unknown>, ok: string) => {
    setAgindo(true);
    try { await fn(); toast.success(ok); onMudou(); carregarItens(); }
    catch (e: any) { toast.error(e.message); }
    finally { setAgindo(false); }
  };

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE));
  const st = STATUS_UI[comp.status];

  return (
    <Card className="glass-card border-0">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Folha de {comp.mes_nome} {comp.ano}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
          </CardTitle>
          {/* Esteira de ações conforme o status */}
          {editar && (
            <div className="flex flex-wrap gap-2">
              {aberta && (
                <>
                  <Button size="sm" variant="outline" className="gap-1" disabled={agindo}
                          onClick={() => acao(() => folhaApi.recalcular(comp.id), "Folha recalculada.")}>
                    <RefreshCw className="h-3.5 w-3.5" /> Recalcular
                  </Button>
                  <Button size="sm" className="glass-button gap-1 border-0" disabled={agindo}
                          onClick={() => acao(() => folhaApi.enviarRevisao(comp.id), "Enviada pra revisão — outro usuário precisa aprovar.")}>
                    <SendHorizonal className="h-3.5 w-3.5" /> Enviar pra revisão
                  </Button>
                </>
              )}
              {comp.status === "em_revisao" && (
                <>
                  <Button size="sm" variant="outline" className="gap-1" disabled={agindo}
                          title="Volta a folha para Aberta (ainda não foi aprovada)"
                          onClick={() => acao(() => folhaApi.desfazerRevisao(comp.id),
                                              "Envio desfeito — a folha voltou para Aberta.")}>
                    <RotateCcw className="h-3.5 w-3.5" /> Desfazer envio
                  </Button>
                  <Button size="sm" className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700" disabled={agindo}
                          onClick={() => acao(() => folhaApi.aprovar(comp.id), "Competência FECHADA (snapshot congelado).")}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar e fechar
                  </Button>
                </>
              )}
              {fechada && (
                <Button size="sm" variant="outline" className="gap-1 border-amber-300 text-amber-800" disabled={agindo}
                        onClick={() => setReabrindo(true)}>
                  <Unlock className="h-3.5 w-3.5" /> Reabrir
                </Button>
              )}
            </div>
          )}
        </div>
        <CardDescription className="flex flex-wrap gap-x-4 text-xs">
          {comp.enviada_revisao_por && <span>Revisão pedida por <b>{comp.enviada_revisao_por}</b></span>}
          {comp.fechada_por && <span><Lock className="mr-0.5 inline h-3 w-3" /> Fechada por <b>{comp.fechada_por}</b></span>}
          <span className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--dunatech-blue))]/30 bg-[hsl(var(--dunatech-blue))]/5 px-2 py-0.5">
            <CalendarDays className="h-3.5 w-3.5 text-[hsl(var(--dunatech-blue))]" />
            <b>{comp.dias_uteis}</b> dias úteis · {comp.dias_mes} dias no mês
            <Ajuda titulo="Dias úteis do mês"
                   texto={`Calculado pelo calendário (segunda a sexta, sem feriados nacionais).${
                     comp.calendario?.feriados?.length
                       ? " Feriados neste mês: " + comp.calendario.feriados.map((f) => `${f.data} ${f.nome}`).join(", ") + "."
                       : " Nenhum feriado neste mês."} É a base do desconto proporcional de vale-transporte e vale-alimentação.`} />
            {editar && aberta && (
              <button onClick={() => setEditandoDias(true)}
                      className="ml-0.5 text-[hsl(var(--dunatech-blue))] underline-offset-2 hover:underline">
                ajustar
              </button>
            )}
          </span>
          {!!comp.em_rescisao && (
            <span className="rounded-md bg-rose-100 px-2 py-0.5 text-rose-700">
              {comp.em_rescisao} em rescisão neste mês
            </span>
          )}
        </CardDescription>
        {totais && (
          <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-4">
            <TotalCard rotulo="Total a pagar" valor={totais.total_pagar}
                       ajuda="Soma do que sai do caixa para as pessoas neste mês." />
            <TotalCard rotulo="Provisões do mês" valor={totais.provisoes}
                       ajuda="Quanto precisa ser reservado neste mês para 13º, férias, FGTS e recesso." />
            <TotalCard rotulo="INSS patronal" valor={totais.inss_patronal}
                       ajuda="INSS que a empresa recolhe sobre a folha (além do desconto do colaborador)." />
            <TotalCard rotulo="Custo total" valor={totais.custo_total} destaque
                       ajuda="Total a pagar + provisões + INSS patronal. É o custo real do mês." />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar colaborador…" value={busca}
                   onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
                   className="h-9 w-56 pl-8 text-sm" />
          </div>
          <Select value={regime} onValueChange={(v) => { setRegime(v); setPagina(0); }}>
            <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os contratos</SelectItem>
              {Object.entries(REGIME_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <CcPicker valor={ccFiltro} rotuloTodos="Todos os centros de custo" comSubnucleos
                    className="w-[230px] text-xs"
                    onChange={(v) => { setCcFiltro(v); setPagina(0); }} />
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" className="gap-1"
                    title="Folha analítica completa em Excel timbrado"
                    onClick={() => relatoriosApi.folhaExcel(comp.id).catch((e) => toast.error(e.message))}>
              <Download className="h-3.5 w-3.5" /> Folha
            </Button>
            <Button size="sm" variant="outline" className="gap-1"
                    title="Rateio por CC em Excel timbrado"
                    onClick={() => relatoriosApi.rateioExcel(comp.id).catch((e) => toast.error(e.message))}>
              <Download className="h-3.5 w-3.5" /> Rateio
            </Button>
            <Button size="sm" variant="outline" className="gap-1"
                    title="Folha analitica em PDF timbrado"
                    onClick={() => relatoriosApi.folhaPdf(comp.id).catch((e) => toast.error(e.message))}>
              <FileText className="h-3.5 w-3.5" /> PDF folha
            </Button>
            <Button size="sm" variant="outline" className="gap-1"
                    title="Rateio por CC em PDF timbrado (pro fechamento)"
                    onClick={() => relatoriosApi.rateioPdf(comp.id).catch((e) => toast.error(e.message))}>
              <FileText className="h-3.5 w-3.5" /> PDF rateio
            </Button>
            <Button size="sm" variant={verRateio ? "default" : "outline"} className="gap-1"
                    onClick={() => setVerRateio((v) => !v)}>
              <PieChart className="h-3.5 w-3.5" /> {verRateio ? "Ver folha" : "Resumo por centro de custo"}
            </Button>
          </div>
        </div>

        {verRateio ? (
          <ResumoCentroCusto rateio={rateio} compId={comp.id} />
        ) : (
          <>
            {/* FORA do <Table>: <div> dentro de <table> e' HTML invalido — o
                navegador arranca o bloco e ele renderiza espremido na lateral.
                Fica aqui em cima, que e' onde se le' antes de olhar os numeros. */}
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-medium">Como ler os valores:</span>
              <span><span className="font-mono text-emerald-700">+R$</span> entra</span>
              <span><span className="font-mono text-rose-600">−R$</span> desconto</span>
              <span className="flex items-center gap-1">
                <span className="font-mono text-sky-700">+R$</span> férias e salário-família
                <Ajuda titulo="Por que essas duas são azuis?"
                       texto={"Entram no que a pessoa recebe, mas não são custo novo do "
                              + "escritório: as férias já estavam provisionadas mês a mês, e o "
                              + "salário-família é adiantado e compensado na guia do INSS."} />
              </span>
              <span>sem sinal = salário base e subtotais</span>
              <span className="font-semibold text-foreground">negrito = totais</span>
              <span className="flex items-center gap-1 text-amber-700 dark:text-amber-500">
                líquido ≠ extrato da contabilidade
                <Ajuda titulo="Por que o líquido daqui pode ser maior que o do extrato"
                       texto={"O extrato desconta duas coisas que este sistema ainda não "
                              + "modela: o ADIANTAMENTO DE FÉRIAS (pago antes pelo recibo e "
                              + "descontado depois, pra não pagar duas vezes) e o EMPRÉSTIMO "
                              + "CONSIGNADO. Ele também trata vale-transporte e alimentação "
                              + "fora da folha, enquanto aqui eles somam como provento. "
                              + "Nada disso muda o CUSTO do escritório — muda o quanto sai "
                              + "na conta da pessoa."} />
              </span>
            </div>
            <TabelaRolavel className="rounded-md border">
              <Table>
                {/* o cabeçalho gruda no topo da caixa: com 13 colunas e 177
                    linhas, rolar sem saber que coluna se está lendo é o pior
                    jeito de conferir uma folha */}
              <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur [&_th]:border-b">
                  <TableRow>
                    <TH campo="matricula" numerica className="text-xs">Matrícula</TH>
                    <TH campo="nome" numerica={false} className="text-xs">Nome</TH>
                    <TH campo="centro_custo_nome" numerica={false} className="hidden text-xs lg:table-cell">Centro de custo</TH>
                    <TH campo="salario_bruto" numerica className="text-right text-xs"><TituloAjuda titulo="Salário bruto" ajuda="Salário cadastrado, antes de qualquer desconto." /></TH>
                    <TH campo="faltas_dias" numerica className="hidden text-right text-xs sm:table-cell"><TituloAjuda titulo="Faltas" ajuda="Dias e horas de falta lançados no mês — geram desconto proporcional." /></TH>
                    <TH campo="desc_inss" numerica className="text-right text-xs"><TituloAjuda titulo="INSS" ajuda={"Desconto do colaborador pela tabela progressiva vigente (só CLT). Em mês com férias são TRÊS parcelas somadas — INSS das férias, diferença de férias e INSS do salário —, exatamente como no espelho da contabilidade; passe o mouse sobre o valor para ver a quebra. O recibo de férias mostra só a PRIMEIRA delas, porque é o documento do adiantamento e não do mês fechado."} /></TH>
                    <TH campo="desc_vt" numerica className="hidden text-right text-xs md:table-cell"><TituloAjuda titulo="Desc. VT" ajuda="Desconto de até 6% do salário, previsto em lei, para quem opta pelo vale (só CLT)." /></TH>
                    <TH campo="vt_com_faltas" numerica className="hidden text-right text-xs xl:table-cell"><TituloAjuda titulo="Vale-transporte" ajuda="Valor do VT no mês, já proporcional às faltas." /></TH>
                    <TH campo="va_com_faltas" numerica className="hidden text-right text-xs xl:table-cell"><TituloAjuda titulo="Vale-alimentação" ajuda="Valor do VA no mês, já proporcional às faltas." /></TH>
                    <TH campo="salario_com_descontos" numerica className="hidden text-right text-xs xl:table-cell"><TituloAjuda titulo="Subtotal do salário" ajuda="Passo INTERMEDIÁRIO, não é o que a pessoa recebe: só o salário do mês menos INSS, desconto de VT e IRRF. Os benefícios, férias, prêmios e salário-família ainda vão somar depois. O valor final está em \u0022Líquido a pagar\u0022, no fim da linha." /></TH>
                    <TH campo="saldo_livre" numerica className="text-right text-xs"><TituloAjuda titulo="Saldo livre" ajuda="Parcela paga fora do salário base, sem incidência de INSS. Em junho eram 63 pessoas e R$ 80,5 mil — some no total sem aparecer se esta coluna não existir." /></TH>
                    <TH campo="ferias_valor" numerica className="text-right text-xs"><TituloAjuda titulo="Férias" ajuda="Remuneração dos dias de férias + 1/3 constitucional + abono pecuniário, quando houver." /></TH>
                    <TH campo="acerto_contabil" numerica className="hidden text-right text-xs xl:table-cell"><TituloAjuda titulo="Acerto" ajuda="Acerto contábil do mês: pode ser positivo ou negativo." /></TH>
                    <TH campo="premiacoes" numerica className="hidden text-right text-xs md:table-cell">Prêmios</TH>
                    <TH campo="salario_familia" numerica className="hidden text-right text-xs lg:table-cell"><TituloAjuda
                        titulo="Sal. família"
                        ajuda="Cota por dependente elegível. O escritório adianta e compensa na guia do INSS — por isso entra no que a pessoa recebe, mas NÃO conta como custo do escritório."
                      /></TH>
                    <TH campo="desc_irrf" numerica className="hidden text-right text-xs xl:table-cell"><TituloAjuda titulo="IRRF" ajuda="Imposto de renda retido. Fica zero enquanto a tabela não for preenchida em Parâmetros." /></TH>
                    <TH campo="decimo_terceiro_pago" numerica className="hidden text-right text-xs xl:table-cell"><TituloAjuda titulo="13º pago" ajuda="Parcela do 13º paga neste mês. Entra no que a pessoa recebe mas NÃO soma custo — a despesa já foi provisionada 1/12 por mês." /></TH>
                    <TH campo="total_proventos" numerica className="bg-muted/40 text-right text-xs">
                      <TituloAjuda titulo="Total proventos"
                                   ajuda="Soma de TUDO que a pessoa recebe no mês, antes dos descontos — é o TOTAL DOS PROVENTOS do extrato da contabilidade. O salário entra pelo bruto do mês; se entrasse já descontado, os descontos contariam duas vezes e o líquido não fecharia." />
                    </TH>
                    <TH campo="total_descontos" numerica className="bg-muted/40 text-right text-xs">
                      <TituloAjuda titulo="Total descontos"
                                   ajuda="Soma de tudo que sai: INSS, desconto do vale-transporte e IRRF. Faltas e dias de férias NÃO entram aqui — eles reduzem o próprio salário do mês, não são desconto sobre ele." />
                    </TH>
                    <TH campo="total_pagar" numerica className="bg-muted/40 text-right text-xs"><TituloAjuda titulo="Líquido a pagar" ajuda={"O que a pessoa recebe: TOTAL DOS PROVENTOS menos TOTAL DOS DESCONTOS, as duas colunas ao lado. ATENÇÃO: o líquido do extrato da contabilidade pode ser menor, porque lá entram descontos que este sistema ainda não modela — adiantamento de férias já pago no recibo e empréstimo consignado. Passe o mouse no valor para ver a conta da linha."} /></TH>
                    <TH campo="custo_total" numerica className="hidden text-right text-xs sm:table-cell"><TituloAjuda titulo="Custo total" ajuda="Quanto essa pessoa custa ao escritório no mês, somando pagamento, provisões e encargos." /></TH>
                    {editar && aberta && <TableHead className="w-16 text-center text-xs">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}
                              className={editar && aberta ? "cursor-pointer hover:bg-muted/50" : ""}
                              onClick={() => editar && aberta && setLancando({ ...it, _aba: "faltas" } as DpFolhaItem)}
                              title={editar && aberta ? "Clique pra lançar faltas do mês" : ""}>
                      <TableCell className="font-mono text-xs">{it.matricula}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{it.nome}</span>
                          {it.ajuste_manual && (
                            <span title={`Ajuste pontual: ${it.ajuste_motivo}`}
                                  className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-semibold uppercase text-amber-800">
                              ajustado
                            </span>
                          )}
                          {it.em_rescisao && (
                            <span title="Colaborador desligado neste mês"
                                  className="shrink-0 rounded bg-rose-100 px-1 text-[9px] font-semibold uppercase text-rose-700">
                              rescisão
                            </span>
                          )}
                          {!!it.ferias_dias && (
                            <span title={`${it.ferias_dias} dia(s) de ${it.regime === "estagiario" ? "recesso" : "férias"}${it.ferias_inicio ? ` a partir de ${fmtData(it.ferias_inicio)}` : ""}`}
                                  className="shrink-0 rounded bg-emerald-100 px-1 text-[9px] font-semibold uppercase text-emerald-700">
                              {it.regime === "estagiario" ? "recesso" : "férias"} {it.ferias_dias}d
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="hidden max-w-[150px] truncate text-xs lg:table-cell">{it.centro_custo_nome}</TableCell>
                      <TableCell className="text-right font-mono text-xs"><Val v={it.salario_bruto} /></TableCell>
                      <TableCell className="hidden text-right font-mono text-xs sm:table-cell">
                        {it.faltas_dias > 0 || it.faltas_horas > 0
                          ? <span className="text-rose-600">{it.faltas_dias}d {it.faltas_horas}h</span> : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {/* Em mes com ferias o INSS tem TRES parcelas, e mostrar so'
                            o total fazia o numero parecer errado contra o recibo de
                            ferias — que traz apenas a primeira delas. */}
                        {it.inss_ferias || it.inss_dif_ferias ? (
                          <span
                            className="cursor-help border-b border-dotted border-rose-300"
                            title={
                              `INSS FÉRIAS ${fmtBRL(it.inss_ferias ?? 0)}\n`
                              + `INSS DIFERENÇA DE FÉRIAS ${fmtBRL(it.inss_dif_ferias ?? 0)}\n`
                              + `INSS DO SALÁRIO ${fmtBRL(it.inss_salario ?? 0)}\n`
                              + `${"—".repeat(28)}\n`
                              + `TOTAL ${fmtBRL(it.desc_inss)}   ·   base ${fmtBRL(it.base_inss ?? 0)}\n\n`
                              + `A tabela progressiva vale UMA vez sobre a base do mês. `
                              + `A parcela "diferença de férias" é o complemento que fecha `
                              + `essa conta — sem ela, a faixa inicial entraria duas vezes `
                              + `e a retenção sairia a menor.`
                            }>
                            <Val v={it.desc_inss} tipo="desconto" />
                          </span>
                        ) : (
                          <Val v={it.desc_inss} tipo="desconto" />
                        )}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs md:table-cell"><Val v={it.desc_vt} tipo="desconto" /></TableCell>
                      <TableCell className="hidden text-right font-mono text-xs xl:table-cell"><Val v={it.vt_com_faltas} tipo="provento" /></TableCell>
                      <TableCell className="hidden text-right font-mono text-xs xl:table-cell"><Val v={it.va_com_faltas} tipo="provento" /></TableCell>
                      <TableCell className="hidden text-right font-mono text-xs xl:table-cell"><Val v={it.salario_com_descontos} /></TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        <Val v={it.saldo_livre} tipo="provento" />
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {(() => {
                          const fer = (it.ferias_valor ?? 0) + (it.ferias_terco ?? 0) + (it.ferias_abono ?? 0);
                          return fer ? (
                            <span className="text-sky-700"
                                  title={`Férias ${fmtBRL(it.ferias_valor ?? 0)} + 1/3 ${fmtBRL(it.ferias_terco ?? 0)}`
                                         + ((it.ferias_abono ?? 0) ? ` + abono ${fmtBRL(it.ferias_abono ?? 0)}` : "")}>
                              +{fmtBRL(fer)}
                            </span>
                          ) : "—";
                        })()}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs xl:table-cell">
                        <Val v={it.acerto_contabil} tipo="provento"
                             titulo="Acerto contábil do mês — pode somar ou subtrair" />
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs md:table-cell">
                        <Val v={it.premiacoes} tipo="provento" />
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs lg:table-cell">
                        {it.salario_familia ? (
                          <span className="text-sky-700"
                                title={`${it.salario_familia_cotas} cota(s) — compensado na GPS, não é custo do escritório`}>
                            +{fmtBRL(it.salario_familia)}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs xl:table-cell">
                        <Val v={it.desc_irrf} tipo="desconto" />
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs xl:table-cell">
                        <Val v={it.decimo_terceiro_pago} tipo="provento" />
                      </TableCell>
                      <TableCell className="bg-muted/40 text-right font-mono text-xs">
                        <Val v={it.total_proventos} tipo="provento" />
                      </TableCell>
                      <TableCell className="bg-muted/40 text-right font-mono text-xs">
                        <Val v={it.total_descontos} tipo="desconto" />
                      </TableCell>
                      <TableCell className="bg-muted/40 text-right font-mono text-xs"
                                 title={`${fmtBRL(it.total_proventos ?? 0)} de proventos `
                                        + `− ${fmtBRL(it.total_descontos ?? 0)} de descontos `
                                        + `= ${fmtBRL(it.total_pagar)} líquido`}>
                        <Val v={it.total_pagar} tipo="total" />
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs sm:table-cell"><Val v={it.custo_total} tipo="total" /></TableCell>
                      {editar && aberta && (
                        // stopPropagation: o menu vive dentro da linha clicável e,
                        // sem isso, o clique borbulha e reabre sempre "faltas"
                        <TableCell className="text-center"
                                   onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                title="Lançar ocorrências deste colaborador"
                                className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel className="text-[11px]">
                                Ocorrências de {it.nome.split(" ")[0]}
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setLancando({ ...it, _aba: "faltas" } as DpFolhaItem)}>
                                <CalendarDays className="mr-2 h-4 w-4" /> Faltas (dias e horas)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setLancando({ ...it, _aba: "extras" } as DpFolhaItem)}>
                                <Coins className="mr-2 h-4 w-4" /> Premiações e acertos
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setFerias(it)}>
                                <Palmtree className="mr-2 h-4 w-4" />
                                {it.regime === "estagiario" ? "Recesso" : "Férias"}
                                {!!it.ferias_dias && <span className="ml-auto text-[10px] text-emerald-600">{it.ferias_dias}d</span>}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setAjustando(it)}>
                                <Sliders className="mr-2 h-4 w-4" /> Ajuste pontual (salário/benefícios)
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {!loading && items.length === 0 && (
                    <TableRow><TableCell colSpan={18} className="py-8 text-center text-sm text-muted-foreground">
                      Sem itens.
                    </TableCell></TableRow>
                  )}
                </TableBody>
                {totais && (
                  /* o extrato da contabilidade fecha com estes totais; sem eles
                     a conferencia tem que ser feita somando a mao */
                  <TableFooter className="sticky bottom-0 bg-card">
                    <TableRow className="border-t-2 hover:bg-transparent">
                      <TableCell colSpan={2} className="py-2 text-xs font-semibold">
                        Total da competência
                      </TableCell>
                      <TableCell className="py-2 text-right text-[11px] text-muted-foreground"
                                 colSpan={9}>
                        {total} pessoa(s)
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs">
                        <Val v={totais.total_proventos} tipo="provento" />
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs">
                        <Val v={totais.total_descontos} tipo="desconto" />
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-xs">
                        <Val v={totais.total_pagar} tipo="total" />
                      </TableCell>
                      <TableCell className="hidden py-2 text-right font-mono text-xs sm:table-cell">
                        <Val v={totais.custo_total} tipo="total" />
                      </TableCell>
                      {editar && aberta && <TableCell />}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </TabelaRolavel>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Página {pagina + 1} de {totalPaginas} · {total} linha(s)</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pagina === 0}
                        onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pagina + 1 >= totalPaginas}
                        onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      {editandoDias && (
        <Dialog open onOpenChange={(o) => !o && setEditandoDias(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4 text-[hsl(var(--dunatech-blue))]" />
                Dias do mês — {comp.mes_nome} {comp.ano}
              </DialogTitle>
              <DialogDescription>
                Os dias úteis vêm do calendário (segunda a sexta, sem feriados nacionais).
                Ajuste se o escritório teve ponto facultativo ou feriado municipal.
              </DialogDescription>
            </DialogHeader>
            {comp.calendario && (
              <div className="rounded-md border bg-muted/30 p-2 text-xs">
                <div className="font-medium">Sugestão do calendário: {comp.calendario.dias_uteis} dias úteis</div>
                <div className="text-muted-foreground">
                  {comp.calendario.dias_mes} dias no mês · {comp.calendario.fins_de_semana} de fim de semana
                  {comp.calendario.feriados.length > 0 && (
                    <> · feriados: {comp.calendario.feriados.map((f) => `${f.data} (${f.nome})`).join(", ")}</>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Dias do mês (base da folha)</Label>
                <Input type="number" value={diasMes} onChange={(e) => setDiasMes(Number(e.target.value))}
                       className="font-mono" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Dias úteis</Label>
                <Input type="number" value={diasUteis} onChange={(e) => setDiasUteis(Number(e.target.value))}
                       className="font-mono" />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Alterar recalcula a folha inteira (o desconto de vale-transporte e vale-alimentação
              usa os dias úteis).
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditandoDias(false)} disabled={agindo}>Cancelar</Button>
              <Button className="glass-button border-0" disabled={agindo}
                      onClick={() => { setEditandoDias(false);
                        acao(() => folhaApi.ajustarDias(comp.id, diasMes, diasUteis),
                             "Dias atualizados e folha recalculada."); }}>
                Salvar e recalcular
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {ajustando && (
        <AjusteDialog comp={comp} item={ajustando}
                      onClose={() => setAjustando(null)}
                      onAjustou={() => { setAjustando(null); carregarItens(); }} />
      )}

      {lancando && (
        <LancarDialog comp={comp} item={lancando}
                      onClose={() => setLancando(null)}
                      onLancou={() => { setLancando(null); carregarItens(); }} />
      )}

      {ferias && (
        <FeriasDialog comp={comp} item={ferias}
                      onClose={() => setFerias(null)}
                      onLancou={() => { setFerias(null); carregarItens(); }} />
      )}

      {reabrindo && (
        <Dialog open onOpenChange={(o) => !o && setReabrindo(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Reabrir {comp.mes_nome} {comp.ano}?</DialogTitle>
              <DialogDescription>
                A competência estava FECHADA. A reabertura fica registrada na auditoria com a justificativa.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label className="text-xs text-muted-foreground">Justificativa (mín. 10 caracteres)</Label>
              <Input value={justificativa} onChange={(e) => setJustificativa(e.target.value)} autoFocus />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReabrindo(false)}>Cancelar</Button>
              <Button variant="destructive" disabled={agindo || justificativa.trim().length < 10}
                      onClick={() => acao(() => folhaApi.reabrir(comp.id, justificativa.trim()), "Competência reaberta.")}>
                Reabrir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function TotalCard({ rotulo, valor, destaque, ajuda }: {
  rotulo: string; valor: number; destaque?: boolean; ajuda?: string;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${destaque ? "border-[hsl(var(--dunatech-blue))]/40 bg-[hsl(var(--dunatech-blue))]/5" : "bg-card/60"}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{rotulo}</span>{ajuda && <Ajuda titulo={rotulo} texto={ajuda} />}
      </div>
      <div className={`font-mono text-sm font-bold ${destaque ? "text-[hsl(var(--dunatech-blue))]" : ""}`}>{fmtBRL(valor)}</div>
    </div>
  );
}

function LancarDialog({ comp, item, onClose, onLancou }: {
  comp: DpCompetencia; item: DpFolhaItem & { _aba?: string }; onClose: () => void; onLancou: () => void;
}) {
  // o menu diz qual bloco abrir: "faltas" (padrão) ou "extras"
  const soFaltas = item._aba !== "extras";
  const soExtras = item._aba === "extras";
  const [faltasDatas, setFaltasDatas] = useState<FaltaDia[]>(item.faltas_datas ?? []);
  const [faltasHoras, setFaltasHoras] = useState(item.faltas_horas);
  const [premios, setPremios] = useState(item.premiacoes);
  const [acerto, setAcerto] = useState(item.acerto_contabil);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const lancar = async () => {
    setSalvando(true);
    try {
      const novo = await folhaApi.lancar(comp.id, {
        colaborador_id: item.colaborador_id,
        // o calendário é a fonte da verdade; faltas_dias vai junto só para as
        // telas e relatórios que ainda leem o contador
        faltas_datas: faltasDatas,
        faltas_dias: faltasDatas.length,
        faltas_horas: faltasHoras,
        premiacoes: premios, acerto_contabil: acerto, obs,
      });
      toast.success(`Linha recalculada — a pagar: ${fmtBRL(novo.total_pagar)}.`);
      onLancou();
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {soExtras ? <Coins className="h-4 w-4 text-emerald-600" />
                      : <CalendarDays className="h-4 w-4 text-[hsl(var(--dunatech-blue))]" />}
            {soExtras ? "Premiações e acertos" : "Faltas do mês"} — {item.nome}
          </DialogTitle>
          <DialogDescription>
            {soExtras
              ? "Valores que entram (prêmios) ou corrigem (acerto contábil) o pagamento deste mês."
              : `As faltas descontam o salário proporcionalmente e reduzem vale-transporte e vale-alimentação na proporção dos ${comp.dias_uteis} dias úteis.`}
          </DialogDescription>
        </DialogHeader>

        {soFaltas && (
          <div className="space-y-3">
            <CalendarioFaltas
              ano={comp.ano}
              mes={comp.mes}
              valor={faltasDatas}
              onChange={setFaltasDatas}
              diaria={item.salario_bruto / 30}
              temDsr={item.regime === "clt"}
            />
            <div>
              <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                Faltas em horas (atrasos e saídas)
                <Ajuda titulo="Faltas em horas"
                       texto="Atraso e saída antecipada não são um dia de calendário, então continuam em horas. Cada hora desconta o salário dividido pela carga mensal do cargo (220h no padrão) e vira fração de dia nos benefícios. Não gera perda de DSR." />
              </Label>
              <Input type="number" step="0.5" min={0} value={faltasHoras}
                     onChange={(e) => setFaltasHoras(Number(e.target.value))}
                     className="font-mono" />
              {faltasHoras > 0 && (
                <p className="mt-1 text-[0.7rem] text-muted-foreground">
                  {faltasHoras}h × {fmtBRL(item.salario_bruto / 220)} (salário ÷ 220h) ={" "}
                  <b>{fmtBRL((item.salario_bruto / 220) * faltasHoras)}</b>
                </p>
              )}
            </div>
          </div>
        )}

        {soExtras && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                Premiações / extras (R$)
                <Ajuda titulo="Premiações e extras" texto="Valores adicionais pagos no mês (bônus, produtividade). Somam ao líquido." />
              </Label>
              <Input type="number" step="0.01" value={premios}
                     onChange={(e) => setPremios(Number(e.target.value))} className="font-mono" />
            </div>
            <div>
              <Label className="flex items-center gap-1 text-xs text-muted-foreground">
                Acerto contábil (R$)
                <Ajuda titulo="Acerto contábil" texto="Correção de valores de meses anteriores. Pode ser positivo (a pagar) ou negativo (a descontar)." />
              </Label>
              <Input type="number" step="0.01" value={acerto}
                     onChange={(e) => setAcerto(Number(e.target.value))} className="font-mono" />
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs text-muted-foreground">Observação</Label>
          <Input value={obs} onChange={(e) => setObs(e.target.value)}
                 placeholder={soExtras ? "Ex.: bônus de produtividade do trimestre" : "Ex.: atestado sem comprovação"} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button className="glass-button border-0" onClick={lancar} disabled={salvando}>
            {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Lançar e recalcular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── AJUSTE PONTUAL (canetinha) ─────────────── */
// Corrige valores SÓ nesta competência, sem mexer na ficha do colaborador.
// Motivo é obrigatório e tudo fica registrado na auditoria.
function AjusteDialog({ comp, item, onClose, onAjustou }: {
  comp: DpCompetencia; item: DpFolhaItem; onClose: () => void; onAjustou: () => void;
}) {
  const [salario, setSalario] = useState<string>(String(item.salario_bruto ?? 0));
  const [vt, setVt] = useState<string>(String(item.vt ?? 0));
  const [va, setVa] = useState<string>(String(item.va ?? 0));
  const [saldo, setSaldo] = useState<string>(String(item.saldo_livre ?? 0));
  const [motivo, setMotivo] = useState(item.ajuste_motivo ?? "");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (motivo.trim().length < 5) { toast.error("Explique o motivo do ajuste (mín. 5 caracteres)."); return; }
    setSalvando(true);
    try {
      const novo = await folhaApi.ajustar(comp.id, {
        colaborador_id: item.colaborador_id,
        salario: Number(salario), vt: Number(vt), va: Number(va), saldo_livre: Number(saldo),
        motivo: motivo.trim(),
      });
      toast.success(`Ajuste aplicado — a pagar: ${fmtBRL(novo.total_pagar)}.`);
      onAjustou();
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  };

  const limpar = async () => {
    if (motivo.trim().length < 5) { toast.error("Explique o motivo de remover o ajuste."); return; }
    setSalvando(true);
    try {
      await folhaApi.ajustar(comp.id, {
        colaborador_id: item.colaborador_id, salario: null, vt: null, va: null,
        saldo_livre: null, motivo: motivo.trim(),
      });
      toast.success("Ajuste removido — voltou aos valores da ficha.");
      onAjustou();
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <PencilLine className="h-4 w-4 text-amber-600" />
            Ajuste pontual — {item.nome}
          </DialogTitle>
          <DialogDescription>
            Vale <b>apenas para {comp.mes_nome} {comp.ano}</b>. A ficha do colaborador
            não muda e o ajuste fica registrado no histórico com o seu nome.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Use para corrigir algo específico do mês (ex.: salário proporcional, vale a maior).
          Para mudança definitiva, edite a ficha no Quadro de Pessoal.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs text-muted-foreground">Salário bruto (R$)</Label>
            <Input type="number" step="0.01" value={salario} onChange={(e) => setSalario(e.target.value)}
                   className="font-mono text-sm" /></div>
          <div><Label className="text-xs text-muted-foreground">Saldo livre (R$)</Label>
            <Input type="number" step="0.01" value={saldo} onChange={(e) => setSaldo(e.target.value)}
                   className="font-mono text-sm" /></div>
          <div><Label className="text-xs text-muted-foreground">Vale-transporte (R$)</Label>
            <Input type="number" step="0.01" value={vt} onChange={(e) => setVt(e.target.value)}
                   className="font-mono text-sm" /></div>
          <div><Label className="text-xs text-muted-foreground">Vale-alimentação (R$)</Label>
            <Input type="number" step="0.01" value={va} onChange={(e) => setVa(e.target.value)}
                   className="font-mono text-sm" /></div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Motivo do ajuste *</Label>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus
                   placeholder="Ex.: admissão no dia 15, salário proporcional" className="text-sm" />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {item.ajuste_manual && (
            <Button variant="outline" className="mr-auto text-xs" onClick={limpar} disabled={salvando}>
              Remover ajuste
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button className="glass-button border-0" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Aplicar ajuste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
