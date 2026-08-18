// Férias / recesso do mês — versão simples acertada com o DP.
//
// Não é controle de período aquisitivo: o operador diz que a pessoa sai de
// férias naquele mês e o sistema calcula o que isso muda no pagamento. As
// regras vêm da CLT (remuneração dos dias + 1/3, abono de até 1/3 do período,
// INSS próprio das férias) e da Lei do Estágio (recesso remunerado, sem 1/3).
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, Loader2, Palmtree } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Ajuda } from "@/components/dp/Ajuda";
import { type DpCompetencia, type DpFolhaItem, fmtBRL, folhaApi } from "@/services/dp";

const REGIME_LABEL: Record<string, string> = {
  clt: "CLT", estagiario: "Estagiário", associado: "Associado", pj: "PJ",
};

export default function FeriasDialog({ comp, item, onClose, onLancou }: {
  comp: DpCompetencia;
  item: DpFolhaItem;
  onClose: () => void;
  onLancou: () => void;
}) {
  const clt = item.regime === "clt";
  const estagiario = item.regime === "estagiario";

  const [inicio, setInicio] = useState<Date | undefined>(
    item.ferias_inicio ? new Date(item.ferias_inicio + "T12:00:00") : undefined,
  );
  const [dias, setDias] = useState<number>(item.ferias_dias || 30);
  const [abono, setAbono] = useState<number>(0);
  const [salvando, setSalvando] = useState(false);
  const [calendarioAberto, setCalendarioAberto] = useState(false);

  const fim = useMemo(() => {
    if (!inicio || dias <= 0) return undefined;
    const d = new Date(inicio);
    d.setDate(d.getDate() + dias - 1);
    return d;
  }, [inicio, dias]);

  // Prévia local — o número oficial é o que o servidor devolve ao salvar.
  const previa = useMemo(() => {
    const diaria = (item.salario_bruto || 0) / 30;
    if (!clt) {
      return estagiario
        ? { remuneracao: 0, terco: 0, abonoValor: 0, descontoSalario: 0, recesso: true }
        : { remuneracao: 0, terco: 0, abonoValor: 0, descontoSalario: 0, semDireito: true };
    }
    const remuneracao = diaria * dias;
    const baseAbono = diaria * abono;
    return {
      remuneracao,
      terco: remuneracao / 3,
      abonoValor: abono > 0 ? baseAbono + baseAbono / 3 : 0,
      descontoSalario: remuneracao,
    };
  }, [clt, estagiario, item.salario_bruto, dias, abono]);

  // O abono e' 1/3 do DIREITO ADQUIRIDO, e o direito e' gozo + venda — nao o
  // gozo sozinho. Resolvendo abono <= (gozo + abono)/3 sai abono <= gozo/2:
  // quem goza 20 vende 10 (direito 30), quem goza 16 vende 8 (direito 24, o
  // exemplo do proprio DP). Dividir por 3 o gozo dava 6 em cima de 20 e
  // travava a venda legitima; e' o mesmo erro que o backend ja' tinha e que o
  // recibo do PEDRO corrigiu la'. Teto absoluto de 10 porque o direito para
  // em 30 dias.
  const maxAbono = Math.min(10, Math.floor(dias / 2));

  const salvar = async () => {
    if (dias > 0 && !inicio) { toast.error("Escolha a data de início das férias."); return; }
    setSalvando(true);
    try {
      await folhaApi.lancar(comp.id, {
        colaborador_id: item.colaborador_id,
        ferias_inicio: inicio ? format(inicio, "yyyy-MM-dd") : "",
        ferias_dias: dias,
        ferias_abono_dias: clt ? abono : 0,
      } as any);
      toast.success(dias > 0
        ? `Férias lançadas — a folha de ${item.nome.split(" ")[0]} já foi recalculada.`
        : "Férias removidas da competência.");
      onLancou();
    } catch (e: any) { toast.error(e.message); }
    finally { setSalvando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Palmtree className="h-4 w-4 text-emerald-600" />
            {estagiario ? "Recesso" : "Férias"} — {item.nome}
          </DialogTitle>
          <DialogDescription>
            {clt && "Os dias saem do salário e voltam como remuneração de férias mais 1/3 constitucional. Vale-transporte e vale-alimentação caem na mesma proporção."}
            {estagiario && "Recesso da Lei do Estágio: 30 dias a cada 12 meses, com a bolsa paga integralmente — sem 1/3 e sem INSS."}
            {!clt && !estagiario && `${REGIME_LABEL[item.regime]} não tem direito legal a férias — a marcação fica só como ausência programada, sem verba.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Início</Label>
            <Popover open={calendarioAberto} onOpenChange={setCalendarioAberto}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 w-full justify-start gap-2 text-left text-sm font-normal">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  {inicio ? format(inicio, "dd/MM/yyyy") : <span className="text-muted-foreground">Escolher no calendário</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={ptBR}
                  selected={inicio}
                  defaultMonth={inicio ?? new Date(comp.ano, comp.mes - 1, 1)}
                  onSelect={(d) => { setInicio(d); setCalendarioAberto(false); }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label className="flex items-center gap-1 text-xs text-muted-foreground">
              Dias
              <Ajuda titulo="Dias de férias"
                     texto="O período pode ser fracionado em até 3 partes, sendo uma delas de no mínimo 14 dias (regra da reforma de 2017). Zerar os dias remove as férias da competência." />
            </Label>
            <Input type="number" min={0} max={30} value={dias} className="h-9 font-mono"
                   onChange={(e) => {
                     const v = Math.max(0, Math.min(30, Number(e.target.value)));
                     setDias(v);
                     setAbono((a) => Math.min(a, Math.floor(v / 3)));
                   }} />
          </div>
        </div>

        {fim && (
          <div className="rounded-lg border border-[hsl(var(--dunatech-blue))]/25 bg-[hsl(var(--dunatech-blue))]/5 px-3 py-2 text-xs">
            De <b>{format(inicio!, "dd 'de' MMMM", { locale: ptBR })}</b> a{" "}
            <b>{format(fim, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</b> · retorna em{" "}
            <b>{format(new Date(fim.getTime() + 86400000), "dd/MM/yyyy")}</b>
          </div>
        )}

        {clt && dias > 0 && (
          <div>
            <Label className="flex items-center gap-1 text-xs text-muted-foreground">
              Abono pecuniário — dias vendidos
              <Ajuda titulo="Abono pecuniário"
                     texto="O colaborador pode vender até 1/3 do DIREITO ADQUIRIDO — e o direito é o que ele goza mais o que vende. Quem goza 20 dias tem direito de 30 e pode vender 10; quem goza 16 tem direito de 24 e vende 8. Teto absoluto de 10 dias. O valor é indenizatório: entra no pagamento acrescido de 1/3 e não sofre INSS." />
            </Label>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} max={maxAbono} value={abono} className="h-9 w-24 font-mono"
                     onChange={(e) => setAbono(Math.max(0, Math.min(maxAbono, Number(e.target.value))))} />
              <span className="text-xs text-muted-foreground">
                máximo {maxAbono} dia(s) — 1/3 do direito de {dias + maxAbono} dias
              </span>
            </div>
          </div>
        )}

        {dias > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs">
            <p className="eyebrow mb-2">Prévia do pagamento</p>
            {clt ? (
              <ul className="space-y-1">
                <Linha rotulo={`Salário dos ${30 - dias} dia(s) trabalhado(s)`}
                       valor={fmtBRL((item.salario_bruto / 30) * (30 - dias))} />
                <Linha rotulo={`Remuneração de ${dias} dia(s) de férias`} valor={fmtBRL(previa.remuneracao)} />
                <Linha rotulo="1/3 constitucional" valor={fmtBRL(previa.terco)} destaque />
                {abono > 0 && (
                  <Linha rotulo={`Abono de ${abono} dia(s) vendido(s) + 1/3`} valor={fmtBRL(previa.abonoValor)} destaque />
                )}
                <li className="border-t pt-1 text-[0.7rem] text-muted-foreground">
                  INSS é calculado à parte sobre as férias; vale-transporte e vale-alimentação
                  caem proporcionalmente aos dias fora. O valor final sai no recálculo.
                </li>
              </ul>
            ) : estagiario ? (
              <p className="text-muted-foreground">
                Bolsa paga integralmente ({fmtBRL(item.salario_bruto)}). O recesso não gera 1/3
                nem desconto de INSS.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Nenhuma verba é gerada — a folha do mês segue igual.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button className="glass-button border-0" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Palmtree className="mr-1 h-4 w-4" />}
            {dias > 0 ? "Lançar e recalcular" : "Remover férias"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className={`font-mono-numbers ${destaque ? "font-semibold text-emerald-600" : ""}`}>{valor}</span>
    </li>
  );
}
