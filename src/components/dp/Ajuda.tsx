// Ícone (?) com explicação — usado em todas as abas/colunas do módulo.
// Funciona no clique (mobile) e no hover (desktop).
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function Ajuda({ texto, titulo }: { texto: string; titulo?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex shrink-0 items-center text-muted-foreground/50 transition-colors hover:text-[hsl(var(--dunatech-blue))]"
          aria-label={titulo ? `Ajuda: ${titulo}` : "Ajuda"}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs leading-relaxed" align="start" onClick={(e) => e.stopPropagation()}>
        {titulo && <div className="mb-1 font-semibold text-foreground">{titulo}</div>}
        <p className="text-muted-foreground">{texto}</p>
      </PopoverContent>
    </Popover>
  );
}

/** Cabeçalho de seção com título + ajuda. */
export function TituloAjuda({ titulo, ajuda, className }: {
  titulo: string; ajuda: string; className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      {titulo}
      <Ajuda titulo={titulo} texto={ajuda} />
    </span>
  );
}
