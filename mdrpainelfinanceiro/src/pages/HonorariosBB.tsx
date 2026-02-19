import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Play, Database, Download, Loader2, Trash2, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { MapeadorColunas } from "@/components/MapeadorColunas";
import { supabase } from "@/integrations/supabase/client";

// --- REGRAS DE NEGÓCIO (IDÊNTICAS AO PYTHON) ---
const MAPA_CENTRO_CUSTO: Record<string, string[]> = {
  'BB Réu Cadastro': ['PAG HON - CERTIFICACAO', 'PAG HON - REGULARIZAÇÃO DE REPRESENTAÇÃO E ANÁLISE INICIAL DO PROCESSO'],
  'BB Réu Acordos': ['PAG HON - ACORDO PROTOCOLADO', 'PAG HON - ACORDO PROTOCOLADO - EXTRA CAMPANHA', 'PAG HON - ECONOMIA ACORDO'],
  'BB Réu Defesa': ['PAG HON - IMPROCEDÊNCIA TOTAL DA AÇÃO', 'PAG HON - SENTENCA'],
  'BB Réu Encerramento': ['PAG HON - ENCERRAMENTO DO PROCESSO']
};

const normalizar_chave = (valor: any): string => {
  if (!valor || valor === 'NaN' || valor === 'nan') return "";
  let v = String(valor).trim();
  
  if (v.includes('-')) v = v.split('-')[0]; // Corta o final após o hífen
  
  v = v.replace(/\D/g, ''); // Remove barras, pontos, etc
  v = v.replace(/^0+/, ''); // Substitui o int(v) do Python: remove zeros à esquerda mantendo como texto puro
  
  return v;
};

const limpar_moeda = (valor: any): number => {
    if (typeof valor === 'string') {
        let v = valor.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        const num = parseFloat(v);
        return isNaN(num) ? 0.0 : num;
    }
    return typeof valor === 'number' ? valor : 0.0;
};

