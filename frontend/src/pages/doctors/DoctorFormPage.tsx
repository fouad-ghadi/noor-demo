/**
 * Formulaire de création / modification d'un médecin.
 * - /medecins/nouveau          → création (avec scan de carte de visite et détection des doublons)
 * - /medecins/:id/modifier     → modification (ou « compléter la fiche » avec une carte scannée)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitMerge, Loader2, Save } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { aiApi, type CardFields, type CardScanResult, type DuplicateMatch, type MergeProposal } from "@/api/ai";
import { api } from "@/api/client";
import type { DoctorInput, PrescribingStatus } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { AiFeatureButton } from "@/components/ai/AiFeatureButton";
import { CardScanDialog } from "@/components/doctors/CardScanDialog";
import { DuplicatePanel } from "@/components/doctors/DuplicatePanel";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMeta, useProducts, useTeamUsers } from "@/hooks/queries";
import { useDebounce } from "@/hooks/useDebounce";
import { PRACTICE_TYPE, PRESCRIBING, TIME_SLOT } from "@/lib/labels";
import { cn } from "@/lib/utils";

const EMPTY: DoctorInput = {
  first_name: "",
  last_name: "",
  specialty: "Généraliste",
  practice_type: "cabinet",
  address: "",
  city: "",
  district: "",
  phone: "",
  email: "",
  latitude: null,
  longitude: null,
  segment: "B",
  // Nouvelle fiche : hors cible tant que le superviseur ne l'a pas ciblée (ciblage en janvier et juillet)
  frequency: null,
  preferred_slot: "matin",
  patients_per_day: null,
  reception_days: null,
  notes: "",
  prescriptions: [],
};

/**
 * Jours où le médecin reçoit les délégués (lun. → sam.). Aucun jour coché = tous les jours.
 * Stocké comme "1,3" (0 = lundi) ; sert à « Remplir ma semaine ».
 */
function ReceptionDays({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const days = new Set((value ?? "").split(",").filter(Boolean));
  const toggle = (d: string) => {
    const next = new Set(days);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    onChange(next.size ? [...next].sort().join(",") : null);
  };
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Jours de réception">
      {["lun.", "mar.", "mer.", "jeu.", "ven.", "sam."].map((label, i) => {
        const on = days.has(String(i));
        return (
          <button
            key={label}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(String(i))}
            className={cn(
              "h-9 rounded-lg border px-3 text-sm transition-colors",
              on ? "bg-pine border-pine text-white" : "border-line text-ink hover:bg-mint-wash/60 bg-white",
            )}
          >
            {label}
          </button>
        );
      })}
      {days.size === 0 && <span className="text-muted-foreground self-center text-xs">Tous les jours</span>}
    </div>
  );
}

/** Champ de formulaire : libellé + contenu. `uncertain` : champ deviné sur la carte, à vérifier. */
function Field({ label, htmlFor, children, required, uncertain }: { label: string; htmlFor?: string; children: React.ReactNode; required?: boolean; uncertain?: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label} {required && <span className="text-rose-600">*</span>}
        {uncertain && <span className="ml-1 rounded bg-amber-100 px-1.5 py-px text-[11px] font-medium text-amber-800">à vérifier</span>}
      </Label>
      {children}
    </div>
  );
}

/** Message d'arrivée sur la page de modification depuis « Compléter cette fiche ». */
interface MergeState {
  cardMerge?: CardFields;
}

