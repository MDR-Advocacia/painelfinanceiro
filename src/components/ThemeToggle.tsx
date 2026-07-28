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
      className="nav-link text-xs"
      title={dark ? "Voltar ao modo claro" : "Ativar modo noturno"}
    >
      <span className="nav-ico">
        {dark ? <Sun className="h-full w-full" strokeWidth={1.8} /> : <Moon className="h-full w-full" strokeWidth={1.8} />}
      </span>
      <span className="flex-1 text-left">{dark ? "Modo claro" : "Modo noturno"}</span>
    </button>
  );
}
