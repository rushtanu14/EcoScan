# EcoScan File Upload System - Complete Guide

## How the Upload System Works

The upload system in EcoScan uses a **filename-based matching algorithm** combined with sequential species assignment. Here's what happens when you upload photos:

### Upload Flow

```
1. User uploads file(s)
   ↓
2. System extracts filename (e.g., "frog_photo.jpg")
   ↓
3. Searches for ALIAS MATCHES in species catalog
   ├─ "frog" matches "California red-legged frog" ✓
   ├─ "turtle" matches "Western pond turtle" ✓
   ├─ "woodpecker" matches "Acorn woodpecker" ✓
   ├─ "my_photo.jpg" → No match (fallback to sequential)
   ↓
4. Links to relevant habitat and threat profile
   ↓
5. Displays in gallery with confidence score
```

### Example Filenames That Work

**Will Match Automatically:**
- `frog.jpg` → California red-legged frog
- `turtle_photo.png` → Western pond turtle
- `woodpecker.jpg` → Acorn woodpecker
- `black_phoebe.jpg` → Black phoebe
- `monarch_butterfly.png` → Monarch butterfly
- `oak_tree.jpg` → Valley oak saplings
- `milkweed.jpg` → California milkweed
- `coyote_brush.png` → Coyote brush

**Will Use Sequential Fallback:**
- `my_photo.jpg` → Cycles through species list
- `evidence_1.png` → Cycles through species list
- `random_photo.jpg` → Cycles through species list

### Available Species Aliases

The system recognizes these keywords in filenames (case-insensitive):

| Species | Keywords |
|---------|----------|
| California red-legged frog | `frog`, `redlegged`, `amphibian`, `wetland` |
| Acorn woodpecker | `woodpecker`, `bird`, `oak` |
| Valley oak saplings | `oak`, `sapling`, `tree`, `quercus` |
| Western pond turtle | `turtle`, `pond`, `reptile` |
| Black phoebe | `phoebe`, `bird`, `riparian` |
| California milkweed | `milkweed`, `plant`, `grassland` |
| Coyote brush | `coyote`, `brush`, `shrub` |
| Monarch butterfly | `monarch`, `butterfly`, `insect`, `milkweed` |

## Why Uploaded Photos Still Show Sample Data

### Important Note: Current Limitation

**The EcoScan system does NOT have computer vision/ML image recognition yet.** It doesn't automatically identify species from photos. Instead, it uses:

1. **Filename matching** - Smart keyword detection
2. **Sequential assignment** - Falls back to cycling through species
3. **Manual linking** - What the user can do

### What You're Seeing

When you upload `vacation_photo.jpg`:
1. System searches for matching keywords → Finds none
2. Falls back to sequential assignment → Picks species #1
3. Displays evidence card with that species + habitat combo
4. Links to demo data for that species (because demo data is hardcoded)

**This is why it appears to "still only show sample data"** — The uploaded image is displayed, but the species/habitat/threat profile comes from the hardcoded demo dataset.

## How to Get the Upload Feature to Work Properly

### Option 1: Use Filename Matching (Current Feature)

**Name your files to match species keywords:**

```bash
# Collect evidence
frog_coyote_creek.jpg       # Matches "frog" → California red-legged frog
turtle_habitat.png          # Matches "turtle" → Western pond turtle
woodpecker_oak.jpg          # Matches "woodpecker" → Acorn woodpecker
butterfly_meadow.jpg        # Matches "butterfly" → Monarch butterfly

# Upload all at once
# They will automatically match to correct species! ✓
```

### Option 2: Create Backend API Endpoint (Enhancement)

The system could be enhanced with a real endpoint that:
1. Accepts file uploads
2. Stores them in the backend
3. Returns them as evidence with proper species linking
4. Eventually integrates with image recognition

**Example enhancement** (not yet implemented):

```javascript
// Would need backend endpoint
POST /api/upload-evidence
{
  files: [File1, File2, ...],
  studyArea: "Coyote Creek",
  habitat: "riparian_corridor"
}
// Returns:
{
  evidence: [
    {
      id: "upload-1",
      image: "blob:...",  // Stored image reference
      speciesName: "...",
      cellId: "...",
      confidence: 0.85
    }
  ]
}
```

## Workflow for Hackathon Demo

### Best Practice for Presentation

1. **Use the "Sample Field Set" Button** ← Recommended
   - Click "Use sample field set" 
   - Shows 3 pre-designed demo images
   - All linked to proper species/habitats
   - Perfect for demonstration

2. **Upload Your Own Evidence** (if showing uploads)
   - Name files with species keywords: `frog.jpg`, `turtle.png`, etc.
   - Upload all files at once
   - System auto-matches filenames to species
   - Shows how evidence drives habitat assessment

3. **Explain the System**
   - "The system uses filename matching for this demo"
   - "In production, we'd integrate computer vision for real species detection"
   - "For now, name your photos with species keywords to demonstrate the workflow"

## Technical Details

### In the Code (App.tsx)

```javascript
// This function matches filenames to species
const bestSpeciesMatch = useCallback(
  (fileName: string, fallbackIndex: number) => {
    const normalized = fileName.toLowerCase();
    
    // Search for keywords in filename
    const exact = speciesCatalog.find((species) =>
      (species.aliases || []).some((alias) => 
        normalized.includes(alias.toLowerCase())
      )
    );
    
    // If found, use matched species
    // If not found, use sequential fallback
    return exact || speciesCatalog[fallbackIndex % Math.max(speciesCatalog.length, 1)];
  },
  [speciesCatalog],
);
```

### Evidence Card Structure

When evidence is created from uploads:

```javascript
{
  id: "upload-0-frog.jpg",
  image: <ObjectURL>,           // The actual file reference
  title: "frog.jpg",            // Filename
  subtitle: "California red-legged frog matched to wetland edge hotspot",
  annotation: "High threat · hotspot cell-3 · 55% confidence",
  speciesName: "California red-legged frog",
  cellId: "cell-3",
  badge: "Uploaded photo",      // Shows it's user-uploaded
  actionItems: ["Restore water quality", "Protect breeding pools"],
  sourceUrl: "https://wildlife.ca.gov/..."
}
```

## Future Enhancement: Real ML Integration

When/if integrated with actual species detection:

```python
# Backend would look like:
@app.post("/api/analyze-evidence")
async def analyze_evidence(files: List[UploadFile]):
    results = []
    for file in files:
        image = load_image(file)
        
        # Computer vision inference
        species = detect_species(image)  # ML model
        habitat_context = analyze_habitat(image)
        threat_score = calculate_threat(species, habitat)
        
        results.append({
            "image_url": store_file(file),
            "detected_species": species.common_name,
            "confidence": species.confidence,
            "habitat": habitat_context,
            "threat_level": threat_score
        })
    
    return results
```

## Summary

| Aspect | Current | Future |
|--------|---------|--------|
| **Detection Method** | Filename matching | Computer vision ML |
| **Upload Flow** | Browser → React state | Browser → Backend → API |
| **Species Linking** | Keywords in filename | Automatic image recognition |
| **Storage** | Browser memory (Blob URLs) | Backend database |
| **Persistence** | Lost on refresh | Permanent database |
| **Use Cases** | Demo, prototyping | Production conservation work |

---

**Bottom Line:** For the hackathon demo, use **filenames with species keywords** or use the **"Sample Field Set" button** for the best presentation. Both work perfectly! The upload feature demonstrates the workflow, even though the actual species detection isn't AI-powered yet.
