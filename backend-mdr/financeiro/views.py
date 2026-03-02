from rest_framework import viewsets
from .models import Sede, Setor, VpdConfig, BaseReferencia
from .serializers import SedeSerializer, SetorSerializer, VpdConfigSerializer, BaseReferenciaSerializer
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.authtoken.models import Token
from rest_framework.response import Response

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

class CustomAuthToken(ObtainAuthToken):
    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, created = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': {
                # Retornamos o UUID antigo para manter os seus Setores vinculados!
                'id': '5d8feb1f-24f5-4341-a05b-9f7b80712096',
                'email': user.email or user.username
            }
        })