// Pausa para o navegador não congelar a tela
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export default function HonorariosBB() {
  const [loading, setLoading] = useState(false);
  const [faturasFiles, setFaturasFiles] = useState<File[]>([]);
  const [showMapeador, setShowMapeador] = useState(false);
  const [colunasDisponiveis, setColunasDisponiveis] = useState<string[]>([]);
  const [arquivosReferencia, setArquivosReferencia] = useState<File[]>([]);
  const [stats, setStats] = useState({ total: 0, autor: 0, reu: 0 });

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.from('base_referencia').select('polo');
      if (error) throw error;
      
      const total = data.length;
      let countAutor = 0;
      let countReu = 0;
      
      data.forEach(r => {
          const polo = r.polo || '';
          if (/AUTOR|REQUERENTE|EXEQUENTE|EMBARGANTE|IMPUGNANTE|ATIVO/i.test(polo)) countAutor++;
          else if (/RÉU|REU|REQUERIDO|EXECUTADO|EMBARGADO|IMPUGNADO|PASSIVO/i.test(polo)) countReu++;
      });

      setStats({ total, autor: countAutor, reu: countReu });
    } catch (err) {
      console.error("Erro ao carregar estatísticas:", err);
    }
  };

  useEffect(() => { fetchStats(); }, []);

  const limparBase = async () => {
    if (!confirm("⚠️ ATENÇÃO: Deseja apagar TODOS os processos salvos na base de referência?")) return;
    setLoading(true);
    try {
      const { error } = await supabase.from('base_referencia').delete().neq('npj_limpo', '0');
      if (error) throw error;
      toast.success("Base limpa com sucesso!");
      fetchStats();
    } catch (err) { toast.error("Erro ao limpar base."); }
    finally { setLoading(false); }
  };

  const handleMultiplosArquivosReferencia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setLoading(true);
    try {
      const fileList = Array.from(files);
      setArquivosReferencia(fileList);
      
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target?.result, { type: 'binary', sheetRows: 10 });
          const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
          if (json.length > 0) {
            setColunasDisponiveis(Object.keys(json[0] as object));
            setShowMapeador(true);
          } else {
            toast.error("O primeiro arquivo parece estar vazio.");
          }
        } catch (e) { toast.error("Erro na leitura da prévia."); }
        finally { setLoading(false); }
      };
      reader.readAsBinaryString(fileList[0]);
    } catch (err) { setLoading(false); }
  };

  const salvarNoBanco = async (mapa: { npj: string; polo: string }) => {
    setLoading(true);
    setShowMapeador(false);
    let totalSalvo = 0;

    try {
      for (let i = 0; i < arquivosReferencia.length; i++) {
        const file = arquivosReferencia[i];
        toast.info(`Processando base de referência ${i + 1}...`, { duration: 2000 });
        await delay(100);
        
        const data = await new Promise<any[]>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => {
            try {
              const wb = XLSX.read(evt.target?.result, { type: 'binary' });
              resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" }));
            } catch (e) { reject(e); }
          };
          reader.onerror = reject;
          reader.readAsBinaryString(file);
        });

        const rows = data.map(row => {
          const npjOriginal = String(row[mapa.npj] || '');
          const npjLimpo = normalizar_chave(npjOriginal);
          return {
            npj_original: npjOriginal,
            npj_limpo: npjLimpo,
            polo: String(row[mapa.polo] || '').toUpperCase().trim()
          };
        }).filter(r => r.npj_limpo !== "");

        if (rows.length > 0) {
          const { error } = await supabase.from('base_referencia').upsert(rows, { onConflict: 'npj_limpo' });
          if (error) throw error;
          totalSalvo += rows.length;
        }
      }
      toast.success(`${totalSalvo} processos salvos com sucesso!`);
      fetchStats();
    } catch (err: any) { toast.error(`Erro: ${err.message}`); }
    finally { setLoading(false); setArquivosReferencia([]); }
  };

  const processarFaturas = async () => {
    if (faturasFiles.length === 0) return;
    setLoading(true);

    try {
      // --- PASSO 1 ---
      toast.info("⏳ Passo 1/4: Lendo o arquivo da fatura...", { duration: 3000 });
      await delay(300);

      let todosHonorarios: any[] = [];
      for (const file of faturasFiles) {
        const data = await new Promise<any[]>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => {
            try {
              const wb = XLSX.read(evt.target?.result, { type: 'binary' });
              const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { range: 6, defval: "" });
              resolve(json);
            } catch (e) { reject(e); }
          };
          reader.onerror = reject;
          reader.readAsBinaryString(file);
        });
        todosHonorarios = [...todosHonorarios, ...data];
      }

      if (todosHonorarios.length === 0) {
         throw new Error("A fatura não tem dados! Verifique se a planilha tem o cabeçalho do BB na linha 7.");
      }

      const colunaNpjFatura = Object.keys(todosHonorarios[0] || {}).find(k => k.trim().toUpperCase() === 'NPJ') || 'NPJ';
      const npjsFatura = [...new Set(todosHonorarios.map(item => normalizar_chave(item[colunaNpjFatura])).filter(n => n !== ""))];

      if (npjsFatura.length === 0) {
         throw new Error("A coluna 'NPJ' não foi encontrada. Verifique o arquivo da fatura.");
      }

      // --- PASSO 2 ---
      toast.info(`🔍 Passo 2/4: Cruzando ${npjsFatura.length} NPJs únicos com o banco de dados...`, { duration: 3000 });
      await delay(300);

      let baseRef: any[] = [];
      const TAMANHO_LOTE = 50; // REDUZIDO PARA 50! Evita estourar a API do Supabase.
      
      for (let i = 0; i < npjsFatura.length; i += TAMANHO_LOTE) {
        const lote = npjsFatura.slice(i, i + TAMANHO_LOTE);
        const { data, error } = await supabase.from('base_referencia').select('npj_limpo, polo').in('npj_limpo', lote);
        if (error) throw error;
        if (data) baseRef = [...baseRef, ...data];
      }

      const refMap = new Map(baseRef?.map(r => [r.npj_limpo, r.polo]));
      
      // --- PASSO 3 ---
      toast.info("📊 Passo 3/4: Classificando Centro de Custo e montando Excel...", { duration: 3000 });
      await delay(300);

      const workbook = new ExcelJS.Workbook();
      const sheetAutor = workbook.addWorksheet('Autor');
      const sheetReu = workbook.addWorksheet('Réu');
      const sheetPendentes = workbook.addWorksheet('Pendentes');

      const cols = [
        { header: 'NPJ', key: 'NPJ', width: 25 },
        { header: 'Evento', key: 'Evento', width: 45 },
        { header: 'Valor', key: 'Valor', width: 15 },
        { header: 'Polo do BB', key: 'Polo do BB', width: 30 },
        { header: 'Diagnóstico/CC', key: 'Diagnostico', width: 40 }
      ];

      [sheetAutor, sheetReu, sheetPendentes].forEach(s => s.columns = cols);

      let somaAutor = 0;
      let somaReu = 0;

      todosHonorarios.forEach(item => {
        const npjOriginal = item[colunaNpjFatura];
        const npjLimpo = normalizar_chave(npjOriginal);
        const polo = refMap.get(npjLimpo) || 'NAN';
        
        const valorNum = limpar_moeda(item.Valor);
        
        const isAutor = /AUTOR|REQUERENTE|EXEQUENTE|EMBARGANTE|IMPUGNANTE|ATIVO/i.test(polo);
        const isReu = /RÉU|REU|REQUERIDO|EXECUTADO|EMBARGADO|IMPUGNADO|PASSIVO/i.test(polo);

        let diagnosticoOuCC = '';
        let targetSheet = sheetPendentes;

        if (isAutor) {
            targetSheet = sheetAutor;
            somaAutor += valorNum;
            diagnosticoOuCC = polo;
        } else if (isReu) {
            targetSheet = sheetReu;
            somaReu += valorNum;
            const evento = String(item.Evento || '').toUpperCase().trim();
            diagnosticoOuCC = 'Outros Eventos';
            for (const [cc, lista] of Object.entries(MAPA_CENTRO_CUSTO)) {
                if (lista.some(term => evento === term.toUpperCase().trim())) {
                    diagnosticoOuCC = cc; break;
                }
            }
        } else {
            diagnosticoOuCC = polo === 'NAN' ? 'NPJ NAO ENCONTRADO' : `POLO DESCONHECIDO: ${polo}`;
        }

        targetSheet.addRow({
            NPJ: npjOriginal,
            Evento: item.Evento,
            Valor: valorNum,
            'Polo do BB': polo,
            Diagnostico: diagnosticoOuCC
        });
      });

      [sheetAutor, sheetReu, sheetPendentes].forEach(sheet => {
        sheet.getRow(1).eachCell(cell => {
          cell.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'002060'} };
          cell.font = { color: { argb: 'FFFFFF' }, bold: true };
          cell.alignment = { horizontal: 'center' };
        });
        sheet.getColumn('Valor').numFmt = '"R$" #,##0.00';
      });

      const sheetResumo = workbook.addWorksheet('Resumo');
      sheetResumo.columns = [
          { header: 'Categoria', key: 'cat', width: 25 },
          { header: 'Valor Total', key: 'val', width: 25 }
      ];
      
      sheetResumo.addRow({ cat: 'Autor', val: somaAutor });
      sheetResumo.addRow({ cat: 'Réu', val: somaReu });
      
      const rowTotal = sheetResumo.addRow({ cat: 'Total Geral', val: somaAutor + somaReu });
      rowTotal.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'92D050'} };
      rowTotal.font = { bold: true };

      sheetResumo.getColumn('val').numFmt = '"R$" #,##0.00';
      sheetResumo.getRow(1).eachCell(cell => {
          cell.fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'002060'} };
          cell.font = { color: { argb: 'FFFFFF' }, bold: true };
      });

      // --- PASSO 4 ---
      toast.info("💾 Passo 4/4: Salvando o relatório na sua máquina...", { duration: 3000 });
      await delay(300);

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `Relatorio_Honorarios_Financeiro.xlsx`);
      toast.success("✅ Relatório gerado com sucesso!");

    } catch (err: any) {
      toast.error(`❌ Erro detectado: ${err.message}`, { duration: 8000 });
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-primary" /> Honorários BB
        </h1>
      </div>

      <Tabs defaultValue="processar">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="processar" className="gap-2"><Play className="w-4 h-4" /> Processar</TabsTrigger>
          <TabsTrigger value="referencia" className="gap-2"><Database className="w-4 h-4" /> Base de Referência</TabsTrigger>
        </TabsList>

        <TabsContent value="processar" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Cruzamento de Faturas</CardTitle>
              <CardDescription>O sistema usará os {stats.total.toLocaleString()} processos salvos.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border-2 border-dashed border-muted rounded-lg p-8 text-center space-y-3 relative hover:border-primary/40 transition-colors">
                <input 
                  type="file" multiple accept=".xlsx, .xls, .csv" className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => setFaturasFiles(Array.from(e.target.files || []))}
                />
                <Upload className="mx-auto w-8 h-8 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Clique ou arraste as faturas aqui</p>
                {faturasFiles.length > 0 && <Badge variant="secondary">{faturasFiles.length} faturas prontas</Badge>}
              </div>
              <Button onClick={processarFaturas} disabled={loading || faturasFiles.length === 0} className="w-full h-12">
                {loading ? <Loader2 className="animate-spin mr-2" /> : <Download className="mr-2 h-4 w-4" />}
                Gerar Relatório Financeiro
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="referencia" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-primary/5 border-primary/20"><CardContent className="pt-4"><p className="text-[10px] font-bold text-muted-foreground uppercase">Processos Totais</p><p className="text-2xl font-bold">{stats.total.toLocaleString()}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-[10px] font-bold text-muted-foreground uppercase">Polo Autor / Ativo</p><p className="text-2xl font-bold">{stats.autor.toLocaleString()}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-[10px] font-bold text-muted-foreground uppercase">Polo Réu / Passivo</p><p className="text-2xl font-bold">{stats.reu.toLocaleString()}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-sm">Importar Base (Ativos/Baixados)</CardTitle>
                <CardDescription>A normalização original do Python está aplicada.</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={fetchStats}><RefreshCw className="h-4 w-4" /></Button>
                <Button variant="destructive" size="icon" onClick={limparBase}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent>
              <Input type="file" multiple accept=".xlsx, .xls, .csv" onChange={handleMultiplosArquivosReferencia} disabled={loading} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <MapeadorColunas 
        open={showMapeador} 
        onOpenChange={setShowMapeador}
        colunas={colunasDisponiveis}
        previewData={[]} 
        onConfirm={salvarNoBanco}
      />
    </div>
  );
}