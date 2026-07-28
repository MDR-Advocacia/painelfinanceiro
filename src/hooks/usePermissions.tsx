// Permissões efetivas do usuário logado (RBAC v2 por cargo, com NÍVEIS).
// O backend devolve modulos: {key: "nada"|"ver"|"editar"} — "ver" é só
// visualização; "editar" permite alterar. Busca /api/me/permissions/ UMA vez
// por sessão (cache de módulo). Admin (is_staff) enxerga e edita tudo.
import { useEffect, useState } from "react";
import { API_URL, authHeaders } from "@/hooks/useAuth";

export type NivelPermissao = "nada" | "ver" | "editar";

export interface MePermissions {
  is_staff: boolean;
  cargo: { id: string; nome: string } | null;
  modulos: Record<string, NivelPermissao | boolean>; // boolean = legado (true→editar)
}

const VAZIO: MePermissions = { is_staff: false, cargo: null, modulos: {} };

function nivel(v: NivelPermissao | boolean | undefined): NivelPermissao {
  if (v === true || v === "editar") return "editar";
  if (v === "ver") return "ver";
  return "nada";
}

let cache: MePermissions | null = null;
let inflight: Promise<MePermissions> | null = null;

async function fetchPermissions(): Promise<MePermissions> {
  const res = await fetch(`${API_URL}/me/permissions/`, { headers: authHeaders() });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export function invalidatePermissionsCache() {
  cache = null;
  inflight = null;
}

export function usePermissions() {
  const [perms, setPerms] = useState<MePermissions | null>(cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    if (!inflight) inflight = fetchPermissions();
    let vivo = true;
    inflight
      .then((p) => {
        cache = p;
        if (vivo) setPerms(p);
      })
      .catch(() => {
        if (vivo) setPerms(VAZIO);
      })
      .finally(() => {
        inflight = null;
        if (vivo) setLoading(false);
      });
    return () => { vivo = false; };
  }, []);

  const modulos = perms?.modulos ?? {};
  return {
    loading,
    perms: perms ?? VAZIO,
    /** enxerga o módulo? (ver OU editar; admin sempre) */
    pode: (modulo: string) => !!perms?.is_staff || nivel(modulos[modulo]) !== "nada",
    /** pode ALTERAR dados do módulo? (editar; admin sempre) */
    podeEditar: (modulo: string) => !!perms?.is_staff || nivel(modulos[modulo]) === "editar",
  };
}
