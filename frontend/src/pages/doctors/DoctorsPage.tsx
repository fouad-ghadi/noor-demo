/**
 * Liste des médecins : recherche + filtres (ville, territoire, spécialité, segment, ciblage,
 * statut de prescription, dernière visite).
 *
 * Les filtres sont stockés dans l'URL (?segment=A&city=Rabat...) : on peut
 * partager un lien filtré, et le bouton « retour » conserve les filtres.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Phone, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api, type DoctorFilters } from "@/api/client";
import type { DoctorListItem } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { FrequencyBadge, SegmentBadge } from "@/components/shared/badges";
import { NextVisit } from "@/components/shared/NextVisit";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMeta, useProducts, useTeamUsers } from "@/hooks/queries";
import { useDebounce } from "@/hooks/useDebounce";
import { LAST_VISIT_FILTERS, PRESCRIBING } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ALL = "all"; // valeur « Tous » des listes déroulantes (Radix n'accepte pas "")
const FILTER_KEYS = [
  "city",
  "territory",
  "specialty",
  "segment",
  "frequency",
  "last_visit",
  "product_id",
  "prescribing_status",
  "delegue_id",
] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

/** Texte + couleur de la « dernière visite » (rouge si > 60 j, orange si > 30 j). */
function LastVisit({ days }: { days: number | null }) {
  if (days === null) return <span className="font-medium text-rose-700">Jamais visité</span>;
  const color = days > 60 ? "font-medium text-rose-700" : days > 30 ? "font-medium text-amber-700" : "text-ink";
  return (
    <span className={cn("tabular", color)}>
      {days === 0 ? "Aujourd'hui" : `il y a ${days} j`}
    </span>
  );
}

