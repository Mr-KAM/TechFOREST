import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { changeMyPassword, updateMyProfile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, User as UserIcon, KeyRound, Save } from "lucide-react";

export default function ProfilePage() {
  const { user, loading, refreshUser } = useAuth();

  // ── Profil ─────────────────────────────────────────────
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileInfo, setProfileInfo] = useState<string | null>(null);

  // ── Mot de passe ───────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordInfo, setPasswordInfo] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? "");
      setEmail(user.email ?? "");
    }
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const initials =
    (user.full_name || user.email || "U")
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  const profileDirty =
    fullName.trim() !== (user.full_name ?? "") ||
    email.trim().toLowerCase() !== (user.email ?? "").toLowerCase();

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileInfo(null);
    if (!fullName.trim()) {
      setProfileError("Le nom complet est requis.");
      return;
    }
    setProfileSubmitting(true);
    try {
      await updateMyProfile({
        full_name: fullName.trim(),
        email: email.trim(),
      });
      await refreshUser();
      setProfileInfo("Profil mis à jour avec succès.");
    } catch (err) {
      setProfileError((err as Error).message);
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordInfo(null);
    if (newPassword.length < 6) {
      setPasswordError("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("La confirmation ne correspond pas au nouveau mot de passe.");
      return;
    }
    setPasswordSubmitting(true);
    try {
      await changeMyPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordInfo("Mot de passe modifié avec succès.");
    } catch (err) {
      setPasswordError((err as Error).message);
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mon profil</h1>
        <p className="text-sm text-muted-foreground">
          Consultez et mettez à jour vos informations personnelles ainsi que votre mot de passe.
        </p>
      </div>

      {/* En-tête : avatar + identité */}
      <Card>
        <CardContent className="flex items-center gap-4 py-5">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/20 text-primary text-lg font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-lg font-semibold truncate">{user.full_name}</p>
            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            <span
              className={
                "mt-1 inline-block rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
                (user.role === "superadmin"
                  ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                  : user.role === "admin"
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground")
              }
            >
              {user.role}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Informations personnelles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="h-4 w-4" />
            Informations personnelles
          </CardTitle>
        </CardHeader>
        <CardContent>
          {profileError && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {profileError}
            </div>
          )}
          {profileInfo && (
            <div className="mb-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              {profileInfo}
            </div>
          )}
          <form onSubmit={handleProfileSubmit} className="space-y-4 max-w-xl">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="profile-fullname">
                Nom complet
              </label>
              <Input
                id="profile-fullname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nom complet"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="profile-email">
                Email
              </label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
              />
              <p className="text-xs text-muted-foreground">
                Cet email vous servira d'identifiant pour vous connecter.
              </p>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={!profileDirty || profileSubmitting}>
                {profileSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Enregistrer
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Mot de passe */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Changer mon mot de passe
          </CardTitle>
        </CardHeader>
        <CardContent>
          {passwordError && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {passwordError}
            </div>
          )}
          {passwordInfo && (
            <div className="mb-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              {passwordInfo}
            </div>
          )}
          <form onSubmit={handlePasswordSubmit} className="space-y-4 max-w-xl">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="current-password">
                Mot de passe actuel
              </label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="new-password">
                  Nouveau mot de passe
                </label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="confirm-password">
                  Confirmer
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Minimum 6 caractères. Choisissez un mot de passe que vous n'utilisez pas ailleurs.
            </p>
            <div className="flex justify-end">
              <Button type="submit" disabled={passwordSubmitting}>
                {passwordSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Modifier le mot de passe
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
