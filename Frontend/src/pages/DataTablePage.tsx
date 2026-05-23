import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { isSuperadmin, useAuth } from "@/lib/auth";
import {
  getConfiguredKoboForms,
  getKoboSubmissions,
  type KoboFormConfigured,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { Loader2, Download, RefreshCw, Database } from "lucide-react";

type Row = Record<string, unknown>;

// Champs internes Kobo à masquer par défaut
const HIDDEN_PREFIXES = ["_", "formhub/", "meta/"];
const HIDDEN_KEYS = new Set([
  "start",
  "end",
  "today",
  "deviceid",
  "phonenumber",
  "username",
  "simserial",
  "__version__",
  "formhub/uuid",
  "meta/instanceID",
  "meta/rootUuid",
  "meta/deprecatedID",
]);

function isHidden(key: string) {
  if (HIDDEN_KEYS.has(key)) return true;
  return HIDDEN_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Aplati un objet de soumission Kobo en clés plates :
 *   { "Identification_parcelle/surface_ha": 12 }
 * Les groupes répétés (tableaux d'objets) sont conservés tels quels
 * pour afficher un résumé "N éléments".
 */
function flattenSubmission(obj: unknown, prefix = ""): Row {
  const out: Row = {};
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== "object" || Array.isArray(obj)) {
    if (prefix) out[prefix] = obj as unknown;
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}/${k}` : k;
    if (Array.isArray(v)) {
      // Groupe répété ou liste -> on garde la valeur brute (sera résumée à l'affichage)
      out[key] = v;
    } else if (v !== null && typeof v === "object") {
      Object.assign(out, flattenSubmission(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** Extrait l'objet "data" si la ligne est emballée par l'API. */
function unwrap(row: unknown): Row {
  if (row && typeof row === "object" && !Array.isArray(row)) {
    const r = row as Record<string, unknown>;
    if (
      "data" in r &&
      r.data &&
      typeof r.data === "object" &&
      !Array.isArray(r.data)
    ) {
      return r.data as Row;
    }
    return r as Row;
  }
  return {};
}

/** Affiche uniquement le dernier segment du chemin (groupe/sous/champ -> champ). */
function shortLabel(key: string): string {
  const parts = key.split("/");
  return parts[parts.length - 1] || key;
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) {
    if (v.length === 0) return "—";
    if (v.every((x) => typeof x !== "object" || x === null)) {
      return v.map((x) => String(x)).join(", ");
    }
    return `${v.length} élément(s)`;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function toCsv(rows: Row[], columns: string[]): string {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const header = columns.map(escape).join(",");
  const body = rows
    .map((r) => columns.map((c) => escape(formatCell(r[c]))).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

export default function DataTablePage() {
  const { user } = useAuth();

  const [forms, setForms] = useState<KoboFormConfigured[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAllColumns, setShowAllColumns] = useState(false);

  // Charger les formulaires configurés
  useEffect(() => {
    setLoadingForms(true);
    getConfiguredKoboForms()
      .then((list) => {
        setForms(list);
        if (list.length > 0) setSelected(list[0].uid);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoadingForms(false));
  }, []);

  // Charger les soumissions du formulaire sélectionné
  const loadSubmissions = async (uid: string) => {
    if (!uid) return;
    setLoadingRows(true);
    setError(null);
    try {
      const data = (await getKoboSubmissions(uid, 500)) as unknown[];
      const flat = Array.isArray(data)
        ? data.map((d) => flattenSubmission(unwrap(d)))
        : [];
      setRows(flat);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    if (selected) loadSubmissions(selected);
  }, [selected]);

  // Toutes les clés rencontrées
  const allColumns = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => Object.keys(r).forEach((k) => set.add(k)));
    return Array.from(set);
  }, [rows]);

  const columns = useMemo(
    () => (showAllColumns ? allColumns : allColumns.filter((k) => !isHidden(k))),
    [allColumns, showAllColumns],
  );

  // ─── Groupes répétés ──────────────────────────────────────
  // Clés dont la valeur est un tableau d'objets (groupe répété Kobo).
  const repeatedGroupKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      for (const [k, v] of Object.entries(r)) {
        if (
          Array.isArray(v) &&
          v.length > 0 &&
          v.some((it) => it && typeof it === "object" && !Array.isArray(it))
        ) {
          set.add(k);
        }
      }
    }
    return Array.from(set);
  }, [rows]);

  // Colonnes affichées dans l'onglet principal (sans les groupes répétés).
  const principalColumns = useMemo(
    () => columns.filter((c) => !repeatedGroupKeys.includes(c)),
    [columns, repeatedGroupKeys],
  );

  // Tables aplaties pour chaque groupe répété.
  const groupTables = useMemo(() => {
    const out: Record<string, { rows: Row[]; columns: string[] }> = {};
    for (const gk of repeatedGroupKeys) {
      const gRows: Row[] = [];
      rows.forEach((parent, parentIdx) => {
        const arr = parent[gk];
        if (!Array.isArray(arr)) return;
        arr.forEach((it, itIdx) => {
          if (!it || typeof it !== "object" || Array.isArray(it)) return;
          const flat = flattenSubmission(it as Row);
          gRows.push({
            _parent: parentIdx + 1,
            _parent_id: (parent as Row)["_id"] ?? "",
            _index: itIdx + 1,
            ...flat,
          });
        });
      });
      const colSet = new Set<string>();
      gRows.forEach((r) => Object.keys(r).forEach((k) => colSet.add(k)));
      const meta = ["_parent", "_parent_id", "_index"];
      const others = Array.from(colSet).filter(
        (c) => !meta.includes(c) && (showAllColumns || !isHidden(c)),
      );
      out[gk] = { rows: gRows, columns: [...meta, ...others] };
    }
    return out;
  }, [rows, repeatedGroupKeys, showAllColumns]);

  const filterRows = (rs: Row[], cols: string[]): Row[] => {
    if (!search.trim()) return rs;
    const q = search.trim().toLowerCase();
    return rs.filter((r) =>
      cols.some((c) => formatCell(r[c]).toLowerCase().includes(q)),
    );
  };

  const filteredRows = useMemo(
    () => filterRows(rows, principalColumns),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, principalColumns, search],
  );

  // ─── ColumnDefs TanStack ──────────────────────────────────
  const buildColumns = (cols: string[]): ColumnDef<Row, unknown>[] =>
    cols.map((key) => ({
      id: key,
      accessorFn: (row: Row) => row[key],
      header: () => <span title={key}>{shortLabel(key)}</span>,
      cell: ({ getValue }) => {
        const v = getValue();
        const text = formatCell(v);
        return (
          <span className="block truncate" title={text}>
            {text}
          </span>
        );
      },
      sortingFn: (a, b) => {
        const va = a.getValue(key);
        const vb = b.getValue(key);
        const sa = formatCell(va);
        const sb = formatCell(vb);
        const na = Number(sa);
        const nb = Number(sb);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return sa.localeCompare(sb, undefined, { numeric: true });
      },
    }));

  const principalColumnDefs = useMemo(
    () => buildColumns(principalColumns),
    [principalColumns],
  );

  const exportCsv = () => {
    const csv = toCsv(filteredRows, principalColumns);
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const formName =
      forms.find((f) => f.uid === selected)?.name ?? selected ?? "donnees";
    a.href = url;
    a.download = `${formName.replace(/[^a-z0-9_-]+/gi, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSuperadmin(user)) {
    return <Navigate to="/dashboard" replace />;
  }

  const currentForm = forms.find((f) => f.uid === selected);

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
          <Database className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tableau des données</h1>
          <p className="text-sm text-muted-foreground">
            Consultation des soumissions brutes des formulaires KoboToolbox configurés.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sélection du formulaire</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <Select
            value={selected}
            onValueChange={(v) => setSelected(v)}
            disabled={loadingForms || forms.length === 0}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  loadingForms ? "Chargement..." : "Choisir un formulaire"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {forms.map((f) => (
                <SelectItem key={f.uid} value={f.uid}>
                  {f.key ? `${f.key} — ` : ""}
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Rechercher dans la table..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:w-64"
          />

          <Button
            variant="outline"
            onClick={() => loadSubmissions(selected)}
            disabled={!selected || loadingRows}
          >
            {loadingRows ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Rafraîchir
          </Button>

          <Button
            variant="default"
            onClick={exportCsv}
            disabled={filteredRows.length === 0}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="space-y-1">
            <CardTitle className="text-base">
              {currentForm?.name ?? "Aucun formulaire"}
            </CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">
                {rows.length} ligne(s)
              </Badge>
              <Badge variant="outline">{principalColumns.length} colonnes</Badge>
              {repeatedGroupKeys.length > 0 && (
                <Badge variant="outline">
                  {repeatedGroupKeys.length} groupe(s) répété(s)
                </Badge>
              )}
              {currentForm?.key && (
                <Badge variant="outline">clé : {currentForm.key}</Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAllColumns((v) => !v)}
          >
            {showAllColumns ? "Masquer colonnes internes" : "Afficher toutes les colonnes"}
          </Button>
        </CardHeader>
        <CardContent className="p-3">
          {loadingRows ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement des
              soumissions...
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Aucune donnée à afficher.
            </div>
          ) : repeatedGroupKeys.length === 0 ? (
            <DataTable<Row>
              data={rows}
              columns={principalColumnDefs}
              globalFilter={search}
            />
          ) : (
            <Tabs defaultValue="__principal__" className="w-full">
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
                <TabsTrigger value="__principal__">
                  Principal
                  <Badge variant="secondary" className="ml-2">
                    {rows.length}
                  </Badge>
                </TabsTrigger>
                {repeatedGroupKeys.map((gk) => {
                  const gt = groupTables[gk];
                  return (
                    <TabsTrigger key={gk} value={gk} title={gk}>
                      {shortLabel(gk)}
                      <Badge variant="secondary" className="ml-2">
                        {gt.rows.length}
                      </Badge>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              <TabsContent value="__principal__" className="mt-3">
                <DataTable<Row>
                  data={rows}
                  columns={principalColumnDefs}
                  globalFilter={search}
                />
              </TabsContent>
              {repeatedGroupKeys.map((gk) => {
                const gt = groupTables[gk];
                return (
                  <TabsContent key={gk} value={gk} className="mt-3">
                    <DataTable<Row>
                      data={gt.rows}
                      columns={buildColumns(gt.columns)}
                      globalFilter={search}
                    />
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
