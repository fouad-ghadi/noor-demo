/**
 * Formulaire de création / modification d'un médecin.
 * - /medecins/nouveau          → création
 * - /medecins/:id/modifier     → modification
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { DoctorInput, PrescribingStatus } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { AiFeatureButton } from "@/components/ai/AiFeatureButton";
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
import { PRACTICE_TYPE, PRESCRIBING, TIME_SLOT } from "@/lib/labels";

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
  preferred_slot: "matin",
  notes: "",
  prescriptions: [],
};

/** Champ de formulaire : libellé + contenu. */
function Field({ label, htmlFor, children, required }: { label: string; htmlFor?: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label} {required && <span className="text-rose-600">*</span>}
      </Label>
      {children}
    </div>
  );
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

export function DoctorFormPage() {
  const params = useParams();
  const editId = params.id ? Number(params.id) : null;
  const isEdit = editId !== null;
  const navigate = useNavigate();
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
      preferred_slot: d.preferred_slot,
      notes: d.notes ?? "",
    });
    setPrescriptions(Object.fromEntries(d.prescriptions.map((p) => [p.product_id, p.status])));
  }, [existing.data]);

  const set = <K extends keyof DoctorInput>(key: K, value: DoctorInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  // Villes proposées : celles connues par le référentiel (toutes régions)
  const cities = Object.keys(meta.data?.districts ?? {}).sort();
  const districts = meta.data?.districts[form.city] ?? [];

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
      return api.createDoctor({ ...payload, delegue_id: isSupervisor ? Number(delegueId) : undefined, source: "manuel" });
    },
    onSuccess: (doctor) => {
      queryClient.invalidateQueries({ queryKey: ["doctors"] });
      queryClient.invalidateQueries({ queryKey: ["doctor"] });
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
        {/* ═══ POINT D'EXTENSION IA : scan de carte de visite (backend/app/ai/card_scanner.py) ═══
            Plus tard : photo → aiApi.scanCard(image) → pré-remplir le formulaire (source =
            "carte_de_visite") et afficher les doublons possibles avant d'enregistrer. */}
        {!isEdit && (
          <div className="bg-pine flex flex-col gap-3 rounded-xl p-4 text-white sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <p className="text-[15px] text-[#CFEDE7]">
              Vous avez sa carte de visite ? Photographiez-la : NOOR remplira la fiche et vérifiera les doublons.
            </p>
            <AiFeatureButton
              icon="📷"
              label="Scanner une carte de visite"
              description="Prenez la carte en photo : la fiche est pré-remplie et NOOR signale si le médecin existe déjà (ex. « Ouazzani » / « Wazzani »)."
              className="shrink-0"
            />
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Identité</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" htmlFor="first_name" required>
              <Input id="first_name" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} required />
            </Field>
            <Field label="Nom" htmlFor="last_name" required>
              <Input id="last_name" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} required />
            </Field>
            <Field label="Spécialité" required>
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
            <Field label="Adresse" htmlFor="address" required>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="Ex. 45, Bd Zerktouni"
                required
              />
            </Field>
            <Field label="Ville" required>
              <SimpleSelect
                value={form.city}
                placeholder="Choisir une ville"
                onChange={(v) => setForm((f) => ({ ...f, city: v, district: "" }))}
                options={Object.fromEntries((form.city && !cities.includes(form.city) ? [form.city, ...cities] : cities).map((c) => [c, c]))}
              />
            </Field>
            <Field label="Quartier" required>
              <SimpleSelect
                value={form.district}
                placeholder={form.city ? "Choisir un quartier" : "Choisissez d'abord la ville"}
                onChange={(v) => {
                  // Position GPS approximative = centre du quartier (pour la carte du planning)
                  const place = districts.find((x) => x.name === v);
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
            {isEdit ? "Enregistrer" : "Créer le médecin"}
          </Button>
        </div>
      </form>
    </div>
  );
}
