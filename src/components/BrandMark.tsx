// ─────────────────────────────────────────────────────────────────────────
// MARCA DO PRODUTO — Painel Financeiro
//
// A onda dupla é o símbolo da DunaTech; é o que amarra Flow, Academy e Painel
// como uma família. A diferença do Painel é o que ele faz: medir e projetar
// dinheiro. Então a onda de cima SOBE e termina numa ponta de seta — a mesma
// gestualidade da marca, agora lendo como curva de crescimento.
//
// Três formatos:
//   <PainelMark />     ícone dentro do selo com gradiente (favicon, avatar)
//   <PainelLogo />     selo + wordmark ("Painel Financeiro" / MDR ADVOCACIA)
//   <PainelWave />     só o traço, herda currentColor (marca d'água, PDF, print)
// ─────────────────────────────────────────────────────────────────────────

/** Só o desenho — herda a cor do contexto. */
export function PainelWave({ className, recortado = false }: {
  className?: string;
  /** recorta o viewBox na caixa do traço — usado dentro do selo, pra arte
      encostar nas bordas em vez de nadar no meio de um quadrado vazio */
  recortado?: boolean;
}) {
  return (
    <svg
      viewBox={recortado ? "4.5 14.2 34 20.5" : "0 0 48 48"}
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* onda de baixo: a assinatura DunaTech */}
      <path
        d="M6.5 31.5C13 25 18 25 23 29c4 3.1 8 2.5 12-1.6"
        stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" opacity="0.55"
      />
      {/* onda de cima: sobe e vira curva de crescimento */}
      <path
        d="M6 23.5C12 17 17 17 23 21.5c4.5 3.2 8.6 1.6 13.5-5"
        stroke="currentColor" strokeWidth="3.4" strokeLinecap="round"
      />
      {/* ponta de seta no fim da subida */}
      <path
        d="M30.5 16.5h6v6"
        stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/** Ícone no selo com o gradiente da marca (navy → azul → ciano). */
export function PainelMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-[26%] ${className}`}
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, #0A1940 0%, #1E7BFF 58%, #35C6FF 100%)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 6px 18px -8px rgba(30,123,255,0.85)",
      }}
    >
      <PainelWave recortado className="w-[76%] text-white" />
    </span>
  );
}

/**
 * Lockup completo. `tom="onNavy"` para a sidebar (fundo escuro) e
 * `tom="auto"` para fundo claro/escuro do conteúdo.
 */
export function PainelLogo({
  size = 36,
  tom = "auto",
  compacto = false,
}: {
  size?: number;
  tom?: "auto" | "onNavy";
  compacto?: boolean;
}) {
  return (
    <span className="flex items-center gap-2.5 overflow-hidden">
      <PainelMark size={size} />
      {!compacto && (
        <span className="min-w-0 leading-none">
          <span
            className={`block font-heading text-[1.12rem] font-bold leading-none tracking-[-0.015em] ${
              tom === "onNavy" ? "text-white" : "text-foreground"
            }`}
          >
            Painel<span className={tom === "onNavy" ? "font-normal text-[#8FC0FF]" : "font-normal text-primary"}>
              {" "}Financeiro
            </span>
          </span>
          <span
            className={`mt-1.5 block text-[0.63rem] font-semibold uppercase tracking-[0.18em] ${
              tom === "onNavy" ? "text-white/45" : "text-muted-foreground/70"
            }`}
          >
            MDR Advocacia
          </span>
        </span>
      )}
    </span>
  );
}
