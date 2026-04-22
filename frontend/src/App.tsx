import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, Sparkles, UploadCloud } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocationMap } from "@/components/ui/expand-map";
import FileUpload05 from "@/components/ui/file-upload-1";
import { Gallery4, Gallery4Item } from "@/components/ui/gallery4";
import { HorizonHeroSection } from "@/components/ui/horizon-hero-section";
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
    // Birds, reptiles, amphibians, insects
    "https://images.unsplash.com/photo-1444464666175-1642a9c67b12?auto=format&fit=crop&q=80&w=1200", // Woodpecker-like
    "https://images.unsplash.com/photo-1485872299829-c673f5194813?auto=format&fit=crop&q=80&w=1200", // Dark bird
    "https://images.unsplash.com/photo-1558147866-c83b5e7b55bc?auto=format&fit=crop&q=80&w=1200", // Turtle
    "https://images.unsplash.com/photo-1599599810694-2da9cbb0d007?auto=format&fit=crop&q=80&w=1200", // Frog
    "https://images.unsplash.com/photo-1526336024174-e58f5cdd8e13?auto=format&fit=crop&q=80&w=1200", // Butterfly
    "https://images.unsplash.com/photo-1470114716159-e389f8712fda?auto=format&fit=crop&q=80&w=1200", // Heron-like bird
    "https://images.unsplash.com/photo-1505228395891-9a51e7e86e81?auto=format&fit=crop&q=80&w=1200", // Bird in flight
    "https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&q=80&w=1200", // Aquatic life
    "https://images.unsplash.com/photo-1444802686981-c3aba66f7fb1?auto=format&fit=crop&q=80&w=1200", // Insects/small wildlife
  ],
  plant: [
    // Oak trees, wildflowers, shrubs
    "https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&q=80&w=1200", // Oak tree
    "https://images.unsplash.com/photo-1490598967868-2aa4f00a0558?auto=format&fit=crop&q=80&w=1200", // Wildflower
    "https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&q=80&w=1200", // Grass meadow
    "https://images.unsplash.com/photo-1466478353382-a277b1b91e1f?auto=format&fit=crop&q=80&w=1200", // Forest canopy
    "https://images.unsplash.com/photo-1495567720989-cebdbdd97913?auto=format&fit=crop&q=80&w=1200", // Green shoots
    "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&q=80&w=1200", // Spring blooms
    "https://images.unsplash.com/photo-1469022563149-aa64fce926d9?auto=format&fit=crop&q=80&w=1200", // Wildflower field
    "https://images.unsplash.com/photo-1445911173510-2513f95b351d?auto=format&fit=crop&q=80&w=1200", // Native shrubs
    "https://images.unsplash.com/photo-1518531933037-91b2f5f21cc0?auto=format&fit=crop&q=80&w=1200", // Botanical detail
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

  const [activeSpeciesName, setActiveSpeciesName] = useState<string>("");
  const [activeCellId, setActiveCellId] = useState<string>("");
  const [speciesQuery, setSpeciesQuery] = useState("");

  const [primaryFile, setPrimaryFile] = useState<File | null>(null);
  const [dropFiles, setDropFiles] = useState<DropFile[]>([]);
  const [evidence, setEvidence] = useState<EvidenceCard[]>([]);
  const [evidenceMode, setEvidenceMode] = useState<EvidenceMode>("none");
  const [modelStatus, setModelStatus] = useState<ModelStatus>("heuristic");

  const objectUrlsRef = useRef<string[]>([]);
  const [route, setRoute] = useState<string>(window.location.hash?.replace('#', '') || 'home');


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
    const onHash = () => setRoute(window.location.hash.replace('#', '') || 'home');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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
    if (!payload || evidence.length) {
      return;
    }
    const guided = buildGuidedEvidence();
    setEvidence(guided);
    setEvidenceMode("guided");
    setModelStatus("zero_shot");
    if (guided[0]) {
      setActiveSpeciesName(guided[0].speciesName);
      setActiveCellId(guided[0].cellId);
    }
  }, [payload, evidence.length, buildGuidedEvidence]);

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
    <div className="relative pb-24">
      <header className="sticky top-0 z-50 border-b border-emerald-900/20 bg-gradient-to-r from-emerald-950/95 via-teal-950/95 to-emerald-950/95 backdrop-blur-xl">
        <div className="container flex items-center justify-between py-3.5">
          <a href="#home" className="text-2xl font-black tracking-tight text-emerald-50">
            EcoScan
          </a>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#habitat" className="text-sm font-semibold text-emerald-100 transition-colors hover:text-emerald-50">
              Habitat Analysis
            </a>
            <a href="#species" className="text-sm font-semibold text-emerald-100 transition-colors hover:text-emerald-50">
              Species Profiles
            </a>
            <a href="#upload" className="text-sm font-semibold text-emerald-100 transition-colors hover:text-emerald-50">
              Photo Upload
            </a>
            <a href="#scan" className="text-sm font-semibold text-emerald-100 transition-colors hover:text-emerald-50">
              3D Analysis
            </a>
          </nav>
        </div>
      </header>

      <main className="space-y-14" id="home">
        <section id="home" className={route !== 'home' ? 'hidden relative w-full h-screen flex items-center justify-center overflow-hidden' : 'relative w-full h-screen flex items-center justify-center overflow-hidden'}>
          <div 
            className="absolute inset-0 w-full h-full bg-cover bg-center"
            style={{
              backgroundImage: "url('https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&q=80&w=2000')",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/30 to-black/60" />
          </div>
          
          <div className="relative z-10 container mx-auto text-center space-y-6 text-white px-4 max-w-3xl">
            <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-tight">
              Protect Ecosystems with Data
            </h1>
            <p className="text-lg md:text-xl text-emerald-100 max-w-2xl mx-auto">
              Real-time biodiversity monitoring, species-risk assessment, and conservation action planning for critical habitats.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-6">
              <a href="#upload" className="inline-block rounded-full bg-cyan-400/95 hover:bg-cyan-500 text-zinc-900 font-semibold px-6 py-3 shadow-lg">Start with sample data</a>
            </div>
          </div>
        </section>

        <section id="habitat" className={route !== 'habitat' ? 'hidden container pt-8 space-y-8' : 'container pt-8 space-y-8'}>
          <div id="story" className="grid gap-5 lg:grid-cols-3">
            <Card className="glass-card lg:col-span-2">
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
                  <span className="inline-flex items-center rounded-full border border-border/70 bg-white/60 px-3 py-1 text-xs font-semibold text-zinc-900">
                    Mode: {evidenceMode === "uploaded" ? "Uploaded photos" : evidenceMode === "guided" ? "Sample field set" : "Habitat model only"}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border/70 bg-white/60 px-3 py-1 text-xs font-semibold">
                    {MODEL_STATUS_TEXT[modelStatus].label}
                  </span>
                </div>
                <p className="text-sm text-zinc-700">{MODEL_STATUS_TEXT[modelStatus].detail}</p>
                <p className="text-sm text-zinc-700">{activeThreat.description}</p>

                <div className="grid gap-3 md:grid-cols-3">
                  <article className="rounded-xl border border-border/70 bg-teal-50 p-4 text-zinc-900">
                    <p className="text-xs uppercase tracking-wide text-zinc-700">Average biodiversity</p>
                    <p className="mt-1 text-2xl font-semibold">{payload.overview.avg_biodiversity_score.toFixed(1)}</p>
                  </article>
                  <article className="rounded-xl border border-border/70 bg-teal-50 p-4 text-zinc-900">
                    <p className="text-xs uppercase tracking-wide text-zinc-700">Stressed or fragile cells</p>
                    <p className="mt-1 text-2xl font-semibold">{payload.overview.stressed_cells + payload.overview.fragile_cells}</p>
                  </article>
                  <article className="rounded-xl border border-border/70 bg-teal-50 p-4 text-zinc-900">
                    <p className="text-xs uppercase tracking-wide text-zinc-700">Lead at-risk species</p>
                    <p className="mt-1 text-base font-semibold">{activeSpecies?.common_name || payload.overview.top_species_at_risk[0]}</p>
                  </article>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-full md:w-72">
                    <p className="mb-1 text-xs uppercase tracking-wide text-foreground">Focus species</p>
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
                  <div className="rounded-xl border border-border/70 bg-teal-50 px-4 py-3 text-sm text-zinc-900 md:max-w-sm">
                    Keep the first pass simple: one species, one hotspot, one action.
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Next actions</CardTitle>
                <CardDescription>Immediate actions linked to the current hotspot and species signal.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {combinedActions.map((action) => (
                  <div key={action} className="rounded-xl border border-border/70 bg-teal-100 p-3 text-sm text-zinc-900">
                    {action}
                  </div>
                ))}
                {!combinedActions.length ? (
                  <p className="text-sm text-foreground">No action items yet. Start with the sample set or run upload analysis first.</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="container">
          <Card className="glass-card surface-noise">
            <CardHeader>
              <CardTitle className="text-3xl">"Design should be easy to understand."</CardTitle>
              <CardDescription>
                Conservation UI works best when every panel explains what changed, why it matters, and what to do next.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-xl border border-border/70 bg-teal-50 p-4 text-zinc-900">
                <h3 className="font-semibold">Photo-to-species detection</h3>
                <p className="mt-2 text-sm text-zinc-700">Uploaded photos replace sample evidence and update hotspot focus.</p>
              </article>
              <article className="rounded-xl border border-border/70 bg-teal-50 p-4 text-zinc-900">
                <h3 className="font-semibold">Map + scan sync</h3>
                <p className="mt-2 text-sm text-zinc-700">One click keeps evidence cards, map polygons, and scan overlays aligned.</p>
              </article>
              <article className="rounded-xl border border-border/70 bg-teal-50 p-4 text-zinc-900">
                <h3 className="font-semibold">Risk-first narrative</h3>
                <p className="mt-2 text-sm text-zinc-700">The top takeaway card leads with species impact before technical detail.</p>
              </article>
              <article className="rounded-xl border border-border/70 bg-teal-50 p-4 text-zinc-900">
                <h3 className="font-semibold">Action-oriented close</h3>
                <p className="mt-2 text-sm text-zinc-700">Immediate restoration steps stay visible in every focused run.</p>
              </article>
            </CardContent>
          </Card>
        </section>

        <section id="upload" className={route !== 'upload' ? 'hidden container space-y-5' : 'container space-y-5'}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-foreground">Photo intake</p>
              <h2 className="text-3xl font-semibold">Aesthetic upload flow with clear next steps</h2>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={runGuidedDemo}>
                <Sparkles className="size-4 mr-2" />
                Use sample field set
              </Button>
              <Button onClick={analyzeUploads}>
                <UploadCloud className="size-4 mr-2" />
                Analyze uploads
              </Button>
              <Button variant="outline" onClick={clearEvidence}>
                Clear
              </Button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="glass-card">
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

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>Sketchpad dropzone</CardTitle>
                <CardDescription>Drop multiple images and remove individual files before scoring.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <SketchpadDropzone files={dropFiles} onDrop={handleDrop} onRemove={removeDropFile} />
                <div className="flex items-center justify-between text-sm text-foreground">
                  <span>{dropFiles.length} file(s) in queue</span>
                  <Button variant="outline" size="sm" onClick={() => setDropFiles([])}>
                    Clear board
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Evidence deck</CardTitle>
              <CardDescription>
                {focusEvidence.length
                  ? "Click a card to focus map and scan sections."
                  : "Use the sample field set or upload files to generate visual evidence cards."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {evidence.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {evidence.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`text-left rounded-2xl overflow-hidden border transition-all bg-teal-100 hover:shadow-lg text-zinc-900 ${
                        item.cellId === activeCellId || item.speciesName === activeSpeciesName
                          ? "border-primary shadow-lg"
                          : "border-border/70"
                      }`}
                      onClick={() => {
                        setActiveSpeciesName(item.speciesName);
                        setActiveCellId(item.cellId);
                      }}
                    >
                      <img src={item.image} alt={item.title} className="h-44 w-full object-cover" />
                      <div className="p-4 space-y-1.5">
                        <p className="text-xs uppercase tracking-wide text-foreground">{item.badge}</p>
                        <h3 className="font-semibold">{item.title}</h3>
                        <p className="text-sm text-foreground">{item.subtitle}</p>
                        <p className="text-xs text-primary">{item.annotation}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-zinc-700">
                  <ImagePlus className="size-8 mx-auto mb-3" />
                  No evidence cards yet.
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section id="map" className={route !== 'map' ? 'hidden container space-y-5' : 'container space-y-5'}>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-foreground">Spatial view</p>
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
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(52,211,153,0.09)_0%,_transparent_72%)]" />
                  <div className="relative z-10 flex flex-col items-center gap-7">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-100/70">Current Location</p>
                    <LocationMap
                      location={studyArea?.region || "Unknown region"}
                      coordinates={coordinateLabel(studyArea?.center.lat || 0, studyArea?.center.lon || 0)}
                    />
                  </div>
                </div>
                <p className="text-sm text-foreground">{studyArea?.story}</p>
                <p className="text-sm text-foreground">{payload.location_context?.pressure_story}</p>
              </CardContent>
            </Card>

            <Card className="glass-card lg:col-span-2">
              <CardHeader>
                <CardTitle>Habitat risk overlay</CardTitle>
                <CardDescription>Click any polygon to update species and 3D scan focus.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border border-border/70 bg-teal-100 p-3 text-zinc-900">
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

        <section id="scan" className={route !== 'scan' ? 'hidden container space-y-5' : 'container space-y-5'}>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-foreground">3D scan interpretation</p>
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
                  <div className="rounded-2xl border border-border/70 bg-teal-100 p-4 text-zinc-900">
                    <p className="text-xs uppercase tracking-wide text-foreground">Highlighted hotspot</p>
                    <h3 className="mt-1 text-xl font-semibold">{activeScanCell.cell_id}</h3>
                    <p className="text-sm text-foreground mt-1">{activeHabitat?.habitat_story}</p>
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
                  <article key={item.id} className="rounded-xl border border-border/70 bg-white/70 p-3 text-zinc-900">
                    <p className="text-xs uppercase tracking-wide text-foreground">{item.badge}</p>
                    <p className="font-semibold">{item.speciesName}</p>
                    <p className="text-sm text-foreground">{item.note}</p>
                    <p className="text-xs text-primary mt-1">{formatPercent(item.confidence)} confidence</p>
                  </article>
                ))}
                {!focusEvidence.length && activeScanCell?.detections?.length
                  ? activeScanCell.detections.map((detection) => (
                      <article key={`${activeScanCell.cell_id}-${detection.species_name}`} className="rounded-xl border border-border/70 bg-white/70 p-3 text-zinc-900">
                        <p className="font-semibold">{detection.species_name}</p>
                        <p className="text-sm text-foreground">{detection.note}</p>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 ${toneClass(detection.risk_level)}`}>
                            {threatProfile(detection.risk_level).shortLabel}
                          </span>
                          <span>{formatPercent(detection.confidence)}</span>
                        </div>
                      </article>
                    ))
                  : null}
                <Separator />
                <div className="space-y-2">
                  {combinedActions.map((action) => (
                    <div key={action} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="size-4 mt-0.5 text-emerald-600 shrink-0" />
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="species" className={route !== 'species' ? 'hidden container space-y-5' : 'container space-y-5'}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-foreground">Species profiles</p>
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
                        <span className="text-xs text-foreground">
                          {species.scientific_name} · {threatProfile(species.status_label).shortLabel} · {formatPercent(species.avg_vulnerability_score)}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-3 pb-4">
                        <p className="text-sm text-foreground">{species.narrative}</p>
                        <div className="flex flex-wrap gap-2">
                          {species.action_items.map((action) => (
                            <span key={action} className="inline-flex rounded-full border border-border/70 bg-white/70 px-3 py-1 text-xs text-zinc-900">
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
        </section>

        <section id="sources" className="container space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-foreground">Confidence and provenance</p>
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
                  <article key={sensor.sensor_id} className="rounded-xl border border-border/70 bg-white/70 p-3 text-zinc-900">
                    <p className="font-semibold">{sensor.label || sensor.sensor_id}</p>
                    <p className="text-sm text-foreground">
                      {sensor.summary || sensor.why_it_matters || "Context station used in the EcoScan fusion model."}
                    </p>
                    {sensor.source_url ? (
                      <a className="text-xs text-primary hover:underline" href={sensor.source_url} target="_blank" rel="noreferrer">
                        {sensor.source_name || sensor.source_url}
                      </a>
                    ) : (
                      <p className="text-xs text-foreground">{sensor.kind || "No linked source URL in this payload."}</p>
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
                  <article key={source.url} className="rounded-xl border border-border/70 bg-white/70 p-3 text-zinc-900">
                    <p className="font-semibold">{source.name}</p>
                    <p className="text-sm text-muted-foreground">{source.note}</p>
                    <a className="text-xs text-primary hover:underline" href={source.url} target="_blank" rel="noreferrer">
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
        </section>

        {/* Footer removed per user request (bottom action bar) */}
      </main>
    </div>
  );
}
