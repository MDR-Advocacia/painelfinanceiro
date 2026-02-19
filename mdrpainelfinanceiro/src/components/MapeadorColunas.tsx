import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { AlertCircle, Check } from "lucide-react";

interface MapeadorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colunas: string[];
  previewData: any[];
  onConfirm: (mapeamento: { npj: string; polo: string }) => void;
}

export function MapeadorColunas({ open, onOpenChange, colunas, previewData, onConfirm }: MapeadorProps) {
  const [colunaNPJ, setColunaNPJ] = useState<string>("");
  const [colunaPolo, setColunaPolo] = useState<string>("");

  const handleConfirmar = () => {
    if (colunaNPJ && colunaPolo) {
      onConfirm({ npj: colunaNPJ, polo: colunaPolo });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-0 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl font-bold flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-primary" />
            Mapeamento de Colunas
          </DialogTitle>
          <DialogDescription className="text-sm">
            As bases de referência podem variar. Identifique abaixo quais colunas contêm os dados mestres.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6 py-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
              Coluna do NPJ
            </label>
            <Select value={colunaNPJ} onValueChange={setColunaNPJ}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a coluna..." />
              </SelectTrigger>
              <SelectContent>
                {colunas.map((col) => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
              Coluna do Polo (Ativo/Passivo)
            </label>
            <Select value={colunaPolo} onValueChange={setColunaPolo}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a coluna..." />
              </SelectTrigger>
              <SelectContent>
                {colunas.map((col) => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Prévia dos Dados para facilitar a escolha */}
        <div className="border rounded-lg overflow-hidden bg-secondary/30">
          <div className="px-4 py-2 bg-secondary border-b text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex justify-between items-center">
            Prévia dos arquivos carregados
            <span className="text-primary normal-case font-medium">{previewData.length} linhas detectadas</span>
          </div>
          <div className="max-h-[200px] overflow-auto">
            <Table>
              <TableHeader className="bg-muted/50 sticky top-0">
                <TableRow>
                  {colunas.slice(0, 4).map((col) => (
                    <TableHead key={col} className="text-[10px] py-2">{col}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData.slice(0, 3).map((row, i) => (
                  <TableRow key={i}>
                    {colunas.slice(0, 4).map((col) => (
                      <TableCell key={col} className="text-[10px] py-2 truncate max-w-[150px]">
                        {String(row[col] || '')}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirmar} 
            disabled={!colunaNPJ || !colunaPolo}
            className="gap-2"
          >
            <Check className="w-4 h-4" /> Confirmar e Salvar Base
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}