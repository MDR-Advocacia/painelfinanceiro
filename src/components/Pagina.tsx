// Primitivos de página do Painel Financeiro.
//
// Existem para que TODA tela tenha o mesmo esqueleto: um cabeçalho que gruda
// no topo com o contexto (o quê, de quando, filtrado como) e os controles à
// direita; blocos com rótulo em eyebrow acima do título; e indicadores que se
// leem pela cor antes de se ler pela palavra.
//
// Antes disso, cada tela inventava o próprio cabeçalho — e o painel inteiro
// parecia um amontoado de páginas de projetos diferentes.
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

/** Cabeçalho fixo da página: contexto à esquerda, controles à direita. */
export function PageHeader({
  eyebrow, titulo, descricao, icone, acoes,
}: {
  eyebrow?: string;
  titulo: ReactNode;
  descricao?: ReactNode;
  icone?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="topbar sticky top-0 z-30 -mx-6 -mt-6 flex flex-wrap items-end justify-between gap-4 px-6 py-4 md:-mx-8 md:-mt-8 md:px-8">
      <div className="flex min-w-0 items-start gap-3">
        {icone && (
          <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--dunatech-blue))]/10 text-[hsl(var(--dunatech-blue))]">
            {icone}
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 className="mt-1 truncate font-heading text-2xl font-bold text-foreground">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-sm text-muted-foreground">{descricao}</p>}
        </div>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

/** Rótulo + título de um bloco dentro da página. */
export function SectionTitle({ eyebrow, titulo, acoes, className = "" }: {
  eyebrow?: string; titulo: ReactNode; acoes?: ReactNode; className?: string;
}) {
  return (
    <div className={`mb-4 flex flex-wrap items-end justify-between gap-2 ${className}`}>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h4 className="mt-1 font-heading text-base font-semibold">{titulo}</h4>
      </div>
      {acoes && <div className="flex items-center gap-2">{acoes}</div>}
    </div>
  );
}

export type TomKpi = "neutro" | "positivo" | "negativo" | "atencao";

const TONS: Record<TomKpi, { fg: string; bg: string }> = {
  neutro: { fg: "text-[hsl(var(--dunatech-blue))]", bg: "bg-[hsl(var(--dunatech-blue))]/10" },
  positivo: { fg: "text-success", bg: "bg-success/10" },
  negativo: { fg: "text-destructive", bg: "bg-destructive/10" },
  atencao: { fg: "text-warning", bg: "bg-warning/10" },
};

/**
 * Indicador do topo. O rótulo vira eyebrow (sai do caminho da leitura) e o
 * NÚMERO manda na hierarquia; o ícone assume o tom do indicador, então dá pra
 * varrer a linha inteira pela cor sem ler uma palavra.
 */
export function Kpi({
  icone: Icone, rotulo, valor, sub, tom = "neutro", corValor, onClick, titulo,
}: {
  icone?: React.ElementType;
  rotulo: string;
  valor: ReactNode;
  sub?: ReactNode;
  tom?: TomKpi;
  /** força a cor do número (quando o sinal decide, não o tipo do indicador) */
  corValor?: string;
  onClick?: () => void;
  titulo?: string;
}) {
  const t = TONS[tom];
  return (
    <Card
      className={`glass-card border-0 ${onClick ? "card-hover cursor-pointer" : "card-hover"}`}
      onClick={onClick}
      title={titulo}
    >
      <CardContent className="px-4 pb-4 pt-4">
        <div className="mb-3 flex items-center gap-2">
          {Icone && (
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${t.bg}`}>
              <Icone className={`h-3.5 w-3.5 ${t.fg}`} strokeWidth={2} />
            </span>
          )}
          <span className="eyebrow truncate text-[0.65rem]">{rotulo}</span>
        </div>
        <p className={`font-mono-numbers text-[1.35rem] font-bold leading-none tracking-tight ${corValor || "text-foreground"}`}>
          {valor}
        </p>
        {sub && (
          <p className="mt-2 inline-flex rounded-full bg-muted/70 px-1.5 py-0.5 font-mono-numbers text-[0.68rem] text-muted-foreground">
            {sub}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Estado vazio padrão — mesma linguagem em todas as telas. */
export function Vazio({ icone: Icone, titulo, texto, acao }: {
  icone: React.ElementType; titulo: string; texto?: string; acao?: ReactNode;
}) {
  return (
    <Card className="glass-card border-0">
      <CardContent className="py-16 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60">
          <Icone className="h-7 w-7 text-muted-foreground/50" />
        </span>
        <h3 className="font-heading text-lg font-semibold text-foreground/80">{titulo}</h3>
        {texto && <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{texto}</p>}
        {acao && <div className="mt-5 flex justify-center">{acao}</div>}
      </CardContent>
    </Card>
  );
}

/** Alternador de visão (Mensal / Trimestral / …) no padrão da casa. */
export function SegButtons<T extends string>({ valor, opcoes, onChange }: {
  valor: T; opcoes: { v: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border/70 bg-muted/60 p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
            valor === o.v
              ? "bg-card text-foreground shadow-sm ring-1 ring-border/60"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
