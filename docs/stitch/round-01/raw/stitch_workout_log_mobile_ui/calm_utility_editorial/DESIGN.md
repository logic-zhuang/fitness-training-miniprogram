---
name: Calm Utility Editorial
colors:
  surface: '#edfef0'
  surface-dim: '#cdded2'
  surface-bright: '#edfef0'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#e7f8eb'
  surface-container: '#e1f2e5'
  surface-container-high: '#dcecdf'
  surface-container-highest: '#d6e7da'
  on-surface: '#111e17'
  on-surface-variant: '#3f4942'
  inverse-surface: '#25342b'
  inverse-on-surface: '#e4f5e8'
  outline: '#6f7a71'
  outline-variant: '#bec9bf'
  surface-tint: '#006d44'
  primary: '#005e3a'
  on-primary: '#ffffff'
  primary-container: '#18784e'
  on-primary-container: '#a3fdc8'
  inverse-primary: '#80d8a6'
  secondary: '#56615b'
  on-secondary: '#ffffff'
  secondary-container: '#dae5de'
  on-secondary-container: '#5c6761'
  tertiary: '#7d4200'
  on-tertiary: '#ffffff'
  tertiary-container: '#a15600'
  on-tertiary-container: '#ffe6d5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9cf5c1'
  primary-fixed-dim: '#80d8a6'
  on-primary-fixed: '#002111'
  on-primary-fixed-variant: '#005232'
  secondary-fixed: '#dae5de'
  secondary-fixed-dim: '#bec9c3'
  on-secondary-fixed: '#141e1a'
  on-secondary-fixed-variant: '#3f4944'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#edfef0'
  on-background: '#111e17'
  surface-variant: '#d6e7da'
typography:
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  data-display-lg:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  data-display-md:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 24px
  data-unit:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.75rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.25rem
---

## Brand & Style

This design system is engineered for mindful, high-frequency strength and conditioning logging. The brand voice avoids loud, gamified hyper-energetic gym marketing clichés, aggressive neon glow, and high-pressure visual noise. Instead, it embodies quiet confidence, clarity, functional precision, and restorative focus—resembling a finely crafted digital field notebook or high-end laboratory log.

The aesthetic fuses **Modern Functional Utility** with **Gentle Organic Tactility**:
- Crisp, legible data density tailored for single-handed use during strenuous workout sessions.
- Generous breathable white space structured with quiet borders, avoiding visual fatigue.
- Subdued athletic green accents that communicate progress, recovery, and steady discipline.

## Colors

The palette establishes an organic, distraction-free environment that prioritizes optical ergonomics under bright gym lighting:

- **Primary (`#18784E`)**: Deep athletic forest green, applied to key action triggers, primary buttons, confirmed sets, and completion status.
- **Primary Container / Tint (`#EAF5EE`)**: Soft moss wash used as low-contrast accent fills, active filter chips, set-complete check backgrounds, and selected card headers.
- **Background (`#F4F6F5`)**: Muted limestone neutral that eliminates harsh screen glare while separating cleanly from floating card surfaces.
- **Surface (`#FFFFFF`)**: Pure white reserved for cards, sheets, elevated inputs, and modal containers.
- **Text Primary (`#17251D`)**: Deep pine-tinted charcoal for maximum contrast without the harshness of pure `#000000`.
- **Text Secondary (`#52645A`)**: Mid-tone leafy slate for meta-data, secondary metrics, inactive states, and structural labels.
- **Border / Divider (`#DCE5DF`)**: Soft boundary tone to establish clean visual containers without heavy shadows.
- **Status States**:
  - Success / Synced: `#18784E`
  - Pending / Draft: `#D97706`
  - Danger / Abandon: `#DC2626`

## Typography

The type system prioritizes instantaneous legibility under motion and exertion:

- **Primary Latin & Numerals**: Paired with modern tabular-ready geometric sans (`Space Grotesk` / `Plus Jakarta Sans`) to mirror athletic instrument precision.
- **Chinese Fallback Hierarchy**: System-native Sans (`-apple-system`, `BlinkMacSystemFont`, `"PingFang SC"`, `"Hiragino Sans GB"`, `"Microsoft YaHei"`, `sans-serif`) ensures native OS rendering speed and flawless typographic balance in WeChat Mini-Programs and Web views.
- **Tabular Figures (`tnum`)**: All numeric inputs, weights, reps, rest timers, and historical volume metrics must render with monospaced numeral alignment (`font-variant-numeric: tabular-nums`).
- **Data & Units**: Metric units (`kg`, `次`, `组`, `min`, `sec`) must always be styled with `data-unit` at 12–13px, positioned adjacent to numeric readouts in `Text Secondary` (`#52645A`) to ensure unambiguous glanceability.

