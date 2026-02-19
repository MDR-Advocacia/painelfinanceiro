import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Users, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { mapAuthError, validateName } from "@/utils/security";

interface UserEntry {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  roles: string[];
}

export default function UserManagement() {
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const resp = await supabase.functions.invoke("admin-users", {
      body: { action: "list-users" },
    });

    if (resp.error) {
      toast.error("Erro ao carregar usuários");
    } else {
      setUsers(resp.data.users || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async () => {
    if (!newEmail.trim() || !newPassword.trim()) {
      toast.error("E-mail e senha são obrigatórios");
      return;
    }
    if (newName.trim()) {
      const nameError = validateName(newName);
      if (nameError) {
        toast.error(nameError);
        return;
      }
    }
    setCreating(true);
    const resp = await supabase.functions.invoke("admin-users", {
      body: { action: "create-user", email: newEmail.trim(), password: newPassword, full_name: newName.trim() },
    });

    if (resp.error || resp.data?.error) {
      toast.error(mapAuthError(resp.data?.error || resp.error?.message || ""));
    } else {
      toast.success("Usuário criado com sucesso");
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      setDialogOpen(false);
      fetchUsers();
    }
    setCreating(false);
  };

  const handleDelete = async (userId: string, userEmail: string) => {
    if (!confirm(`Tem certeza que deseja excluir o usuário ${userEmail}?`)) return;

    const resp = await supabase.functions.invoke("admin-users", {
      body: { action: "delete-user", user_id: userId },
    });

    if (resp.error || resp.data?.error) {
      toast.error("Erro ao excluir usuário");
    } else {
      toast.success("Usuário excluído");
      fetchUsers();
    }
  };

  return (
    <div className="min-h-screen bg-secondary p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              Gestão de Usuários
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Adicione ou remova usuários do sistema
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-heading">Usuários Cadastrados</CardTitle>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="w-4 h-4" /> Novo Usuário
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Novo Usuário</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Nome Completo</label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Ex: João Silva"
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">E-mail</label>
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Senha</label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                    />
                  </div>
                  <Button onClick={handleCreate} className="w-full" disabled={creating}>
                    {creating ? "Criando..." : "Criar Usuário"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nome</TableHead>
                      <TableHead className="text-xs">E-mail</TableHead>
                      <TableHead className="text-xs">Perfil</TableHead>
                      <TableHead className="text-xs">Criado em</TableHead>
                      <TableHead className="text-xs text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="text-sm font-medium">{user.full_name || "—"}</TableCell>
                        <TableCell className="text-sm">{user.email}</TableCell>
                        <TableCell>
                          {user.roles.map((r) => (
                            <Badge
                              key={r}
                              variant={r === "admin" ? "default" : "outline"}
                              className="text-[10px] mr-1"
                            >
                              {r === "admin" ? "Administrador" : "Usuário"}
                            </Badge>
                          ))}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right">
                          {!user.roles.includes("admin") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(user.id, user.email || "")}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
