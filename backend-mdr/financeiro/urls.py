from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SedeViewSet, SetorViewSet, VpdConfigViewSet, BaseReferenciaViewSet,
    CargoViewSet, CustomAuthToken, UserAdminViewSet, me_permissions,
)
from .dp_views import (
    DpCargoViewSet, DpCentroCustoViewSet, DpColaboradorViewSet,
    dp_audit_list, dp_importar,
)
from . import sso_views

router = DefaultRouter()
router.register(r'sedes', SedeViewSet)
router.register(r'setores', SetorViewSet)
router.register(r'vpd_configs', VpdConfigViewSet)
router.register(r'base_referencia', BaseReferenciaViewSet)
router.register(r'cargos', CargoViewSet)  # RBAC: cargos + permissões por módulo
router.register(r'users', UserAdminViewSet, basename='users')  # gestão de acesso (admin)
# Módulo Controle de Pessoal (DP)
router.register(r'dp/colaboradores', DpColaboradorViewSet, basename='dp-colaboradores')
router.register(r'dp/cargos', DpCargoViewSet, basename='dp-cargos')
router.register(r'dp/centros-custo', DpCentroCustoViewSet, basename='dp-ccs')

urlpatterns = [
    path('', include(router.urls)),
    path('login/', CustomAuthToken.as_view()), # <-- Rota de Login Nova
    path('sso/', sso_views.sso_session),  # login via Microsoft Entra ID
    path('me/permissions/', me_permissions),  # permissões efetivas do logado
    path('dp/importar/', dp_importar),    # importador da planilha do DP
    path('dp/auditoria/', dp_audit_list), # trilha de auditoria do DP
]