// DP — Previsão de gastos: projeção + aprovisionamento + simulação de cenários.
// A simulação usa o MESMO motor da folha real (nada é gravado — é what-if).
import { useEffect, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer,
  Tooltip as RTooltip, XAxis, YAxis,
} from "recharts";
import {
  Download, FileText, FlaskConical, Loader2, Plus, Trash2, TrendingUp,
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
import {
  type DpAdmissaoSim, type DpCargo, type DpCentroCusto, type DpProjecao, type DpSimulacao,
  REGIME_LABELS, exportApi, fmtBRL, fmtCompetencia, previsaoApi,
} from "@/services/dp";

const APROV_LABEL: Record<string, string> = {
  decimo: "13º salário", ferias: "Férias", terco: "1/3 de férias",
  fgts: "FGTS", multa_fgts: "Multa FGTS (40%)", recesso: "Recesso (estagiários)",
};

export default function SimulacoesTab({ ccs, cargos }: { ccs: DpCentroCusto[]; cargos: DpCargo[] }) {
  return (
    <div className="space-y-6">
      <ProjecaoBloco />
      <SimulacaoBloco ccs={ccs} cargos={cargos} />
    </div>
  );
}

/* ─────────────────── PROJEÇÃO + APROVISIONAMENTO ─────────────────── */

function ProjecaoBloco() {
  const [meses, setMeses] = useState(12);
  const [reajuste, setReajuste] = useState(5);        // % anual
  const [mesReajuste, setMesReajuste] = useState(1);
  const [crescimento, setCrescimento] = useState(0);  // % headcount a.m.
  const [d, setD] = useState<DpProjecao | null>(null);
  const [carregando, setCarregando] = useState(false);

  const params = { meses, reajuste: reajuste / 100, mes_reajuste: mesReajuste, crescimento: crescimento / 100 };

  const rodar = () => {
    setCarregando(true);
    previsaoApi.projecao(params)
      .then(setD)
      .catch((e) => toast.error(e.message))
      .finally(() => setCarregando(false));
  };
  useEffect(() => { rodar(); /* eslint-disable-next-line */ }, []);

  return (
    <Card className="glass-card border-0">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-[hsl(var(--dunatech-blue))]" />
              <TituloAjuda titulo="Projeção de gastos"
                           ajuda="Estimativa do custo de pessoal nos próximos meses partindo do quadro atual. Ajuste o reajuste anual e o crescimento previsto para simular." />
            </CardTitle>
            <CardDescription>
              Repete o quadro de hoje pelos próximos meses para responder duas perguntas:
              <b> quanto vai sair do caixa</b> e <b> quanto precisa ficar guardado</b> para
              o 13º, as férias e o FGTS quando vencerem.
            </CardDescription>
          </div>
          {d && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="gap-1"
                      onClick={() => exportApi.projecao(params as any, "excel").catch((e) => toast.error(e.message))}>
                <Download className="h-3.5 w-3.5" /> Excel
              </Button>
              <Button size="sm" variant="outline" className="gap-1"
                      onClick={() => exportApi.projecao(params as any, "pdf").catch((e) => toast.error(e.message))}>
                <FileText className="h-3.5 w-3.5" /> PDF
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Campo rotulo="Meses" valor={meses} set={setMeses} w="w-20"
                 ajuda="Quantos meses projetar a partir do mês atual. 12 dá o ano cheio e mostra a reserva do 13º completa." />
          <Campo rotulo="Reajuste (% a.a.)" valor={reajuste} set={setReajuste} w="w-28" step={0.5}
                 ajuda="Aumento anual de salário (dissídio). Aplica uma vez por ano, no mês escolhido ao lado, e vale para todo o quadro. Em zero, os salários ficam parados." />
          <Campo rotulo="Mês do reajuste" valor={mesReajuste} set={setMesReajuste} w="w-28"
                 ajuda="Em que mês do ano o dissídio entra: 1 = janeiro, 5 = maio. Só tem efeito se o reajuste acima for maior que zero." />
          <Campo rotulo="Crescimento HC (% a.m.)" valor={crescimento} set={setCrescimento} w="w-36" step={0.5}
                 ajuda="Crescimento do quadro por MÊS, composto. 2 significa 2% a mais de gente a cada mês, com o custo médio de hoje — serve pra simular expansão, não substitui um plano de contratação com salários reais." />
          <Button size="sm" className="glass-button border-0" onClick={rodar} disabled={carregando}>
            {carregando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Projetar
          </Button>
        </div>

        {d && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Mini rotulo="Custo mensal hoje" valor={fmtBRL(d.base.custo_total)}
                    ajuda={`O que o quadro de hoje custa em um mês: folha de ${fmtBRL(d.base.folha)} `
                           + `+ provisões de ${fmtBRL(d.base.provisoes)} + INSS patronal de `
                           + `${fmtBRL(d.base.patronal)}. É o ponto de partida da projeção.`} />
              <Mini rotulo={`Custo em ${d.premissas.meses} meses`} valor={fmtBRL(d.custo_12m)} destaque
                    ajuda={`Soma do custo mês a mês no período. ${d.premissas.reajuste || d.premissas.crescimento
                      ? "Já embute o reajuste e o crescimento que você informou."
                      : "Com reajuste e crescimento em zero, é simplesmente o custo mensal repetido "
                        + d.premissas.meses + " vezes."} Este número JÁ INCLUI a reserva do cartão ao lado.`} />
              <Mini rotulo="A reservar no período" valor={fmtBRL(d.aprovisionamento.total)}
                    ajuda={`NÃO é dinheiro a mais: é a parte do custo acima que não sai do caixa agora, `
                           + `mas vence depois (13º, férias + 1/3, FGTS, multa e recesso). Representa `
                           + `${(d.aprovisionamento.total / d.custo_12m * 100).toFixed(1)}% do custo do período. `
                           + `Guardar esse valor é o que evita o aperto de caixa em dezembro.`} />
              <Mini rotulo="Pessoas hoje" valor={String(d.base.headcount)}
                    ajuda="Quadro ativo usado como base. A projeção repete essas mesmas pessoas — ela não sabe de contratações ou saídas que ainda não aconteceram." />
            </div>

            {/* COMO LER — a duvida recorrente e' achar que "a reservar" e' dinheiro
                a mais. Explicar com os numeros da tela na frente resolve de vez. */}
            <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-[0.78rem] leading-relaxed
                            dark:border-sky-900 dark:bg-sky-950/30">
              <div className="mb-1.5 font-semibold">Como ler esta projeção</div>
              <p className="mb-2 text-muted-foreground">
                O custo de cada mês tem três partes:{" "}
                <b>folha</b> ({fmtBRL(d.base.folha)}) é o que a pessoa recebe;{" "}
                <b>provisões</b> ({fmtBRL(d.base.provisoes)}) é o 13º, as férias e o FGTS
                que estão sendo gerados agora e serão pagos depois;{" "}
                <b>INSS patronal</b> ({fmtBRL(d.base.patronal)}) é a parte do empregador.
                Somando, dá o custo mensal de {fmtBRL(d.base.custo_total)}.
              </p>
              <p className="mb-2">
                <b>Os {fmtBRL(d.aprovisionamento.total)} a reservar já estão dentro dos{" "}
                {fmtBRL(d.custo_12m)}</b> — não some os dois. A diferença é de{" "}
                <i>quando o dinheiro sai</i>: a folha sai todo mês, a provisão fica guardada
                até o 13º, as férias ou a rescisão vencerem.
              </p>
              <p className="text-muted-foreground">
                A reserva é {(d.aprovisionamento.total / d.custo_12m * 100).toFixed(1)}% do custo
                porque só quem é CLT gera 13º, férias e FGTS; estagiário gera recesso; associado
                e PJ não geram nenhum dos dois. Quanto maior a fatia CLT do quadro, maior essa
                reserva.
              </p>
            </div>

            <div className="text-[0.78rem] text-muted-foreground">
              No gráfico, a linha <b>Custo mensal</b> é o desembolso de cada mês
              {d.premissas.reajuste || d.premissas.crescimento
                ? " — ela sobe conforme o reajuste e o crescimento informados."
                : " — ela fica plana porque reajuste e crescimento estão em zero."}{" "}
              A linha <b>Reserva acumulada</b> só cresce: é a soma das provisões desde o
              início, ou seja, o saldo que deveria estar guardado naquele mês.
            </div>

            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={d.linhas.map((l) => ({ ...l, rotulo: fmtCompetencia(l.mes) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)} mil`} />
                <RTooltip formatter={(v: number) => fmtBRL(v)} />
                <Area type="monotone" dataKey="custo_total" name="Custo mensal" stroke="#1E7BFF" fill="#1E7BFF" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="provisionado_acumulado" name="Reserva acumulada" stroke="#0A1940" fill="#0A1940" fillOpacity={0.08} strokeWidth={2} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </AreaChart>
            </ResponsiveContainer>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border bg-card/60 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  Reserva necessária ({d.premissas.meses} meses)
                  <Ajuda titulo="Reserva necessária"
                         texto="Dinheiro que precisa estar guardado para honrar 13º, férias + 1/3, FGTS, multa do FGTS e recesso de estagiários acumulados no período." />
                </div>
                <Table>
                  <TableBody>
                    {Object.entries(APROV_LABEL).map(([k, l]) => (
                      d.aprovisionamento[k] > 0 && (
                        <TableRow key={k}>
                          <TableCell className="py-1.5 text-sm">{l}</TableCell>
                          <TableCell className="py-1.5 text-right font-mono text-xs">{fmtBRL(d.aprovisionamento[k])}</TableCell>
                        </TableRow>
                      )
                    ))}
                    <TableRow>
                      <TableCell className="py-1.5 text-sm font-bold">Total a reservar</TableCell>
                      <TableCell className="py-1.5 text-right font-mono text-sm font-bold text-[hsl(var(--dunatech-blue))]">
                        {fmtBRL(d.aprovisionamento.total)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Mês</TableHead>
                      <TableHead className="text-right text-xs">Custo do mês</TableHead>
                      <TableHead className="text-right text-xs">
                        <TituloAjuda titulo="Reserva acumulada" ajuda="Soma das provisões desde o início do período — é o valor que deveria estar guardado até aquele mês." />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.linhas.map((l) => (
                      <TableRow key={l.mes}>
                        <TableCell className="py-1.5 font-mono text-xs">{fmtCompetencia(l.mes)}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono text-xs">{fmtBRL(l.custo_total)}</TableCell>
                        <TableCell className="py-1.5 text-right font-mono text-xs text-muted-foreground">{fmtBRL(l.provisionado_acumulado)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────── SIMULAÇÃO DE CENÁRIOS ─────────────────── */

const VAGA_NOVA: DpAdmissaoSim = {
  regime: "clt", salario: 3000, vt: 300, va: 300, quantidade: 1, cc_nome: "", cargo_id: null,
};

function SimulacaoBloco({ ccs, cargos }: { ccs: DpCentroCusto[]; cargos: DpCargo[] }) {
  const [nome, setNome] = useState("Novo setor");
  const [meses, setMeses] = useState(12);
  const [reajuste, setReajuste] = useState(0);
  const [vagas, setVagas] = useState<DpAdmissaoSim[]>([{ ...VAGA_NOVA }]);
  const [res, setRes] = useState<DpSimulacao | null>(null);
  const [rodando, setRodando] = useState(false);

  const setVaga = (i: number, patch: Partial<DpAdmissaoSim>) =>
    setVagas((v) => v.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const simular = () => {
    setRodando(true);
    previsaoApi.simular({
      nome, meses, reajuste_percent: reajuste / 100,
      admissoes: vagas.filter((v) => v.quantidade > 0),
    })
      .then((r) => { setRes(r); toast.success(`Impacto mensal: ${fmtBRL(r.impacto_mensal)}`); })
      .catch((e) => toast.error(e.message))
      .finally(() => setRodando(false));
  };

  return (
    <Card className="glass-card border-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-[hsl(var(--dunatech-blue))]" />
          <TituloAjuda titulo="Simulação de cenários"
                       ajuda="Monte um cenário hipotético (abrir um setor, contratar, dar reajuste) e veja o impacto no custo antes de decidir. Nada é gravado." />
        </CardTitle>
        <CardDescription>
          Monte um cenário (novo setor, contratações, reajuste) e veja o <b>impacto financeiro estimado</b>.
          Nada é gravado — usa o mesmo motor de cálculo da folha real.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Nome do cenário</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 w-56 text-sm" />
          </div>
          <Campo rotulo="Horizonte (meses)" valor={meses} set={setMeses} w="w-28" />
          <Campo rotulo="Reajuste no quadro (%)" valor={reajuste} set={setReajuste} w="w-36" step={0.5} />
        </div>

        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Contratações simuladas</span>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                    onClick={() => setVagas((v) => [...v, { ...VAGA_NOVA }])}>
              <Plus className="h-3.5 w-3.5" /> Adicionar vaga
            </Button>
          </div>
          {vagas.map((v, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-md bg-muted/30 p-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Regime</Label>
                <Select value={v.regime} onValueChange={(x) => setVaga(i, { regime: x })}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(REGIME_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Cargo (sugere salário)</Label>
                <Select value={v.cargo_id ?? "__none__"}
                        onValueChange={(x) => {
                          const cg = cargos.find((c) => c.id === x);
                          setVaga(i, { cargo_id: x === "__none__" ? null : x, ...(cg?.salario_base ? { salario: cg.salario_base } : {}) });
                        }}>
                  <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem cargo —</SelectItem>
                    {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Centro de Custo</Label>
                <Input list={`ccs-${i}`} value={v.cc_nome} placeholder="Novo setor…"
                       onChange={(e) => setVaga(i, { cc_nome: e.target.value })}
                       className="h-8 w-[180px] text-xs" />
                <datalist id={`ccs-${i}`}>
                  {ccs.map((c) => <option key={c.id} value={c.nome} />)}
                </datalist>
              </div>
              <NumMini rotulo="Qtd" valor={v.quantidade} set={(x) => setVaga(i, { quantidade: x })} w="w-16" />
              <NumMini rotulo="Salário" valor={v.salario} set={(x) => setVaga(i, { salario: x })} w="w-24" />
              <NumMini rotulo="VT" valor={v.vt} set={(x) => setVaga(i, { vt: x })} w="w-20" />
              <NumMini rotulo="VA" valor={v.va} set={(x) => setVaga(i, { va: x })} w="w-20" />
              {vagas.length > 1 && (
                <button onClick={() => setVagas((vs) => vs.filter((_, idx) => idx !== i))}
                        className="mb-1 rounded p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <Button size="sm" className="glass-button gap-1 border-0" onClick={simular} disabled={rodando}>
            {rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            Simular impacto
          </Button>
        </div>

        {res && (
          <div className="space-y-3 rounded-lg border-2 border-[hsl(var(--dunatech-blue))]/30 bg-[hsl(var(--dunatech-blue))]/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-heading text-sm font-bold">Resultado — {res.nome}</h4>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="gap-1"
                        onClick={() => exportApi.simulacao(res, "excel").catch((e) => toast.error(e.message))}>
                  <Download className="h-3.5 w-3.5" /> Excel
                </Button>
                <Button size="sm" variant="outline" className="gap-1"
                        onClick={() => exportApi.simulacao(res, "pdf").catch((e) => toast.error(e.message))}>
                  <FileText className="h-3.5 w-3.5" /> PDF
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Mini rotulo="Impacto por mês" valor={fmtBRL(res.impacto_mensal)} destaque
                    ajuda="Quanto o custo mensal de pessoal aumenta (ou diminui) se este cenário virar realidade." />
              <Mini rotulo={`Impacto em ${res.meses} meses`} valor={fmtBRL(res.impacto_anual)}
                    ajuda="O impacto mensal multiplicado pelo período informado." />
              <Mini rotulo="Custo por contratação" valor={fmtBRL(res.custo_medio_por_novo)}
                    ajuda="Custo médio mensal de cada pessoa contratada no cenário, com encargos e provisões." />
              <Mini rotulo="Pessoas" valor={`${res.atual.headcount} → ${res.cenario.headcount}`}
                    ajuda="Tamanho do quadro antes e depois do cenário." />
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={[
                { k: "Folha", atual: res.atual.folha, cenario: res.cenario.folha },
                { k: "Provisões", atual: res.atual.provisoes, cenario: res.cenario.provisoes },
                { k: "Patronal", atual: res.atual.patronal, cenario: res.cenario.patronal },
                { k: "Custo total", atual: res.atual.custo_total, cenario: res.cenario.custo_total },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="k" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <RTooltip formatter={(v: number) => fmtBRL(v)} />
                <Bar dataKey="atual" name="Atual" fill="#0A1940" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cenario" name="Simulado" fill="#1E7BFF" radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
            {res.por_centro_custo.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Centro de custo (novo)</TableHead>
                    <TableHead className="text-right text-xs">Vagas</TableHead>
                    <TableHead className="text-right text-xs">Custo mensal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {res.por_centro_custo.map((c) => (
                    <TableRow key={c.centro_custo}>
                      <TableCell className="py-1.5 text-sm">{c.centro_custo}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono text-xs">{c.headcount}</TableCell>
                      <TableCell className="py-1.5 text-right font-mono text-xs">{fmtBRL(c.custo_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─────────────────── auxiliares ─────────────────── */

function Campo({ rotulo, valor, set, w, step, ajuda }: {
  rotulo: string; valor: number; set: (v: number) => void; w: string;
  step?: number; ajuda?: string;
}) {
  return (
    <div>
      <Label className="flex items-center gap-1 text-xs text-muted-foreground">
        {rotulo}
        {ajuda && <Ajuda titulo={rotulo} texto={ajuda} />}
      </Label>
      <Input type="number" step={step ?? 1} value={valor}
             onChange={(e) => set(Number(e.target.value))} className={`h-9 ${w} font-mono text-sm`} />
    </div>
  );
}

function NumMini({ rotulo, valor, set, w }: {
  rotulo: string; valor: number; set: (v: number) => void; w: string;
}) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{rotulo}</Label>
      <Input type="number" value={valor} onChange={(e) => set(Number(e.target.value))}
             className={`h-8 ${w} font-mono text-xs`} />
    </div>
  );
}

function Mini({ rotulo, valor, destaque, ajuda }: {
  rotulo: string; valor: string; destaque?: boolean; ajuda?: string;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${destaque ? "border-[hsl(var(--dunatech-blue))]/40 bg-[hsl(var(--dunatech-blue))]/10" : "bg-card/60"}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{rotulo}</span>{ajuda && <Ajuda titulo={rotulo} texto={ajuda} />}
      </div>
      <div className={`font-mono text-sm font-bold ${destaque ? "text-[hsl(var(--dunatech-blue))]" : ""}`}>{valor}</div>
    </div>
  );
}
