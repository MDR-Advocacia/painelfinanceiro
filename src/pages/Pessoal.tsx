// Módulo Controle de Pessoal (DP) — F1: Quadro de Pessoal + ficha com histórico,
// admissão/desligamento, catálogos (cargos/CCs), importador da planilha e
// trilha de auditoria. RBAC: "ver" navega; "editar" altera (botões somem sem permissão).
import { useCallback, useEffect, useState } from "react";
import {
  Contact, Download, FileSpreadsheet, Loader2, Plus, RefreshCw, ScrollText,
  Search, UserMinus, Users,
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
import { usePermissions } from "@/hooks/usePermissions";
import {
  type DpCargo, type DpCentroCusto, type DpColaborador, type DpEvento, type DpResumo,
  REGIME_LABELS, dpApi, fmtBRL, fmtData,
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
          <div className="flex flex-wrap gap-3">
            <KPI label="Ativos" valor={resumo.ativos} />
            <KPI label="CLT" valor={resumo.por_regime.clt} />
            <KPI label="Estagiários" valor={resumo.por_regime.estagiario} />
            <KPI label="Associados" valor={resumo.por_regime.associado} />
            <KPI label="PJ" valor={resumo.por_regime.pj} />
            <KPI label="Desligados" valor={resumo.inativos} tom="rose" />
          </div>
        )}
      </div>

      <Tabs defaultValue="quadro">
        <TabsList>
          <TabsTrigger value="quadro" className="gap-2"><Users className="h-4 w-4" /> Quadro</TabsTrigger>
          <TabsTrigger value="catalogos" className="gap-2"><Contact className="h-4 w-4" /> Cargos & CCs</TabsTrigger>
          {editar && (
            <TabsTrigger value="importar" className="gap-2"><FileSpreadsheet className="h-4 w-4" /> Importar</TabsTrigger>
          )}
          <TabsTrigger value="auditoria" className="gap-2"><ScrollText className="h-4 w-4" /> Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="quadro" className="mt-4">
          <QuadroTab ccs={ccs} cargos={cargos} editar={editar} onMudou={carregarBase} />
        </TabsContent>
        <TabsContent value="catalogos" className="mt-4">
          <CatalogosTab ccs={ccs} cargos={cargos} />
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

