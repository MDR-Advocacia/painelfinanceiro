from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SedeViewSet, SetorViewSet, VpdConfigViewSet, BaseReferenciaViewSet, CustomAuthToken, UserAdminViewSet
from . import sso_views

router = DefaultRouter()
router.register(r'sedes', SedeViewSet)
router.register(r'setores', SetorViewSet)
router.register(r'vpd_configs', VpdConfigViewSet)
router.register(r'base_referencia', BaseReferenciaViewSet)
router.register(r'users', UserAdminViewSet, basename='users')  # gestão de acesso (admin)

urlpatterns = [
    path('', include(router.urls)),
    path('login/', CustomAuthToken.as_view()), # <-- Rota de Login Nova
    path('sso/', sso_views.sso_session),  # login via Microsoft Entra ID
]