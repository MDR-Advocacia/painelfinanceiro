// DP — Parâmetros editáveis: tudo que na planilha era aba de tabela auxiliar.
//  • Tabelas fiscais POR VIGÊNCIA: faixas de INSS, %VT, %FGTS, multa, patronal
//    e a base de provisão (bruto−INSS da planilha ou bruto contábil).
//  • Plano de cargos (TB_Cargos) e Centros de Custo (CONFIG) — edição inline.
// Sem permissão de edição, tudo vira somente-leitura.
import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Plus, Save, Sliders, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  type DpCargo, type DpCentroCusto, type DpTabelaFiscal,
  exportApi, fmtBRL, fmtData, previsaoApi,
} from "@/services/dp";

export default function ParametrosTab({ ccs, cargos, editar, onMudou }: {
  ccs: DpCentroCusto[]; cargos: DpCargo[]; editar: boolean; onMudou: () => void;
}) {
  return (
    <div className="space-y-6">
      <FiscaisBloco editar={editar} />
      <div className="grid gap-4 lg:grid-cols-2">
        <CargosBloco cargos={cargos} editar={editar} onMudou={onMudou} />
        <CcsBloco ccs={ccs} editar={editar} onMudou={onMudou} />
      </div>
    </div>
  );
}

/* ─────────────────── TABELAS FISCAIS (vigência) ─────────────────── */

