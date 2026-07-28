// DP — F2: aba "Folha" — esteira da competência mensal.
// Aberta → lançar ocorrências/recalcular → Em revisão → Fechada (4-olhos).
// Fechada é intocável (reabrir só com justificativa, tudo auditado).
import { useCallback, useEffect, useState } from "react";
import {
  CalendarPlus, CheckCircle2, Download, FileText, Loader2, Lock, PieChart,
  RefreshCw, Search, SendHorizonal, Unlock,
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Ajuda, TituloAjuda } from "@/components/dp/Ajuda";
import {
  type DpCompetencia, type DpFolhaItem, type DpFolhaTotais, type DpRateioLinha,
  REGIME_LABELS, fmtBRL, folhaApi, relatoriosApi,
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
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [totais, setTotais] = useState<DpFolhaTotais | null>(null);
  const [items, setItems] = useState<DpFolhaItem[]>([]);
  const [rateio, setRateio] = useState<DpRateioLinha[]>([]);
  const [verRateio, setVerRateio] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agindo, setAgindo] = useState(false);
  const [lancando, setLancando] = useState<DpFolhaItem | null>(null);
  const [reabrindo, setReabrindo] = useState(false);
  const [justificativa, setJustificativa] = useState("");

  const fechada = comp.status === "fechada";
  const aberta = comp.status === "aberta";

  const carregarItens = useCallback(() => {
    setLoading(true);
    folhaApi.itens(comp.id, { busca, regime: regime === TODOS ? "" : regime, limit: PAGE, offset: pagina * PAGE })
      .then((r) => { setItems(r.items); setTotal(r.total); setTotais(r.totais); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
    folhaApi.rateio(comp.id).then(setRateio).catch(() => undefined);
  }, [comp.id, busca, regime, pagina]);
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
                <Button size="sm" className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700" disabled={agindo}
                        onClick={() => acao(() => folhaApi.aprovar(comp.id), "Competência FECHADA (snapshot congelado).")}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Aprovar e fechar
                </Button>
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
          <span>{comp.dias_mes} dias · {comp.dias_uteis} úteis</span>
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
              <SelectItem value={TODOS}>Todos os regimes</SelectItem>
              {Object.entries(REGIME_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
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
              <PieChart className="h-3.5 w-3.5" /> Rateio por CC
            </Button>
          </div>
        </div>

        {verRateio ? (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Centro de Custo</TableHead>
                  <TableHead className="text-right text-xs">Pessoas</TableHead>
                  <TableHead className="text-right text-xs">
                    <TituloAjuda titulo="Folha" ajuda="Valor efetivamente pago às pessoas no mês (salário com descontos + benefícios + prêmios)." />
                  </TableHead>
                  <TableHead className="text-right text-xs">
                    <TituloAjuda titulo="Provisões" ajuda="Valor reservado por mês para 13º, férias + 1/3, FGTS, multa do FGTS e recesso de estagiários." />
                  </TableHead>
                  <TableHead className="text-right text-xs">
                    <TituloAjuda titulo="INSS patronal" ajuda="Parte do INSS paga pela empresa (não descontada do colaborador)." />
                  </TableHead>
                  <TableHead className="text-right text-xs">Custo total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rateio.map((l) => (
                  <TableRow key={l.centro_custo_nome}>
                    <TableCell className="text-sm font-medium">{l.centro_custo_nome}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{l.headcount}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtBRL(l.folha)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtBRL(l.provisoes)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtBRL(l.patronal)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">{fmtBRL(l.custo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Matrícula</TableHead>
                    <TableHead className="text-xs">Nome</TableHead>
                    <TableHead className="hidden text-xs lg:table-cell">Centro de custo</TableHead>
                    <TableHead className="text-right text-xs">
                      <TituloAjuda titulo="Salário bruto" ajuda="Salário cadastrado, antes de qualquer desconto." />
                    </TableHead>
                    <TableHead className="hidden text-right text-xs sm:table-cell">
                      <TituloAjuda titulo="Faltas" ajuda="Dias e horas de falta lançados no mês — geram desconto proporcional." />
                    </TableHead>
                    <TableHead className="text-right text-xs">
                      <TituloAjuda titulo="INSS" ajuda="Desconto do INSS do colaborador, calculado pela tabela progressiva vigente (só CLT)." />
                    </TableHead>
                    <TableHead className="hidden text-right text-xs md:table-cell">
                      <TituloAjuda titulo="Vale-transporte" ajuda="Desconto de até 6% do salário, previsto em lei, para quem opta pelo vale (só CLT)." />
                    </TableHead>
                    <TableHead className="hidden text-right text-xs md:table-cell">Prêmios</TableHead>
                    <TableHead className="text-right text-xs">
                      <TituloAjuda titulo="A pagar" ajuda="Valor líquido que a pessoa recebe no mês." />
                    </TableHead>
                    <TableHead className="hidden text-right text-xs sm:table-cell">
                      <TituloAjuda titulo="Custo total" ajuda="Quanto essa pessoa custa ao escritório no mês, somando pagamento, provisões e encargos." />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}
                              className={editar && aberta ? "cursor-pointer hover:bg-muted/50" : ""}
                              onClick={() => editar && aberta && setLancando(it)}
                              title={editar && aberta ? "Clique pra lançar faltas/prêmios" : ""}>
                      <TableCell className="font-mono text-xs">{it.matricula}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm">{it.nome}</TableCell>
                      <TableCell className="hidden max-w-[150px] truncate text-xs lg:table-cell">{it.centro_custo_nome}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtBRL(it.salario_bruto)}</TableCell>
                      <TableCell className="hidden text-right font-mono text-xs sm:table-cell">
                        {it.faltas_dias > 0 || it.faltas_horas > 0
                          ? <span className="text-rose-600">{it.faltas_dias}d {it.faltas_horas}h</span> : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtBRL(it.desc_inss)}</TableCell>
                      <TableCell className="hidden text-right font-mono text-xs md:table-cell">{fmtBRL(it.desc_vt)}</TableCell>
                      <TableCell className="hidden text-right font-mono text-xs md:table-cell">
                        {it.premiacoes ? <span className="text-emerald-700">{fmtBRL(it.premiacoes)}</span> : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">{fmtBRL(it.total_pagar)}</TableCell>
                      <TableCell className="hidden text-right font-mono text-xs sm:table-cell">{fmtBRL(it.custo_total)}</TableCell>
                    </TableRow>
                  ))}
                  {!loading && items.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                      Sem itens.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
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

      {lancando && (
        <LancarDialog comp={comp} item={lancando}
                      onClose={() => setLancando(null)}
                      onLancou={() => { setLancando(null); carregarItens(); }} />
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
  comp: DpCompetencia; item: DpFolhaItem; onClose: () => void; onLancou: () => void;
}) {
  const [faltasDias, setFaltasDias] = useState(item.faltas_dias);
  const [faltasHoras, setFaltasHoras] = useState(item.faltas_horas);
  const [premios, setPremios] = useState(item.premiacoes);
  const [acerto, setAcerto] = useState(item.acerto_contabil);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  const lancar = async () => {
    setSalvando(true);
    try {
      const novo = await folhaApi.lancar(comp.id, {
        colaborador_id: item.colaborador_id, faltas_dias: faltasDias, faltas_horas: faltasHoras,
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
          <DialogTitle className="text-base">
            Lançamentos — <span className="font-mono text-sm text-muted-foreground">#{item.matricula}</span> {item.nome}
          </DialogTitle>
          <DialogDescription>A linha é recalculada na hora (memória de cálculo na auditoria).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs text-muted-foreground">Faltas (dias)</Label>
            <Input type="number" step="0.5" value={faltasDias} onChange={(e) => setFaltasDias(Number(e.target.value))} /></div>
          <div><Label className="text-xs text-muted-foreground">Faltas (horas)</Label>
            <Input type="number" step="0.5" value={faltasHoras} onChange={(e) => setFaltasHoras(Number(e.target.value))} /></div>
          <div><Label className="text-xs text-muted-foreground">Premiações/Extras (R$)</Label>
            <Input type="number" step="0.01" value={premios} onChange={(e) => setPremios(Number(e.target.value))} /></div>
          <div><Label className="text-xs text-muted-foreground">Acerto contábil (R$)</Label>
            <Input type="number" step="0.01" value={acerto} onChange={(e) => setAcerto(Number(e.target.value))} /></div>
          <div className="col-span-2"><Label className="text-xs text-muted-foreground">Observação</Label>
            <Input value={obs} onChange={(e) => setObs(e.target.value)} /></div>
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
