// Modo noturno do painel: classe .dark no <html> (tailwind darkMode: class),
// persistido em localStorage. `aplicarTemaSalvo()` roda no boot (main.tsx)
// ANTES do render pra não piscar tema errado.
import { useState } from "react";
import { Moon, Sun } from "lucide-react";

const KEY = "pf_theme";

export function aplicarTemaSalvo() {
  if (localStorage.getItem(KEY) === "dark") {
    document.documentElement.classList.add("dark");
  }
}

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  const toggle = () => {
    const novo = !dark;
    setDark(novo);
    document.documentElement.classList.toggle("dark", novo);
    localStorage.setItem(KEY, novo ? "dark" : "light");
  };

  return (
    <button
      onClick={toggle}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
      title={dark ? "Voltar ao modo claro" : "Ativar modo noturno"}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {dark ? "Modo claro" : "Modo noturno"}
    </button>
  );
}
