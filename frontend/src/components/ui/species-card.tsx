import { memo } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SpeciesCardProps {
  commonName: string;
  scientificName: string;
  threatLevel: "Low" | "Medium" | "High";
  narrative: string;
  imageUrl: string;
  vulnerability: number;
  actions: string[];
  sourceUrl?: string;
  isActive?: boolean;
  onClick?: () => void;
}

/**
 * SpeciesCard: Individual species risk profile with image, threat level, and actions
 * Optimized for smooth interactions and accessibility
 */
export const SpeciesCard = memo(function SpeciesCard({
  commonName,
  scientificName,
  threatLevel,
  narrative,
  imageUrl,
  vulnerability,
  actions,
  sourceUrl,
  isActive = false,
  onClick,
}: SpeciesCardProps) {
  const threatColor = {
    Low: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Medium: "bg-amber-100 text-amber-700 border-amber-200",
    High: "bg-red-100 text-red-700 border-red-200",
  };

  const threatBg = {
    Low: "from-emerald-500/20 to-emerald-600/20",
    Medium: "from-amber-500/20 to-amber-600/20",
    High: "from-red-500/20 to-red-600/20",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative text-left rounded-2xl overflow-hidden border transition-all duration-300 transform hover:scale-105 ${
        isActive
          ? "border-primary shadow-xl scale-105 bg-white/90"
          : "border-border/70 bg-white/80 hover:shadow-lg"
      }`}
    >
      {/* Background gradient overlay */}
      <div className={`absolute inset-0 bg-gradient-to-br ${threatBg[threatLevel]} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />

      {/* Image container */}
      <div className="relative overflow-hidden h-48 bg-slate-200">
        <img
          src={imageUrl}
          alt={commonName}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

        {/* Threat badge */}
        <div className={`absolute top-3 right-3 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${threatColor[threatLevel]}`}>
          {threatLevel} threat
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 p-4 space-y-2.5">
        <div>
          <h3 className="font-semibold text-base line-clamp-1 group-hover:text-primary transition-colors">
            {commonName}
          </h3>
          <p className="text-xs text-muted-foreground italic">{scientificName}</p>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2">{narrative}</p>

        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 bg-gradient-to-r ${
                threatLevel === "High"
                  ? "from-red-500 to-red-600"
                  : threatLevel === "Medium"
                    ? "from-amber-500 to-amber-600"
                    : "from-emerald-500 to-emerald-600"
              }`}
              style={{ width: `${vulnerability * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
            {Math.round(vulnerability * 100)}%
          </span>
        </div>

        {actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {actions.slice(0, 2).map((action, idx) => (
              <span
                key={idx}
                className="text-xs bg-white/70 border border-border/50 rounded-full px-2 py-0.5 truncate"
              >
                {action}
              </span>
            ))}
            {actions.length > 2 && (
              <span className="text-xs text-muted-foreground px-2 py-0.5">+{actions.length - 2} more</span>
            )}
          </div>
        )}

        {sourceUrl && (
          <div className="pt-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <a href={sourceUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="w-3 h-3 mr-1.5" />
                Learn more
              </a>
            </Button>
          </div>
        )}
      </div>
    </button>
  );
});

SpeciesCard.displayName = "SpeciesCard";
