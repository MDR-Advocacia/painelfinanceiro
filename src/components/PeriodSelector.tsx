import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { MONTH_NAMES, getPeriodoAnaliseDefault } from "@/types/sector";

interface PeriodSelectorProps {
  value: string;
  onChange: (v: string) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const [year, month] = value.split('-').map(Number);

  const navigate = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  // Meses acima do último fechado ainda estão em curso — o número exibido
  // ali é parcial, então avisamos em vez de deixar o operador concluir errado.
  const emCurso = value > getPeriodoAnaliseDefault();

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`font-heading min-w-[150px] text-center text-sm font-medium ${emCurso ? "text-warning" : ""}`}>
              {MONTH_NAMES[month - 1]} {year}{emCurso && " *"}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {emCurso
              ? "Mês ainda em curso — os valores estão parciais."
              : "Mês fechado."}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
