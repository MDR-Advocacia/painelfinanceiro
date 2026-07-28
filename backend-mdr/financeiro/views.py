from rest_framework import viewsets
from .models import (
    MODULO_KEYS, MODULOS, NIVEL_EDITAR, NIVEL_NADA, NIVEL_VER, normalizar_nivel,
    Cargo, PerfilUsuario, Sede, Setor, VpdConfig, BaseReferencia,
)
from .serializers import CargoSerializer, SedeSerializer, SetorSerializer, VpdConfigSerializer, BaseReferenciaSerializer
from .sso_views import LEGACY_DATA_USER_ID
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.authtoken.models import Token
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework.decorators import action, api_view, permission_classes
from django.contrib.auth.models import User


def _modulos_do_usuario(user) -> dict:
    """Módulos efetivos do usuário (via cargo). Staff não passa por aqui — bypassa."""
    perfil = getattr(user, 'perfil', None)
    if perfil and perfil.cargo:
        return perfil.cargo.modulos_efetivos()
    return {}


def modulo_permission(read_any: list, write: str):
    """Fábrica de permission DRF do RBAC por cargo (enforcement no BACKEND).

    Níveis (RBAC v2): "ver" libera leitura; "editar" libera leitura+escrita
    (True legado = editar). Regras:
    - Leitura (GET/HEAD/OPTIONS): nível >= ver em QUALQUER módulo de `read_any`
      — Dashboard/Projeções/Rentabilidade consomem /setores//sedes//vpd_configs
      pra calcular agregados.
    - Escrita (POST/PATCH/DELETE): exige nível EDITAR no módulo `write`.
    - Admin (is_staff) bypassa. Sem cargo = nega tudo (default-deny).
    """
    class _ModuloPermission(BasePermission):
        message = "Seu cargo não tem acesso a este módulo."

        def has_permission(self, request, view):
            u = request.user
            if not (u and u.is_authenticated):
                return False
            if u.is_staff:
                return True
            mods = _modulos_do_usuario(u)
            if request.method in SAFE_METHODS:
                return any(normalizar_nivel(mods.get(k)) != NIVEL_NADA for k in read_any)
            return normalizar_nivel(mods.get(write)) == NIVEL_EDITAR

    return _ModuloPermission

# Módulos que dependem dos dados agregados (dashboard e cia. leem tudo pra calcular)
_LEITORES_AGREGADOS = ["dashboard", "projecoes", "ranking", "config-estrategica", "sedes", "setores"]


class SedeViewSet(viewsets.ModelViewSet):
    queryset = Sede.objects.all()
    serializer_class = SedeSerializer
    permission_classes = [modulo_permission(read_any=_LEITORES_AGREGADOS, write="sedes")]

class SetorViewSet(viewsets.ModelViewSet):
    queryset = Setor.objects.all()
    serializer_class = SetorSerializer
    permission_classes = [modulo_permission(read_any=_LEITORES_AGREGADOS, write="setores")]

class VpdConfigViewSet(viewsets.ModelViewSet):
    queryset = VpdConfig.objects.all()
    serializer_class = VpdConfigSerializer
    permission_classes = [modulo_permission(read_any=_LEITORES_AGREGADOS, write="config-estrategica")]

class BaseReferenciaViewSet(viewsets.ModelViewSet):
    # Honorários BB é autocontido: leitura E escrita exigem o módulo.
    queryset = BaseReferencia.objects.all()
    serializer_class = BaseReferenciaSerializer
    permission_classes = [modulo_permission(read_any=["honorarios"], write="honorarios")]

    @action(detail=False, methods=['post'])
    def bulk_upsert(self, request):
        dados = request.data
        if not isinstance(dados, list):
            return Response({"erro": "Os dados devem ser uma lista."}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Remove duplicidades dentro da própria planilha que o usuário enviou
        dados_unicos = {item.get('npj_limpo'): item for item in dados if item.get('npj_limpo')}
        objetos = []

        for npj_limpo, item in dados_unicos.items():
            objetos.append(BaseReferencia(
                npj_original=item.get('npj_original'),
                npj_limpo=npj_limpo,
                polo=item.get('polo', '').upper()
            ))

        if objetos:
            # 2. O Comando Mágico: Insere os novos e ATUALIZA o polo dos que já existem!
            BaseReferencia.objects.bulk_create(
                objetos,
                batch_size=999,
                update_conflicts=True,
                unique_fields=['npj_limpo'], # A chave de busca
                update_fields=['polo', 'npj_original'] # O que deve ser atualizado
            )

        return Response({"sucesso": f"{len(objetos)} processos processados e atualizados!"}, status=status.HTTP_201_CREATED)

class CustomAuthToken(ObtainAuthToken):
    def post(self, request, *args, **kwargs):
        # O AuthTokenSerializer usa authenticate(): usuário inativo (pendente/
        # revogado) NÃO autentica — Django bloqueia. Login por senha já respeita
        # o portão de acesso sem código extra.
        serializer = self.serializer_class(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, created = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': {
                # UUID legado do Supabase — mantém todos os dados vinculados.
                'id': LEGACY_DATA_USER_ID,
                'email': user.email or user.username,
                'is_staff': user.is_staff,
            }
        })


