# SAQTA brand guide

SAQTA is a Kazakhstan-origin technology product for bakery demand planning and eligible surplus recovery. The name is inspired by Kazakh **сақта**, “keep”, “preserve”, or “protect”, depending on context.

**Positioning:** Predict demand. Save food. Protect tomorrow.

**Product description:** AI-powered demand forecasting and surplus-food recovery for bakeries.

**Optional Kazakh line:** Артықты азайт. Асты сақта.

## Logo concept

The original symbol combines two geometric grains, a protective open bowl, and a rising, three-segment forecasting signal. The grains stand for food; the bowl for preservation and care; the signal for decisions informed by data. The open shape suggests circulation without using the conventional recycling icon. Geometry is deliberately simple so the sign reads at navigation and favicon sizes.

The wordmark is custom vector geometry: five confidently spaced, sans-serif capital letters. It contains no font dependency, stock icon, copied logo, or raster component. All supplied assets are editable SVG source.

## Variations and asset locations

| Asset | Use |
| --- | --- |
| `frontend/public/brand/saqta-logo.svg` | Full horizontal lockup on light backgrounds |
| `frontend/public/brand/saqta-logo-dark.svg` | Light wordmark and lime symbol tile on dark backgrounds |
| `frontend/public/brand/saqta-symbol.svg` | Standalone symbol, compact navigation, avatars |
| `frontend/public/brand/favicon.svg` | Browser favicon, 64 × 64 viewBox |
| `frontend/public/brand/app-icon.svg` | App icon, 512 × 512 viewBox with extra internal safe area |

Use the complete lockup on the public site and the standalone symbol where the product name appears immediately beside it. Do not add “Forecast” or “Save” inside the SVG; render module labels as separate interface text.

## Color palette

| Token | HEX | Role |
| --- | --- | --- |
| Forest | `#123C2F` | Main brand, dark panels, navigation, headings |
| Primary green | `#237A57` | Primary interactive accents, positive chart series |
| Fresh lime | `#C7F36B` | Selective highlights, primary button on forest, signal |
| Warm off-white | `#F7F7F2` | Application canvas |
| Graphite | `#202622` | Main body text |
| Muted gray-green | `#7C8B81` | Decorative lines and secondary chart marks; not small body text on white |
| White | `#FFFFFF` | Cards and light content on dark panels |
| Accessible secondary text | `#5D6B62` | Secondary body text on white/off-white |
| Border | `#E2E8E1` | Subtle separators and controls |
| Warning | `#97651D` | Warning text and low-confidence notes |
| Danger | `#A33E35` | Validation failures and destructive actions |

Pair forest text with lime. Do not use white text on lime. Green/forest buttons use white text; keyboard focus uses a visible green ring. Status labels must include readable text, so color is never the only signal.

## Typography

The interface uses a modern sans-serif stack, `Inter`, system UI, `Segoe UI`, sans-serif. Self-hosted Inter is optional; the implementation intentionally works without downloading a font. The wordmark uses its own vector paths. Support Russian, Kazakh and English with Russian as the initial interface language. Use `ru-KZ`, `kk-KZ` or `en-GB` for dates and numbers according to the selected language; all monetary amounts remain in tenge.

Use short, sentence-case headings. Public headline: 48–76 px responsive. Application page titles: 26–32 px. Section headings: 18–24 px. Body: 14–16 px; labels and metadata: at least 12 px. Use weights 400, 500, 600, and 700; do not simulate an outlined wordmark using text.

## Spacing and sizing

- The base spacing unit is 4 px; use 8, 12, 16, 24, and 32 px for most layout decisions.
- Clear space around a lockup is at least one quarter of the symbol height on every side.
- Minimum horizontal logo width: 132 px. Preferred desktop width: 146–175 px.
- Standalone symbol minimum size: 24 px; favicon can appear at 16 px using the dedicated SVG.
- Scale the SVG proportionally. Preserve its viewBox and internal geometry.
- App cards use restrained 12–20 px corner radii, fine borders, and little or no shadow.

## Light and dark backgrounds

Use `saqta-logo.svg` on white and warm off-white. Use `saqta-logo-dark.svg` on forest or graphite. The standalone forest tile works on light backgrounds. On forest backgrounds use the dark lockup's lime tile or a pale container to preserve the edge. Avoid placing the logo on a busy photograph or a chart.

The favicon is the self-contained forest tile and grain signal. The app icon maintains a larger internal safe area for platform masks. The application metadata points to the SVG favicon and app icon. SVG is the authoritative editable format; any future PNG export must be derived from it.

## Correct and incorrect use

**Correct:** maintain aspect ratio; leave clear space; select the correct light/dark asset; show module names as text outside the lockup; use the symbol alone beside a readable SAQTA label; keep ecological claims tied to recorded data.

**Incorrect:** stretch or rotate the mark; replace the custom wordmark with arbitrary typed text; add a gradient or drop shadow; recolor the grains individually; remove the protective bowl; place white lettering on lime; use the mark as a decorative chart watermark; invent customer logos, endorsements, or environmental outcomes.

## Voice and product claims

Be practical, clear, and transparent. Forecasts are estimates, not guarantees. Distinguish measured records, estimates, illustrative assumptions, and synthetic demo data. “SAQTA Forecast” prevents avoidable overproduction through planning; “SAQTA Save” provides a way to sell eligible surplus. A marketplace sale does not prove that the product would otherwise have been discarded. Do not claim measured CO₂ reductions or causal impact without appropriate evidence.
