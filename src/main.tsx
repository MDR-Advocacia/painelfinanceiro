import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { aplicarTemaSalvo } from "./components/ThemeToggle";
import "./index.css";

// Aplica o modo noturno salvo ANTES do primeiro render (sem flash de tema errado)
aplicarTemaSalvo();

createRoot(document.getElementById("root")!).render(<App />);
