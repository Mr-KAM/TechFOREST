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
  getGeeCredentials,
  uploadGeeCredentials,
  type UserProfile,
  type AdminUserCreate,
  type MediaVideo,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Trash2,
  UserPlus,
  Video,
  Upload,
  KeyRound,
  Search,
  Users,
  Settings,
  X,
  RefreshCw,
} from "lucide-react";

// ─── Constantes ────────────────────────────────────────────────────────────

const ROLE_OPTIONS_SUPERADMIN = [
  { value: "viewer",     label: "Viewer" },
  { value: "editor",     label: "Editor" },
  { value: "admin",      label: "Admin" },
  { value: "superadmin", label: "Superadmin" },
];

const ROLE_OPTIONS_ADMIN = [
  { value: "viewer", label: "Viewer" },
  { value: "admin",  label: "Admin" },
];

const ROLE_COLORS: Record<string, string> = {
  superadmin: "bg-purple-500/15 text-purple-700 border-purple-500/30 dark:text-purple-300",
  admin:      "bg-blue-500/15 text-blue-700 border-blue-500/30 dark:text-blue-300",
  editor:     "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  viewer:     "bg-slate-500/15 text-slate-600 border-slate-400/30 dark:text-slate-300",
};

const EMPTY_FORM: AdminUserCreate = {
  email: "",
  full_name: "",
  password: "",
  role: "viewer",
  send_email: true,
};

