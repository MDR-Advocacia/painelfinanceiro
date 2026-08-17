// Crédito do trabalhador (empréstimo consignado) — POR CONTRATO.
//
// O desconto em folha vem DAQUI: parcela fixa + prazo fazem a folha descontar
// sozinha todo mês e PARAR sozinha na última parcela — que é onde o controle
// manual erra. A ALEXIA é o caso-limite que motivou a seção: 3 contratos
// simultâneos, R$ 540,15/mês, impossível de acompanhar de cabeça.
//
// Não é custo do escritório: a empresa retém e repassa ao banco. Sai do
// líquido da pessoa e volta na conta do custo.
import { useCallback, useEffect, useState } from "react";
import { Landmark, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ajuda } from "@/components/dp/Ajuda";
import { type DpColaborador, type DpConsignado, dpApi, fmtBRL } from "@/services/dp";

const VAZIO = { contrato: "", banco: "", parcela_valor: "", parcelas_total: "",
                primeira_competencia: "", observacao: "" };

export default function ConsignadosColaborador({ colaborador, editar }: {
  colaborador: DpColaborador; editar: boolean;
}) {
  const [itens, setItens] = useState<DpConsignado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [abrindo, setAbrindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ ...VAZIO });

  const carregar = useCallback(() => {
    setCarregando(true);
    dpApi.consignados(colaborador.id)
      .then(setItens).catch(() => undefined).finally(() => setCarregando(false));
  }, [colaborador.id]);
  useEffect(carregar, [carregar]);

  const ativos = itens.filter((c) => c.descontando_neste_mes);
  const parcelaMes = ativos.reduce((t, c) => t + c.parcela_valor, 0);

  const salvar = async () => {
    if (!form.contrato.trim()) return toast.error("Informe o número do contrato.");
    if (!Number(form.parcela_valor)) return toast.error("Informe o valor da parcela.");
    if (!form.primeira_competencia) return toast.error("Informe a primeira competência.");
    setSalvando(true);
    try {
      await dpApi.criarConsignado(colaborador.id, {
        contrato: form.contrato, banco: form.banco,
        parcela_valor: Number(form.parcela_valor),
        parcelas_total: Number(form.parcelas_total) || 0,
        // input month devolve "2026-07": o backend normaliza pro dia 1
        primeira_competencia: `${form.primeira_competencia}-01`,
        observacao: form.observacao,
      } as Partial<DpConsignado>);
      toast.success("Contrato registrado", {
        description: "A folha passa a descontar a parcela todo mês, até quitar.",
      });
      setForm({ ...VAZIO }); setAbrindo(false); carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar");
    } finally { setSalvando(false); }
  };

  const encerrar = async (c: DpConsignado) => {
    try {
      await dpApi.editarConsignado(colaborador.id, c.id, { ativo: !c.ativo });
      toast.success(c.ativo ? "Contrato encerrado — para de descontar" : "Contrato reativado");
      carregar();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
  };

  const remover = async (c: DpConsignado) => {
    try {
      await dpApi.removerConsignado(colaborador.id, c.id);
      toast.success("Contrato removido");
      carregar();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Falha"); }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Landmark className="h-3.5 w-3.5" />
          Crédito do trabalhador (consignado)
          <Ajuda texto={
            "Empréstimo descontado em folha e repassado ao banco. Registrado POR CONTRATO: "
            + "a parcela desconta sozinha todo mês e para sozinha na última — sem lançamento "
            + "manual. Não é custo do escritório; sai do líquido da pessoa. O número do "
            + "contrato casa com a linha DESC. EMP. CRED. TRAB. do extrato da contabilidade."
          } />
        </div>
        {editar && !abrindo && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAbrindo(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Registrar contrato
          </Button>
        )}
      </div>

      {ativos.length > 0 && (
        <div className="mb-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-[0.72rem] text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
          Descontando <b>{fmtBRL(parcelaMes)}</b> por mês
          ({ativos.length} contrato{ativos.length > 1 ? "s" : ""} ativo{ativos.length > 1 ? "s" : ""})
        </div>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : itens.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum contrato registrado.</p>
      ) : (
        <ul className="space-y-1.5">
          {itens.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 rounded border bg-card px-2 py-1.5 text-xs">
              <span className="font-mono font-medium">{c.contrato}</span>
              {c.banco && <span className="text-muted-foreground">{c.banco}</span>}
              <span className="font-mono">{fmtBRL(c.parcela_valor)}/mês</span>
              <span className="text-muted-foreground">
                desde {c.primeira_br}
                {c.parcelas_total
                  ? ` · parcela ${Math.min(c.parcelas_pagas, c.parcelas_total)}/${c.parcelas_total}`
                  : " · sem prazo definido"}
              </span>
              {c.quitado && (
                <Badge variant="outline" className="h-5 border-success/40 text-[0.62rem] text-success">
                  quitado
                </Badge>
              )}
              {!c.ativo && !c.quitado && (
                <Badge variant="outline" className="h-5 text-[0.62rem]">encerrado</Badge>
              )}
              {c.descontando_neste_mes && (
                <Badge variant="outline" className="h-5 border-rose-300 text-[0.62rem] text-rose-700">
                  descontando
                </Badge>
              )}
              {editar && (
                <span className="ml-auto flex items-center gap-1">
                  {!c.quitado && (
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[0.68rem]"
                            onClick={() => encerrar(c)}>
                      {c.ativo ? "encerrar" : "reativar"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-6 px-1.5 text-muted-foreground"
                          onClick={() => remover(c)} title="Remover (só se lançado errado)">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {editar && abrindo && (
        <div className="mt-3 space-y-2.5 rounded-lg border bg-card p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-[0.7rem]">Número do contrato</Label>
              <Input className="h-8 font-mono text-xs" value={form.contrato}
                     placeholder="ex.: 208378604"
                     onChange={(e) => setForm({ ...form, contrato: e.target.value })} />
              <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
                o mesmo do extrato da contabilidade
              </p>
            </div>
            <div>
              <Label className="text-[0.7rem]">Banco (opcional)</Label>
              <Input className="h-8 text-xs" value={form.banco}
                     onChange={(e) => setForm({ ...form, banco: e.target.value })} />
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <Label className="text-[0.7rem]">Parcela (R$/mês)</Label>
              <Input type="number" step="0.01" min={0} className="h-8 font-mono text-xs"
                     value={form.parcela_valor}
                     onChange={(e) => setForm({ ...form, parcela_valor: e.target.value })} />
            </div>
            <div>
              <Label className="text-[0.7rem]">Qtde de parcelas</Label>
              <Input type="number" min={0} className="h-8 font-mono text-xs"
                     value={form.parcelas_total} placeholder="0 = sem prazo"
                     onChange={(e) => setForm({ ...form, parcelas_total: e.target.value })} />
              <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
                com prazo, a folha para sozinha na última
              </p>
            </div>
            <div>
              <Label className="text-[0.7rem]">Primeira competência</Label>
              <Input type="month" className="h-8 text-xs" value={form.primeira_competencia}
                     onChange={(e) => setForm({ ...form, primeira_competencia: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-[0.7rem]">Observação</Label>
            <Input className="h-8 text-xs" value={form.observacao}
                   onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs"
                    onClick={() => { setAbrindo(false); setForm({ ...VAZIO }); }}>Cancelar</Button>
            <Button size="sm" className="h-7 text-xs" disabled={salvando} onClick={salvar}>
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Registrar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
