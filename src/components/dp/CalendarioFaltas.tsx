// Lançamento de faltas por CALENDÁRIO.
//
// Por que não um campo "quantas faltas": o DSR é UM POR SEMANA. Três faltas na
// mesma semana custam 3 dias + 1 DSR; três faltas em semanas diferentes custam
// 3 dias + 3 DSR. Um número solto não distingue os dois casos — só a data diz.
//
// O calendário começa na SEGUNDA de propósito: assim cada LINHA da grade é
// exatamente uma semana, terminando no domingo, que é o dia de descanso. O
// operador vê na hora quantas semanas foram atingidas, porque são as linhas
// marcadas.
import { useMemo } from "react";

import { Ajuda } from "@/components/dp/Ajuda";
import { fmtBRL } from "@/services/dp";

export interface FaltaDia {
  data: string;          // "YYYY-MM-DD"
  justificada?: boolean;
  motivo?: string;
}

const DIAS_CABECALHO = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/** Chave ISO (ano, semana) — mesma que o backend usa para contar o DSR. */
function semanaIso(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // quinta-feira da mesma semana define o ano ISO
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const inicioAno = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((t.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-${semana}`;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function CalendarioFaltas({
  ano, mes, valor, onChange, diaria, temDsr, editar = true,
}: {
  ano: number;
  mes: number;                       // 1-12
  valor: FaltaDia[];
  onChange: (v: FaltaDia[]) => void;
  diaria: number;                    // salário ÷ 30, para a prévia
  temDsr: boolean;                   // estagiário não perde DSR
  editar?: boolean;
}) {
  const porData = useMemo(() => {
    const m = new Map<string, FaltaDia>();
    for (const f of valor) m.set(f.data, f);
    return m;
  }, [valor]);

  // grade: começa na segunda da semana do dia 1 e vai até o fim do mês
  const semanas = useMemo(() => {
    const primeiro = new Date(ano, mes - 1, 1);
    const ultimo = new Date(ano, mes, 0);
    const cursor = new Date(primeiro);
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7)); // recua até segunda
    const linhas: Date[][] = [];
    while (cursor <= ultimo) {
      const linha: Date[] = [];
      for (let i = 0; i < 7; i++) {
        linha.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      linhas.push(linha);
    }
    return linhas;
  }, [ano, mes]);

  // clique cicla: nada → injustificada → justificada → nada
  const alternar = (d: Date) => {
    if (!editar) return;
    const chave = iso(d);
    const atual = porData.get(chave);
    let proximo: FaltaDia[];
    if (!atual) proximo = [...valor, { data: chave, justificada: false }];
    else if (!atual.justificada)
      proximo = valor.map((f) => (f.data === chave ? { ...f, justificada: true } : f));
    else proximo = valor.filter((f) => f.data !== chave);
    proximo.sort((a, b) => a.data.localeCompare(b.data));
    onChange(proximo);
  };

  const injustificadas = valor.filter((f) => !f.justificada);
  const justificadas = valor.length - injustificadas.length;
  const semanasAtingidas = new Set(
    injustificadas.map((f) => semanaIso(new Date(`${f.data}T12:00:00`))),
  );
  const dsrPerdidos = temDsr ? semanasAtingidas.size : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        Dias de falta
        <Ajuda
          titulo="Por que por calendário"
          texto={
            "O descanso semanal remunerado é UM por semana. Três faltas na mesma " +
            "semana descontam três dias e UM DSR; três faltas em semanas diferentes " +
            "descontam três dias e TRÊS DSR. Só a data diz em qual caso estamos — " +
            "por isso a falta é marcada no calendário e não como quantidade. " +
            "Cada linha da grade é uma semana, terminando no domingo."
          }
        />
        <span className="ml-auto font-normal">clique: 1× injustificada · 2× justificada · 3× limpa</span>
      </div>

      <div className="rounded-lg border bg-card p-2">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {DIAS_CABECALHO.map((d) => (
            <div key={d}
                 className={`text-center text-[0.62rem] font-semibold uppercase ${
                   d === "dom" ? "text-sky-600" : "text-muted-foreground"}`}>
              {d}
            </div>
          ))}
        </div>

        <div className="space-y-1">
          {semanas.map((linha, i) => {
            const chaveSemana = semanaIso(linha[0]);
            const perdeuDsr = temDsr && semanasAtingidas.has(chaveSemana);
            return (
              <div key={i}
                   className={`grid grid-cols-7 gap-1 rounded ${
                     perdeuDsr ? "bg-rose-50 ring-1 ring-rose-200" : ""}`}>
                {linha.map((d) => {
                  const doMes = d.getMonth() === mes - 1;
                  const f = porData.get(iso(d));
                  const domingo = d.getDay() === 0;
                  let cls = "text-foreground hover:bg-muted";
                  if (!doMes) cls = "text-muted-foreground/30";
                  else if (f && !f.justificada) cls = "bg-rose-500 text-white hover:bg-rose-600";
                  else if (f) cls = "bg-amber-400 text-amber-950 hover:bg-amber-500";
                  else if (domingo) cls = "text-sky-600 hover:bg-muted";
                  return (
                    <button
                      key={iso(d)}
                      type="button"
                      disabled={!doMes || !editar}
                      onClick={() => alternar(d)}
                      title={
                        !doMes ? ""
                          : f
                            ? `${d.toLocaleDateString("pt-BR")} — falta ${f.justificada ? "justificada (não desconta)" : "injustificada"}`
                            : `${d.toLocaleDateString("pt-BR")}${domingo ? " — domingo (DSR)" : ""}`
                      }
                      className={`h-7 rounded text-xs font-medium transition-colors disabled:cursor-default ${cls}`}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem]">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-rose-500" /> injustificada (desconta dia + DSR)
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-amber-400" /> justificada (não desconta)
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded bg-rose-50 ring-1 ring-rose-200" /> semana que perdeu o DSR
        </span>
      </div>

      {valor.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <div className="font-medium">O que isso desconta</div>
          <div className="mt-0.5 space-y-0.5">
            <div>
              {injustificadas.length} falta(s) injustificada(s) × {fmtBRL(diaria)} ={" "}
              <b>{fmtBRL(injustificadas.length * diaria)}</b>
            </div>
            {justificadas > 0 && (
              <div>{justificadas} falta(s) justificada(s) — <b>sem desconto</b></div>
            )}
            {temDsr ? (
              dsrPerdidos > 0 && (
                <div>
                  {dsrPerdidos} DSR ({dsrPerdidos} semana
                  {dsrPerdidos > 1 ? "s" : ""} com falta injustificada, 1 por semana) ×{" "}
                  {fmtBRL(diaria)} = <b>{fmtBRL(dsrPerdidos * diaria)}</b>
                </div>
              )
            ) : (
              <div>Estagiário não perde DSR — só o dia é descontado.</div>
            )}
            <div className="border-t border-amber-300 pt-0.5">
              Total do salário: <b>{fmtBRL((injustificadas.length + dsrPerdidos) * diaria)}</b>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
