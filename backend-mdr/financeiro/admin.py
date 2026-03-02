from django.contrib import admin
from .models import Sede, Setor, VpdConfig, BaseReferencia

@admin.register(Sede)
class SedeAdmin(admin.ModelAdmin):
    list_display = ('nome', 'user_id', 'created_at')
    search_fields = ('nome', 'user_id')

@admin.register(Setor)
class SetorAdmin(admin.ModelAdmin):
    list_display = ('nome', 'tipo', 'sede', 'user_id', 'created_at')
    list_filter = ('tipo', 'sede')
    search_fields = ('nome', 'user_id')

@admin.register(VpdConfig)
class VpdConfigAdmin(admin.ModelAdmin):
    list_display = ('periodo', 'valor', 'user_id', 'created_at')
    search_fields = ('periodo',)

@admin.register(BaseReferencia)
class BaseReferenciaAdmin(admin.ModelAdmin):
    list_display = ('npj_limpo', 'polo', 'created_at')
    search_fields = ('npj_limpo', 'npj_original')