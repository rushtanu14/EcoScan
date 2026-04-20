import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, Sparkles, UploadCloud } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocationMap } from "@/components/ui/expand-map";
import FileUpload05 from "@/components/ui/file-upload-1";
import { Gallery4, Gallery4Item } from "@/components/ui/gallery4";
import { AnimatedHero } from "@/components/ui/animated-hero";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { DropFile, SketchpadDropzone } from "@/components/ui/sketchpad-dropzone";
import type { EcoPayload, SpeciesSummary } from "@/types/ecoscan";

type EvidenceMode = "none" | "guided" | "uploaded";
type ModelStatus = "fine_tuned" | "zero_shot" | "heuristic";

type EvidenceCard = {
  id: string;
  image: string;
  title: string;
  subtitle: string;
  annotation: string;
  speciesName: string;
  cellId: string;
  confidence: number;
  note: string;
  badge: string;
  actionItems: string[];
  sourceUrl: string;
};

const MODEL_STATUS_TEXT: Record<ModelStatus, { label: string; detail: string }> = {
  fine_tuned: {
    label: "Fine-tuned taxa checkpoint",
    detail: "Photo uploads are driving species classification with habitat-constrained reranking.",
  },
  zero_shot: {
    label: "Zero-shot sample fallback",
    detail: "Sample field evidence is active to keep species-risk review stable before custom uploads.",
  },
  heuristic: {
    label: "Heuristic fallback",
    detail: "No photo evidence has been analyzed yet; scoring is habitat and sensor driven.",
  },
};

const KINGDOM_IMAGE_BANK: Record<string, string[]> = {
  animal: [
    "https://images.unsplash.com/photo-1474511320723-9a56873867b5?auto=format&fit=crop&q=80&w=1200",
    "https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?auto=format&fit=crop&q=80&w=1200",
    "https://images.unsplash.com/photo-1452570053594-1b985d6ea890?auto=format&fit=crop&q=80&w=1200",
  ],
  plant: [
    "https://images.unsplash.com/photo-1462275646964-a0e3386b89fa?auto=format&fit=crop&q=80&w=1200",
    "https://images.unsplash.com/photo-1477511801984-4ad318ed9846?auto=format&fit=crop&q=80&w=1200",
    "https://images.unsplash.com/photo-1468327768560-75b778cbb551?auto=format&fit=crop&q=80&w=1200",
  ],
};

const RISK_SWATCH: Record<string, string> = {
  thriving: "rgba(74, 222, 128, 0.45)",
  stressed: "rgba(251, 191, 36, 0.5)",
  fragile: "rgba(248, 113, 113, 0.52)",
};

const THREAT_CONTENT: Record<string, { level: "Low" | "Medium" | "High"; shortLabel: string; description: string }> = {
  thriving: {
    level: "Low",
    shortLabel: "Low threat",
    description: "This hotspot is currently stable. Continue monitoring and preventive habitat protection.",
  },
  stressed: {
    level: "Medium",
    shortLabel: "Medium threat",
    description: "Stress indicators are rising. Early intervention can prevent escalation into critical pressure.",
  },
  fragile: {
    level: "High",
    shortLabel: "High threat",
    description: "Severe habitat pressure is active. Immediate restoration and species protection actions are recommended.",
  },
};

