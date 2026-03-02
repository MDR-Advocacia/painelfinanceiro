from rest_framework import viewsets
from .models import Sede, Setor, VpdConfig, BaseReferencia
from .serializers import SedeSerializer, SetorSerializer, VpdConfigSerializer, BaseReferenciaSerializer

class SedeViewSet(viewsets.ModelViewSet):
    queryset = Sede.objects.all()
    serializer_class = SedeSerializer

class SetorViewSet(viewsets.ModelViewSet):
    queryset = Setor.objects.all()
    serializer_class = SetorSerializer

class VpdConfigViewSet(viewsets.ModelViewSet):
    queryset = VpdConfig.objects.all()
    serializer_class = VpdConfigSerializer

class BaseReferenciaViewSet(viewsets.ModelViewSet):
    queryset = BaseReferencia.objects.all()
    serializer_class = BaseReferenciaSerializer