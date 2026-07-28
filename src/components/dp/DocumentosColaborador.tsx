// Documentos do colaborador (contrato em PDF) — arrasta e solta.
// O arquivo vai pro volume de dados do servidor e só é baixado por quem tem
// permissão no módulo; nada fica exposto por URL pública.
import { useCallback, useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Ajuda } from "@/components/dp/Ajuda";
import { type DpColaborador, type DpDocumento, dpApi } from "@/services/dp";

const TIPOS = [
  { valor: "contrato", rotulo: "Contrato de trabalho" },
  { valor: "tce", rotulo: "Termo de Compromisso de Estágio" },
  { valor: "aditivo", rotulo: "Aditivo contratual" },
  { valor: "rescisao", rotulo: "Termo de rescisão" },
  { valor: "outro", rotulo: "Outro documento" },
];

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentosColaborador({ colaborador, editar }: {
  colaborador: DpColaborador; editar: boolean;
}) {
  const [docs, setDocs] = useState<DpDocumento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  // estagiário assina TCE, os demais assinam contrato — já sugere o certo
  const [tipo, setTipo] = useState(colaborador.regime === "estagiario" ? "tce" : "contrato");
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    dpApi.documentos(colaborador.id)
      .then(setDocs)
      .catch(() => undefined)
      .finally(() => setCarregando(false));
  }, [colaborador.id]);
  useEffect(carregar, [carregar]);

  const enviar = async (arquivos: FileList | File[] | null) => {
    if (!arquivos || arquivos.length === 0) return;
    const lista = Array.from(arquivos);
    const naoPdf = lista.filter((f) => !f.name.toLowerCase().endsWith(".pdf"));
    if (naoPdf.length) {
      toast.error(`Só PDF por aqui — ${naoPdf.map((f) => f.name).join(", ")} não entrou.`);
    }
    const pdfs = lista.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) return;
    setEnviando(true);
    try {
      for (const f of pdfs) {
        await dpApi.enviarDocumento(colaborador.id, f, tipo);
      }
      toast.success(pdfs.length === 1 ? "Documento anexado." : `${pdfs.length} documentos anexados.`);
      carregar();
    } catch (e: any) { toast.error(e.message); }
    finally { setEnviando(false); }
  };

  const remover = async (d: DpDocumento) => {
    if (!window.confirm(`Remover "${d.nome_original}" da ficha? A ação fica registrada na auditoria.`)) return;
    try {
      await dpApi.removerDocumento(colaborador.id, d.id);
      toast.success("Documento removido.");
      carregar();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          Documentos
          <Ajuda titulo="Documentos do colaborador"
                 texto="Contrato, termo de estágio, aditivos e afins em PDF. Ficam guardados no servidor do painel e só quem tem acesso ao módulo consegue baixar — o arquivo nunca vira link público. Todo envio e toda remoção ficam na auditoria." />
        </span>
        {editar && (
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="ml-auto h-7 w-[230px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {editar && (
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); enviar(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`mb-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-5 text-center transition-colors ${
            arrastando
              ? "border-[hsl(var(--dunatech-blue))] bg-[hsl(var(--dunatech-blue))]/10"
              : "border-muted-foreground/25 hover:border-[hsl(var(--dunatech-blue))]/50 hover:bg-muted/50"
          }`}
        >
          {enviando ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--dunatech-blue))]" />
              <span className="text-xs text-muted-foreground">Enviando…</span>
            </>
          ) : (
            <>
              <Upload className={`h-5 w-5 ${arrastando ? "text-[hsl(var(--dunatech-blue))]" : "text-muted-foreground/60"}`} />
              <span className="text-xs font-medium">
                {arrastando ? "Solte aqui o PDF" : "Arraste o PDF aqui ou clique para escolher"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Só PDF · até 25 MB · entra como {TIPOS.find((t) => t.valor === tipo)?.rotulo}
              </span>
            </>
          )}
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden
                 onChange={(e) => { enviar(e.target.files); e.target.value = ""; }} />
        </div>
      )}

      {carregando ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> Carregando…
        </p>
      ) : docs.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          Nenhum documento anexado{editar ? "" : " nesta ficha"}.
        </p>
      ) : (
        <ul className="space-y-1">
          {docs.map((d) => (
            <li key={d.id}
                className="flex items-center gap-2 rounded-md border bg-card/70 px-2 py-1.5 text-xs">
              <FileText className="h-4 w-4 shrink-0 text-rose-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.nome_original}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {d.tipo_label} · {tamanhoLegivel(d.tamanho)} · enviado por {d.enviado_por} em {d.quando_br}
                  {d.descricao ? ` · ${d.descricao}` : ""}
                </div>
              </div>
              <button title="Baixar" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => dpApi.baixarDocumento(colaborador.id, d.id, d.nome_original)
                        .catch((e) => toast.error(e.message))}>
                <Download className="h-3.5 w-3.5" />
              </button>
              {editar && (
                <button title="Remover" className="shrink-0 rounded p-1 text-muted-foreground/60 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => remover(d)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
