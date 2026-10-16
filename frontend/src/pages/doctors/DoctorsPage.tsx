/**
 * Liste des médecins : recherche + filtres (ville, spécialité, segment,
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
import { SegmentBadge } from "@/components/shared/badges";
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
import { formatRelativeDay, formatShortDate } from "@/lib/format";
import { LAST_VISIT_FILTERS, PRESCRIBING } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ALL = "all"; // valeur « Tous » des listes déroulantes (Radix n'accepte pas "")
const FILTER_KEYS = ["city", "specialty", "segment", "last_visit", "product_id", "prescribing_status", "delegue_id"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

/** Texte + couleur de la « dernière visite » (rouge si > 60 j, orange si > 30 j). */
function LastVisit({ days }: { days: number | null }) {
  if (days === null) return <span className="text-sm font-medium text-rose-600">Jamais visité</span>;
  const color = days > 60 ? "text-rose-600" : days > 30 ? "text-amber-600" : "text-foreground";
  return (
    <span className={cn("tabular text-sm", color)}>
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
      <Card className="mb-5 hidden p-4 lg:block">
        {/* Grille auto : autant de colonnes de 10rem que la largeur le permet */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">{filterFields}</div>
        {activeCount > 0 && (
          <Button variant="link" size="sm" className="mt-2 h-auto px-0" onClick={clearAll}>
            <X /> Effacer les filtres
          </Button>
        )}
      </Card>
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
          <Card className="hidden py-0 lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Médecin</TableHead>
                  <TableHead>Localisation</TableHead>
                  <TableHead>Segment</TableHead>
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
                      <p className="font-medium">
                        Dr {d.first_name} {d.last_name}
                      </p>
                      <p className="text-muted-foreground text-xs">{d.specialty}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{d.city}</p>
                      <p className="text-muted-foreground text-xs">{d.district}</p>
                    </TableCell>
                    <TableCell>
                      <SegmentBadge segment={d.segment} />
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal">
                      <div className="flex flex-wrap gap-1">
                        {d.regular_products.length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                        {d.regular_products.map((p) => (
                          <Badge key={p} variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <LastVisit days={d.days_since_last_visit} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {d.next_visit_at ? formatRelativeDay(d.next_visit_at) : <span className="text-muted-foreground">—</span>}
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

          {/* Mobile : cartes */}
          <div className="space-y-2 lg:hidden">
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
  // Toute la carte est cliquable grâce à un lien « étiré » (absolute inset-0) ;
  // le bouton « Appeler » est placé au-dessus (z-10) : pas de lien imbriqué dans un lien.
  return (
    <Card className="relative gap-2 px-4 py-3 active:bg-muted/50">
      <Link to={`/medecins/${d.id}`} className="absolute inset-0 rounded-xl" aria-label={`Dr ${d.first_name} ${d.last_name}`} />
      <div className="flex items-start gap-3">
        <SegmentBadge segment={d.segment} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">
            Dr {d.first_name} {d.last_name}
          </p>
          <p className="text-muted-foreground truncate text-xs">
            {d.specialty} · {d.district}, {d.city}
          </p>
        </div>
        {d.phone && (
          <a
            href={`tel:${d.phone.replace(/[^\d+]/g, "")}`}
            className="relative z-10 rounded-full bg-teal-50 p-2 text-teal-700"
            aria-label="Appeler"
          >
            <Phone className="size-4" />
          </a>
        )}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Dernière visite : <LastVisit days={d.days_since_last_visit} />
        </span>
        {d.next_visit_at && <span className="text-teal-700">Prévue {formatShortDate(d.next_visit_at)}</span>}
      </div>
    </Card>
  );
}
