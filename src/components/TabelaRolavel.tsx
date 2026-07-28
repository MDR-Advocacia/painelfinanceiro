// Tabela larga com BARRA DE ROLAGEM FLUTUANTE.
//
// Em tabela que extrapola a largura (a folha tem 13 colunas), a barra nativa
// fica colada no fim do conteúdo: pra rolar de lado é preciso descer a página
// inteira até o rodapé da tabela. Aqui a barra gruda no fim da área visível e
// espelha a rolagem do conteúdo nos dois sentidos.
import { useCallback, useEffect, useRef, useState } from "react";

export function TabelaRolavel({ children, className = "" }: {
  children: React.ReactNode;
  className?: string;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const barraRef = useRef<HTMLDivElement>(null);
  const sincronizando = useRef(false);
  const [largura, setLargura] = useState(0);
  const [precisa, setPrecisa] = useState(false);

  const medir = useCallback(() => {
    const a = areaRef.current;
    if (!a) return;
    setLargura(a.scrollWidth);
    setPrecisa(a.scrollWidth > a.clientWidth + 2);
  }, []);

  useEffect(() => {
    medir();
    const a = areaRef.current;
    if (!a) return;
    const ro = new ResizeObserver(medir);
    ro.observe(a);
    if (a.firstElementChild) ro.observe(a.firstElementChild);
    window.addEventListener("resize", medir);
    return () => { ro.disconnect(); window.removeEventListener("resize", medir); };
  }, [medir, children]);

  // espelha a rolagem sem entrar em laço (o guard evita o ping-pong de eventos)
  const espelhar = (de: HTMLDivElement | null, para: HTMLDivElement | null) => {
    if (!de || !para || sincronizando.current) return;
    sincronizando.current = true;
    para.scrollLeft = de.scrollLeft;
    // setTimeout e não requestAnimationFrame: RAF não roda com a aba em
    // segundo plano e o guard ficaria travado, matando o espelhamento
    setTimeout(() => { sincronizando.current = false; }, 0);
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={areaRef}
        onScroll={() => espelhar(areaRef.current, barraRef.current)}
        // o <Table> do shadcn já vem com o próprio wrapper rolável; anulando o
        // overflow dele, quem rola passa a ser ESTE container — que é o que a
        // barra flutuante espelha
        className="sem-barra-nativa overflow-x-auto [&>div]:overflow-visible"
      >
        {children}
      </div>

      {precisa && (
        <div
          ref={barraRef}
          onScroll={() => espelhar(barraRef.current, areaRef.current)}
          aria-hidden
          className="sticky bottom-0 z-20 mt-1 overflow-x-auto rounded-full border border-border/60 bg-card/85 backdrop-blur"
          style={{ height: 14 }}
        >
          <div style={{ width: largura, height: 1 }} />
        </div>
      )}
    </div>
  );
}