## Layout & Spacing

The layout is built around an 8px base rhythm with 4px micro-steps:

- **Mobile First Canvas**: 16px (`1rem`) outer canvas margins ensure card contents stay clear of modern curved edge displays.
- **Thumb Zone Architecture**: All high-cadence interactions (add set, finish exercise, increment weight, start rest timer) are anchored in the bottom 45% screen tier (`Safe Area Bottom` compliant).
- **Gutter & Stacking**: Vertical stack gap between exercise blocks is consistently 12px or 16px to prevent scroll overload while maintaining distinct group boundaries.
- **Minimum Tap Targets**: Every clickable interactive surface—steppers, checkmark buttons, chip toggles—must span at least 44px × 44px of hit area, even if visible visual footprint is 32px or 36px.

## Elevation & Depth

Visual hierarchy relies entirely on **Tonal Layering** and **Subtle Structural Outlines** rather than heavy blurred drop shadows:

- **Ground Level (Canvas)**: `#F4F6F5` serves as the canvas foundation.
- **Level 1 (Cards & Data Sections)**: `#FFFFFF` surface enclosed by a sharp, crisp 1px hairline border in `#DCE5DF`. No shadow is cast in static resting states.
- **Level 2 (Floating Action Trays / Bottom Sheets)**: `#FFFFFF` surface bordered by `#DCE5DF` at the top edge, supported by an ultra-diffused atmospheric shadow: `0px -4px 16px rgba(23, 37, 29, 0.04)`.
- **Level 3 (Modals & Rest Overlays)**: Surface `#FFFFFF` on top of a soft charcoal backdrop scrim `rgba(23, 37, 29, 0.45)`.
- **Active State / Completed Set**: Background shifts gently from `#FFFFFF` to `#EAF5EE`, maintaining a calm border of `#18784E` at 1px width.

## Shapes

The geometry strikes a balance between ergonomic softness and functional precision:

- **Cards and Module Panels**: 12px border radius.
- **Buttons (Primary & Secondary)**: 10px to 12px border radius to preserve a solid, pressable affordance.
- **Tags, Status Badges, and Numeric Pill Modifiers**: 6px border radius for compact readability.
- **Circular Utilities**: 50% radius (full circle) exclusively for icon buttons, set index numbers, timer rings, and set completion checkboxes.

## Components

### Buttons
- **Primary Action**: Height 48px, background `#18784E`, text `#FFFFFF`, radius 10px, typography `body-lg` Semibold. Pressed state: `#13603E`.
- **Secondary Action**: Height 44px, background `#EAF5EE`, text `#18784E`, border none, radius 10px. Pressed state: background `#DAECE0`.
- **Ghost / Destructive**: Background transparent, text `#DC2626`, hit target 44px.

### Training Set Table Row (Core Functional Component)
- **Grid Layout**: 4 columns (Set Index 32px, Previous Record 70px, Weight Input 1fr, Reps Input 1fr, Complete Checkbox 44px).
- **Completed Set**: Background animates softly into `#EAF5EE`; values shift to `#18784E` font weight 600; checkbox reveals checkmark in `#18784E`.
- **Draft / In-progress**: Background `#FFFFFF`, border bottom 1px `#DCE5DF`.

### Numeric Input Fields (Weight & Reps)
- **Container**: Height 42px, radius 8px, background `#F4F6F5`, border 1px solid transparent.
- **Focus State**: Background `#FFFFFF`, border 1.5px solid `#18784E`, text `#17251D`.
- **Inline Incrementors**: Large + / - stepper targets (44px hit bounds) for one-handed thumb nudges without invoking system keyboard unless tapped directly.

### Chips & Filter Tags
- **Default**: Height 32px, padding 0 12px, radius 6px, background `#FFFFFF`, border 1px solid `#DCE5DF`, text `#52645A`.
- **Selected**: Background `#EAF5EE`, border 1px solid `#18784E`, text `#18784E` font weight 600.

### Checkboxes
- **Set Completion**: 28px diameter circle with 44px touch area.
- **Unchecked**: Border 2px solid `#DCE5DF`, background transparent.
- **Checked**: Background `#18784E`, border none, icon white 16px checkmark.

### Rest Timer Bottom Bar
- Height 64px anchored to viewport bottom with safe-area padding. Background `#FFFFFF`, top border 1px `#DCE5DF`.
- Left: Dynamic countdown clock in `Space Grotesk` (`#18784E`).
- Right: Quick increment pills (+30s, Skip) in `#F4F6F5`.