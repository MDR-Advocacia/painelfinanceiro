// Módulo Controle de Pessoal (DP) — F1: Quadro de Pessoal + ficha com histórico,
// admissão/desligamento, catálogos (cargos/CCs), importador da planilha e
// trilha de auditoria. RBAC: "ver" navega; "editar" altera (botões somem sem permissão).
import { useCallback, useEffect, useState } from "react";
import {
  Contact, Download, FileSpreadsheet, LayoutDashboard, Loader2, Plus, RefreshCw,
  FileText, ScrollText, Search, Sliders, TrendingUp, UserMinus, UserSearch, Users,
  Wallet, X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import DashboardDpTab, { type FiltroQuadro } from "@/components/dp/DashboardDpTab";
import DesligamentoDialog from "@/components/dp/DesligamentoDialog";
import { Ajuda, TituloAjuda } from "@/components/dp/Ajuda";
import ParametrosTab from "@/components/dp/ParametrosTab";
import SimulacoesTab from "@/components/dp/SimulacoesTab";
import FolhaTab from "@/components/dp/FolhaTab";
import { CcPicker, ColaboradorPicker, LiderancaPicker, invalidarArvoreCc } from "@/components/dp/Pickers";
import { usePermissions } from "@/hooks/usePermissions";
import {
  type DpAuditFiltros, type DpCargo, type DpCentroCusto, type DpColaborador,
  type DpEvento, type DpLideranca, type DpResumo,
  REGIME_LABELS, dpApi, exportApi, fmtBRL, fmtData,
} from "@/services/dp";

const PAGE = 50;
const TODOS = "__todos__";

const REGIME_BADGE: Record<string, string> = {
  estagiario: "bg-sky-100 text-sky-700",
  clt: "bg-emerald-100 text-emerald-700",
  associado: "bg-violet-100 text-violet-700",
  pj: "bg-amber-100 text-amber-800",
};

const EVENTO_LABEL: Record<string, string> = {
  admissao: "Admissão", desligamento: "Desligamento", transferencia_cc: "Transferência de CC",
  reajuste: "Reajuste salarial", edicao: "Edição cadastral", importacao: "Importado da planilha",
};

export default function Pessoal() {
  const { podeEditar } = usePermissions();
  const editar = podeEditar("pessoal");
  // aba controlada: o painel manda abrir o Quadro já filtrado (drill-down)
  const [aba, setAba] = useState("dash");
  const [filtroQuadro, setFiltroQuadro] = useState<FiltroQuadro | null>(null);
  const [rotuloFiltro, setRotuloFiltro] = useState("");

  const [resumo, setResumo] = useState<DpResumo | null>(null);
  const [ccs, setCcs] = useState<DpCentroCusto[]>([]);
  const [cargos, setCargos] = useState<DpCargo[]>([]);

  const carregarBase = useCallback(() => {
    dpApi.resumo().then(setResumo).catch(() => undefined);
    dpApi.ccs().then(setCcs).catch(() => undefined);
    dpApi.cargos().then(setCargos).catch(() => undefined);
  }, []);
  useEffect(() => { carregarBase(); }, [carregarBase]);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold text-foreground">Controle de Pessoal</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Quadro, admissões, desligamentos e centros de custo — com trilha de auditoria.
          </p>
        </div>
        {resumo && (
          <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:grid-cols-6">
            <KPI label="Ativos" valor={resumo.ativos} />
            <KPI label="CLT" valor={resumo.por_regime.clt} />
            <KPI label="Estagiários" valor={resumo.por_regime.estagiario} />
            <KPI label="Associados" valor={resumo.por_regime.associado} />
            <KPI label="PJ" valor={resumo.por_regime.pj} />
            <KPI label="Desligados" valor={resumo.inativos} tom="rose" />
          </div>
        )}
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="dash" className="gap-2"><LayoutDashboard className="h-4 w-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="quadro" className="gap-2"><Users className="h-4 w-4" /> Quadro</TabsTrigger>
          <TabsTrigger value="folha" className="gap-2"><Wallet className="h-4 w-4" /> Folha</TabsTrigger>
          <TabsTrigger value="simulacoes" className="gap-2"><TrendingUp className="h-4 w-4" /> Previsão</TabsTrigger>
          <TabsTrigger value="parametros" className="gap-2"><Sliders className="h-4 w-4" /> Parâmetros</TabsTrigger>
          {editar && (
            <TabsTrigger value="importar" className="gap-2"><FileSpreadsheet className="h-4 w-4" /> Importar</TabsTrigger>
          )}
          <TabsTrigger value="auditoria" className="gap-2"><ScrollText className="h-4 w-4" /> Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="dash" className="mt-4">
          <DashboardDpTab onAbrirQuadro={(f, rotulo) => {
            setFiltroQuadro(f);
            setRotuloFiltro(rotulo);
            setAba("quadro");
          }} />
        </TabsContent>
        <TabsContent value="quadro" className="mt-4">
          <QuadroTab ccs={ccs} cargos={cargos} editar={editar} onMudou={carregarBase}
                     filtroExterno={filtroQuadro} rotuloFiltro={rotuloFiltro}
                     onLimparFiltroExterno={() => { setFiltroQuadro(null); setRotuloFiltro(""); }} />
        </TabsContent>
        <TabsContent value="folha" className="mt-4">
          <FolhaTab editar={editar} />
        </TabsContent>
        <TabsContent value="simulacoes" className="mt-4">
          <SimulacoesTab ccs={ccs} cargos={cargos} />
        </TabsContent>
        <TabsContent value="parametros" className="mt-4">
          <ParametrosTab ccs={ccs} cargos={cargos} editar={editar} onMudou={carregarBase} />
        </TabsContent>
        {editar && (
          <TabsContent value="importar" className="mt-4">
            <ImportarTab onImportou={carregarBase} />
          </TabsContent>
        )}
        <TabsContent value="auditoria" className="mt-4">
          <AuditoriaTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KPI({ label, valor, tom }: { label: string; valor: number; tom?: "rose" }) {
  return (
    <div className="glass-card rounded-lg border-0 px-4 py-2 text-center">
      <div className={`font-mono text-lg font-bold ${tom === "rose" ? "text-rose-600" : "text-foreground"}`}>{valor}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

/* ─────────────────────────── QUADRO ─────────────────────────── */

function QuadroTab({ ccs, cargos, editar, onMudou, filtroExterno, rotuloFiltro, onLimparFiltroExterno }: {
  ccs: DpCentroCusto[]; cargos: DpCargo[]; editar: boolean; onMudou: () => void;
  filtroExterno?: FiltroQuadro | null; rotuloFiltro?: string;
  onLimparFiltroExterno?: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [regime, setRegime] = useState(TODOS);
  const [status, setStatus] = useState("ativo");
  const [cc, setCc] = useState(TODOS);
  const [unidade, setUnidade] = useState("");
  const [supervisor, setSupervisor] = useState<string | null>(null);

  // drill-down do painel: aplica o filtro que veio de lá
  useEffect(() => {
    if (!filtroExterno) return;
    setRegime(filtroExterno.regime ?? TODOS);
    setStatus(filtroExterno.status ?? TODOS);
    setCc(filtroExterno.cc ?? TODOS);
    setUnidade(filtroExterno.unidade ?? "");
    setBusca(filtroExterno.busca ?? "");
    setPagina(0);
  }, [filtroExterno]);
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<DpColaborador[]>([]);
  const [loading, setLoading] = useState(false);
  const [ficha, setFicha] = useState<DpColaborador | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    dpApi.listar({
      busca, regime: regime === TODOS ? "" : regime, status: status === TODOS ? "" : status,
      cc: cc === TODOS ? "" : cc, unidade, supervisor: supervisor ?? "",
      limit: PAGE, offset: pagina * PAGE,
    })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [busca, regime, status, cc, unidade, supervisor, pagina]);
  useEffect(() => { carregar(); }, [carregar]);

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE));

  return (
    <Card className="glass-card border-0">
      <CardContent className="space-y-3 pt-5">
        {(rotuloFiltro || unidade) && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[hsl(var(--dunatech-blue))]/30 bg-[hsl(var(--dunatech-blue))]/5 px-3 py-2 text-xs">
            <span className="font-medium">
              Filtrado pelo painel{rotuloFiltro ? `: ${rotuloFiltro}` : ""}
              {unidade ? ` · unidade ${unidade}` : ""}
            </span>
            <button className="ml-auto text-[hsl(var(--dunatech-blue))] hover:underline"
                    onClick={() => {
                      setRegime(TODOS); setStatus("ativo"); setCc(TODOS); setUnidade(""); setBusca("");
                      onLimparFiltroExterno?.();
                    }}>
              limpar filtro
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Nome, matrícula ou CPF…"
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
              className="h-9 w-64 pl-8 text-sm"
            />
          </div>
          <Select value={regime} onValueChange={(v) => { setRegime(v); setPagina(0); }}>
            <SelectTrigger className="h-9 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os regimes</SelectItem>
              {Object.entries(REGIME_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPagina(0); }}>
            <SelectTrigger className="h-9 w-[120px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ativo">Ativos</SelectItem>
              <SelectItem value="inativo">Desligados</SelectItem>
              <SelectItem value={TODOS}>Todos</SelectItem>
            </SelectContent>
          </Select>
          <CcPicker valor={cc} rotuloTodos="Todos os centros de custo" comSubnucleos
                    className="w-[230px] text-xs"
                    onChange={(v) => { setCc(v); setPagina(0); }} />
          <LiderancaPicker papel="supervisor" valor={supervisor} permiteCriar={false}
                           rotuloVazio="Todos os supervisores" className="w-[200px] text-xs"
                           onChange={(id) => { setSupervisor(id); setPagina(0); }} />
          <button onClick={carregar} className="ml-1 text-muted-foreground hover:text-foreground" title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Button size="sm" variant="outline" className="ml-auto gap-1"
                  onClick={() => exportApi.quadro(status === TODOS ? "" : status, "excel").catch((e) => toast.error(e.message))}>
            <Download className="h-4 w-4" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="gap-1"
                  onClick={() => exportApi.quadro(status === TODOS ? "" : status, "pdf").catch((e) => toast.error(e.message))}>
            <FileText className="h-4 w-4" /> PDF
          </Button>
          {editar && (
            <Button size="sm" className="glass-button gap-1 border-0" onClick={() => setNovoAberto(true)}>
              <Plus className="h-4 w-4" /> Admitir colaborador
            </Button>
          )}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">
                  <TituloAjuda titulo="Matrícula" ajuda="Número interno do colaborador. A faixa indica o tipo de contrato: 10xx estagiário, 20xx CLT, 30xx associado, 40xx PJ." />
                </TableHead>
                <TableHead className="text-xs">Nome</TableHead>
                <TableHead className="text-xs">
                  <TituloAjuda titulo="Contrato" ajuda="Tipo de vínculo: Estagiário (TCE), CLT, Associado ou PJ. Define quais encargos e provisões se aplicam." />
                </TableHead>
                <TableHead className="hidden text-xs md:table-cell">Cargo</TableHead>
                <TableHead className="hidden text-xs lg:table-cell">
                  <TituloAjuda titulo="Centro de custo" ajuda="Setor ou carteira que recebe o custo desta pessoa no rateio mensal." />
                </TableHead>
                <TableHead className="hidden text-xs lg:table-cell">Unidade</TableHead>
                <TableHead className="text-right text-xs">
                  <TituloAjuda titulo="Salário bruto" ajuda="Valor do salário antes dos descontos (INSS, vale-transporte)." />
                </TableHead>
                <TableHead className="text-center text-xs">Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((c) => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setFicha(c)}>
                  <TableCell className="font-mono text-xs">{c.matricula}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-sm font-medium">{c.nome}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${REGIME_BADGE[c.regime]}`}>
                      {c.regime_label}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-[170px] truncate text-xs md:table-cell">{c.cargo_nome || "—"}</TableCell>
                  <TableCell className="hidden max-w-[180px] truncate text-xs lg:table-cell">{c.centro_custo_nome}</TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">{c.unidade || "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{fmtBRL(c.salario_bruto)}</TableCell>
                  <TableCell className="text-center">
                    {c.status === "ativo"
                      ? <Badge className="bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100">Ativo</Badge>
                      : <Badge className="bg-rose-100 text-[10px] text-rose-700 hover:bg-rose-100">Desligado</Badge>}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && items.length === 0 && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  Nada encontrado com esses filtros.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Página {pagina + 1} de {totalPaginas} · {total} colaborador(es)</span>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pagina === 0}
                    onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pagina + 1 >= totalPaginas}
                    onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      </CardContent>

      {ficha && (
        <FichaDialog
          colaborador={ficha} ccs={ccs} cargos={cargos} editar={editar}
          onClose={() => setFicha(null)}
          onMudou={() => { carregar(); onMudou(); }}
        />
      )}
      {novoAberto && (
        <NovoDialog
          ccs={ccs} cargos={cargos}
          onClose={() => setNovoAberto(false)}
          onCriou={() => { setNovoAberto(false); carregar(); onMudou(); }}
        />
      )}
    </Card>
  );
}

/* ─────────────────────────── FICHA ─────────────────────────── */

function FichaDialog({ colaborador, ccs, cargos, editar, onClose, onMudou }: {
  colaborador: DpColaborador; ccs: DpCentroCusto[]; cargos: DpCargo[];
  editar: boolean; onClose: () => void; onMudou: () => void;
}) {
  const [c, setC] = useState<DpColaborador>({ ...colaborador });
  const [eventos, setEventos] = useState<DpEvento[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [desligarAberto, setDesligarAberto] = useState(false);

  useEffect(() => {
    dpApi.eventos(colaborador.id).then(setEventos).catch(() => undefined);
  }, [colaborador.id]);

  const set = (k: keyof DpColaborador, v: unknown) => setC((prev) => ({ ...prev, [k]: v }));

  const salvar = async () => {
    setSalvando(true);
    try {
      await dpApi.atualizar(c.id, {
        nome: c.nome, cpf: c.cpf, sexo: c.sexo, unidade: c.unidade, area: c.area,
        centro_custo_id: c.centro_custo_id, supervisor_id: c.supervisor_id,
        coordenador_id: c.coordenador_id, equipe: c.equipe,
        cargo_id: c.cargo_id, salario_bruto: Number(c.salario_bruto) || 0,
        saldo_livre: Number(c.saldo_livre) || 0, vt: Number(c.vt) || 0,
        va: Number(c.va) || 0, opta_vt: c.opta_vt, pix: c.pix,
        conta_bb: c.conta_bb, conta_caixa: c.conta_caixa,
      } as Partial<DpColaborador>);
      toast.success("Ficha atualizada.");
      onMudou(); onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  };

  const ro = !editar;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">#{c.matricula}</span>
            {c.nome}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${REGIME_BADGE[c.regime]}`}>{c.regime_label}</span>
            {c.status === "inativo" && <Badge className="bg-rose-100 text-[10px] text-rose-700">Desligado em {fmtData(c.data_demissao)}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {editar ? "Edite os campos e salve — toda alteração fica na auditoria." : "Visualização (seu cargo não edita este módulo)."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <CampoTexto rotulo="Nome completo" valor={c.nome} onChange={(v) => set("nome", v)} ro={ro} className="col-span-2" />
          <CampoTexto rotulo="CPF" valor={c.cpf} onChange={(v) => set("cpf", v)} ro={ro} />
          <CampoTexto rotulo="Unidade" valor={c.unidade} onChange={(v) => set("unidade", v)} ro={ro} />
          <div>
            <Label className="flex items-center gap-1 text-xs text-muted-foreground">
              Centro de Custo
              <Ajuda titulo="Centro de custo"
                     texto="Segue a mesma árvore do módulo: o núcleo (Réu, Autor, ADM…) agrupa os subnúcleos. A pessoa fica sempre no subnúcleo em que trabalha — o custo sobe para o núcleo sozinho." />
            </Label>
            <CcPicker valor={c.centro_custo_id} ro={ro} className="w-full"
                      onChange={(v) => set("centro_custo_id", v)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Cargo</Label>
            <Select value={c.cargo_id ?? "__sem__"} onValueChange={(v) => set("cargo_id", v === "__sem__" ? null : v)} disabled={ro}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__sem__">— Sem cargo —</SelectItem>
                {cargos.map((x) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="flex items-center gap-1 text-xs text-muted-foreground">
              Supervisor
              <Ajuda titulo="Supervisor"
                     texto="Vem do catálogo de lideranças (aba Parâmetros). Digite para buscar; se o nome ainda não existir, dá para cadastrar na hora." />
            </Label>
            <LiderancaPicker papel="supervisor" valor={c.supervisor_id} valorNome={c.supervisor_nome}
                             ro={ro}
                             onChange={(id, nome) => setC((s) => ({ ...s, supervisor_id: id, supervisor_nome: nome }))} />
          </div>
          <div>
            <Label className="flex items-center gap-1 text-xs text-muted-foreground">
              Coordenador
              <Ajuda titulo="Coordenador"
                     texto="Também vem do catálogo de lideranças. A mesma pessoa pode ser supervisora de uma equipe e coordenadora de outra." />
            </Label>
            <LiderancaPicker papel="coordenador" valor={c.coordenador_id} valorNome={c.coordenador_nome}
                             ro={ro}
                             onChange={(id, nome) => setC((s) => ({ ...s, coordenador_id: id, coordenador_nome: nome }))} />
          </div>
          <CampoTexto rotulo="Equipe" valor={c.equipe} onChange={(v) => set("equipe", v)} ro={ro} />
          <div>
            <Label className="text-xs text-muted-foreground">Sexo</Label>
            <Select value={c.sexo || "-"} onValueChange={(v) => set("sexo", v === "-" ? "" : v)} disabled={ro}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-">Não informado</SelectItem>
                <SelectItem value="M">Masculino</SelectItem>
                <SelectItem value="F">Feminino</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CampoTexto rotulo="Área" valor={c.area} onChange={(v) => set("area", v)} ro={ro} />
          <CampoNum rotulo="Salário bruto (R$)" valor={c.salario_bruto} onChange={(v) => set("salario_bruto", v)} ro={ro} />
          <CampoNum rotulo="Saldo livre (R$)" valor={c.saldo_livre} onChange={(v) => set("saldo_livre", v)} ro={ro} />
          <CampoNum rotulo="VT (R$)" valor={c.vt} onChange={(v) => set("vt", v)} ro={ro} />
          <CampoNum rotulo="VA (R$)" valor={c.va} onChange={(v) => set("va", v)} ro={ro} />
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <Checkbox checked={c.opta_vt} onCheckedChange={(v) => set("opta_vt", !!v)} disabled={ro} />
            Opta pelo VT (desconto de 6% — só CLT)
          </label>
          <CampoTexto rotulo="Chave PIX" valor={c.pix} onChange={(v) => set("pix", v)} ro={ro} />
          <CampoTexto rotulo="Conta Banco do Brasil" valor={c.conta_bb} onChange={(v) => set("conta_bb", v)} ro={ro} />
          <CampoTexto rotulo="Conta Caixa" valor={c.conta_caixa} onChange={(v) => set("conta_caixa", v)} ro={ro} />
          <div className="col-span-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <span>Entrada: <b>{fmtData(c.data_entrada)}</b></span>
            <span>Admissão: <b>{fmtData(c.data_admissao)}</b></span>
            <span>Demissão: <b>{fmtData(c.data_demissao)}</b></span>
          </div>
        </div>

        {/* Histórico de eventos */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-1.5 text-xs font-semibold text-muted-foreground">Histórico</div>
          {eventos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem eventos registrados.</p>
          ) : (
            <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
              {eventos.map((e, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="shrink-0 font-mono text-muted-foreground">{fmtData(e.data_efeito)}</span>
                  <span className="font-medium">{EVENTO_LABEL[e.tipo] || e.tipo}</span>
                  {e.tipo === "reajuste" && (
                    <span className="text-muted-foreground">{fmtBRL(Number((e.payload as any).de))} → {fmtBRL(Number((e.payload as any).para))}</span>
                  )}
                  {e.tipo === "transferencia_cc" && (
                    <span className="text-muted-foreground">{String((e.payload as any).de)} → {String((e.payload as any).para)}</span>
                  )}
                  {e.autor && <span className="ml-auto shrink-0 text-muted-foreground/60">{e.autor}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="gap-2">
          {editar && c.status === "ativo" && (
            <Button variant="outline" className="mr-auto gap-1 border-rose-300 text-rose-700 hover:bg-rose-50"
                    onClick={() => setDesligarAberto(true)} disabled={salvando}>
              <UserMinus className="h-4 w-4" /> Desligar
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={salvando}>Fechar</Button>
          {editar && (
            <Button className="glass-button border-0" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Salvar
            </Button>
          )}
        </DialogFooter>

        {desligarAberto && (
          <DesligamentoDialog
            colaborador={c}
            onClose={() => setDesligarAberto(false)}
            onConcluido={() => { onMudou(); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CampoTexto({ rotulo, valor, onChange, ro, className }: {
  rotulo: string; valor: string; onChange: (v: string) => void; ro: boolean; className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{rotulo}</Label>
      <Input value={valor || ""} onChange={(e) => onChange(e.target.value)} disabled={ro} className="h-9 text-sm" />
    </div>
  );
}

function CampoNum({ rotulo, valor, onChange, ro }: {
  rotulo: string; valor: number; onChange: (v: number) => void; ro: boolean;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{rotulo}</Label>
      <Input type="number" step="0.01" value={valor ?? 0}
             onChange={(e) => onChange(Number(e.target.value))} disabled={ro} className="h-9 font-mono text-sm" />
    </div>
  );
}

/* ─────────────────────────── ADMISSÃO ─────────────────────────── */

function NovoDialog({ ccs, cargos, onClose, onCriou }: {
  ccs: DpCentroCusto[]; cargos: DpCargo[]; onClose: () => void; onCriou: () => void;
}) {
  const [regime, setRegime] = useState("clt");
  const [proxMat, setProxMat] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [unidade, setUnidade] = useState("Capim Macio");
  const [ccId, setCcId] = useState("");
  const [cargoId, setCargoId] = useState("");
  const [sexo, setSexo] = useState("");
  const [area, setArea] = useState("JUR");
  const [supervisor, setSupervisor] = useState<string | null>(null);
  const [coordenador, setCoordenador] = useState<string | null>(null);
  const [equipe, setEquipe] = useState("");
  const [contaBb, setContaBb] = useState("");
  const [pix, setPix] = useState("");
  const [contaCaixa, setContaCaixa] = useState("");
  const [dataAdm, setDataAdm] = useState(new Date().toISOString().slice(0, 10));
  const [salario, setSalario] = useState(0);
  const [vt, setVt] = useState(0);
  const [va, setVa] = useState(0);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setProxMat(null);
    dpApi.proximaMatricula(regime).then((r) => setProxMat(r.matricula)).catch(() => undefined);
  }, [regime]);

  // Escolher o cargo sugere o salário base do plano de cargos
  useEffect(() => {
    const cg = cargos.find((x) => x.id === cargoId);
    if (cg && cg.salario_base > 0) setSalario(cg.salario_base);
  }, [cargoId, cargos]);

  const criar = async () => {
    if (!nome.trim() || !ccId) { toast.error("Nome e Centro de Custo são obrigatórios."); return; }
    setSalvando(true);
    try {
      await dpApi.criar({
        nome: nome.trim().toUpperCase(), cpf, sexo, unidade, area, regime,
        centro_custo_id: ccId, cargo_id: cargoId || null,
        supervisor_id: supervisor, coordenador_id: coordenador, equipe,
        conta_bb: contaBb, pix, conta_caixa: contaCaixa,
        data_admissao: dataAdm, salario_bruto: salario, vt, va, status: "ativo",
      } as Partial<DpColaborador>);
      toast.success(`Colaborador(a) admitido(a) — matrícula ${proxMat ?? "gerada"}.`);
      onCriou();
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Admitir colaborador</DialogTitle>
          <DialogDescription>
            A matrícula é gerada pela lógica da casa (Estagiário 10xx · CLT 20xx · Associado 30xx · PJ 40xx).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Regime</Label>
            <Select value={regime} onValueChange={setRegime}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(REGIME_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Matrícula (automática)</Label>
            <Input value={proxMat ?? "…"} disabled className="h-9 font-mono text-sm" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">Nome completo</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">CPF</Label>
            <Input value={cpf} onChange={(e) => setCpf(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Unidade</Label>
            <Input value={unidade} onChange={(e) => setUnidade(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Centro de Custo *</Label>
            <CcPicker valor={ccId || null} onChange={setCcId} className="w-full"
                      placeholder="Selecione o subnúcleo…" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Cargo</Label>
            <Select value={cargoId} onValueChange={setCargoId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>{cargos.map((x) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Data de admissão</Label>
            <Input type="date" value={dataAdm} onChange={(e) => setDataAdm(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Salário bruto (R$)</Label>
            <Input type="number" step="0.01" value={salario} onChange={(e) => setSalario(Number(e.target.value))} className="h-9 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">VT (R$)</Label>
            <Input type="number" step="0.01" value={vt} onChange={(e) => setVt(Number(e.target.value))} className="h-9 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">VA (R$)</Label>
            <Input type="number" step="0.01" value={va} onChange={(e) => setVa(Number(e.target.value))} className="h-9 font-mono text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Sexo</Label>
            <Select value={sexo || "-"} onValueChange={(v) => setSexo(v === "-" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="-">Não informado</SelectItem>
                <SelectItem value="M">Masculino</SelectItem>
                <SelectItem value="F">Feminino</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Área</Label>
            <Input value={area} onChange={(e) => setArea(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Supervisor</Label>
            <LiderancaPicker papel="supervisor" valor={supervisor} onChange={(id) => setSupervisor(id)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Coordenador</Label>
            <LiderancaPicker papel="coordenador" valor={coordenador} onChange={(id) => setCoordenador(id)} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Equipe</Label>
            <Input value={equipe} onChange={(e) => setEquipe(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Chave PIX</Label>
            <Input value={pix} onChange={(e) => setPix(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Conta Banco do Brasil</Label>
            <Input value={contaBb} onChange={(e) => setContaBb(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Conta Caixa</Label>
            <Input value={contaCaixa} onChange={(e) => setContaCaixa(e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button className="glass-button border-0" onClick={criar} disabled={salvando}>
            {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Admitir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── IMPORTAR ─────────────────────────── */

function ImportarTab({ onImportou }: { onImportou: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof dpApi.importar>> | null>(null);

  const importar = async () => {
    if (!arquivo) { toast.error("Anexe a planilha do Controle de Pessoal."); return; }
    setRodando(true);
    setResultado(null);
    try {
      const r = await dpApi.importar(arquivo);
      setResultado(r);
      onImportou();
      toast.success(`Import concluído: ${r.colaboradores_novos} novos, ${r.colaboradores_atualizados} atualizados.`);
    } catch (e: any) { toast.error(e.message); }
    finally { setRodando(false); }
  };

  return (
    <Card className="glass-card max-w-2xl border-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Download className="h-4 w-4 text-[hsl(var(--dunatech-blue))]" /> Importar a planilha do DP
        </CardTitle>
        <CardDescription>
          Lê <b>CONFIG</b> (CCs), <b>TB_Cargos</b>, <b>TB_Colaboradores</b> e <b>Desligados</b> do
          "Controle de Pessoal DP - CC.xlsx". É idempotente: rodar de novo <b>atualiza</b> pelo número
          de matrícula (não duplica). Tudo fica na auditoria.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input type="file" accept=".xlsx" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        <Button className="glass-button border-0" onClick={importar} disabled={rodando || !arquivo}>
          {rodando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
          Importar
        </Button>
        {resultado && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="grid grid-cols-2 gap-1">
              <span>Centros de custo: <b>{resultado.ccs}</b></span>
              <span>Cargos: <b>{resultado.cargos}</b></span>
              <span>Novos colaboradores: <b>{resultado.colaboradores_novos}</b></span>
              <span>Atualizados: <b>{resultado.colaboradores_atualizados}</b></span>
              <span>Desligados marcados: <b>{resultado.desligados_marcados}</b></span>
            </div>
            {resultado.avisos.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
                {resultado.avisos.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── AUDITORIA ─────────────────────────── */

const TOM_UI: Record<string, { cls: string; rotulo: string }> = {
  criar: { cls: "bg-emerald-100 text-emerald-700", rotulo: "Cadastro" },
  editar: { cls: "bg-sky-100 text-sky-700", rotulo: "Alteração" },
  sair: { cls: "bg-rose-100 text-rose-700", rotulo: "Desligamento" },
  importar: { cls: "bg-violet-100 text-violet-700", rotulo: "Importação" },
  simular: { cls: "bg-amber-100 text-amber-800", rotulo: "Simulação" },
  abrir: { cls: "bg-sky-100 text-sky-700", rotulo: "Competência" },
  recalcular: { cls: "bg-slate-100 text-slate-700", rotulo: "Recálculo" },
  lancar: { cls: "bg-indigo-100 text-indigo-700", rotulo: "Lançamento" },
  revisao: { cls: "bg-amber-100 text-amber-800", rotulo: "Revisão" },
  fechar: { cls: "bg-emerald-100 text-emerald-700", rotulo: "Fechamento" },
  reabrir: { cls: "bg-rose-100 text-rose-700", rotulo: "Reabertura" },
  ajuste: { cls: "bg-amber-200 text-amber-900 ring-1 ring-amber-400", rotulo: "Ajuste pontual" },
};

function AuditoriaTab() {
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<import("@/services/dp").DpAuditItem[]>([]);
  const [loading, setLoading] = useState(false);
  // filtros: quem executou e sobre quem
  const [usuario, setUsuario] = useState("");
  const [colaborador, setColaborador] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<DpAuditFiltros>({ usuarios: [], colaboradores: [], entidades: [] });

  useEffect(() => { dpApi.auditoriaFiltros().then(setOpcoes).catch(() => undefined); }, []);
  useEffect(() => { setPagina(0); }, [usuario, colaborador]);

  useEffect(() => {
    setLoading(true);
    dpApi.auditoria(PAGE, pagina * PAGE, {
      usuario: usuario === TODOS ? "" : usuario,
      colaborador: colaborador ?? "",
    })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [pagina, usuario, colaborador]);

  const nomeColab = opcoes.colaboradores.find((c) => c.id === colaborador)?.nome;
  const limpar = () => { setUsuario(""); setColaborador(null); };

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE));
  return (
    <Card className="glass-card border-0">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            <TituloAjuda titulo="Histórico de alterações"
                         ajuda="Registro permanente de tudo que foi feito no módulo: quem fez, quando, o que mudou e de qual valor para qual valor. Não pode ser apagado nem editado." />
          </CardTitle>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                  onClick={() => exportApi.auditoria().catch((e) => toast.error(e.message))}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
        <CardDescription>Cada linha conta o que aconteceu, em português.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filtros: por quem executou e por quem foi afetado */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2">
          <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <UserSearch className="h-3.5 w-3.5" /> Pesquisar por
          </span>
          <Select value={usuario || TODOS} onValueChange={(v) => setUsuario(v === TODOS ? "" : v)}>
            <SelectTrigger className="h-9 w-[230px] text-xs">
              <SelectValue placeholder="Quem executou" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Qualquer usuário</SelectItem>
              {opcoes.usuarios.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
          <ColaboradorPicker opcoes={opcoes.colaboradores} valor={colaborador}
                             onChange={setColaborador} className="w-[240px] text-xs"
                             placeholder="Qualquer colaborador" />
          <Ajuda titulo="Como pesquisar"
                 texto="O primeiro filtro mostra tudo o que uma pessoa da equipe FEZ no módulo. O segundo mostra tudo o que ACONTECEU com um colaborador — cadastro, alterações de salário, lançamentos na folha, ajustes pontuais e desligamento." />
          {(usuario || colaborador) && (
            <button onClick={limpar}
                    className="flex items-center gap-1 text-xs text-[hsl(var(--dunatech-blue))] hover:underline">
              <X className="h-3 w-3" /> limpar
            </button>
          )}
          {(usuario || colaborador) && (
            <span className="ml-auto text-xs text-muted-foreground">
              {total} registro(s)
              {nomeColab ? ` sobre ${nomeColab}` : ""}
              {usuario ? ` por ${usuario}` : ""}
            </span>
          )}
        </div>
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nada registrado ainda.</p>
        ) : (
          <ol className="relative space-y-3 border-l pl-4">
            {items.map((a) => {
              const ui = TOM_UI[a.tom] ?? TOM_UI.editar;
              return (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-[hsl(var(--dunatech-blue))] ring-2 ring-background" />
                  <div className="rounded-lg border bg-card/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ui.cls}`}>{ui.rotulo}</span>
                      <span className="text-sm font-medium">{a.titulo}</span>
                      <span className="ml-auto whitespace-nowrap text-[11px] text-muted-foreground">
                        {a.quando_br}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                      <span>
                        por <button className="font-medium text-foreground hover:underline"
                                    onClick={() => setUsuario(a.usuario)} title="Ver tudo que este usuário fez">
                          {a.usuario}
                        </button>
                        {a.resumo ? ` · ${a.resumo}` : ""}
                      </span>
                      {a.colaborador_id && (
                        <button onClick={() => setColaborador(a.colaborador_id)}
                                title="Ver o histórico completo desta pessoa"
                                className="rounded-full bg-[hsl(var(--dunatech-blue))]/10 px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--dunatech-blue))] hover:bg-[hsl(var(--dunatech-blue))]/20">
                          {a.colaborador_nome}
                        </button>
                      )}
                    </div>
                    {a.mudancas.length > 0 && (
                      <ul className="mt-2 space-y-1 border-t pt-2 text-xs">
                        {a.mudancas.map((m, i) => (
                          <li key={i} className="flex flex-wrap items-baseline gap-1.5">
                            <span className="font-medium">{m.campo}:</span>
                            {m.de ? (
                              <>
                                <span className="rounded bg-rose-50 px-1 text-rose-700 line-through">{m.de}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="rounded bg-emerald-50 px-1 font-medium text-emerald-700">{m.para}</span>
                              </>
                            ) : (
                              <span className="rounded bg-emerald-50 px-1 font-medium text-emerald-700">{m.para}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Página {pagina + 1} de {totalPaginas} · {total} registro(s)</span>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pagina === 0}
                    onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={pagina + 1 >= totalPaginas}
                    onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