function QuadroTab({ ccs, cargos, editar, onMudou }: {
  ccs: DpCentroCusto[]; cargos: DpCargo[]; editar: boolean; onMudou: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [regime, setRegime] = useState(TODOS);
  const [status, setStatus] = useState("ativo");
  const [cc, setCc] = useState(TODOS);
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
      cc: cc === TODOS ? "" : cc, limit: PAGE, offset: pagina * PAGE,
    })
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [busca, regime, status, cc, pagina]);
  useEffect(() => { carregar(); }, [carregar]);

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE));

  return (
    <Card className="glass-card border-0">
      <CardContent className="space-y-3 pt-5">
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
          <Select value={cc} onValueChange={(v) => { setCc(v); setPagina(0); }}>
            <SelectTrigger className="h-9 w-[210px] text-xs"><SelectValue placeholder="Centro de custo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos os CCs</SelectItem>
              {ccs.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <button onClick={carregar} className="ml-1 text-muted-foreground hover:text-foreground" title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {editar && (
            <Button size="sm" className="glass-button ml-auto gap-1 border-0" onClick={() => setNovoAberto(true)}>
              <Plus className="h-4 w-4" /> Admitir colaborador
            </Button>
          )}
        </div>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Matrícula</TableHead>
                <TableHead className="text-xs">Nome</TableHead>
                <TableHead className="text-xs">Regime</TableHead>
                <TableHead className="text-xs">Cargo</TableHead>
                <TableHead className="text-xs">Centro de Custo</TableHead>
                <TableHead className="text-xs">Unidade</TableHead>
                <TableHead className="text-right text-xs">Salário</TableHead>
                <TableHead className="text-center text-xs">Status</TableHead>
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
                  <TableCell className="max-w-[170px] truncate text-xs">{c.cargo_nome || "—"}</TableCell>
                  <TableCell className="max-w-[180px] truncate text-xs">{c.centro_custo_nome}</TableCell>
                  <TableCell className="text-xs">{c.unidade || "—"}</TableCell>
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
  const [dataDem, setDataDem] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    dpApi.eventos(colaborador.id).then(setEventos).catch(() => undefined);
  }, [colaborador.id]);

  const set = (k: keyof DpColaborador, v: unknown) => setC((prev) => ({ ...prev, [k]: v }));

  const salvar = async () => {
    setSalvando(true);
    try {
      await dpApi.atualizar(c.id, {
        nome: c.nome, cpf: c.cpf, unidade: c.unidade, area: c.area,
        centro_custo_id: c.centro_custo_id, supervisor: c.supervisor, equipe: c.equipe,
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

  const desligar = async () => {
    setSalvando(true);
    try {
      await dpApi.desligar(c.id, dataDem);
      toast.success(`${c.nome} desligado(a) em ${fmtData(dataDem)}.`);
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
            <Label className="text-xs text-muted-foreground">Centro de Custo</Label>
            <Select value={c.centro_custo_id} onValueChange={(v) => set("centro_custo_id", v)} disabled={ro}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{ccs.map((x) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent>
            </Select>
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
          <CampoTexto rotulo="Supervisor" valor={c.supervisor} onChange={(v) => set("supervisor", v)} ro={ro} />
          <CampoTexto rotulo="Equipe" valor={c.equipe} onChange={(v) => set("equipe", v)} ro={ro} />
          <CampoNum rotulo="Salário bruto (R$)" valor={c.salario_bruto} onChange={(v) => set("salario_bruto", v)} ro={ro} />
          <CampoNum rotulo="Saldo livre (R$)" valor={c.saldo_livre} onChange={(v) => set("saldo_livre", v)} ro={ro} />
          <CampoNum rotulo="VT (R$)" valor={c.vt} onChange={(v) => set("vt", v)} ro={ro} />
          <CampoNum rotulo="VA (R$)" valor={c.va} onChange={(v) => set("va", v)} ro={ro} />
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <Checkbox checked={c.opta_vt} onCheckedChange={(v) => set("opta_vt", !!v)} disabled={ro} />
            Opta pelo VT (desconto de 6% — só CLT)
          </label>
          <CampoTexto rotulo="PIX" valor={c.pix} onChange={(v) => set("pix", v)} ro={ro} />
          <CampoTexto rotulo="Conta BB" valor={c.conta_bb} onChange={(v) => set("conta_bb", v)} ro={ro} />
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
          <Dialog open onOpenChange={(o) => !o && setDesligarAberto(false)}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Desligar {c.nome.split(" ")[0]}?</DialogTitle>
                <DialogDescription>
                  Marca como desligado(a) e registra o evento. As verbas rescisórias entram na fase da folha.
                </DialogDescription>
              </DialogHeader>
              <div>
                <Label className="text-xs text-muted-foreground">Data do desligamento</Label>
                <Input type="date" value={dataDem} onChange={(e) => setDataDem(e.target.value)} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDesligarAberto(false)}>Cancelar</Button>
                <Button variant="destructive" onClick={desligar} disabled={salvando}>
                  {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Confirmar desligamento
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
        nome: nome.trim().toUpperCase(), cpf, unidade, regime,
        centro_custo_id: ccId, cargo_id: cargoId || null,
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
            <Select value={ccId} onValueChange={setCcId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>{ccs.map((x) => <SelectItem key={x.id} value={x.id}>{x.nome}</SelectItem>)}</SelectContent>
            </Select>
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

/* ─────────────────────────── CATÁLOGOS ─────────────────────────── */

function CatalogosTab({ ccs, cargos }: { ccs: DpCentroCusto[]; cargos: DpCargo[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base">Centros de Custo</CardTitle>
          <CardDescription>Catálogo importado do CONFIG da planilha.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Cód.</TableHead>
                <TableHead className="text-xs">Nome</TableHead>
                <TableHead className="text-right text-xs">Ativos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ccs.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.codigo}</TableCell>
                  <TableCell className="text-sm">{c.nome}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{c.colaboradores_ativos}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card className="glass-card border-0">
        <CardHeader>
          <CardTitle className="text-base">Plano de Cargos</CardTitle>
          <CardDescription>Salário base, dias e carga horária (TB_Cargos).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Área</TableHead>
                  <TableHead className="text-xs">Cargo</TableHead>
                  <TableHead className="text-right text-xs">Salário base</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">{c.area}</TableCell>
                    <TableCell className="text-sm">{c.nome}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtBRL(c.salario_base)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
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

function AuditoriaTab() {
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<import("@/services/dp").DpAuditItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    dpApi.auditoria(PAGE, pagina * PAGE)
      .then((r) => { setItems(r.items); setTotal(r.total); })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [pagina]);

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE));
  return (
    <Card className="glass-card border-0">
      <CardHeader>
        <CardTitle className="text-base">Trilha de auditoria</CardTitle>
        <CardDescription>Toda escrita do módulo, imutável: quem, quando e o antes→depois.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Carregando…
          </p>
        ) : (
          <div className="space-y-1.5">
            {items.map((a, i) => (
              <details key={i} className="rounded-md border bg-card/60 px-3 py-2 text-xs">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-mono text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <Badge variant="outline" className="text-[10px]">{a.acao}</Badge>
                  <span className="font-medium">{a.entidade}</span>
                  <span className="ml-auto text-muted-foreground">{a.usuario}</span>
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-[10px]">
                  {JSON.stringify({ antes: a.antes, depois: a.depois }, null, 2)}
                </pre>
              </details>
            ))}
            {items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nada registrado ainda.</p>}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
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