/** Liste déroulante simple à partir d'un objet {valeur: libellé}. */
function SimpleSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string>;
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {Object.entries(options).map(([v, label]) => (
          <SelectItem key={v} value={v}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * La page est « remise à zéro » quand on passe de la création à la modification
 * (ex. « Compléter cette fiche ») : sinon l'état du scan resterait affiché.
 */
export function DoctorFormPage() {
  const params = useParams();
  return <DoctorForm key={params.id ?? "nouveau"} />;
}

function DoctorForm() {
  const params = useParams();
  const editId = params.id ? Number(params.id) : null;
  const isEdit = editId !== null;
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { isSupervisor } = useAuth();

  usePageContext({ page: "doctor_form", title: isEdit ? "Modification d'un médecin" : "Nouveau médecin", doctorId: editId ?? undefined });

  const meta = useMeta();
  const products = useProducts();
  const team = useTeamUsers();
  const existing = useQuery({ queryKey: ["doctor", editId], queryFn: () => api.doctor(editId!), enabled: isEdit });

  const [form, setForm] = useState<DoctorInput>(EMPTY);
  const [prescriptions, setPrescriptions] = useState<Record<number, PrescribingStatus>>({});
  const [delegueId, setDelegueId] = useState<string>("");
  // Scan de carte de visite (création)
  const [scanOpen, setScanOpen] = useState(false);
  const [scan, setScan] = useState<{ result: CardScanResult; image: string } | null>(null);
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [dismissedIds, setDismissedIds] = useState<number[]>([]);
  // Fusion avec une carte (modification)
  const [merge, setMerge] = useState<MergeProposal | null>(null);
  const mergeStarted = useRef(false);

  // En modification : on pré-remplit le formulaire avec la fiche existante
  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setForm({
      first_name: d.first_name,
      last_name: d.last_name,
      specialty: d.specialty,
      practice_type: d.practice_type,
      address: d.address,
      city: d.city,
      district: d.district,
      phone: d.phone ?? "",
      email: d.email ?? "",
      latitude: d.latitude,
      longitude: d.longitude,
      segment: d.segment,
      frequency: d.frequency,
      preferred_slot: d.preferred_slot,
      patients_per_day: d.patients_per_day ?? null,
      reception_days: d.reception_days ?? null,
      notes: d.notes ?? "",
    });
    setPrescriptions(Object.fromEntries(d.prescriptions.map((p) => [p.product_id, p.status])));

    // « Compléter cette fiche » depuis une carte scannée : on propose la fiche fusionnée
    const card = (location.state as MergeState | null)?.cardMerge;
    if (card && !mergeStarted.current) {
      mergeStarted.current = true;
      aiApi
        .mergeCard(d.id, card)
        .then((proposal) => {
          setMerge(proposal);
          setForm((f) => ({ ...f, ...proposal.fields, phone: proposal.fields.phone ?? "", email: proposal.fields.email ?? "", notes: proposal.fields.notes ?? "" }));
        })
        .catch((e: Error) => toast.error(e.message));
    }
  }, [existing.data, location.state]);

  const set = <K extends keyof DoctorInput>(key: K, value: DoctorInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setUncertain((u) => u.filter((k) => k !== key)); // champ corrigé : plus « à vérifier »
  };

  // Villes proposées : celles connues par le référentiel (toutes régions)
  const cities = Object.keys(meta.data?.districts ?? {}).sort();
  const districts = meta.data?.districts[form.city] ?? [];

  // Doublons possibles, recalculés pendant la saisie (création seulement)
  const identity = useDebounce(
    { first_name: form.first_name, last_name: form.last_name, phone: form.phone, email: form.email, city: form.city, address: form.address },
    400,
  );
  const canCheck = identity.last_name.trim().length >= 2 || (identity.phone ?? "").replace(/\D/g, "").length >= 9 || !!identity.email;
  const duplicates = useQuery({
    queryKey: ["duplicates", identity],
    queryFn: () => aiApi.duplicates({ ...identity, phone: identity.phone || null, email: identity.email || null }),
    enabled: !isEdit && canCheck,
    staleTime: 30_000,
  });
  const visibleDuplicates = useMemo(
    () => (canCheck ? (duplicates.data ?? []).filter((m) => !dismissedIds.includes(m.doctor_id)) : []),
    [duplicates.data, dismissedIds, canCheck],
  );
  const strongDuplicate = visibleDuplicates.some((m) => m.level !== "possible");

  /** Remplit le formulaire avec ce qui a été lu sur la carte. */
  const applyScan = (result: CardScanResult, image: string) => {
    const c = result.doctor;
    const place = c.city && c.district ? meta.data?.districts[c.city]?.find((x) => x.name === c.district) : undefined;
    setForm((f) => ({
      ...f,
      first_name: c.first_name || f.first_name,
      last_name: c.last_name || f.last_name,
      specialty: c.specialty && meta.data?.specialties.includes(c.specialty) ? c.specialty : f.specialty,
      practice_type: (c.practice_type as DoctorInput["practice_type"]) || f.practice_type,
      address: c.address || f.address,
      city: c.city || f.city,
      district: c.district || (c.city && c.city !== f.city ? "" : f.district),
      latitude: place?.latitude ?? f.latitude,
      longitude: place?.longitude ?? f.longitude,
      phone: c.phone || f.phone,
      email: c.email || f.email,
    }));
    setScan({ result, image });
    setUncertain(result.uncertain_fields);
    setDismissedIds([]);
    toast.success("Fiche pré-remplie depuis la carte", { description: "Relisez les champs avant d'enregistrer." });
  };

  /** « Compléter cette fiche » : on part sur la fiche existante, complétée par ce qui a été saisi ici. */
  const mergeInto = (m: DuplicateMatch) => {
    const card: CardFields = {
      first_name: form.first_name,
      last_name: form.last_name,
      specialty: form.specialty,
      practice_type: form.practice_type,
      address: form.address,
      city: form.city || null,
      district: form.district || null,
      phone: form.phone || null,
      email: form.email || null,
    };
    navigate(`/medecins/${m.doctor_id}/modifier`, { state: { cardMerge: card } satisfies MergeState });
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload: DoctorInput = {
        ...form,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
        prescriptions: Object.entries(prescriptions).map(([product_id, status]) => ({
          product_id: Number(product_id),
          status,
        })),
      };
      if (isEdit) return api.updateDoctor(editId, payload);
      return api.createDoctor({
        ...payload,
        delegue_id: isSupervisor ? Number(delegueId) : undefined,
        source: scan ? "carte_de_visite" : "manuel",
      });
    },
    onSuccess: (doctor) => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      queryClient.invalidateQueries({ queryKey: ["doctor"] });
      queryClient.invalidateQueries({ queryKey: ["duplicates"] });
      toast.success(isEdit ? "Fiche mise à jour" : "Médecin créé", {
        description: `Dr ${doctor.first_name} ${doctor.last_name}`,
      });
      navigate(`/medecins/${doctor.id}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isEdit && existing.isLoading) return <LoadingState />;
  if (isEdit && existing.isError) return <ErrorState error={existing.error} />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        backTo={isEdit ? `/medecins/${editId}` : "/medecins"}
        title={isEdit ? `Modifier Dr ${existing.data?.first_name} ${existing.data?.last_name}` : "Nouveau médecin"}
        description={isEdit ? "Mettez à jour la fiche du médecin." : `Le médecin sera ajouté ${isSupervisor ? "au portefeuille du délégué choisi" : "à votre portefeuille"}.`}
      />

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.city || !form.district) return toast.error("Choisissez la ville et le quartier");
          if (!isEdit && isSupervisor && !delegueId) return toast.error("Choisissez le délégué responsable");
          mutation.mutate();
        }}
      >
        {/* 📷 IA : scan de carte de visite (backend/app/ai/card_scanner.py) */}
        {!isEdit && (
          <div className="bg-pine flex flex-col gap-3 rounded-xl p-4 text-white sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <p className="text-[15px] text-[#CFEDE7]">
              {scan
                ? "Fiche remplie depuis la carte de visite. Relisez chaque champ, surtout ceux marqués « à vérifier »."
                : "Vous avez sa carte de visite ? Photographiez-la : NOOR remplira la fiche et vérifiera les doublons."}
            </p>
            <AiFeatureButton
              icon="📷"
              label={scan ? "Scanner une autre carte" : "Scanner une carte de visite"}
              description="Prenez la carte en photo : la fiche est pré-remplie et NOOR signale si le médecin existe déjà (ex. « Ouazzani » / « Wazzani »)."
              enabled
              onClick={() => setScanOpen(true)}
              className="shrink-0"
            />
          </div>
        )}
        {!isEdit && <CardScanDialog open={scanOpen} onOpenChange={setScanOpen} onResult={applyScan} />}

        {scan && (
          <details className="border-line rounded-xl border bg-white px-4 py-3 text-sm">
            <summary className="text-ink cursor-pointer font-medium">
              Ce que NOOR a lu sur la carte{" "}
              <span className="text-muted-foreground font-normal">
                ({scan.result.method === "claude" ? "lecture par Claude" : "lecture du texte dans le navigateur, puis règles"})
              </span>
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-[200px_1fr]">
              <img src={scan.image} alt="Carte de visite scannée" className="border-line w-full rounded-md border object-contain" />
              <pre className="bg-paper text-ink rounded-md p-3 font-sans text-[13px] whitespace-pre-wrap">{scan.result.raw_text}</pre>
            </div>
          </details>
        )}

        {!isEdit && (
          <DuplicatePanel
            matches={visibleDuplicates}
            onMerge={mergeInto}
            onDismiss={() => setDismissedIds((ids) => [...ids, ...visibleDuplicates.map((m) => m.doctor_id)])}
          />
        )}

        {/* Modification arrivée par « Compléter cette fiche » : ce qui change */}
        {merge && (
          <section className="border-pine/30 bg-mint-wash/60 rounded-xl border px-5 py-4">
            <h2 className="font-display text-ink flex items-center gap-2 text-[17px] font-semibold">
              <GitMerge className="text-pine size-4" /> Fiche complétée avec la carte de visite
            </h2>
            {merge.changes.length === 0 ? (
              <p className="text-ink mt-1 text-sm">La carte n'apporte rien de nouveau : la fiche est déjà à jour.</p>
            ) : (
              <>
                <p className="text-muted-foreground mt-1 text-sm">Rien n'est encore enregistré. Relisez, puis cliquez sur « Enregistrer ».</p>
                <ul className="mt-3 space-y-1 text-sm">
                  {merge.changes.map((c) => (
                    <li key={c.field} className="text-ink">
                      <span className="font-medium">{c.label}</span>
                      {c.action === "ajout" && <> ajouté : {c.new}</>}
                      {c.action === "remplacement" && <> : {c.old} remplacé par {c.new}</>}
                      {c.action === "conserve" && <> gardé ({c.old}) ; la carte écrit « {c.new} », noté dans les notes</>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Identité</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" htmlFor="first_name" required uncertain={uncertain.includes("first_name")}>
              <Input id="first_name" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} required />
            </Field>
            <Field label="Nom" htmlFor="last_name" required uncertain={uncertain.includes("last_name")}>
              <Input id="last_name" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} required />
            </Field>
            <Field label="Spécialité" required uncertain={uncertain.includes("specialty")}>
              <SimpleSelect
                value={form.specialty}
                onChange={(v) => set("specialty", v)}
                options={Object.fromEntries((meta.data?.specialties ?? []).map((s) => [s, s]))}
              />
            </Field>
            <Field label="Segment (potentiel)" required>
              <SimpleSelect
                value={form.segment}
                onChange={(v) => set("segment", v as DoctorInput["segment"])}
                options={{ A: "A — fort potentiel", B: "B — potentiel moyen", C: "C — faible potentiel" }}
              />
            </Field>
            <Field label="Ciblage (fréquence de visite)">
              <SimpleSelect
                value={form.frequency ?? "hors_cible"}
                onChange={(v) => set("frequency", v === "hors_cible" ? null : (v as DoctorInput["frequency"]))}
                options={{ F2: "F2, deux visites par mois", F1: "F1, une visite par mois", hors_cible: "Hors cible" }}
              />
            </Field>
            {!isEdit && isSupervisor && (
              <Field label="Délégué responsable" required>
                <SimpleSelect
                  value={delegueId}
                  onChange={setDelegueId}
                  placeholder="Choisir un délégué"
                  options={Object.fromEntries((team.data ?? []).map((u) => [String(u.id), `${u.name} (${u.region})`]))}
                />
              </Field>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lieu d'exercice</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Type d'exercice" required>
              <SimpleSelect
                value={form.practice_type}
                onChange={(v) => set("practice_type", v as DoctorInput["practice_type"])}
                options={PRACTICE_TYPE}
              />
            </Field>
            <Field label="Adresse" htmlFor="address" required uncertain={uncertain.includes("address")}>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="Ex. 45, Bd Zerktouni"
                required
              />
            </Field>
            <Field label="Ville" required uncertain={uncertain.includes("city")}>
              <SimpleSelect
                value={form.city}
                placeholder="Choisir une ville"
                onChange={(v) => {
                  setForm((f) => ({ ...f, city: v, district: "" }));
                  setUncertain((u) => u.filter((k) => k !== "city"));
                }}
                options={Object.fromEntries((form.city && !cities.includes(form.city) ? [form.city, ...cities] : cities).map((c) => [c, c]))}
              />
            </Field>
            <Field label="Quartier" required uncertain={uncertain.includes("district")}>
              <SimpleSelect
                value={form.district}
                placeholder={form.city ? "Choisir un quartier" : "Choisissez d'abord la ville"}
                onChange={(v) => {
                  // Position GPS approximative = centre du quartier (pour la carte du planning)
                  const place = districts.find((x) => x.name === v);
                  setUncertain((u) => u.filter((k) => k !== "district"));
                  setForm((f) => ({
                    ...f,
                    district: v,
                    latitude: place?.latitude ?? f.latitude,
                    longitude: place?.longitude ?? f.longitude,
                  }));
                }}
                options={Object.fromEntries(
                  (form.district && !districts.some((x) => x.name === form.district)
                    ? [{ name: form.district }, ...districts]
                    : districts
                  ).map((x) => [x.name, x.name]),
                )}
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact et visites</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Téléphone" htmlFor="phone">
              <Input
                id="phone"
                type="tel"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="05 22 00 00 00"
              />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Créneau de visite préféré">
              <SimpleSelect
                value={form.preferred_slot ?? ""}
                onChange={(v) => set("preferred_slot", v as DoctorInput["preferred_slot"])}
                options={TIME_SLOT}
              />
            </Field>
            <Field label="Patients par jour (fréquentation du cabinet)" htmlFor="patients_per_day">
              <Input
                id="patients_per_day"
                type="number"
                min={0}
                max={200}
                inputMode="numeric"
                value={form.patients_per_day ?? ""}
                onChange={(e) => set("patients_per_day", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="Ex. 25 (sert au calcul du potentiel A/B/C)"
              />
            </Field>
            <Field label="Jours de réception des délégués">
              <ReceptionDays value={form.reception_days ?? null} onChange={(v) => set("reception_days", v)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes" htmlFor="notes">
                <Textarea
                  id="notes"
                  value={form.notes ?? ""}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Ex. ne reçoit que sur rendez-vous, secrétaire Mme Naima…"
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Statut de prescription</CardTitle>
            <CardDescription>Ce que le médecin prescrit aujourd'hui, produit par produit.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {products.data?.map((p) => (
              <div key={p.id} className="border-line flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.brand_name}</p>
                  <p className="text-muted-foreground truncate text-xs">{p.molecule}</p>
                </div>
                <div className="w-40 shrink-0">
                  <SimpleSelect
                    value={prescriptions[p.id] ?? "non_prescripteur"}
                    onChange={(v) => setPrescriptions((prev) => ({ ...prev, [p.id]: v as PrescribingStatus }))}
                    options={Object.fromEntries(Object.entries(PRESCRIBING).map(([k, v]) => [k, v.label]))}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="border-line shadow-pine/10 sticky bottom-20 z-10 flex justify-end gap-2 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            Annuler
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {isEdit ? "Enregistrer" : strongDuplicate ? "Créer quand même" : "Créer le médecin"}
          </Button>
        </div>
      </form>
    </div>
  );
}
