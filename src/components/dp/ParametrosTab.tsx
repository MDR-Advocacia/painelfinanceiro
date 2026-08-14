// DP — Parâmetros editáveis: tudo que na planilha era aba de tabela auxiliar.
//  • Tabelas fiscais POR VIGÊNCIA: faixas de INSS, %VT, %FGTS, multa, patronal
//    e a base de provisão (bruto−INSS da planilha ou bruto contábil).
//  • Plano de cargos (TB_Cargos) e Centros de Custo (CONFIG) — edição inline.
//  • Catálogo de LIDERANÇAS (supervisores/coordenadores) usado na ficha.
// Sem permissão de edição, tudo vira somente-leitura.
import { useEffect, useState } from "react";
import {
  Check, Download, FileText, Loader2, Plus, Save, Sliders, Trash2, UserCog,
} from "lucide-react";
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
import ArvoreCentrosCusto from "@/components/dp/ArvoreCentrosCusto";
import { CcPicker } from "@/components/dp/Pickers";
import { Checkbox } from "@/components/ui/checkbox";
import type { DpFaixaIR } from "@/services/dp";

/** As tres tabelas de IRRF vivem em campos diferentes da mesma vigencia. */
type ChaveIR = "irrf_faixas" | "irrf_faixas_13" | "irrf_faixas_plr";
import {
  type DpCargo, type DpCcNo, type DpCentroCusto, type DpLideranca, type DpTabelaFiscal,
  dpApi, exportApi, fmtBRL, fmtData, previsaoApi,
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
      <LiderancasBloco editar={editar} />
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

  // as tabelas de IRRF (mensal, 13º e PLR) têm a mesma forma da do INSS, então
  // um só conjunto de helpers atende as três — chave dinâmica
  const setFaixaIR = (chave: ChaveIR, i: number,
                      campo: "ate" | "aliquota" | "deducao", v: number) =>
    setSel((s) => s ? {
      ...s, [chave]: (s[chave] ?? []).map((f, idx) => idx === i ? { ...f, [campo]: v } : f),
    } : s);
  const addFaixaIR = (chave: ChaveIR) =>
    setSel((s) => s ? { ...s, [chave]: [...(s[chave] ?? []), { ate: 0, aliquota: 0, deducao: 0 }] } : s);
  const removeFaixaIR = (chave: ChaveIR, i: number) =>
    setSel((s) => s ? { ...s, [chave]: (s[chave] ?? []).filter((_, idx) => idx !== i) } : s);

  const salvar = async () => {
    if (!sel) return;
    setSalvando(true);
    try {
      await previsaoApi.salvarFiscal(sel.id, {
        inss_faixas: sel.inss_faixas, vt_percent: sel.vt_percent, fgts_percent: sel.fgts_percent,
        multa_fgts_percent: sel.multa_fgts_percent, inss_patronal_percent: sel.inss_patronal_percent,
        provisao_base: sel.provisao_base,
        fgts_percent_aprendiz: sel.fgts_percent_aprendiz,
        irrf_faixas: sel.irrf_faixas ?? [],
        irrf_faixas_13: sel.irrf_faixas_13 ?? [],
        irrf_faixas_plr: sel.irrf_faixas_plr ?? [],
        irrf_deducao_dependente: sel.irrf_deducao_dependente,
        irrf_desconto_simplificado: sel.irrf_desconto_simplificado,
        irrf_isencao_maior_65: sel.irrf_isencao_maior_65,
        irrf_autonomo_usa_tabela_mensal: sel.irrf_autonomo_usa_tabela_mensal,
        irrf_retencao_pj_percent: sel.irrf_retencao_pj_percent,
        irrf_retencao_pj_dispensa: sel.irrf_retencao_pj_dispensa,
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
            </div>
          </div>

          {/* ═══ IMPOSTO DE RENDA RETIDO NA FONTE ═══ */}
          <div className="mt-6 border-t pt-5">
            <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              Imposto de Renda (IRRF)
              <Ajuda titulo="Imposto de Renda Retido na Fonte"
                     texto={"O IRRF funciona por CATEGORIA DE RENDIMENTO: salário, férias, 13º e PLR são "
                            + "apurados em separado, cada um com sua base. É o oposto do INSS, que junta "
                            + "tudo numa base única do mês. Somar as categorias jogaria a pessoa numa "
                            + "alíquota que ela não deve."} />
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Hoje ninguém no escritório atinge a alíquota — deixar as tabelas vazias mantém o
              desconto em zero. Preencher passa a valer da vigência em diante, sem tocar em
              mês já fechado.
            </p>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-5">
                <TabelaIR
                  titulo="Tabela mensal — salário e férias"
                  ajuda="Progressiva aplicada ao salário do mês (já descontado o INSS) e, em separado, às férias. É a tabela principal."
                  faixas={sel.irrf_faixas ?? []} chave="irrf_faixas"
                  editar={editar} setFaixa={setFaixaIR} add={addFaixaIR} remove={removeFaixaIR} />
                <TabelaIR
                  titulo="Tabela do 13º salário"
                  ajuda="O 13º tem tributação EXCLUSIVA na fonte: não entra no ajuste anual nem soma com o salário do mês. Deixar vazia faz o 13º usar a tabela mensal, que é o comportamento usual."
                  faixas={sel.irrf_faixas_13 ?? []} chave="irrf_faixas_13"
                  editar={editar} setFaixa={setFaixaIR} add={addFaixaIR} remove={removeFaixaIR}
                  vazioTexto="Vazia — o 13º usa a tabela mensal acima." />
                <TabelaIR
                  titulo="Tabela da PLR"
                  ajuda="A participação nos lucros tem tabela ANUAL própria (Lei 10.101) e também é exclusiva na fonte. Vazia significa que não há PLR tributável configurada."
                  faixas={sel.irrf_faixas_plr ?? []} chave="irrf_faixas_plr"
                  editar={editar} setFaixa={setFaixaIR} add={addFaixaIR} remove={removeFaixaIR}
                  vazioTexto="Vazia — nenhuma PLR tributável configurada." />
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    Deduções da base
                    <Ajuda titulo="Os dois caminhos da dedução"
                           texto={"A lei dá duas opções e o contribuinte fica com a que pagar MENOS: abater "
                                  + "as deduções legais (dependentes, pensão, isenção dos 65+) ou usar o "
                                  + "desconto simplificado, que dispensa comprovação. O sistema calcula os "
                                  + "dois e aplica o menor imposto automaticamente."} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Reais rotulo="Dedução por dependente" valor={sel.irrf_deducao_dependente ?? 0}
                           set={(v) => set({ irrf_deducao_dependente: v })} ro={!editar}
                           dica="Valor mensal por dependente que conta para o IR. Na ficha de cada colaborador você marca quais dependentes contam." />
                    <Reais rotulo="Desconto simplificado" valor={sel.irrf_desconto_simplificado ?? 0}
                           set={(v) => set({ irrf_desconto_simplificado: v })} ro={!editar}
                           dica="Abatimento fixo mensal que substitui as deduções legais quando for mais vantajoso. Zero desliga essa alternativa." />
                    <Reais rotulo="Isenção 65 anos ou mais" valor={sel.irrf_isencao_maior_65 ?? 0}
                           set={(v) => set({ irrf_isencao_maior_65: v })} ro={!editar}
                           dica="Parcela isenta adicional para quem tem 65 anos ou mais." />
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    Retenção de prestador
                    <Ajuda titulo="IR retido de quem não é CLT"
                           texto={"Associado e autônomo (RPA) são pessoa física: seguem a mesma tabela "
                                  + "progressiva mensal. PJ é diferente — a retenção é um percentual fixo "
                                  + "sobre a nota de serviço, e há um piso abaixo do qual não se retém, "
                                  + "porque a obrigação acessória custa mais que o imposto."} />
                  </div>
                  <label className="mb-3 flex items-start gap-2 text-xs">
                    <Checkbox checked={sel.irrf_autonomo_usa_tabela_mensal !== false} className="mt-0.5"
                              disabled={!editar}
                              onCheckedChange={(v) => set({ irrf_autonomo_usa_tabela_mensal: !!v })} />
                    <span>
                      Autônomo e associado usam a tabela mensal
                      <span className="block text-[0.68rem] text-muted-foreground">
                        pessoa física segue a progressiva, igual ao celetista
                      </span>
                    </span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <Perc rotulo="Retenção de PJ (serviços)" valor={sel.irrf_retencao_pj_percent ?? 0}
                          set={(v) => set({ irrf_retencao_pj_percent: v })} ro={!editar} />
                    <Reais rotulo="Não reter abaixo de" valor={sel.irrf_retencao_pj_dispensa ?? 0}
                           set={(v) => set({ irrf_retencao_pj_dispensa: v })} ro={!editar}
                           dica="Piso de dispensa: se o imposto apurado ficar abaixo deste valor, não se retém." />
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">
                    FGTS do contrato de aprendizagem
                  </div>
                  <Perc rotulo="FGTS do aprendiz" valor={sel.fgts_percent_aprendiz ?? 0.02}
                        set={(v) => set({ fgts_percent_aprendiz: v })} ro={!editar} />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    A lei fixa 2% no lugar dos 8%. Marque quem é aprendiz na ficha do colaborador.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {editar && (
            <div className="mt-5 border-t pt-4">
              <Button size="sm" className="glass-button gap-1 border-0" onClick={salvar} disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar parâmetros
              </Button>
              <span className="ml-3 text-[11px] text-muted-foreground">
                vale da vigência em diante — mês fechado mantém a tabela da época
              </span>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/**
 * Tabela progressiva editável — serve para as três categorias de IRRF.
 *
 * Vazia é um estado LEGÍTIMO e não um erro: sem faixas o imposto é zero, que
 * é a realidade do escritório hoje. Por isso o vazio explica o que significa
 * em vez de mostrar uma tabela em branco sem contexto.
 */
function TabelaIR({ titulo, ajuda, faixas, chave, editar, setFaixa, add, remove, vazioTexto }: {
  titulo: string; ajuda: string; faixas: DpFaixaIR[]; chave: ChaveIR; editar: boolean;
  setFaixa: (c: ChaveIR, i: number, campo: "ate" | "aliquota" | "deducao", v: number) => void;
  add: (c: ChaveIR) => void; remove: (c: ChaveIR, i: number) => void; vazioTexto?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          {titulo}
          <Ajuda titulo={titulo} texto={ajuda} />
        </span>
        {editar && (
          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                  onClick={() => add(chave)}>
            + faixa
          </Button>
        )}
      </div>
      {faixas.length === 0 ? (
        <p className="rounded border border-dashed px-2 py-3 text-center text-[11px] text-muted-foreground">
          {vazioTexto ?? "Sem tabela — o desconto fica em zero."}
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Até (R$)</TableHead>
                <TableHead className="text-xs">Alíquota</TableHead>
                <TableHead className="text-xs">Dedução (R$)</TableHead>
                {editar && <TableHead className="w-8" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {faixas.map((f, i) => (
                <TableRow key={i}>
                  <TableCell className="py-1">
                    <Input type="number" step="0.01" value={f.ate} disabled={!editar}
                           onChange={(e) => setFaixa(chave, i, "ate", Number(e.target.value))}
                           className="h-8 font-mono text-xs" />
                  </TableCell>
                  <TableCell className="py-1">
                    <Input type="number" step="0.001" value={f.aliquota} disabled={!editar}
                           onChange={(e) => setFaixa(chave, i, "aliquota", Number(e.target.value))}
                           className="h-8 font-mono text-xs" />
                  </TableCell>
                  <TableCell className="py-1">
                    <Input type="number" step="0.01" value={f.deducao} disabled={!editar}
                           onChange={(e) => setFaixa(chave, i, "deducao", Number(e.target.value))}
                           className="h-8 font-mono text-xs" />
                  </TableCell>
                  {editar && (
                    <TableCell className="py-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground"
                              onClick={() => remove(chave, i)} title="Remover faixa">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Alíquota em decimal (0.075 = 7,5%). As faixas têm que estar em ordem crescente
            de teto; a última é o topo da tabela.
          </p>
        </>
      )}
    </div>
  );
}

/** Campo de valor em R$ com dica — irmão do Perc, que é percentual. */
function Reais({ rotulo, valor, set, ro, dica }: {
  rotulo: string; valor: number; set: (v: number) => void; ro: boolean; dica?: string;
}) {
  return (
    <div>
      <Label className="flex items-center gap-1 text-xs text-muted-foreground">
        {rotulo}
        {dica && <Ajuda titulo={rotulo} texto={dica} />}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          R$
        </span>
        <Input type="number" step="0.01" value={valor} disabled={ro}
               onChange={(e) => set(Number(e.target.value))}
               className="h-9 pl-8 font-mono text-sm" />
      </div>
    </div>
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
  const [arvore, setArvore] = useState<DpCcNo[]>([]);
  const carregarArvore = () => { dpApi.ccArvore().then(setArvore).catch(() => undefined); };
  useEffect(carregarArvore, [ccs]);

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
        <CardTitle className="text-base">
          <TituloAjuda titulo="Centros de Custo"
                       ajuda="Estrutura em árvore: os núcleos (ADM, Autor, Réu…) agrupam subnúcleos. O rateio da folha usa o centro exato do colaborador, e os relatórios podem somar por núcleo." />
        </CardTitle>
        <CardDescription>Núcleos e subnúcleos que recebem o rateio da folha.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="max-h-[340px] overflow-y-auto">
          <ArvoreCentrosCusto arvore={arvore} editar={editar}
                              onMudou={() => { carregarArvore(); onMudou(); }} />
        </div>
        {editar && (
          <div className="flex flex-wrap items-end gap-2">
            <Input type="number" placeholder="Cód." value={novo.codigo || ""}
                   onChange={(e) => setNovo({ ...novo, codigo: Number(e.target.value) })}
                   className="h-8 w-20 font-mono text-xs" />
            <Input placeholder="Novo núcleo (raiz)" value={novo.nome}
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


/* ─────────────────── LIDERANÇAS (supervisores/coordenadores) ─────────────────── */

function LiderancasBloco({ editar }: { editar: boolean }) {
  const [lista, setLista] = useState<DpLideranca[]>([]);
  const [equipes, setEquipes] = useState<Record<string, { supervisionados: number; coordenados: number }>>({});
  const [carregando, setCarregando] = useState(false);
  const [novo, setNovo] = useState({ nome: "", e_supervisor: true, e_coordenador: false, cc: "" });
  const [busca, setBusca] = useState("");

  const carregar = () => {
    setCarregando(true);
    Promise.all([dpApi.liderancas(), dpApi.liderancaEquipe()])
      .then(([l, e]) => { setLista(l); setEquipes(e); })
      .catch(() => undefined)
      .finally(() => setCarregando(false));
  };
  useEffect(carregar, []);

  const criar = async () => {
    if (!novo.nome.trim()) { toast.error("Informe o nome da liderança."); return; }
    if (!novo.e_supervisor && !novo.e_coordenador) { toast.error("Marque pelo menos um papel."); return; }
    try {
      await dpApi.criarLideranca({
        nome: novo.nome.trim(), e_supervisor: novo.e_supervisor,
        e_coordenador: novo.e_coordenador,
        centro_custo_id: novo.cc && novo.cc !== "__todos__" ? novo.cc : null,
      });
      toast.success("Liderança cadastrada.");
      setNovo({ nome: "", e_supervisor: true, e_coordenador: false, cc: "" });
      carregar();
    } catch (e: any) { toast.error(e.message); }
  };

  const salvar = async (l: DpLideranca, campos: Partial<DpLideranca>) => {
    try {
      await dpApi.atualizarLideranca(l.id, campos);
      setLista((s) => s.map((x) => (x.id === l.id ? { ...x, ...campos } as DpLideranca : x)));
      toast.success("Liderança atualizada.");
    } catch (e: any) { toast.error(e.message); }
  };

  const remover = async (l: DpLideranca) => {
    const eq = equipes[l.id];
    const vinculados = (eq?.supervisionados ?? 0) + (eq?.coordenados ?? 0);
    const msg = vinculados
      ? `${l.nome} tem ${vinculados} pessoa(s) vinculada(s) — será INATIVADA (o histórico fica). Confirma?`
      : `Excluir ${l.nome} do catálogo?`;
    if (!window.confirm(msg)) return;
    try {
      await dpApi.removerLideranca(l.id);
      toast.success(vinculados ? "Liderança inativada." : "Liderança excluída.");
      carregar();
    } catch (e: any) { toast.error(e.message); }
  };

  const filtrada = lista.filter((l) => l.nome.toLowerCase().includes(busca.toLowerCase()));

  return (
    <Card className="glass-card border-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          <TituloAjuda titulo="Supervisores e Coordenadores"
                       ajuda="Catálogo das lideranças do escritório. A ficha do colaborador escolhe daqui, então o nome fica padronizado e renomear em um lugar propaga para todo mundo. A mesma pessoa pode acumular os dois papéis." />
        </CardTitle>
        <CardDescription>
          Quem aparece nas fichas como supervisor ou coordenador — com o tamanho da equipe de cada um.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Buscar liderança…" value={busca}
                 onChange={(e) => setBusca(e.target.value)} className="h-8 w-56 text-xs" />
          {carregando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <span className="ml-auto text-xs text-muted-foreground">
            {lista.filter((l) => l.e_supervisor).length} supervisor(es) · {lista.filter((l) => l.e_coordenador).length} coordenador(es)
          </span>
        </div>

        <div className="max-h-[380px] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="text-xs">Nome</TableHead>
                <TableHead className="w-24 text-center text-xs">Supervisor</TableHead>
                <TableHead className="w-24 text-center text-xs">Coordenador</TableHead>
                <TableHead className="hidden text-xs md:table-cell">Centro de custo</TableHead>
                <TableHead className="w-28 text-center text-xs">Equipe</TableHead>
                {editar && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrada.map((l) => {
                const eq = equipes[l.id] ?? { supervisionados: 0, coordenados: 0 };
                return (
                  <TableRow key={l.id} className={l.ativo ? "" : "opacity-50"}>
                    <TableCell className="text-sm">
                      {editar ? (
                        <Input defaultValue={l.nome} className="h-8 text-sm"
                               onBlur={(e) => e.target.value.trim() && e.target.value !== l.nome
                                 && salvar(l, { nome: e.target.value.trim() })} />
                      ) : l.nome}
                      {!l.ativo && <span className="ml-2 text-[10px] uppercase text-muted-foreground">inativa</span>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={l.e_supervisor} disabled={!editar}
                                onCheckedChange={(v) => salvar(l, { e_supervisor: !!v })} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox checked={l.e_coordenador} disabled={!editar}
                                onCheckedChange={(v) => salvar(l, { e_coordenador: !!v })} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {editar ? (
                        <CcPicker valor={l.centro_custo_id} className="h-8 w-full text-xs"
                                  placeholder="— sem centro —"
                                  onChange={(v) => salvar(l, { centro_custo_id: v } as Partial<DpLideranca>)} />
                      ) : (
                        <span className="text-xs text-muted-foreground">{l.centro_custo_nome ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {eq.supervisionados > 0 && (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 font-mono text-sky-700"
                              title="Pessoas supervisionadas">{eq.supervisionados}</span>
                      )}
                      {eq.coordenados > 0 && (
                        <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 font-mono text-violet-700"
                              title="Pessoas coordenadas">{eq.coordenados}</span>
                      )}
                      {eq.supervisionados + eq.coordenados === 0 && (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {editar && (
                      <TableCell className="text-center">
                        <button onClick={() => remover(l)} title="Remover do catálogo"
                                className="text-muted-foreground/60 hover:text-rose-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filtrada.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                  Nenhuma liderança encontrada.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {editar && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-2">
            <div>
              <Label className="text-[11px] text-muted-foreground">Nova liderança</Label>
              <Input placeholder="Nome (ex.: Fernanda - SUP)" value={novo.nome}
                     onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                     className="h-8 w-56 text-xs" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Centro de custo</Label>
              <CcPicker valor={novo.cc || null} className="h-8 w-[200px] text-xs"
                        placeholder="— opcional —"
                        onChange={(v) => setNovo({ ...novo, cc: v })} />
            </div>
            <label className="flex items-center gap-1.5 pb-1.5 text-xs">
              <Checkbox checked={novo.e_supervisor}
                        onCheckedChange={(v) => setNovo({ ...novo, e_supervisor: !!v })} />
              Supervisor
            </label>
            <label className="flex items-center gap-1.5 pb-1.5 text-xs">
              <Checkbox checked={novo.e_coordenador}
                        onCheckedChange={(v) => setNovo({ ...novo, e_coordenador: !!v })} />
              Coordenador
            </label>
            <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={criar}>
              <Plus className="h-3.5 w-3.5" /> Cadastrar
            </Button>
          </div>
        )}
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <UserCog className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Liderança com gente vinculada não é apagada — vira <b className="mx-1">inativa</b> e some das
          listas novas, mas continua nas fichas e no histórico.
        </p>
      </CardContent>
    </Card>
  );
}
