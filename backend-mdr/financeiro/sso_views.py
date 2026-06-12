"""Login via Microsoft Entra ID (SSO) — backend do Painel Financeiro.

GET /api/sso/ valida a sessão do oauth2-proxy SERVER-SIDE (chama
settings.SSO_VALIDATE_URL = /oauth2/auth repassando o cookie .dunatecnologia.com
que o navegador manda same-origin) e devolve um DRF Token + user, no mesmo
formato do /api/login/. O front (React) chama isso no boot quando não há token.

CONSERVADOR (painel sensível): conta nova nasce PENDENTE (is_active=False) —
acesso só após o admin liberar (Django admin). Login por senha continua.
"""
import base64
import json
import logging
import urllib.error
import urllib.request

from django.conf import settings
from django.contrib.auth.models import User
from django.http import Http404, JsonResponse
from rest_framework.authtoken.models import Token

logger = logging.getLogger(__name__)


def _name_from_id_token(authorization):
    raw = (authorization or "").strip()
    for prefix in ("Bearer ", "bearer "):
        if raw.startswith(prefix):
            raw = raw[len(prefix):].strip()
            break
    parts = raw.split(".")
    if len(parts) != 3:
        return None
    try:
        payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload_b64))
        return (claims.get("name") or "").strip() or None
    except Exception:
        return None


def _validate_via_oauth2_proxy(cookie):
    url = getattr(settings, "SSO_VALIDATE_URL", "")
    if not url or not cookie:
        return None, ""
    try:
        req = urllib.request.Request(url, headers={"Cookie": cookie}, method="GET")
        with urllib.request.urlopen(req, timeout=6) as resp:
            email = (resp.headers.get(settings.SSO_EMAIL_HEADER) or "").strip().lower()
            id_token = resp.headers.get("Authorization") or ""
            return (email or None), id_token
    except urllib.error.HTTPError:
        # 401/403 → sem sessão SSO válida.
        return None, ""
    except Exception:
        logger.warning("Falha ao validar sessao SSO no oauth2-proxy", exc_info=True)
        return None, ""


def sso_session(request):
    if not getattr(settings, "SSO_ENABLED", False):
        raise Http404("SSO desativado")

    email, id_token = _validate_via_oauth2_proxy(request.META.get("HTTP_COOKIE", ""))
    if not email:
        return JsonResponse({"detail": "Sessao Microsoft nao encontrada."}, status=401)

    user = User.objects.filter(email__iexact=email).first()
    if user is None:
        nome = _name_from_id_token(id_token) or email.split("@")[0]
        partes = nome.split(" ", 1)
        user = User(
            username=email[:150],
            email=email,
            first_name=partes[0][:30],
            last_name=(partes[1] if len(partes) > 1 else "")[:150],
            is_active=False,  # PENDENTE — acesso só após liberação do admin
        )
        user.set_unusable_password()
        user.save()

    if not user.is_active:
        return JsonResponse(
            {"detail": "Conta criada. Aguardando liberacao do administrador."},
            status=403,
        )

    token, _ = Token.objects.get_or_create(user=user)
    return JsonResponse({
        "token": token.key,
        "user": {"id": user.id, "email": user.email, "username": user.username},
    })
