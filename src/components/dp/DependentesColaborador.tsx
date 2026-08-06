// Dependentes do colaborador — base do SALÁRIO-FAMÍLIA.
//
// Guardamos data de nascimento, não uma contagem: a cota morre no mês em que o
// dependente faz 14 anos, e com um número solto alguém teria que lembrar de
// decrementar na mão todo mês. A tela mostra até quando cada cota vale e avisa
// quando a comprovação (vacinação até 6 anos, frequência escolar dos 7 aos 14)
// está vencida — valor pago sem comprovação não é compensável na GPS.
import { useCallback, useEffect, useState } from "react";
import { Baby, Loader2, Plus, TriangleAlert, UserMinus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Ajuda } from "@/components/dp/Ajuda";
import { type DpColaborador, type DpDependente, dpApi } from "@/services/dp";

const TIPOS = [
  { valor: "filho", rotulo: "Filho(a)" },
  { valor: "enteado", rotulo: "Enteado(a)" },
  { valor: "tutelado", rotulo: "Menor sob tutela" },
];

const VAZIO = {
  nome: "", data_nascimento: "", tipo: "filho", cpf: "", invalido: false,
  vacinacao_valida_ate: "", frequencia_escolar_valida_ate: "",
};

export default function DependentesColaborador({ colaborador, editar }: {
  colaborador: DpColaborador; editar: boolean;
}) {
  const [deps, setDeps] = useState<DpDependente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [form, setForm] = useState({ ...VAZIO });

  const carregar = useCallback(() => {
    setCarregando(true);
    dpApi.dependentes(colaborador.id)
      .then(setDeps)
      .catch(() => undefined)
      .finally(() => setCarregando(false));
  }, [colaborador.id]);
  useEffect(carregar, [carregar]);

  const naoClt = colaborador.regime !== "clt";
  const ativos = deps.filter((d) => d.ativo);
  const comCota = ativos.filter((d) => d.elegivel_hoje);
  const pendentes = comCota.filter((d) => d.comprovacao_pendente);

  const salvar = async () => {
    if (!form.nome.trim()) return toast.error("Informe o nome do dependente.");
    if (!form.data_nascimento) {
      return toast.error("Informe a data de nascimento — é ela que define até quando a cota vale.");
    }
    setSalvando(true);
    try {
      await dpApi.criarDependente(colaborador.id, {
        ...form,
        vacinacao_valida_ate: form.vacinacao_valida_ate || null,
        frequencia_escolar_valida_ate: form.frequencia_escolar_valida_ate || null,
      } as Partial<DpDependente>);
      toast.success("Dependente cadastrado");
      setForm({ ...VAZIO });
      setAbrindo(false);
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao cadastrar");
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (d: DpDependente) => {
    try {
      await dpApi.removerDependente(colaborador.id, d.id);
      toast.success(`${d.nome} inativado`, {
        description: "O histórico de quem já recebeu cota é preservado.",
      });
      carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao inativar");
    }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Baby className="h-3.5 w-3.5" />
          Dependentes (salário-família)
          <Ajuda texto={
            "A cota é devida por dependente até o mês em que ele faz 14 anos — " +
            "inválido não tem limite de idade. O direito também depende da " +
            "remuneração do mês ficar dentro do teto legal, por isso quem está " +
            "no limite pode entrar e sair conforme hora extra ou férias. " +
            "Comprovação: vacinação até os 6 anos, frequência escolar dos 7 aos 14."
          } />
        </div>
        {editar && !abrindo && (
          <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setAbrindo(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
          </Button>
        )}
      </div>

      {naoClt && (
        <p className="mb-2 rounded bg-muted px-2 py-1.5 text-[0.7rem] text-muted-foreground">
          Este colaborador é <b>{colaborador.regime}</b>. O salário-família é
          benefício do segurado empregado — o cadastro fica registrado, mas não
          gera cota na folha.
        </p>
      )}

      {pendentes.length > 0 && (
        <div className="mb-2 flex items-start gap-2 rounded border border-warning/40 bg-warning/10 px-2 py-1.5">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="text-[0.7rem] text-foreground/90">
            <b>{pendentes.length} dependente(s) com comprovação irregular.</b> A
            cota continua sendo paga, mas valor pago sem comprovação em dia
            <b> não é compensável na GPS</b> — regularize ou suspenda com o DP.
          </p>
        </div>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : deps.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum dependente cadastrado.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {deps.map((d) => (
            <li key={d.id}
                className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded border bg-card px-2 py-1.5 text-xs ${
                  d.ativo ? "" : "opacity-55"}`}>
              <span className="font-medium">{d.nome}</span>
              <span className="text-muted-foreground">
                {d.nascimento_br} · {d.idade} ano(s) · {d.tipo_label}
              </span>
              {d.invalido && (
                <Badge variant="outline" className="h-5 border-primary/40 text-[0.65rem]">
                  inválido — sem limite de idade
                </Badge>
              )}
              {!d.ativo ? (
                <Badge variant="outline" className="h-5 text-[0.65rem]">inativo</Badge>
              ) : d.elegivel_hoje ? (
                <Badge variant="outline" className="h-5 border-success/40 text-[0.65rem] text-success">
                  gera cota{d.cota_ate ? ` até ${d.cota_ate}` : ""}
                </Badge>
              ) : (
                <Badge variant="outline" className="h-5 text-[0.65rem] text-muted-foreground">
                  cota encerrada
                </Badge>
              )}
              {d.ativo && d.comprovacao_pendente && (
                <Badge variant="outline" className="h-5 border-warning/40 text-[0.65rem] text-warning">
                  {d.comprovacao_pendente}
                </Badge>
              )}
              {editar && d.ativo && (
                <Button size="sm" variant="ghost"
                        className="ml-auto h-6 px-1.5 text-[0.65rem] text-muted-foreground"
                        onClick={() => remover(d)}>
                  <UserMinus className="mr-1 h-3 w-3" /> inativar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editar && abrindo && (
        <div className="mt-3 space-y-2 rounded-lg border bg-card p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-[0.7rem]">Nome</Label>
              <Input className="h-8 text-xs" value={form.nome}
                     onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label className="text-[0.7rem]">Data de nascimento</Label>
              <Input type="date" className="h-8 text-xs" value={form.data_nascimento}
                     onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
            </div>
            <div>
              <Label className="text-[0.7rem]">Vínculo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[0.7rem]">CPF (opcional)</Label>
              <Input className="h-8 text-xs" value={form.cpf}
                     onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
            </div>
            <div>
              <Label className="text-[0.7rem]">Vacinação válida até</Label>
              <Input type="date" className="h-8 text-xs" value={form.vacinacao_valida_ate}
                     onChange={(e) => setForm({ ...form, vacinacao_valida_ate: e.target.value })} />
              <p className="mt-0.5 text-[0.65rem] text-muted-foreground">exigida até os 6 anos</p>
            </div>
            <div>
              <Label className="text-[0.7rem]">Frequência escolar válida até</Label>
              <Input type="date" className="h-8 text-xs"
                     value={form.frequencia_escolar_valida_ate}
                     onChange={(e) => setForm({ ...form, frequencia_escolar_valida_ate: e.target.value })} />
              <p className="mt-0.5 text-[0.65rem] text-muted-foreground">exigida dos 7 aos 14 anos</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={form.invalido}
                      onCheckedChange={(v) => setForm({ ...form, invalido: !!v })} />
            Dependente inválido (sem limite de idade)
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="ghost" className="h-7 text-xs"
                    onClick={() => { setAbrindo(false); setForm({ ...VAZIO }); }}>
              Cancelar
            </Button>
            <Button size="sm" className="h-7 text-xs" disabled={salvando} onClick={salvar}>
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar dependente"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
