import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { isSuperadmin, isAdmin, useAuth } from "@/lib/auth";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
  type UserProfile,
  type AdminUserCreate,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, UserPlus } from "lucide-react";

const ROLE_OPTIONS_SUPERADMIN = [
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
  { value: "superadmin", label: "Superadmin" },
];

const ROLE_OPTIONS_ADMIN = [
  { value: "viewer", label: "Viewer" },
  { value: "admin", label: "Admin" },
];

const EMPTY_FORM: AdminUserCreate = {
  email: "",
  full_name: "",
  password: "",
  role: "viewer",
};

export default function AdminPage() {
  const { user } = useAuth();
  const isSuperadminUser = isSuperadmin(user);

  const roleOptions = isSuperadminUser ? ROLE_OPTIONS_SUPERADMIN : ROLE_OPTIONS_ADMIN;

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [form, setForm] = useState<AdminUserCreate>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  if (!isAdmin(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);
    try {
      const created = await createUser(form);
      setInfo(`Compte cree : ${created.email}`);
      setForm(EMPTY_FORM);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (u: UserProfile, role: string) => {
    setError(null);
    setInfo(null);
    try {
      await updateUser(u.id, { role });
      setInfo(`Role mis a jour pour ${u.email} -> ${role}`);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleToggleActive = async (u: UserProfile) => {
    setError(null);
    setInfo(null);
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (u: UserProfile) => {
    if (!confirm(`Supprimer definitivement ${u.email} ?`)) return;
    setError(null);
    setInfo(null);
    try {
      await deleteUser(u.id);
      setInfo(`Compte supprime : ${u.email}`);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administration avancee</h1>
        <p className="text-sm text-muted-foreground">
          {isSuperadminUser
            ? "Gestion des comptes utilisateurs (reserve au superadministrateur)."
            : "Gestion des comptes utilisateurs (viewer et admin uniquement)."}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {info}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" />
            Creer un nouveau compte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleCreate}
            className="grid gap-3 md:grid-cols-5"
          >
            <Input
              placeholder="Email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              placeholder="Nom complet"
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
            <Input
              placeholder="Mot de passe"
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <Select
              value={form.role}
              onValueChange={(v) => setForm({ ...form, role: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Creer"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comptes existants</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 pr-3 font-medium">Nom</th>
                    <th className="py-2 pr-3 font-medium">Role</th>
                    <th className="py-2 pr-3 font-medium">Actif</th>
                    <th className="py-2 pr-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u.id === user?.id;
                    return (
                      <tr key={u.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs">{u.email}</td>
                        <td className="py-2 pr-3">{u.full_name}</td>
                        <td className="py-2 pr-3 w-44">
                          <Select
                            value={u.role}
                            onValueChange={(v) => handleRoleChange(u, v)}
                            disabled={isSelf || (!isSuperadminUser && u.role === "superadmin")}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((r) => (
                                <SelectItem key={r.value} value={r.value}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge
                            variant={u.is_active ? "default" : "secondary"}
                            className="cursor-pointer"
                            onClick={() => !isSelf && handleToggleActive(u)}
                          >
                            {u.is_active ? "Actif" : "Inactif"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isSelf || (!isSuperadminUser && u.role === "superadmin")}
                            onClick={() => handleDelete(u)}
                            title={
                              isSelf
                                ? "Vous ne pouvez pas supprimer votre propre compte"
                                : "Supprimer"
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {users.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-6 text-center text-muted-foreground"
                      >
                        Aucun compte.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
