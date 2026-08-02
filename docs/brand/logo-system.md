# Knotline logo system

## Master idea

The Knotline symbol is a **threaded K**. A stable vertical stroke represents the accountable operating line. A second, continuous stroke leaves that line, forms the upper and lower arms of the K, and returns through the center.

The shape is intentionally tied to the product rather than to generic “AI” imagery:

- the stable line represents one shared operational state;
- the returning thread represents a workflow that can branch, recover, and close the loop;
- the central join represents a governed handoff between people, agents, and systems;
- the silhouette reads as the initial **K** without relying on the wordmark.

The mark replaces the previous three-diamond public symbol and three-loop workspace symbol. Knotline now has one identity across every surface.

## Approved configurations

1. **Primary combination:** green symbol followed by the Knotline wordmark on a light background.
2. **Reversed combination:** white or mint symbol and wordmark on deep green or another sufficiently dark background.
3. **Symbol only:** app icon, favicon, collapsed navigation, avatar, social profile, or space below 96 px wide.
4. **One-color:** the complete symbol may be reproduced in solid black, white, or a single brand green when production limits require it.

Do not add a container around the master symbol unless the medium requires an app-icon tile.

## Color

| Role | Value | Use |
| --- | --- | --- |
| Knotline green | `#0F6B57` | Primary symbol on light surfaces |
| Deep green | `#103D33` | App-icon field and dark brand surfaces |
| Mint | `#D9F3E5` | Symbol on deep green app-icon fields |
| White | `#FFFFFF` | Reversed symbol on dark or photographic fields |

The SVG React component inherits `currentColor`, allowing the surface to choose an accessible approved color without changing the geometry.

## Clear space and minimum size

Use the stroke width of the vertical line as the minimum clear space on every side. No text, border, icon, or crop should enter this area.

- Digital symbol minimum: **20 px** high.
- Recommended navigation size: **25–28 px** high.
- Print symbol minimum: **6 mm** high.
- Below 20 px, use the supplied app/favicon artwork and do not reduce the stroke weight.

## Wordmark relationship

The current product wordmark uses the platform’s sans-serif brand face with a strong weight and tight tracking. The symbol and name should feel like one compact signature, with a gap approximately one-third of the symbol width.

Do not place the symbol inside the first letter of the wordmark. Keeping the symbol independent improves recognition at small sizes and makes the symbol-only version usable throughout the product.

## Misuse

Do not:

- stretch, shear, rotate, or redraw the mark;
- change the relationship between its two strokes;
- fill the loops or convert the mark into an outlined container;
- use gradients, shadows, or multiple colors inside the symbol;
- restore the previous three-diamond or three-loop marks;
- place the primary green mark on a low-contrast color;
- use the mark as a decorative workflow node or repeat it as a background pattern.

## Production assets

- React master component: `apps/web/src/KnotlineLogo.tsx`
- Primary SVG: `apps/web/public/brand/knotline-mark.svg`
- Reversed SVG: `apps/web/public/brand/knotline-mark-reversed.svg`
- 192 px application icon: `apps/web/public/icons/icon-192.svg`
- 512 px application icon: `apps/web/public/icons/icon-512.svg`

The React component and public SVGs share the same `0 0 48 48` master geometry. When the geometry changes, all exported assets must be updated and visually compared at 20 px, 28 px, 96 px, and 512 px.

## Ownership and clearance

The concept and artwork were created specifically for the Knotline product. A general web search did not identify another software product using this exact name-and-symbol combination. This is not legal clearance. Before public launch or trademark filing, commission a professional similarity search in the intended countries and product classes.