/** Une liste déroulante de filtre avec l'option « Tous ». */
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Tous</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DoctorsPage() {
  usePageContext({ page: "doctors", title: "Liste des médecins" });
  const { isSupervisor } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debouncedSearch = useDebounce(search);

  const meta = useMeta();
  const products = useProducts();
  const team = useTeamUsers();

  const get = (key: FilterKey) => params.get(key) ?? "";
  const setFilter = (key: FilterKey, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Le statut de prescription n'a de sens qu'avec un produit
    if (key === "product_id" && !value) next.delete("prescribing_status");
    setParams(next, { replace: true });
  };
  const activeCount = FILTER_KEYS.filter((k) => params.get(k)).length;
  const clearAll = () => {
    setSearch("");
    setParams({}, { replace: true });
  };

  const filters: DoctorFilters = {
    search: debouncedSearch || undefined,
    city: get("city") || undefined,
    specialty: get("specialty") || undefined,
    segment: get("segment") || undefined,
    frequency: get("frequency") || undefined,
    territory: get("territory") || undefined,
    last_visit: get("last_visit") || undefined,
    product_id: get("product_id") ? Number(get("product_id")) : undefined,
    prescribing_status: get("prescribing_status") || undefined,
    delegue_id: get("delegue_id") ? Number(get("delegue_id")) : undefined,
  };
  const doctors = useQuery({ queryKey: ["doctors", filters], queryFn: () => api.doctors(filters) });

  // Tri côté navigateur : par nom (défaut) ou par ancienneté de la dernière visite
  const [sort, setSort] = useState<"name" | "last_visit">("name");
  const sorted = useMemo(() => {
    const list = [...(doctors.data ?? [])];
    if (sort === "last_visit") {
      list.sort((a, b) => (b.days_since_last_visit ?? 9999) - (a.days_since_last_visit ?? 9999));
    }
    return list;
  }, [doctors.data, sort]);

  const filterFields = (
    <>
      {isSupervisor && (
        <FilterSelect
          label="Délégué"
          value={get("delegue_id")}
          onChange={(v) => setFilter("delegue_id", v)}
          options={(team.data ?? []).map((u) => ({ value: String(u.id), label: `${u.name} (${u.region})` }))}
        />
      )}
      <FilterSelect
        label="Ville"
        value={get("city")}
        onChange={(v) => setFilter("city", v)}
        options={(meta.data?.cities ?? []).map((c) => ({ value: c, label: c }))}
      />
      <FilterSelect
        label="Territoire"
        value={get("territory")}
        onChange={(v) => setFilter("territory", v)}
        options={(meta.data?.territories ?? []).map((t) => ({ value: t, label: t }))}
      />
      <FilterSelect
        label="Spécialité"
        value={get("specialty")}
        onChange={(v) => setFilter("specialty", v)}
        options={(meta.data?.specialties ?? []).map((s) => ({ value: s, label: s }))}
      />
      <FilterSelect
        label="Segment"
        value={get("segment")}
        onChange={(v) => setFilter("segment", v)}
        options={[
          { value: "A", label: "A — fort potentiel" },
          { value: "B", label: "B — potentiel moyen" },
          { value: "C", label: "C — faible potentiel" },
        ]}
      />
      <FilterSelect
        label="Ciblage"
        value={get("frequency")}
        onChange={(v) => setFilter("frequency", v)}
        options={[
          { value: "cible", label: "Ciblés (F1 et F2)" },
          { value: "F2", label: "F2, deux visites par mois" },
          { value: "F1", label: "F1, une visite par mois" },
          { value: "hors_cible", label: "Hors cible" },
        ]}
      />
      <FilterSelect
        label="Dernière visite"
        value={get("last_visit")}
        onChange={(v) => setFilter("last_visit", v)}
        options={Object.entries(LAST_VISIT_FILTERS).map(([value, label]) => ({ value, label }))}
      />
      <FilterSelect
        label="Produit"
        value={get("product_id")}
        onChange={(v) => setFilter("product_id", v)}
        options={(products.data ?? []).map((p) => ({ value: String(p.id), label: p.brand_name }))}
      />
      <div className={cn(!get("product_id") && "pointer-events-none opacity-50")}>
        <FilterSelect
          label="Statut de prescription"
          value={get("prescribing_status")}
          onChange={(v) => setFilter("prescribing_status", v)}
          options={Object.entries(PRESCRIBING).map(([value, p]) => ({ value, label: p.label }))}
        />
      </div>
    </>
  );

  return (
    <>
      <PageHeader
        title="Médecins"
        description={
          doctors.data
            ? `${doctors.data.length} médecin${doctors.data.length > 1 ? "s" : ""}${activeCount || debouncedSearch ? " correspondant aux filtres" : isSupervisor ? " dans l'équipe" : " dans votre portefeuille"}`
            : "Chargement…"
        }
        actions={
          <Button asChild>
            <Link to="/medecins/nouveau">
              <Plus /> Nouveau médecin
            </Link>
          </Button>
        }
      />

      {/* Barre de recherche + bouton filtres (mobile) */}
      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              const next = new URLSearchParams(params);
              if (e.target.value) next.set("search", e.target.value);
              else next.delete("search");
              setParams(next, { replace: true });
            }}
            placeholder="Nom, quartier, téléphone…"
            className="pl-9"
          />
        </div>
        <Button variant="outline" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
          <SlidersHorizontal /> Filtres
          {activeCount > 0 && <Badge className="ml-1 size-5 rounded-full p-0">{activeCount}</Badge>}
        </Button>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="hidden w-52 lg:flex">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Trier par nom</SelectItem>
            <SelectItem value="last_visit">Trier par dernière visite</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Filtres : en ligne sur ordinateur, dans un panneau sur mobile */}
      <div className="border-line mb-5 hidden rounded-xl border bg-white p-4 lg:block">
        {/* Grille auto : autant de colonnes de 10rem que la largeur le permet */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">{filterFields}</div>
        {activeCount > 0 && (
          <Button variant="link" size="sm" className="mt-2 h-auto px-0" onClick={clearAll}>
            <X /> Effacer les filtres
          </Button>
        )}
      </div>
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Filtres</SheetTitle>
          </SheetHeader>
          <div className="grid gap-3 overflow-y-auto px-4">{filterFields}</div>
          <div className="flex gap-2 border-t p-4">
            <Button variant="outline" className="flex-1" onClick={clearAll}>
              Effacer
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              Voir {doctors.data?.length ?? ""} médecins
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {doctors.isLoading && <LoadingState />}
      {doctors.isError && <ErrorState error={doctors.error} onRetry={() => doctors.refetch()} />}
      {doctors.data && sorted.length === 0 && (
        <EmptyState title="Aucun médecin trouvé" description="Modifiez la recherche ou les filtres." />
      )}

      {sorted.length > 0 && (
        <>
          {/* Ordinateur : tableau */}
          <Card className="hidden overflow-hidden py-0 lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Médecin</TableHead>
                  <TableHead>Localisation</TableHead>
                  <TableHead>Prescrit régulièrement</TableHead>
                  <TableHead>Dernière visite</TableHead>
                  <TableHead>Prochaine visite</TableHead>
                  {isSupervisor && <TableHead>Délégué</TableHead>}
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((d) => (
                  <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate(`/medecins/${d.id}`)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <SegmentBadge segment={d.segment} />
                        <div>
                          <p className="text-ink flex items-center gap-2 font-medium">
                            Dr {d.first_name} {d.last_name}
                            <FrequencyBadge frequency={d.frequency} />
                          </p>
                          <p className="text-muted-foreground text-xs">{d.specialty}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{d.territory}</p>
                      <p className="text-muted-foreground text-xs">{d.district}</p>
                    </TableCell>
                    <TableCell className="max-w-56 text-sm whitespace-normal">
                      {d.regular_products.length === 0 ? (
                        <span className="text-muted-foreground">Aucun</span>
                      ) : (
                        d.regular_products.join(", ")
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <LastVisit days={d.days_since_last_visit} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <NextVisit at={d.next_visit_at} />
                    </TableCell>
                    {isSupervisor && <TableCell className="text-sm">{d.delegue_name}</TableCell>}
                    <TableCell>
                      <ChevronRight className="text-muted-foreground size-4" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile : une seule feuille, une ligne par médecin */}
          <div className="divide-line border-line divide-y overflow-hidden rounded-xl border bg-white lg:hidden">
            {sorted.map((d) => (
              <DoctorCard key={d.id} doctor={d} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function DoctorCard({ doctor: d }: { doctor: DoctorListItem }) {
  // Toute la ligne est cliquable grâce à un lien « étiré » (absolute inset-0) ;
  // le bouton « Appeler » est placé au-dessus (z-10) : pas de lien imbriqué dans un lien.
  return (
    <div className="active:bg-mint-wash/60 relative px-4 py-3">
      <Link to={`/medecins/${d.id}`} className="absolute inset-0" aria-label={`Dr ${d.first_name} ${d.last_name}`} />
      <div className="flex items-start gap-3">
        <SegmentBadge segment={d.segment} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-ink flex min-w-0 items-center gap-2 font-medium">
            <span className="truncate">
              Dr {d.first_name} {d.last_name}
            </span>
            <FrequencyBadge frequency={d.frequency} />
          </p>
          <p className="text-muted-foreground truncate text-[13px]">
            {d.specialty}, {d.district}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
            <span className="text-muted-foreground">
              {d.days_since_last_visit !== null && "Vu "}
              <LastVisit days={d.days_since_last_visit} />
            </span>
            {d.next_visit_at && (
              <span className="text-muted-foreground">
                Prochaine : <NextVisit at={d.next_visit_at} className="text-ink" />
              </span>
            )}
          </div>
        </div>
        {d.phone && (
          <a
            href={`tel:${d.phone.replace(/[^\d+]/g, "")}`}
            className="bg-mint-wash text-pine relative z-10 rounded-full p-2.5"
            aria-label={`Appeler Dr ${d.last_name}`}
          >
            <Phone className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}
