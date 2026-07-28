// Permissões efetivas do usuário logado (RBAC por cargo).
// Busca /api/me/permissions/ UMA vez por sessão (cache de módulo) — o menu, as
// views e o guard usam isso. Admin (is_staff) enxerga tudo (backend garante).
import { useEffect, useState } from "react";
import { API_URL, authHeaders } from "@/hooks/useAuth";

export interface MePermissions {
  is_staff: boolean;
  cargo: { id: string; nome: string } | null;
  modulos: Record<string, boolean>;
}

const VAZIO: MePermissions = { is_staff: false, cargo: null, modulos: {} };

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
        if (vivo) setPerms(VAZIO); // sem sessão/erro → nenhum módulo
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
    /** pode ver o módulo? (admin sempre pode) */
    pode: (modulo: string) => !!perms?.is_staff || !!modulos[modulo],
  };
}