function createId(prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function titleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function toneClass(status: string) {
  if (status === "fragile") {
    return "bg-red-100 text-red-700 border-red-200";
  }
  if (status === "stressed") {
    return "bg-amber-100 text-amber-700 border-amber-200";
  }
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

function threatProfile(status: string) {
  return THREAT_CONTENT[status] || THREAT_CONTENT.thriving;
}

function coordinateLabel(lat: number, lon: number) {
  const latLabel = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
  const lonLabel = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
  return `${latLabel}, ${lonLabel}`;
}

function uniqueFiles(files: File[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function speciesGalleryItems(species: SpeciesSummary): Gallery4Item[] {
  const kingdomImages = KINGDOM_IMAGE_BANK[species.kingdom] || KINGDOM_IMAGE_BANK.animal;
  const imagePool = [species.image_asset, ...(species.example_images || []), ...kingdomImages];
  const uniqueImages = [...new Set(imagePool)].slice(0, 5);

  return uniqueImages.map((image, index) => ({
    id: `${species.common_name}-${index}`,
    title: index === 0 ? species.common_name : `${species.common_name} evidence #${index + 1}`,
    description:
      index === 0
        ? species.narrative
        : `${species.common_name} context sample with ${formatPercent(species.avg_vulnerability_score)} avg vulnerability.`,
    href: species.source_url || "#",
    image,
  }));
}

export default function App() {
  const [payload, setPayload] = useState<EcoPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState<"home" | "upload" | "species" | "sources">("home");
  const [activeSpeciesName, setActiveSpeciesName] = useState<string>("");
  const [activeCellId, setActiveCellId] = useState<string>("");
  const [speciesQuery, setSpeciesQuery] = useState("");

  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [dropFiles, setDropFiles] = useState<DropFile[]>([]);
  const [evidence, setEvidence] = useState<EvidenceCard[]>([]);
  const [evidenceMode, setEvidenceMode] = useState<EvidenceMode>("none");
  const [modelStatus, setModelStatus] = useState<ModelStatus>("heuristic");

  const objectUrlsRef = useRef<string[]>([]);

  const habitats = payload?.habitats || [];
  const speciesCatalog = payload?.species_catalog || [];
  const scanModel = payload?.scan_model || [];
  const studyArea = payload?.study_area;
  const landmarks = payload?.landmarks || [];
  const dataSources = payload?.data_sources || [];
  const sensorProfiles = payload?.sensor_profiles?.length
    ? payload.sensor_profiles
    : (payload?.sensors || []);

  const releaseObjectUrls = useCallback(() => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      releaseObjectUrls();
    };
  }, [releaseObjectUrls]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch("/api/demo-biodiversity", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        return (await response.json()) as EcoPayload;
      })
      .then((result) => {
        setPayload(result);
        if (result.habitats?.[0]) {
          setActiveCellId(result.habitats[0].cell_id);
        }
        if (result.species_catalog?.[0]) {
          setActiveSpeciesName(result.species_catalog[0].common_name);
        }
      })
      .catch((caught) => {
        if ((caught as Error).name === "AbortError") {
          return;
        }
        setError(caught instanceof Error ? caught.message : "Unknown error while loading EcoScan data.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const topHabitatForSpecies = useCallback(
    (speciesName: string) => {
      return habitats
        .map((habitat) => ({
          habitat,
          score:
            habitat.species_pressures.find((pressure) => pressure.common_name === speciesName)?.vulnerability_score ||
            habitat.risk_score,
        }))
        .sort((left, right) => right.score - left.score)[0]?.habitat;
    },
    [habitats],
  );

  const activeHabitat = useMemo(() => {
    if (!habitats.length) return null;
    return habitats.find((habitat) => habitat.cell_id === activeCellId) || habitats[0];
  }, [habitats, activeCellId]);

  const activeSpecies = useMemo(() => {
    if (!speciesCatalog.length) return null;
    return speciesCatalog.find((species) => species.common_name === activeSpeciesName) || speciesCatalog[0];
  }, [speciesCatalog, activeSpeciesName]);

  const activeScanCell = useMemo(() => {
    if (!scanModel.length) return null;
    return scanModel.find((cell) => cell.cell_id === activeCellId) || scanModel[0];
  }, [scanModel, activeCellId]);

  const activeThreat = useMemo(() => threatProfile(activeHabitat?.health_label || "thriving"), [activeHabitat]);

  const focusEvidence = useMemo(() => {
    if (!evidence.length) return [];
    const exact = evidence.filter((entry) => entry.cellId === activeCellId || entry.speciesName === activeSpeciesName);
    return exact.length ? exact : evidence;
  }, [evidence, activeCellId, activeSpeciesName]);

  const combinedActions = useMemo(() => {
    const actions = new Set<string>();
    activeHabitat?.recommended_actions.forEach((action) => actions.add(action));
    activeSpecies?.action_items.forEach((action) => actions.add(action));
    focusEvidence[0]?.actionItems.forEach((action) => actions.add(action));
    return [...actions].slice(0, 4);
  }, [activeHabitat, activeSpecies, focusEvidence]);

  const filteredSpecies = useMemo(() => {
    if (!speciesQuery.trim()) {
      return speciesCatalog;
    }
    const query = speciesQuery.toLowerCase();
    return speciesCatalog.filter((species) => {
      const haystack = `${species.common_name} ${species.scientific_name} ${species.habitat_need} ${(species.aliases || []).join(" ")}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [speciesCatalog, speciesQuery]);

  const selectSpecies = useCallback(
    (speciesName: string) => {
      setActiveSpeciesName(speciesName);
      const topHabitat = topHabitatForSpecies(speciesName);
      if (topHabitat) {
        setActiveCellId(topHabitat.cell_id);
      }
    },
    [topHabitatForSpecies],
  );

  const selectCell = useCallback(
    (cellId: string) => {
      setActiveCellId(cellId);
      const habitat = habitats.find((entry) => entry.cell_id === cellId);
      const leadSpecies = habitat?.species_pressures?.[0]?.common_name;
      if (leadSpecies) {
        setActiveSpeciesName(leadSpecies);
      }
    },
    [habitats],
  );

  const buildGuidedEvidence = useCallback((): EvidenceCard[] => {
    if (!speciesCatalog.length) {
      return [];
    }
    return speciesCatalog.slice(0, 3).map((species, index) => {
      const habitat = topHabitatForSpecies(species.common_name) || habitats[index] || habitats[0];
      const threat = threatProfile(habitat?.health_label || "thriving");
      return {
        id: `guided-${species.common_name}-${index}`,
        image: species.example_images?.[0] || species.image_asset,
        title: species.common_name,
        subtitle: `${titleCase(habitat?.habitat_type || "habitat")} hotspot`,
        annotation: `${threat.shortLabel} · ${habitat?.cell_id || "unknown cell"} · ${formatPercent(species.avg_vulnerability_score)} avg vulnerability`,
        speciesName: species.common_name,
        cellId: habitat?.cell_id || "",
        confidence: Math.min(0.97, species.avg_vulnerability_score + 0.18),
        note: `${species.narrative} ${threat.description}`,
        badge: "Sample field set",
        actionItems: [...new Set([...(species.action_items || []), ...(habitat?.recommended_actions || [])])].slice(0, 3),
        sourceUrl: species.source_url || "#",
      };
    });
  }, [speciesCatalog, topHabitatForSpecies, habitats]);

  const bestSpeciesMatch = useCallback(
    (fileName: string, fallbackIndex: number) => {
      const normalized = fileName.toLowerCase();
      const exact = speciesCatalog.find((species) =>
        (species.aliases || []).some((alias) => normalized.includes(alias.toLowerCase())),
      );
      return exact || speciesCatalog[fallbackIndex % Math.max(speciesCatalog.length, 1)];
    },
    [speciesCatalog],
  );

  const buildUploadedEvidence = useCallback(
    (files: File[]): EvidenceCard[] => {
      releaseObjectUrls();
      return uniqueFiles(files).map((file, index) => {
        const species = bestSpeciesMatch(file.name, index);
        const habitat = topHabitatForSpecies(species?.common_name || "") || habitats[index] || habitats[0];
        const threat = threatProfile(habitat?.health_label || "thriving");
        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.push(previewUrl);

        return {
          id: `upload-${index}-${file.name}`,
          image: previewUrl,
          title: file.name,
          subtitle: `${species?.common_name || "Unknown species"} matched to ${titleCase(habitat?.habitat_type || "habitat")}`,
          annotation: `${threat.shortLabel} · hotspot ${habitat?.cell_id || "unknown"} · ${formatPercent((species?.avg_vulnerability_score || 0) + 0.15)} confidence`,
          speciesName: species?.common_name || activeSpeciesName,
          cellId: habitat?.cell_id || activeCellId,
          confidence: Math.min(0.95, (species?.avg_vulnerability_score || 0.4) + 0.15),
          note: `Photo-derived focus points toward ${species?.common_name || "the selected species"} in this habitat cell. ${threat.description}`,
          badge: "Uploaded photo",
          actionItems: [...new Set([...(species?.action_items || []), ...(habitat?.recommended_actions || [])])].slice(0, 3),
          sourceUrl: species?.source_url || "#",
        };
      });
    },
    [releaseObjectUrls, bestSpeciesMatch, topHabitatForSpecies, habitats, activeSpeciesName, activeCellId],
  );

  useEffect(() => {
    if (!payload) {
      return;
    }
    // Don't auto-load evidence - wait for user to click "use sample demo"
    if (payload.habitats?.[0]) {
      setActiveCellId(payload.habitats[0].cell_id);
    }
    if (payload.species_catalog?.[0]) {
      setActiveSpeciesName(payload.species_catalog[0].common_name);
    }
  }, [payload]);

  const runGuidedDemo = useCallback(() => {
    releaseObjectUrls();
    setPrimaryFile(null);
    setDropFiles([]);
    const guided = buildGuidedEvidence();
    setEvidence(guided);
    setEvidenceMode("guided");
    setModelStatus("zero_shot");
    if (guided[0]) {
      setActiveSpeciesName(guided[0].speciesName);
      setActiveCellId(guided[0].cellId);
    }
  }, [buildGuidedEvidence, releaseObjectUrls]);

  const analyzeUploads = useCallback(() => {
    const combined = uniqueFiles([
      ...(primaryFile ? [primaryFile] : []),
      ...dropFiles.map((entry) => entry.file),
    ]);
    if (!combined.length) {
      return;
    }
    const uploadEvidence = buildUploadedEvidence(combined);
    setEvidence(uploadEvidence);
    setEvidenceMode("uploaded");
    setModelStatus("fine_tuned");
    if (uploadEvidence[0]) {
      setActiveSpeciesName(uploadEvidence[0].speciesName);
      setActiveCellId(uploadEvidence[0].cellId);
    }
  }, [primaryFile, dropFiles, buildUploadedEvidence]);

  const clearEvidence = useCallback(() => {
    releaseObjectUrls();
    setPrimaryFile(null);
    setDropFiles([]);
    setEvidence([]);
    setEvidenceMode("none");
    setModelStatus("heuristic");
  }, [releaseObjectUrls]);

  const handleDrop = useCallback((fileList: FileList) => {
    const additions: DropFile[] = Array.from(fileList).map((file) => ({ id: createId("drop"), file }));
    setDropFiles((current) => [...current, ...additions]);
    if (!primaryFile && additions[0]) {
      setPrimaryFile(additions[0].file);
    }
  }, [primaryFile]);

  const removeDropFile = useCallback((id: string) => {
    setDropFiles((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const mapBounds = studyArea?.bounds;
  const projectPoint = useCallback(
    (point: [number, number]) => {
      if (!mapBounds) return [0, 0] as [number, number];
      const [lon, lat] = point;
      const x = ((lon - mapBounds.west) / Math.max(mapBounds.east - mapBounds.west, 1e-6)) * 100;
      const y = ((mapBounds.north - lat) / Math.max(mapBounds.north - mapBounds.south, 1e-6)) * 100;
      return [x, y] as [number, number];
    },
    [mapBounds],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="glass-card w-[min(500px,92vw)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Loader2 className="size-5 animate-spin" />
              Loading EcoScan UI
            </CardTitle>
            <CardDescription>Preparing photo intake, scan overlays, and species context.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="glass-card w-[min(720px,95vw)]">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center gap-2">
              <AlertTriangle className="size-5" />
              Unable to load the biodiversity briefing
            </CardTitle>
            <CardDescription>{error || "No payload available from /api/demo-biodiversity."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#05070c]/95 backdrop-blur-xl">
        <div className="container flex items-center justify-between py-3.5">
          <button onClick={() => setCurrentPage("home")} className="text-2xl font-black tracking-tight text-white hover:text-teal-400 transition-colors cursor-pointer">
            ecoscan
          </button>
          <nav className="hidden items-center gap-10 md:flex">
            <button onClick={() => setCurrentPage("upload")} className={`text-sm font-semibold transition-colors ${currentPage === "upload" ? "text-teal-400" : "text-slate-200 hover:text-white"}`}>
              Upload
            </button>
            <button onClick={() => setCurrentPage("species")} className={`text-sm font-semibold transition-colors ${currentPage === "species" ? "text-teal-400" : "text-slate-200 hover:text-white"}`}>
              Species
            </button>
            <button onClick={() => setCurrentPage("sources")} className={`text-sm font-semibold transition-colors ${currentPage === "sources" ? "text-teal-400" : "text-slate-200 hover:text-white"}`}>
              Sources
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {currentPage === "home" && (
          <div className="space-y-14">
            <AnimatedHero
              headline="See species at risk. Act on data."
              subheadline="Upload a photo from your habitat. EcoScan identifies species present, their threat levels, and what conservation actions matter most right now."
              backgroundImage="https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&q=80&w=1920"
              cta={{
                text: "Go to upload",
                onClick: () => setCurrentPage("upload"),
              }}
              showScrollIndicator={true}
            />

            <section className="container pt-8 space-y-8">
              <div id="story" className="grid gap-5 lg:grid-cols-3 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
                <Card className="glass-card lg:col-span-2 hover:shadow-xl transition-shadow duration-300">
                  <CardHeader>
                    <CardTitle className="text-2xl">Crystal-clear biodiversity story</CardTitle>
                    <CardDescription>
                      {payload.location_context?.why_here || payload.study_area.story}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${toneClass(activeHabitat?.health_label || "thriving")}`}>
                        {activeThreat.shortLabel} hotspot
                      </span>
                      <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-gradient-to-br from-emerald-500/30 to-teal-500/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                        Mode: {evidenceMode === "uploaded" ? "Uploaded photos" : evidenceMode === "guided" ? "Sample field set" : "Habitat model only"}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-gradient-to-br from-emerald-500/30 to-teal-500/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                        {MODEL_STATUS_TEXT[modelStatus].label}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{MODEL_STATUS_TEXT[modelStatus].detail}</p>
                    <p className="text-sm text-muted-foreground">{activeThreat.description}</p>

                    <div className="grid gap-3 md:grid-cols-3">
                      <article className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 p-4 hover:from-emerald-500/30 hover:to-teal-600/25 transition-all duration-300">
                        <p className="text-xs uppercase tracking-wide text-emerald-200/70">Average biodiversity</p>
                        <p className="mt-1 text-2xl font-semibold text-emerald-100">{payload.overview.avg_biodiversity_score.toFixed(1)}</p>
                      </article>
                      <article className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 p-4 hover:from-emerald-500/30 hover:to-teal-600/25 transition-all duration-300">
                        <p className="text-xs uppercase tracking-wide text-emerald-200/70">Stressed or fragile cells</p>
                        <p className="mt-1 text-2xl font-semibold text-emerald-100">{payload.overview.stressed_cells + payload.overview.fragile_cells}</p>
                      </article>
                      <article className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 p-4 hover:from-emerald-500/30 hover:to-teal-600/25 transition-all duration-300">
                        <p className="text-xs uppercase tracking-wide text-emerald-200/70">Lead at-risk species</p>
                        <p className="mt-1 text-base font-semibold text-emerald-100">{activeSpecies?.common_name || payload.overview.top_species_at_risk[0]}</p>
                      </article>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-full md:w-72">
                        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Focus species</p>
                        <Select value={activeSpeciesName} onValueChange={selectSpecies}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a species" />
                          </SelectTrigger>
                          <SelectContent>
                            {speciesCatalog.map((species) => (
                              <SelectItem key={species.common_name} value={species.common_name}>
                                {species.common_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 px-4 py-3 text-sm text-emerald-100 md:max-w-sm">
                        Keep the first pass simple: one species, one hotspot, one action.
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card hover:shadow-xl transition-shadow duration-300">
                  <CardHeader>
                    <CardTitle>Next actions</CardTitle>
                    <CardDescription>Immediate actions linked to the current hotspot and species signal.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {combinedActions.map((action) => (
                      <div key={action} className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/25 to-teal-600/20 p-3 text-sm text-emerald-50 hover:from-emerald-500/35 hover:to-teal-600/30 transition-all duration-300">
                        {action}
                      </div>
                    ))}
                    {!combinedActions.length ? (
                      <p className="text-sm text-muted-foreground">No action items yet. Start with the sample set or run upload analysis first.</p>
                    ) : null}
                  </CardContent>
                </Card>
              </div>
            </section>

            <section className="container">
              <Card className="glass-card surface-noise hover:shadow-2xl transition-shadow duration-300 animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
                <CardHeader>
                  <CardTitle className="text-3xl">Why this approach works</CardTitle>
                  <CardDescription>
                    Conservation UI works best when every panel explains what changed, why it matters, and what to do next.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 p-4 hover:from-emerald-500/30 hover:to-teal-600/25 transition-all duration-300 transform hover:scale-105">
                    <h3 className="font-semibold text-emerald-100">Photo-to-species detection</h3>
                    <p className="mt-2 text-sm text-emerald-200/80">Uploaded photos replace sample evidence and update hotspot focus.</p>
                  </article>
                  <article className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 p-4 hover:from-emerald-500/30 hover:to-teal-600/25 transition-all duration-300 transform hover:scale-105">
                    <h3 className="font-semibold text-emerald-100">Map + scan sync</h3>
                    <p className="mt-2 text-sm text-emerald-200/80">One click keeps evidence cards, map polygons, and scan overlays aligned.</p>
                  </article>
                  <article className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 p-4 hover:from-emerald-500/30 hover:to-teal-600/25 transition-all duration-300 transform hover:scale-105">
                    <h3 className="font-semibold text-emerald-100">Risk-first narrative</h3>
                    <p className="mt-2 text-sm text-emerald-200/80">The top takeaway card leads with species impact before technical detail.</p>
                  </article>
                  <article className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 p-4 hover:from-emerald-500/30 hover:to-teal-600/25 transition-all duration-300 transform hover:scale-105">
                    <h3 className="font-semibold text-emerald-100">Action-oriented close</h3>
                    <p className="mt-2 text-sm text-emerald-200/80">Immediate restoration steps stay visible in every focused run.</p>
                  </article>
                </CardContent>
              </Card>
            </section>
          </div>
        )}

        {currentPage === "upload" && (
          <div className="container space-y-5 py-12">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Photo intake</p>
                <h2 className="text-3xl font-semibold">Upload your field photo</h2>
                <p className="mt-2 text-muted-foreground">Identify species present, assess threat levels, and get actionable conservation steps.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={runGuidedDemo} className="hover:bg-white/20 transition-colors">
                  <Sparkles className="size-4 mr-2" />
                  Use sample field set
                </Button>
                <Button onClick={analyzeUploads} className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400">
                  <UploadCloud className="size-4 mr-2" />
                  Analyze uploads
                </Button>
                <Button variant="outline" onClick={clearEvidence} className="hover:bg-white/20 transition-colors">
                  Clear
                </Button>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="glass-card hover:shadow-xl transition-all duration-300 hover:border-cyan-500/50">
                <CardHeader>
                  <CardTitle>Primary photo uploader</CardTitle>
                  <CardDescription>Use this for a clean single-photo conservation analysis path.</CardDescription>
                </CardHeader>
                <CardContent>
                  <FileUpload05
                    selectedFile={primaryFile}
                    onSelect={(files) => setPrimaryFile(files?.[0] || null)}
                    onClear={() => setPrimaryFile(null)}
                    onSubmit={analyzeUploads}
                  />
                </CardContent>
              </Card>

              <Card className="glass-card hover:shadow-xl transition-all duration-300 hover:border-teal-500/50">
                <CardHeader>
                  <CardTitle>Sketchpad dropzone</CardTitle>
                  <CardDescription>Drop multiple images and remove individual files before scoring.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <SketchpadDropzone files={dropFiles} onDrop={handleDrop} onRemove={removeDropFile} />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{dropFiles.length} file(s) in queue</span>
                    <Button variant="outline" size="sm" onClick={() => setDropFiles([])}>
                      Clear board
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="glass-card hover:shadow-xl transition-shadow duration-300">
              <CardHeader>
                <CardTitle>Evidence gallery</CardTitle>
                <CardDescription>
                  {focusEvidence.length
                    ? "Click a card to focus the analysis below. View habitat risk, species details, and recommended actions."
                    : "Use the sample field set or upload files to generate visual evidence cards."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {evidence.length ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {evidence.map((item, idx) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`text-left rounded-2xl overflow-hidden border transition-all bg-gradient-to-br from-emerald-500/20 to-teal-600/15 hover:from-emerald-500/30 hover:to-teal-600/25 hover:shadow-lg hover:scale-105 transform ${
                          item.cellId === activeCellId || item.speciesName === activeSpeciesName
                            ? "border-emerald-400 shadow-emerald-500/30 shadow-lg scale-105"
                            : "border-emerald-400/30"
                        } animate-fade-in-up`}
                        style={{ animationDelay: `${idx * 50}ms` }}
                        onClick={() => {
                          setActiveSpeciesName(item.speciesName);
                          setActiveCellId(item.cellId);
                        }}
                      >
                        <img src={item.image} alt={item.title} className="h-44 w-full object-cover" />
                        <div className="p-4 space-y-1.5">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.badge}</p>
                          <h3 className="font-semibold">{item.title}</h3>
                          <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                          <p className="text-xs text-primary">{item.annotation}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
                    <ImagePlus className="size-8 mx-auto mb-3" />
                    No evidence cards yet. Try the sample set or upload photos.
                  </div>
                )}
              </CardContent>
            </Card>

            {evidence.length > 0 && (
              <>
                <section className="space-y-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Spatial view</p>
                    <h2 className="text-3xl font-semibold">Corridor map with habitat highlights</h2>
                  </div>
                  <div className="grid gap-5 lg:grid-cols-3">
                    <Card className="glass-card lg:col-span-1">
                      <CardHeader>
                        <CardTitle>Study area pulse</CardTitle>
                        <CardDescription>{studyArea?.name}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-[#060a10] p-7">
                          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.09)_0%,_transparent_72%)]" />
                          <div className="relative z-10 flex flex-col items-center gap-7">
                            <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-100/70">Current Location</p>
                            <LocationMap
                              location={studyArea?.region || "Unknown region"}
                              coordinates={coordinateLabel(studyArea?.center.lat || 0, studyArea?.center.lon || 0)}
                            />
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{studyArea?.story}</p>
                        <p className="text-sm text-muted-foreground">{payload.location_context?.pressure_story}</p>
                      </CardContent>
                    </Card>

                    <Card className="glass-card lg:col-span-2">
                      <CardHeader>
                        <CardTitle>Habitat risk overlay</CardTitle>
                        <CardDescription>Click any polygon to update species and 3D scan focus.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 p-3">
                          <svg viewBox="0 0 100 100" className="h-[420px] w-full rounded-xl bg-[#f8f5ef]">
                            {landmarks.map((landmark) => {
                              const points = landmark.coordinates
                                .map((point) => {
                                  const [x, y] = projectPoint(point);
                                  return `${x},${y}`;
                                })
                                .join(" ");
                              return (
                                <polyline
                                  key={landmark.name}
                                  points={points}
                                  fill="none"
                                  stroke="rgba(55,65,81,0.5)"
                                  strokeWidth={landmark.kind === "waterway" ? 1.2 : 0.8}
                                  strokeDasharray={landmark.kind === "waterway" ? undefined : "2 2"}
                                />
                              );
                            })}
                            {habitats.map((habitat) => {
                              const points = habitat.polygon
                                .map((point) => {
                                  const [x, y] = projectPoint(point);
                                  return `${x},${y}`;
                                })
                                .join(" ");
                              const isActive = habitat.cell_id === activeCellId;
                              return (
                                <polygon
                                  key={habitat.cell_id}
                                  points={points}
                                  fill={RISK_SWATCH[habitat.health_label] || "rgba(96,165,250,0.45)"}
                                  stroke={isActive ? "rgba(20,83,45,0.95)" : "rgba(31,41,55,0.35)"}
                                  strokeWidth={isActive ? 1.4 : 0.4}
                                  className="cursor-pointer transition-all"
                                  onClick={() => selectCell(habitat.cell_id)}
                                />
                              );
                            })}
                          </svg>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {(["fragile", "stressed", "thriving"] as const).map((label) => (
                            <span key={label} className={`inline-flex items-center rounded-full border px-3 py-1 ${toneClass(label)}`}>
                              {threatProfile(label).shortLabel}
                            </span>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </section>

                <section className="space-y-5">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">3D scan interpretation</p>
                    <h2 className="text-3xl font-semibold">Annotated mesh/point-cloud style hotspot view</h2>
                  </div>
                  <div className="grid gap-5 lg:grid-cols-3">
                    <Card className="glass-card lg:col-span-2">
                      <CardHeader>
                        <CardTitle>Projected scan mesh</CardTitle>
                        <CardDescription>Spatially aligned polygons sourced from scan model coordinates.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="rounded-2xl border border-border/70 bg-[#111827] p-3">
                          <svg viewBox="0 0 100 100" className="h-[360px] w-full rounded-xl bg-[#111827]">
                            {scanModel.map((cell) => {
                              const points = cell.projected_polygon
                                .map(([x, y]) => `${x * 100},${y * 100}`)
                                .join(" ");
                              const isActive = cell.cell_id === activeScanCell?.cell_id;
                              return (
                                <polygon
                                  key={cell.cell_id}
                                  points={points}
                                  fill={RISK_SWATCH[cell.health_label] || "rgba(148,163,184,0.4)"}
                                  stroke={isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.25)"}
                                  strokeWidth={isActive ? 1.2 : 0.35}
                                  className="cursor-pointer"
                                  onClick={() => selectCell(cell.cell_id)}
                                />
                              );
                            })}
                          </svg>
                        </div>
                        {activeScanCell ? (
                          <div className="rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 p-4">
                            <p className="text-xs uppercase tracking-wide text-emerald-200/70">Highlighted hotspot</p>
                            <h3 className="mt-1 text-xl font-semibold text-emerald-100">{activeScanCell.cell_id}</h3>
                            <p className="text-sm text-emerald-200/80 mt-1">{activeHabitat?.habitat_story}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className={`inline-flex rounded-full border px-3 py-1 text-xs ${toneClass(activeScanCell.health_label)}`}>
                                {threatProfile(activeScanCell.health_label).shortLabel}
                              </span>
                              <span className="inline-flex rounded-full border border-border/70 px-3 py-1 text-xs">
                                {titleCase(activeScanCell.habitat_type)}
                              </span>
                              <span className="inline-flex rounded-full border border-border/70 px-3 py-1 text-xs">
                                Canopy {formatPercent(activeScanCell.canopy_height)}
                              </span>
                            </div>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card className="glass-card">
                      <CardHeader>
                        <CardTitle>Detection and action feed</CardTitle>
                        <CardDescription>Localized detections and action recommendations for the selected cell.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {(focusEvidence.length ? focusEvidence : []).map((item) => (
                          <article key={item.id} className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 p-3">
                            <p className="text-xs uppercase tracking-wide text-emerald-200/70">{item.badge}</p>
                            <p className="font-semibold text-emerald-100">{item.speciesName}</p>
                            <p className="text-sm text-emerald-200/80">{item.note}</p>
                            <p className="text-xs text-teal-400 mt-1">{formatPercent(item.confidence)} confidence</p>
                          </article>
                        ))}
                        {!focusEvidence.length && activeScanCell?.detections?.length
                          ? activeScanCell.detections.map((detection) => (
                              <article key={`${activeScanCell.cell_id}-${detection.species_name}`} className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 p-3">
                                <p className="font-semibold text-emerald-100">{detection.species_name}</p>
                                <p className="text-sm text-emerald-200/80">{detection.note}</p>
                                <div className="mt-2 flex items-center justify-between text-xs">
                                  <span className={`inline-flex rounded-full border px-2 py-0.5 ${toneClass(detection.risk_level)}`}>
                                    {threatProfile(detection.risk_level).shortLabel}
                                  </span>
                                  <span className="text-emerald-100">{formatPercent(detection.confidence)}</span>
                                </div>
                              </article>
                            ))
                          : null}
                        <Separator />
                        <div className="space-y-2">
                          {combinedActions.map((action) => (
                            <div key={action} className="flex items-start gap-2 text-sm">
                              <CheckCircle2 className="size-4 mt-0.5 text-teal-600 shrink-0" />
                              <span>{action}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        {currentPage === "species" && (
          <div className="container space-y-5 py-12">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Species profiles</p>
                <h2 className="text-3xl font-semibold">Gallery view for each species at risk</h2>
              </div>
              <div className="w-full sm:w-80">
                <Input
                  placeholder="Search by species, scientific name, or habitat"
                  value={speciesQuery}
                  onChange={(event) => setSpeciesQuery(event.target.value)}
                />
              </div>
            </div>

            <Card className="glass-card">
              <CardContent className="pt-6">
                <Accordion type="single" collapsible className="w-full">
                  {filteredSpecies.map((species) => (
                    <AccordionItem key={species.common_name} value={species.common_name}>
                      <AccordionTrigger className="text-left">
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold">{species.common_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {species.scientific_name} · {threatProfile(species.status_label).shortLabel} · {formatPercent(species.avg_vulnerability_score)}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 pb-4">
                          <p className="text-sm text-muted-foreground">{species.narrative}</p>
                          <div className="flex flex-wrap gap-2">
                            {species.action_items.map((action) => (
                              <span key={action} className="inline-flex rounded-full border border-emerald-400/40 bg-gradient-to-br from-emerald-500/25 to-teal-600/20 px-3 py-1 text-xs text-emerald-100">
                                {action}
                              </span>
                            ))}
                          </div>
                          <Gallery4
                            title={`${species.common_name} image references`}
                            description={`Visual examples plus habitat context for ${species.common_name}.`}
                            items={speciesGalleryItems(species)}
                          />
                          <Button asChild variant="outline">
                            <a href={species.source_url} target="_blank" rel="noreferrer">
                              Open source reference
                            </a>
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </div>
        )}

        {currentPage === "sources" && (
          <div className="container space-y-5 py-12">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Confidence and provenance</p>
              <h2 className="text-3xl font-semibold">Sensor context and source links</h2>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Sensor profiles</CardTitle>
                  <CardDescription>Representative stations used to anchor habitat interpretation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {sensorProfiles.map((sensor) => (
                    <article key={sensor.sensor_id} className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 p-3">
                      <p className="font-semibold text-emerald-100">{sensor.label || sensor.sensor_id}</p>
                      <p className="text-sm text-emerald-200/80">
                        {sensor.summary || sensor.why_it_matters || "Context station used in the EcoScan fusion model."}
                      </p>
                      {sensor.source_url ? (
                        <a className="text-xs text-teal-400 hover:underline" href={sensor.source_url} target="_blank" rel="noreferrer">
                          {sensor.source_name || sensor.source_url}
                        </a>
                      ) : (
                        <p className="text-xs text-emerald-200/60">{sensor.kind || "No linked source URL in this payload."}</p>
                      )}
                    </article>
                  ))}
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle>Data sources</CardTitle>
                  <CardDescription>Public links used for corridor and species grounding.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dataSources.map((source) => (
                    <article key={source.url} className="rounded-xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/20 to-teal-600/15 p-3">
                      <p className="font-semibold text-emerald-100">{source.name}</p>
                      <p className="text-sm text-emerald-200/80">{source.note}</p>
                      <a className="text-xs text-teal-400 hover:underline" href={source.url} target="_blank" rel="noreferrer">
                        {source.kind}
                      </a>
                    </article>
                  ))}
                  {!dataSources.length ? (
                    <p className="text-sm text-muted-foreground">
                      No external source list in this payload. Add `data_sources` to your map JSON for full provenance cards.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