class CargoViewSet(viewsets.ModelViewSet):
    """CRUD de cargos + a tabela de permissões por módulo.

    Leitura: qualquer autenticado (a UI precisa saber nomes). Escrita: só admin.
    GET /api/cargos/modulos/ devolve a tabela canônica de módulos (key+label)
    pra montar o grid do menu do ADM sem hardcode no frontend.
    """
    queryset = Cargo.objects.all()
    serializer_class = CargoSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'modulos'):
            return [IsAuthenticated()]
        return [IsAdminUser()]

    @action(detail=False, methods=['get'])
    def modulos(self, request):
        return Response([{"key": k, "label": l} for k, l in MODULOS])


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me_permissions(request):
    """Permissões efetivas do usuário logado — o frontend monta o menu com isso.

    Admin (is_staff) enxerga tudo. Usuário comum enxerga o que o CARGO dele
    libera; sem cargo = nenhum módulo (tela de "sem acesso" no front).
    """
    u = request.user
    perfil = PerfilUsuario.objects.filter(user=u).select_related('cargo').first()
    cargo = perfil.cargo if perfil else None
    if u.is_staff:
        modulos = {k: NIVEL_EDITAR for k in MODULO_KEYS}
    elif cargo:
        modulos = cargo.modulos_efetivos()
    else:
        modulos = {k: NIVEL_NADA for k in MODULO_KEYS}
    return Response({
        'is_staff': u.is_staff,
        'cargo': {'id': str(cargo.id), 'nome': cargo.nome} if cargo else None,
        'modulos': modulos,  # {modulo: "nada"|"ver"|"editar"}
    })


def _user_row(u):
    nome = f"{u.first_name} {u.last_name}".strip() or u.username
    perfil = getattr(u, 'perfil', None)
    cargo = perfil.cargo if perfil else None
    return {
        'id': u.id,
        'email': u.email or u.username,
        'username': u.username,
        'nome': nome,
        'is_active': u.is_active,
        'is_staff': u.is_staff,
        'cargo_id': str(cargo.id) if cargo else None,
        'cargo_nome': cargo.nome if cargo else None,
        'last_login': u.last_login.isoformat() if u.last_login else None,
        'date_joined': u.date_joined.isoformat() if u.date_joined else None,
    }


class UserAdminViewSet(viewsets.ViewSet):
    """Gestão de acesso ao painel — SOMENTE admin (is_staff).

    GET  /api/users/        lista todos os usuários (status + admin).
    PATCH /api/users/<pk>/  libera/revoga acesso (is_active) ou admin (is_staff).
    Trava: o admin não pode revogar/rebaixar a própria conta (evita lockout).
    """
    permission_classes = [IsAdminUser]

    def list(self, request):
        users = User.objects.all().order_by('-is_staff', '-is_active', 'email', 'username')
        return Response([_user_row(u) for u in users])

    def partial_update(self, request, pk=None):
        user = User.objects.filter(pk=pk).first()
        if user is None:
            return Response({'detail': 'Usuário não encontrado.'}, status=status.HTTP_404_NOT_FOUND)

        is_active = request.data.get('is_active', None)
        is_staff = request.data.get('is_staff', None)

        if user.pk == request.user.pk and (is_active is False or is_staff is False):
            return Response(
                {'detail': 'Você não pode revogar o próprio acesso.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if is_active is not None:
            user.is_active = bool(is_active)
        if is_staff is not None:
            user.is_staff = bool(is_staff)
        user.save()

        # Atribuição de cargo (RBAC): PATCH {"cargo_id": "<uuid>" | null}
        if 'cargo_id' in request.data:
            cargo_id = request.data.get('cargo_id')
            cargo = None
            if cargo_id:
                cargo = Cargo.objects.filter(pk=cargo_id).first()
                if cargo is None:
                    return Response({'detail': 'Cargo não encontrado.'},
                                    status=status.HTTP_400_BAD_REQUEST)
            perfil, _ = PerfilUsuario.objects.get_or_create(user=user)
            perfil.cargo = cargo
            perfil.save()

        user.refresh_from_db()
        return Response(_user_row(user))