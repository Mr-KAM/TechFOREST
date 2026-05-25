import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { isSuperadmin, isAdmin, useAuth } from "@/lib/auth";
import {
  createUser,
  deleteUser,
  listUsers,
  resetUserPassword,
  updateUser,
  listVideos,
  uploadVideo,
  deleteVideo,
  type UserProfile,
  type AdminUserCreate,
  type MediaVideo,
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
import { Loader2, Trash2, UserPlus, Video, Upload, KeyRound } from "lucide-react";

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
  send_email: true,
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
  const [resettingId, setResettingId] = useState<number | null>(null);

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
      setInfo(
        form.send_email
          ? `Compte cree : ${created.email}. Les identifiants ont ete envoyes par email (si SMTP configure).`
          : `Compte cree : ${created.email}`,
      );
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

  const handleResetPassword = async (u: UserProfile) => {
    if (
      !confirm(
        `Reinitialiser le mot de passe de ${u.email} ?\n\n` +
          `Un nouveau mot de passe sera genere et envoye par email a l'utilisateur. ` +
          `L'ancien mot de passe sera invalide.`,
      )
    ) {
      return;
    }
    setError(null);
    setInfo(null);
    setResettingId(u.id);
    try {
      const res = await resetUserPassword(u.id);
      setInfo(
        res.email_sent
          ? `Nouveau mot de passe genere et envoye par email a ${res.email}.`
          : `Mot de passe reinitialise pour ${res.email} (email non envoye).`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResettingId(null);
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
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-5">
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
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={form.send_email ?? false}
                onChange={(e) =>
                  setForm({ ...form, send_email: e.target.checked })
                }
              />
              Envoyer les identifiants par email au nouvel utilisateur
            </label>
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
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={
                                isSelf ||
                                resettingId === u.id ||
                                (!isSuperadminUser && u.role === "superadmin")
                              }
                              onClick={() => handleResetPassword(u)}
                              title={
                                isSelf
                                  ? "Utilisez la page Mon profil pour changer votre mot de passe"
                                  : "Reinitialiser le mot de passe et l'envoyer par email"
                              }
                            >
                              {resettingId === u.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <KeyRound className="h-4 w-4 text-amber-600" />
                              )}
                            </Button>
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
                          </div>
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

      {isSuperadminUser && <HomeVideosCard onError={setError} onInfo={setInfo} />}
    </div>
  );
}

// ─── Carte de gestion des vidéos de la page d'accueil ─────────────────────
// Visible uniquement au superadmin.
function HomeVideosCard({
  onError,
  onInfo,
}: {
  onError: (msg: string | null) => void;
  onInfo: (msg: string | null) => void;
}) {
  const [videos, setVideos] = useState<MediaVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = async () => {
    setLoading(true);
    try {
      setVideos(await listVideos());
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleFileSelected = async (key: string, file: File) => {
    onError(null);
    onInfo(null);
    setUploadingKey(key);
    setProgress((p) => ({ ...p, [key]: 0 }));
    try {
      await uploadVideo(key, file);
      onInfo(`Vidéo « ${key} » mise à jour avec succès.`);
      await refresh();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setUploadingKey(null);
      setProgress((p) => ({ ...p, [key]: 0 }));
      const input = fileInputs.current[key];
      if (input) input.value = "";
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Supprimer la vidéo « ${key} » ?`)) return;
    onError(null);
    onInfo(null);
    try {
      await deleteVideo(key);
      onInfo(`Vidéo « ${key} » supprimée.`);
      await refresh();
    } catch (err) {
      onError((err as Error).message);
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("fr-FR");
    } catch {
      return iso;
    }
  };

  const VIDEO_LABELS: Record<string, string> = {
    drone: "Vidéo de fond (drone — Hero)",
    presentation: "Vidéo de présentation",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="h-4 w-4" />
          Vidéos de la page d'accueil
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          Téléversez de nouvelles vidéos pour remplacer celles affichées sur la page d'accueil
          publique. Formats acceptés : MP4, WebM, MOV, MKV. Taille maximale : 200 Mo.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
          </div>
        ) : (
          <div className="space-y-4">
            {videos.map((v) => {
              const isBusy = uploadingKey === v.key;
              return (
                <div
                  key={v.key}
                  className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{VIDEO_LABELS[v.key] ?? v.key}</span>
                      {v.available ? (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-600">
                          Disponible
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-600">
                          Manquante
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      <span className="font-mono">{v.filename}</span>
                      {" · "}
                      {formatSize(v.size_bytes)}
                      {" · maj "}
                      {formatDate(v.updated_at)}
                    </p>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-2">
                    <input
                      ref={(el) => {
                        fileInputs.current[v.key] = el;
                      }}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelected(v.key, file);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isBusy}
                      onClick={() => fileInputs.current[v.key]?.click()}
                    >
                      {isBusy ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Envoi {progress[v.key] ? `${progress[v.key]}%` : "..."}
                        </>
                      ) : (
                        <>
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          Remplacer
                        </>
                      )}
                    </Button>
                    {v.available && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isBusy}
                        onClick={() => handleDelete(v.key)}
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {videos.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucune vidéo configurée.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
