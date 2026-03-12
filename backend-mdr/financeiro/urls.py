from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SedeViewSet, SetorViewSet, VpdConfigViewSet, BaseReferenciaViewSet, CustomAuthToken

router = DefaultRouter()
router.register(r'sedes', SedeViewSet)
router.register(r'setores', SetorViewSet)
router.register(r'vpd_configs', VpdConfigViewSet)
router.register(r'base_referencia', BaseReferenciaViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('login/', CustomAuthToken.as_view()), # <-- Rota de Login Nova
]