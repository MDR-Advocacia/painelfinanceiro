import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MONTH_NAMES } from "@/types/sector";

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

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="font-heading text-sm font-medium min-w-[150px] text-center">
        {MONTH_NAMES[month - 1]} {year}
      </span>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
