// Transferência de contrato — a MESMA pessoa mudando de vínculo.
//
// A matrícula é numerada por regime (10xx estagiário, 20xx CLT, 30xx associado,
// 40xx PJ), então efetivar alguém obriga a encerrar uma ficha e abrir outra.
// Sem registrar o vínculo, o painel lê isso como um desligamento e uma admissão
// de pessoas diferentes — e o turnover incha com quem nunca saiu do escritório.
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, GitMerge, Loader2, Link2Off } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ajuda } from "@/components/dp/Ajuda";
import { ColaboradorPicker } from "@/components/dp/Pickers";
import {
  type DpColaborador, type DpTransferencia, REGIME_LABELS, dpApi, fmtData,
} from "@/services/dp";

export default function TransferenciaContrato({ colaborador, editar, onMudou }: {
  colaborador: DpColaborador; editar: boolean; onMudou?: () => void;
}) {
  const [t, setT] = useState<DpTransferencia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [abrindo, setAbrindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [candidatos, setCandidatos] = useState<DpColaborador[]>([]);
  const [origem, setOrigem] = useState<string | null>(null);
  const [data, setData] = useState("");
  const [motivo, setMotivo] = useState("");
  const [moverDeps, setMoverDeps] = useState(true);

  const carregar = useCallback(() => {
    setCarregando(true);
    dpApi.transferencia(colaborador.id)
      .then(setT)
      .catch(() => setT(null))
      .finally(() => setCarregando(false));
  }, [colaborador.id]);
  useEffect(carregar, [carregar]);

  // candidatos a origem: só desligados, e só quem ainda não foi transferido —
  // matrícula ativa não pode ser origem, senão a pessoa conta duas vezes
  const carregarCandidatos = useCallback(() => {
    dpApi.listar({ status: "inativo", limit: 500 })
      .then((r) => setCandidatos(
        r.items.filter((c) => c.id !== colaborador.id && !c.transferencia?.continuou_como)))
      .catch(() => setCandidatos([]));
  }, [colaborador.id]);

  const registrar = async () => {
    if (!origem) return toast.error("Escolha a matrícula anterior.");
    setSalvando(true);
    try {
      const r = await dpApi.registrarTransferencia(colaborador.id, {
        origem_id: origem, data_efeito: data || undefined,
        motivo: motivo || undefined, mover_dependentes: moverDeps,
      });
      toast.success("Transferência registrada", {
        description: r.dependentes_movidos
          ? `${r.dependentes_movidos} dependente(s) vieram junto. Este movimento deixa de contar como admissão e desligamento.`
          : "Este movimento deixa de contar como admissão e desligamento.",
      });
      setAbrindo(false);
      setOrigem(null); setData(""); setMotivo("");
      carregar();
      onMudou?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar");
    } finally {
      setSalvando(false);
    }
  };

  const desfazer = async () => {
    setSalvando(true);
    try {
      const r = await dpApi.desfazerTransferencia(colaborador.id);
      toast.success("Transferência desfeita", {
        description: r.dependentes_devolvidos
          ? `${r.dependentes_devolvidos} dependente(s) voltaram para a matrícula anterior.`
          : "O movimento volta a contar como admissão e desligamento.",
      });
      carregar();
      onMudou?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao desfazer");
    } finally {
      setSalvando(false);
    }
  };

  const veio = t?.veio_de;
  const foi = t?.continuou_como;

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <GitMerge className="h-3.5 w-3.5" />
          Transferência de contrato
          <Ajuda texto={
            "Use quando a pessoa muda de vínculo e ganha matrícula nova — efetivação " +
            "de estágio para CLT, por exemplo. Registrar o vínculo une o histórico das " +
            "duas fichas e impede que o painel conte um desligamento e uma admissão de " +
            "alguém que nunca saiu do escritório."
          } />
        </div>
        {editar && !veio && !foi && !abrindo && (
          <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => { setAbrindo(true); carregarCandidatos(); }}>
            Vincular contrato anterior
          </Button>
        )}
      </div>

      {carregando ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : veio || foi ? (
        <div className="space-y-2">
          {veio && (
            <div className="flex flex-wrap items-center gap-2 rounded border bg-card px-2.5 py-2 text-xs">
              <span className="text-muted-foreground">Veio de</span>
              <span className="font-mono font-semibold">#{veio.matricula}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem]">
                {REGIME_LABELS[veio.regime] || veio.regime}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono font-semibold">#{colaborador.matricula}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem]">
                {colaborador.regime_label}
              </span>
              <span className="text-muted-foreground">em {fmtData(veio.data)}</span>
              {veio.motivo && <span className="text-muted-foreground">· {veio.motivo}</span>}
            </div>
          )}
          {foi && (
            <div className="flex flex-wrap items-center gap-2 rounded border bg-card px-2.5 py-2 text-xs">
              <span className="text-muted-foreground">Esta matrícula foi encerrada e continuou em</span>
              <span className="font-mono font-semibold">#{foi.matricula}</span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem]">
                {REGIME_LABELS[foi.regime] || foi.regime}
              </span>
              <span className="text-muted-foreground">em {fmtData(foi.data)}</span>
            </div>
          )}
          <p className="text-[0.7rem] text-muted-foreground">
            Este movimento <b>não conta</b> como admissão nem como desligamento no turnover.
          </p>
          {editar && veio && (
            <Button size="sm" variant="ghost" disabled={salvando}
                    className="h-7 px-2 text-[0.7rem] text-muted-foreground"
                    onClick={desfazer}>
              <Link2Off className="mr-1 h-3 w-3" /> desfazer vínculo
            </Button>
          )}
        </div>
      ) : abrindo ? (
        <div className="space-y-2.5 rounded-lg border bg-card p-3">
          <div>
            <Label className="text-[0.7rem]">Matrícula anterior (contrato encerrado)</Label>
            <ColaboradorPicker
              className="mt-1 w-full"
              placeholder={candidatos.length ? "Escolha quem era antes" : "Nenhum desligado disponível"}
              opcoes={candidatos.map((c) => ({
                id: c.id, nome: `#${c.matricula} · ${c.nome} · ${c.regime_label}`,
              }))}
              valor={origem}
              onChange={setOrigem}
            />
            <p className="mt-1 text-[0.65rem] text-muted-foreground">
              Só aparecem fichas <b>desligadas</b>: uma matrícula ativa não pode ser origem,
              senão a pessoa passaria a contar duas vezes no quadro.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-[0.7rem]">A partir de</Label>
              <Input type="date" className="h-8 text-xs" value={data}
                     onChange={(e) => setData(e.target.value)} />
              <p className="mt-0.5 text-[0.65rem] text-muted-foreground">
                vazio usa a data de admissão desta ficha
              </p>
            </div>
            <div>
              <Label className="text-[0.7rem]">Motivo</Label>
              <Input className="h-8 text-xs" placeholder="Ex.: efetivação após o estágio"
                     value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          </div>
          <label className="flex items-start gap-2 text-xs">
            <Checkbox checked={moverDeps} className="mt-0.5"
                      onCheckedChange={(v) => setMoverDeps(!!v)} />
            <span>
              Levar os dependentes junto
              <span className="block text-[0.65rem] text-muted-foreground">
                sem isso o salário-família some no dia da mudança, porque a ficha nova
                nasce sem dependente nenhum
              </span>
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs"
                    onClick={() => { setAbrindo(false); setOrigem(null); }}>
              Cancelar
            </Button>
            <Button size="sm" className="h-7 text-xs" disabled={salvando || !origem}
                    onClick={registrar}>
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Registrar"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nenhum vínculo com outra matrícula.
        </p>
      )}
    </div>
  );
}
