import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/useTheme";
import { forgotPassword } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { TreePine, Loader2, Eye, EyeOff, Sun, Moon, ArrowLeft, CheckCircle2 } from "lucide-react";

type View = "login" | "forgot" | "sent";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { resolved, setTheme } = useTheme();

  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // Shared state
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("login");

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password, rememberMe);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(forgotEmail);
      setView("sent");
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  const goToForgot = () => {
    setForgotEmail(email); // pré-remplir avec l'email déjà saisi
    setError("");
    setView("forgot");
  };

  return (
    <div className="relative grid min-h-screen lg:grid-cols-2">
      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-4 top-4 z-20 text-muted-foreground"
        onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
      >
        {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      {/* Left panel — branding */}
      <div className="relative hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
            <TreePine className="h-6 w-6 text-primary" />
          </div>
          <span className="text-xl font-bold tracking-tight">TechFORESTS</span>
        </div>

        <div className="space-y-4">
          <blockquote className="text-lg leading-relaxed text-sidebar-foreground/80">
            "TechFORESTS nous permet de surveiller en temps réel la couverture forestière
            et d'agir rapidement face aux changements détectés grâce aux données terrains et par satellite."
          </blockquote>
          <p className="text-sm text-sidebar-muted">— Équipe AVOCET AGRI</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <img src="/mitsubishi.png" alt="mitsubishi" className="h-8 w-auto object-contain opacity-90" />
            <img src="/2019-Rainforest-Alliance-logo.png" alt="Rainforest Alliance" className="h-8 w-auto object-contain opacity-90" />
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()}  &thinsp;
            <a href="https://avocet-agri.com/" target="_blank" rel="noreferrer" className="opacity-80 hover:opacity-100 transition-opacity text-primary">
            AVOCET AGRI </a> — Monitoring forestier à 3 niveau (3LDM).
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-[400px] border-0 shadow-none sm:border sm:shadow-sm">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 lg:hidden">
              <TreePine className="h-8 w-8 text-primary" />
            </div>
            <div className="flex items-center justify-center gap-4 lg:hidden">
              <img src="/mitsubishi.png" alt="mitsubishi" className="h-8 w-auto object-contain" />
              <img src="/2019-Rainforest-Alliance-logo.png" alt="Rainforest Alliance" className="h-8 w-auto object-contain" />
            </div>
            {view === "login" && (
              <>
                <CardTitle className="text-2xl font-bold">Connexion</CardTitle>
                <CardDescription>
                  Entrez vos identifiants pour accéder à la plateforme
                </CardDescription>
              </>
            )}
            {view === "forgot" && (
              <>
                <CardTitle className="text-2xl font-bold">Mot de passe oublié</CardTitle>
                <CardDescription>
                  Saisissez votre adresse email pour recevoir un lien de réinitialisation
                </CardDescription>
              </>
            )}
            {view === "sent" && (
              <>
                <CardTitle className="text-2xl font-bold">Email envoyé</CardTitle>
                <CardDescription>
                  Consultez votre boîte de réception
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {/* ── Vue : connexion ── */}
            {view === "login" && (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Adresse email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@techforest.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium">
                      Mot de passe
                    </label>
                    <button
                      type="button"
                      onClick={goToForgot}
                      className="text-xs text-primary hover:underline"
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="h-11 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                  />
                  <label htmlFor="remember-me" className="text-sm text-muted-foreground cursor-pointer select-none">
                    Se souvenir de moi
                  </label>
                </div>

                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Connexion...
                    </>
                  ) : (
                    "Se connecter"
                  )}
                </Button>
              </form>
            )}

            {/* ── Vue : mot de passe oublié ── */}
            {view === "forgot" && (
              <form onSubmit={handleForgot} className="space-y-4">
                {error && (
                  <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="forgot-email" className="text-sm font-medium">
                    Adresse email
                  </label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="votre@email.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="h-11"
                  />
                </div>

                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    "Envoyer le lien"
                  )}
                </Button>

                <button
                  type="button"
                  onClick={() => { setView("login"); setError(""); }}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mx-auto"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Retour à la connexion
                </button>
              </form>
            )}

            {/* ── Vue : email envoyé ── */}
            {view === "sent" && (
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Si l'adresse <span className="font-medium text-foreground">{forgotEmail}</span> est
                  associée à un compte, vous recevrez un email contenant un lien de réinitialisation
                  valable <strong>1 heure</strong>.
                </p>
                <p className="text-xs text-muted-foreground">
                  Vérifiez également vos spams si vous ne voyez pas l'email.
                </p>
                <Button
                  variant="outline"
                  className="w-full h-11"
                  onClick={() => { setView("login"); setError(""); }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Retour à la connexion
                </Button>
              </div>
            )}

            {view === "login" && (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Pas encore de compte ?{" "}
                <Link to="/" className="font-medium text-primary hover:underline">
                  Retour à l'accueil
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