function FiscaisBloco({ editar }: { editar: boolean }) {
  const [lista, setLista] = useState<DpTabelaFiscal[]>([]);
  const [sel, setSel] = useState<DpTabelaFiscal | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () => {
    previsaoApi.fiscais().then((l) => {
      setLista(l);
      setSel((prev) => (prev ? l.find((x) => x.id === prev.id) ?? l[0] ?? null : l[0] ?? null));
    }).catch(() => undefined);
  };
  useEffect(carregar, []);

  const set = (patch: Partial<DpTabelaFiscal>) => setSel((s) => (s ? { ...s, ...patch } : s));
  const setFaixa = (i: number, campo: "ate" | "aliquota" | "deducao", v: number) =>
    setSel((s) => s ? { ...s, inss_faixas: s.inss_faixas.map((f, idx) => idx === i ? { ...f, [campo]: v } : f) } : s);

  const salvar = async () => {
    if (!sel) return;
    setSalvando(true);
    try {
      await previsaoApi.salvarFiscal(sel.id, {
        inss_faixas: sel.inss_faixas, vt_percent: sel.vt_percent, fgts_percent: sel.fgts_percent,
        multa_fgts_percent: sel.multa_fgts_percent, inss_patronal_percent: sel.inss_patronal_percent,
        provisao_base: sel.provisao_base,
      });
      toast.success("Parâmetros salvos — recalcule a competência aberta pra aplicar.");
      carregar();
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  };

  const novaVigencia = async () => {
    if (!sel) return;
    const ano = new Date().getFullYear() + 1;
    try {
      const nova = await previsaoApi.criarFiscal({
        vigencia_inicio: `${ano}-01-01`, inss_faixas: sel.inss_faixas,
        vt_percent: sel.vt_percent, fgts_percent: sel.fgts_percent,
        multa_fgts_percent: sel.multa_fgts_percent,
        inss_patronal_percent: sel.inss_patronal_percent, provisao_base: sel.provisao_base,
      });
      toast.success(`Vigência ${ano} criada (cópia da atual) — ajuste as faixas.`);
      carregar();
      setSel(nova);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card className="glass-card border-0">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sliders className="h-4 w-4 text-[hsl(var(--dunatech-blue))]" />
              <TituloAjuda titulo="Parâmetros fiscais (por vigência)"
                           ajuda="Percentuais e faixas usados no cálculo da folha. Cada conjunto vale a partir de uma data: ao virar o ano, crie uma nova vigência em vez de alterar a antiga — assim os meses já fechados continuam com os valores da época." />
            </CardTitle>
            <CardDescription>
              Cada competência usa a tabela vigente no seu mês — alterar aqui <b>não mexe</b> em meses já fechados.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={sel?.id ?? ""} onValueChange={(v) => setSel(lista.find((x) => x.id === v) ?? null)}>
              <SelectTrigger className="h-9 w-[190px] text-xs"><SelectValue placeholder="Vigência…" /></SelectTrigger>
              <SelectContent>
                {lista.map((t) => (
                  <SelectItem key={t.id} value={t.id}>Vigente desde {fmtData(t.vigencia_inicio)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editar && sel && (
              <Button size="sm" variant="outline" className="gap-1" onClick={novaVigencia}>
                <Plus className="h-3.5 w-3.5" /> Nova vigência
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {sel && (
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-xs font-semibold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  Tabela do INSS (faixa · alíquota · parcela a deduzir)
                  <Ajuda titulo="Tabela do INSS"
                         texto="O desconto do INSS é progressivo: aplica-se a alíquota da faixa em que o salário se enquadra e subtrai-se a parcela a deduzir. A última linha é o teto." />
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Até (R$)</TableHead>
                    <TableHead className="text-xs">Alíquota</TableHead>
                    <TableHead className="text-xs">Dedução (R$)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sel.inss_faixas.map((f, i) => (
                    <TableRow key={i}>
                      <TableCell className="py-1">
                        <Input type="number" step="0.01" value={f.ate} disabled={!editar}
                               onChange={(e) => setFaixa(i, "ate", Number(e.target.value))}
                               className="h-8 font-mono text-xs" />
                      </TableCell>
                      <TableCell className="py-1">
                        <Input type="number" step="0.001" value={f.aliquota} disabled={!editar}
                               onChange={(e) => setFaixa(i, "aliquota", Number(e.target.value))}
                               className="h-8 font-mono text-xs" />
                      </TableCell>
                      <TableCell className="py-1">
                        <Input type="number" step="0.01" value={f.deducao} disabled={!editar}
                               onChange={(e) => setFaixa(i, "deducao", Number(e.target.value))}
                               className="h-8 font-mono text-xs" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Alíquota em decimal (0.075 = 7,5%). A última faixa é o teto.
              </p>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Perc rotulo="Desconto VT (máx. legal 6%)" valor={sel.vt_percent}
                      set={(v) => set({ vt_percent: v })} ro={!editar} />
                <Perc rotulo="FGTS" valor={sel.fgts_percent} set={(v) => set({ fgts_percent: v })} ro={!editar} />
                <Perc rotulo="Multa FGTS (provisão)" valor={sel.multa_fgts_percent}
                      set={(v) => set({ multa_fgts_percent: v })} ro={!editar} />
                <Perc rotulo="INSS patronal" valor={sel.inss_patronal_percent}
                      set={(v) => set({ inss_patronal_percent: v })} ro={!editar} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Base de cálculo das provisões (13º/férias)</Label>
                <Select value={sel.provisao_base} disabled={!editar}
                        onValueChange={(v) => set({ provisao_base: v as DpTabelaFiscal["provisao_base"] })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bruto_menos_inss">Bruto − INSS (como a planilha do DP)</SelectItem>
                    <SelectItem value="bruto">Bruto (padrão contábil)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Decisão pendente com o DP/contador — trocar aqui recalcula tudo que estiver aberto.
                </p>
              </div>
              {editar && (
                <Button size="sm" className="glass-button gap-1 border-0" onClick={salvar} disabled={salvando}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar parâmetros
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Perc({ rotulo, valor, set, ro }: {
  rotulo: string; valor: number; set: (v: number) => void; ro: boolean;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{rotulo}</Label>
      <div className="flex items-center gap-1">
        <Input type="number" step="0.01" value={(valor * 100).toFixed(2)} disabled={ro}
               onChange={(e) => set(Number(e.target.value) / 100)}
               className="h-9 font-mono text-sm" />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
    </div>
  );
}

/* ─────────────────── PLANO DE CARGOS ─────────────────── */

function CargosBloco({ cargos, editar, onMudou }: {
  cargos: DpCargo[]; editar: boolean; onMudou: () => void;
}) {
  const [edit, setEdit] = useState<Record<string, number>>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [novo, setNovo] = useState({ area: "JUR", nome: "", salario_base: 0 });

  const salvar = async (c: DpCargo) => {
    const v = edit[c.id];
    if (v === undefined || v === c.salario_base) return;
    setSalvandoId(c.id);
    try {
      await previsaoApi.salvarCargo(c.id, { salario_base: v });
      toast.success(`${c.nome}: salário base atualizado.`);
      onMudou();
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvandoId(null); }
  };

  const criar = async () => {
    if (!novo.nome.trim()) { toast.error("Informe o nome do cargo."); return; }
    try {
      await previsaoApi.criarCargo(novo);
      toast.success("Cargo criado.");
      setNovo({ area: "JUR", nome: "", salario_base: 0 });
      onMudou();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card className="glass-card border-0">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Plano de Cargos</CardTitle>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                    onClick={() => exportApi.catalogos("excel").catch((e) => toast.error(e.message))}>
              <Download className="h-3.5 w-3.5" /> Excel
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                    onClick={() => exportApi.catalogos("pdf").catch((e) => toast.error(e.message))}>
              <FileText className="h-3.5 w-3.5" /> PDF
            </Button>
          </div>
        </div>
        <CardDescription>Salário base por cargo — sugerido nas admissões e simulações.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="max-h-[340px] overflow-y-auto rounded-md border">
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
                  <TableCell className="py-1 text-xs">{c.area}</TableCell>
                  <TableCell className="py-1 text-sm">{c.nome}</TableCell>
                  <TableCell className="py-1 text-right">
                    {editar ? (
                      <Input type="number" step="0.01"
                             value={edit[c.id] ?? c.salario_base}
                             onChange={(e) => setEdit((s) => ({ ...s, [c.id]: Number(e.target.value) }))}
                             onBlur={() => salvar(c)}
                             className="h-8 w-28 text-right font-mono text-xs" />
                    ) : (
                      <span className="font-mono text-xs">{fmtBRL(c.salario_base)}</span>
                    )}
                    {salvandoId === c.id && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {editar && (
          <div className="flex flex-wrap items-end gap-2">
            <Input placeholder="Área" value={novo.area} onChange={(e) => setNovo({ ...novo, area: e.target.value })}
                   className="h-8 w-20 text-xs" />
            <Input placeholder="Novo cargo" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                   className="h-8 w-52 text-xs" />
            <Input type="number" placeholder="Salário" value={novo.salario_base || ""}
                   onChange={(e) => setNovo({ ...novo, salario_base: Number(e.target.value) })}
                   className="h-8 w-28 font-mono text-xs" />
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={criar}>
              <Plus className="h-3.5 w-3.5" /> Criar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────── CENTROS DE CUSTO ─────────────────── */

function CcsBloco({ ccs, editar, onMudou }: {
  ccs: DpCentroCusto[]; editar: boolean; onMudou: () => void;
}) {
  const [novo, setNovo] = useState({ codigo: 0, nome: "" });

  const criar = async () => {
    if (!novo.nome.trim()) { toast.error("Informe o nome do centro de custo."); return; }
    try {
      await previsaoApi.criarCc(novo);
      toast.success("Centro de custo criado.");
      setNovo({ codigo: 0, nome: "" });
      onMudou();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Card className="glass-card border-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Centros de Custo</CardTitle>
        <CardDescription>Setores e carteiras que recebem o rateio da folha.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="max-h-[340px] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Cód.</TableHead>
                <TableHead className="text-xs">Centro de Custo</TableHead>
                <TableHead className="text-right text-xs">Ativos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ccs.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="py-1 font-mono text-xs">{c.codigo}</TableCell>
                  <TableCell className="py-1 text-sm">{c.nome}</TableCell>
                  <TableCell className="py-1 text-right font-mono text-xs">{c.colaboradores_ativos}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {editar && (
          <div className="flex flex-wrap items-end gap-2">
            <Input type="number" placeholder="Cód." value={novo.codigo || ""}
                   onChange={(e) => setNovo({ ...novo, codigo: Number(e.target.value) })}
                   className="h-8 w-20 font-mono text-xs" />
            <Input placeholder="Novo centro de custo" value={novo.nome}
                   onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                   className="h-8 w-56 text-xs" />
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={criar}>
              <Plus className="h-3.5 w-3.5" /> Criar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