// ─── Page principale ────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user } = useAuth();
  const isSuperadminUser = isSuperadmin(user);

  const [error, setError]   = useState<string | null>(null);
  const [info, setInfo]     = useState<string | null>(null);

  if (!isAdmin(user)) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administration</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isSuperadminUser
            ? "Gestion des utilisateurs, médias et paramètres système."
            : "Gestion des comptes utilisateurs (viewer et admin uniquement)."}
        </p>
      </div>

      {/* Notifications globales */}
      {error && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {info && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-400">
          <span>{info}</span>
          <button onClick={() => setInfo(null)} className="shrink-0 mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Onglets */}
      <Tabs defaultValue="users">
        <TabsList className={isSuperadminUser ? "grid w-full grid-cols-3 max-w-lg" : ""}>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="h-4 w-4" /> Utilisateurs
          </TabsTrigger>
          {isSuperadminUser && (
            <TabsTrigger value="medias" className="gap-1.5">
              <Video className="h-4 w-4" /> Médias
            </TabsTrigger>
          )}
          {isSuperadminUser && (
            <TabsTrigger value="parametres" className="gap-1.5">
              <Settings className="h-4 w-4" /> Paramètres
            </TabsTrigger>
          )}
        </TabsList>

        {/* ─── Onglet Utilisateurs ─────────────────────────────── */}
        <TabsContent value="users" className="mt-4">
          <UsersTable
            currentUser={user}
            isSuperadminUser={isSuperadminUser}
            onError={setError}
            onInfo={setInfo}
          />
        </TabsContent>

        {/* ─── Onglet Médias ───────────────────────────────────── */}
        {isSuperadminUser && (
          <TabsContent value="medias" className="mt-4">
            <HomeVideosCard onError={setError} onInfo={setInfo} />
          </TabsContent>
        )}

        {/* ─── Onglet Paramètres ───────────────────────────────── */}
        {isSuperadminUser && (
          <TabsContent value="parametres" className="mt-4">
            <GeeCredentialsCard onError={setError} onInfo={setInfo} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ─── Tableau des utilisateurs ──────────────────────────────────────────────

function UsersTable({
  currentUser,
  isSuperadminUser,
  onError,
  onInfo,
}: {
  currentUser: UserProfile | null;
  isSuperadminUser: boolean;
  onError: (msg: string | null) => void;
  onInfo: (msg: string | null) => void;
}) {
  const roleOptions = isSuperadminUser ? ROLE_OPTIONS_SUPERADMIN : ROLE_OPTIONS_ADMIN;

  const [users,       setUsers]       = useState<UserProfile[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [resettingId, setResettingId] = useState<number | null>(null);

  // Filtres
  const [search,     setSearch]     = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Modal création
  const [showModal,  setShowModal]  = useState(false);
  const [form,       setForm]       = useState<AdminUserCreate>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const refresh = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      setUsers(await listUsers());
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);
    try {
      const created = await createUser(form);
      onInfo(
        form.send_email
          ? `Compte créé : ${created.email}. Les identifiants ont été envoyés par email (si SMTP configuré).`
          : `Compte créé : ${created.email}`,
      );
      setShowModal(false);
      setForm(EMPTY_FORM);
      await refresh(true);
    } catch (err) {
      setModalError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (u: UserProfile, role: string) => {
    try {
      await updateUser(u.id, { role });
      onInfo(`Rôle mis à jour : ${u.email} → ${role}`);
      await refresh(true);
    } catch (err) {
      onError((err as Error).message);
    }
  };

  const handleToggleActive = async (u: UserProfile) => {
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      await refresh(true);
    } catch (err) {
      onError((err as Error).message);
    }
  };

  const handleDelete = async (u: UserProfile) => {
    if (!confirm(`Supprimer définitivement le compte ${u.email} ?`)) return;
    try {
      await deleteUser(u.id);
      onInfo(`Compte supprimé : ${u.email}`);
      await refresh(true);
    } catch (err) {
      onError((err as Error).message);
    }
  };

  const handleResetPassword = async (u: UserProfile) => {
    if (
      !confirm(
        `Réinitialiser le mot de passe de ${u.email} ?\n\nUn nouveau mot de passe sera généré et envoyé par email. L'ancien sera invalide.`,
      )
    ) return;
    setResettingId(u.id);
    try {
      const res = await resetUserPassword(u.id);
      onInfo(
        res.email_sent
          ? `Nouveau mot de passe généré et envoyé à ${res.email}.`
          : `Mot de passe réinitialisé pour ${res.email} (email non envoyé).`,
      );
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setResettingId(null);
    }
  };

  const filtered = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!u.email.toLowerCase().includes(q) && !u.full_name.toLowerCase().includes(q))
        return false;
    }
    return true;
  });

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("fr-FR"); }
    catch { return iso; }
  };

  return (
    <>
      <Card>
        {/* Barre d'outils */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b">
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-48"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-9 w-36 text-sm">
                <SelectValue placeholder="Tous les rôles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les rôles</SelectItem>
                {ROLE_OPTIONS_SUPERADMIN.map((r) => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => refresh(true)}
              disabled={refreshing}
              title="Actualiser"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => { setForm(EMPTY_FORM); setModalError(null); setShowModal(true); }}>
              <UserPlus className="h-4 w-4" />
              Nouveau compte
            </Button>
          </div>
        </div>

        {/* Tableau */}
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">Utilisateur</th>
                    <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">Rôle</th>
                    <th className="py-2.5 px-4 text-left font-medium text-muted-foreground whitespace-nowrap">Statut</th>
                    <th className="py-2.5 px-4 text-left font-medium text-muted-foreground whitespace-nowrap">Créé le</th>
                    <th className="py-2.5 px-4 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    const isProtected = !isSuperadminUser && u.role === "superadmin";
                    return (
                      <tr key={u.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        {/* Utilisateur */}
                        <td className="py-2.5 px-4">
                          <div className="font-medium leading-tight">{u.full_name}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">{u.email}</div>
                        </td>

                        {/* Rôle */}
                        <td className="py-2.5 px-4 w-44">
                          <Select
                            value={u.role}
                            onValueChange={(v) => handleRoleChange(u, v)}
                            disabled={isSelf || isProtected}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(isSuperadminUser ? ROLE_OPTIONS_SUPERADMIN : ROLE_OPTIONS_ADMIN).map((r) => (
                                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        {/* Statut */}
                        <td className="py-2.5 px-4">
                          <button
                            disabled={isSelf}
                            onClick={() => !isSelf && handleToggleActive(u)}
                            className="focus:outline-none"
                            title={isSelf ? undefined : u.is_active ? "Cliquer pour désactiver" : "Cliquer pour activer"}
                          >
                            <Badge
                              variant={u.is_active ? "default" : "secondary"}
                              className={`text-[10px] ${!isSelf ? "cursor-pointer hover:opacity-80" : ""}`}
                            >
                              {u.is_active ? "Actif" : "Inactif"}
                            </Badge>
                          </button>
                        </td>

                        {/* Date */}
                        <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(u.created_at)}
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-amber-600"
                              disabled={isSelf || isProtected || resettingId === u.id}
                              onClick={() => handleResetPassword(u)}
                              title={isSelf ? "Modifiez depuis votre profil" : "Réinitialiser le mot de passe"}
                            >
                              {resettingId === u.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <KeyRound className="h-3.5 w-3.5" />
                              }
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              disabled={isSelf || isProtected}
                              onClick={() => handleDelete(u)}
                              title={isSelf ? "Vous ne pouvez pas supprimer votre propre compte" : "Supprimer"}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                        {users.length === 0 ? "Aucun compte utilisateur." : "Aucun résultat pour ces filtres."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pied de tableau */}
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t text-xs text-muted-foreground">
              {filtered.length} utilisateur{filtered.length > 1 ? "s" : ""}
              {roleFilter !== "all" || search ? ` (filtrés sur ${users.length})` : ""}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de création */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> Créer un compte
              </h2>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setShowModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-4 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium">Email *</label>
                <Input
                  type="email"
                  required
                  placeholder="utilisateur@exemple.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Nom complet *</label>
                <Input
                  required
                  placeholder="Prénom Nom"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Mot de passe *</label>
                  <Input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Min. 6 caractères"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Rôle *</label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => setForm({ ...form, role: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(isSuperadminUser ? ROLE_OPTIONS_SUPERADMIN : ROLE_OPTIONS_ADMIN).map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={form.send_email ?? false}
                  onChange={(e) => setForm({ ...form, send_email: e.target.checked })}
                />
                Envoyer les identifiants par email
              </label>
              {modalError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive">
                  {modalError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)} disabled={submitting}>
                  Annuler
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Création…</> : "Créer le compte"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Onglet Médias ─────────────────────────────────────────────────────────

function HomeVideosCard({
  onError,
  onInfo,
}: {
  onError: (msg: string | null) => void;
  onInfo: (msg: string | null) => void;
}) {
  const [videos,      setVideos]      = useState<MediaVideo[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = async () => {
    setLoading(true);
    try { setVideos(await listVideos()); }
    catch (err) { onError((err as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const handleFileSelected = async (key: string, file: File) => {
    onError(null);
    onInfo(null);
    setUploadingKey(key);
    try {
      await uploadVideo(key, file);
      onInfo(`Vidéo « ${key} » mise à jour avec succès.`);
      await refresh();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setUploadingKey(null);
      const input = fileInputs.current[key];
      if (input) input.value = "";
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Supprimer la vidéo « ${key} » ?`)) return;
    onError(null);
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
    try { return new Date(iso).toLocaleString("fr-FR"); }
    catch { return iso; }
  };

  const VIDEO_LABELS: Record<string, string> = {
    drone:        "Vidéo de fond (drone — Hero)",
    presentation: "Vidéo de présentation",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="h-4 w-4" /> Vidéos de la page d'accueil
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <p className="px-6 pb-4 text-sm text-muted-foreground">
          Remplacez les vidéos affichées sur la page d'accueil publique.
          Formats acceptés : MP4, WebM, MOV, MKV — taille max. 200 Mo.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 px-6 pb-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-t bg-muted/30">
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">Vidéo</th>
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">Fichier</th>
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">Taille</th>
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground whitespace-nowrap">Mis à jour</th>
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">Statut</th>
                  <th className="py-2.5 px-4 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v) => {
                  const isBusy = uploadingKey === v.key;
                  return (
                    <tr key={v.key} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-4 font-medium">{VIDEO_LABELS[v.key] ?? v.key}</td>
                      <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground">{v.filename}</td>
                      <td className="py-2.5 px-4 text-muted-foreground whitespace-nowrap">{formatSize(v.size_bytes)}</td>
                      <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">{formatDate(v.updated_at)}</td>
                      <td className="py-2.5 px-4">
                        {v.available
                          ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 text-[10px]">Disponible</Badge>
                          : <Badge variant="outline" className="border-amber-500/40 text-amber-600 text-[10px]">Manquante</Badge>
                        }
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <input
                            ref={(el) => { fileInputs.current[v.key] = el; }}
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
                            {isBusy
                              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Envoi…</>
                              : <><Upload className="mr-1.5 h-3.5 w-3.5" />Remplacer</>
                            }
                          </Button>
                          {v.available && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={isBusy}
                              onClick={() => handleDelete(v.key)}
                              title="Supprimer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {videos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                      Aucune vidéo configurée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Onglet Paramètres — Credentials GEE ──────────────────────────────────

function GeeCredentialsCard({
  onError,
  onInfo,
}: {
  onError: (msg: string | null) => void;
  onInfo: (msg: string | null) => void;
}) {
  const [status,   setStatus]   = useState<{ available: boolean; path: string; size_bytes?: number; updated_at?: string } | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [uploading, setUploading] = useState(false);
  const [geeTest,  setGeeTest]  = useState<{ initialized: boolean; error?: string } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    setLoading(true);
    try { setStatus(await getGeeCredentials()); }
    catch (err) { onError((err as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const handleFile = async (file: File) => {
    onError(null);
    onInfo(null);
    setUploading(true);
    setGeeTest(null);
    try {
      const result = await uploadGeeCredentials(file);
      setGeeTest({ initialized: result.gee_initialized, error: result.gee_error });
      if (result.gee_initialized) {
        onInfo("Credentials GEE téléversés et initialisés avec succès.");
      } else {
        onError(`Credentials téléversés mais erreur GEE : ${result.gee_error || "Initialisation impossible"}`);
      }
      await refresh();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} o`;
    return `${(bytes / 1024).toFixed(1)} Ko`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="h-4 w-4" /> Compte de service Google Earth Engine
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <p className="px-6 pb-4 text-sm text-muted-foreground">
          Téléversez un fichier JSON de type service account GEE. Le backend l'utilise
          pour s'authentifier auprès de Google Earth Engine.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 px-6 pb-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-t bg-muted/30">
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">Fichier configuré</th>
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">Taille</th>
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground whitespace-nowrap">Dernière mise à jour</th>
                  <th className="py-2.5 px-4 text-left font-medium text-muted-foreground">Statut</th>
                  <th className="py-2.5 px-4 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs">{status?.path ?? "—"}</td>
                  <td className="py-3 px-4 text-muted-foreground">{formatSize(status?.size_bytes)}</td>
                  <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                    {status?.updated_at ? new Date(status.updated_at).toLocaleString("fr-FR") : "—"}
                  </td>
                  <td className="py-3 px-4">
                    {status?.available
                      ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 text-[10px]">Présent</Badge>
                      : <Badge variant="outline" className="border-amber-500/40 text-amber-600 text-[10px]">Absent</Badge>
                    }
                  </td>
                  <td className="py-3 px-4 text-right">
                    <input
                      ref={fileInput}
                      type="file"
                      accept="application/json"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInput.current?.click()}
                      disabled={uploading}
                    >
                      {uploading
                        ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Téléversement…</>
                        : <><Upload className="mr-1.5 h-3.5 w-3.5" />Téléverser / remplacer</>
                      }
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Résultat du test d'initialisation GEE */}
        {geeTest && (
          <div className={`mx-6 mb-4 mt-2 flex items-center justify-between rounded-md border px-4 py-2.5 text-sm ${
            geeTest.initialized
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}>
            <span>
              {geeTest.initialized
                ? "✓ Credentials valides — GEE initialisé avec succès"
                : `✗ Échec de l'initialisation GEE : ${geeTest.error}`}
            </span>
            <Badge variant={geeTest.initialized ? "default" : "destructive"} className="ml-3 shrink-0">
              {geeTest.initialized ? "OK" : "Erreur"}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
