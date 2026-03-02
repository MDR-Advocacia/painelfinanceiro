import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function UserManagement() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-secondary p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar ao Painel
        </Button>

        <Card className="border-primary/20 shadow-sm">
          <CardContent className="pt-12 pb-12 flex flex-col items-center text-center space-y-6">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-2">
              <ShieldCheck className="w-10 h-10 text-primary" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold font-heading">Gestão de Usuários Centralizada</h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Para garantir maior segurança, o controle de acessos, criação de novos coordenadores e redefinição de senhas agora é realizado diretamente no painel de administração do servidor.
              </p>
            </div>

            <a 
              href="http://localhost:8000/admin/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 py-2"
            >
              Abrir Painel de Administração
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}