import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent, FormEvent, MouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { DocReader } from './reader/DocReader';
import { manualHtml, manualSections } from './data/manualContent';
import { DEFAULT_TRANSLATIONS } from './data/seeds';
import defaultmediaassetsJson from '../content/media-assets.json' with { type: 'json' };
import defaultgamesJson from '../content/games.json' with { type: 'json' };
import defaultdocsJson from '../content/docs.json' with { type: 'json' };
import customSectionsJson from '../content/custom-sections.json' with { type: 'json' };
import backofficeSectionArgsJson from '../content/sections/backoffice.json' with { type: 'json' };
import integrationSectionArgsJson from '../content/sections/integration.json' with { type: 'json' };
import { attachDocCarouselInteractions, attachDocTabInteractions, attachMarkerHotspotInteractions, clampBetween, clampPct, readPctData } from './shared/docInteractions';
import { auth, canRoleWrite, isPrehydrationSafeKey, notifyBlockedWrite, store } from './storage';
import type { PersistenceStatus, UserRole, WritePermission } from './storage';
import MarketingLanding from './marketing/MarketingLanding';
import './marketing/marketing.css';
import CompanyLanding from './multitenant/CompanyLanding';
import { CompanyAdmin } from './multitenant/CompanyAdmin';
import SuperAdminShell from './multitenant/SuperAdminShell';
import DocAuthGate from './multitenant/DocAuthGate';
import LandingPageEditor from './multitenant/LandingPageEditor';
import TenantUsersPage from './multitenant/TenantUsersPage';
import { TenantCMSEntry } from './multitenant/CompanyCMSShell';
import { authMeCached, publicDocCompany } from './multitenant/api';
import './multitenant/multitenant.css';
import './multitenant/company-admin.css';
import './multitenant/superadmin.css';
import './multitenant/company-cms.css';

type Toast = { id: number; message: string; kind: 'success' | 'error' };
type ModalState = { title: string; content: ReactNode } | null;
type ValidationIssue = { kind: 'error' | 'warning'; message: string };
type WarningConfirmProps = {
  eyebrow?: string;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  close: () => void;
  confirm: () => void;
};
type WorkflowStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';
const WORKFLOW_STATUSES: WorkflowStatus[] = ['draft', 'review', 'approved', 'published', 'archived'];
type TranslationStatus = 'not-started' | 'in-progress' | 'review' | 'published';
type TranslationRowState = 'dirty' | 'saved' | 'review';
type TextToolId = 'h3' | 'h4' | 'bold' | 'italic' | 'code' | 'bullet' | 'quote' | 'link' | 'callout' | 'image';
type TextTool = { id: TextToolId; label: string; icon: string; sample: string };
type InlineRichToolId = 'bold' | 'italic' | 'code' | 'link' | 'clear';
type InlineRichTool = { id: InlineRichToolId; label: string; icon: string };
type DocKind = 'game' | 'back-office' | 'integration' | 'operations';
type NavPlacement = 'primary' | 'secondary' | 'hidden';
type HighlightColor = 'black' | 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'gray';
type HighlightPreset = { id: HighlightColor; label: string; sample: string };
type DocumentTemplate = {
  id: string;
  label: string;
  family: string;
  type: DocKind;
  presentation: string;
  effect: string;
  title: string;
  description: string;
  audience: string;
  taxonomy: string;
  navPlacement: NavPlacement;
  owner: string;
  sections: { slug: string; title: string; summary: string; paragraphs: string[] }[];
};
type LocalizationKey = { id: string; section: string; label: string; defaultValue: string; docId: string; docTitle: string };
type InlineEditableKind = 'section-title' | 'heading' | 'paragraph' | 'list-item' | 'definition' | 'table-cell' | 'caption' | 'callout-title';
type InlineEditableTarget = {
  index: number;
  kind: InlineEditableKind;
  label: string;
  value: string;
  top: number;
  left: number;
  width: number;
  height: number;
  rootWidth: number;
};
type ScreenshotEditableTarget = {
  index: number;
  label: string;
  src: string;
  alt: string;
  caption: string;
  markers: MarkerDraft[];
  top: number;
  left: number;
  width: number;
  height: number;
  rootWidth: number;
};
type MediaAsset = {
  id: string;
  src: string;
  alt: string;
  tags: string[];
  owner: string;
  updatedAt: string;
  usageRefs: string[];
  videoLoopEnabled?: boolean;
  thumbnailSrc?: string;
  fileName?: string;
  originalName?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: string;
};
type UploadedMediaFile = {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  src: string;
  createdAt: string;
};
type ContentComment = {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  scope: string;
};
type MarkerTextAlign = 'left' | 'center' | 'right';
type MarkerKind = 'shape' | 'link' | 'pointer' | 'text';
type MarkerBorderStyle = 'solid' | 'dashed' | 'dotted';
type MarkerDraft = {
  id: string;
  label: string;
  description: string;
  x: number;
  y: number;
  w: number;
  h: number;
  popoverX: number;
  popoverY: number;
  align: MarkerTextAlign;
  kind: MarkerKind;
  borderStyle: MarkerBorderStyle;
  borderColor: string;
  borderOpacity: number;
  backgroundColor: string;
  backgroundOpacity: number;
  textColor: string;
  textOpacity: number;
  dialogBackgroundColor: string;
  dialogBackgroundOpacity: number;
  dialogBorderColor: string;
  dialogBorderOpacity: number;
  dialogTextColor: string;
  dialogTextOpacity: number;
  ctaBackgroundColor: string;
  ctaBackgroundOpacity: number;
  ctaTextColor: string;
  ctaTextOpacity: number;
  targetSectionId: string;
  animated: boolean;
  pointerRotation: number;
  pointerThickness: number;
};
type MarkerColorPreset = {
  id: string;
  name: string;
  borderColor: string;
  borderOpacity: number;
  backgroundColor: string;
  backgroundOpacity: number;
  textColor: string;
  textOpacity: number;
  locked?: boolean;
};
type ThemePreset = {
  id: string;
  name: string;
  primary: string;
  accent: string;
  ink: string;
  surface: string;
  markerFill: string;
  markerBorder: string;
  readerAccent: string;
  readerDefaultMode: 'light' | 'dark' | 'system';
  locked?: boolean;
};
type MarkerResizeEdge = 'n' | 'e' | 's' | 'w' | 'ne' | 'se' | 'sw' | 'nw';
type SectionTargetOption = { id: string; label: string };
type MarkerDragSurface = {
  previewLeft: number;
  previewTop: number;
  previewWidth: number;
  previewHeight: number;
};
type MarkerDragState =
  | ({ id: string; mode: 'move'; offsetX: number; offsetY: number; markerWidth: number; markerHeight: number } & MarkerDragSurface)
  | ({ id: string; mode: 'resize'; edge: MarkerResizeEdge; originX: number; originY: number; originW: number; originH: number } & MarkerDragSurface)
  | ({ id: string; mode: 'rotate'; centerX: number; centerY: number; rotationOffset: number } & MarkerDragSurface)
  | ({ id: string; mode: 'popover'; offsetX: number; offsetY: number; popoverWidth: number; popoverHeight: number } & MarkerDragSurface);
type ScreenshotDraft = Pick<ScreenshotEditableTarget, 'src' | 'alt' | 'caption' | 'markers'>;
type DocComponentKind = 'callout' | 'accordion' | 'tabs' | 'list' | 'table' | 'regions' | 'steps' | 'carousel';
type DocComponentItem = { id: string; title: string; body: string };
type DocComponentTableRow = { id: string; cells: string[] };
type DocComponentBlock = {
  id: string;
  kind: DocComponentKind;
  title: string;
  body: string;
  variant: string;
  ordered: boolean;
  items: DocComponentItem[];
  columns: string[];
  rows: DocComponentTableRow[];
};
type ComponentEditableTarget = {
  index: number;
  label: string;
  block: DocComponentBlock;
  top: number;
  left: number;
  width: number;
  height: number;
  rootWidth: number;
};
type ComponentInsertTarget = {
  index: number;
  top: number;
  left: number;
  width: number;
  height: number;
  rootWidth: number;
};
type RevisionStack<T> = { past: T[]; future: T[] };
type RevisionHistoryEntry = {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  version: string;
  sectionId?: string;
  snapshot: SectionEntry[];
};
type DragPosition = 'before' | 'after';
type DragTarget = { id: string; position: DragPosition };
type ProductEntry = {
  id: string;
  name: string;
  description: string;
  version: string;
  status: WorkflowStatus;
  updatedAt: string;
  docs: DocEntry[];
};
type SectionEditorDraft = {
  mode: 'text' | 'html';
  draftHtml: string;
  draftText: string;
  imageUrl: string;
  markerLabel: string;
  markerDescription: string;
  markerX: number;
  markerY: number;
  markerW: number;
  markerH: number;
  markerAlign: MarkerTextAlign;
  markerKind: MarkerKind;
  markerBorderStyle: MarkerBorderStyle;
  markerBorderColor: string;
  markerBorderOpacity: number;
  markerBackgroundColor: string;
  markerBackgroundOpacity: number;
  markerTextColor: string;
  markerTextOpacity: number;
  markerTargetSectionId: string;
  markerAnimated: boolean;
  markerPointerRotation: number;
  markerPointerThickness: number;
  title: string;
  slug: string;
  owner: string;
  status: WorkflowStatus;
  reviewer: string;
  reviewComment: string;
};
const MARKER_TEXT_ALIGNMENTS: MarkerTextAlign[] = ['left', 'center', 'right'];
const MARKER_TEXT_ALIGN_LABELS: Record<MarkerTextAlign, string> = { left: 'Left', center: 'Center', right: 'Right' };
const MARKER_KINDS: MarkerKind[] = ['shape', 'link', 'pointer', 'text'];
const MARKER_KINDS_LABELS: Record<MarkerKind, string> = {
  shape: 'Shape',
  link: 'Link',
  pointer: 'Pointer',
  text: 'Text',
};
const MARKER_BORDER_STYLES: MarkerBorderStyle[] = ['solid', 'dashed', 'dotted'];
const MARKER_BORDER_STYLE_LABELS: Record<MarkerBorderStyle, string> = {
  solid: 'Solid',
  dashed: 'Dashed',
  dotted: 'Dotted',
};
// Screenshot-annotation defaults: transparent fill, brand red, dotted border.
// User intent: drop a marker, see the underlying screenshot through it,
// dotted ring draws the eye without obscuring the content.
const MARKER_DEFAULT_BORDER_STYLE: MarkerBorderStyle = 'dotted';
const MARKER_DEFAULT_BORDER_COLOR = '#ff1b23';
const MARKER_DEFAULT_BORDER_OPACITY = 100;
const MARKER_DEFAULT_BACKGROUND_COLOR = '#ff1b23';
const MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY = 0;
// Pointer/link kinds (arrow + chip) need a fill to remain identifiable;
// shapes (region overlays) stay fully transparent.
const MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY = 100;
// Link markers are circles. By default they show a red ring with the chain
// icon centred — no fill — so the underlying screenshot stays readable.
const MARKER_DEFAULT_LINK_BACKGROUND_OPACITY = 0;
// Text markers are plain on-screenshot annotations: no border, no fill,
// just the label text rendered with a readable shadow.
const MARKER_DEFAULT_TEXT_BACKGROUND_OPACITY = 0;

function defaultBgOpacityFor(kind: MarkerKind): number {
  if (kind === 'shape') return MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY;
  if (kind === 'link') return MARKER_DEFAULT_LINK_BACKGROUND_OPACITY;
  if (kind === 'text') return MARKER_DEFAULT_TEXT_BACKGROUND_OPACITY;
  return MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY;
}
const MARKER_DEFAULT_TEXT_COLOR = '#ffffff';
const MARKER_DEFAULT_TEXT_OPACITY = 100;
const MARKER_DEFAULT_DIALOG_BACKGROUND_COLOR = '#101a2b';
const MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY = 100;
const MARKER_DEFAULT_DIALOG_BORDER_COLOR = '#7aa3d6';
const MARKER_DEFAULT_DIALOG_BORDER_OPACITY = 100;
const MARKER_DEFAULT_DIALOG_TEXT_COLOR = '#f4f8ff';
const MARKER_DEFAULT_DIALOG_TEXT_OPACITY = 100;
const MARKER_DEFAULT_CTA_BACKGROUND_COLOR = '#2b5fc8';
const MARKER_DEFAULT_CTA_BACKGROUND_OPACITY = 100;
const MARKER_DEFAULT_CTA_TEXT_COLOR = '#ffffff';
const MARKER_DEFAULT_CTA_TEXT_OPACITY = 100;
const MARKER_DEFAULT_LINK_LABEL = 'See more ->';
const MARKER_DEFAULT_POINTER_TARGET = '';
const MARKER_DEFAULT_ANIMATION = false;
const MARKER_DEFAULT_POINTER_ROTATION = 45;
const MARKER_DEFAULT_POINTER_THICKNESS = 2;
const MARKER_COLOR_PRESET_LIMIT = 14;
const MARKER_COLOR_PRESETS_DEFAULT: MarkerColorPreset[] = [
  { id: 'preset-crimson', name: 'Crimson', borderColor: '#a92a34', borderOpacity: 100, backgroundColor: '#a92a34', backgroundOpacity: 100, textColor: '#ffffff', textOpacity: 100, locked: true },
  { id: 'preset-ruby', name: 'Ruby', borderColor: '#e11d48', borderOpacity: 100, backgroundColor: '#fb7185', backgroundOpacity: 100, textColor: '#23040d', textOpacity: 100, locked: true },
  { id: 'preset-tangerine', name: 'Tangerine', borderColor: '#c2410c', borderOpacity: 100, backgroundColor: '#fb923c', backgroundOpacity: 100, textColor: '#271105', textOpacity: 100, locked: true },
  { id: 'preset-amber', name: 'Amber', borderColor: '#b45309', borderOpacity: 100, backgroundColor: '#facc15', backgroundOpacity: 100, textColor: '#241406', textOpacity: 100, locked: true },
  { id: 'preset-lime', name: 'Lime', borderColor: '#89b300', borderOpacity: 100, backgroundColor: '#d4ff00', backgroundOpacity: 100, textColor: '#111111', textOpacity: 100, locked: true },
  { id: 'preset-mint', name: 'Mint', borderColor: '#0f766e', borderOpacity: 100, backgroundColor: '#2dd4bf', backgroundOpacity: 100, textColor: '#052322', textOpacity: 100, locked: true },
  { id: 'preset-electric', name: 'Electric', borderColor: '#0284c7', borderOpacity: 100, backgroundColor: '#38bdf8', backgroundOpacity: 100, textColor: '#041321', textOpacity: 100, locked: true },
  { id: 'preset-violet', name: 'Violet', borderColor: '#6d28d9', borderOpacity: 100, backgroundColor: '#a78bfa', backgroundOpacity: 100, textColor: '#130525', textOpacity: 100, locked: true },
  { id: 'preset-dark', name: 'Dark', borderColor: '#1f2730', borderOpacity: 100, backgroundColor: '#12181f', backgroundOpacity: 100, textColor: '#f3f7fb', textOpacity: 100, locked: true },
];
const THEME_PRESET_LIMIT = 10;
const DEFAULT_THEME_PRESETS: ThemePreset[] = [
  { id: 'theme-crimson-core', name: 'Crimson Core', primary: '#ff1b23', accent: '#63cdff', ink: '#191919', surface: '#f8f5ef', markerFill: '#a92a34', markerBorder: '#a92a34', readerAccent: '#ff1b23', readerDefaultMode: 'dark', locked: true },
  { id: 'theme-flight-ops', name: 'Flight Ops', primary: '#ef3b25', accent: '#0050b3', ink: '#151719', surface: '#f6f9fb', markerFill: '#2b5fc8', markerBorder: '#0050b3', readerAccent: '#ff1b23', readerDefaultMode: 'dark', locked: true },
  { id: 'theme-reader-calm', name: 'Reader Calm', primary: '#910d19', accent: '#36a9e1', ink: '#26313a', surface: '#fbfaf6', markerFill: '#0b9050', markerBorder: '#0b9050', readerAccent: '#ff1b23', readerDefaultMode: 'dark', locked: true },
];
const MARKER_RESIZE_EDGES: MarkerResizeEdge[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MIN_MARKER_SIZE = 4;
const REVISION_LIMIT = 50;
const TRANSLATION_PAGE_SIZE = 50;
const VIDEO_LOOP_PLAY_COUNT = 10;
const DOC_COMPONENT_TYPES: { kind: DocComponentKind; label: string }[] = [
  { kind: 'callout', label: 'Callout' },
  { kind: 'accordion', label: 'Accordion' },
  { kind: 'tabs', label: 'Tabs' },
  { kind: 'list', label: 'List' },
  { kind: 'table', label: 'Table' },
  { kind: 'regions', label: 'Region List' },
  { kind: 'steps', label: 'Steps' },
  { kind: 'carousel', label: 'Image Carousel' },
];
const DOC_COMPONENT_VARIANTS = ['info', 'success', 'warning', 'danger', 'note'];
const DOC_COMPONENT_VARIANT_LABELS: Record<string, string> = {
  info: 'Info',
  success: 'Success',
  warning: 'Warning',
  danger: 'Danger',
  note: 'Note',
};
const DOC_COMPONENT_DRAG_TYPE = 'application/x-doc-component-kind';
const DEFAULT_MEDIA_ASSETS: MediaAsset[] = defaultmediaassetsJson as MediaAsset[];
const ADMIN_PAGES = ['dashboard', 'documents', 'sections', 'media', 'translations', 'publishing', 'products', 'users', 'landing'] as const;

interface GameEntry {
  id: string;
  name: string;
  studio: string;
  status: WorkflowStatus;
  description: string;
  version: string;
  updatedAt: string;
}

interface DocEntry {
  id: string;
  gameId: string;
  title: string;
  slug?: string;
  type: DocKind;
  description: string;
  version: string;
  status: WorkflowStatus;
  owner: string;
  reviewer?: string;
  comments?: ContentComment[];
  audience?: string;
  taxonomy?: string;
  navPlacement?: NavPlacement;
  navOrder?: number;
  templateId?: string;
  updatedAt: string;
  sections: number;
}

interface SectionEntry {
  id: string;
  number: string;
  slug: string;
  title: string;
  summary: string;
  status: WorkflowStatus;
  owner: string;
  reviewer?: string;
  comments?: ContentComment[];
  updatedAt: string;
  html: string;
}

interface TranslationEntry {
  code: string;
  language: string;
  nativeName: string;
  status: TranslationStatus;
  owner?: string;
  reviewer: string;
  dueDate?: string;
  updatedAt: string;
  values: Record<string, string>;
  rowMeta?: Record<string, { state: TranslationRowState; comment?: string; updatedAt: string }>;
}

interface ReleaseEntry {
  id: string;
  docId: string;
  version: string;
  label: string;
  status: 'draft' | 'published' | 'rolled-back';
  notes: string;
  createdAt: string;
  actor?: string;
  sourceRevision?: string;
  previousSnapshotId?: string;
  environment?: 'draft' | 'staging' | 'production';
  readinessScore?: number;
  readinessReasons?: string[];
  snapshot?: PublishSnapshot;
  immutable?: boolean;
  rollbackOf?: string;
}

type AuditAction = 'create' | 'update' | 'delete' | 'review' | 'publish' | 'rollback' | 'revoke';
type AuditEntityType = 'document' | 'section' | 'release' | 'integration' | 'product';
type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  documentId?: string;
  sectionId?: string;
  releaseId?: string;
  title: string;
  summary: string;
};

type PublishSnapshot = {
  id: string;
  doc: DocEntry;
  sections: SectionEntry[];
  localization: { code: string; status: TranslationStatus; progress: number }[];
  markerTargets: string[];
  readiness: { ready: boolean; score: number; reasons: string[] };
  actor: string;
  createdAt: string;
  environment: 'staging' | 'production';
  priorSnapshotId?: string;
};

const today = () => new Date().toISOString().slice(0, 10);

const TEXT_TOOLS: TextTool[] = [
  { id: 'h3', label: 'Heading', icon: 'H3', sample: 'Heading' },
  { id: 'h4', label: 'Subheading', icon: 'H4', sample: 'Subheading' },
  { id: 'bold', label: 'Bold', icon: 'B', sample: 'bold text' },
  { id: 'italic', label: 'Italic', icon: 'I', sample: 'italic text' },
  { id: 'code', label: 'Inline Code', icon: '<>', sample: 'code' },
  { id: 'bullet', label: 'Bulleted List', icon: '*', sample: 'List item' },
  { id: 'quote', label: 'Quote', icon: 'Q', sample: 'Quote text' },
  { id: 'link', label: 'Link', icon: 'A', sample: 'Link text' },
  { id: 'callout', label: 'Info Callout', icon: '!', sample: 'Important note' },
  { id: 'image', label: 'Annotated Image', icon: 'IMG', sample: 'Annotated screenshot' },
];
const INLINE_RICH_TOOLS: InlineRichTool[] = [
  { id: 'bold', label: 'Bold', icon: 'B' },
  { id: 'italic', label: 'Italic', icon: 'I' },
  { id: 'code', label: 'Inline code', icon: '<>' },
  { id: 'link', label: 'Link', icon: 'A' },
  { id: 'clear', label: 'Clear formatting', icon: 'Tx' },
];
const HIGHLIGHT_PRESETS: HighlightPreset[] = [
  { id: 'black', label: 'Black highlight', sample: 'Highlighted text' },
  { id: 'green', label: 'Green highlight', sample: 'BET' },
  { id: 'yellow', label: 'Yellow highlight', sample: 'Warning' },
  { id: 'red', label: 'Red highlight', sample: 'CASH OUT' },
  { id: 'blue', label: 'Blue highlight', sample: 'Info' },
  { id: 'purple', label: 'Purple highlight', sample: 'Multiplier' },
  { id: 'gray', label: 'Gray highlight', sample: 'Disabled' },
];
const DOC_NAV_PLACEMENTS: NavPlacement[] = ['primary', 'secondary', 'hidden'];
const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'operator-guide',
    label: 'Operator guide',
    family: 'Operations enablement',
    type: 'back-office',
    presentation: 'Primary reader navigation with workflow-first sections and escalation callouts.',
    effect: 'Template edits apply to newly created operator guides; existing guides keep their live sections until manually revised.',
    title: 'Operator Guide',
    description: 'Operational guide for back-office users, support teams, and product owners.',
    audience: 'Operators and internal teams',
    taxonomy: 'operations, back-office, support',
    navPlacement: 'primary',
    owner: 'Docs',
    sections: [
      { slug: 'overview', title: 'Overview', summary: 'Purpose, audience, and expected operating model.', paragraphs: ['Use this document to explain who the workflow is for, which operator jobs it supports, and what the reader should be able to do after reading it.'] },
      { slug: 'workflow', title: 'Workflow', summary: 'Step-by-step operating path.', paragraphs: ['Describe the normal path first, including required permissions, source screens, validation checks, and where the workflow hands off to another team.'] },
      { slug: 'exceptions', title: 'Exceptions And Escalation', summary: 'Known edge cases, blockers, and escalation paths.', paragraphs: ['List empty states, rejected states, permission failures, rollback conditions, and the exact information support or product teams need when escalation is required.'] },
    ],
  },
  {
    id: 'release-notes',
    label: 'Release notes',
    family: 'Release operations',
    type: 'operations',
    presentation: 'Secondary reader navigation with scope, verification, and rollback structure.',
    effect: 'Template edits apply to future release notes; published release docs keep their snapshot-ready section content.',
    title: 'Release Notes',
    description: 'Release-facing summary with scope, risk, verification, and rollback guidance.',
    audience: 'Release managers, QA, support',
    taxonomy: 'release, qa, rollback',
    navPlacement: 'secondary',
    owner: 'Release',
    sections: [
      { slug: 'scope', title: 'Scope', summary: 'What changed and why it matters.', paragraphs: ['Summarize the shipped change, affected products, target users, and out-of-scope items that support teams should not promise.'] },
      { slug: 'verification', title: 'Verification', summary: 'Checks required before release.', paragraphs: ['Record smoke paths, acceptance criteria, localization checks, security-sensitive areas, and evidence links required before publish.'] },
      { slug: 'rollback', title: 'Rollback', summary: 'Recovery plan and owner.', paragraphs: ['Describe rollback triggers, data considerations, owner responsibilities, and customer-facing messaging if the release needs to be paused or reverted.'] },
    ],
  },
  {
    id: 'integration-reference',
    label: 'Integration reference',
    family: 'Partner integration',
    type: 'integration',
    presentation: 'Primary reader navigation with technical reference, testing, and launch handoff sections.',
    effect: 'Template edits apply to newly created partner references; existing integration docs retain approved API wording.',
    title: 'Integration Reference',
    description: 'Partner-facing technical reference for APIs, events, and launch behavior.',
    audience: 'Partner developers and TAMs',
    taxonomy: 'integration, api, partner',
    navPlacement: 'primary',
    owner: 'Integrations',
    sections: [
      { slug: 'prerequisites', title: 'Prerequisites', summary: 'Required keys, URLs, roles, and setup.', paragraphs: ['List environments, credentials, provider identifiers, allowed origins, and contact points needed before technical integration starts.'] },
      { slug: 'api-reference', title: 'API Reference', summary: 'Endpoint behavior and examples.', paragraphs: ['Document request shape, response shape, errors, retry expectations, idempotency, and safe example payloads.'] },
      { slug: 'test-plan', title: 'Test Plan', summary: 'Validation paths before launch.', paragraphs: ['Define sandbox checks, launch checks, settlement checks, webhook checks, negative cases, and handoff evidence expected from the partner.'] },
    ],
  },
  {
    id: 'game-manual',
    label: 'Game manual',
    family: 'Game documentation',
    type: 'game',
    presentation: 'Primary reader navigation with gameplay, controls, and support trust sections.',
    effect: 'Template edits apply to future manuals; existing player-facing manuals keep reviewed support and rules content.',
    title: 'Game Manual',
    description: 'Player and operator-facing gameplay reference.',
    audience: 'Players, operators, support',
    taxonomy: 'gameplay, support, rules',
    navPlacement: 'primary',
    owner: 'Product',
    sections: [
      { slug: 'concept', title: 'Game Concept', summary: 'Short explanation of the product and core loop.', paragraphs: ['Explain the game in product language: goal, main controls, key states, and what success or failure means to the user.'] },
      { slug: 'controls', title: 'Controls And States', summary: 'What users can do in each state.', paragraphs: ['Map visible controls to user actions, disabled states, validation rules, and state transitions that support should understand.'] },
      { slug: 'fairness-support', title: 'Fairness And Support Notes', summary: 'Player trust, disputes, and support evidence.', paragraphs: ['Describe verification, dispute inputs, common misunderstandings, and support-friendly explanations for regulated or trust-sensitive behavior.'] },
    ],
  },
];

const DEFAULT_GAMES: GameEntry[] = defaultgamesJson as GameEntry[];

const PRODUCT_SETUP_STEPS = [
  'Create the product documentation stream.',
  'Pick a document template and audience.',
  'Add or import editable sections.',
  'Preview draft/published state before sharing.',
  'Run smoke checks before handoff.',
];

const DEFAULT_DOCS: DocEntry[] = defaultdocsJson as DocEntry[];

const sectionHtmlBlocks = extractManualSections(manualHtml);

const DEFAULT_SECTIONS: SectionEntry[] = manualSections.map((section, index) => {
  const html = sectionHtmlBlocks[index] ?? '';
  return {
    id: section.id,
    number: section.number,
    slug: section.slug,
    title: section.title,
    summary: getSectionSummary(html, index),
    status: index === 16 ? 'draft' : 'published',
    owner: index === 16 ? 'Product' : 'Docs',
    updatedAt: '2026-05-04',
    html,
  };
});

const DEFAULT_BACKOFFICE_SECTIONS: SectionEntry[] = (backofficeSectionArgsJson as Array<{id:string;number:string;slug:string;title:string;summary:string;status:WorkflowStatus;owner:string;paragraphs:string[]}>)
  .map((s) => docSection(s.id, s.number, s.slug, s.title, s.summary, s.status, s.owner, s.paragraphs));

const DEFAULT_INTEGRATION_SECTIONS: SectionEntry[] = (integrationSectionArgsJson as Array<{id:string;number:string;slug:string;title:string;summary:string;status:WorkflowStatus;owner:string;paragraphs:string[]}>)
  .map((s) => docSection(s.id, s.number, s.slug, s.title, s.summary, s.status, s.owner, s.paragraphs));

const DEFAULT_CUSTOM_SECTIONS: Record<string, SectionEntry[]> = customSectionsJson as Record<string, SectionEntry[]>;

const DEFAULT_LOCALIZATION_KEYS = buildLocalizationKeysFromBundles([
  { doc: DEFAULT_DOCS[0], sections: DEFAULT_SECTIONS },
  { doc: DEFAULT_DOCS[1], sections: DEFAULT_INTEGRATION_SECTIONS },
]);
const ENGLISH_VALUES = Object.fromEntries(DEFAULT_LOCALIZATION_KEYS.map((key) => [key.id, key.defaultValue]));

const DEFAULT_DOC_TRANSLATIONS: TranslationEntry[] = DEFAULT_TRANSLATIONS.map((pack, index) => ({
  code: pack.code,
  language: pack.name,
  nativeName: pack.nativeName,
  status: pack.status === 'disabled' ? 'not-started' : index < 8 ? 'published' : index < 16 ? 'review' : 'in-progress',
  owner: index < 8 ? 'Localization' : 'Regional Ops',
  reviewer: index < 8 ? 'Localization QA' : 'Unassigned',
  dueDate: `2026-06-${String((index % 20) + 1).padStart(2, '0')}`,
  updatedAt: pack.updatedAt,
  values: pack.code === 'en' ? ENGLISH_VALUES : Object.fromEntries(DEFAULT_LOCALIZATION_KEYS.map((key, keyIndex) => [
    key.id,
    pack.status === 'disabled' ? '' : keyIndex % 4 === 0 ? `[${pack.code}] ${key.defaultValue}` : '',
  ])),
}));

const DEFAULT_RELEASES: ReleaseEntry[] = [
  {
    id: 'rel-1-0-1',
    docId: 'doc-manual',
    version: '1.0.1',
    label: 'DocPilot Build 1.0.1',
    status: 'published',
    notes: 'Imported game user manual and first-pass docs CMS workspace.',
    createdAt: '2026-05-04',
    actor: 'seed',
    environment: 'production',
    immutable: true,
  },
  {
    id: 'rel-integration-1-0-0',
    docId: 'doc-integration',
    version: '1.0.0',
    label: 'Integration Docs 1.0.0',
    status: 'draft',
    notes: 'Seeded from uploaded integration PDF.',
    createdAt: '2026-05-05',
  },
];

function App() {
  return (
    <>
      <RouteScrollReset />
      <Routes>
        <Route path="/" element={<MarketingLanding />} />
        <Route path="/products" element={<Navigate to="/" replace />} />
        <Route path="/products/:productId" element={<Navigate to="/" replace />} />
        <Route path="/games" element={<Navigate to="/" replace />} />
        <Route path="/games/:gameId" element={<Navigate to="/" replace />} />
        <Route path="/docs/:docId" element={<GatedDocRoute><DocReaderRoute /></GatedDocRoute>} />
        <Route path="/manual" element={<Navigate to="/docs/doc-manual" replace />} />
        <Route path="/manual/:slug" element={<ManualRedirect />} />
        <Route path="/c/:slug" element={<CompanyLanding />} />
        <Route path="/c/:slug/app" element={<RedirectToTenantRoot />} />
        <Route path="/c/:slug/admin" element={<CompanyAdmin />} />
        <Route path="/c/:slug/admin/cms" element={<TenantCMSEntry><Admin /></TenantCMSEntry>} />
        <Route path="/c/:slug/admin/cms/:page" element={<TenantCMSEntry><Admin /></TenantCMSEntry>} />
        <Route path="/admin/v2/*" element={<SuperAdminShell />} />
        <Route path="/login" element={<Navigate to="/admin/v2/login" replace />} />
        <Route path="/admin/login" element={<Navigate to="/admin/v2/login" replace />} />
        <Route path="/admin" element={<Navigate to="/admin/v2/login" replace />} />
        <Route path="/admin/:page" element={<Navigate to="/admin/v2/login" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

function RouteScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname]);
  return null;
}

function BrandLogo({ product }: { product?: string }) {
  return (
    <Link className="brand-logo" to="/" aria-label="Go to DocPilot main page">
      <span className="brand-word">DocPilot<span>.</span></span>
      {product ? <span className="brand-product">{product}</span> : null}
    </Link>
  );
}

function DocPilotLogo() {
  return (
    <Link className="docpilot-logo" to="/" aria-label="DocPilot home">
      <span className="docpilot-word">Doc<span className="docpilot-word-accent">Pilot</span><span className="docpilot-dot">.</span></span>
    </Link>
  );
}

function RedirectToTenantRoot() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/c/${slug ?? ''}`} replace />;
}

function ManualRedirect() {
  const { slug = 'overview' } = useParams();
  const section = manualSections.find((item) => item.slug === slug) ?? manualSections[0];
  return <Navigate to={`/docs/doc-manual#${section.id}`} replace />;
}

// Gate for /docs/:docId — resolves the OWNING company's login for the bounce
// instead of hardcoding one tenant. Resolution happens only on actual denial
// (inside DocAuthGate); docs absent from the v2 documents table (e.g. KV-only
// fixtures) fall back to the landing page when the owning company can't be resolved.
function GatedDocRoute({ children }: { children: ReactNode }) {
  const { docId } = useParams<{ docId: string }>();
  const resolveLoginPath = useCallback(async () => {
    if (!docId) return null;
    try {
      const { company } = await publicDocCompany(docId);
      return `/c/${company.slug}`;
    } catch {
      return null;
    }
  }, [docId]);
  return (
    <DocAuthGate loginPath="/" resolveLoginPath={resolveLoginPath}>
      {children}
    </DocAuthGate>
  );
}

function DocReaderRoute() {
  const [games] = useStoredState('cms_games_v1', DEFAULT_GAMES);
  const [storedDocs] = useStoredState('cms_docs_v2', DEFAULT_DOCS);
  const [deletedDocIds] = useStoredState<string[]>('cms_deleted_doc_ids_v1', []);
  const docs = useMemo(
    () => mergeWithDefaults(storedDocs, DEFAULT_DOCS, (d) => d.id).filter((d) => !deletedDocIds.includes(d.id)),
    [storedDocs, deletedDocIds],
  );
  const [backOfficeSections] = useStoredState('cms_backoffice_sections_v1', DEFAULT_BACKOFFICE_SECTIONS);
  const [integrationSections] = useStoredState('cms_integration_sections_v1', DEFAULT_INTEGRATION_SECTIONS);
  const [manualSectionsState] = useStoredState('cms_sections_v2', DEFAULT_SECTIONS);
  const [customSections] = useStoredState<Record<string, SectionEntry[]>>('cms_custom_sections_v1', DEFAULT_CUSTOM_SECTIONS);
  const [storedThemePresets] = useStoredState<ThemePreset[]>('cms_theme_presets_v1', DEFAULT_THEME_PRESETS);
  const themePresets = useMemo(() => normalizeThemePresets(storedThemePresets), [storedThemePresets]);
  const [activeThemeId] = useStoredState('cms_active_theme_preset_v1', DEFAULT_THEME_PRESETS[0].id);
  const themePreset = resolveThemePreset(themePresets, activeThemeId);

  const resolveDoc = useCallback((docId: string) => {
    const doc = docs.find((item) => item.id === docId || docSlug(item) === docId);
    if (!doc) return null;
    const sections = getSectionsForDoc(doc.id, manualSectionsState, backOfficeSections, integrationSections, customSections);
    const products = buildProductCatalog(docs, games);
    const product = products.find((item) => item.id === doc.gameId);
    const siblingDocs = sortDocsForNavigation(docs.filter((item) => item.gameId === doc.gameId && docNavPlacement(item) !== 'hidden'));
    const idx = siblingDocs.findIndex((d) => d.id === doc.id);
    const prev = idx > 0 ? siblingDocs[idx - 1] : null;
    const next = idx >= 0 && idx < siblingDocs.length - 1 ? siblingDocs[idx + 1] : null;
    const availableDocs = docs
      .filter((item) => docNavPlacement(item) !== 'hidden')
      .map((item) => {
        const owningProduct = products.find((p) => p.id === item.gameId);
        return { id: item.id, title: item.title, productName: owningProduct?.name ?? null };
      });
    return {
      doc: {
        id: doc.id,
        title: doc.title,
        description: doc.description,
        version: doc.version,
        updatedAt: doc.updatedAt,
      },
      sections: sections.map((s) => ({ id: s.id, number: s.number, title: s.title, html: s.html })),
      product: product ? { name: product.name, slug: product.id } : null,
      themePreset: {
        readerAccent: themePreset.readerAccent,
        readerDefaultMode: themePreset.readerDefaultMode,
      },
      company: null,
      siblings: {
        prev: prev ? { id: prev.id, title: prev.title } : null,
        next: next ? { id: next.id, title: next.title } : null,
      },
      availableDocs,
    };
  }, [docs, games, manualSectionsState, backOfficeSections, integrationSections, customSections, themePreset.readerAccent, themePreset.readerDefaultMode]);

  return <DocReader resolveDoc={resolveDoc} />;
}


function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = auth.login(String(form.get('username') ?? ''), String(form.get('password') ?? ''));
    setError(!ok);
    if (ok) navigate('/admin/dashboard');
  }

  return (
    <main className="login-view">
      <header className="landing-header">
        <DocPilotLogo />
        <nav className="landing-nav" aria-label="Primary destinations">
          <Link to="/" className="back-to-main">← Back to main</Link>
        </nav>
      </header>
      <div className="login-view-body">
        <section className="login-card">
          <div className="login-brand">DocPilot</div>
          <div className="login-eyebrow">Documentation Builder</div>
          <h1>Sign In</h1>
          <form className="login-form" onSubmit={submit}>
            <label><span>Username</span><input name="username" autoComplete="username" required /></label>
            <label><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
            <button className="btn-primary" type="submit">Sign In</button>
            {error ? <div className="login-error">Incorrect username or password.</div> : null}
          </form>
          <div className="login-prototype-note login-prototype-note-warn">
            <strong>⚠ Legacy prototype login.</strong> This entry uses the old <code>admin</code> / <code>admin</code> localStorage auth and is retained only for in-place CMS editing during the migration. For new work use the secure DocPilot superadmin at <Link to="/admin/v2/login">/admin/v2/login</Link>, and for tenant access use the per-company URL at <code>/c/&lt;slug&gt;</code>.
          </div>
        </section>
      </div>
    </main>
  );
}

function Protected({ children }: { children: ReactNode }) {
  return auth.isLoggedIn() ? <>{children}</> : <Navigate to="/admin/login" replace />;
}

const AdminBasePathContext = createContext<string>('/admin');
function useAdminBasePath() {
  return useContext(AdminBasePathContext);
}
function deriveAdminBasePath(pathname: string): string {
  const tenant = pathname.match(/^(\/c\/[^/]+\/admin\/cms)/);
  if (tenant) return tenant[1];
  return '/admin';
}

export function Admin() {
  const { page = 'dashboard' } = useParams();
  const activePage = ADMIN_PAGES.includes(page as typeof ADMIN_PAGES[number]) ? page : null;
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = useMemo(() => deriveAdminBasePath(location.pathname), [location.pathname]);
  const currentUser = auth.currentUser();
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>(() => store.getPersistenceStatus());
  const [games, setGames] = useStoredState('cms_games_v1', DEFAULT_GAMES);
  const [storedDocsAdmin, setDocs] = useStoredState('cms_docs_v2', DEFAULT_DOCS);
  // Tombstones make seed-doc deletion stick: mergeWithDefaults re-appends any
  // DEFAULT_DOCS entry missing from the store, so without this filter a
  // deleted default documents resurrect on
  // the next render while the UI reports success.
  const [deletedDocIds, setDeletedDocIds] = useStoredState<string[]>('cms_deleted_doc_ids_v1', []);
  const docs = useMemo(
    () => mergeWithDefaults(storedDocsAdmin, DEFAULT_DOCS, (d) => d.id).filter((d) => !deletedDocIds.includes(d.id)),
    [storedDocsAdmin, deletedDocIds],
  );
  const products = useMemo(() => buildProductCatalog(docs, games), [docs, games]);
  const [selectedProductId, setSelectedProductId] = useStoredState('cms_selected_product_v1', products[0]?.id ?? DEFAULT_GAMES[0].id);
  const activeProductId = products.some((product) => product.id === selectedProductId) ? selectedProductId : products[0]?.id ?? DEFAULT_GAMES[0].id;
  const [sections, setSections] = useStoredState('cms_sections_v2', DEFAULT_SECTIONS);
  const [backOfficeSections, setBackOfficeSections] = useStoredState('cms_backoffice_sections_v1', DEFAULT_BACKOFFICE_SECTIONS);
  const [integrationSections, setIntegrationSections] = useStoredState('cms_integration_sections_v1', DEFAULT_INTEGRATION_SECTIONS);
  const [customSections, setCustomSections] = useStoredState<Record<string, SectionEntry[]>>('cms_custom_sections_v1', DEFAULT_CUSTOM_SECTIONS);
  const [translations, setTranslations, translationsHydrated] = useStoredState('cms_translations_v2', DEFAULT_DOC_TRANSLATIONS);
  const [releases, setReleases] = useStoredState('cms_releases_v2', DEFAULT_RELEASES);
  const [auditEvents, setAuditEvents] = useStoredState<AuditEvent[]>('cms_audit_events_v1', []);
  const [storedThemePresets, setThemePresets, themePresetsHydrated] = useStoredState<ThemePreset[]>('cms_theme_presets_v1', DEFAULT_THEME_PRESETS);
  const themePresets = useMemo(() => normalizeThemePresets(storedThemePresets), [storedThemePresets]);
  const [activeThemeId] = useStoredState('cms_active_theme_preset_v1', DEFAULT_THEME_PRESETS[0].id);
  const activeTheme = resolveThemePreset(themePresets, activeThemeId);
  const [mediaAssets, setMediaAssets] = useStoredState('cms_media_assets_v1', DEFAULT_MEDIA_ASSETS);
  const [revisionHistories, setRevisionHistories] = useStoredState<Record<string, RevisionHistoryEntry[]>>('cms_doc_revision_history_v1', {});
  const activeProduct = products.find((product) => product.id === activeProductId) ?? products[0];
  const docBundles = useMemo(() => docs.map((doc) => ({
    doc,
    sections: getSectionsForDoc(doc.id, sections, backOfficeSections, integrationSections, customSections),
    setSections: (items: SectionEntry[]) => {
      if (doc.id === 'doc-manual') setSections(items);
      else if (doc.id === 'doc-backoffice') setBackOfficeSections(items);
      else if (doc.id === 'doc-integration') setIntegrationSections(items);
      else setCustomSections({ ...customSections, [doc.id]: items });
      setDocs(docs.map((item) => item.id === doc.id ? { ...item, sections: items.length, updatedAt: today() } : item));
    },
  })), [backOfficeSections, customSections, docs, integrationSections, sections, setBackOfficeSections, setCustomSections, setDocs, setIntegrationSections, setSections]);
  const localizationKeys = useMemo(() => buildLocalizationKeysFromBundles(docBundles), [docBundles]);

  // Stable identity: showToast is an effect dependency in consumers (e.g.
  // LandingPageEditor's load effect) — recreating it per render loops them.
  const showToast = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now();
    setToasts((items) => [...items, { id, message, kind }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 2400);
  }, []);
  const appendAuditEvent = useCallback((event: Omit<AuditEvent, 'id' | 'at' | 'actor'> & { actor?: string }) => {
    const actor = event.actor || currentUser?.id || currentUser?.username || 'unknown';
    const next: AuditEvent = {
      ...event,
      id: `audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      at: new Date().toISOString(),
      actor,
    };
    setAuditEvents([...auditEvents, next].slice(-500));
  }, [auditEvents, currentUser?.id, currentUser?.username, setAuditEvents]);
  const activeProductDocs = docs.filter((doc) => doc.gameId === activeProductId);
  const activeProductDocIds = new Set(activeProductDocs.map((doc) => doc.id));
  const hasDraftWorkflowState = docBundles.some((bundle) => (
    activeProductDocIds.has(bundle.doc.id)
    && bundle.sections.some((section) => section.status === 'draft' || section.status === 'review')
  )) || releases.some((release) => activeProductDocIds.has(release.docId) && release.status === 'draft');
  const changeSelectedProductId = useCallback((id: string) => {
    if (id === activeProductId) return;
    if (hasDraftWorkflowState && !window.confirm('This product has draft or review workflow state. Switch product context anyway?')) return;
    setSelectedProductId(id);
  }, [activeProductId, hasDraftWorkflowState, setSelectedProductId]);

  useEffect(() => store.subscribePersistenceStatus(setPersistenceStatus), []);

  useEffect(() => {
    const handler = (event: Event) => {
      showToast((event as CustomEvent<string>).detail || 'Persistence operation failed.', 'error');
    };
    window.addEventListener('docpilot:persistence-error', handler);
    return () => window.removeEventListener('docpilot:persistence-error', handler);
  }, []);

  const content = useMemo(() => {
    if (!activePage) return <NotFound />;
    const requiredPermission = pageWritePermission(activePage as typeof ADMIN_PAGES[number]);
    if (requiredPermission && !canRoleWrite(currentUser?.role ?? 'viewer', requiredPermission)) {
      return <AccessDenied permission={requiredPermission} />;
    }
    if (activePage === 'documents') {
      return <DocumentsPage docs={docs} setDocs={setDocs} markDocDeleted={(id) => setDeletedDocIds([...deletedDocIds.filter((item) => item !== id), id])} clearDocTombstone={(id) => { if (deletedDocIds.includes(id)) setDeletedDocIds(deletedDocIds.filter((item) => item !== id)); }} products={products} customSections={customSections} setCustomSections={setCustomSections} releases={releases} setReleases={setReleases} translations={translations} setTranslations={setTranslations} localizationKeys={localizationKeys} revisionHistories={revisionHistories} setRevisionHistories={setRevisionHistories} openModal={setModal} toast={showToast} selectedProductId={selectedProductId === '' ? '' : activeProductId} setSelectedProductId={changeSelectedProductId} appendAuditEvent={appendAuditEvent} />;
    }
    if (activePage === 'sections') {
      return <SectionsPage bundles={docBundles} openModal={setModal} toast={showToast} revisionHistories={revisionHistories} setRevisionHistories={setRevisionHistories} mediaAssets={mediaAssets} setMediaAssets={setMediaAssets} appendAuditEvent={appendAuditEvent} />;
    }
    if (activePage === 'media') {
      return <MediaLibraryPage assets={mediaAssets} setAssets={setMediaAssets} bundles={docBundles} openModal={setModal} toast={showToast} appendAuditEvent={appendAuditEvent} />;
    }
    if (activePage === 'translations') {
      return <TranslationsPage docs={docs} setDocs={setDocs} bundles={docBundles} customSections={customSections} setCustomSections={setCustomSections} entries={translations} setEntries={setTranslations} localizationKeys={localizationKeys} openModal={setModal} toast={showToast} />;
    }
    if (activePage === 'publishing') {
      return <PublishingPage releases={releases} setReleases={setReleases} docs={docs} bundles={docBundles} translations={translations} localizationKeys={localizationKeys} auditEvents={auditEvents} appendAuditEvent={appendAuditEvent} openModal={setModal} toast={showToast} />;
    }
    if (activePage === 'landing') {
      return <LandingPageEditor companySlug={basePath.match(/^\/c\/([^/]+)/)?.[1] ?? null} toast={showToast} />;
    }
    if (activePage === 'products') {
      return <AdminProductsPage games={games} setGames={setGames} docs={docs} openModal={setModal} toast={showToast} appendAuditEvent={appendAuditEvent} selectedProductId={activeProductId} setSelectedProductId={changeSelectedProductId} />;
    }
    if (activePage === 'users') {
      return <TenantUsersPage companySlug={basePath.match(/^\/c\/([^/]+)/)?.[1] ?? null} toast={showToast} />;
    }
    return <Dashboard products={products} sections={[...sections, ...backOfficeSections, ...integrationSections, ...Object.values(customSections).flat()]} translations={translations} localizationKeys={localizationKeys} releases={releases} selectedProductId={activeProductId} setSelectedProductId={changeSelectedProductId} />;
  }, [activePage, activeProductId, activeTheme.id, appendAuditEvent, auditEvents, backOfficeSections, changeSelectedProductId, currentUser?.role, customSections, docBundles, docs, games, integrationSections, localizationKeys, mediaAssets, products, releases, revisionHistories, sections, setCustomSections, setDocs, setGames, setMediaAssets, setReleases, setRevisionHistories, setThemePresets, setTranslations, themePresets, translations]);

  // Normalize-on-mount effects must wait for hydration: before it they see
  // code defaults and their write attempts are refused (which used to spam
  // "Still loading…" banners on every editor load) — and historically these
  // were silent clobber vectors for the server values.
  useEffect(() => {
    if (!themePresetsHydrated) return;
    const normalized = normalizeThemePresets(storedThemePresets);
    if (!themePresetListEqual(storedThemePresets, normalized)) setThemePresets(normalized);
  }, [setThemePresets, storedThemePresets, themePresetsHydrated]);

  useEffect(() => {
    if (!translationsHydrated) return;
    const synced = syncTranslationEntriesWithKeys(translations, localizationKeys);
    if (synced !== translations) setTranslations(synced);
  }, [localizationKeys, setTranslations, translations, translationsHydrated]);

  // Resolve the tenant name for the workspace context strip. Falls back to
  // "DocPilot" on the standalone /admin mount where there is no company session.
  useEffect(() => {
    let active = true;
    void authMeCached()
      .then((data) => { if (active && data?.company?.name) setCompanyName(data.company.name); })
      .catch(() => { /* standalone mount — keep fallback */ });
    return () => { active = false; };
  }, []);

  const logout = () => {
    auth.logout();
    // Tenant mount: bounce back to that company's landing. Otherwise go home.
    const tenantMatch = basePath.match(/^\/c\/([^/]+)\/admin\/cms$/);
    navigate(tenantMatch ? `/c/${tenantMatch[1]}` : '/');
  };

  return (
    <AdminBasePathContext.Provider value={basePath}>
      <main className="app-view" style={themePresetStyle(activeTheme)}>
        <header className="app-header">
          <BrandLogo />
          <div className="user-info"><span className="user-name">{currentUser?.name ?? 'User'} · {roleLabel(currentUser?.role ?? 'partner')}</span><button className="btn-logout" onClick={logout}>Logout</button></div>
        </header>
        <div className="app-layout">
          <aside className="sidebar">
            <div className="sidebar-section">Content</div>
            <AdminLink page="dashboard" label="Dashboard" icon="▣" />
            <AdminLink page="products" label="Products" icon="◈" />
            <AdminLink page="documents" label="Documents" icon="▤" />
            <AdminLink page="sections" label="Content Editor" icon="¶" />
            <AdminLink page="media" label="Media Library" icon="▥" />
            <div className="sidebar-section spacer">Delivery</div>
            <AdminLink page="translations" label="Translations" icon="◎" />
            <AdminLink page="publishing" label="Publishing" icon="✓" />
            <div className="sidebar-section spacer">Tenant</div>
            <AdminLink page="landing" label="Landing page" icon="◔" />
            <AdminLink page="users" label="Users" icon="◉" />
          </aside>
          <section className="content">
            <PersistenceStatusBanner status={persistenceStatus} />
            <AdminContextBar companyName={companyName} product={activeProduct} documentCount={activeProductDocs.length} hasDraftWorkflowState={hasDraftWorkflowState} />
            {persistenceStatus === 'server' ? content : <PersistenceUnavailable status={persistenceStatus} />}
          </section>
        </div>
        {modal ? <Modal title={modal.title} close={() => setModal(null)}>{modal.content}</Modal> : null}
        <div className="toast-stack">{toasts.map((toast) => <div className={`toast ${toast.kind}`} key={toast.id}>{toast.message}</div>)}</div>
      </main>
    </AdminBasePathContext.Provider>
  );
}

function Dashboard({ products, sections, translations, localizationKeys, releases, selectedProductId, setSelectedProductId }: {
  products: ProductEntry[];
  sections: SectionEntry[];
  translations: TranslationEntry[];
  localizationKeys: LocalizationKey[];
  releases: ReleaseEntry[];
  selectedProductId: string;
  setSelectedProductId: (id: string) => void;
}) {
  const basePath = useAdminBasePath();
  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? products[0];
  const selectedDocs = sortDocsForNavigation(selectedProduct?.docs ?? []);
  const visibleDocs = selectedDocs.filter((doc) => docNavPlacement(doc) !== 'hidden');
  const reviewCount = sections.filter((section) => section.status === 'review').length;
  const translationProgress = translations.length ? Math.round(translations.reduce((sum, item) => sum + getTranslationProgress(item, localizationKeys), 0) / translations.length) : 0;
  const latestRelease = releases[0];
  const languageBars = [...translations].sort((a, b) => getTranslationProgress(b, localizationKeys) - getTranslationProgress(a, localizationKeys));
  const lowLanguages = translations.filter((entry) => getTranslationProgress(entry, localizationKeys) < 50).slice(0, 6);
  const draftSections = sections.filter((section) => section.status === 'draft' || section.status === 'review').slice(0, 8);
  const assignedReviews = sections.filter((section) => section.status === 'review' || section.status === 'approved').slice(0, 8);
  const blockers = sections.filter((section) => section.status === 'draft' || hasUnsafeHtml(section.html)).slice(0, 8);
  const attentionItems = [
    ...draftSections.map((section) => ({ label: `${section.number} ${section.title}`, meta: `${section.status} · ${section.owner}`, to: `${basePath}/sections?q=${encodeURIComponent(`${section.number} ${section.title}`)}` })),
    ...lowLanguages.map((entry) => ({ label: `${entry.language} translation`, meta: `${getTranslationProgress(entry, localizationKeys)}% complete · ${entry.reviewer}`, to: `${basePath}/translations?language=${encodeURIComponent(entry.code)}&missing=1` })),
  ].slice(0, 8);

  return (
    <>
      <ViewHeader title="DocPilot Dashboard" subtitle="Product-aware workspace for docs, translations, and versioned publishing" />
      <section className="dashboard-hero">
        <div>
          <div className="eyebrow">Selected Product</div>
          <h2>{selectedProduct?.name ?? 'No product selected'}</h2>
          <p>{selectedProduct?.description ?? 'Create a product to begin managing documentation.'}</p>
          <div className="hero-actions">
            <Link className="btn btn-red" to={selectedProduct ? `/products/${selectedProduct.id}` : '/products'}>View Product Docs</Link>
            <Link className="btn" to={`${basePath}/sections`}>Edit Content</Link>
          </div>
        </div>
        <label className="game-switcher">
          <span>Product Selection</span>
          <select value={selectedProduct?.id ?? ''} onChange={(event) => setSelectedProductId(event.target.value)}>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
      </section>
      <div className="kpi-grid">
        <Kpi label="Product Docs" value={String(selectedDocs.length)} meta="Game, back-office, integration, operations" />
        <Kpi label="Editable Sections" value={String(sections.length)} meta={`${sections.filter((item) => item.status === 'published').length} published`} accent="green" />
        <Kpi label="Languages" value={String(translations.length)} meta={`${translationProgress}% average translation`} accent="yellow" />
        <Kpi label="In Review" value={String(reviewCount)} meta="Sections waiting for approval" accent="red" />
      </div>
      <div className="dashboard-grid">
        <Card title="Documentation Streams">
          <div className="doc-card-list">
            {visibleDocs.length ? visibleDocs.map((doc) => <DocMiniCard doc={doc} key={doc.id} />) : (
              <EmptyState title="No visible docs yet" message="Use the setup checklist to make this product readable." action={<SetupChecklist steps={PRODUCT_SETUP_STEPS} />} />
            )}
          </div>
        </Card>
        <Card title="Translation Rate By Language">
          <div className="translation-bars">
            {languageBars.map((entry) => <ProgressRow key={entry.code} label={`${entry.language} (${entry.code})`} value={getTranslationProgress(entry, localizationKeys)} />)}
          </div>
        </Card>
      </div>
      <Card title="Latest Version Snapshot">
        <div className="version-spotlight">
          <div><strong>{latestRelease?.label ?? 'No snapshots yet'}</strong><span>{latestRelease?.notes ?? 'Create a version snapshot from Publishing.'}</span></div>
          {latestRelease ? <Pill status={latestRelease.status} /> : null}
        </div>
      </Card>
      <Card title="Attention Queue">
        <div className="attention-list">
          {attentionItems.length ? attentionItems.map((item) => <Link to={item.to} key={`${item.label}-${item.meta}`}><strong>{item.label}</strong><span>{item.meta}</span></Link>) : <div className="attention-empty"><strong>Nothing urgent</strong><span>All tracked sections and translations look clear.</span></div>}
        </div>
      </Card>
      <Card title="Review Queue">
        <div className="attention-list">
          {assignedReviews.length ? assignedReviews.map((section) => (
            <Link to={`${basePath}/sections?q=${encodeURIComponent(`${section.number} ${section.title}`)}`} key={`review-${section.id}`}>
              <strong>{section.number} {section.title}</strong>
              <span>{section.status} · Reviewer: {section.reviewer || section.owner}</span>
            </Link>
          )) : <div className="attention-empty"><strong>No assigned reviews</strong><span>Move sections into review and assign a reviewer from Content Editor.</span></div>}
        </div>
      </Card>
      <Card title="Blockers">
        <div className="attention-list">
          {blockers.length ? blockers.map((section) => (
            <Link to={`${basePath}/sections?q=${encodeURIComponent(`${section.number} ${section.title}`)}`} key={`blocker-${section.id}`}>
              <strong>{section.number} {section.title}</strong>
              <span>{hasUnsafeHtml(section.html) ? 'unsafe HTML guardrail' : `${section.status} needs workflow action`} · Owner: {section.owner}</span>
            </Link>
          )) : <div className="attention-empty"><strong>No blockers</strong><span>Draft/review sections and unsafe HTML guards are clear.</span></div>}
        </div>
      </Card>
    </>
  );
}

function DocumentsPage({ docs, setDocs, markDocDeleted, clearDocTombstone, products, customSections, setCustomSections, releases, setReleases, translations, setTranslations, localizationKeys, revisionHistories, setRevisionHistories, openModal, toast, selectedProductId, setSelectedProductId, appendAuditEvent }: {
  docs: DocEntry[];
  setDocs: (items: DocEntry[]) => boolean;
  markDocDeleted: (id: string) => void;
  clearDocTombstone: (id: string) => void;
  products: ProductEntry[];
  customSections: Record<string, SectionEntry[]>;
  setCustomSections: (items: Record<string, SectionEntry[]>) => void;
  releases: ReleaseEntry[];
  setReleases: (items: ReleaseEntry[]) => void;
  translations: TranslationEntry[];
  setTranslations: (items: TranslationEntry[]) => void;
  localizationKeys: LocalizationKey[];
  revisionHistories: Record<string, RevisionHistoryEntry[]>;
  setRevisionHistories: (items: Record<string, RevisionHistoryEntry[]>) => void;
  openModal: (modal: ModalState) => void;
  toast: (message: string) => void;
  selectedProductId: string;
  setSelectedProductId: (id: string) => void;
  appendAuditEvent: (event: Omit<AuditEvent, 'id' | 'at' | 'actor'> & { actor?: string }) => void;
}) {
  const basePath = useAdminBasePath();
  const productOptions = products.length ? products : [emptyProductOption(selectedProductId || DEFAULT_GAMES[0].id)];
  // '' = the "All products" option — previously swallowed by the ?? fallback,
  // which silently re-selected the first product and hid every other doc.
  const allProducts = !selectedProductId;
  const selectedProduct = allProducts ? null : productOptions.find((product) => product.id === selectedProductId) ?? productOptions[0];
  const productDocs = allProducts ? docs : selectedProduct?.docs ?? [];
  const [docQuery, setDocQuery] = useState('');
  const [taxonomyFilter, setTaxonomyFilter] = useState('');
  const orderedProductDocs = sortDocsForNavigation(productDocs);
  const taxonomyOptions = taxonomyOptionsForDocs(orderedProductDocs);
  useEffect(() => {
    if (taxonomyFilter && !taxonomyOptions.includes(taxonomyFilter)) setTaxonomyFilter('');
  }, [taxonomyFilter, taxonomyOptions]);
  const filteredProductDocs = orderedProductDocs.filter((doc) => (
    docMatchesSearch(doc, customSections[doc.id] ?? [], docQuery)
  ));
  const moveDocumentInNavigation = (doc: DocEntry, direction: -1 | 1) => {
    const index = orderedProductDocs.findIndex((item) => item.id === doc.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= orderedProductDocs.length) return;
    const nextOrder = [...orderedProductDocs];
    [nextOrder[index], nextOrder[target]] = [nextOrder[target], nextOrder[index]];
    const orderById = new Map(nextOrder.map((item, itemIndex) => [item.id, itemIndex + 1]));
    setDocs(docs.map((item) => orderById.has(item.id) ? { ...item, navOrder: orderById.get(item.id), updatedAt: today() } : item));
    appendAuditEvent({
      action: 'update',
      entityType: 'document',
      entityId: doc.id,
      documentId: doc.id,
      title: doc.title,
      summary: `Navigation order moved ${direction < 0 ? 'up' : 'down'}.`,
    });
    toast('Document navigation order updated.');
  };
  const deleteDocument = (doc: DocEntry) => openModal({
    title: 'Delete document',
    content: <WarningConfirm
      eyebrow="Permanent action"
      title={`Delete "${doc.title}"?`}
      message="This removes the document, custom editable sections, revision history, release snapshots, and translation values for this document."
      detail="This cannot be undone from the document list."
      confirmLabel="Delete document"
      close={() => openModal(null)}
      confirm={() => {
        const nextDocs = docs.filter((item) => item.id !== doc.id);
        const nextCustomSections = { ...customSections };
        const removedKeyIds = new Set(localizationKeys.filter((key) => key.docId === doc.id).map((key) => key.id));
        const nextRevisionHistories = { ...revisionHistories };
        delete nextCustomSections[doc.id];
        delete nextRevisionHistories[doc.id];
        if (!setDocs(nextDocs)) {
          // Write blocked (offline / not hydrated yet / no permission) — the
          // persistence-error banner explains; do NOT claim success.
          openModal(null);
          return;
        }
        markDocDeleted(doc.id); // tombstone so seed docs can't resurrect via mergeWithDefaults
        setCustomSections(nextCustomSections);
        setReleases(releases.filter((release) => release.docId !== doc.id));
        setRevisionHistories(nextRevisionHistories);
        setTranslations(translations.map((entry) => {
          if (!removedKeyIds.size) return entry;
          const values = { ...entry.values };
          removedKeyIds.forEach((key) => delete values[key]);
          return { ...entry, values, updatedAt: today() };
        }));
        appendAuditEvent({
          action: 'delete',
          entityType: 'document',
          entityId: doc.id,
          documentId: doc.id,
          title: doc.title,
          summary: 'Document, sections, release snapshots, revisions, and translation values removed.',
        });
        // Only reset the product filter when a CONCRETE product lost its last
        // doc. In "All products" mode ('' matches no gameId) this check was
        // trivially true and force-switched the filter — firing the "switch
        // product context?" confirm and making every other doc vanish from
        // the list right after a delete.
        if (selectedProductId && !nextDocs.some((item) => item.gameId === selectedProductId)) {
          setSelectedProductId(nextDocs[0]?.gameId ?? DEFAULT_GAMES[0].id);
        }
        openModal(null);
        toast('Document deleted.');
      }}
    />,
  });
  const edit = (doc?: DocEntry) => openModal({
    title: doc ? 'Edit Document' : 'New Document',
    content: <DocumentForm doc={doc} docs={docs} products={productOptions} selectedProductId={selectedProduct?.id ?? selectedProductId} close={() => openModal(null)} save={(next) => {
      if (doc) {
        setDocs(docs.map((item) => item.id === doc.id ? next : item));
        appendAuditEvent({
          action: next.status === 'review' || next.status === 'approved' ? 'review' : 'update',
          entityType: 'document',
          entityId: next.id,
          documentId: next.id,
          title: next.title,
          summary: `Document settings saved with status ${next.status}. Reviewer: ${next.reviewer || next.owner}.`,
        });
      } else {
        const starterSections = starterSectionsForDocument(next, selectedProduct?.name ?? 'this product');
        clearDocTombstone(next.id); // re-creating a previously deleted doc id must un-tombstone it
        setDocs([{ ...next, sections: starterSections.length }, ...docs]);
        setCustomSections({ ...customSections, [next.id]: starterSections });
        appendAuditEvent({
          action: 'create',
          entityType: 'document',
          entityId: next.id,
          documentId: next.id,
          title: next.title,
          summary: `Document created with ${starterSections.length} starter sections and status ${next.status}.`,
        });
      }
      openModal(null);
      toast(doc ? 'Document updated.' : 'Document created.');
    }} />,
  });

  return (
    <>
      <ViewHeader title="Documents" subtitle="Product documentation streams for game, back-office, integration, and operations content" action={<button className="btn btn-red" onClick={() => edit()}>+ New Document</button>} />
      <div className="document-toolbar">
        <label className="field"><span>Product</span><select value={selectedProduct?.id ?? ''} onChange={(event) => setSelectedProductId(event.target.value)}><option value="">All products</option>{productOptions.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label className="field"><span>Filter docs</span><input value={docQuery} onChange={(event) => setDocQuery(event.target.value)} placeholder="Title, body, metadata, status, owner" /></label>
      </div>
      <div className="document-toolbar-note">
        <strong>Navigation manager</strong>
        <span>{filteredProductDocs.length} of {orderedProductDocs.length} docs visible. Use ↑/↓ to control reader navigation order; sections are ordered in Content Editor.</span>
      </div>
      <TemplateLibraryPanel templates={DOCUMENT_TEMPLATES} docs={docs} />
      <div className="document-card-grid">
        {orderedProductDocs.length ? filteredProductDocs.map((doc) => (
          <article className={`document-card ${doc.type}`} key={doc.id}>
            <div className="document-card-top"><span>{doc.type}</span><Pill status={doc.status} /></div>
            <h2>{doc.title}</h2>
            <p>{doc.description}</p>
            <div className="document-template-effect">
              <strong>{getDocumentTemplate(docTemplateId(doc)).label}</strong>
              <span>{getDocumentTemplate(docTemplateId(doc)).effect}</span>
            </div>
            <div className="doc-tag-list">{docTaxonomyTags(doc).map((tag) => <em key={tag}>{tag}</em>)}</div>
            <div className="document-card-meta"><strong>v{doc.version}</strong><span>{doc.sections} sections</span><span>Owner {doc.owner}</span><span>Reviewer {doc.reviewer || doc.owner}</span><span>{docAudience(doc)}</span><span>{docNavPlacement(doc)}</span><span>Order {typeof doc.navOrder === 'number' && Number.isFinite(doc.navOrder) ? doc.navOrder : '—'}</span><span>{docSlug(doc)}</span></div>
            <div className="document-card-actions">
              <Link className="btn btn-sm" to={docPath(doc)}>Preview</Link>
              <Link className="btn btn-sm btn-ghost" to={`${basePath}/sections?doc=${encodeURIComponent(doc.id)}`}>Edit Content</Link>
              <button className="btn btn-sm btn-ghost" type="button" onClick={() => edit(doc)}>Edit</button>
              <div className="nav-order-controls" role="group" aria-label={`Navigation order controls for ${doc.title}`}>
                <button className="btn btn-sm btn-ghost" type="button" onClick={() => moveDocumentInNavigation(doc, -1)} disabled={orderedProductDocs[0]?.id === doc.id} title="Move up" aria-label={`Move ${doc.title} up`}>↑</button>
                <button className="btn btn-sm btn-ghost" type="button" onClick={() => moveDocumentInNavigation(doc, 1)} disabled={orderedProductDocs[orderedProductDocs.length - 1]?.id === doc.id} title="Move down" aria-label={`Move ${doc.title} down`}>↓</button>
              </div>
              <button className="btn btn-sm btn-ghost danger" type="button" onClick={() => deleteDocument(doc)} aria-label={`Delete ${doc.title}`} title="Delete"><span className="trash-icon" aria-hidden="true" /></button>
            </div>
          </article>
        )) : (
          <div className="empty-state">
            <strong>No docs for {selectedProduct?.name ?? 'this product'} yet</strong>
            <span>Create a manual, back-office guide, integration reference, or operations document to make this product visible to readers.</span>
            <SetupChecklist steps={PRODUCT_SETUP_STEPS} />
            <button className="btn btn-red" onClick={() => edit()}>Create First Document</button>
          </div>
        )}
        {orderedProductDocs.length && !filteredProductDocs.length ? <EmptyState title="No matching documents" message="Clear the document search or taxonomy filter to show the product navigation." /> : null}
      </div>
    </>
  );
}

function TemplateLibraryPanel({ templates, docs }: { templates: DocumentTemplate[]; docs: DocEntry[] }) {
  return (
    <Card title="Template Library">
      <div className="template-library-note">
        <strong>Reusable content families</strong>
        <span>Templates define new-document defaults, starter section structure, reader placement, and the expected presentation model. Existing docs show their linked template effect so changes are explicit instead of silent.</span>
      </div>
      <div className="template-family-grid">
        {templates.map((template) => {
          const usage = docs.filter((doc) => docTemplateId(doc) === template.id).length;
          return (
            <article className="template-family-card" key={template.id}>
              <div className="template-family-card-head">
                <span>{template.family}</span>
                <strong>{template.label}</strong>
              </div>
              <p>{template.description}</p>
              <div className="template-family-meta">
                <span>{template.type}</span>
                <span>{template.navPlacement} nav</span>
                <span>{template.sections.length} sections</span>
                <span>{usage} docs</span>
              </div>
              <ol>
                {template.sections.map((section) => <li key={section.slug}>{section.title}</li>)}
              </ol>
              <footer>
                <strong>Effect</strong>
                <span>{template.effect}</span>
              </footer>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

const PRODUCT_STATUSES: WorkflowStatus[] = ['draft', 'review', 'published'];

function AdminProductsPage({ games, setGames, docs, openModal, toast, appendAuditEvent, selectedProductId, setSelectedProductId }: {
  games: GameEntry[];
  setGames: (items: GameEntry[]) => void;
  docs: DocEntry[];
  openModal: (modal: ModalState) => void;
  toast: (message: string, kind?: Toast['kind']) => void;
  appendAuditEvent: (event: Omit<AuditEvent, 'id' | 'at' | 'actor'> & { actor?: string }) => void;
  selectedProductId: string;
  setSelectedProductId: (id: string) => void;
}) {
  const docCountById = useMemo(() => {
    const counts = new Map<string, number>();
    docs.forEach((doc) => counts.set(doc.gameId, (counts.get(doc.gameId) ?? 0) + 1));
    return counts;
  }, [docs]);

  const move = (game: GameEntry, direction: -1 | 1) => {
    const index = games.findIndex((item) => item.id === game.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= games.length) return;
    const next = [...games];
    [next[index], next[target]] = [next[target], next[index]];
    setGames(next);
    appendAuditEvent({
      action: 'update',
      entityType: 'product',
      entityId: game.id,
      title: game.name,
      summary: `Product display order moved ${direction < 0 ? 'up' : 'down'}.`,
    });
    toast('Product order updated.');
  };

  const remove = (game: GameEntry) => {
    const referencingDocs = docCountById.get(game.id) ?? 0;
    openModal({
      title: 'Delete product',
      content: <WarningConfirm
        eyebrow="Permanent action"
        title={`Delete "${game.name}"?`}
        message={referencingDocs > 0
          ? `This will also affect ${referencingDocs} doc${referencingDocs === 1 ? '' : 's'} that reference this product. The docs are not removed, but they will lose their product entry in the catalog.`
          : 'No docs currently reference this product.'}
        detail="This removes the product entry from the games catalog. Docs are not auto-deleted."
        confirmLabel="Delete product"
        close={() => openModal(null)}
        confirm={() => {
          const next = games.filter((item) => item.id !== game.id);
          setGames(next);
          appendAuditEvent({
            action: 'delete',
            entityType: 'product',
            entityId: game.id,
            title: game.name,
            summary: `Product deleted. ${referencingDocs} doc${referencingDocs === 1 ? '' : 's'} previously referenced this product.`,
          });
          if (selectedProductId === game.id && next.length) {
            setSelectedProductId(next[0].id);
          }
          openModal(null);
          toast('Product deleted.');
        }}
      />,
    });
  };

  const edit = (game?: GameEntry) => openModal({
    title: game ? 'Edit Product' : 'New Product',
    content: <ProductForm
      game={game}
      games={games}
      close={() => openModal(null)}
      save={(next) => {
        if (game) {
          setGames(games.map((item) => item.id === game.id ? next : item));
          appendAuditEvent({
            action: 'update',
            entityType: 'product',
            entityId: next.id,
            title: next.name,
            summary: `Product settings saved with status ${next.status}.`,
          });
          toast('Product updated.');
        } else {
          setGames([...games, next]);
          appendAuditEvent({
            action: 'create',
            entityType: 'product',
            entityId: next.id,
            title: next.name,
            summary: `Product created with status ${next.status}.`,
          });
          toast('Product created.');
        }
        openModal(null);
      }}
    />,
  });

  return (
    <>
      <ViewHeader
        title="Products"
        subtitle="Documentation spaces (games/products). Manage the catalog that documents are grouped under."
        action={<button className="btn btn-red" onClick={() => edit()}>+ New Product</button>}
      />
      <Card>
        <table className="data">
          <thead>
            <tr>
              <th>Name</th>
              <th>Studio</th>
              <th>Status</th>
              <th>Version</th>
              <th>Updated</th>
              <th>Docs</th>
              <th>Order</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {games.length ? games.map((game, index) => (
              <tr key={game.id}>
                <td>
                  <strong>{game.name}</strong>
                  <div className="mono muted">{game.id}</div>
                  {game.description ? <div className="muted" style={{ marginTop: 4 }}>{game.description}</div> : null}
                </td>
                <td>{game.studio}</td>
                <td><Pill status={game.status} /></td>
                <td>v{game.version}</td>
                <td>{game.updatedAt}</td>
                <td>{docCountById.get(game.id) ?? 0}</td>
                <td>
                  <div className="nav-order-controls" aria-label={`Order controls for ${game.name}`}>
                    <button className="btn btn-sm btn-ghost" type="button" onClick={() => move(game, -1)} disabled={index === 0} title="Move up">↑</button>
                    <button className="btn btn-sm btn-ghost" type="button" onClick={() => move(game, 1)} disabled={index === games.length - 1} title="Move down">↓</button>
                  </div>
                </td>
                <td className="actions">
                  <button className="btn btn-sm btn-ghost" type="button" onClick={() => edit(game)}>Edit</button>
                  <button className="btn btn-sm btn-ghost danger" type="button" onClick={() => remove(game)} aria-label={`Delete ${game.name}`} title="Delete">
                    <span className="trash-icon" aria-hidden="true" /> Delete
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={8}><EmptyState title="No products yet" message="Create your first product to start grouping documentation." action={<button className="btn btn-red" onClick={() => edit()}>+ New Product</button>} /></td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function ProductForm({ game, games, save, close }: {
  game?: GameEntry;
  games: GameEntry[];
  save: (game: GameEntry) => void;
  close: () => void;
}) {
  const [data] = useState<GameEntry>(() => game ?? {
    id: '',
    name: '',
    studio: 'Demo Studio',
    status: 'draft',
    description: '',
    version: '0.1.0',
    updatedAt: today(),
  });
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const name = text(form, 'name').trim();
      const studio = text(form, 'studio').trim() || 'Demo Studio';
      const statusInput = text(form, 'status') as WorkflowStatus;
      const description = text(form, 'description').trim();
      const version = text(form, 'version').trim() || '0.1.0';

      const nextIssues: ValidationIssue[] = [];
      if (!name) nextIssues.push({ kind: 'error', message: 'Name is required.' });
      if (!PRODUCT_STATUSES.includes(statusInput)) nextIssues.push({ kind: 'error', message: 'Status must be draft, review, or published.' });

      const duplicateName = games.some((item) => item.id !== (game?.id ?? '') && item.name.trim().toLowerCase() === name.toLowerCase());
      if (duplicateName) nextIssues.push({ kind: 'error', message: 'Another product already uses this name.' });

      let id = game?.id ?? '';
      if (!game && name) {
        const base = makeSlug(name);
        const existingIds = new Set(games.map((item) => item.id));
        id = base;
        let suffix = 2;
        while (existingIds.has(id)) {
          id = `${base}-${suffix}`;
          suffix += 1;
        }
      }

      setIssues(nextIssues);
      if (nextIssues.some((issue) => issue.kind === 'error')) return;

      save({
        id,
        name,
        studio,
        status: statusInput,
        description,
        version,
        updatedAt: today(),
      });
    }}>
      <ValidationList issues={issues} />
      <div className="form-grid">
        <Field name="name" label="Name" value={data.name} wide />
        <Field name="studio" label="Studio" value={data.studio} />
        <Select name="status" label="Status" value={data.status} options={PRODUCT_STATUSES} />
        <Field name="version" label="Version" value={data.version} />
        <label className="field wide"><span>Description</span><textarea name="description" defaultValue={data.description} rows={3} /></label>
      </div>
      {game ? (
        <div className="form-note wide">
          <strong>{game.id}</strong>
          <span>Product id is fixed after creation so docs referencing it stay linked.</span>
        </div>
      ) : (
        <div className="form-note wide">
          <strong>Auto-generated id</strong>
          <span>The id is derived from the name (e.g. "Plinko 2" becomes "plinko-2"). If that id is taken, a numeric suffix is appended.</span>
        </div>
      )}
      <FormActions close={close} submit={game ? 'Save Product' : 'Create Product'} />
    </form>
  );
}

function SectionsPage({ bundles, openModal, toast, revisionHistories, setRevisionHistories, mediaAssets, setMediaAssets, appendAuditEvent }: {
  bundles: { doc: DocEntry; sections: SectionEntry[]; setSections: (items: SectionEntry[]) => void }[];
  openModal: (modal: ModalState) => void;
  toast: (message: string) => void;
  revisionHistories: Record<string, RevisionHistoryEntry[]>;
  setRevisionHistories: (items: Record<string, RevisionHistoryEntry[]>) => void;
  mediaAssets: MediaAsset[];
  setMediaAssets: (items: MediaAsset[]) => void;
  appendAuditEvent: (event: Omit<AuditEvent, 'id' | 'at' | 'actor'> & { actor?: string }) => void;
}) {
  const location = useLocation();
  const routeQuery = useMemo(() => new URLSearchParams(location.search).get('q') ?? '', [location.search]);
  // ?doc=<id> opens the editor on a specific document ("Edit Content" from
  // the Documents page) — without it the editor always opened bundles[0].
  const routeDocId = useMemo(() => new URLSearchParams(location.search).get('doc'), [location.search]);
  const [activeDocId, setActiveDocId] = useState(
    (routeDocId && bundles.some((bundle) => bundle.doc.id === routeDocId) ? routeDocId : null)
    ?? bundles[0]?.doc.id
    ?? 'doc-manual',
  );
  useEffect(() => {
    if (routeDocId && bundles.some((bundle) => bundle.doc.id === routeDocId)) setActiveDocId(routeDocId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeDocId]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [docRevision, setDocRevision] = useState<RevisionStack<SectionEntry[]>>({ past: [], future: [] });
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<string[]>([]);
  const [elementsLibraryOpen, setElementsLibraryOpen] = useState(false);
  const [draggedComponentKind, setDraggedComponentKind] = useState<DocComponentKind | null>(null);
  const [selectedLibraryKind, setSelectedLibraryKind] = useState<DocComponentKind | null>(null);
  const [query, setQuery] = useState(routeQuery);
  const sectionDragStateRef = useRef<{ sourceId: string; target: DragTarget | null } | null>(null);
  const sectionDragCleanupRef = useRef<(() => void) | null>(null);
  const activeBundle = bundles.find((bundle) => bundle.doc.id === activeDocId) ?? bundles[0];
  const { doc, sections, setSections } = activeBundle;
  const docRevisionHistory = revisionHistories[doc.id] ?? [];
  const visibleSections = sections.filter((section) => sectionMatchesSearch(section, query));
  const sectionTargets = useMemo(() => buildSectionTargetOptions(sections), [sections]);
  const mediaUsageRefs = useMemo(() => collectMediaUsageRefs(mediaAssets, bundles), [bundles, mediaAssets]);
  const collapsedSectionSet = useMemo(() => new Set(collapsedSectionIds), [collapsedSectionIds]);
  const collapsedCount = sections.filter((section) => collapsedSectionSet.has(section.id)).length;
  const selectedSection = sections.find((section) => section.id === (editingId ?? selectedSectionId)) ?? visibleSections[0] ?? sections[0] ?? null;
  useEffect(() => () => {
    sectionDragCleanupRef.current?.();
  }, []);
  const commitSections = (next: SectionEntry[], history?: { label: string; detail: string; sectionId?: string }) => {
    const changed = !revisionEqual(sections, next);
    if (!changed && !history) return;
    if (changed) {
      setDocRevision((revision) => ({
        past: limitRevisions([...revision.past, cloneRevisionValue(sections)]),
        future: [],
      }));
    }
    if (history) {
      const timestamp = revisionTimestamp();
      // History entries snapshot the state AFTER each change. When this is
      // the doc's FIRST recorded change there would be no pre-change version
      // to restore (e.g. nothing to click to undo a deletion) — so seed the
      // history with a baseline of the state before this change.
      const baseline: RevisionHistoryEntry[] = docRevisionHistory.length ? [] : [{
        id: revisionHistoryId(doc.id, 0, { label: 'Baseline', detail: 'Before first recorded change' }, timestamp),
        label: 'Baseline',
        detail: 'Document state before the first recorded change',
        timestamp,
        version: doc.version,
        sectionId: undefined,
        snapshot: cloneRevisionValue(sections),
      }];
      setRevisionHistories({
        ...revisionHistories,
        [doc.id]: limitRevisionHistory([
          ...baseline,
          ...docRevisionHistory,
          {
            id: revisionHistoryId(doc.id, docRevisionHistory.length + 1, history, timestamp),
            label: history.label,
            detail: history.detail,
            timestamp,
            version: doc.version,
            sectionId: history.sectionId,
            snapshot: cloneRevisionValue(next),
          },
        ]),
      });
    }
    if (changed) setSections(next);
  };
  const undoDocRevision = () => {
    if (!docRevision.past.length) return;
    const previous = cloneRevisionValue(docRevision.past[docRevision.past.length - 1]);
    setDocRevision({
      past: docRevision.past.slice(0, -1),
      future: limitRevisions([cloneRevisionValue(sections), ...docRevision.future]),
    });
    setSections(previous);
    setEditingId(null);
    setDraggingSectionId(null);
    setDragTarget(null);
    setSelectedSectionId(previous[0]?.id ?? null);
    toast('Document change undone.');
  };
  const redoDocRevision = () => {
    if (!docRevision.future.length) return;
    const next = cloneRevisionValue(docRevision.future[0]);
    setDocRevision({
      past: limitRevisions([...docRevision.past, cloneRevisionValue(sections)]),
      future: docRevision.future.slice(1),
    });
    setSections(next);
    setEditingId(null);
    setDraggingSectionId(null);
    setDragTarget(null);
    setSelectedSectionId(next[0]?.id ?? null);
    toast('Document change redone.');
  };
  const restoreDocRevision = (entry: RevisionHistoryEntry) => {
    if (revisionEqual(sections, entry.snapshot)) {
      toast('Already at this version — pick an earlier entry to roll back.');
      return;
    }
    setDocRevision((revision) => ({
      past: limitRevisions([...revision.past, cloneRevisionValue(sections)]),
      future: [],
    }));
    const snapshot = cloneRevisionValue(entry.snapshot);
    setSections(snapshot);
    setEditingId(null);
    setDraggingSectionId(null);
    setDragTarget(null);
    setSelectedSectionId(entry.sectionId ?? snapshot[0]?.id ?? null);
    toast(`Restored ${entry.label}.`);
  };
  const collapseAllSections = () => {
    setEditingId(null);
    setCollapsedSectionIds(sections.map((section) => section.id));
    toast('All sections collapsed.');
  };
  const expandAllSections = () => {
    setCollapsedSectionIds([]);
    toast('All sections expanded.');
  };
  const toggleSectionCollapse = (section: SectionEntry) => {
    setEditingId((current) => current === section.id ? null : current);
    setSelectedSectionId(section.id);
    setCollapsedSectionIds((items) => items.includes(section.id) ? items.filter((id) => id !== section.id) : [...items, section.id]);
  };
  const updateSection = (next: SectionEntry) => {
    const previous = sections.find((item) => item.id === next.id);
    commitSections(sections.map((item) => item.id === next.id ? next : item), {
      label: `Saved ${next.number}`,
      detail: next.title,
      sectionId: next.id,
    });
    appendAuditEvent({
      action: next.status === 'review' || next.status === 'approved' || next.comments?.length !== previous?.comments?.length ? 'review' : 'update',
      entityType: 'section',
      entityId: next.id,
      documentId: doc.id,
      sectionId: next.id,
      title: `${next.number} ${next.title}`,
      summary: `Section saved with status ${next.status}. Owner: ${next.owner}. Reviewer: ${next.reviewer || next.owner}.`,
    });
    setEditingId(null);
    setCollapsedSectionIds((items) => items.filter((id) => id !== next.id));
    setSelectedSectionId(next.id);
    toast(`${doc.title} section saved.`);
  };
  const updateInlineElement = (next: SectionEntry, label: string) => {
    commitSections(sections.map((item) => item.id === next.id ? next : item), {
      label: `Updated ${label}`,
      detail: `${next.number} ${next.title}`,
      sectionId: next.id,
    });
    appendAuditEvent({
      action: 'update',
      entityType: 'section',
      entityId: next.id,
      documentId: doc.id,
      sectionId: next.id,
      title: `${next.number} ${next.title}`,
      summary: `${label} updated inline.`,
    });
    setSelectedSectionId(next.id);
    toast(`${label} saved.`);
  };
  const addSection = () => openModal({
    title: `Add Section — ${doc.title}`,
    content: <SectionCreateForm
      existingSections={sections}
      close={() => openModal(null)}
      save={(section) => {
        commitSections([...sections, section], {
          label: 'Added section',
          detail: `${section.number} ${section.title}`,
          sectionId: section.id,
        });
        appendAuditEvent({
          action: 'create',
          entityType: 'section',
          entityId: section.id,
          documentId: doc.id,
          sectionId: section.id,
          title: `${section.number} ${section.title}`,
          summary: `Section created with status ${section.status}.`,
        });
        setEditingId(section.id);
        setCollapsedSectionIds((items) => items.filter((id) => id !== section.id));
        setSelectedSectionId(section.id);
        openModal(null);
        toast('Section created.');
      }}
      nextNumber={`${sections.length + 1}.0`}
    />,
  });
  const moveSection = (sectionId: string, direction: -1 | 1) => {
    const index = sections.findIndex((section) => section.id === sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    const section = sections[index];
    commitSections(next, {
      label: 'Reordered section',
      detail: `${section.number} ${section.title}`,
      sectionId,
    });
    appendAuditEvent({
      action: 'update',
      entityType: 'section',
      entityId: sectionId,
      documentId: doc.id,
      sectionId,
      title: `${section.number} ${section.title}`,
      summary: `Section order moved ${direction < 0 ? 'up' : 'down'}.`,
    });
    setSelectedSectionId(sectionId);
    toast('Section order updated.');
  };
  const publishOrUpdateSection = (section: SectionEntry) => {
    const wasPublished = section.status === 'published';
    // Persist the entry we were handed: callers in edit mode pass the live
    // draft composed from the editor, so content must not be dropped here.
    commitSections(sections.map((item) => item.id === section.id ? { ...section, status: 'published', updatedAt: today() } : item), {
      label: wasPublished ? 'Updated published version' : 'Published section',
      detail: `${section.number} ${section.title}`,
      sectionId: section.id,
    });
    appendAuditEvent({
      action: 'publish',
      entityType: 'section',
      entityId: section.id,
      documentId: doc.id,
      sectionId: section.id,
      title: `${section.number} ${section.title}`,
      summary: wasPublished ? 'Published section updated.' : 'Section moved to published workflow state.',
    });
    setSelectedSectionId(section.id);
    toast(wasPublished ? 'Section updated.' : 'Section published.');
  };
  const saveSectionAsDraft = (section: SectionEntry) => {
    commitSections(sections.map((item) => item.id === section.id ? { ...section, status: 'draft', updatedAt: today() } : item), {
      label: 'Saved draft',
      detail: `${section.number} ${section.title}`,
      sectionId: section.id,
    });
    appendAuditEvent({
      action: 'update',
      entityType: 'section',
      entityId: section.id,
      documentId: doc.id,
      sectionId: section.id,
      title: `${section.number} ${section.title}`,
      summary: 'Section returned to draft workflow state.',
    });
    setSelectedSectionId(section.id);
    toast('Section saved as draft.');
  };
  const duplicateSection = (section: SectionEntry) => {
    let copyNumber = sections.filter((item) => item.id.startsWith(`${section.id}-copy-`)).length + 1;
    let copyId = `${section.id}-copy-${copyNumber}`;
    while (sections.some((item) => item.id === copyId)) {
      copyNumber += 1;
      copyId = `${section.id}-copy-${copyNumber}`;
    }
    const copy = {
      ...section,
      id: copyId,
      slug: `${section.slug}-copy`,
      title: `${section.title} Copy`,
      status: 'draft' as WorkflowStatus,
      updatedAt: today(),
      html: syncSectionTitle(section.html.replace(`id="${section.id}"`, `id="${copyId}"`), `${section.title} Copy`),
    };
    commitSections([...sections, copy], {
      label: 'Duplicated section',
      detail: `${copy.number} ${copy.title}`,
      sectionId: copy.id,
    });
    appendAuditEvent({
      action: 'create',
      entityType: 'section',
      entityId: copy.id,
      documentId: doc.id,
      sectionId: copy.id,
      title: `${copy.number} ${copy.title}`,
      summary: `Section duplicated from ${section.id}.`,
    });
    setEditingId(copy.id);
    setCollapsedSectionIds((items) => items.filter((id) => id !== copy.id));
    setSelectedSectionId(copy.id);
    toast('Section duplicated as draft.');
  };
  const deleteSection = (section: SectionEntry) => openModal({
    title: 'Delete section',
    content: <WarningConfirm
      eyebrow="Section warning"
      title={`Delete "${section.title}"?`}
      message={`This removes the local editable section from ${doc.title}.`}
      detail="The document revision stack will record the change, but the section will disappear from the current draft."
      confirmLabel="Delete section"
      close={() => openModal(null)}
      confirm={() => {
        const next = sections.filter((item) => item.id !== section.id);
        commitSections(next, {
          label: 'Deleted section',
          detail: `${section.number} ${section.title}`,
          sectionId: next[0]?.id,
        });
        appendAuditEvent({
          action: 'delete',
          entityType: 'section',
          entityId: section.id,
          documentId: doc.id,
          sectionId: section.id,
          title: `${section.number} ${section.title}`,
          summary: 'Section removed from current document draft.',
        });
        setEditingId(null);
        setCollapsedSectionIds((items) => items.filter((id) => id !== section.id));
        setSelectedSectionId(next[0]?.id ?? null);
        openModal(null);
        toast('Section deleted.');
      }}
    />,
  });
  const cleanupPointerSectionDrag = () => {
    sectionDragCleanupRef.current?.();
    sectionDragCleanupRef.current = null;
    sectionDragStateRef.current = null;
    setDraggingSectionId(null);
    setDragTarget(null);
  };
  const getPointerSectionTarget = (sourceId: string, clientX: number, clientY: number): DragTarget | null => {
    const element = document.elementFromPoint(clientX, clientY);
    const block = element?.closest<HTMLElement>('[data-cms-section-id]');
    const targetId = block?.dataset.cmsSectionId;
    if (!block || !targetId || targetId === sourceId) return null;
    const rect = block.getBoundingClientRect();
    return {
      id: targetId,
      position: clientY > rect.top + rect.height / 2 ? 'after' : 'before',
    };
  };
  const commitSectionReorder = (sourceId: string, target: DragTarget | null) => {
    if (!target || sourceId === target.id) return;
    const sourceSection = sections.find((section) => section.id === sourceId);
    commitSections(reorderSections(sections, sourceId, target.id, target.position), {
      label: 'Reordered section',
      detail: sourceSection ? `${sourceSection.number} ${sourceSection.title}` : 'Section order updated',
      sectionId: sourceId,
    });
    appendAuditEvent({
      action: 'update',
      entityType: 'section',
      entityId: sourceId,
      documentId: doc.id,
      sectionId: sourceId,
      title: sourceSection ? `${sourceSection.number} ${sourceSection.title}` : sourceId,
      summary: `Section drag-reordered ${target.position} ${target.id}.`,
    });
    setEditingId(null);
    setSelectedSectionId(sourceId);
    toast('Section order updated.');
  };
  const beginSectionPointerDrag = (sectionId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    sectionDragCleanupRef.current?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    sectionDragStateRef.current = { sourceId: sectionId, target: null };
    setDraggingSectionId(sectionId);
    setDragTarget(null);

    const move = (pointerEvent: globalThis.PointerEvent) => {
      const active = sectionDragStateRef.current;
      if (!active) return;
      const nextTarget = getPointerSectionTarget(active.sourceId, pointerEvent.clientX, pointerEvent.clientY);
      active.target = nextTarget;
      setDragTarget(nextTarget);
    };
    const end = (pointerEvent: globalThis.PointerEvent) => {
      const active = sectionDragStateRef.current;
      const finalTarget = active ? getPointerSectionTarget(active.sourceId, pointerEvent.clientX, pointerEvent.clientY) ?? active.target : null;
      cleanupPointerSectionDrag();
      if (active) commitSectionReorder(active.sourceId, finalTarget);
    };
    const cancel = () => cleanupPointerSectionDrag();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
    sectionDragCleanupRef.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    };
  };
  const dragOverSection = (targetId: string, event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!draggingSectionId || draggingSectionId === targetId) {
      setDragTarget(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setDragTarget({ id: targetId, position: event.clientY > rect.top + rect.height / 2 ? 'after' : 'before' });
  };
  const dropSection = (targetId: string, event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain') || draggingSectionId;
    const rect = event.currentTarget.getBoundingClientRect();
    const fallbackPosition: DragPosition = event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
    setDraggingSectionId(null);
    setDragTarget(null);
    if (!sourceId || sourceId === targetId) return;
    commitSectionReorder(sourceId, { id: targetId, position: dragTarget?.id === targetId ? dragTarget.position : fallbackPosition });
  };
  const beginComponentLibraryDrag = (kind: DocComponentKind, event: ReactDragEvent<HTMLButtonElement>) => {
    setDraggedComponentKind(kind);
    setSelectedLibraryKind(null);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(DOC_COMPONENT_DRAG_TYPE, kind);
  };
  const endComponentLibraryDrag = () => {
    setDraggedComponentKind(null);
  };
  return (
    <>
      <ViewHeader title="Content Editor" subtitle="Edit every documentation stream in the rendered view your users and internal teams read." action={<button className="btn btn-red" onClick={addSection}>+ Add Section</button>} />
      <div className="doc-tabs">
        {bundles.map((bundle) => (
          <button className={bundle.doc.id === doc.id ? 'active' : ''} key={bundle.doc.id} onClick={() => { cleanupPointerSectionDrag(); setActiveDocId(bundle.doc.id); setEditingId(null); setSelectedSectionId(null); setCollapsedSectionIds([]); setDocRevision({ past: [], future: [] }); }}>
            <span>{bundle.doc.type}</span>
            <strong>{bundle.doc.title}</strong>
            <em>v{bundle.doc.version}</em>
          </button>
        ))}
      </div>
      <div className="editor-utility-bar">
        <label className="field"><span>Find section</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, body, metadata, owner, status, markers" /></label>
        <div className="editor-health">
          <span>{visibleSections.length} visible</span>
          <span>{sections.length} sections</span>
          <span>{sections.filter((section) => section.status === 'published').length} published</span>
          <span>{sections.filter((section) => section.status === 'draft' || section.status === 'review').length} needs work</span>
        </div>
      </div>
      <DocumentationActionBar
        doc={doc}
        selectedSection={selectedSection}
        addSection={addSection}
        editSection={(section) => {
          setSelectedSectionId(section.id);
          setCollapsedSectionIds((items) => items.filter((id) => id !== section.id));
          setEditingId(section.id);
        }}
        publishOrUpdate={publishOrUpdateSection}
        saveAsDraft={saveSectionAsDraft}
        duplicateSection={duplicateSection}
        deleteSection={deleteSection}
        undoRevision={undoDocRevision}
        redoRevision={redoDocRevision}
        canUndo={docRevision.past.length > 0}
        canRedo={docRevision.future.length > 0}
        revisionHistory={docRevisionHistory}
        restoreRevision={restoreDocRevision}
        collapseAllSections={collapseAllSections}
        expandAllSections={expandAllSections}
        collapsedCount={collapsedCount}
        sectionCount={sections.length}
        elementsLibraryOpen={elementsLibraryOpen}
        toggleElementsLibrary={() => setElementsLibraryOpen((value) => !value)}
      />
      {elementsLibraryOpen ? (
        <ElementsLibraryPanel
          close={() => {
            setElementsLibraryOpen(false);
            setDraggedComponentKind(null);
            setSelectedLibraryKind(null);
          }}
          beginDrag={beginComponentLibraryDrag}
          endDrag={endComponentLibraryDrag}
          draggingKind={draggedComponentKind}
          selectedKind={selectedLibraryKind}
          selectKind={(kind) => setSelectedLibraryKind((current) => current === kind ? null : kind)}
        />
      ) : null}
      <div className="cms-live-manual manual-html">
        <header className="cover cover-slim">
          <div className="container">
            <div className="cover-eyebrow">Editable preview</div>
            <h1>{doc.title}</h1>
            <div className="cover-meta">
              <div><span className="label">Document</span><span className="value">{doc.type}</span></div>
              <div><span className="label">Version</span><span className="value">{doc.version}</span></div>
              <div><span className="label">Owner</span><span className="value">{doc.owner}</span></div>
              <div><span className="label">Status</span><span className="value">{doc.status}</span></div>
            </div>
          </div>
        </header>
        <main className={`doc-main cms-edit-main ${draggingSectionId ? 'reorder-mode' : ''} ${elementsLibraryOpen || draggedComponentKind || selectedLibraryKind ? 'component-insert-mode' : ''}`}>
          {visibleSections.map((section) => editingId === section.id ? (
            <SectionInlineEditor
              key={section.id}
              section={section}
              sectionTargets={sectionTargets}
              save={updateSection}
              cancel={() => setEditingId(null)}
              selected={selectedSection?.id === section.id}
              dragging={draggingSectionId === section.id}
              reorderMode={Boolean(draggingSectionId)}
              dropPosition={dragTarget?.id === section.id ? dragTarget.position : null}
              selectSection={() => setSelectedSectionId(section.id)}
              beginPointerDrag={(event) => beginSectionPointerDrag(section.id, event)}
              dragOverSection={(event) => dragOverSection(section.id, event)}
              dropSection={(event) => dropSection(section.id, event)}
              publishOrUpdate={publishOrUpdateSection}
              saveAsDraft={saveSectionAsDraft}
              duplicateSection={() => duplicateSection(section)}
              deleteSection={() => deleteSection(section)}
              mediaAssets={mediaAssets}
              setMediaAssets={setMediaAssets}
              mediaUsageRefs={mediaUsageRefs}
              mediaUsageLabel={`${doc.title} · ${section.number} ${section.title}`}
            />
          ) : (
            <EditableSectionPreview
              key={section.id}
              section={section}
              sectionTargets={sectionTargets}
              save={(next, label) => updateInlineElement(next, label)}
              openModal={openModal}
              editSection={() => {
                setCollapsedSectionIds((items) => items.filter((id) => id !== section.id));
                setEditingId(section.id);
              }}
              moveSection={(direction) => moveSection(section.id, direction)}
              publishOrUpdate={() => publishOrUpdateSection(section)}
              saveAsDraft={() => saveSectionAsDraft(section)}
              duplicateSection={() => duplicateSection(section)}
              deleteSection={() => deleteSection(section)}
              selected={selectedSection?.id === section.id}
              dragging={draggingSectionId === section.id}
              collapsed={collapsedSectionSet.has(section.id)}
              reorderMode={Boolean(draggingSectionId)}
              dropPosition={dragTarget?.id === section.id ? dragTarget.position : null}
              selectSection={() => setSelectedSectionId(section.id)}
              toggleCollapse={() => toggleSectionCollapse(section)}
              beginPointerDrag={(event) => beginSectionPointerDrag(section.id, event)}
              dragOverSection={(event) => dragOverSection(section.id, event)}
              dropSection={(event) => dropSection(section.id, event)}
              componentInsertMode={elementsLibraryOpen || Boolean(draggedComponentKind) || Boolean(selectedLibraryKind)}
              selectedComponentKind={selectedLibraryKind}
              mediaAssets={mediaAssets}
              setMediaAssets={setMediaAssets}
              mediaUsageRefs={mediaUsageRefs}
              mediaUsageLabel={`${doc.title} · ${section.number} ${section.title}`}
              componentPlaced={() => {
                setSelectedLibraryKind(null);
                setDraggedComponentKind(null);
                setElementsLibraryOpen(false);
              }}
            />
          ))}
        </main>
      </div>
    </>
  );
}

function TranslationsPage({ docs, setDocs, bundles, customSections, setCustomSections, entries, setEntries, localizationKeys, openModal, toast }: {
  docs: DocEntry[];
  setDocs: (items: DocEntry[]) => void;
  bundles: { doc: DocEntry; sections: SectionEntry[]; setSections: (items: SectionEntry[]) => void }[];
  customSections: Record<string, SectionEntry[]>;
  setCustomSections: (items: Record<string, SectionEntry[]>) => void;
  entries: TranslationEntry[];
  setEntries: (items: TranslationEntry[]) => void;
  localizationKeys: LocalizationKey[];
  openModal: (modal: ModalState) => void;
  toast: (message: string) => void;
}) {
  const location = useLocation();
  const routeFilters = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      language: params.get('language') ?? '',
      query: params.get('q') ?? '',
      missingOnly: params.get('missing') === '1',
    };
  }, [location.search]);
  const [selectedDocId, setSelectedDocId] = useState(docs[0]?.id ?? '');
  const [selectedCode, setSelectedCode] = useState(routeFilters.language || entries[0]?.code || 'en');
  const [query, setQuery] = useState(routeFilters.query);
  const [missingOnly, setMissingOnly] = useState(routeFilters.missingOnly);
  const selectedDoc = docs.find((doc) => doc.id === selectedDocId) ?? docs[0];
  const selectedBundle = bundles.find((bundle) => bundle.doc.id === selectedDoc?.id);
  const productKeys = localizationKeys.filter((key) => key.docId === selectedDoc?.id);
  const selected = entries.find((entry) => entry.code === selectedCode) ?? entries[0];
  const isEnglish = selected?.code === 'en';
  const selectedProgress = selected ? getTranslationProgress(selected, productKeys) : 0;
  const missingKeys = selected ? productKeys.filter((key) => !(selected.values[key.id] ?? '').trim()) : [];
  const visibleKeys = productKeys.filter((key) => {
    const matchesQuery = `${key.id} ${key.label} ${key.section} ${key.defaultValue}`.toLowerCase().includes(query.trim().toLowerCase());
    const hasValue = selected ? (selected.values[key.id] ?? '').trim().length > 0 : false;
    return matchesQuery && (!missingOnly || !hasValue);
  });
  // QA (qa-admin §7): rendering all ~673 strings at once produced ~189k px
  // pages on mobile. Page the list; filters reset the window.
  const [visibleLimit, setVisibleLimit] = useState(TRANSLATION_PAGE_SIZE);
  useEffect(() => {
    setVisibleLimit(TRANSLATION_PAGE_SIZE);
  }, [query, missingOnly, selectedDocId, selectedCode]);
  const pagedKeys = visibleKeys.slice(0, visibleLimit);
  const updateSelectedLocale = (updates: Partial<TranslationEntry>) => {
    if (!selected) return;
    setEntries(entries.map((entry) => entry.code === selected.code ? { ...entry, ...updates, updatedAt: today() } : entry));
  };
  const addLanguage = () => openModal({
    title: 'Create Language Entry',
    content: <LanguageForm existingCodes={entries.map((entry) => entry.code)} close={() => openModal(null)} save={(entry) => {
      setEntries([...entries, entry]);
      setSelectedCode(entry.code);
      openModal(null);
      toast(`${entry.language} created with ${localizationKeys.length} translatable strings.`);
    }} localizationKeys={localizationKeys} />,
  });
  const editProduct = (doc?: DocEntry) => openModal({
    title: doc ? 'Edit Product' : 'Add Product',
    content: <TranslationProductForm doc={doc} close={() => openModal(null)} save={(next) => {
      if (doc) {
        setDocs(docs.map((item) => item.id === doc.id ? next : item));
        setSelectedDocId(next.id);
        toast('Product updated.');
      } else {
        const starter = docSection(`${next.id}-s1`, '1.0', 'overview', 'Overview', `Starter section for ${next.title || 'new product'}.`, 'draft', next.owner, [`Start writing ${next.title || 'this product'} documentation.`]);
        setDocs([{ ...next, sections: 1 }, ...docs]);
        setCustomSections({ ...customSections, [next.id]: [starter] });
        setSelectedDocId(next.id);
        toast('Product added.');
      }
      openModal(null);
    }} />,
  });
  const updateValue = (key: string, value: string) => {
    if (!selected) return;
    setEntries(entries.map((entry) => entry.code === selected.code ? {
      ...entry,
      values: { ...entry.values, [key]: value },
      rowMeta: { ...(entry.rowMeta || {}), [key]: { ...(entry.rowMeta?.[key] || {}), state: 'dirty', updatedAt: today() } },
      updatedAt: today(),
    } : entry));
  };
  const updateRowMeta = (key: string, updates: Partial<{ state: TranslationRowState; comment: string }>) => {
    if (!selected) return;
    setEntries(entries.map((entry) => entry.code === selected.code ? {
      ...entry,
      rowMeta: {
        ...(entry.rowMeta || {}),
        [key]: {
          state: updates.state || entry.rowMeta?.[key]?.state || ((entry.values[key] ?? '').trim() ? 'saved' : 'dirty'),
          comment: updates.comment ?? entry.rowMeta?.[key]?.comment,
          updatedAt: today(),
        },
      },
      updatedAt: today(),
    } : entry));
  };
  const goToNextMissing = () => {
    if (!missingKeys.length) return;
    setMissingOnly(true);
  };

  return (
    <>
      <ViewHeader
        title="Translations"
        subtitle={selectedDoc ? `${selectedDoc.title} · ${productKeys.length} translatable strings across ${entries.length} languages` : 'Pick a product to manage translations'}
        action={<div className="header-actions"><button className="btn" onClick={() => editProduct(selectedDoc)}>Edit Product</button><button className="btn btn-red" onClick={() => editProduct()}>+ Add Product</button><button className="btn" onClick={addLanguage}>+ New Language</button></div>}
      />
      <section className="translation-product-panel" aria-label="Translation product selector">
        <label className="field">
          <span>Product</span>
          <select value={selectedDoc?.id ?? ''} onChange={(event) => setSelectedDocId(event.target.value)}>
            {docs.map((doc) => <option key={doc.id} value={doc.id}>{doc.title}</option>)}
          </select>
        </label>
        <div className="translation-product-meta">
          <strong>{selectedDoc?.title ?? 'No product selected'}</strong>
          <span>{selectedDoc ? `${labelForDocKind(selectedDoc.type)} · ${selectedBundle?.sections.length ?? 0} sections · v${selectedDoc.version}` : 'Create a product to start translating.'}</span>
        </div>
      </section>
      <div className="translation-workspace">
        <aside className="language-rail">
          {entries.map((entry) => {
            const isActive = entry.code === selected?.code;
            const entryProgress = getTranslationProgress(entry, productKeys);
            return (
              <button
                className={isActive ? 'active' : ''}
                key={entry.code}
                onClick={() => setSelectedCode(entry.code)}
                aria-current={isActive ? 'true' : undefined}
                aria-label={`${entry.language} (${entry.code}) ${entryProgress}% complete`}
              >
                <span><strong>{entry.language}</strong><small>{entry.nativeName} · {entry.code}</small></span>
                <em>{entryProgress}%</em>
              </button>
            );
          })}
        </aside>
        {selected ? (
          <section className="translation-editor">
            <div className="translation-header">
              <div>
                <h2>{selected.language}</h2>
                <p className="translation-subtitle">{selected.nativeName} · {selected.code} · {selectedProgress}% complete for {selectedDoc?.title ?? 'selected product'}</p>
              </div>
              <div className="translation-header-stats" aria-label="Translation status">
                <span>{selectedProgress}% complete</span>
                <span>{productKeys.length} strings</span>
                <span>{missingKeys.length} missing</span>
              </div>
            </div>
            <div className="locale-workflow-panel">
              <label className="field"><span>Owner</span><input value={selected.owner || 'Localization'} onChange={(event) => updateSelectedLocale({ owner: event.target.value })} /></label>
              <label className="field"><span>Reviewer</span><input value={selected.reviewer} onChange={(event) => updateSelectedLocale({ reviewer: event.target.value })} /></label>
              <label className="field"><span>Due date</span><input type="date" value={selected.dueDate || ''} onChange={(event) => updateSelectedLocale({ dueDate: event.target.value })} /></label>
              <label className="field"><span>Status</span><select value={selected.status} onChange={(event) => updateSelectedLocale({ status: event.target.value as TranslationStatus })}>{(['not-started', 'in-progress', 'review', 'published'] as TranslationStatus[]).map((status) => <option key={status} value={status}>{labelForTranslationStatus(status)}</option>)}</select></label>
            </div>
            <div className="translation-tools">
              <label className="field"><span>Search content</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Section, content label, or source text" /></label>
              <label className="toggle-field"><input type="checkbox" checked={missingOnly} onChange={(event) => setMissingOnly(event.target.checked)} /> Missing only</label>
              <button className="btn btn-sm btn-ghost" type="button" disabled={!missingKeys.length} onClick={goToNextMissing}>Next missing</button>
              <span>{visibleKeys.length > pagedKeys.length ? `${pagedKeys.length} of ${visibleKeys.length} strings shown` : `${visibleKeys.length} visible strings`}</span>
            </div>
            <div className={`key-value-table ${isEnglish ? 'english-mode' : ''}`}>
              <div className="key-value-head">
                <span>Content</span>
                {!isEnglish ? <span>English Source</span> : null}
                <span>{isEnglish ? 'English Copy' : `${selected.language} Translation`}</span>
              </div>
              {pagedKeys.map((key) => {
                const translationLabel = isEnglish ? `${key.label} English copy` : `${key.label} ${selected.language} translation`;
                return (
                <div className="key-value-row" key={key.id}>
                  <div className="translation-content-label">
                    <strong>{key.label}</strong>
                    <span>{key.section}</span>
                    <code title={key.id}>{compactTranslationKey(key.id)}</code>
                  </div>
                  {!isEnglish ? <div className="source-value" aria-label={`${key.label} English source`}>{key.defaultValue}</div> : null}
                  <div className="translation-cell-workflow">
                    <textarea
                      value={selected.values[key.id] ?? ''}
                      onChange={(event) => updateValue(key.id, event.target.value)}
                      aria-label={translationLabel}
                      lang={selected.code}
                    />
                    <div className="translation-row-state">
                      <Pill status={selected.rowMeta?.[key.id]?.state || ((selected.values[key.id] ?? '').trim() ? 'saved' : 'dirty')} />
                      <button type="button" onClick={() => updateRowMeta(key.id, { state: 'saved' })}>Mark saved</button>
                      <button type="button" onClick={() => updateRowMeta(key.id, { state: 'review' })}>Send review</button>
                    </div>
                    <input
                      value={selected.rowMeta?.[key.id]?.comment || ''}
                      onChange={(event) => updateRowMeta(key.id, { comment: event.target.value })}
                      placeholder="Comment for translator/reviewer"
                      aria-label={`Comment for ${key.label}`}
                    />
                  </div>
                </div>
                );
              })}
            </div>
            {visibleKeys.length > pagedKeys.length ? (
              <div className="translation-pagination">
                <button className="btn btn-sm" type="button" onClick={() => setVisibleLimit((limit) => limit + TRANSLATION_PAGE_SIZE)}>
                  Show {Math.min(TRANSLATION_PAGE_SIZE, visibleKeys.length - pagedKeys.length)} more ({visibleKeys.length - pagedKeys.length} remaining)
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </>
  );
}

function PublishingPage({ releases, setReleases, docs, bundles, translations, localizationKeys, auditEvents, appendAuditEvent, openModal, toast }: {
  releases: ReleaseEntry[];
  setReleases: (items: ReleaseEntry[]) => void;
  docs: DocEntry[];
  bundles: { doc: DocEntry; sections: SectionEntry[]; setSections: (items: SectionEntry[]) => void }[];
  translations: TranslationEntry[];
  localizationKeys: LocalizationKey[];
  auditEvents: AuditEvent[];
  appendAuditEvent: (event: Omit<AuditEvent, 'id' | 'at' | 'actor'> & { actor?: string }) => void;
  openModal: (modal: ModalState) => void;
  toast: (message: string) => void;
}) {
  const currentUser = auth.currentUser();
  const create = () => openModal({
    title: 'New Version Snapshot',
    content: <ReleaseForm docs={docs} releases={releases} close={() => openModal(null)} save={(release) => {
      setReleases([release, ...releases]);
      appendAuditEvent({
        action: 'create',
        entityType: 'release',
        entityId: release.id,
        documentId: release.docId,
        releaseId: release.id,
        title: release.label,
        summary: `Version snapshot ${release.version} created for review.`,
      });
      openModal(null);
      toast('Version snapshot created.');
    }} />,
  });
  const publish = (release: ReleaseEntry) => {
    const doc = docs.find((item) => item.id === release.docId);
    const bundle = bundles.find((item) => item.doc.id === release.docId);
    if (!doc || !bundle) {
      toast('Cannot publish: document content was not found.');
      return;
    }
    const readiness = getReadiness(doc, bundles, translations, localizationKeys.filter((key) => key.docId === doc.id));
    if (!readiness.ready) {
      toast(`Publish blocked: ${readiness.reasons.join(', ')}`);
      return;
    }
    const previous = latestPublishedSnapshot(releases, doc.id);
    const targetEnvironment = release.environment === 'production' ? 'production' : 'staging';
    const snapshot = buildPublishSnapshot({
      doc,
      sections: bundle.sections,
      translations,
      localizationKeys,
      readiness,
      actor: currentUser?.id ?? 'unknown',
      environment: targetEnvironment,
      priorSnapshotId: previous?.id,
    });
    setReleases(releases.map((item) => item.id === release.id ? {
      ...item,
      status: 'published',
      actor: snapshot.actor,
      createdAt: release.createdAt,
      sourceRevision: snapshot.id,
      previousSnapshotId: previous?.id,
      environment: snapshot.environment,
      readinessScore: snapshot.readiness.score,
      readinessReasons: snapshot.readiness.reasons,
      snapshot,
      immutable: true,
    } : item));
    appendAuditEvent({
      action: 'publish',
      entityType: 'release',
      entityId: release.id,
      documentId: doc.id,
      releaseId: release.id,
      title: release.label,
      summary: `Published immutable snapshot ${snapshot.id} to ${snapshot.environment}. Readiness ${snapshot.readiness.score}%.`,
    });
    toast('Immutable publish snapshot created.');
  };
  const rollback = (release: ReleaseEntry, reason: string) => {
    if (!release.snapshot) return;
    const rollbackNumber = releases.filter((item) => item.rollbackOf === release.id).length + 1;
    const rollbackId = `rollback-${release.id}-${rollbackNumber}`;
    const rollbackSnapshotId = `snapshot-${rollbackId}`;
    const rollbackRelease: ReleaseEntry = {
      ...release,
      id: rollbackId,
      label: `Rollback to ${release.label}`,
      status: 'published',
      notes: `Rollback targeting ${release.id}. Reason: ${reason.trim() || 'No reason provided.'}`,
      createdAt: today(),
      actor: currentUser?.id ?? 'unknown',
      sourceRevision: rollbackSnapshotId,
      previousSnapshotId: latestPublishedSnapshot(releases, release.docId)?.id,
      rollbackOf: release.id,
      immutable: true,
      snapshot: {
        ...cloneRevisionValue(release.snapshot),
        id: rollbackSnapshotId,
        actor: currentUser?.id ?? 'unknown',
        createdAt: today(),
        priorSnapshotId: latestPublishedSnapshot(releases, release.docId)?.id,
      },
    };
    setReleases([rollbackRelease, ...releases]);
    appendAuditEvent({
      action: 'rollback',
      entityType: 'release',
      entityId: rollbackRelease.id,
      documentId: release.docId,
      releaseId: rollbackRelease.id,
      title: rollbackRelease.label,
      summary: `Rollback recorded against release ${release.id}. Reason: ${reason.trim() || 'No reason provided.'} Snapshot ${rollbackSnapshotId}.`,
    });
    toast('Rollback recorded as a new immutable snapshot.');
  };
  const requestRollback = (release: ReleaseEntry) => openModal({
    title: 'Rollback Release',
    content: <RollbackForm release={release} close={() => openModal(null)} save={(reason) => {
      rollback(release, reason);
      openModal(null);
    }} />,
  });

  return (
    <>
      <ViewHeader title="Publishing" subtitle="Prepare documentation snapshots for release, audit, or partner handoff" action={<button type="button" className="btn btn-red" onClick={create}>+ New Version</button>} />
      <div className="readiness-grid">
        {docs.filter((doc) => bundles.some((bundle) => bundle.doc.id === doc.id)).map((doc) => {
          const readiness = getReadiness(doc, bundles, translations, localizationKeys.filter((key) => key.docId === doc.id));
          return (
            <article className="readiness-card" key={doc.id}>
              <div><span>{doc.type}</span><Pill status={readiness.ready ? 'published' : 'review'} /></div>
              <h2>{doc.title}</h2>
              <ProgressRow label="Release readiness" value={readiness.score} />
              <p>{readiness.reasons.join(' · ')}</p>
            </article>
          );
        })}
      </div>
      <Card>
        <table className="data">
          <thead><tr><th>Version</th><th>Document</th><th>Status</th><th>Snapshot</th><th>Notes</th><th>Created</th><th scope="col" aria-label="Actions" /></tr></thead>
          <tbody>{releases.map((release) => {
            const doc = docs.find((item) => item.id === release.docId);
            const readiness = doc ? getReadiness(doc, bundles, translations, localizationKeys.filter((key) => key.docId === doc.id)) : { ready: false, reasons: ['Document not found'], score: 0 };
            const draftTarget = (release.environment ?? 'draft') === 'draft';
            const publishBlocked = release.status !== 'draft' || draftTarget || !readiness.ready;
            const publishTitle = release.status === 'published' ? 'Already published' : release.status === 'rolled-back' ? 'Release has been rolled back; create a new version to publish again.' : draftTarget ? 'Draft target is a snapshot only; choose staging or production to publish.' : readiness.ready ? `Publish to ${release.environment}` : readiness.reasons.join(', ');
            const isRollbackEntry = Boolean(release.rollbackOf);
            const rollbackBlocked = !release.snapshot || release.status === 'rolled-back' || isRollbackEntry;
            const rollbackTitle = !release.snapshot ? 'No immutable snapshot available to roll back.' : release.status === 'rolled-back' ? 'This release is already rolled back.' : isRollbackEntry ? 'This entry is itself a rollback snapshot.' : 'Record a rollback against this published snapshot.';
            return <tr key={release.id}><td><strong>{release.label}</strong><div className="mono muted">v{release.version} · {release.id}</div></td><td>{doc?.title ?? release.docId}</td><td><Pill status={release.status} /></td><td><div className="snapshot-meta"><strong>{release.immutable ? 'Immutable' : 'Draft'}</strong><span>{release.sourceRevision ?? 'No snapshot yet'}</span><span>Target: {release.environment ?? 'draft'} · {release.readinessScore ?? readiness.score}% ready</span><span>Gate: {readiness.ready ? 'pass' : 'blocked'}</span></div></td><td className="notes-cell">{release.notes}</td><td>{release.createdAt}</td><td className="actions"><button type="button" className="btn btn-sm btn-ghost" disabled={publishBlocked} title={publishTitle} onClick={() => publish(release)}>Publish</button><button type="button" className="btn btn-sm btn-ghost" disabled={rollbackBlocked} title={rollbackTitle} onClick={() => requestRollback(release)}>Rollback</button></td></tr>;
          })}</tbody>
        </table>
      </Card>
      <AuditTrailPanel events={auditEvents} docs={docs} releases={releases} />
    </>
  );
}

function AuditTrailPanel({ events, docs, releases }: { events: AuditEvent[]; docs: DocEntry[]; releases: ReleaseEntry[] }) {
  const [documentId, setDocumentId] = useState('');
  const [entityId, setEntityId] = useState('');
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const docById = new Map(docs.map((doc) => [doc.id, doc]));
  const actors = [...new Set(events.map((event) => event.actor).filter(Boolean))].sort();
  const actions = [...new Set(events.map((event) => event.action))].sort();
  const filteredEvents = events
    .filter((event) => !documentId || event.documentId === documentId)
    .filter((event) => !entityId || [event.entityId, event.sectionId, event.releaseId].some((value) => value?.toLowerCase().includes(entityId.toLowerCase())))
    .filter((event) => !actor || event.actor === actor)
    .filter((event) => !action || event.action === action)
    .slice()
    .reverse()
    .slice(0, 80);
  const releaseEvidence = filteredEvents.filter((event) => event.entityType === 'release' || event.releaseId);

  return (
    <Card title="Audit Evidence">
      <div className="audit-filter-bar">
        <label className="field"><span>Document</span><select value={documentId} onChange={(event) => setDocumentId(event.target.value)}><option value="">All documents</option>{docs.map((doc) => <option value={doc.id} key={doc.id}>{doc.title}</option>)}</select></label>
        <label className="field"><span>Section / Release</span><input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="section or release id" /></label>
        <label className="field"><span>Actor</span><select value={actor} onChange={(event) => setActor(event.target.value)}><option value="">All actors</option>{actors.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label className="field"><span>Action</span><select value={action} onChange={(event) => setAction(event.target.value)}><option value="">All actions</option>{actions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      </div>
      <div className="audit-summary-row">
        <span>{filteredEvents.length} matching events</span>
        <span>{releaseEvidence.length} release evidence events</span>
        <span>{releases.filter((release) => release.immutable).length} immutable snapshots</span>
      </div>
      <div className="audit-event-list">
        {filteredEvents.length ? filteredEvents.map((event) => (
          <article className="audit-event" key={event.id}>
            <div><Pill status={event.action === 'rollback' ? 'rolled-back' : event.action === 'delete' ? 'archived' : event.action === 'publish' ? 'published' : event.action === 'review' ? 'review' : 'draft'} /><strong>{event.title}</strong></div>
            <p>{event.summary}</p>
            <footer>
              <span>{new Date(event.at).toLocaleString()}</span>
              <span>{event.actor}</span>
              <span>{docById.get(event.documentId || '')?.title ?? event.documentId ?? 'No document'}</span>
              <span>{event.entityType}:{event.entityId}</span>
            </footer>
          </article>
        )) : <EmptyState title="No audit events yet" message="Create, edit, review, publish, or rollback content to populate durable audit evidence." />}
      </div>
    </Card>
  );
}

function LoopingVideoPlayer({ asset }: { asset: MediaAsset }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playBudgetRef = useRef(0);
  const pausedByUserRef = useRef(false);
  const loopEnabled = isVideoAsset(asset) && Boolean(asset.videoLoopEnabled);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    playBudgetRef.current = 0;
    pausedByUserRef.current = false;

    const onPlay = () => {
      pausedByUserRef.current = false;
      if (!loopEnabled) {
        playBudgetRef.current = 1;
        return;
      }
      if (playBudgetRef.current <= 0 || video.currentTime < 0.25 || video.ended) {
        playBudgetRef.current = VIDEO_LOOP_PLAY_COUNT;
      }
    };

    const onPause = () => {
      if (!video.ended) pausedByUserRef.current = true;
    };

    const onEnded = () => {
      if (!loopEnabled) return;
      if (pausedByUserRef.current) return;
      if (playBudgetRef.current <= 1) {
        playBudgetRef.current = 0;
        return;
      }
      playBudgetRef.current -= 1;
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
    };
  }, [asset.src, loopEnabled]);

  return (
    <video
      ref={videoRef}
      className="media-asset-form-video"
      src={asset.src}
      poster={asset.thumbnailSrc}
      controls
      preload="metadata"
    />
  );
}

function MediaLibraryImageLightbox({ images, startIndex, close }: { images: MediaAsset[]; startIndex: number; close: () => void }) {
  const [index, setIndex] = useState(clampBetween(startIndex, 0, Math.max(images.length - 1, 0)));
  const active = images[index];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setIndex((current) => Math.min(images.length - 1, current + 1));
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [images.length, close]);

  if (!active) {
    return (
      <div className="media-lightbox-empty">
        <p>No image selected.</p>
        <div className="form-actions">
          <button className="btn btn-sm" type="button" onClick={close}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="media-lightbox">
      <div className="media-lightbox-stage">
        <button className="media-lightbox-arrow" type="button" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={index <= 0} aria-label="Previous image">‹</button>
        <img src={active.src} alt={mediaAssetDisplayName(active)} />
        <button className="media-lightbox-arrow" type="button" onClick={() => setIndex((current) => Math.min(images.length - 1, current + 1))} disabled={index >= images.length - 1} aria-label="Next image">›</button>
      </div>
      <div className="media-lightbox-meta">
        <strong>{mediaAssetDisplayName(active)}</strong>
        <span>{index + 1} / {images.length}</span>
      </div>
      <div className="form-actions">
        <button className="btn btn-sm" type="button" onClick={close}>Close</button>
        <a className="btn btn-sm btn-red" href={active.src} target="_blank" rel="noopener noreferrer">Open in new tab</a>
      </div>
    </div>
  );
}

function MediaAssetForm({
  asset,
  close,
  save,
  goPrevious,
  goNext,
  hasPrevious = false,
  hasNext = false,
  positionLabel = '',
}: {
  asset: MediaAsset;
  close: () => void;
  save: (asset: MediaAsset) => void;
  goPrevious?: () => void;
  goNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  positionLabel?: string;
}) {
  const [alt, setAlt] = useState(asset.alt);
  const [tags, setTags] = useState(asset.tags.join(', '));
  const [owner, setOwner] = useState(asset.owner);
  const [videoLoopEnabled, setVideoLoopEnabled] = useState(Boolean(asset.videoLoopEnabled));
  const isVideo = isVideoAsset(asset);

  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      save({
        ...asset,
        alt: alt.trim() || asset.originalName || asset.alt,
        tags: splitMediaTags(tags),
        owner: owner.trim() || asset.owner,
        videoLoopEnabled: isVideo ? videoLoopEnabled : asset.videoLoopEnabled,
        updatedAt: today(),
      });
    }}>
      <div className="media-asset-form">
        <div className="media-asset-form-preview" aria-label="Media preview">
          {isImageAsset(asset) ? <img src={asset.src} alt="" /> : isVideo ? <LoopingVideoPlayer asset={{ ...asset, videoLoopEnabled }} /> : <div className="media-library-icon large" aria-hidden="true">{mediaAssetIcon(asset)}</div>}
        </div>
        {goPrevious || goNext ? (
          <div className="media-asset-form-nav" aria-label="Navigate media">
            <button className="btn btn-sm" type="button" onClick={goPrevious} disabled={!hasPrevious}>← Previous</button>
            <span>{positionLabel}</span>
            <button className="btn btn-sm" type="button" onClick={goNext} disabled={!hasNext}>Next →</button>
          </div>
        ) : null}
        <div className="form-grid">
          <label className="field wide"><span>Display Name</span><input value={alt} onChange={(event) => setAlt(event.target.value)} placeholder="Name shown in media cards and pickers" /></label>
          <label className="field wide"><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="manual, lobby, settings" /></label>
          <label className="field"><span>Owner</span><input value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
          {isVideo ? (
            <label className="field wide">
              <span>Video Playback</span>
              <span className="video-loop-toggle">
                <input type="checkbox" checked={videoLoopEnabled} onChange={(event) => setVideoLoopEnabled(event.target.checked)} />
                Loop when played (up to {VIDEO_LOOP_PLAY_COUNT} plays unless paused)
              </span>
            </label>
          ) : null}
          <div className="form-note wide">
            <strong>File</strong>
            <span>{asset.originalName || asset.src}</span>
            <em>{asset.mimeType ? `${asset.mimeType} · ` : ''}{asset.sizeBytes ? `${formatBytes(asset.sizeBytes)} · ` : ''}{asset.createdAt ? `Uploaded ${new Date(asset.createdAt).toLocaleString()}` : `Updated ${asset.updatedAt}`}</em>
            <a href={asset.src} target="_blank" rel="noopener noreferrer">Open in new tab</a>
          </div>
        </div>
      </div>
      <FormActions close={close} submit="Save Media" />
    </form>
  );
}

function MediaLibraryPage({ assets, setAssets, bundles, openModal, toast, appendAuditEvent }: {
  assets: MediaAsset[];
  setAssets: (items: MediaAsset[]) => void;
  bundles: { doc: DocEntry; sections: SectionEntry[] }[];
  openModal: (modal: ModalState) => void;
  toast: (message: string, kind?: Toast['kind']) => void;
  appendAuditEvent: (event: Omit<AuditEvent, 'id' | 'at' | 'actor'> & { actor?: string }) => void;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | 'image' | 'video' | 'document' | 'data' | 'other'>('all');
  const [uploadProgress, setUploadProgress] = useState({ active: false, percent: 0, fileCount: 0 });
  const usageRefs = useMemo(() => collectMediaUsageRefs(assets, bundles), [assets, bundles]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const assetKind = mediaAssetKind(asset);
      if (kind !== 'all' && assetKind !== kind) return false;
      if (!normalized) return true;
      return [
        asset.alt,
        asset.originalName,
        asset.owner,
        asset.tags?.join(' '),
        asset.mimeType,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalized));
    });
  }, [assets, kind, query]);
  const filteredImages = useMemo(() => filtered.filter((asset) => isImageAsset(asset)), [filtered]);

  const upload = async (event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    setUploadProgress({ active: true, percent: 0, fileCount: files.length });
    try {
      const uploaded = await uploadMediaFilesToServer(files, {
        onProgress: (percent) => setUploadProgress((previous) => previous.active ? { ...previous, percent } : previous),
      });
      setUploadProgress((previous) => previous.active ? { ...previous, percent: 100 } : previous);
      const thumbnails = await Promise.all(uploaded.map((file, index) => {
        const original = files[index];
        return createVideoThumbnailFromFile(original, file.mimeType);
      }));
      const nextAssets: MediaAsset[] = uploaded.map((file, index) => ({
        id: file.id,
        src: file.src,
        fileName: file.fileName,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        createdAt: file.createdAt,
        alt: file.originalName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
        tags: splitMediaTags(file.originalName),
        owner: 'Docs',
        thumbnailSrc: thumbnails[index] || undefined,
        updatedAt: today(),
        usageRefs: [],
      }));
      setAssets([...nextAssets, ...assets]);
      nextAssets.forEach((asset) => {
        appendAuditEvent({
          action: 'create',
          entityType: 'integration',
          entityId: asset.id,
          title: mediaAssetDisplayName(asset),
          summary: `Media asset uploaded (${mediaAssetKind(asset)}).`,
        });
      });
      toast(`${nextAssets.length} media file${nextAssets.length === 1 ? '' : 's'} uploaded.`);
      input.value = '';
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Upload failed.', 'error');
    } finally {
      window.setTimeout(() => {
        setUploadProgress({ active: false, percent: 0, fileCount: 0 });
      }, 220);
    }
  };

  const openEditAssetAtIndex = (source: MediaAsset[], index: number) => {
    if (!source.length) return;
    const currentIndex = clampBetween(index, 0, source.length - 1);
    const current = source[currentIndex];
    if (!current) return;
    openModal({
      title: `Edit Media · ${mediaAssetDisplayName(current)}`,
      content: <MediaAssetForm
        asset={current}
        close={() => openModal(null)}
        save={(next) => {
          setAssets(assets.map((item) => item.id === current.id ? next : item));
          appendAuditEvent({ action: 'update', entityType: 'integration', entityId: current.id, title: mediaAssetDisplayName(next), summary: 'Media metadata updated.' });
          openModal(null);
          toast('Media updated.');
        }}
        hasPrevious={currentIndex > 0}
        hasNext={currentIndex < source.length - 1}
        goPrevious={currentIndex > 0 ? () => openEditAssetAtIndex(source, currentIndex - 1) : undefined}
        goNext={currentIndex < source.length - 1 ? () => openEditAssetAtIndex(source, currentIndex + 1) : undefined}
        positionLabel={`${currentIndex + 1} / ${source.length}`}
      />,
    });
  };

  const editAsset = (asset: MediaAsset) => {
    const source = filtered.length ? filtered : assets;
    const index = source.findIndex((item) => item.id === asset.id);
    openEditAssetAtIndex(source, index >= 0 ? index : 0);
  };

  const previewVideo = (asset: MediaAsset) => openModal({
    title: `Preview Video · ${mediaAssetDisplayName(asset)}`,
    content: (
      <div className="media-video-preview">
        <LoopingVideoPlayer asset={asset} />
        <p className="media-video-preview-note">
          {asset.videoLoopEnabled
            ? `Loop is active: each play repeats up to ${VIDEO_LOOP_PLAY_COUNT} times unless paused.`
            : 'Loop is disabled: the video plays once per manual start.'}
        </p>
        <div className="form-actions">
          <button className="btn btn-sm" type="button" onClick={() => openModal(null)}>Close</button>
          <a className="btn btn-sm btn-red" href={asset.src} target="_blank" rel="noopener noreferrer">Open in new tab</a>
        </div>
      </div>
    ),
  });

  const openImageLightbox = (asset: MediaAsset) => {
    const startIndex = filteredImages.findIndex((item) => item.id === asset.id);
    openModal({
      title: `Image Preview · ${mediaAssetDisplayName(asset)}`,
      content: (
        <MediaLibraryImageLightbox
          images={filteredImages}
          startIndex={startIndex >= 0 ? startIndex : 0}
          close={() => openModal(null)}
        />
      ),
    });
  };

  const deleteAsset = (asset: MediaAsset) => openModal({
    title: 'Delete media',
    content: <WarningConfirm
      eyebrow="Permanent action"
      title={`Delete "${mediaAssetDisplayName(asset)}"?`}
      message="This removes the media record from the library. If the file was uploaded into DocPilot, the underlying file is deleted as well."
      detail={usageRefs[asset.id]?.length ? `Referenced in ${usageRefs[asset.id].length} section(s).` : 'No usage references detected.'}
      confirmLabel="Delete media"
      close={() => openModal(null)}
      confirm={async () => {
        try {
          if (asset.fileName) await deleteMediaFileFromServer(asset.fileName);
          setAssets(assets.filter((item) => item.id !== asset.id));
          appendAuditEvent({ action: 'delete', entityType: 'integration', entityId: asset.id, title: mediaAssetDisplayName(asset), summary: 'Media asset deleted.' });
          openModal(null);
          toast('Media deleted.');
        } catch (error) {
          toast(error instanceof Error ? error.message : 'Delete failed.', 'error');
        }
      }}
    />,
  });

  return (
    <>
      <ViewHeader
        title="Media Library"
        subtitle="Upload and manage images, videos, PDFs, spreadsheets, and data files used across DocPilot content."
        action={<label className={`btn btn-red media-upload-cta${uploadProgress.active ? ' is-disabled' : ''}`} aria-disabled={uploadProgress.active || undefined}>+ Upload<input type="file" multiple aria-label="Upload media files" accept="image/*,video/*,application/pdf,.csv,.xls,.xlsx" disabled={uploadProgress.active} onChange={upload} /></label>}
      />
      {uploadProgress.active ? (
        <div className="media-upload-progress" role="status" aria-live="polite">
          <div>
            <span>Uploading {uploadProgress.fileCount} file{uploadProgress.fileCount === 1 ? '' : 's'}</span>
            <strong>{uploadProgress.percent}%</strong>
          </div>
          <i role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress.percent}><b style={{ width: `${uploadProgress.percent}%` }} /></i>
        </div>
      ) : null}
      <div className="media-library-toolbar">
        <label className="field wide"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filename, tags, owner, mime type…" /></label>
        <Select name="kind" label="Type" value={kind} options={['all', 'image', 'video', 'document', 'data', 'other']} onChange={(next) => setKind(next as typeof kind)} />
      </div>
      <div className="media-asset-grid media-library-grid">
        {filtered.length ? filtered.map((asset) => {
          const refs = usageRefs[asset.id] || [];
          return (
            <div className="media-library-card" key={asset.id}>
              <button className="media-library-card-main" type="button" onClick={() => editAsset(asset)}>
                {isImageAsset(asset)
                  ? <img src={asset.src} alt="" />
                  : isVideoAsset(asset) && asset.thumbnailSrc
                    ? <img src={asset.thumbnailSrc} alt="" />
                    : <div className="media-library-icon" aria-hidden="true">{mediaAssetIcon(asset)}</div>}
                <span>{mediaAssetDisplayName(asset)}</span>
                <small>{asset.owner} · {asset.updatedAt}</small>
                <em>{asset.tags?.join(', ') || 'untagged'}</em>
                <i>{refs.length ? refs.slice(0, 2).join(' · ') : 'Not referenced'}</i>
              </button>
              <div className="media-library-card-actions">
                {isVideoAsset(asset)
                  ? <button className="btn btn-sm" type="button" onClick={() => previewVideo(asset)}>Play</button>
                  : isImageAsset(asset)
                    ? <button className="btn btn-sm" type="button" onClick={() => openImageLightbox(asset)}>Open</button>
                    : <a className="btn btn-sm" href={asset.src} target="_blank" rel="noopener noreferrer">Open</a>}
                <button className="btn btn-sm" type="button" onClick={() => editAsset(asset)}>Edit</button>
                <button className="btn btn-sm danger" type="button" onClick={() => deleteAsset(asset)}>Delete</button>
              </div>
            </div>
          );
        }) : assets.length ? <EmptyState title="No matching media" message="Adjust the search or type filter to show more assets." /> : <EmptyState title="No media yet" message="Upload files to populate the media library." />}
      </div>
    </>
  );
}

function AccessDenied({ permission }: { permission?: WritePermission }) {
  return (
    <>
      <ViewHeader title="Access Denied" subtitle="This workspace area requires a higher role." />
      <Card>
        <div className="empty-state">
          <strong>{permission ? 'Action permission required' : 'Admin role required'}</strong>
          <span>{permission ? `Required permission: ${permission}. Ask an administrator to update your role or complete this action.` : 'Ask an administrator to update your role or complete this action.'}</span>
        </div>
      </Card>
    </>
  );
}

function ValidationList({ issues }: { issues: ValidationIssue[] }) {
  if (!issues.length) return null;
  return (
    <div className="validation-list" role="alert">
      {issues.map((issue) => <div className={issue.kind} key={issue.message}>{issue.message}</div>)}
    </div>
  );
}

function PersistenceStatusBanner({ status }: { status: PersistenceStatus }) {
  const label = status === 'server' ? 'Server persistence active' : status === 'checking' ? 'Checking server persistence' : 'Server persistence unavailable';
  return (
    <div className={`persistence-status ${status}`} role="status">
      <strong>{label}</strong>
      <span>{status === 'server' ? 'CMS edits are stored through the DocPilot persistence API.' : 'Editing is locked until the persistence API is reachable.'}</span>
    </div>
  );
}

function PersistenceUnavailable({ status }: { status: PersistenceStatus }) {
  return (
    <Card>
      <div className="empty-state persistence-blocker">
        <strong>{status === 'checking' ? 'Connecting to persistence API' : 'Server persistence required'}</strong>
        <span>
          Start the DocPilot persistence API with <code>npm run dev</code>, or run <code>npm install</code> first if you just pulled latest changes.
          Local browser storage is importable prototype data only, so editing stays blocked rather than claiming a durable save.
        </span>
        <button className="btn btn-red" type="button" onClick={() => void store.checkPersistence()}>Retry connection</button>
      </div>
    </Card>
  );
}

function AdminContextBar({ companyName, product, documentCount, hasDraftWorkflowState }: { companyName?: string | null; product?: ProductEntry; documentCount: number; hasDraftWorkflowState: boolean }) {
  return (
    <div className="admin-context-bar" aria-label="Active workspace context">
      <div>
        <span>Workspace</span>
        <strong>{companyName ?? 'DocPilot'}</strong>
      </div>
      <div>
        <span>Product</span>
        <strong>{product?.name ?? 'Select a product'}</strong>
      </div>
      <div>
        <span>Documents</span>
        <strong>{documentCount}</strong>
      </div>
      <div className={hasDraftWorkflowState ? 'context-warning' : 'context-ok'}>
        <span>Workflow</span>
        <strong>{hasDraftWorkflowState ? 'Draft or review work present' : 'Clean for switching'}</strong>
      </div>
    </div>
  );
}

function useStoredState<T>(key: string, fallback: T): [T, (next: T) => boolean, boolean] {
  // Pin the first fallback: callers pass inline literals ([] / {}) whose
  // identity changes every render — with `fallback` in the effect deps that
  // re-ran hydrate forever, each run cancelling the last, so the instance
  // never counted as hydrated and every write was refused.
  const fallbackRef = useRef(fallback);
  const [value, setValue] = useState(() => store.get(key, fallbackRef.current));
  // Per-INSTANCE hydration flag. This instance's state may start from code
  // defaults (fresh context, or localStorage cache dropped on quota), so a
  // write before THIS instance saw the server value would persist
  // defaults-derived state and clobber real content. Verified data loss.
  const hydratedRef = useRef(isPrehydrationSafeKey(key));
  const [hydrated, setHydrated] = useState(hydratedRef.current);
  useEffect(() => {
    let active = true;
    void store.hydrate(key, fallbackRef.current).then((next) => {
      if (active) {
        setValue(next);
        hydratedRef.current = true;
        setHydrated(true);
      }
    });
    return () => {
      active = false;
    };
  }, [key]);
  // Returns whether the write was accepted — writes are blocked while this
  // instance is unhydrated, offline, or without permission (the reason is
  // surfaced via the persistence-error event). Callers showing success
  // toasts must check the return value.
  const update = useCallback((next: T) => {
    if (!hydratedRef.current) {
      notifyBlockedWrite('Still loading the latest data from the server — please retry in a moment.');
      return false;
    }
    if (!store.set(key, next)) return false;
    setValue(next);
    return true;
  }, [key]);
  return [value, update, hydrated];
}

function useRevisionedState<T>(initialValue: T) {
  const [value, setStateValue] = useState(() => cloneRevisionValue(initialValue));
  const valueRef = useRef(value);
  const [revision, setRevision] = useState<RevisionStack<T>>({ past: [], future: [] });

  const setValue = (nextValue: T | ((current: T) => T)) => {
    const current = valueRef.current;
    const resolved = typeof nextValue === 'function' ? (nextValue as (current: T) => T)(cloneRevisionValue(current)) : nextValue;
    if (revisionEqual(current, resolved)) return;
    setRevision((currentRevision) => ({
      past: limitRevisions([...currentRevision.past, cloneRevisionValue(current)]),
      future: [],
    }));
    const nextSnapshot = cloneRevisionValue(resolved);
    valueRef.current = nextSnapshot;
    setStateValue(nextSnapshot);
  };

  const setValueWithoutRevision = (nextValue: T | ((current: T) => T)) => {
    const current = valueRef.current;
    const resolved = typeof nextValue === 'function' ? (nextValue as (current: T) => T)(current) : nextValue;
    if (revisionEqual(current, resolved)) return;
    const nextSnapshot = cloneRevisionValue(resolved);
    valueRef.current = nextSnapshot;
    setStateValue(nextSnapshot);
  };

  const pushRevisionSnapshot = (snapshot: T) => {
    const current = valueRef.current;
    if (revisionEqual(snapshot, current)) return;
    setRevision((currentRevision) => ({
      past: limitRevisions([...currentRevision.past, cloneRevisionValue(snapshot)]),
      future: [],
    }));
  };

  const reset = (nextValue: T) => {
    const snapshot = cloneRevisionValue(nextValue);
    valueRef.current = snapshot;
    setStateValue(snapshot);
    setRevision({ past: [], future: [] });
  };

  const undo = () => {
    if (!revision.past.length) return null;
    const previous = cloneRevisionValue(revision.past[revision.past.length - 1]);
    const current = cloneRevisionValue(valueRef.current);
    setRevision({
      past: revision.past.slice(0, -1),
      future: limitRevisions([current, ...revision.future]),
    });
    valueRef.current = previous;
    setStateValue(previous);
    return previous;
  };

  const redo = () => {
    if (!revision.future.length) return null;
    const next = cloneRevisionValue(revision.future[0]);
    const current = cloneRevisionValue(valueRef.current);
    setRevision({
      past: limitRevisions([...revision.past, current]),
      future: revision.future.slice(1),
    });
    valueRef.current = next;
    setStateValue(next);
    return next;
  };

  const getCurrentValue = () => cloneRevisionValue(valueRef.current);

  return {
    value,
    setValue,
    setValueWithoutRevision,
    pushRevisionSnapshot,
    getCurrentValue,
    reset,
    undo,
    redo,
    canUndo: revision.past.length > 0,
    canRedo: revision.future.length > 0,
  };
}

function AdminLink({ page, label, icon }: { page: string; label: string; icon: string }) {
  const params = useParams();
  const basePath = useAdminBasePath();
  const currentPage = params.page ?? 'dashboard';
  return <Link className={`nav-link ${currentPage === page ? 'active' : ''}`} to={`${basePath}/${page}`}><span>{icon}</span>{label}</Link>;
}

function DocumentForm({ doc, docs, products, selectedProductId, save, close }: { doc?: DocEntry; docs: DocEntry[]; products: ProductEntry[]; selectedProductId: string; save: (doc: DocEntry) => void; close: () => void }) {
  const defaultTemplate = DOCUMENT_TEMPLATES[0];
  const [data] = useState<DocEntry>(() => doc ?? {
    id: `doc-${Date.now()}`,
    gameId: selectedProductId,
    title: defaultTemplate.title,
    slug: makeSlug(defaultTemplate.title),
    type: defaultTemplate.type,
    description: defaultTemplate.description,
    version: '0.1.0',
    status: 'draft',
    owner: defaultTemplate.owner,
    reviewer: defaultTemplate.owner,
    audience: defaultTemplate.audience,
    taxonomy: defaultTemplate.taxonomy,
    navPlacement: defaultTemplate.navPlacement,
    navOrder: docs.filter((item) => item.gameId === selectedProductId).length + 1,
    templateId: defaultTemplate.id,
    updatedAt: today(),
    sections: 0,
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState(docTemplateId(data));
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const selectedTemplate = getDocumentTemplate(selectedTemplateId);
  const draftDefaults: DocEntry = doc ? data : {
    ...data,
    title: selectedTemplate.title,
    slug: makeSlug(selectedTemplate.title),
    type: selectedTemplate.type,
    description: selectedTemplate.description,
    owner: selectedTemplate.owner,
    reviewer: selectedTemplate.owner,
    audience: selectedTemplate.audience,
    taxonomy: selectedTemplate.taxonomy,
    navPlacement: selectedTemplate.navPlacement,
    templateId: selectedTemplate.id,
  };
  return <form onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const template = getDocumentTemplate(text(form, 'templateId'));
    // QA (qa-admin §7): cleared required fields silently fell back to the
    // template defaults, so empty submits "succeeded" with no validation.
    // Keep the raw values so validateDocumentDraft can actually reject them.
    const title = text(form, 'title').trim();
    const next = {
      ...data,
      gameId: text(form, 'gameId'),
      title,
      slug: text(form, 'slug').trim() || (title ? makeSlug(title) : ''),
      type: text(form, 'type') as DocKind,
      description: text(form, 'description') || template.description,
      version: text(form, 'version'),
      status: text(form, 'status') as WorkflowStatus,
      owner: text(form, 'owner').trim(),
      reviewer: text(form, 'reviewer') || text(form, 'owner') || template.owner,
      audience: text(form, 'audience') || template.audience,
      taxonomy: text(form, 'taxonomy') || template.taxonomy,
      navPlacement: text(form, 'navPlacement') as NavPlacement,
      navOrder: Number(text(form, 'navOrder')) || data.navOrder || docs.filter((item) => item.gameId === text(form, 'gameId')).length + 1,
      templateId: template.id,
      updatedAt: today(),
    };
    const nextIssues = validateDocumentDraft(next, docs);
    setIssues(nextIssues);
    if (nextIssues.some((issue) => issue.kind === 'error')) return;
    save(next);
  }}>
    <ValidationList issues={issues} />
    <div className="form-grid" key={doc ? data.id : selectedTemplateId}>
      <label className="field"><span>Template</span><select name="templateId" value={selectedTemplateId} onChange={(event) => { setSelectedTemplateId(event.target.value); setIssues([]); }}>{DOCUMENT_TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label>
      <label className="field"><span>Product</span><select name="gameId" defaultValue={draftDefaults.gameId}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
      <Field name="title" label="Title" value={draftDefaults.title} wide />
      <Field name="slug" label="Slug" value={docSlug(draftDefaults)} />
      <label className="field"><span>Type</span><select name="type" defaultValue={draftDefaults.type}>{(['game', 'back-office', 'integration', 'operations'] as DocKind[]).map((kind) => <option key={kind} value={kind}>{labelForDocKind(kind)}</option>)}</select></label>
      <Field name="version" label="Version" value={draftDefaults.version} />
      <Field name="owner" label="Owner" value={draftDefaults.owner} />
      <Field name="reviewer" label="Reviewer" value={draftDefaults.reviewer || draftDefaults.owner} />
      <Select name="status" label="Status" value={draftDefaults.status} options={WORKFLOW_STATUSES} />
      <Field name="audience" label="Audience / visibility" value={docAudience(draftDefaults)} />
      <Field name="taxonomy" label="Taxonomy" value={docTaxonomy(draftDefaults)} />
      <Select name="navPlacement" label="Navigation" value={docNavPlacement(draftDefaults)} options={DOC_NAV_PLACEMENTS} />
      <Field name="navOrder" label="Navigation Order" type="number" value={docNavOrder(draftDefaults)} />
      <Field name="description" label="Description" value={draftDefaults.description} wide />
    </div>
    <div className="form-note wide document-template-note">
      <strong>{selectedTemplate.label} · {selectedTemplate.family}</strong>
      <span>{selectedTemplate.presentation}</span>
      <span>Creates {selectedTemplate.sections.length} starter sections. {selectedTemplate.effect}</span>
    </div>
    <FormActions close={close} submit={doc ? 'Save Document' : 'Create Document'} />
  </form>;
}

function TranslationProductForm({ doc, save, close }: { doc?: DocEntry; save: (doc: DocEntry) => void; close: () => void }) {
  const [data] = useState<DocEntry>(() => doc ?? { id: `doc-${Date.now()}`, gameId: '', title: '', type: 'game', description: '', version: '0.1.0', status: 'draft', owner: 'Docs', updatedAt: today(), sections: 0 });
  return <form onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = text(form, 'title');
    const id = data.id;
    save({
      ...data,
      gameId: data.gameId || makeSlug(title) || id,
      title,
      type: text(form, 'type') as DocKind,
      description: text(form, 'description'),
      version: text(form, 'version'),
      status: text(form, 'status') as WorkflowStatus,
      owner: text(form, 'owner'),
      updatedAt: today(),
    });
  }}><div className="form-grid"><Field name="title" label="Product Name" value={data.title} wide /><Select name="type" label="Product Type" value={data.type} options={['game', 'back-office', 'integration', 'operations']} /><Field name="version" label="Version" value={data.version} /><Field name="owner" label="Owner" value={data.owner} /><Select name="status" label="Status" value={data.status} options={WORKFLOW_STATUSES} /><Field name="description" label="Description" value={data.description} wide /></div><FormActions close={close} submit={doc ? 'Save Product' : 'Create Product'} /></form>;
}

function DocumentationActionBar({ doc, selectedSection, addSection, editSection, publishOrUpdate, saveAsDraft, duplicateSection, deleteSection, undoRevision, redoRevision, canUndo, canRedo, revisionHistory, restoreRevision, collapseAllSections, expandAllSections, collapsedCount, sectionCount, elementsLibraryOpen, toggleElementsLibrary }: {
  doc: DocEntry;
  selectedSection: SectionEntry | null;
  addSection: () => void;
  editSection: (section: SectionEntry) => void;
  publishOrUpdate: (section: SectionEntry) => void;
  saveAsDraft: (section: SectionEntry) => void;
  duplicateSection: (section: SectionEntry) => void;
  deleteSection: (section: SectionEntry) => void;
  undoRevision: () => void;
  redoRevision: () => void;
  canUndo: boolean;
  canRedo: boolean;
  revisionHistory: RevisionHistoryEntry[];
  restoreRevision: (entry: RevisionHistoryEntry) => void;
  collapseAllSections: () => void;
  expandAllSections: () => void;
  collapsedCount: number;
  sectionCount: number;
  elementsLibraryOpen: boolean;
  toggleElementsLibrary: () => void;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const primaryLabel = selectedSection?.status === 'published' ? 'Update' : 'Publish';
  const latestRevision = revisionHistory[revisionHistory.length - 1];
  return (
    <div className="documentation-action-bar" aria-label="Documentation save actions">
      <div>
        <span>{doc.title} · v{doc.version}</span>
        <strong>{selectedSection ? `${selectedSection.number} ${selectedSection.title}` : 'No section selected'}</strong>
      </div>
      {selectedSection ? <Pill status={selectedSection.status} /> : null}
      <div className="documentation-action-buttons">
        <div className="revision-menu">
          <button
            className={`btn btn-sm btn-ghost ${showHistory ? 'active' : ''}`}
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            aria-expanded={showHistory}
          >
            Revisions
          </button>
          {showHistory ? (
            <div className="documentation-revision-panel" role="dialog" aria-label="Version history">
              <div className="revision-panel-head">
                <div>
                  <span>Version History</span>
                  <strong>v{doc.version}</strong>
                </div>
                <button type="button" onClick={() => setShowHistory(false)} aria-label="Close revision history">×</button>
              </div>
              <div className="revision-panel-current">
                <span>Current controller</span>
                <strong>{latestRevision ? latestRevision.label : 'No saved changes yet'}</strong>
                <em>{latestRevision ? latestRevision.timestamp : 'Save or update to start history'}</em>
              </div>
              <div className="revision-history-list">
                {revisionHistory.length ? revisionHistory.slice().reverse().map((entry, index) => (
                  <button type="button" key={entry.id} onClick={() => restoreRevision(entry)}>
                    <span>{index === 0 ? 'Latest' : entry.version}</span>
                    <strong>{entry.label}</strong>
                    <em>{entry.detail}</em>
                    <small>{entry.timestamp}</small>
                  </button>
                )) : (
                  <div className="revision-history-empty">No saved version history in this editing session.</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
        <RevisionButtons undo={undoRevision} redo={redoRevision} canUndo={canUndo} canRedo={canRedo} label="Document revision history" />
        {/* Exact reader rendering in both themes — what readers will see. */}
        <a className="btn btn-sm btn-ghost" href={`${docPath(doc)}?previewTheme=light`} target="_blank" rel="noreferrer" title="Open the published reader view in light mode">☀ Preview</a>
        <a className="btn btn-sm btn-ghost" href={`${docPath(doc)}?previewTheme=dark`} target="_blank" rel="noreferrer" title="Open the published reader view in dark mode">◐ Dark</a>
        <button className={`btn btn-sm btn-ghost ${elementsLibraryOpen ? 'active' : ''}`} type="button" onClick={toggleElementsLibrary} aria-pressed={elementsLibraryOpen}>Elements</button>
        <button className="btn btn-sm btn-ghost" type="button" onClick={collapseAllSections} disabled={sectionCount === 0 || collapsedCount === sectionCount}>Collapse All</button>
        <button className="btn btn-sm btn-ghost" type="button" onClick={expandAllSections} disabled={collapsedCount === 0}>Expand All</button>
        <button className="btn btn-sm btn-red" type="button" disabled={!selectedSection} onClick={() => selectedSection && publishOrUpdate(selectedSection)}>{primaryLabel}</button>
        <button className="btn btn-sm btn-ghost" type="button" disabled={!selectedSection} onClick={() => selectedSection && saveAsDraft(selectedSection)}>Save Draft</button>
        <button className="btn btn-sm btn-ghost" type="button" disabled={!selectedSection} onClick={() => selectedSection && editSection(selectedSection)}>Edit</button>
        <button className="btn btn-sm btn-ghost" type="button" disabled={!selectedSection} onClick={() => selectedSection && duplicateSection(selectedSection)}>Duplicate</button>
        <button className="btn btn-sm btn-ghost danger" type="button" disabled={!selectedSection} onClick={() => selectedSection && deleteSection(selectedSection)} aria-label={selectedSection ? `Delete ${selectedSection.title}` : 'Delete selected section'}><span className="trash-icon" aria-hidden="true" /></button>
        <button className="btn btn-sm" type="button" onClick={addSection}>+ Add Section</button>
      </div>
    </div>
  );
}

function RevisionButtons({ undo, redo, canUndo, canRedo, label }: {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  label: string;
}) {
  return (
    <div className="revision-buttons" aria-label={label}>
      <button className="btn btn-sm btn-ghost" type="button" onClick={undo} disabled={!canUndo} title="Undo last change">Undo</button>
      <button className="btn btn-sm btn-ghost" type="button" onClick={redo} disabled={!canRedo} title="Redo last change">Redo</button>
    </div>
  );
}

function ElementsLibraryPanel({ close, beginDrag, endDrag, draggingKind, selectedKind, selectKind }: {
  close: () => void;
  beginDrag: (kind: DocComponentKind, event: ReactDragEvent<HTMLButtonElement>) => void;
  endDrag: () => void;
  draggingKind: DocComponentKind | null;
  selectedKind: DocComponentKind | null;
  selectKind: (kind: DocComponentKind) => void;
}) {
  return (
    <aside className="elements-library-panel" aria-label="Elements library">
      <div className="elements-library-head">
        <div>
          <span>Elements</span>
          <strong>Drag into the section</strong>
        </div>
        <button type="button" onClick={close} aria-label="Close elements library">×</button>
      </div>
      <div className="elements-library-list">
        {DOC_COMPONENT_TYPES.map((type) => (
          <button
            className={`elements-library-item ${draggingKind === type.kind ? 'dragging' : ''} ${selectedKind === type.kind ? 'selected' : ''}`}
            draggable
            key={type.kind}
            type="button"
            aria-pressed={selectedKind === type.kind}
            onClick={() => selectKind(type.kind)}
            onDragEnd={endDrag}
            onDragStart={(event) => beginDrag(type.kind, event)}
          >
            <span>{componentKindIcon(type.kind)}</span>
            <strong>{type.label}</strong>
            <em>{componentInsertDescription(type.kind)}</em>
          </button>
        ))}
      </div>
    </aside>
  );
}

function SectionControllerBar({ section, selected, editing = false, collapsed = false, editSection, moveSection, publishOrUpdate, saveAsDraft, duplicateSection, deleteSection, toggleCollapse, beginPointerDrag }: {
  section: SectionEntry;
  selected: boolean;
  editing?: boolean;
  collapsed?: boolean;
  editSection: () => void;
  moveSection?: (direction: -1 | 1) => void;
  publishOrUpdate: () => void;
  saveAsDraft: () => void;
  duplicateSection: () => void;
  deleteSection: () => void;
  toggleCollapse?: () => void;
  beginPointerDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const primaryLabel = section.status === 'published' ? 'Update' : 'Publish';
  return (
    <div className={`cms-section-actions ${selected ? 'selected' : ''}`} aria-label={`${section.title} section actions`}>
      <button className="cms-drag-handle" type="button" onPointerDown={beginPointerDrag} aria-label={`Drag ${section.title} to reorder`} title="Drag to reorder">⋮⋮</button>
      {toggleCollapse ? <button type="button" onClick={toggleCollapse} aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${section.title}`} title={collapsed ? 'Expand section' : 'Collapse section'}>{collapsed ? '▸' : '▾'}</button> : null}
      {!editing ? <button type="button" onClick={editSection} aria-label={`Edit full ${section.title} section`} title="Edit section">✎</button> : null}
      <button className="primary" type="button" onClick={publishOrUpdate} aria-label={`${primaryLabel} ${section.title}`} title={primaryLabel}>✓</button>
      <button type="button" onClick={saveAsDraft} aria-label={`Save ${section.title} as draft`} title="Save draft">◌</button>
      {moveSection ? (
        <>
          <button type="button" onClick={() => moveSection(-1)} aria-label={`Move ${section.title} up`} title="Move up">↑</button>
          <button type="button" onClick={() => moveSection(1)} aria-label={`Move ${section.title} down`} title="Move down">↓</button>
        </>
      ) : null}
      <button type="button" onClick={duplicateSection} aria-label={`Duplicate ${section.title}`} title="Duplicate">⧉</button>
      <button className="danger" type="button" onClick={deleteSection} aria-label={`Delete ${section.title}`} title="Delete"><span className="trash-icon" aria-hidden="true" /></button>
    </div>
  );
}

function SectionReorderCard({ section, dragging, dropPosition }: {
  section: SectionEntry;
  dragging: boolean;
  dropPosition: DragPosition | null;
}) {
  return (
    <div className={`section-reorder-card ${dragging ? 'dragging' : ''} ${dropPosition ? `drop-${dropPosition}` : ''}`}>
      <span>{section.number}</span>
      <strong>{section.title}</strong>
      <em>{section.status}</em>
      <p>{section.summary}</p>
    </div>
  );
}

function EditableSectionPreview({ section, sectionTargets, save, openModal, editSection, moveSection, publishOrUpdate, saveAsDraft, duplicateSection, deleteSection, selected, dragging, collapsed, reorderMode, dropPosition, selectSection, toggleCollapse, beginPointerDrag, dragOverSection, dropSection, componentInsertMode, selectedComponentKind, mediaAssets, setMediaAssets, mediaUsageRefs, mediaUsageLabel, componentPlaced }: {
  section: SectionEntry;
  sectionTargets: SectionTargetOption[];
  save: (section: SectionEntry, label: string) => void;
  openModal: (modal: ModalState) => void;
  editSection: () => void;
  moveSection: (direction: -1 | 1) => void;
  publishOrUpdate: () => void;
  saveAsDraft: () => void;
  duplicateSection: () => void;
  deleteSection: () => void;
  selected: boolean;
  dragging: boolean;
  collapsed: boolean;
  reorderMode: boolean;
  dropPosition: DragPosition | null;
  selectSection: () => void;
  toggleCollapse: () => void;
  beginPointerDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  dragOverSection: (event: ReactDragEvent<HTMLElement>) => void;
  dropSection: (event: ReactDragEvent<HTMLElement>) => void;
  componentInsertMode: boolean;
  selectedComponentKind: DocComponentKind | null;
  mediaAssets: MediaAsset[];
  setMediaAssets: (items: MediaAsset[]) => void;
  mediaUsageRefs: Record<string, string[]>;
  mediaUsageLabel: string;
  componentPlaced: () => void;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const richEditorRef = useRef<HTMLDivElement | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);
  const screenshotUrlRef = useRef<HTMLInputElement | null>(null);
  const markerPreviewRef = useRef<HTMLDivElement | null>(null);
  // Scroll restoration: the empty-hint → tall-inspector swap on first marker
  // selection makes the browser recompute scroll (because the focused marker
  // is tabIndex={0}) and sometimes pushes the canvas above the fold. We
  // capture scrollTop on every select and restore it in useLayoutEffect.
  const modalScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);
  const markerDragStartSnapshotRef = useRef<ScreenshotDraft | null>(null);
  const markerLiveRafRef = useRef<number | null>(null);
  const markerLivePendingRef = useRef<{ id: string; changes: Partial<MarkerDraft> } | null>(null);
  const [hoveredTarget, setHoveredTarget] = useState<InlineEditableTarget | null>(null);
  const [activeTarget, setActiveTarget] = useState<InlineEditableTarget | null>(null);
  const inlineRevision = useRevisionedState('');
  const [draftValue, setDraftValue] = useState('');
  const [inlineEditorHasText, setInlineEditorHasText] = useState(false);
  const [showInlineTools, setShowInlineTools] = useState(false);
  const [hoveredScreenshot, setHoveredScreenshot] = useState<ScreenshotEditableTarget | null>(null);
  const [activeScreenshot, setActiveScreenshot] = useState<ScreenshotEditableTarget | null>(null);
  const screenshotRevision = useRevisionedState<ScreenshotDraft>({ src: '', alt: '', caption: '', markers: [] });
  const screenshotDraft = screenshotRevision.value;
  const setScreenshotDraft = screenshotRevision.setValue;
  const setScreenshotDraftWithoutRevision = screenshotRevision.setValueWithoutRevision;
  const markerAnimationKey = screenshotDraft.markers.map((marker) => `${marker.id}:${marker.kind}:${marker.animated ? 1 : 0}`).join('|');
  const defaultSectionTarget = sectionTargets[0] ? `#${sectionTargets[0].id}` : MARKER_DEFAULT_POINTER_TARGET;
  const [activeComponent, setActiveComponent] = useState<ComponentEditableTarget | null>(null);
  const componentRevision = useRevisionedState<DocComponentBlock>(newDocComponentBlock('callout'));
  const componentDraft = componentRevision.value;
  const componentDraftIssues = validateDocComponentBlock(componentDraft);
  const [markerDrag, setMarkerDrag] = useState<MarkerDragState | null>(null);
  const markerDragRef = useRef<MarkerDragState | null>(null);
  const [editingMarkerLabelId, setEditingMarkerLabelId] = useState<string | null>(null);
  const [markerKindPicker, setMarkerKindPicker] = useState<MarkerKind | null>(null);
  // Phase 1 of marker UX redesign: persistent tool strip + place-by-click +
  // single selected inspector. `activeMarkerTool` is the kind queued for the
  // next canvas click; null = select/move mode. `selectedMarkerId` gates the
  // inspector to one marker at a time (Phase 2 wires the inspector).
  const [activeMarkerTool, setActiveMarkerTool] = useState<MarkerKind | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [showMarkerOpacityControls, setShowMarkerOpacityControls] = useState(false);
  const [showMarkerAdvancedControls, setShowMarkerAdvancedControls] = useState(false);
  const [storedMarkerColorPresets, setMarkerColorPresets] = useStoredState<MarkerColorPreset[]>('cms_marker_color_presets_v1', MARKER_COLOR_PRESETS_DEFAULT);
  const markerColorPresets = useMemo(() => normalizeMarkerColorPresets(storedMarkerColorPresets), [storedMarkerColorPresets]);
  const editableHtml = useMemo(() => decorateInlineEditableHtml(section.html), [section.html]);
  const outlineTarget = activeTarget ?? activeScreenshot ?? activeComponent ?? hoveredScreenshot;

  useEffect(() => {
    if (!activeTarget) return;
    const editor = richEditorRef.current;
    if (!editor) return;
    editor.innerHTML = activeTarget.value;
    setInlineEditorHasText(Boolean(normalizeInlineEditableValue(editor.textContent ?? '')));
    editor.focus();
    placeCaretAtEnd(editor);
    selectionRangeRef.current = null;
    setShowInlineTools(false);
  }, [activeTarget]);

  useEffect(() => {
    if (!activeScreenshot) return;
    screenshotUrlRef.current?.focus();
  }, [activeScreenshot]);

  // Phase 3: keyboard shortcuts inside the screenshot editor.
  //   Esc          → deselect marker (also clears any armed tool)
  //   Del / Bksp   → delete the selected marker
  //   Arrow keys   → nudge the selected marker by 1% (Shift = 5%)
  // We skip the handler when focus is in an input/textarea/contenteditable so
  // typing labels and descriptions still works normally.
  useEffect(() => {
    if (!activeScreenshot) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable;

      if (event.key === 'Escape') {
        if (selectedMarkerId || activeMarkerTool) {
          event.stopPropagation();
          setSelectedMarkerId(null);
          setActiveMarkerTool(null);
        }
        return;
      }

      if (isTyping) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedMarkerId) {
          event.preventDefault();
          deleteMarker(selectedMarkerId);
        }
        return;
      }

      if (event.key.startsWith('Arrow') && selectedMarkerId) {
        const marker = screenshotDraft.markers.find((m) => m.id === selectedMarkerId);
        if (!marker) return;
        event.preventDefault();
        const step = event.shiftKey ? 5 : 1;
        if (event.key === 'ArrowUp') nudgeMarker(marker, 0, -step);
        else if (event.key === 'ArrowDown') nudgeMarker(marker, 0, step);
        else if (event.key === 'ArrowLeft') nudgeMarker(marker, -step, 0);
        else if (event.key === 'ArrowRight') nudgeMarker(marker, step, 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeScreenshot, selectedMarkerId, activeMarkerTool, screenshotDraft.markers]);

  useEffect(() => {
    const normalized = normalizeMarkerColorPresets(storedMarkerColorPresets);
    if (markerColorPresetListEqual(storedMarkerColorPresets, normalized)) return;
    setMarkerColorPresets(normalized);
  }, [setMarkerColorPresets, storedMarkerColorPresets]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const detachHotspots = attachMarkerHotspotInteractions(root);
    const detachCarousels = attachDocCarouselInteractions(root);
    const detachTabs = attachDocTabInteractions(root);
    return () => {
      detachHotspots();
      detachCarousels();
      detachTabs();
    };
  }, [editableHtml, activeScreenshot, activeComponent, activeTarget, markerAnimationKey]);

  useEffect(() => () => {
    if (markerLiveRafRef.current !== null) {
      window.cancelAnimationFrame(markerLiveRafRef.current);
      markerLiveRafRef.current = null;
    }
    markerLivePendingRef.current = null;
    markerDragStartSnapshotRef.current = null;
  }, []);

  const handleEditableHover = (event: ReactPointerEvent<HTMLElement> | MouseEvent<HTMLElement>) => {
    if (activeTarget || activeScreenshot || activeComponent || componentInsertMode || !(event.target instanceof HTMLElement)) return;
    const root = rootRef.current;
    const element = event.target.closest<HTMLElement>('[data-cms-editable-index]');
    if (!element || !root?.contains(element)) return;
    const target = readInlineEditableTarget(element, root);
    if (!target) return;
    setHoveredScreenshot(null);
    setHoveredTarget((previous) => previous?.index === target.index && previous.top === target.top ? previous : target);
  };

  const handleScreenshotPointerOver = (element: HTMLElement) => {
    if (activeTarget || activeScreenshot || activeComponent || componentInsertMode) return;
    const root = rootRef.current;
    if (!root?.contains(element)) return;
    const target = readScreenshotEditableTarget(element, root);
    if (!target) return;
    setHoveredTarget(null);
    setHoveredScreenshot((previous) => previous?.index === target.index && previous.top === target.top ? previous : target);
  };

  const openInlineTarget = (target: InlineEditableTarget) => {
    setHoveredScreenshot(null);
    setActiveScreenshot(null);
    setActiveComponent(null);
    setHoveredTarget(target);
    setActiveTarget(target);
    inlineRevision.reset(target.value);
    setDraftValue(target.value);
  };

  const handleInlineClick = (event: MouseEvent<HTMLElement>) => {
    if (!(event.target instanceof HTMLElement)) return;
    const root = rootRef.current;
    const insertSlot = event.target.closest<HTMLElement>('[data-cms-insert-index]');
    if (insertSlot && selectedComponentKind && root?.contains(insertSlot)) {
      event.preventDefault();
      event.stopPropagation();
      const target = readComponentInsertTarget(insertSlot, root);
      if (!target) return;
      closeElementEditor();
      closeScreenshotEditor();
      closeComponentEditor();
      setHoveredTarget(null);
      setHoveredScreenshot(null);
      dropComponentAtTarget(selectedComponentKind, target);
      componentPlaced();
      return;
    }
    const componentButton = event.target.closest<HTMLButtonElement>('[data-cms-component-action]');
    const componentElement = componentButton?.closest<HTMLElement>('[data-cms-component-index]');
    if (componentButton && componentElement && root?.contains(componentElement)) {
      event.preventDefault();
      event.stopPropagation();
      handleComponentAction(componentButton.dataset.cmsComponentAction ?? '', componentElement);
      return;
    }

    const screenshotDeleteButton = event.target.closest<HTMLButtonElement>('.cms-screenshot-delete-button');
    const screenshotDeleteElement = screenshotDeleteButton?.closest<HTMLElement>('[data-cms-screenshot-index]');
    if (screenshotDeleteButton && screenshotDeleteElement && root?.contains(screenshotDeleteElement)) {
      event.preventDefault();
      event.stopPropagation();
      const target = readScreenshotEditableTarget(screenshotDeleteElement, root);
      if (!target) return;
      openModal({
        title: 'Delete screenshot',
        content: <WarningConfirm
          eyebrow="Screenshot warning"
          title={`Delete ${target.label}?`}
          message="This will remove the screenshot and every marker attached to it."
          detail="You can still undo this action from section revision history."
          confirmLabel="Delete screenshot"
          close={() => openModal(null)}
          confirm={() => {
            closeElementEditor();
            closeScreenshotEditor();
            closeComponentEditor();
            setHoveredTarget(null);
            setHoveredScreenshot(null);
            const html = deleteScreenshotEditableHtml(section.html, target.index);
            save({ ...section, summary: getSectionSummary(html, 0), updatedAt: today(), html }, `Delete ${target.label}`);
            openModal(null);
          }}
        />,
      });
      return;
    }

    const screenshotButton = event.target.closest<HTMLButtonElement>('.cms-screenshot-edit-button');
    const screenshotElement = screenshotButton?.closest<HTMLElement>('[data-cms-screenshot-index]');
    if (screenshotButton && screenshotElement && root?.contains(screenshotElement)) {
      event.preventDefault();
      event.stopPropagation();
      const target = readScreenshotEditableTarget(screenshotElement, root);
      if (!target) return;
      setHoveredTarget(null);
      setHoveredScreenshot(target);
      setActiveTarget(null);
      setActiveComponent(null);
      setActiveScreenshot(target);
      screenshotRevision.reset({ src: target.src, alt: target.alt, caption: target.caption, markers: target.markers });
      return;
    }

    const deleteButton = event.target.closest<HTMLButtonElement>('.cms-inline-delete-button');
    const deleteElement = deleteButton?.closest<HTMLElement>('[data-cms-editable-index]');
    if (deleteButton && deleteElement && root?.contains(deleteElement)) {
      event.preventDefault();
      event.stopPropagation();
      const target = readInlineEditableTarget(deleteElement, root);
      if (!target) return;
      closeElementEditor();
      closeScreenshotEditor();
      closeComponentEditor();
      setHoveredTarget(null);
      setHoveredScreenshot(null);
      const html = deleteInlineEditableHtml(section.html, target.index);
      save({ ...section, summary: getSectionSummary(html, 0), updatedAt: today(), html }, `Delete ${target.label}`);
      return;
    }

    // Open the inline editor from the hover ✎ button OR a direct click on the
    // editable element itself — text that looks editable must actually edit,
    // otherwise keystrokes silently land on <body> and vanish.
    if (componentInsertMode) return;
    const editButton = event.target.closest<HTMLButtonElement>('.cms-inline-edit-button');
    const element = (editButton ?? event.target).closest<HTMLElement>('[data-cms-editable-index]');
    if (!element || !root?.contains(element)) return;
    event.preventDefault();
    event.stopPropagation();
    const target = readInlineEditableTarget(element, root);
    if (!target) return;
    openInlineTarget(target);
  };

  const closeElementEditor = () => {
    setActiveTarget(null);
    setDraftValue('');
    inlineRevision.reset('');
    setInlineEditorHasText(false);
    setShowInlineTools(false);
    selectionRangeRef.current = null;
  };

  const closeComponentEditor = () => {
    setActiveComponent(null);
    componentRevision.reset(newDocComponentBlock('callout'));
  };
  const addMediaAsset = (asset: MediaAsset) => {
    setMediaAssets([asset, ...mediaAssets.filter((item) => item.id !== asset.id)]);
  };
  const applyMediaAssetToScreenshot = (asset: MediaAsset) => {
    setScreenshotDraft({
      ...screenshotDraft,
      src: asset.src,
      alt: asset.alt || screenshotDraft.alt,
      caption: screenshotDraft.caption || asset.alt,
    });
    setMediaAssets(upsertMediaAssetUsage(mediaAssets, asset.id, mediaUsageLabel));
  };

  const dropComponentAtTarget = (kind: DocComponentKind, target: ComponentInsertTarget) => {
    const block = newDocComponentBlock(kind, parseDocComponentBlocks(section.html));
    const html = insertDocComponentAtSlot(section.html, block, target.index);
    const componentIndex = parseDocComponentBlocks(html).findIndex((item) => item.id === block.id);
    componentRevision.reset(block);
    setActiveComponent({
      index: componentIndex >= 0 ? componentIndex : 0,
      label: componentKindLabel(kind),
      block,
      top: target.top,
      left: target.left,
      width: target.width,
      height: Math.max(target.height, 64),
      rootWidth: target.rootWidth,
    });
    save({
      ...section,
      summary: getSectionSummary(html, 0),
      updatedAt: today(),
      html,
    }, `Add ${componentKindLabel(kind)}`);
  };

  const handleComponentDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!componentInsertMode || !(event.target instanceof HTMLElement)) return false;
    const slot = event.target.closest<HTMLElement>('[data-cms-insert-index]');
    if (!slot || !rootRef.current?.contains(slot) || !hasDocComponentDragType(event.dataTransfer)) return false;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    return true;
  };

  const handleComponentDrop = (event: ReactDragEvent<HTMLElement>) => {
    if (!(event.target instanceof HTMLElement)) return false;
    const slot = event.target.closest<HTMLElement>('[data-cms-insert-index]');
    const root = rootRef.current;
    const kind = readDocComponentDragKind(event.dataTransfer);
    if (!slot || !root?.contains(slot) || !kind) return false;
    event.preventDefault();
    event.stopPropagation();
    const target = readComponentInsertTarget(slot, root);
    if (!target) return true;
    closeElementEditor();
    closeScreenshotEditor();
    closeComponentEditor();
    setHoveredTarget(null);
    setHoveredScreenshot(null);
    dropComponentAtTarget(kind, target);
    componentPlaced();
    return true;
  };

  const updateComponentDraft = (id: string, updater: (block: DocComponentBlock) => DocComponentBlock) => {
    componentRevision.setValue((current) => current.id === id ? updater(current) : current);
  };

  const handleComponentAction = (action: string, element: HTMLElement) => {
    const target = readComponentEditableTarget(element, rootRef.current);
    if (!target) return;
    setHoveredTarget(null);
    setHoveredScreenshot(null);
    setActiveTarget(null);
    setActiveScreenshot(null);
    if (action === 'edit') {
      componentRevision.reset(target.block);
      setActiveComponent(target);
      return;
    }
    if (action === 'delete') {
      closeComponentEditor();
      const html = deleteDocComponentAtIndex(section.html, target.index);
      save({ ...section, summary: getSectionSummary(html, 0), updatedAt: today(), html }, `Delete ${target.label}`);
      return;
    }
    if (action === 'duplicate') {
      const html = duplicateDocComponentAtIndex(section.html, target.index);
      save({ ...section, summary: getSectionSummary(html, 0), updatedAt: today(), html }, `Duplicate ${target.label}`);
      return;
    }
    if (action === 'up' || action === 'down') {
      const html = moveDocComponentAtIndex(section.html, target.index, action === 'up' ? -1 : 1);
      save({ ...section, summary: getSectionSummary(html, 0), updatedAt: today(), html }, `Move ${target.label}`);
    }
  };

  const saveComponentEdit = () => {
    if (!activeComponent) return;
    if (componentDraftIssues.some((issue) => issue.kind === 'error')) return;
    const html = updateDocComponentAtIndex(section.html, activeComponent.index, componentDraft);
    closeComponentEditor();
    save({
      ...section,
      summary: getSectionSummary(html, 0),
      updatedAt: today(),
      html,
    }, `Edit ${componentKindLabel(componentDraft.kind)}`);
  };

  const deleteActiveComponent = () => {
    if (!activeComponent) return;
    const html = deleteDocComponentAtIndex(section.html, activeComponent.index);
    const label = activeComponent.label;
    closeComponentEditor();
    save({
      ...section,
      summary: getSectionSummary(html, 0),
      updatedAt: today(),
      html,
    }, `Delete ${label}`);
  };

  const applyInlineHighlight = (preset: HighlightPreset) => {
    if (!restoreInlineSelection()) return;
    wrapCurrentSelection('span', { class: `ui ${preset.id}` });
    recordInlineEditorSnapshot();
    updateInlineSelectionState();
  };
  const recordInlineEditorSnapshot = () => {
    const editor = richEditorRef.current;
    if (!editor) return;
    const editorHtml = sanitizeInlineEditorHtml(editor.innerHTML);
    inlineRevision.setValue(editorHtml);
    setDraftValue(editorHtml);
    setInlineEditorHasText(Boolean(normalizeInlineEditableValue(editor.textContent ?? '')));
  };
  const applyInlineRevisionSnapshot = (snapshot: string | null) => {
    const editor = richEditorRef.current;
    if (!editor || snapshot === null) return;
    editor.innerHTML = snapshot;
    setDraftValue(snapshot);
    setInlineEditorHasText(Boolean(normalizeInlineEditableValue(editor.textContent ?? '')));
    selectionRangeRef.current = null;
    setShowInlineTools(false);
    editor.focus();
    placeCaretAtEnd(editor);
  };
  const updateInlineSelectionState = () => {
    const editor = richEditorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !selection.rangeCount || selection.isCollapsed || !selectionBelongsTo(selection, editor) || !selection.toString().trim()) {
      selectionRangeRef.current = null;
      setShowInlineTools(false);
      return;
    }
    selectionRangeRef.current = selection.getRangeAt(0).cloneRange();
    setShowInlineTools(true);
  };
  const restoreInlineSelection = () => {
    const editor = richEditorRef.current;
    const range = selectionRangeRef.current;
    if (!editor || !range) return false;
    editor.focus();
    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  };
  const applyInlineRichTool = (tool: InlineRichTool) => {
    if (!restoreInlineSelection()) return;
    if (tool.id === 'bold') document.execCommand('bold');
    if (tool.id === 'italic') document.execCommand('italic');
    if (tool.id === 'code') toggleCurrentSelectionCode(richEditorRef.current);
    if (tool.id === 'clear') document.execCommand('removeFormat');
    if (tool.id === 'link') {
      const url = window.prompt('Link URL', 'https://');
      if (url) document.execCommand('createLink', false, url);
    }
    recordInlineEditorSnapshot();
    updateInlineSelectionState();
  };

  const closeScreenshotEditor = () => {
    flushLiveMarkerUpdate();
    markerDragStartSnapshotRef.current = null;
    setActiveScreenshot(null);
    screenshotRevision.reset({ src: '', alt: '', caption: '', markers: [] });
    setActiveMarkerDrag(null);
    setEditingMarkerLabelId(null);
    setMarkerKindPicker(null);
  };

  const setActiveMarkerDrag = (next: MarkerDragState | null) => {
    markerDragRef.current = next;
    setMarkerDrag(next);
  };

  const buildUpdatedScreenshotDraft = (draft: ScreenshotDraft, id: string, changes: Partial<MarkerDraft>) => ({
    ...draft,
    markers: draft.markers.map((marker) => {
      if (marker.id !== id) return marker;
      const next = { ...marker, ...changes };
      const w = clampBetween(next.w, MIN_MARKER_SIZE, 100);
      const h = clampBetween(next.h, MIN_MARKER_SIZE, 100);
      const x = clampBetween(next.x, 0, 100 - w);
      const y = clampBetween(next.y, 0, 100 - h);
      return {
        ...next,
        x,
        y,
        w,
        h,
        align: next.kind === 'shape' ? markerTextAlign(next.align) : 'center',
        borderOpacity: normalizeMarkerOpacity(next.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY),
        backgroundOpacity: normalizeMarkerOpacity(next.backgroundOpacity, defaultBgOpacityFor(next.kind)),
        textOpacity: normalizeMarkerOpacity(next.textOpacity, MARKER_DEFAULT_TEXT_OPACITY),
        dialogBackgroundOpacity: normalizeMarkerOpacity(next.dialogBackgroundOpacity, MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY),
        dialogBorderOpacity: normalizeMarkerOpacity(next.dialogBorderOpacity, MARKER_DEFAULT_DIALOG_BORDER_OPACITY),
        dialogTextOpacity: normalizeMarkerOpacity(next.dialogTextOpacity, MARKER_DEFAULT_DIALOG_TEXT_OPACITY),
        ctaBackgroundOpacity: normalizeMarkerOpacity(next.ctaBackgroundOpacity, MARKER_DEFAULT_CTA_BACKGROUND_OPACITY),
        ctaTextOpacity: normalizeMarkerOpacity(next.ctaTextOpacity, MARKER_DEFAULT_CTA_TEXT_OPACITY),
        pointerRotation: normalizePointerRotation(next.pointerRotation),
        pointerThickness: normalizePointerThickness(next.pointerThickness),
      };
    }),
  });

  const flushLiveMarkerUpdate = () => {
    if (markerLiveRafRef.current !== null) {
      window.cancelAnimationFrame(markerLiveRafRef.current);
      markerLiveRafRef.current = null;
    }
    const pending = markerLivePendingRef.current;
    markerLivePendingRef.current = null;
    if (!pending) return;
    setScreenshotDraftWithoutRevision((draft) => buildUpdatedScreenshotDraft(draft, pending.id, pending.changes));
  };

  const updateMarker = (id: string, changes: Partial<MarkerDraft>, options?: { live?: boolean }) => {
    if (options?.live) {
      markerLivePendingRef.current = { id, changes };
      if (markerLiveRafRef.current !== null) return;
      markerLiveRafRef.current = window.requestAnimationFrame(() => {
        markerLiveRafRef.current = null;
        const pending = markerLivePendingRef.current;
        markerLivePendingRef.current = null;
        if (!pending) return;
        setScreenshotDraftWithoutRevision((draft) => buildUpdatedScreenshotDraft(draft, pending.id, pending.changes));
      });
      return;
    }
    flushLiveMarkerUpdate();
    setScreenshotDraft((draft) => buildUpdatedScreenshotDraft(draft, id, changes));
  };

  const nudgeMarker = (marker: MarkerDraft, dx: number, dy: number) => {
    updateMarker(marker.id, {
      x: clampBetween(marker.x + dx, 0, 100 - marker.w),
      y: clampBetween(marker.y + dy, 0, 100 - marker.h),
    });
  };

  const saveMarkerColorPreset = (marker: MarkerDraft) => {
    const preset = markerColorPresetFromMarker(marker);
    if (markerColorPresets.some((item) => markerColorPresetKey(item) === markerColorPresetKey(preset))) return;
    const customIndex = markerColorPresets.filter((item) => !item.locked).length + 1;
    const nextPreset: MarkerColorPreset = {
      ...preset,
      id: `custom-${Date.now()}`,
      name: `Preset ${customIndex}`,
    };
    const locked = markerColorPresets.filter((item) => item.locked);
    const custom = [...markerColorPresets.filter((item) => !item.locked), nextPreset].slice(-(MARKER_COLOR_PRESET_LIMIT - locked.length));
    setMarkerColorPresets([...locked, ...custom]);
  };

  const applyMarkerColorPreset = (marker: MarkerDraft, preset: MarkerColorPreset) => {
    updateMarker(marker.id, {
      borderColor: preset.borderColor,
      borderOpacity: normalizeMarkerOpacity(preset.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY),
      backgroundColor: preset.backgroundColor,
      backgroundOpacity: normalizeMarkerOpacity(
        preset.backgroundOpacity,
        defaultBgOpacityFor(marker.kind),
      ),
      textColor: preset.textColor,
      textOpacity: normalizeMarkerOpacity(preset.textOpacity, MARKER_DEFAULT_TEXT_OPACITY),
    });
  };

  const removeMarkerColorPreset = (id: string) => {
    const preset = markerColorPresets.find((item) => item.id === id);
    if (!preset || preset.locked) return;
    setMarkerColorPresets(markerColorPresets.filter((item) => item.id !== id));
  };

  const openMarkerKindPicker = () => {
    setMarkerKindPicker('shape');
  };

  const addMarker = (kind: MarkerKind = 'shape') => {
    const created = { id: '' as string };
    setScreenshotDraft((draft) => {
      const base = nextMarkerDraft(draft.markers, kind);
      const withTarget = {
        ...base,
        targetSectionId: kind === 'shape' ? MARKER_DEFAULT_POINTER_TARGET : (defaultSectionTarget || MARKER_DEFAULT_POINTER_TARGET),
      };
      created.id = withTarget.id;
      return { ...draft, markers: [...draft.markers, withTarget] };
    });
    setMarkerKindPicker(null);
    if (created.id) setSelectedMarkerId(created.id);
  };
  // Kept for the marker-add flow that the kind-picker modal used to drive.
  // The modal was removed; these stay wired for the planned re-introduction.
  void markerKindPicker; void openMarkerKindPicker; void addMarker;

  // Place a marker at given image-relative percent coordinates. Used by the
  // tool strip's click-to-place flow. Centers the default-sized marker on the
  // click point and clamps so it stays inside the canvas.
  const addMarkerAt = (kind: MarkerKind, xPct: number, yPct: number) => {
    setScreenshotDraft((draft) => {
      const base = nextMarkerDraft(draft.markers, kind);
      const x = clampBetween(xPct - base.w / 2, 0, 100 - base.w);
      const y = clampBetween(yPct - base.h / 2, 0, 100 - base.h);
      const placed = {
        ...base,
        x,
        y,
        targetSectionId: kind === 'shape' ? MARKER_DEFAULT_POINTER_TARGET : (defaultSectionTarget || MARKER_DEFAULT_POINTER_TARGET),
      };
      setSelectedMarkerId(placed.id);
      return { ...draft, markers: [...draft.markers, placed] };
    });
    setActiveMarkerTool(null);
  };

  // Selecting a marker can grow/shrink the inspector area below the canvas,
  // and clicking the marker (tabIndex={0}) makes the browser refocus, which
  // sometimes triggers a scroll inside .cms-screenshot-modal-scroll. We pin
  // scrollTop ourselves and let useLayoutEffect restore it after the swap.
  const selectMarker = (id: string | null) => {
    if (modalScrollRef.current) {
      pendingScrollTopRef.current = modalScrollRef.current.scrollTop;
    }
    setSelectedMarkerId(id);
  };

  useLayoutEffect(() => {
    const top = pendingScrollTopRef.current;
    if (top === null) return;
    pendingScrollTopRef.current = null;
    const el = modalScrollRef.current;
    if (!el) return;
    // Two passes: immediate (handles the synchronous DOM update) and one
    // animation frame later (handles late layout from images/fonts).
    if (Math.abs(el.scrollTop - top) > 1) el.scrollTop = top;
    requestAnimationFrame(() => {
      if (modalScrollRef.current && Math.abs(modalScrollRef.current.scrollTop - top) > 1) {
        modalScrollRef.current.scrollTop = top;
      }
    });
  }, [selectedMarkerId]);

  const deleteMarker = (id: string) => {
    setScreenshotDraft((draft) => ({
      ...draft,
      markers: draft.markers.filter((marker) => marker.id !== id),
    }));
    if (markerDragRef.current?.id === id || markerDrag?.id === id) setActiveMarkerDrag(null);
    if (editingMarkerLabelId === id) setEditingMarkerLabelId(null);
    if (selectedMarkerId === id) setSelectedMarkerId(null);
  };

  const beginMarkerLabelEdit = (id: string, event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveMarkerDrag(null);
    setEditingMarkerLabelId(id);
  };

  const startMarkerRotate = (
    marker: MarkerDraft,
    event: ReactPointerEvent<HTMLElement>,
    dragSurface: MarkerDragSurface,
  ) => {
    const pointerX = clampPct(((event.clientX - dragSurface.previewLeft) / dragSurface.previewWidth) * 100);
    const pointerY = clampPct(((event.clientY - dragSurface.previewTop) / dragSurface.previewHeight) * 100);
    const centerX = marker.x + marker.w / 2;
    const centerY = marker.y + marker.h / 2;
    const pointerAngle = markerAngleFromCenter(pointerX, pointerY, centerX, centerY);
    setActiveMarkerDrag({
      id: marker.id,
      mode: 'rotate',
      centerX,
      centerY,
      rotationOffset: normalizePointerRotation(marker.pointerRotation - pointerAngle),
      ...dragSurface,
    });
  };

  const startMarkerDrag = (marker: MarkerDraft, event: ReactPointerEvent<HTMLDivElement>) => {
    const preview = markerPreviewRef.current;
    if (!preview) return;
    event.preventDefault();
    event.stopPropagation();
    if (!markerDragStartSnapshotRef.current) {
      markerDragStartSnapshotRef.current = cloneRevisionValue(screenshotDraft);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const previewRect = preview.getBoundingClientRect();
    const dragSurface: MarkerDragSurface = {
      previewLeft: previewRect.left,
      previewTop: previewRect.top,
      previewWidth: previewRect.width,
      previewHeight: previewRect.height,
    };
    const markerRect = event.currentTarget.getBoundingClientRect();
    const resizeEdge = getMarkerResizeEdge(event, markerRect);
    if (resizeEdge) {
      if (marker.kind === 'pointer' && markerEdgeCanRotate(resizeEdge)) {
        startMarkerRotate(marker, event, dragSurface);
        return;
      }
      setActiveMarkerDrag({
        id: marker.id,
        mode: 'resize',
        edge: resizeEdge,
        originX: marker.x,
        originY: marker.y,
        originW: marker.w,
        originH: marker.h,
        ...dragSurface,
      });
      return;
    }
    setActiveMarkerDrag({
      id: marker.id,
      mode: 'move',
      offsetX: ((event.clientX - markerRect.left) / dragSurface.previewWidth) * 100,
      offsetY: ((event.clientY - markerRect.top) / dragSurface.previewHeight) * 100,
      markerWidth: marker.w,
      markerHeight: marker.h,
      ...dragSurface,
    });
  };

  const startMarkerResize = (marker: MarkerDraft, edge: MarkerResizeEdge, event: ReactPointerEvent<HTMLSpanElement>) => {
    const preview = markerPreviewRef.current;
    if (!preview) return;
    event.preventDefault();
    event.stopPropagation();
    if (!markerDragStartSnapshotRef.current) {
      markerDragStartSnapshotRef.current = cloneRevisionValue(screenshotDraft);
    }
    const previewRect = preview.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    const dragSurface: MarkerDragSurface = {
      previewLeft: previewRect.left,
      previewTop: previewRect.top,
      previewWidth: previewRect.width,
      previewHeight: previewRect.height,
    };
    if (marker.kind === 'pointer' && markerEdgeCanRotate(edge)) {
      startMarkerRotate(marker, event, dragSurface);
      return;
    }
    setActiveMarkerDrag({
      id: marker.id,
      mode: 'resize',
      edge,
      originX: marker.x,
      originY: marker.y,
      originW: marker.w,
      originH: marker.h,
      ...dragSurface,
    });
  };

  const startMarkerPopoverDrag = (marker: MarkerDraft, event: ReactPointerEvent<HTMLDivElement>) => {
    const preview = markerPreviewRef.current;
    if (!preview) return;
    event.preventDefault();
    event.stopPropagation();
    if (!markerDragStartSnapshotRef.current) {
      markerDragStartSnapshotRef.current = cloneRevisionValue(screenshotDraft);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const previewRect = preview.getBoundingClientRect();
    const popoverRect = event.currentTarget.getBoundingClientRect();
    setActiveMarkerDrag({
      id: marker.id,
      mode: 'popover',
      offsetX: ((event.clientX - popoverRect.left) / previewRect.width) * 100,
      offsetY: ((event.clientY - popoverRect.top) / previewRect.height) * 100,
      popoverWidth: (popoverRect.width / previewRect.width) * 100,
      popoverHeight: (popoverRect.height / previewRect.height) * 100,
      previewLeft: previewRect.left,
      previewTop: previewRect.top,
      previewWidth: previewRect.width,
      previewHeight: previewRect.height,
    });
  };

  const dragMarker = (event: ReactPointerEvent<HTMLElement>) => {
    const activeMarkerDrag = markerDragRef.current ?? markerDrag;
    if (!activeMarkerDrag) return;
    event.preventDefault();
    const pointerX = clampPct(((event.clientX - activeMarkerDrag.previewLeft) / activeMarkerDrag.previewWidth) * 100);
    const pointerY = clampPct(((event.clientY - activeMarkerDrag.previewTop) / activeMarkerDrag.previewHeight) * 100);

    if (activeMarkerDrag.mode === 'popover') {
      updateMarker(activeMarkerDrag.id, {
        popoverX: clampBetween(pointerX - activeMarkerDrag.offsetX, 0, Math.max(0, 100 - activeMarkerDrag.popoverWidth)),
        popoverY: clampBetween(pointerY - activeMarkerDrag.offsetY, 0, Math.max(0, 100 - activeMarkerDrag.popoverHeight)),
      }, { live: true });
      return;
    }

    if (activeMarkerDrag.mode === 'move') {
      const nextX = pointerX - activeMarkerDrag.offsetX;
      const nextY = pointerY - activeMarkerDrag.offsetY;
      updateMarker(activeMarkerDrag.id, {
        x: clampBetween(nextX, 0, 100 - activeMarkerDrag.markerWidth),
        y: clampBetween(nextY, 0, 100 - activeMarkerDrag.markerHeight),
      }, { live: true });
      return;
    }

    if (activeMarkerDrag.mode === 'rotate') {
      const pointerAngle = markerAngleFromCenter(pointerX, pointerY, activeMarkerDrag.centerX, activeMarkerDrag.centerY);
      updateMarker(activeMarkerDrag.id, {
        pointerRotation: normalizePointerRotation(pointerAngle + activeMarkerDrag.rotationOffset),
      }, { live: true });
      return;
    }

    updateMarker(activeMarkerDrag.id, resizeMarker({
      x: activeMarkerDrag.originX,
      y: activeMarkerDrag.originY,
      w: activeMarkerDrag.originW,
      h: activeMarkerDrag.originH,
    }, activeMarkerDrag.edge, pointerX, pointerY), { live: true });
  };

  const stopMarkerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    flushLiveMarkerUpdate();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const startSnapshot = markerDragStartSnapshotRef.current;
    if (startSnapshot) {
      const currentSnapshot = screenshotRevision.getCurrentValue();
      if (!revisionEqual(startSnapshot, currentSnapshot)) {
        screenshotRevision.pushRevisionSnapshot(startSnapshot);
      }
      markerDragStartSnapshotRef.current = null;
    }
    setActiveMarkerDrag(null);
  };

  const saveElementEdit = () => {
    const editorHtml = sanitizeInlineEditorHtml(richEditorRef.current?.innerHTML ?? draftValue);
    if (!activeTarget || !normalizeInlineEditableValue(stripHtml(editorHtml))) return;
    const html = updateInlineEditableHtml(section.html, activeTarget.index, editorHtml);
    const title = activeTarget.kind === 'section-title' ? plainInlineValue(editorHtml) : section.title;
    closeElementEditor();
    setHoveredTarget(null);
    save({
      ...section,
      title,
      summary: getSectionSummary(html, 0),
      updatedAt: today(),
      html,
    }, activeTarget.label);
  };

  const deleteActiveInlineElement = () => {
    if (!activeTarget || activeTarget.kind === 'section-title' || activeTarget.kind === 'heading') return;
    const html = deleteInlineEditableHtml(section.html, activeTarget.index);
    const label = activeTarget.label;
    closeElementEditor();
    setHoveredTarget(null);
    save({ ...section, summary: getSectionSummary(html, 0), updatedAt: today(), html }, `Delete ${label}`);
  };

  const saveScreenshotEdit = () => {
    if (!activeScreenshot || !screenshotDraft.src.trim()) return;
    const normalizedMarkers = screenshotDraft.markers.map((marker) => {
      const popover = markerPopoverPosition(marker);
      return {
        ...marker,
        label: marker.kind === 'shape' ? normalizeInlineEditableValue(marker.label) : normalizeMarkerWords(marker.label, 3),
        popoverX: popover.x,
        popoverY: popover.y,
        align: marker.kind === 'shape' ? markerTextAlign(marker.align) : 'center',
        dialogBackgroundColor: normalizeMarkerColor(marker.dialogBackgroundColor, MARKER_DEFAULT_DIALOG_BACKGROUND_COLOR),
        dialogBackgroundOpacity: normalizeMarkerOpacity(marker.dialogBackgroundOpacity, MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY),
        dialogBorderColor: normalizeMarkerColor(marker.dialogBorderColor, MARKER_DEFAULT_DIALOG_BORDER_COLOR),
        dialogBorderOpacity: normalizeMarkerOpacity(marker.dialogBorderOpacity, MARKER_DEFAULT_DIALOG_BORDER_OPACITY),
        dialogTextColor: normalizeMarkerColor(marker.dialogTextColor, MARKER_DEFAULT_DIALOG_TEXT_COLOR),
        dialogTextOpacity: normalizeMarkerOpacity(marker.dialogTextOpacity, MARKER_DEFAULT_DIALOG_TEXT_OPACITY),
        ctaBackgroundColor: normalizeMarkerColor(marker.ctaBackgroundColor, MARKER_DEFAULT_CTA_BACKGROUND_COLOR),
        ctaBackgroundOpacity: normalizeMarkerOpacity(marker.ctaBackgroundOpacity, MARKER_DEFAULT_CTA_BACKGROUND_OPACITY),
        ctaTextColor: normalizeMarkerColor(marker.ctaTextColor, MARKER_DEFAULT_CTA_TEXT_COLOR),
        ctaTextOpacity: normalizeMarkerOpacity(marker.ctaTextOpacity, MARKER_DEFAULT_CTA_TEXT_OPACITY),
        borderOpacity: normalizeMarkerOpacity(marker.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY),
        backgroundOpacity: normalizeMarkerOpacity(marker.backgroundOpacity, defaultBgOpacityFor(marker.kind)),
        textOpacity: normalizeMarkerOpacity(marker.textOpacity, MARKER_DEFAULT_TEXT_OPACITY),
        pointerRotation: normalizePointerRotation(marker.pointerRotation),
        pointerThickness: normalizePointerThickness(marker.pointerThickness),
      };
    });
    const html = updateScreenshotEditableHtml(section.html, activeScreenshot.index, { ...screenshotDraft, markers: normalizedMarkers });
    closeScreenshotEditor();
    setHoveredScreenshot(null);
    save({
      ...section,
      summary: getSectionSummary(html, 0),
      updatedAt: today(),
      html,
    }, activeScreenshot.label);
  };

  const screenshotInitialDraft = activeScreenshot ? {
    src: activeScreenshot.src,
    alt: activeScreenshot.alt,
    caption: activeScreenshot.caption,
    markers: activeScreenshot.markers,
  } : null;
  const screenshotHasChanges = Boolean(screenshotInitialDraft && !revisionEqual(screenshotDraft, screenshotInitialDraft));
  const closeScreenshotEditorWithoutSave = () => {
    closeScreenshotEditor();
    setHoveredScreenshot(null);
  };
  const requestCloseScreenshotEditor = () => {
    if (!activeScreenshot) return;
    if (!screenshotHasChanges) {
      closeScreenshotEditorWithoutSave();
      return;
    }
    openModal({
      title: 'Unsaved screenshot changes',
      content: (
        <div className="warning-confirm screenshot-close-warning">
          <div className="warning-confirm-icon" aria-hidden="true">!</div>
          <div className="warning-confirm-copy">
            <span>Unsaved changes</span>
            <h3>Save screenshot edits before closing?</h3>
            <p>Your marker placement and content updates are not saved yet.</p>
            <small>Choose save to keep edits, or discard to close without saving.</small>
          </div>
          <div className="form-actions screenshot-close-actions">
            <button className="btn" type="button" onClick={() => openModal(null)}>Keep editing</button>
            <button className="btn btn-ghost danger" type="button" onClick={() => {
              openModal(null);
              closeScreenshotEditorWithoutSave();
            }}>
              Discard
            </button>
            <button className="btn btn-red" type="button" onClick={() => {
              openModal(null);
              saveScreenshotEdit();
            }}>
              Save
            </button>
          </div>
        </div>
      ),
    });
  };

  const outlineStyle = outlineTarget ? targetBoxStyle(outlineTarget) : undefined;
  const hoverEditStyle = hoveredTarget ? floatingEditButtonStyle(hoveredTarget) : undefined;
  const editorStyle = activeTarget ? targetEditorStyle(activeTarget) : undefined;
  const inlineEditMode = Boolean(activeTarget || activeScreenshot || activeComponent);

  return (
    <article
      ref={rootRef}
      data-cms-section-id={section.id}
      className={`cms-section-block cms-real-section ${selected ? 'selected' : ''} ${dragging ? 'dragging' : ''} ${collapsed ? 'collapsed' : ''} ${inlineEditMode ? 'inline-editing' : ''}`}
      onPointerOver={handleEditableHover}
      onMouseMove={handleEditableHover}
      onFocus={selectSection}
      onClick={handleInlineClick}
      onMouseDown={selectSection}
      onDragOver={(event) => {
        if (!handleComponentDragOver(event)) dragOverSection(event);
      }}
      onDrop={(event) => {
        if (!handleComponentDrop(event)) dropSection(event);
      }}
      onPointerLeave={() => {
        if (!activeTarget && !activeScreenshot) {
          setHoveredTarget(null);
          setHoveredScreenshot(null);
        }
      }}
    >
      {reorderMode || collapsed ? <SectionReorderCard section={section} dragging={dragging} dropPosition={dropPosition} /> : null}
      {!reorderMode && !collapsed ? (
        <div
          className="cms-editable-preview"
          onPointerOverCapture={(event) => {
            const figure = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-cms-screenshot-index]') : null;
            if (figure) handleScreenshotPointerOver(figure);
          }}
          dangerouslySetInnerHTML={{ __html: editableHtml }}
        />
      ) : null}
      {!reorderMode && !collapsed ? (
        <div className="section-review-meta">
          <span>Workflow: {section.status}</span>
          <span>Reviewer: {section.reviewer || section.owner}</span>
          <span>{section.comments?.length ?? 0} comments</span>
        </div>
      ) : null}
      <SectionControllerBar
        section={section}
        selected={selected}
        collapsed={collapsed}
        editSection={editSection}
        moveSection={moveSection}
        publishOrUpdate={publishOrUpdate}
        saveAsDraft={saveAsDraft}
        duplicateSection={duplicateSection}
        deleteSection={deleteSection}
        toggleCollapse={toggleCollapse}
        beginPointerDrag={beginPointerDrag}
      />
      {!collapsed && hoveredTarget && !activeTarget && !activeScreenshot && !activeComponent && !componentInsertMode ? (
        <button
          className="cms-floating-edit-button"
          type="button"
          style={hoverEditStyle}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openInlineTarget(hoveredTarget);
          }}
          aria-label={`Edit ${hoveredTarget.label}`}
          title={`Edit ${hoveredTarget.label}`}
        >
          <span className="edit-icon" aria-hidden="true" />
        </button>
      ) : null}
      {!collapsed && outlineTarget ? <div className="cms-element-outline" style={outlineStyle} aria-hidden="true" /> : null}
      {!collapsed && activeTarget ? (
        <form className="cms-element-editor" style={editorStyle} onSubmit={(event) => {
          event.preventDefault();
          saveElementEdit();
        }}>
          <div className="cms-element-editor-head">
            <span>{activeTarget.label}</span>
            <button type="button" onClick={closeElementEditor} aria-label="Close element editor">×</button>
          </div>
          {showInlineTools ? (
            <RichSelectionToolbar applyTool={applyInlineRichTool} applyHighlight={applyInlineHighlight} />
          ) : null}
          <RevisionButtons
            undo={() => applyInlineRevisionSnapshot(inlineRevision.undo())}
            redo={() => applyInlineRevisionSnapshot(inlineRevision.redo())}
            canUndo={inlineRevision.canUndo}
            canRedo={inlineRevision.canRedo}
            label={`${activeTarget.label} edit history`}
          />
          <div
            ref={richEditorRef}
            className="cms-inline-rich-editor"
            contentEditable
            role="textbox"
            aria-label={`${activeTarget.label} content`}
            suppressContentEditableWarning
            onInput={recordInlineEditorSnapshot}
            onKeyUp={updateInlineSelectionState}
            onMouseUp={updateInlineSelectionState}
            onBlur={() => window.setTimeout(updateInlineSelectionState, 0)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeElementEditor();
                return;
              }
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                saveElementEdit();
              }
            }}
            onPaste={(event) => {
              event.preventDefault();
              document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
              recordInlineEditorSnapshot();
            }}
          />
          <div className="cms-element-editor-actions">
            {activeTarget.kind !== 'section-title' && activeTarget.kind !== 'heading' ? (
              <button className="btn btn-sm danger" type="button" onClick={deleteActiveInlineElement}><span className="trash-icon" aria-hidden="true" /> Delete</button>
            ) : null}
            <button className="btn btn-sm" type="button" onClick={closeElementEditor}>Cancel</button>
            <button className="btn btn-sm btn-red" type="submit" disabled={!inlineEditorHasText}>Save</button>
          </div>
        </form>
      ) : null}
      {!collapsed && activeScreenshot ? (
        <Modal
          title={`Edit ${activeScreenshot.label}`}
          close={requestCloseScreenshotEditor}
          cardClassName="cms-screenshot-modal-card"
          hideTitle
          hideClose
        >
          <form className="cms-screenshot-editor cms-screenshot-modal-form" onSubmit={(event) => {
            event.preventDefault();
            saveScreenshotEdit();
          }}>
            <div className="cms-screenshot-modal-head">
              <div className="cms-screenshot-modal-title">
                <span>Screenshot editor</span>
                <strong>{activeScreenshot.label}</strong>
              </div>
              <button className="modal-close cms-screenshot-modal-close" type="button" onClick={requestCloseScreenshotEditor} aria-label="Close screenshot editor">×</button>
            </div>
            <div className="cms-screenshot-modal-scroll" ref={modalScrollRef}>
              <RevisionButtons
                undo={screenshotRevision.undo}
                redo={screenshotRevision.redo}
                canUndo={screenshotRevision.canUndo}
                canRedo={screenshotRevision.canRedo}
                label={`${activeScreenshot.label} edit history`}
              />
              <div className="cms-screenshot-fields">
                <label className="field wide">
                  <span>Image URL</span>
                  <input ref={screenshotUrlRef} value={screenshotDraft.src} onChange={(event) => setScreenshotDraft({ ...screenshotDraft, src: event.target.value })} required />
                </label>
                <label className="field wide">
                  <span>Alt Text</span>
                  <input value={screenshotDraft.alt} onChange={(event) => setScreenshotDraft({ ...screenshotDraft, alt: event.target.value })} />
                </label>
                <label className="field wide">
                  <span>Caption</span>
                  <textarea value={screenshotDraft.caption} onChange={(event) => setScreenshotDraft({ ...screenshotDraft, caption: event.target.value })} />
                </label>
              </div>
              <MediaLibraryPicker
                assets={mediaAssets}
                usageRefs={mediaUsageRefs}
                selectedSrc={screenshotDraft.src}
                usageLabel={mediaUsageLabel}
                addAsset={addMediaAsset}
                selectAsset={applyMediaAssetToScreenshot}
              />
              <div className="cms-marker-workspace">
                <div className="cms-marker-tool-strip" role="toolbar" aria-label="Marker tools">
                  <div className="cms-marker-tool-strip-tools">
                    <button
                      type="button"
                      className={`cms-marker-tool ${activeMarkerTool === null ? 'active' : ''}`}
                      onClick={() => setActiveMarkerTool(null)}
                      aria-pressed={activeMarkerTool === null}
                      aria-label="Select / move markers"
                      title="Select / move (Esc to deselect)"
                    >
                      <span aria-hidden="true">↖</span>
                    </button>
                    {MARKER_KINDS.map((kind) => {
                      const icon = kind === 'shape' ? '▭' : kind === 'pointer' ? '➤' : kind === 'text' ? 'T' : '🔗';
                      const label = MARKER_KINDS_LABELS[kind];
                      return (
                        <button
                          key={`tool-${kind}`}
                          type="button"
                          className={`cms-marker-tool ${activeMarkerTool === kind ? 'active' : ''}`}
                          onClick={() => setActiveMarkerTool(kind)}
                          aria-pressed={activeMarkerTool === kind}
                          aria-label={`Add ${label} marker`}
                          title={`${label} — click then drop on image`}
                        >
                          <span aria-hidden="true">{icon}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="cms-marker-tool-strip-status">
                    <span>{screenshotDraft.markers.length}</span>
                    {activeMarkerTool ? (
                      <span className="cms-marker-tool-strip-hint">click image</span>
                    ) : null}
                  </div>
                </div>
                {screenshotDraft.src.trim() ? (
                  <div
                    className={`cms-marker-preview ${activeMarkerTool ? 'is-placing' : ''}`}
                    ref={markerPreviewRef}
                    onClick={(event) => {
                      if (!activeMarkerTool) return;
                      const preview = markerPreviewRef.current;
                      if (!preview) return;
                      const target = event.target as HTMLElement;
                      // Ignore clicks that started on an existing marker — their
                      // own pointer handlers manage drag + selection.
                      if (target.closest('.cms-draggable-marker')) return;
                      const rect = preview.getBoundingClientRect();
                      if (rect.width === 0 || rect.height === 0) return;
                      const xPct = clampPct(((event.clientX - rect.left) / rect.width) * 100);
                      const yPct = clampPct(((event.clientY - rect.top) / rect.height) * 100);
                      addMarkerAt(activeMarkerTool, xPct, yPct);
                    }}
                  >
                    <img src={screenshotDraft.src} alt="" draggable={false} />
                    {screenshotDraft.markers.map((marker, markerIndex) => (
                      <div
                        className={`doc-marker cms-draggable-marker marker-${marker.kind}${selectedMarkerId === marker.id ? ' cms-marker-selected' : ''}`}
                        key={marker.id}
                        role="button"
                        tabIndex={-1}
                        data-kind={marker.kind}
                        data-label-align={marker.kind === 'shape' ? marker.align : 'center'}
                        style={markerElementStyle(marker)}
                        onPointerDown={(event) => {
                          // Move keyboard focus onto the marker so Del/Bksp and the
                          // arrow-nudge shortcuts target it. startMarkerDrag calls
                          // preventDefault(), which suppresses the browser's automatic
                          // focus-on-pointerdown, so we focus explicitly here. Without
                          // this, focus stays on the Image-URL input and Backspace edits
                          // the URL (breaking the image) instead of deleting the marker.
                          const node = event.currentTarget;
                          selectMarker(marker.id);
                          startMarkerDrag(marker, event);
                          node.focus({ preventScroll: true });
                        }}
                        onPointerMove={dragMarker}
                        onPointerUp={stopMarkerDrag}
                        onPointerCancel={stopMarkerDrag}
                        onDoubleClick={(event) => beginMarkerLabelEdit(marker.id, event)}
                        aria-label={`${marker.kind === 'pointer' ? 'Move, resize, or rotate' : 'Move or resize'} ${marker.label || `${markerKindLabel(marker.kind)} marker`}`}
                      >
                        {marker.kind !== 'shape' && marker.kind !== 'text' ? (
                          <>
                            <span className="doc-marker-wave wave-a" aria-hidden="true" />
                            <span className="doc-marker-wave wave-b" aria-hidden="true" />
                            <span className="doc-marker-wave wave-c" aria-hidden="true" />
                            <span className="doc-marker-core-glow" aria-hidden="true" />
                            {marker.kind === 'pointer' ? <span className="doc-marker-pointer-icon" aria-hidden="true" /> : null}
                            {marker.kind === 'link' ? <span className="doc-marker-link-icon" aria-hidden="true" /> : null}
                          </>
                        ) : null}
                        {editingMarkerLabelId === marker.id ? (
                          <input
                            autoFocus
                            className="cms-marker-label-input"
                            value={marker.label}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                            onDoubleClick={(event) => event.stopPropagation()}
                            onBlur={() => setEditingMarkerLabelId(null)}
                            onChange={(event) => updateMarker(marker.id, { label: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === 'Escape') {
                                event.preventDefault();
                                setEditingMarkerLabelId(null);
                              }
                            }}
                            aria-label={`Edit ${marker.label} label`}
                          />
                        ) : (
                          <b className="doc-marker-chip">{markerLabel(marker, markerIndex + 1)}</b>
                        )}
                        {MARKER_RESIZE_EDGES.map((edge) => {
                          const rotateHandle = marker.kind === 'pointer' && markerEdgeCanRotate(edge);
                          return (
                            <span
                              aria-hidden="true"
                              className={`cms-marker-resize-handle ${edge}${rotateHandle ? ' rotate-handle' : ''}`}
                              key={edge}
                              onPointerDown={(event) => startMarkerResize(marker, edge, event)}
                              onPointerMove={dragMarker}
                              onPointerUp={stopMarkerDrag}
                              onPointerCancel={stopMarkerDrag}
                            />
                          );
                        })}
                      </div>
                    ))}
                    {screenshotDraft.markers.map((marker, markerIndex) => {
                      if (marker.kind === 'shape') return null;
                      const description = normalizeInlineEditableValue(marker.description) || 'Click the hotspot to open guidance.';
                      const cta = markerLabel(marker, markerIndex + 1);
                      const popoverTarget = markerHref(marker);
                      return (
                        <div
                          className="doc-marker-popover cms-marker-popover-draft"
                          key={`${marker.id}-popover`}
                          data-marker-id={marker.id}
                          style={markerPopoverStyle(marker)}
                          onPointerDown={(event) => startMarkerPopoverDrag(marker, event)}
                          onPointerMove={dragMarker}
                          onPointerUp={stopMarkerDrag}
                          onPointerCancel={stopMarkerDrag}
                          role="button"
                          tabIndex={0}
                          aria-label={`Drag info bubble for ${marker.label || `marker ${markerIndex + 1}`}`}
                        >
                          <span className="cms-marker-popover-grip" aria-hidden="true" />
                          <span className="doc-marker-popover-text">{description}</span>
                          {popoverTarget ? (
                            <span className="doc-marker-popover-cta">{cta || MARKER_DEFAULT_LINK_LABEL}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {/* Duplicate description preview block removed — descriptions
                    live inside the selected marker's inspector. The rendered
                    doc HTML continues to show them via writeMarkerDescriptions. */}
                {screenshotDraft.markers.length ? (
                  <div className="cms-marker-chip-strip" role="tablist" aria-label="Markers">
                    {screenshotDraft.markers.map((marker, index) => {
                      const chipLabel = (marker.label || markerKindLabel(marker.kind)).trim() || `Marker ${index + 1}`;
                      const active = selectedMarkerId === marker.id;
                      return (
                        <button
                          key={`chip-${marker.id}`}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          className={`cms-marker-chip ${active ? 'active' : ''}`}
                          onClick={() => selectMarker(marker.id)}
                          title={`Edit ${chipLabel}`}
                        >
                          <span className="cms-marker-chip-num">{index + 1}</span>
                          <span className="cms-marker-chip-label">{chipLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {screenshotDraft.markers.length && !selectedMarkerId ? (
                  <p className="cms-marker-empty-hint">Pick a marker from the strip above, or click one on the image, to edit it.</p>
                ) : null}
                {screenshotDraft.markers.length && selectedMarkerId ? (
                  <div className="cms-marker-list">
                    {screenshotDraft.markers
                      .filter((marker) => marker.id === selectedMarkerId)
                      .map((marker) => {
                      const markerIndex = screenshotDraft.markers.findIndex((m) => m.id === marker.id);
                      const linkLike = marker.kind === 'link' || marker.kind === 'pointer';
                      const targetMode = markerTargetMode(marker.targetSectionId);
                      const sectionTargetId = markerSectionTargetId(marker.targetSectionId);
                      const hasSectionTarget = sectionTargets.some((option) => option.id === sectionTargetId);
                      return (
                        <div className="cms-marker-row" key={marker.id}>
                          <div className="cms-marker-row-head">
                            <div className="cms-marker-row-title">
                              <strong>Marker {markerIndex + 1}</strong>
                              <span>{MARKER_KINDS_LABELS[marker.kind]}</span>
                            </div>
                            <button className="btn btn-sm cms-marker-delete-button" type="button" onClick={() => deleteMarker(marker.id)} aria-label={`Delete ${marker.label || 'marker'}`} title="Delete marker">
                              <span className="trash-icon" aria-hidden="true" />
                            </button>
                          </div>
                          <div className={`cms-marker-panels ${showMarkerOpacityControls ? 'show-alpha' : 'compact-alpha'}`}>
                            <div className="cms-marker-panel">
                              <label className="field wide cms-marker-content-field">
                                <span>{linkLike ? 'CTA text' : 'Label'}</span>
                                <input
                                  value={marker.label}
                                  onChange={(event) => updateMarker(marker.id, { label: event.target.value })}
                                  onBlur={(event) => {
                                    if (marker.kind === 'shape') return;
                                    updateMarker(marker.id, { label: normalizeMarkerWords(event.target.value, 3) });
                                  }}
                                  placeholder={marker.kind === 'link' ? MARKER_DEFAULT_LINK_LABEL : marker.kind === 'pointer' ? `Pointer ${markerIndex + 1}` : `Marker ${markerIndex + 1}`}
                                />
                              </label>
                              <label className="field wide cms-marker-description-field">
                                <span>Description</span>
                                <textarea
                                  value={marker.description}
                                  onChange={(event) => updateMarker(marker.id, { description: event.target.value })}
                                  placeholder="Explain what this marker points at"
                                  rows={2}
                                />
                              </label>
                              <details className="cms-marker-essentials-details">
                                <summary>Type, alignment & position</summary>
                              <div className="field cms-marker-kind-field">
                                <span>Type</span>
                                <div className="cms-marker-kind-control" role="group" aria-label={`${marker.label || 'Marker'} type`}>
                                  {MARKER_KINDS.map((kind) => (
                                    <button
                                      className={marker.kind === kind ? 'active' : ''}
                                      key={`${marker.id}-${kind}`}
                                      type="button"
                                      onClick={() => {
                                        const pointerSize = clampBetween(
                                          Math.min(marker.w, marker.h),
                                          MIN_MARKER_SIZE,
                                          Math.min(100 - marker.x, 100 - marker.y),
                                        );
                                        updateMarker(marker.id, {
                                          kind,
                                          label: markerLabelFromDraft(marker.label, kind, markerIndex + 1),
                                          targetSectionId: kind === 'shape' ? MARKER_DEFAULT_POINTER_TARGET : (marker.targetSectionId || defaultSectionTarget || MARKER_DEFAULT_POINTER_TARGET),
                                          animated: kind === 'shape' ? false : (marker.kind === 'shape' ? true : marker.animated),
                                          align: kind === 'shape' ? marker.align : 'center',
                                          backgroundOpacity: kind === 'shape'
                                            ? (marker.kind === 'shape'
                                              ? normalizeMarkerOpacity(marker.backgroundOpacity, MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY)
                                              : MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY)
                                            : (marker.kind === 'shape'
                                              ? MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY
                                              : normalizeMarkerOpacity(marker.backgroundOpacity, MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY)),
                                          ...(kind === 'pointer' ? { w: pointerSize, h: pointerSize } : {}),
                                          pointerRotation: kind === 'pointer' ? normalizePointerRotation(marker.pointerRotation) : MARKER_DEFAULT_POINTER_ROTATION,
                                          pointerThickness: kind === 'pointer' ? normalizePointerThickness(marker.pointerThickness) : MARKER_DEFAULT_POINTER_THICKNESS,
                                        });
                                      }}
                                      aria-pressed={marker.kind === kind}
                                    >
                                      {MARKER_KINDS_LABELS[kind]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {marker.kind === 'shape' ? (
                                <div className="field wide cms-marker-align-field">
                                  <span>Text Align</span>
                                  <div className="cms-marker-align-control" role="group" aria-label={`${marker.label || 'Marker'} text alignment`}>
                                    {MARKER_TEXT_ALIGNMENTS.map((align) => (
                                      <button
                                        className={marker.align === align ? 'active' : ''}
                                        key={align}
                                        type="button"
                                        onClick={() => updateMarker(marker.id, { align })}
                                        aria-pressed={marker.align === align}
                                      >
                                        {MARKER_TEXT_ALIGN_LABELS[align]}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              <div className="accessible-marker-controls" role="group" aria-label={`Accessible placement controls for marker ${markerIndex + 1}`}>
                              <div className="cms-marker-position-grid">
                                <label className="field cms-marker-pos-field">
                                  <span>X</span>
                                  <input type="number" min="0" max={Math.round(100 - marker.w)} step="1" value={Math.round(marker.x)} onChange={(event) => updateMarker(marker.id, { x: clampBetween(Number(event.target.value), 0, 100 - marker.w) })} aria-label={`Marker ${markerIndex + 1} horizontal position`} />
                                </label>
                                <label className="field cms-marker-pos-field">
                                  <span>Y</span>
                                  <input type="number" min="0" max={Math.round(100 - marker.h)} step="1" value={Math.round(marker.y)} onChange={(event) => updateMarker(marker.id, { y: clampBetween(Number(event.target.value), 0, 100 - marker.h) })} aria-label={`Marker ${markerIndex + 1} vertical position`} />
                                </label>
                                <label className="field cms-marker-pos-field">
                                  <span>Width</span>
                                  <input type="number" min={MIN_MARKER_SIZE} max={Math.round(100 - marker.x)} step="1" value={Math.round(marker.w)} onChange={(event) => updateMarker(marker.id, { w: clampBetween(Number(event.target.value), MIN_MARKER_SIZE, 100 - marker.x) })} aria-label={`Marker ${markerIndex + 1} width`} />
                                </label>
                                <label className="field cms-marker-pos-field">
                                  <span>Height</span>
                                  <input type="number" min={MIN_MARKER_SIZE} max={Math.round(100 - marker.y)} step="1" value={Math.round(marker.h)} onChange={(event) => updateMarker(marker.id, { h: clampBetween(Number(event.target.value), MIN_MARKER_SIZE, 100 - marker.y) })} aria-label={`Marker ${markerIndex + 1} height`} />
                                </label>
                                <div className="marker-nudge-controls" role="group" aria-label={`Nudge marker ${markerIndex + 1}`}>
                                  <button type="button" onClick={() => nudgeMarker(marker, 0, -1)} aria-label={`Move marker ${markerIndex + 1} up`}>↑</button>
                                  <button type="button" onClick={() => nudgeMarker(marker, -1, 0)} aria-label={`Move marker ${markerIndex + 1} left`}>←</button>
                                  <button type="button" onClick={() => nudgeMarker(marker, 1, 0)} aria-label={`Move marker ${markerIndex + 1} right`}>→</button>
                                  <button type="button" onClick={() => nudgeMarker(marker, 0, 1)} aria-label={`Move marker ${markerIndex + 1} down`}>↓</button>
                                </div>
                              </div>
                              </div>
                              </details>
                            </div>
                            <div className="cms-marker-panel">
                              <div className="cms-marker-panel-head">
                                <div className="cms-marker-panel-title">{marker.kind === 'shape' ? 'Style & advanced' : 'Behavior & advanced'}</div>
                                <div className="cms-marker-panel-head-actions">
                                  <button
                                    className="btn btn-sm cms-marker-panel-toggle"
                                    type="button"
                                    onClick={() => {
                                      const next = !showMarkerAdvancedControls;
                                      setShowMarkerAdvancedControls(next);
                                      // Opacity controls follow advanced — one toggle, not two.
                                      setShowMarkerOpacityControls(next);
                                    }}
                                    aria-expanded={showMarkerAdvancedControls}
                                  >
                                    {showMarkerAdvancedControls ? 'Hide advanced' : 'Show advanced'}
                                  </button>
                                </div>
                              </div>
                              {!showMarkerAdvancedControls ? (
                                <div className="cms-marker-advanced-collapsed">
                                  <strong>Basic inspector active</strong>
                                  <span>Use type, label/CTA, target, position, and approved presets first. Expand advanced for freeform color, opacity, dialog, CTA, and pointer behavior.</span>
                                  <div className="cms-marker-preset-list compact" role="list" aria-label="Approved marker presets">
                                    {markerColorPresets.slice(0, 6).map((preset) => {
                                      const active = markerColorPresetKey(preset) === markerColorPresetKey(marker);
                                      return (
                                        <button
                                          className={`cms-marker-preset-apply ${active ? 'active' : ''}`}
                                          key={`${marker.id}-basic-${preset.id}`}
                                          type="button"
                                          onClick={() => applyMarkerColorPreset(marker, preset)}
                                          aria-pressed={active}
                                          title={`Apply ${preset.name} preset`}
                                        >
                                          <span className="cms-marker-preset-swatch" aria-hidden="true">
                                            <i style={{ background: hexToRgba(preset.borderColor, markerOpacityAlpha(preset.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY)) }} />
                                            <i style={{ background: hexToRgba(preset.backgroundColor, markerOpacityAlpha(preset.backgroundOpacity, MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY)) }} />
                                            <i style={{ background: hexToRgba(preset.textColor, markerOpacityAlpha(preset.textOpacity, MARKER_DEFAULT_TEXT_OPACITY)) }} />
                                          </span>
                                          <small>{preset.name}</small>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : null}
                              {showMarkerAdvancedControls ? (
                                <>
                              {marker.kind === 'shape' ? (
                                <>
                                  <label className="field wide cms-marker-style-field">
                                    <span>Line style</span>
                                    <div className="cms-marker-border-control" role="group" aria-label={`${marker.label || 'Marker'} line style`}>
                                      {MARKER_BORDER_STYLES.map((style) => (
                                        <button
                                          className={marker.borderStyle === style ? 'active' : ''}
                                          key={`${marker.id}-${style}`}
                                          type="button"
                                          onClick={() => updateMarker(marker.id, { borderStyle: style })}
                                          aria-pressed={marker.borderStyle === style}
                                        >
                                          {MARKER_BORDER_STYLE_LABELS[style]}
                                        </button>
                                      ))}
                                    </div>
                                  </label>
                                  <div className="cms-marker-style-preview" aria-hidden="true">
                                    <div
                                      className="cms-marker-style-preview-chip"
                                      style={{
                                        border: `3px ${marker.borderStyle} ${hexToRgba(marker.borderColor, markerOpacityAlpha(marker.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY))}`,
                                        background: hexToRgba(
                                          marker.backgroundColor,
                                          markerOpacityAlpha(
                                            marker.backgroundOpacity,
                                            defaultBgOpacityFor(marker.kind),
                                          ),
                                        ),
                                        color: hexToRgba(marker.textColor, markerOpacityAlpha(marker.textOpacity, MARKER_DEFAULT_TEXT_OPACITY)),
                                      }}
                                    >
                                      {marker.label.trim() || `Marker ${markerIndex + 1}`}
                                    </div>
                                  </div>
                                  <div className="cms-marker-color-row cms-marker-color-row-enhanced">
                                    <label className="field cms-marker-color-field">
                                      <span>Border</span>
                                      <div className="cms-marker-color-control">
                                        <input
                                          type="color"
                                          value={marker.borderColor}
                                          onChange={(event) => updateMarker(marker.id, { borderColor: event.target.value })}
                                          aria-label={`Marker ${marker.label || marker.id} border color`}
                                        />
                                        <div className="cms-marker-color-meta">
                                          <code>{marker.borderColor.toUpperCase()}</code>
                                          <label className="cms-marker-alpha-control">
                                            <span>A {normalizeMarkerOpacity(marker.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY)}%</span>
                                            <input
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={normalizeMarkerOpacity(marker.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY)}
                                              onChange={(event) => updateMarker(marker.id, { borderOpacity: normalizeMarkerOpacity(event.target.value, MARKER_DEFAULT_BORDER_OPACITY) })}
                                              aria-label={`Marker ${marker.label || marker.id} border opacity`}
                                            />
                                          </label>
                                        </div>
                                      </div>
                                    </label>
                                    <label className="field cms-marker-color-field">
                                      <span>Background</span>
                                      <div className="cms-marker-color-control">
                                        <input
                                          type="color"
                                          value={marker.backgroundColor}
                                          onChange={(event) => updateMarker(marker.id, { backgroundColor: event.target.value })}
                                          aria-label={`Marker ${marker.label || marker.id} marker color`}
                                        />
                                        <div className="cms-marker-color-meta">
                                          <code>{marker.backgroundColor.toUpperCase()}</code>
                                          <label className="cms-marker-alpha-control">
                                            <span>A {normalizeMarkerOpacity(marker.backgroundOpacity, defaultBgOpacityFor(marker.kind))}%</span>
                                            <input
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={normalizeMarkerOpacity(marker.backgroundOpacity, defaultBgOpacityFor(marker.kind))}
                                              onChange={(event) => updateMarker(marker.id, { backgroundOpacity: normalizeMarkerOpacity(event.target.value, defaultBgOpacityFor(marker.kind)) })}
                                              aria-label={`Marker ${marker.label || marker.id} background opacity`}
                                            />
                                          </label>
                                        </div>
                                      </div>
                                    </label>
                                    <label className="field cms-marker-color-field">
                                      <span>Text</span>
                                      <div className="cms-marker-color-control">
                                        <input
                                          type="color"
                                          value={marker.textColor}
                                          onChange={(event) => updateMarker(marker.id, { textColor: event.target.value })}
                                          aria-label={`Marker ${marker.label || marker.id} text color`}
                                        />
                                        <div className="cms-marker-color-meta">
                                          <code>{marker.textColor.toUpperCase()}</code>
                                          <label className="cms-marker-alpha-control">
                                            <span>A {normalizeMarkerOpacity(marker.textOpacity, MARKER_DEFAULT_TEXT_OPACITY)}%</span>
                                            <input
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={normalizeMarkerOpacity(marker.textOpacity, MARKER_DEFAULT_TEXT_OPACITY)}
                                              onChange={(event) => updateMarker(marker.id, { textOpacity: normalizeMarkerOpacity(event.target.value, MARKER_DEFAULT_TEXT_OPACITY) })}
                                              aria-label={`Marker ${marker.label || marker.id} text opacity`}
                                            />
                                          </label>
                                        </div>
                                      </div>
                                    </label>
                                  </div>
                                  <div className="cms-marker-preset-row">
                                    <div className="cms-marker-preset-head">
                                      <span>Color presets</span>
                                      <button
                                        className="btn btn-sm"
                                        type="button"
                                        onClick={() => saveMarkerColorPreset(marker)}
                                        disabled={markerColorPresets.some((item) => markerColorPresetKey(item) === markerColorPresetKey(marker))}
                                      >
                                        Save current
                                      </button>
                                    </div>
                                    <div className="cms-marker-preset-list" role="list" aria-label="Saved marker color presets">
                                      {markerColorPresets.map((preset) => {
                                        const active = markerColorPresetKey(preset) === markerColorPresetKey(marker);
                                        return (
                                          <div className={`cms-marker-preset-item ${active ? 'active' : ''}`} key={preset.id} role="listitem">
                                            <button
                                              className="cms-marker-preset-apply"
                                              type="button"
                                              onClick={() => applyMarkerColorPreset(marker, preset)}
                                              aria-pressed={active}
                                              title={`Apply ${preset.name} colors`}
                                            >
                                              <span className="cms-marker-preset-swatch" aria-hidden="true">
                                                <i style={{ background: hexToRgba(preset.borderColor, markerOpacityAlpha(preset.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY)) }} />
                                                <i style={{ background: hexToRgba(preset.backgroundColor, markerOpacityAlpha(preset.backgroundOpacity, MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY)) }} />
                                                <i style={{ background: hexToRgba(preset.textColor, markerOpacityAlpha(preset.textOpacity, MARKER_DEFAULT_TEXT_OPACITY)) }} />
                                              </span>
                                              <small>{preset.name}</small>
                                            </button>
                                            {!preset.locked ? (
                                              <button className="cms-marker-preset-remove" type="button" onClick={() => removeMarkerColorPreset(preset.id)} aria-label={`Delete ${preset.name} preset`}>
                                                ×
                                              </button>
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="field">
                                    <span>Destination</span>
                                    <div className="cms-marker-target-control" role="group" aria-label={`${marker.label || 'Marker'} destination type`}>
                                      <button
                                        className={targetMode === 'section' ? 'active' : ''}
                                        type="button"
                                        onClick={() => updateMarker(marker.id, { targetSectionId: defaultSectionTarget || '#target-section' })}
                                        aria-pressed={targetMode === 'section'}
                                      >
                                        Section
                                      </button>
                                      <button
                                        className={targetMode === 'external' ? 'active' : ''}
                                        type="button"
                                        onClick={() => updateMarker(marker.id, { targetSectionId: markerTargetMode(marker.targetSectionId) === 'external' ? marker.targetSectionId : 'https://' })}
                                        aria-pressed={targetMode === 'external'}
                                      >
                                        External
                                      </button>
                                    </div>
                                  </div>
                                  {targetMode === 'section' ? (
                                    sectionTargets.length ? (
                                      <label className="field wide cms-marker-target-field">
                                        <span>Target section</span>
                                        <select
                                          value={sectionTargetId || sectionTargets[0].id}
                                          onChange={(event) => updateMarker(marker.id, { targetSectionId: `#${event.target.value}` })}
                                        >
                                          {!hasSectionTarget && sectionTargetId ? <option value={sectionTargetId}>{sectionTargetId}</option> : null}
                                          {sectionTargets.map((target) => (
                                            <option key={target.id} value={target.id}>{target.label}</option>
                                          ))}
                                        </select>
                                      </label>
                                    ) : (
                                      <label className="field wide cms-marker-target-field">
                                        <span>Target section id</span>
                                        <input value={marker.targetSectionId} onChange={(event) => updateMarker(marker.id, { targetSectionId: event.target.value })} placeholder="#target-section" />
                                      </label>
                                    )
                                  ) : (
                                    <label className="field wide cms-marker-target-field">
                                      <span>External URL</span>
                                      <input value={marker.targetSectionId} onChange={(event) => updateMarker(marker.id, { targetSectionId: event.target.value })} placeholder="https://example.com/details" />
                                    </label>
                                  )}
                                  {marker.kind === 'pointer' ? (
                                    <div className="cms-marker-position-grid">
                                      <label className="field cms-marker-pos-field">
                                        <span>Arrow Weight</span>
                                        <input
                                          type="number"
                                          min="1"
                                          max="6"
                                          step="0.5"
                                          value={normalizePointerThickness(marker.pointerThickness)}
                                          onChange={(event) => updateMarker(marker.id, { pointerThickness: normalizePointerThickness(event.target.value) })}
                                        />
                                      </label>
                                      <div className="field wide cms-marker-align-field">
                                        <span>Quick Direction</span>
                                        <div className="cms-marker-align-control" role="group" aria-label="Pointer direction">
                                          {[{ label: 'Right', value: 0 }, { label: 'Down', value: 90 }, { label: 'Left', value: 180 }, { label: 'Up', value: 270 }].map((direction) => (
                                            <button
                                              key={`${marker.id}-dir-${direction.value}`}
                                              type="button"
                                              className={Math.round(normalizePointerRotation(marker.pointerRotation)) === direction.value ? 'active' : ''}
                                              onClick={() => updateMarker(marker.id, { pointerRotation: direction.value })}
                                              aria-pressed={Math.round(normalizePointerRotation(marker.pointerRotation)) === direction.value}
                                            >
                                              {direction.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <p className="cms-pointer-rotate-hint">Drag corner dots on the marker to rotate visually.</p>
                                    </div>
                                  ) : null}
                                  <div className="cms-hotspot-style-preview" aria-hidden="true">
                                    <span
                                      className={`doc-marker marker-${marker.kind} cms-hotspot-style-preview-anchor`}
                                      style={markerElementStyle({ ...marker, x: 0, y: 0, w: 9, h: 9 })}
                                    >
                                      <span className="doc-marker-wave wave-a" />
                                      <span className="doc-marker-wave wave-b" />
                                      <span className="doc-marker-wave wave-c" />
                                      <span className="doc-marker-core-glow" />
                                      {marker.kind === 'pointer' ? <span className="doc-marker-pointer-icon" aria-hidden="true" /> : null}
                                      {marker.kind === 'link' ? <span className="doc-marker-link-icon" aria-hidden="true" /> : null}
                                      <b className="doc-marker-chip">{markerLabel(marker, markerIndex + 1)}</b>
                                    </span>
                                    <span
                                      className="doc-marker-popover cms-hotspot-style-preview-popover"
                                      style={markerPopoverStyle({ ...marker, popoverX: 0, popoverY: 0 })}
                                    >
                                      <span className="doc-marker-popover-text">{normalizeInlineEditableValue(marker.description) || 'Marker info dialog preview'}</span>
                                      <span className="doc-marker-popover-cta">{markerLabel(marker, markerIndex + 1)}</span>
                                    </span>
                                  </div>
                                  <div className="cms-marker-color-row cms-marker-color-row-enhanced">
                                    <label className="field cms-marker-color-field">
                                      <span>Ring</span>
                                      <div className="cms-marker-color-control">
                                        <input
                                          type="color"
                                          value={marker.borderColor}
                                          onChange={(event) => updateMarker(marker.id, { borderColor: event.target.value })}
                                          aria-label={`Marker ${marker.label || marker.id} ring color`}
                                        />
                                        <div className="cms-marker-color-meta">
                                          <code>{marker.borderColor.toUpperCase()}</code>
                                          <label className="cms-marker-alpha-control">
                                            <span>A {normalizeMarkerOpacity(marker.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY)}%</span>
                                            <input
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={normalizeMarkerOpacity(marker.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY)}
                                              onChange={(event) => updateMarker(marker.id, { borderOpacity: normalizeMarkerOpacity(event.target.value, MARKER_DEFAULT_BORDER_OPACITY) })}
                                              aria-label={`Marker ${marker.label || marker.id} ring opacity`}
                                            />
                                          </label>
                                        </div>
                                      </div>
                                    </label>
                                    <label className="field cms-marker-color-field">
                                      <span>Marker color</span>
                                      <div className="cms-marker-color-control">
                                        <input
                                          type="color"
                                          value={marker.backgroundColor}
                                          onChange={(event) => updateMarker(marker.id, { backgroundColor: event.target.value })}
                                          aria-label={`Marker ${marker.label || marker.id} marker color`}
                                        />
                                        <div className="cms-marker-color-meta">
                                          <code>{marker.backgroundColor.toUpperCase()}</code>
                                          <label className="cms-marker-alpha-control">
                                            <span>A {normalizeMarkerOpacity(marker.backgroundOpacity, MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY)}%</span>
                                            <input
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={normalizeMarkerOpacity(marker.backgroundOpacity, MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY)}
                                              onChange={(event) => updateMarker(marker.id, { backgroundOpacity: normalizeMarkerOpacity(event.target.value, MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY) })}
                                              aria-label={`Marker ${marker.label || marker.id} marker opacity`}
                                            />
                                          </label>
                                        </div>
                                      </div>
                                    </label>
                                    <label className="field cms-marker-color-field">
                                      <span>Text color</span>
                                      <div className="cms-marker-color-control">
                                        <input
                                          type="color"
                                          value={marker.textColor}
                                          onChange={(event) => updateMarker(marker.id, { textColor: event.target.value })}
                                          aria-label={`Marker ${marker.label || marker.id} text color`}
                                        />
                                        <div className="cms-marker-color-meta">
                                          <code>{marker.textColor.toUpperCase()}</code>
                                          <label className="cms-marker-alpha-control">
                                            <span>A {normalizeMarkerOpacity(marker.textOpacity, MARKER_DEFAULT_TEXT_OPACITY)}%</span>
                                            <input
                                              type="range"
                                              min="0"
                                              max="100"
                                              value={normalizeMarkerOpacity(marker.textOpacity, MARKER_DEFAULT_TEXT_OPACITY)}
                                              onChange={(event) => updateMarker(marker.id, { textOpacity: normalizeMarkerOpacity(event.target.value, MARKER_DEFAULT_TEXT_OPACITY) })}
                                              aria-label={`Marker ${marker.label || marker.id} text opacity`}
                                            />
                                          </label>
                                        </div>
                                      </div>
                                    </label>
                                  </div>
                                  <details className="cms-marker-advanced-style">
                                    <summary>Dialog & CTA style</summary>
                                    <div className="cms-marker-color-row cms-marker-color-row-enhanced">
                                      <label className="field cms-marker-color-field">
                                        <span>Dialog bg</span>
                                        <div className="cms-marker-color-control">
                                          <input
                                            type="color"
                                            value={marker.dialogBackgroundColor}
                                            onChange={(event) => updateMarker(marker.id, { dialogBackgroundColor: event.target.value })}
                                            aria-label={`Marker ${marker.label || marker.id} dialog background color`}
                                          />
                                          <div className="cms-marker-color-meta">
                                            <code>{marker.dialogBackgroundColor.toUpperCase()}</code>
                                            <label className="cms-marker-alpha-control">
                                              <span>A {normalizeMarkerOpacity(marker.dialogBackgroundOpacity, MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY)}%</span>
                                              <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={normalizeMarkerOpacity(marker.dialogBackgroundOpacity, MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY)}
                                                onChange={(event) => updateMarker(marker.id, { dialogBackgroundOpacity: normalizeMarkerOpacity(event.target.value, MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY) })}
                                                aria-label={`Marker ${marker.label || marker.id} dialog background opacity`}
                                              />
                                            </label>
                                          </div>
                                        </div>
                                      </label>
                                      <label className="field cms-marker-color-field">
                                        <span>Dialog border</span>
                                        <div className="cms-marker-color-control">
                                          <input
                                            type="color"
                                            value={marker.dialogBorderColor}
                                            onChange={(event) => updateMarker(marker.id, { dialogBorderColor: event.target.value })}
                                            aria-label={`Marker ${marker.label || marker.id} dialog border color`}
                                          />
                                          <div className="cms-marker-color-meta">
                                            <code>{marker.dialogBorderColor.toUpperCase()}</code>
                                            <label className="cms-marker-alpha-control">
                                              <span>A {normalizeMarkerOpacity(marker.dialogBorderOpacity, MARKER_DEFAULT_DIALOG_BORDER_OPACITY)}%</span>
                                              <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={normalizeMarkerOpacity(marker.dialogBorderOpacity, MARKER_DEFAULT_DIALOG_BORDER_OPACITY)}
                                                onChange={(event) => updateMarker(marker.id, { dialogBorderOpacity: normalizeMarkerOpacity(event.target.value, MARKER_DEFAULT_DIALOG_BORDER_OPACITY) })}
                                                aria-label={`Marker ${marker.label || marker.id} dialog border opacity`}
                                              />
                                            </label>
                                          </div>
                                        </div>
                                      </label>
                                      <label className="field cms-marker-color-field">
                                        <span>Dialog text</span>
                                        <div className="cms-marker-color-control">
                                          <input
                                            type="color"
                                            value={marker.dialogTextColor}
                                            onChange={(event) => updateMarker(marker.id, { dialogTextColor: event.target.value })}
                                            aria-label={`Marker ${marker.label || marker.id} dialog text color`}
                                          />
                                          <div className="cms-marker-color-meta">
                                            <code>{marker.dialogTextColor.toUpperCase()}</code>
                                            <label className="cms-marker-alpha-control">
                                              <span>A {normalizeMarkerOpacity(marker.dialogTextOpacity, MARKER_DEFAULT_DIALOG_TEXT_OPACITY)}%</span>
                                              <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={normalizeMarkerOpacity(marker.dialogTextOpacity, MARKER_DEFAULT_DIALOG_TEXT_OPACITY)}
                                                onChange={(event) => updateMarker(marker.id, { dialogTextOpacity: normalizeMarkerOpacity(event.target.value, MARKER_DEFAULT_DIALOG_TEXT_OPACITY) })}
                                                aria-label={`Marker ${marker.label || marker.id} dialog text opacity`}
                                              />
                                            </label>
                                          </div>
                                        </div>
                                      </label>
                                    </div>
                                    <div className="cms-marker-color-row cms-marker-color-row-compact">
                                      <label className="field cms-marker-color-field">
                                        <span>CTA bg</span>
                                        <div className="cms-marker-color-control">
                                          <input
                                            type="color"
                                            value={marker.ctaBackgroundColor}
                                            onChange={(event) => updateMarker(marker.id, { ctaBackgroundColor: event.target.value })}
                                            aria-label={`Marker ${marker.label || marker.id} CTA background color`}
                                          />
                                          <div className="cms-marker-color-meta">
                                            <code>{marker.ctaBackgroundColor.toUpperCase()}</code>
                                            <label className="cms-marker-alpha-control">
                                              <span>A {normalizeMarkerOpacity(marker.ctaBackgroundOpacity, MARKER_DEFAULT_CTA_BACKGROUND_OPACITY)}%</span>
                                              <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={normalizeMarkerOpacity(marker.ctaBackgroundOpacity, MARKER_DEFAULT_CTA_BACKGROUND_OPACITY)}
                                                onChange={(event) => updateMarker(marker.id, { ctaBackgroundOpacity: normalizeMarkerOpacity(event.target.value, MARKER_DEFAULT_CTA_BACKGROUND_OPACITY) })}
                                                aria-label={`Marker ${marker.label || marker.id} CTA background opacity`}
                                              />
                                            </label>
                                          </div>
                                        </div>
                                      </label>
                                      <label className="field cms-marker-color-field">
                                        <span>CTA text</span>
                                        <div className="cms-marker-color-control">
                                          <input
                                            type="color"
                                            value={marker.ctaTextColor}
                                            onChange={(event) => updateMarker(marker.id, { ctaTextColor: event.target.value })}
                                            aria-label={`Marker ${marker.label || marker.id} CTA text color`}
                                          />
                                          <div className="cms-marker-color-meta">
                                            <code>{marker.ctaTextColor.toUpperCase()}</code>
                                            <label className="cms-marker-alpha-control">
                                              <span>A {normalizeMarkerOpacity(marker.ctaTextOpacity, MARKER_DEFAULT_CTA_TEXT_OPACITY)}%</span>
                                              <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={normalizeMarkerOpacity(marker.ctaTextOpacity, MARKER_DEFAULT_CTA_TEXT_OPACITY)}
                                                onChange={(event) => updateMarker(marker.id, { ctaTextOpacity: normalizeMarkerOpacity(event.target.value, MARKER_DEFAULT_CTA_TEXT_OPACITY) })}
                                                aria-label={`Marker ${marker.label || marker.id} CTA text opacity`}
                                              />
                                            </label>
                                          </div>
                                        </div>
                                      </label>
                                    </div>
                                  </details>
                                  <div className="cms-marker-preset-row">
                                    <div className="cms-marker-preset-head">
                                      <span>Color presets</span>
                                      <button
                                        className="btn btn-sm"
                                        type="button"
                                        onClick={() => saveMarkerColorPreset(marker)}
                                        disabled={markerColorPresets.some((item) => markerColorPresetKey(item) === markerColorPresetKey(marker))}
                                      >
                                        Save current
                                      </button>
                                    </div>
                                    <div className="cms-marker-preset-list" role="list" aria-label="Saved marker color presets">
                                      {markerColorPresets.map((preset) => {
                                        const active = markerColorPresetKey(preset) === markerColorPresetKey(marker);
                                        return (
                                          <div className={`cms-marker-preset-item ${active ? 'active' : ''}`} key={`${marker.id}-${preset.id}`} role="listitem">
                                            <button
                                              className="cms-marker-preset-apply"
                                              type="button"
                                              onClick={() => applyMarkerColorPreset(marker, preset)}
                                              aria-pressed={active}
                                              title={`Apply ${preset.name} colors`}
                                            >
                                              <span className="cms-marker-preset-swatch" aria-hidden="true">
                                                <i style={{ background: hexToRgba(preset.borderColor, markerOpacityAlpha(preset.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY)) }} />
                                                <i style={{ background: hexToRgba(preset.backgroundColor, markerOpacityAlpha(preset.backgroundOpacity, MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY)) }} />
                                                <i style={{ background: hexToRgba(preset.textColor, markerOpacityAlpha(preset.textOpacity, MARKER_DEFAULT_TEXT_OPACITY)) }} />
                                              </span>
                                              <small>{preset.name}</small>
                                            </button>
                                            {!preset.locked ? (
                                              <button className="cms-marker-preset-remove" type="button" onClick={() => removeMarkerColorPreset(preset.id)} aria-label={`Delete ${preset.name} preset`}>
                                                ×
                                              </button>
                                            ) : null}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div className="cms-marker-color-row">
                                    <label className="field cms-marker-pulse-field">
                                      <span>Pulse animation</span>
                                      <button type="button" className={`cms-marker-toggle ${marker.animated ? 'active' : ''}`} onClick={() => updateMarker(marker.id, { animated: !marker.animated })}>
                                        {marker.animated ? 'On' : 'Off'}
                                      </button>
                                    </label>
                                  </div>
                                </>
                              )}
                                </>
                              ) : null}
                            </div>
                            <div className="cms-marker-panel">
                              <div className="cms-marker-panel-title">Placement</div>
                              <div className="cms-marker-position-grid">
                                <label className="field cms-marker-pos-field"><span>X %</span><input type="number" min="0" max="100" value={Math.round(marker.x)} onChange={(event) => updateMarker(marker.id, { x: clampBetween(Number(event.target.value), 0, 100 - marker.w) })} /></label>
                                <label className="field cms-marker-pos-field"><span>Y %</span><input type="number" min="0" max="100" value={Math.round(marker.y)} onChange={(event) => updateMarker(marker.id, { y: clampBetween(Number(event.target.value), 0, 100 - marker.h) })} /></label>
                                <label className="field cms-marker-pos-field"><span>W %</span><input type="number" min={MIN_MARKER_SIZE} max="100" value={Math.round(marker.w)} onChange={(event) => updateMarker(marker.id, { w: clampBetween(Number(event.target.value), MIN_MARKER_SIZE, 100 - marker.x) })} /></label>
                                <label className="field cms-marker-pos-field"><span>H %</span><input type="number" min={MIN_MARKER_SIZE} max="100" value={Math.round(marker.h)} onChange={(event) => updateMarker(marker.id, { h: clampBetween(Number(event.target.value), MIN_MARKER_SIZE, 100 - marker.y) })} /></label>
                                {marker.kind !== 'shape' && marker.kind !== 'text' ? (
                                  <>
                                    <label className="field cms-marker-pos-field"><span>Info X %</span><input type="number" min="0" max="100" value={Math.round(marker.popoverX)} onChange={(event) => updateMarker(marker.id, { popoverX: clampPct(Number(event.target.value)) })} /></label>
                                    <label className="field cms-marker-pos-field"><span>Info Y %</span><input type="number" min="0" max="100" value={Math.round(marker.popoverY)} onChange={(event) => updateMarker(marker.id, { popoverY: clampPct(Number(event.target.value)) })} /></label>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          {/* Description hoisted into Basics panel (above) — was duplicated here. */}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {/* markerKindPicker modal removed — kinds now live in the
                    persistent ToolStrip above the canvas. */}
              </div>
            </div>
            <div className="cms-screenshot-modal-actions">
              <button className="btn btn-sm" type="button" onClick={requestCloseScreenshotEditor}><span aria-hidden="true">✕</span> Cancel</button>
              <button className="btn btn-sm btn-red" type="submit" disabled={!screenshotDraft.src.trim() || !screenshotHasChanges}><span aria-hidden="true">✓</span> Save</button>
            </div>
          </form>
        </Modal>
      ) : null}
      {!collapsed && activeComponent ? (
        <form className="cms-element-editor cms-component-inline-editor" style={targetEditorStyle(activeComponent)} onSubmit={(event) => {
          event.preventDefault();
          saveComponentEdit();
        }}>
          <div className="cms-element-editor-head">
            <span>{activeComponent.label}</span>
            <button type="button" onClick={closeComponentEditor} aria-label="Close component editor">×</button>
          </div>
          <RevisionButtons
            undo={componentRevision.undo}
            redo={componentRevision.redo}
            canUndo={componentRevision.canUndo}
            canRedo={componentRevision.canRedo}
            label={`${activeComponent.label} edit history`}
          />
          <div className="component-card-grid">
            <label className="field wide">
              <span>Title</span>
              <input value={componentDraft.title} onChange={(event) => componentRevision.setValue((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <DocComponentFields
              block={componentDraft}
              updateBlock={updateComponentDraft}
              mediaAssets={mediaAssets}
              setMediaAssets={setMediaAssets}
              mediaUsageRefs={mediaUsageRefs}
              mediaUsageLabel={mediaUsageLabel}
            />
          </div>
          <ValidationList issues={componentDraftIssues} />
          <div className="component-preview-shell">
            <span>Live Preview</span>
            <DocComponentLivePreview html={docComponentMarkup(componentDraft)} />
          </div>
          <div className="cms-element-editor-actions">
            <button className="btn btn-sm danger" type="button" onClick={deleteActiveComponent} aria-label={`Delete ${activeComponent.label}`}><span className="trash-icon" aria-hidden="true" /> Delete</button>
            <button className="btn btn-sm" type="button" onClick={closeComponentEditor}>Cancel</button>
            <button className="btn btn-sm btn-red" type="submit" disabled={componentDraftIssues.some((issue) => issue.kind === 'error')}>Save</button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

function SectionInlineEditor({ section, sectionTargets, save, cancel, selected, dragging, reorderMode, dropPosition, selectSection, beginPointerDrag, dragOverSection, dropSection, publishOrUpdate, saveAsDraft, duplicateSection, deleteSection, mediaAssets, setMediaAssets, mediaUsageRefs, mediaUsageLabel }: {
  section: SectionEntry;
  sectionTargets: SectionTargetOption[];
  save: (section: SectionEntry) => void;
  cancel: () => void;
  selected: boolean;
  dragging: boolean;
  reorderMode: boolean;
  dropPosition: DragPosition | null;
  selectSection: () => void;
  beginPointerDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  dragOverSection: (event: ReactDragEvent<HTMLElement>) => void;
  dropSection: (event: ReactDragEvent<HTMLElement>) => void;
  publishOrUpdate: (next: SectionEntry) => void;
  saveAsDraft: (next: SectionEntry) => void;
  duplicateSection: () => void;
  deleteSection: () => void;
  mediaAssets: MediaAsset[];
  setMediaAssets: (items: MediaAsset[]) => void;
  mediaUsageRefs: Record<string, string[]>;
  mediaUsageLabel: string;
}) {
  const draftRevision = useRevisionedState<SectionEditorDraft>(initialSectionEditorDraft(section));
  const draft = draftRevision.value;
  const [markerTypePicker, setMarkerTypePicker] = useState<MarkerKind | null>(null);
  const componentBlocks = useMemo(() => parseDocComponentBlocks(draft.draftHtml), [draft.draftHtml]);
  const [showTextHighlightTools, setShowTextHighlightTools] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const updateDraft = (changes: Partial<SectionEditorDraft>) => {
    draftRevision.setValue((current) => ({ ...current, ...changes }));
  };
  const addMediaAsset = (asset: MediaAsset) => {
    setMediaAssets([asset, ...mediaAssets.filter((item) => item.id !== asset.id)]);
  };
  const applyMediaAssetToDraft = (asset: MediaAsset) => {
    updateDraft({
      imageUrl: asset.src,
      markerLabel: draft.markerLabel || asset.alt,
    });
    setMediaAssets(upsertMediaAssetUsage(mediaAssets, asset.id, mediaUsageLabel));
  };
  const updateComponentBlocks = (blocks: DocComponentBlock[]) => {
    const sourceHtml = editableTextToHtml(draft.draftText, draft.draftHtml);
    const nextHtml = writeDocComponentBlocks(sourceHtml, blocks);
    updateDraft({ draftHtml: nextHtml, draftText: htmlToEditableText(nextHtml) });
  };
  const applyTextTool = (tool: TextTool) => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    replaceTextareaSelection(
      textarea,
      draft.draftText,
      (nextText) => updateDraft({ draftText: nextText }),
      tool.sample,
      (selected) => formatTextSelection(tool, selected),
    );
  };
  const applyHighlightPreset = (preset: HighlightPreset) => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    replaceTextareaSelection(
      textarea,
      draft.draftText,
      (nextText) => updateDraft({ draftText: nextText }),
      preset.sample,
      (selected) => formatHighlightSelection(preset.id, selected),
    );
    setShowTextHighlightTools(false);
  };
  const updateTextSelectionState = () => {
    const textarea = textAreaRef.current;
    setShowTextHighlightTools(Boolean(textarea && textarea.selectionStart !== textarea.selectionEnd));
  };
  const markerDraft = useMemo(() => markerDraftFromSectionEditor(draft), [draft]);
  const sectionMarkerLabelLimit = draft.markerKind === 'link' || draft.markerKind === 'pointer' ? 3 : 16;
  const defaultSectionTarget = sectionTargets[0] ? `#${sectionTargets[0].id}` : MARKER_DEFAULT_POINTER_TARGET;
  const [storedMarkerColorPresets, setMarkerColorPresets] = useStoredState<MarkerColorPreset[]>('cms_marker_color_presets_v1', MARKER_COLOR_PRESETS_DEFAULT);
  const markerColorPresets = useMemo(() => normalizeMarkerColorPresets(storedMarkerColorPresets), [storedMarkerColorPresets]);
  const draftTargetMode = markerTargetMode(draft.markerTargetSectionId);
  const draftSectionTargetId = markerSectionTargetId(draft.markerTargetSectionId);
  const hasDraftSectionTarget = sectionTargets.some((option) => option.id === draftSectionTargetId);

  useEffect(() => {
    const normalized = normalizeMarkerColorPresets(storedMarkerColorPresets);
    if (markerColorPresetListEqual(storedMarkerColorPresets, normalized)) return;
    setMarkerColorPresets(normalized);
  }, [setMarkerColorPresets, storedMarkerColorPresets]);
  const setMarkerType = (kind: MarkerKind) => {
    const pointerSize = clampBetween(
      Math.min(draft.markerW, draft.markerH),
      MIN_MARKER_SIZE,
      Math.min(100 - draft.markerX, 100 - draft.markerY),
    );
    updateDraft({
      markerKind: kind,
      markerLabel: markerLabelFromDraft(draft.markerLabel, kind, 1),
      markerAlign: kind === 'shape' ? draft.markerAlign : 'center',
      markerAnimated: kind === 'shape' ? false : (draft.markerKind === 'shape' ? true : draft.markerAnimated),
      markerTargetSectionId: kind === 'shape' ? MARKER_DEFAULT_POINTER_TARGET : (draft.markerTargetSectionId || defaultSectionTarget || MARKER_DEFAULT_POINTER_TARGET),
      markerBackgroundOpacity: kind === 'shape'
        ? (draft.markerKind === 'shape'
          ? normalizeMarkerOpacity(draft.markerBackgroundOpacity, MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY)
          : MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY)
        : (draft.markerKind === 'shape'
          ? MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY
          : normalizeMarkerOpacity(draft.markerBackgroundOpacity, MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY)),
      ...(kind === 'pointer' ? { markerW: pointerSize, markerH: pointerSize } : {}),
      markerPointerRotation: kind === 'pointer' ? normalizePointerRotation(draft.markerPointerRotation) : MARKER_DEFAULT_POINTER_ROTATION,
      markerPointerThickness: kind === 'pointer' ? normalizePointerThickness(draft.markerPointerThickness) : MARKER_DEFAULT_POINTER_THICKNESS,
    });
    setMarkerTypePicker(null);
  };
  const insertAnnotatedImage = () => {
    const marker = markerDraftFromSectionEditor(draft);
    const block = annotatedImageMarkup({
      src: draft.imageUrl,
      alt: marker.label || 'Annotated documentation image',
      markers: [marker],
    });
    const nextHtml = insertBeforeSectionClose(editableTextToHtml(draft.draftText, draft.draftHtml), block);
    updateDraft({
      mode: 'text',
      draftHtml: nextHtml,
      draftText: htmlToEditableText(nextHtml),
    });
  };
  const draftMarkerColorKey = markerColorPresetKey({
    borderColor: draft.markerBorderColor,
    borderOpacity: draft.markerBorderOpacity,
    backgroundColor: draft.markerBackgroundColor,
    backgroundOpacity: draft.markerBackgroundOpacity,
    textColor: draft.markerTextColor,
    textOpacity: draft.markerTextOpacity,
  });
  const saveDraftMarkerColorPreset = () => {
    const preset: MarkerColorPreset = {
      id: `custom-${Date.now()}`,
      name: `Preset ${markerColorPresets.filter((item) => !item.locked).length + 1}`,
      borderColor: draft.markerBorderColor,
      borderOpacity: normalizeMarkerOpacity(draft.markerBorderOpacity, MARKER_DEFAULT_BORDER_OPACITY),
      backgroundColor: draft.markerBackgroundColor,
      backgroundOpacity: normalizeMarkerOpacity(draft.markerBackgroundOpacity, draft.markerKind === 'shape' ? MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY : MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY),
      textColor: draft.markerTextColor,
      textOpacity: normalizeMarkerOpacity(draft.markerTextOpacity, MARKER_DEFAULT_TEXT_OPACITY),
    };
    if (markerColorPresets.some((item) => markerColorPresetKey(item) === draftMarkerColorKey)) return;
    const locked = markerColorPresets.filter((item) => item.locked);
    const custom = [...markerColorPresets.filter((item) => !item.locked), preset].slice(-(MARKER_COLOR_PRESET_LIMIT - locked.length));
    setMarkerColorPresets([...locked, ...custom]);
  };
  const applyDraftMarkerColorPreset = (preset: MarkerColorPreset) => {
    updateDraft({
      markerBorderColor: preset.borderColor,
      markerBorderOpacity: normalizeMarkerOpacity(preset.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY),
      markerBackgroundColor: preset.backgroundColor,
      markerBackgroundOpacity: normalizeMarkerOpacity(preset.backgroundOpacity, draft.markerKind === 'shape' ? MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY : MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY),
      markerTextColor: preset.textColor,
      markerTextOpacity: normalizeMarkerOpacity(preset.textOpacity, MARKER_DEFAULT_TEXT_OPACITY),
    });
  };
  const removeDraftMarkerColorPreset = (id: string) => {
    const preset = markerColorPresets.find((item) => item.id === id);
    if (!preset || preset.locked) return;
    setMarkerColorPresets(markerColorPresets.filter((item) => item.id !== id));
  };
  // Every save path (form submit, ✓ Update/Publish, ◌ Save Draft) must read
  // the LIVE draft — saving the stale `section` prop silently discards edits.
  const composeSectionFromDraft = (): SectionEntry => {
    const title = draft.title.trim() || section.title;
    const rawContent = editableTextToHtml(draft.draftText, draft.draftHtml);
    const html = syncSectionTitle(rawContent, title);
    return {
      ...section,
      title,
      slug: draft.slug.trim() || makeSlug(title),
      summary: getSectionSummary(html, 0),
      status: draft.status,
      owner: draft.owner.trim() || section.owner,
      reviewer: draft.reviewer.trim() || draft.owner.trim() || section.owner,
      comments: draft.reviewComment.trim() ? [
        ...(section.comments || []),
        nextContentComment(draft.owner.trim() || section.owner, draft.reviewComment, `${section.number} ${title}`),
      ] : section.comments,
      updatedAt: today(),
      html,
    };
  };

  return (
    <form data-cms-section-id={section.id} className={`cms-section-block editing ${selected ? 'selected' : ''} ${dragging ? 'dragging' : ''}`} onMouseDown={selectSection} onFocus={selectSection} onDragOver={dragOverSection} onDrop={dropSection} onSubmit={(event) => {
      event.preventDefault();
      save(composeSectionFromDraft());
    }}>
      {reorderMode ? <SectionReorderCard section={section} dragging={dragging} dropPosition={dropPosition} /> : null}
      <SectionControllerBar
        section={section}
        selected={selected}
        editing
        editSection={() => undefined}
        publishOrUpdate={() => publishOrUpdate(composeSectionFromDraft())}
        saveAsDraft={() => saveAsDraft(composeSectionFromDraft())}
        duplicateSection={duplicateSection}
        deleteSection={deleteSection}
        beginPointerDrag={beginPointerDrag}
      />
      <div className="cms-section-edit-banner">
        <div>
          <div className="cms-section-num">{section.number}</div>
          <h2>Edit What Users See</h2>
        </div>
        <Select name="status" label="Status" value={draft.status} options={WORKFLOW_STATUSES} onChange={(status) => updateDraft({ status: status as WorkflowStatus })} />
      </div>
      <div className="review-workflow-panel">
        <label className="field"><span>Reviewer</span><input value={draft.reviewer} onChange={(event) => updateDraft({ reviewer: event.target.value })} /></label>
        <label className="field wide"><span>Scoped comment</span><textarea value={draft.reviewComment} onChange={(event) => updateDraft({ reviewComment: event.target.value })} placeholder="Leave a review note tied to this section." /></label>
        {section.comments?.length ? (
          <div className="content-comment-list wide">
            {section.comments.slice(-3).map((comment) => <div key={comment.id}><strong>{comment.author}</strong><span>{comment.body}</span><em>{comment.scope} · {comment.createdAt}</em></div>)}
          </div>
        ) : null}
      </div>
      <div className="cms-section-local-history">
        <RevisionButtons
          undo={draftRevision.undo}
          redo={draftRevision.redo}
          canUndo={draftRevision.canUndo}
          canRedo={draftRevision.canRedo}
          label={`${section.title} edit history`}
        />
      </div>
      <div className="cms-section-edit-grid">
        <label className="field wide"><span>Title</span><input name="title" value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} required /></label>
        <label className="field"><span>Slug</span><input name="slug" value={draft.slug} onChange={(event) => updateDraft({ slug: event.target.value })} required /></label>
        <label className="field"><span>Owner</span><input name="owner" value={draft.owner} onChange={(event) => updateDraft({ owner: event.target.value })} required /></label>
        <label className="field wide">
          <span>Text Editor</span>
          <div className="text-toolbar" aria-label="Text styling tools">
            {TEXT_TOOLS.map((tool) => <button key={tool.id} type="button" title={tool.label} aria-label={tool.label} onClick={() => applyTextTool(tool)}>{tool.icon}</button>)}
            {showTextHighlightTools ? <HighlightPalette applyHighlight={applyHighlightPreset} /> : null}
          </div>
          <textarea
            ref={textAreaRef}
            className="text-editor"
            name="textContent"
            value={draft.draftText}
            onChange={(event) => updateDraft({ draftText: event.target.value })}
            onKeyUp={updateTextSelectionState}
            onMouseUp={updateTextSelectionState}
            onSelect={updateTextSelectionState}
            required
          />
          <small>Paragraphs are separated by blank lines. Figures, tables, and managed components are preserved as visual editor items.</small>
        </label>
        <DocComponentBuilder
          blocks={componentBlocks}
          updateBlocks={updateComponentBlocks}
          mediaAssets={mediaAssets}
          setMediaAssets={setMediaAssets}
          mediaUsageRefs={mediaUsageRefs}
          mediaUsageLabel={mediaUsageLabel}
        />
        <div className="image-marker-tool wide">
          <div>
            <span className="tool-kicker">Image Annotation</span>
            <h3>Add annotated screenshot</h3>
            <p>Insert an image with customizable markers. Use shape, link, or pointer markers and style each one directly before inserting.</p>
          </div>
          <div className="marker-form">
            <label className="field wide"><span>Image URL</span><input value={draft.imageUrl} onChange={(event) => updateDraft({ imageUrl: event.target.value })} /></label>
            <MediaLibraryPicker
              assets={mediaAssets}
              usageRefs={mediaUsageRefs}
              selectedSrc={draft.imageUrl}
              usageLabel={mediaUsageLabel}
              addAsset={addMediaAsset}
              selectAsset={applyMediaAssetToDraft}
            />
            <label className="field wide"><span>{draft.markerKind === 'link' || draft.markerKind === 'pointer' ? 'Marker content' : 'Marker label'}</span><input value={draft.markerLabel} onChange={(event) => updateDraft({ markerLabel: event.target.value })} onBlur={() => updateDraft({ markerLabel: normalizeMarkerWords(draft.markerLabel, sectionMarkerLabelLimit) })} placeholder={draft.markerKind === 'link' ? MARKER_DEFAULT_LINK_LABEL : draft.markerKind === 'pointer' ? 'Pointer 1' : 'Marker 1'} /></label>
            <label className="field wide"><span>Marker description</span><textarea value={draft.markerDescription} onChange={(event) => updateDraft({ markerDescription: event.target.value })} placeholder="Explain the marked item below the figure" /></label>
            <div className="field wide cms-marker-kind-picker-field">
              <span>Type</span>
              <div className="cms-marker-kind-control">
                <button className="btn btn-sm" type="button" onClick={() => setMarkerTypePicker('shape')}>Add marker</button>
              </div>
            </div>
            {draft.markerKind === 'shape' ? (
              <label className="field wide">
                <span>Line style</span>
                <div className="cms-marker-border-control" role="group" aria-label="Marker line style">
                  {MARKER_BORDER_STYLES.map((style) => (
                    <button
                      className={draft.markerBorderStyle === style ? 'active' : ''}
                      key={style}
                      type="button"
                      onClick={() => updateDraft({ markerBorderStyle: style })}
                      aria-pressed={draft.markerBorderStyle === style}
                    >
                      {MARKER_BORDER_STYLE_LABELS[style]}
                    </button>
                  ))}
                </div>
              </label>
            ) : null}
            <div className="field wide">
              <span>Style preview</span>
              {draft.markerKind === 'shape' ? (
                <div className="cms-marker-style-preview" aria-hidden="true">
                  <div
                    className="cms-marker-style-preview-chip"
                    style={{
                      border: `3px ${draft.markerBorderStyle} ${hexToRgba(draft.markerBorderColor, markerOpacityAlpha(draft.markerBorderOpacity, MARKER_DEFAULT_BORDER_OPACITY))}`,
                      background: hexToRgba(
                        draft.markerBackgroundColor,
                        markerOpacityAlpha(draft.markerBackgroundOpacity, MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY),
                      ),
                      color: hexToRgba(draft.markerTextColor, markerOpacityAlpha(draft.markerTextOpacity, MARKER_DEFAULT_TEXT_OPACITY)),
                      borderRadius: '8px',
                    }}
                  >
                    {draft.markerLabel.trim() || 'Marker 1'}
                  </div>
                </div>
              ) : (
                <div className="cms-hotspot-style-preview" aria-hidden="true">
                  <span
                    className={`doc-marker marker-${draft.markerKind} cms-hotspot-style-preview-anchor`}
                    style={markerElementStyle({ ...markerDraft, x: 0, y: 0, w: 9, h: 9 })}
                  >
                    <span className="doc-marker-wave wave-a" />
                    <span className="doc-marker-wave wave-b" />
                    <span className="doc-marker-wave wave-c" />
                    <span className="doc-marker-core-glow" />
                    {draft.markerKind === 'pointer' ? <span className="doc-marker-pointer-icon" aria-hidden="true" /> : null}
                    <b className="doc-marker-chip">{markerLabel(markerDraft, 1)}</b>
                  </span>
                  <span
                    className="doc-marker-popover cms-hotspot-style-preview-popover"
                    style={markerPopoverStyle({ ...markerDraft, popoverX: 0, popoverY: 0 })}
                  >
                    <span className="doc-marker-popover-text">{normalizeInlineEditableValue(draft.markerDescription) || 'Marker info dialog preview'}</span>
                    <span className="doc-marker-popover-cta">{markerLabel(markerDraft, 1)}</span>
                  </span>
                </div>
              )}
            </div>
            <div className="field wide">
              <div className="cms-marker-preset-head">
                <span>Color presets</span>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={saveDraftMarkerColorPreset}
                  disabled={markerColorPresets.some((item) => markerColorPresetKey(item) === draftMarkerColorKey)}
                >
                  Save current
                </button>
              </div>
              <div className="cms-marker-preset-list" role="list" aria-label="Saved marker color presets">
                {markerColorPresets.map((preset) => {
                  const active = markerColorPresetKey(preset) === draftMarkerColorKey;
                  return (
                    <div className={`cms-marker-preset-item ${active ? 'active' : ''}`} key={preset.id} role="listitem">
                      <button
                        className="cms-marker-preset-apply"
                        type="button"
                        onClick={() => applyDraftMarkerColorPreset(preset)}
                        aria-pressed={active}
                        title={`Apply ${preset.name} colors`}
                      >
                        <span className="cms-marker-preset-swatch" aria-hidden="true">
                          <i style={{ background: hexToRgba(preset.borderColor, markerOpacityAlpha(preset.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY)) }} />
                          <i style={{ background: hexToRgba(preset.backgroundColor, markerOpacityAlpha(preset.backgroundOpacity, MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY)) }} />
                          <i style={{ background: hexToRgba(preset.textColor, markerOpacityAlpha(preset.textOpacity, MARKER_DEFAULT_TEXT_OPACITY)) }} />
                        </span>
                        <small>{preset.name}</small>
                      </button>
                      {!preset.locked ? (
                        <button className="cms-marker-preset-remove" type="button" onClick={() => removeDraftMarkerColorPreset(preset.id)} aria-label={`Delete ${preset.name} preset`}>
                          ×
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <label className="field cms-marker-color-field">
              <span>{draft.markerKind === 'shape' ? 'Border color' : 'Ring color'}</span>
              <div className="cms-marker-color-control">
                <input type="color" value={draft.markerBorderColor} onChange={(event) => updateDraft({ markerBorderColor: event.target.value })} aria-label="Marker border color" />
                <div className="cms-marker-color-meta">
                  <code>{draft.markerBorderColor.toUpperCase()}</code>
                  <label className="cms-marker-alpha-control">
                    <span>A {normalizeMarkerOpacity(draft.markerBorderOpacity, MARKER_DEFAULT_BORDER_OPACITY)}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={normalizeMarkerOpacity(draft.markerBorderOpacity, MARKER_DEFAULT_BORDER_OPACITY)}
                      onChange={(event) => updateDraft({ markerBorderOpacity: normalizeMarkerOpacity(event.target.value, MARKER_DEFAULT_BORDER_OPACITY) })}
                      aria-label="Marker border opacity"
                    />
                  </label>
                </div>
              </div>
            </label>
            <label className="field cms-marker-color-field">
              <span>{draft.markerKind === 'shape' ? 'Background color' : 'Marker color'}</span>
              <div className="cms-marker-color-control">
                <input
                  type="color"
                  value={draft.markerBackgroundColor}
                  onChange={(event) => updateDraft({ markerBackgroundColor: event.target.value })}
                  aria-label="Marker background color"
                />
                <div className="cms-marker-color-meta">
                  <code>{draft.markerBackgroundColor.toUpperCase()}</code>
                  <label className="cms-marker-alpha-control">
                    <span>A {normalizeMarkerOpacity(draft.markerBackgroundOpacity, draft.markerKind === 'shape' ? MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY : MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY)}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={normalizeMarkerOpacity(draft.markerBackgroundOpacity, draft.markerKind === 'shape' ? MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY : MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY)}
                      onChange={(event) => updateDraft({
                        markerBackgroundOpacity: normalizeMarkerOpacity(
                          event.target.value,
                          draft.markerKind === 'shape' ? MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY : MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY,
                        ),
                      })}
                      aria-label="Marker background opacity"
                    />
                  </label>
                </div>
              </div>
            </label>
            {draft.markerKind !== 'shape' ? (
              <>
                <div className="field wide">
                  <span>Destination</span>
                  <div className="cms-marker-target-control" role="group" aria-label="Marker destination type">
                    <button
                      className={draftTargetMode === 'section' ? 'active' : ''}
                      type="button"
                      onClick={() => updateDraft({ markerTargetSectionId: defaultSectionTarget || '#target-section' })}
                      aria-pressed={draftTargetMode === 'section'}
                    >
                      Section
                    </button>
                    <button
                      className={draftTargetMode === 'external' ? 'active' : ''}
                      type="button"
                      onClick={() => updateDraft({ markerTargetSectionId: markerTargetMode(draft.markerTargetSectionId) === 'external' ? draft.markerTargetSectionId : 'https://' })}
                      aria-pressed={draftTargetMode === 'external'}
                    >
                      External
                    </button>
                  </div>
                </div>
                {draftTargetMode === 'section' ? (
                  sectionTargets.length ? (
                    <label className="field wide">
                      <span>Target section</span>
                      <select
                        value={draftSectionTargetId || sectionTargets[0].id}
                        onChange={(event) => updateDraft({ markerTargetSectionId: `#${event.target.value}` })}
                      >
                        {!hasDraftSectionTarget && draftSectionTargetId ? <option value={draftSectionTargetId}>{draftSectionTargetId}</option> : null}
                        {sectionTargets.map((target) => (
                          <option key={target.id} value={target.id}>{target.label}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="field wide">
                      <span>Target section id</span>
                      <input value={draft.markerTargetSectionId} onChange={(event) => updateDraft({ markerTargetSectionId: event.target.value })} placeholder="#target-section" />
                    </label>
                  )
                ) : (
                  <label className="field wide">
                    <span>External URL</span>
                    <input value={draft.markerTargetSectionId} onChange={(event) => updateDraft({ markerTargetSectionId: event.target.value })} placeholder="https://example.com/details" />
                  </label>
                )}
                {draft.markerKind === 'pointer' ? (
                  <>
                    <label className="field">
                      <span>Arrow Weight</span>
                      <input
                        type="number"
                        min="1"
                        max="6"
                        step="0.5"
                        value={normalizePointerThickness(draft.markerPointerThickness)}
                        onChange={(event) => updateDraft({ markerPointerThickness: normalizePointerThickness(event.target.value) })}
                      />
                    </label>
                    <div className="field wide cms-marker-align-field">
                      <span>Quick Direction</span>
                      <div className="cms-marker-align-control" role="group" aria-label="Pointer direction">
                        {[{ label: 'Right', value: 0 }, { label: 'Down', value: 90 }, { label: 'Left', value: 180 }, { label: 'Up', value: 270 }].map((direction) => (
                          <button
                            key={`draft-dir-${direction.value}`}
                            type="button"
                            className={Math.round(normalizePointerRotation(draft.markerPointerRotation)) === direction.value ? 'active' : ''}
                            onClick={() => updateDraft({ markerPointerRotation: direction.value })}
                            aria-pressed={Math.round(normalizePointerRotation(draft.markerPointerRotation)) === direction.value}
                          >
                            {direction.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="cms-pointer-rotate-hint">Rotate by dragging the corner dots directly on the marker.</p>
                  </>
                ) : null}
              </>
            ) : null}
            <label className="field cms-marker-color-field">
              <span>Text color</span>
              <div className="cms-marker-color-control">
                <input type="color" value={draft.markerTextColor} onChange={(event) => updateDraft({ markerTextColor: event.target.value })} aria-label="Marker text color" />
                <div className="cms-marker-color-meta">
                  <code>{draft.markerTextColor.toUpperCase()}</code>
                  <label className="cms-marker-alpha-control">
                    <span>A {normalizeMarkerOpacity(draft.markerTextOpacity, MARKER_DEFAULT_TEXT_OPACITY)}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={normalizeMarkerOpacity(draft.markerTextOpacity, MARKER_DEFAULT_TEXT_OPACITY)}
                      onChange={(event) => updateDraft({ markerTextOpacity: normalizeMarkerOpacity(event.target.value, MARKER_DEFAULT_TEXT_OPACITY) })}
                      aria-label="Marker text opacity"
                    />
                  </label>
                </div>
              </div>
            </label>
            {draft.markerKind !== 'shape' ? (
              <label className="field">
                <span>Pulse animation</span>
                <button className={`cms-marker-toggle ${draft.markerAnimated ? 'active' : ''}`} type="button" onClick={() => updateDraft({ markerAnimated: !draft.markerAnimated })}>
                  {draft.markerAnimated ? 'On' : 'Off'}
                </button>
              </label>
            ) : null}
            <label className="field"><span>X %</span><input type="number" min="0" max="100" value={draft.markerX} onChange={(event) => updateDraft({ markerX: Number(event.target.value) })} aria-label="Marker horizontal position percent" /></label>
            <label className="field"><span>Y %</span><input type="number" min="0" max="100" value={draft.markerY} onChange={(event) => updateDraft({ markerY: Number(event.target.value) })} aria-label="Marker vertical position percent" /></label>
            <label className="field"><span>Width %</span><input type="number" min={MIN_MARKER_SIZE} max="100" value={draft.markerW} onChange={(event) => updateDraft({ markerW: Number(event.target.value) })} aria-label="Marker width percent" /></label>
            <label className="field"><span>Height %</span><input type="number" min={MIN_MARKER_SIZE} max="100" value={draft.markerH} onChange={(event) => updateDraft({ markerH: Number(event.target.value) })} aria-label="Marker height percent" /></label>
            {draft.markerKind === 'shape' ? (
              <div className="field wide cms-marker-align-field">
                <span>Text Align</span>
                <div className="cms-marker-align-control" role="group" aria-label="Marker text alignment">
                  {MARKER_TEXT_ALIGNMENTS.map((align) => (
                    <button
                      className={draft.markerAlign === align ? 'active' : ''}
                      key={align}
                      type="button"
                      onClick={() => updateDraft({ markerAlign: align })}
                      aria-pressed={draft.markerAlign === align}
                    >
                      {MARKER_TEXT_ALIGN_LABELS[align]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="annotation-preview">
            <img src={draft.imageUrl} alt="" />
            <span
              className={`doc-marker marker-${draft.markerKind}`}
              data-kind={draft.markerKind}
              data-label-align={draft.markerKind === 'shape' ? draft.markerAlign : 'center'}
              role={draft.markerKind === 'shape' ? undefined : 'button'}
              tabIndex={draft.markerKind === 'shape' ? undefined : 0}
              aria-expanded={draft.markerKind === 'shape' ? undefined : false}
              style={markerElementStyle(markerDraft)}
            >
              {draft.markerKind !== 'shape' ? (
                <>
                  <span className="doc-marker-wave wave-a" aria-hidden="true" />
                  <span className="doc-marker-wave wave-b" aria-hidden="true" />
                  <span className="doc-marker-wave wave-c" aria-hidden="true" />
                  <span className="doc-marker-core-glow" aria-hidden="true" />
                  {draft.markerKind === 'pointer' ? <span className="doc-marker-pointer-icon" aria-hidden="true" /> : null}
                </>
              ) : null}
              <b className="doc-marker-chip">{markerLabel(markerDraft, 1)}</b>
              {draft.markerKind !== 'shape' ? (
                <span className="doc-marker-popover" role="dialog" aria-live="polite">
                  <span className="doc-marker-popover-text">{draft.markerDescription.trim() || 'Open this hotspot for detailed guidance.'}</span>
                  {markerHref(markerDraft) ? (
                    <a
                      className="doc-marker-popover-cta"
                      href={markerHref(markerDraft) || '#'}
                      target={markerTargetMode(markerDraft.targetSectionId) === 'external' ? '_blank' : undefined}
                      rel={markerTargetMode(markerDraft.targetSectionId) === 'external' ? 'noopener noreferrer' : undefined}
                    >
                      {markerLabel(markerDraft, 1)}
                    </a>
                  ) : null}
                </span>
              ) : null}
            </span>
          </div>
          {draft.markerDescription.trim() ? (
            <div className="marker-description-list cms-marker-description-preview">
              <div className="marker-description" data-marker-description-index="1">
                <strong>{markerLabel(markerDraft, 1)}</strong>
                <p>{draft.markerDescription}</p>
              </div>
            </div>
          ) : null}
          {markerTypePicker ? (
            <div className="cms-marker-type-modal" role="presentation">
              <div className="cms-marker-type-card">
                <strong>Choose marker type</strong>
                <div className="cms-marker-type-options">
                  {MARKER_KINDS.map((kind) => (
                    <button className="btn" type="button" key={kind} onClick={() => setMarkerType(kind)}>
                      {MARKER_KINDS_LABELS[kind]}
                    </button>
                  ))}
                </div>
                <div className="form-actions">
                  <button className="btn btn-sm" type="button" onClick={() => setMarkerTypePicker(null)}>Cancel</button>
                </div>
              </div>
            </div>
          ) : null}
          <button className="btn btn-red" type="button" onClick={insertAnnotatedImage}>Insert Annotated Image</button>
        </div>
      </div>
      <div className="form-actions">
        <button className="btn" type="button" onClick={cancel}>Cancel</button>
        <button className="btn btn-red" type="submit">Save Section</button>
      </div>
    </form>
  );
}

function MediaLibraryPicker({ assets, usageRefs, selectedSrc, usageLabel, addAsset, selectAsset }: {
  assets: MediaAsset[];
  usageRefs: Record<string, string[]>;
  selectedSrc: string;
  usageLabel: string;
  addAsset: (asset: MediaAsset) => void;
  selectAsset: (asset: MediaAsset) => void;
}) {
  const imageAssets = useMemo(() => assets.filter((asset) => isImageAsset(asset)), [assets]);
  const [alt, setAlt] = useState('');
  const [tags, setTags] = useState('');
  const [owner, setOwner] = useState('Docs');
  const [uploadError, setUploadError] = useState('');
  const handleUpload = async (event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const looksLikeImage = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name || '');
    if (!looksLikeImage) {
      setUploadError('Choose an image file.');
      return;
    }
    try {
      const [uploaded] = await uploadMediaFilesToServer([file]);
      if (!uploaded) throw new Error('Upload failed.');
      const asset: MediaAsset = {
        id: uploaded.id,
        src: uploaded.src,
        fileName: uploaded.fileName,
        originalName: uploaded.originalName,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        createdAt: uploaded.createdAt,
        alt: alt.trim() || uploaded.originalName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
        tags: splitMediaTags(tags || file.name),
        owner: owner.trim() || 'Docs',
        updatedAt: today(),
        usageRefs: usageLabel ? [usageLabel] : [],
      };
      addAsset(asset);
      selectAsset(asset);
      setUploadError('');
      input.value = '';
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not upload image file.');
    }
  };

  return (
    <section className="media-library-panel wide" aria-label="Media library">
      <div className="media-library-head">
        <div>
          <span className="tool-kicker">Media Library</span>
          <strong>Select or upload an image asset</strong>
        </div>
        <span>{imageAssets.length} images</span>
      </div>
      <div className="media-upload-grid">
        <label className="field"><span>Alt text</span><input value={alt} onChange={(event) => setAlt(event.target.value)} placeholder="Describe the uploaded image" /></label>
        <label className="field"><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="manual, lobby, settings" /></label>
        <label className="field"><span>Owner</span><input value={owner} onChange={(event) => setOwner(event.target.value)} /></label>
        <label className="field media-upload-input"><span>Upload image</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={handleUpload} /></label>
      </div>
      {uploadError ? <p className="media-library-error">{uploadError}</p> : null}
      <div className="media-asset-grid">
        {imageAssets.map((asset) => {
          const refs = Array.from(new Set([...(asset.usageRefs || []), ...(usageRefs[asset.id] || [])])).filter(Boolean);
          return (
            <button
              className={`media-asset-card ${asset.src === selectedSrc ? 'active' : ''}`}
              key={asset.id}
              type="button"
              onClick={() => selectAsset(asset)}
            >
              <img src={asset.src} alt="" />
              <span>{asset.alt}</span>
              <small>{asset.owner} · {asset.updatedAt}</small>
              <em>{asset.tags.join(', ') || 'untagged'}</em>
              <i>{refs.length ? refs.slice(0, 2).join(' · ') : 'No usage references yet'}</i>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DocComponentBuilder({
  blocks,
  updateBlocks,
  mediaAssets,
  setMediaAssets,
  mediaUsageRefs,
  mediaUsageLabel,
}: {
  blocks: DocComponentBlock[];
  updateBlocks: (blocks: DocComponentBlock[]) => void;
  mediaAssets: MediaAsset[];
  setMediaAssets: (items: MediaAsset[]) => void;
  mediaUsageRefs: Record<string, string[]>;
  mediaUsageLabel: string;
}) {
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const blockIssues = validateDocComponentBlocks(blocks);
  const updateBlock = (id: string, updater: (block: DocComponentBlock) => DocComponentBlock) => {
    updateBlocks(blocks.map((block) => (block.id === id ? updater(block) : block)));
  };
  const addBlock = (kind: DocComponentKind) => {
    updateBlocks([...blocks, newDocComponentBlock(kind, blocks)]);
  };
  const duplicateBlock = (block: DocComponentBlock) => {
    const index = blocks.findIndex((item) => item.id === block.id);
    const duplicate = duplicateDocComponentBlock(block, blocks);
    updateBlocks([...blocks.slice(0, index + 1), duplicate, ...blocks.slice(index + 1)]);
  };
  const deleteBlock = (id: string) => {
    updateBlocks(blocks.filter((block) => block.id !== id));
  };
  const moveBlock = (id: string, direction: -1 | 1) => {
    const index = blocks.findIndex((block) => block.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return;
    const nextBlocks = [...blocks];
    const [block] = nextBlocks.splice(index, 1);
    nextBlocks.splice(nextIndex, 0, block);
    updateBlocks(nextBlocks);
  };
  const beginBlockDrag = (event: ReactDragEvent<HTMLElement>, id: string) => {
    setDraggingBlockId(id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-doc-component-block', id);
  };
  const dropBlock = (event: ReactDragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('application/x-doc-component-block');
    setDraggingBlockId(null);
    if (!sourceId || sourceId === targetId) return;
    updateBlocks(moveById(blocks, sourceId, targetId));
  };

  return (
    <section className="component-builder wide" aria-label="Managed content components">
      <div className="component-builder-head">
        <div>
          <span className="tool-kicker">Component Builder</span>
          <h3>Reusable UI blocks</h3>
          <p>Add accordions, tabs, lists, tables, region cards, callouts, and step flows directly inside this section.</p>
        </div>
        <div className="component-type-grid" aria-label="Add component">
          {DOC_COMPONENT_TYPES.map((type) => (
            <button key={type.kind} type="button" onClick={() => addBlock(type.kind)}>
              + {type.label}
            </button>
          ))}
        </div>
      </div>
      <ValidationList issues={blockIssues} />
      {blocks.length ? (
        <div className="component-block-list">
          {blocks.map((block, index) => (
            <article
              className={`component-card ${draggingBlockId === block.id ? 'dragging' : ''}`}
              key={block.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => dropBlock(event, block.id)}
            >
              <div className="component-card-head">
                <button
                  aria-label={`Drag ${componentKindLabel(block.kind)}`}
                  className="component-drag-handle"
                  draggable
                  type="button"
                  onDragEnd={() => setDraggingBlockId(null)}
                  onDragStart={(event) => beginBlockDrag(event, block.id)}
                >
                  Drag
                </button>
                <div>
                  <span>{componentKindLabel(block.kind)}</span>
                  <strong>{block.title || componentKindLabel(block.kind)}</strong>
                </div>
                <div className="component-row-actions">
                  <button type="button" onClick={() => moveBlock(block.id, -1)} disabled={index === 0}>Up</button>
                  <button type="button" onClick={() => moveBlock(block.id, 1)} disabled={index === blocks.length - 1}>Down</button>
                  <button type="button" onClick={() => duplicateBlock(block)}>Duplicate</button>
                  <button className="danger-icon" type="button" onClick={() => deleteBlock(block.id)} aria-label={`Delete ${componentKindLabel(block.kind)}`}><span className="trash-icon" aria-hidden="true" /></button>
                </div>
              </div>
              <div className="component-card-grid">
                <label className="field wide">
                  <span>Title</span>
                  <input value={block.title} onChange={(event) => updateBlock(block.id, (current) => ({ ...current, title: event.target.value }))} />
                </label>
                <DocComponentFields
                  block={block}
                  updateBlock={updateBlock}
                  mediaAssets={mediaAssets}
                  setMediaAssets={setMediaAssets}
                  mediaUsageRefs={mediaUsageRefs}
                  mediaUsageLabel={mediaUsageLabel}
                />
              </div>
              <div className="component-preview-shell">
                <span>Live Preview</span>
                <DocComponentLivePreview html={docComponentMarkup(block)} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="component-empty">
          <strong>No managed components yet</strong>
          <p>Choose a block type above to add structured content that can be edited, duplicated, deleted, and reordered.</p>
        </div>
      )}
    </section>
  );
}

function DocComponentLivePreview({ html }: { html: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return attachDocCarouselInteractions(root);
  }, [html]);

  return <div ref={rootRef} className="component-live-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}

function DocComponentFields({
  block,
  updateBlock,
  mediaAssets,
  setMediaAssets,
  mediaUsageRefs,
  mediaUsageLabel,
}: {
  block: DocComponentBlock;
  updateBlock: (id: string, updater: (block: DocComponentBlock) => DocComponentBlock) => void;
  mediaAssets: MediaAsset[];
  setMediaAssets: (items: MediaAsset[]) => void;
  mediaUsageRefs: Record<string, string[]>;
  mediaUsageLabel: string;
}) {
  const patchBlock = (changes: Partial<DocComponentBlock>) => updateBlock(block.id, (current) => ({ ...current, ...changes }));
  if (block.kind === 'callout') {
    return (
      <>
        <label className="field">
          <span>Style</span>
          <select value={block.variant} onChange={(event) => patchBlock({ variant: event.target.value })}>
            {DOC_COMPONENT_VARIANTS.map((variant) => <option key={variant} value={variant}>{DOC_COMPONENT_VARIANT_LABELS[variant]}</option>)}
          </select>
        </label>
        <label className="field wide">
          <span>Text</span>
          <textarea value={block.body} onChange={(event) => patchBlock({ body: event.target.value })} />
        </label>
      </>
    );
  }

  if (block.kind === 'table') {
    return <DocComponentTableEditor block={block} updateBlock={updateBlock} />;
  }

  if (block.kind === 'carousel') {
    return (
      <DocComponentCarouselEditor
        block={block}
        updateBlock={updateBlock}
        mediaAssets={mediaAssets}
        setMediaAssets={setMediaAssets}
        mediaUsageRefs={mediaUsageRefs}
        mediaUsageLabel={mediaUsageLabel}
      />
    );
  }

  return (
    <>
      {block.kind === 'list' ? (
        <label className="component-check">
          <input type="checkbox" checked={block.ordered} onChange={(event) => patchBlock({ ordered: event.target.checked })} />
          Ordered list
        </label>
      ) : null}
      <DocComponentItemsEditor block={block} updateBlock={updateBlock} />
    </>
  );
}

function DocComponentCarouselEditor({
  block,
  updateBlock,
  mediaAssets,
  setMediaAssets,
  mediaUsageRefs,
  mediaUsageLabel,
}: {
  block: DocComponentBlock;
  updateBlock: (id: string, updater: (block: DocComponentBlock) => DocComponentBlock) => void;
  mediaAssets: MediaAsset[];
  setMediaAssets: (items: MediaAsset[]) => void;
  mediaUsageRefs: Record<string, string[]>;
  mediaUsageLabel: string;
}) {
  const imageAssets = useMemo(() => mediaAssets.filter((asset) => isImageAsset(asset)), [mediaAssets]);
  const [uploadError, setUploadError] = useState('');

  const setSlideFromAsset = (itemId: string, asset: MediaAsset) => {
    updateBlock(block.id, (current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? {
        ...item,
        body: asset.src,
        title: item.title.trim() ? item.title : (asset.alt || 'Slide'),
      } : item),
    }));
  };

  const applyExistingAsset = (itemId: string, assetId: string) => {
    const asset = imageAssets.find((entry) => entry.id === assetId);
    if (!asset) return;
    setSlideFromAsset(itemId, asset);
    setMediaAssets(upsertMediaAssetUsage(mediaAssets, asset.id, mediaUsageLabel));
  };

  const uploadSlideImage = async (itemId: string, event: FormEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const looksLikeImage = file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name || '');
    if (!looksLikeImage) {
      setUploadError('Choose an image file for carousel slides.');
      return;
    }
    try {
      const [uploaded] = await uploadMediaFilesToServer([file]);
      if (!uploaded) throw new Error('Upload failed.');
      const asset: MediaAsset = {
        id: uploaded.id,
        src: uploaded.src,
        fileName: uploaded.fileName,
        originalName: uploaded.originalName,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        createdAt: uploaded.createdAt,
        alt: uploaded.originalName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
        tags: splitMediaTags(file.name),
        owner: 'Docs',
        updatedAt: today(),
        usageRefs: mediaUsageLabel ? [mediaUsageLabel] : [],
      };
      setSlideFromAsset(itemId, asset);
      const nextAssets = [asset, ...mediaAssets.filter((entry) => entry.id !== asset.id)];
      setMediaAssets(upsertMediaAssetUsage(nextAssets, asset.id, mediaUsageLabel));
      setUploadError('');
      input.value = '';
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Could not upload carousel slide.');
    }
  };

  return (
    <div className="component-items-editor wide">
      <div className="component-subhead">
        <strong>{componentItemGroupLabel(block.kind)}</strong>
        <button type="button" onClick={() => updateBlock(block.id, (current) => ({ ...current, items: [...current.items, newDocComponentItem(current.items, current.kind)] }))}>+ Add Slide</button>
      </div>
      {uploadError ? <p className="media-library-error">{uploadError}</p> : null}
      <div className="component-item-list">
        {block.items.map((item, index) => {
          const matchedAsset = imageAssets.find((asset) => asset.src === item.body);
          const refs = matchedAsset ? Array.from(new Set([...(matchedAsset.usageRefs || []), ...(mediaUsageRefs[matchedAsset.id] || [])])).filter(Boolean) : [];
          return (
            <div className="component-item-row component-carousel-row" key={item.id}>
              <div className="component-carousel-preview">
                {item.body.trim() ? <img src={item.body} alt="" /> : <div className="media-library-icon" aria-hidden="true">🖼</div>}
              </div>
              <label className="field">
                <span>Slide Caption</span>
                <input
                  value={item.title}
                  onChange={(event) => updateBlock(block.id, (current) => ({
                    ...current,
                    items: current.items.map((entry) => entry.id === item.id ? { ...entry, title: event.target.value } : entry),
                  }))}
                />
              </label>
              <label className="field">
                <span>Image URL</span>
                <input
                  value={item.body}
                  onChange={(event) => updateBlock(block.id, (current) => ({
                    ...current,
                    items: current.items.map((entry) => entry.id === item.id ? { ...entry, body: event.target.value } : entry),
                  }))}
                  placeholder="/api/docpilot/media/files/..."
                />
              </label>
              <label className="field">
                <span>Select from Media</span>
                <select value="" onChange={(event) => {
                  applyExistingAsset(item.id, event.target.value);
                  event.currentTarget.value = '';
                }}>
                  <option value="">Choose image</option>
                  {imageAssets.map((asset) => <option key={asset.id} value={asset.id}>{mediaAssetDisplayName(asset)}</option>)}
                </select>
              </label>
              <label className="field media-upload-input">
                <span>Upload Slide</span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={(event) => void uploadSlideImage(item.id, event)} />
              </label>
              <div className="component-carousel-meta">
                <small>{refs.length ? refs.slice(0, 2).join(' · ') : 'No usage references yet'}</small>
              </div>
              <div className="component-row-actions">
                <button type="button" onClick={() => updateBlock(block.id, (current) => ({ ...current, items: moveByIndex(current.items, item.id, -1) }))} disabled={index === 0}>Up</button>
                <button type="button" onClick={() => updateBlock(block.id, (current) => ({ ...current, items: moveByIndex(current.items, item.id, 1) }))} disabled={index === block.items.length - 1}>Down</button>
                <button type="button" onClick={() => updateBlock(block.id, (current) => {
                  const currentIndex = current.items.findIndex((entry) => entry.id === item.id);
                  const duplicate = { ...item, id: nextDocComponentItemId(current.items), title: `${item.title || 'Slide'} copy` };
                  return { ...current, items: [...current.items.slice(0, currentIndex + 1), duplicate, ...current.items.slice(currentIndex + 1)] };
                })}>Duplicate</button>
                <button className="danger-icon" type="button" onClick={() => updateBlock(block.id, (current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id) }))} aria-label={`Delete slide ${index + 1}`}><span className="trash-icon" aria-hidden="true" /></button>
              </div>
            </div>
          );
        })}
      </div>
      {!block.items.length ? <p className="component-empty-inline">Add at least one slide to render this carousel.</p> : null}
    </div>
  );
}

function DocComponentItemsEditor({ block, updateBlock }: { block: DocComponentBlock; updateBlock: (id: string, updater: (block: DocComponentBlock) => DocComponentBlock) => void }) {
  const titleLabel = componentItemTitleLabel(block.kind);
  const bodyLabel = componentItemBodyLabel(block.kind);
  const updateItem = (itemId: string, changes: Partial<DocComponentItem>) => {
    updateBlock(block.id, (current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? { ...item, ...changes } : item)),
    }));
  };
  const addItem = () => {
    updateBlock(block.id, (current) => ({ ...current, items: [...current.items, newDocComponentItem(current.items, current.kind)] }));
  };
  const duplicateItem = (item: DocComponentItem) => {
    updateBlock(block.id, (current) => {
      const index = current.items.findIndex((entry) => entry.id === item.id);
      const duplicate = { ...item, id: nextDocComponentItemId(current.items), title: `${item.title || titleLabel} copy` };
      return { ...current, items: [...current.items.slice(0, index + 1), duplicate, ...current.items.slice(index + 1)] };
    });
  };
  const deleteItem = (itemId: string) => {
    updateBlock(block.id, (current) => ({ ...current, items: current.items.filter((item) => item.id !== itemId) }));
  };
  const moveItem = (itemId: string, direction: -1 | 1) => {
    updateBlock(block.id, (current) => ({ ...current, items: moveByIndex(current.items, itemId, direction) }));
  };
  const beginItemDrag = (event: ReactDragEvent<HTMLElement>, itemId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-doc-component-item', `${block.id}:${itemId}`);
  };
  const dropItem = (event: ReactDragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault();
    const [sourceBlockId, sourceId] = event.dataTransfer.getData('application/x-doc-component-item').split(':');
    if (sourceBlockId !== block.id || !sourceId || sourceId === targetId) return;
    updateBlock(block.id, (current) => ({ ...current, items: moveById(current.items, sourceId, targetId) }));
  };

  return (
    <div className="component-items-editor wide">
      <div className="component-subhead">
        <strong>{componentItemGroupLabel(block.kind)}</strong>
        <button type="button" onClick={addItem}>+ Add Item</button>
      </div>
      <div className="component-item-list">
        {block.items.map((item, index) => (
          <div className="component-item-row" key={item.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropItem(event, item.id)}>
            <button className="component-drag-handle" draggable type="button" onDragStart={(event) => beginItemDrag(event, item.id)} aria-label={`Drag ${item.title || titleLabel}`}>Drag</button>
            <label className="field">
              <span>{titleLabel}</span>
              <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} />
            </label>
            <label className="field">
              <span>{bodyLabel}</span>
              <textarea value={item.body} onChange={(event) => updateItem(item.id, { body: event.target.value })} />
            </label>
            <div className="component-row-actions">
              <button type="button" onClick={() => moveItem(item.id, -1)} disabled={index === 0}>Up</button>
              <button type="button" onClick={() => moveItem(item.id, 1)} disabled={index === block.items.length - 1}>Down</button>
              <button type="button" onClick={() => duplicateItem(item)}>Duplicate</button>
              <button className="danger-icon" type="button" onClick={() => deleteItem(item.id)} aria-label={`Delete ${item.title || titleLabel}`}><span className="trash-icon" aria-hidden="true" /></button>
            </div>
          </div>
        ))}
      </div>
      {!block.items.length ? <p className="component-empty-inline">Add at least one item to make this component visible.</p> : null}
    </div>
  );
}

function DocComponentTableEditor({ block, updateBlock }: { block: DocComponentBlock; updateBlock: (id: string, updater: (block: DocComponentBlock) => DocComponentBlock) => void }) {
  const updateColumn = (columnIndex: number, value: string) => {
    updateBlock(block.id, (current) => ({
      ...current,
      columns: current.columns.map((column, index) => (index === columnIndex ? value : column)),
    }));
  };
  const addColumn = () => {
    updateBlock(block.id, (current) => ({
      ...current,
      columns: [...current.columns, `Column ${current.columns.length + 1}`],
      rows: current.rows.map((row) => ({ ...row, cells: [...row.cells, ''] })),
    }));
  };
  const deleteColumn = (columnIndex: number) => {
    updateBlock(block.id, (current) => {
      if (current.columns.length <= 1) return current;
      return {
        ...current,
        columns: current.columns.filter((_column, index) => index !== columnIndex),
        rows: current.rows.map((row) => ({ ...row, cells: row.cells.filter((_cell, index) => index !== columnIndex) })),
      };
    });
  };
  const addRow = () => {
    updateBlock(block.id, (current) => ({ ...current, rows: [...current.rows, newDocComponentTableRow(current.rows, current.columns.length)] }));
  };
  const updateCell = (rowId: string, columnIndex: number, value: string) => {
    updateBlock(block.id, (current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === rowId ? { ...row, cells: syncTableCells(row.cells, current.columns.length).map((cell, index) => (index === columnIndex ? value : cell)) } : row)),
    }));
  };
  const duplicateRow = (row: DocComponentTableRow) => {
    updateBlock(block.id, (current) => {
      const index = current.rows.findIndex((entry) => entry.id === row.id);
      const duplicate = { ...row, id: nextDocComponentRowId(current.rows), cells: syncTableCells(row.cells, current.columns.length) };
      return { ...current, rows: [...current.rows.slice(0, index + 1), duplicate, ...current.rows.slice(index + 1)] };
    });
  };
  const deleteRow = (rowId: string) => {
    updateBlock(block.id, (current) => ({ ...current, rows: current.rows.filter((row) => row.id !== rowId) }));
  };
  const moveRow = (rowId: string, direction: -1 | 1) => {
    updateBlock(block.id, (current) => ({ ...current, rows: moveByIndex(current.rows, rowId, direction) }));
  };
  const beginRowDrag = (event: ReactDragEvent<HTMLElement>, rowId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-doc-component-row', `${block.id}:${rowId}`);
  };
  const dropRow = (event: ReactDragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault();
    const [sourceBlockId, sourceId] = event.dataTransfer.getData('application/x-doc-component-row').split(':');
    if (sourceBlockId !== block.id || !sourceId || sourceId === targetId) return;
    updateBlock(block.id, (current) => ({ ...current, rows: moveById(current.rows, sourceId, targetId) }));
  };

  return (
    <div className="component-table-editor wide">
      <div className="component-subhead">
        <strong>Columns</strong>
        <button type="button" onClick={addColumn}>+ Add Column</button>
      </div>
      <div className="component-column-list">
        {block.columns.map((column, index) => (
          <label className="field component-column-field" key={`${column}-${index}`}>
            <span>Column {index + 1}</span>
            <input value={column} onChange={(event) => updateColumn(index, event.target.value)} />
            <button className="danger-icon" type="button" onClick={() => deleteColumn(index)} disabled={block.columns.length <= 1} aria-label={`Delete column ${index + 1}`}><span className="trash-icon" aria-hidden="true" /></button>
          </label>
        ))}
      </div>
      <div className="component-subhead">
        <strong>Rows</strong>
        <button type="button" onClick={addRow}>+ Add Row</button>
      </div>
      <div className="component-table-row-list">
        {block.rows.map((row, index) => (
          <div className="component-table-row-editor" key={row.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropRow(event, row.id)}>
            <button className="component-drag-handle" draggable type="button" onDragStart={(event) => beginRowDrag(event, row.id)} aria-label={`Drag row ${index + 1}`}>Drag</button>
            <div className="component-cell-grid" style={{ gridTemplateColumns: `repeat(${Math.max(block.columns.length, 1)}, minmax(120px, 1fr))` }}>
              {syncTableCells(row.cells, block.columns.length).map((cell, columnIndex) => (
                <label className="field" key={`${row.id}-${columnIndex}`}>
                  <span>{block.columns[columnIndex] || `Column ${columnIndex + 1}`}</span>
                  <input value={cell} onChange={(event) => updateCell(row.id, columnIndex, event.target.value)} />
                </label>
              ))}
            </div>
            <div className="component-row-actions">
              <button type="button" onClick={() => moveRow(row.id, -1)} disabled={index === 0}>Up</button>
              <button type="button" onClick={() => moveRow(row.id, 1)} disabled={index === block.rows.length - 1}>Down</button>
              <button type="button" onClick={() => duplicateRow(row)}>Duplicate</button>
              <button className="danger-icon" type="button" onClick={() => deleteRow(row.id)} aria-label={`Delete row ${index + 1}`}><span className="trash-icon" aria-hidden="true" /></button>
            </div>
          </div>
        ))}
      </div>
      {!block.rows.length ? <p className="component-empty-inline">Add at least one row to make this table visible.</p> : null}
    </div>
  );
}

function SectionCreateForm({ nextNumber, existingSections, save, close }: { nextNumber: string; existingSections: SectionEntry[]; save: (section: SectionEntry) => void; close: () => void }) {
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  return <form onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = text(form, 'title');
    const slug = text(form, 'slug') || makeSlug(title);
    const comment = text(form, 'reviewComment');
    const section = {
      ...docSection(`section-${Date.now()}`, text(form, 'number'), slug, title, text(form, 'summary'), text(form, 'status') as WorkflowStatus, text(form, 'owner'), [text(form, 'content')]),
      reviewer: text(form, 'reviewer') || text(form, 'owner'),
      comments: comment.trim() ? [nextContentComment(text(form, 'owner'), comment, `${text(form, 'number')} ${title}`)] : [],
    };
    const nextIssues = validateSectionDraft(section, existingSections);
    setIssues(nextIssues);
    if (nextIssues.some((issue) => issue.kind === 'error')) return;
    save(section);
  }}><ValidationList issues={issues} /><div className="form-grid"><Field name="title" label="Title" value="" wide /><Field name="number" label="Number" value={nextNumber} /><Field name="slug" label="Slug" value="" /><Field name="owner" label="Owner" value="Docs" /><Field name="reviewer" label="Reviewer" value="Reviewer" /><Select name="status" label="Status" value="draft" options={WORKFLOW_STATUSES} /><Field name="summary" label="Summary" value="" wide /><Field name="content" label="Starter Content" value="Write the first paragraph here." wide /><Field name="reviewComment" label="Review Comment" value="" wide /></div><FormActions close={close} submit="Add Section" /></form>;
}

function LanguageForm({ existingCodes, localizationKeys, save, close }: { existingCodes: string[]; localizationKeys: LocalizationKey[]; save: (entry: TranslationEntry) => void; close: () => void }) {
  return <form onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const code = text(form, 'code').trim().toLowerCase();
    if (!code || existingCodes.includes(code)) return;
    save({
      code,
      language: text(form, 'language'),
      nativeName: text(form, 'nativeName'),
      status: 'not-started',
      owner: text(form, 'owner') || 'Localization',
      reviewer: text(form, 'reviewer') || 'Unassigned',
      dueDate: text(form, 'dueDate'),
      updatedAt: today(),
      values: Object.fromEntries(localizationKeys.map((key) => [key.id, ''])),
      rowMeta: {},
    });
  }}><div className="form-grid"><Field name="code" label="Language Code" value="" /><Field name="language" label="Language Name" value="" /><Field name="nativeName" label="Native Name" value="" wide /><Field name="owner" label="Owner" value="Localization" /><Field name="reviewer" label="Reviewer" value="Unassigned" /><Field name="dueDate" label="Due Date" type="date" value="" /></div><FormActions close={close} submit="Create Language" /></form>;
}

function ReleaseForm({ docs, releases, save, close }: { docs: DocEntry[]; releases: ReleaseEntry[]; save: (release: ReleaseEntry) => void; close: () => void }) {
  const firstDoc = docs[0] ?? DEFAULT_DOCS[0];
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  return <form onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const docId = text(form, 'docId');
    const doc = docs.find((item) => item.id === docId) ?? firstDoc;
    const release = { id: `rel-${Date.now()}`, docId, version: text(form, 'version'), label: text(form, 'label') || `${doc.title} ${text(form, 'version')}`, notes: text(form, 'notes'), status: 'draft' as const, environment: text(form, 'environment') as ReleaseEntry['environment'], createdAt: today() };
    const nextIssues = validateReleaseDraft(release, releases);
    setIssues(nextIssues);
    if (nextIssues.some((issue) => issue.kind === 'error')) return;
    save(release);
  }}><ValidationList issues={issues} /><div className="form-grid"><Select name="docId" label="Document" value={firstDoc.id} options={docs.map((doc) => doc.id)} /><Field name="version" label="Version" value={firstDoc.version} /><Select name="environment" label="Target" value="staging" options={['draft', 'staging', 'production']} /><Field name="label" label="Label" value={`${firstDoc.title} ${firstDoc.version}`} wide /><Field name="notes" label="Release Notes" value="DocPilot update prepared for review." wide /></div><FormActions close={close} submit="Create Version" /></form>;
}

function RollbackForm({ release, save, close }: { release: ReleaseEntry; save: (reason: string) => void; close: () => void }) {
  return <form onSubmit={(event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save(text(form, 'reason'));
  }}><div className="form-grid"><div className="form-note wide"><strong>{release.label}</strong><span>Rollback creates a new immutable snapshot with the current actor and reason.</span></div><Field name="reason" label="Rollback Reason" value="Restore prior approved documentation snapshot." wide /></div><FormActions close={close} submit="Record Rollback" /></form>;
}

function ViewHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="view-header"><div><h1>{title}</h1><div className="subtitle">{subtitle}</div></div>{action}</div>;
}

function Kpi({ label, value, meta, accent = 'blue' }: { label: string; value: string; meta: string; accent?: 'blue' | 'green' | 'red' | 'yellow' }) {
  return <div className={`kpi-card accent-${accent}`}><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div><div className="kpi-meta">{meta}</div></div>;
}

function DocMiniCard({ doc }: { doc: DocEntry }) {
  return <Link className="doc-mini-card" to={docPath(doc)}><span>{doc.type} · {docNavPlacement(doc)}</span><strong>{doc.title}</strong><em>v{doc.version} · {doc.sections} sections · {docAudience(doc)}</em></Link>;
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  return <div className="progress-row"><div><span>{label}</span><strong>{value}%</strong></div><i><b style={{ width: `${value}%` }} /></i></div>;
}

function Card({ title, children }: { title?: string; children: ReactNode }) {
  return <div className="card">{title ? <div className="card-header"><h2 className="card-title">{title}</h2></div> : null}<div className="card-body padless">{children}</div></div>;
}

function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return <div className="empty-state"><strong>{title}</strong><span>{message}</span>{action}</div>;
}

function SetupChecklist({ steps }: { steps: string[] }) {
  return (
    <ol className="setup-checklist">
      {steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}
    </ol>
  );
}

function Pill({ status }: { status: string }) {
  return <span className={`pill ${status}`}>{status}</span>;
}

function Modal({ title, close, children, cardClassName = '', hideTitle = false, hideClose = false }: {
  title: string;
  close: () => void;
  children: ReactNode;
  cardClassName?: string;
  hideTitle?: boolean;
  hideClose?: boolean;
}) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [close]);
  return (
    <div className="modal">
      <button className="modal-overlay" aria-label="Close modal" onClick={close} />
      <div className={`modal-card ${cardClassName}`.trim()}>
        {hideClose ? null : <button className="modal-close" onClick={close} aria-label="Close">×</button>}
        {hideTitle ? null : <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

function WarningConfirm({ eyebrow = 'Warning', title, message, detail, confirmLabel = 'Delete', cancelLabel = 'Cancel', close, confirm }: WarningConfirmProps) {
  return (
    <div className="warning-confirm">
      <div className="warning-confirm-icon" aria-hidden="true">!</div>
      <div className="warning-confirm-copy">
        <span>{eyebrow}</span>
        <h3>{title}</h3>
        <p>{message}</p>
        {detail ? <small>{detail}</small> : null}
      </div>
      <div className="form-actions">
        <button className="btn" type="button" onClick={close}>{cancelLabel}</button>
        <button className="btn btn-red" type="button" onClick={confirm}><span className="trash-icon" aria-hidden="true" /> {confirmLabel}</button>
      </div>
    </div>
  );
}

function Field({ name, label, value, type = 'text', wide = false }: { name: string; label: string; value: string | number; type?: string; wide?: boolean }) {
  return <label className={`field ${wide ? 'wide' : ''}`}><span>{label}</span><input name={name} type={type} defaultValue={value} required /></label>;
}

function Select({ name, label, value, options, onChange }: { name: string; label: string; value: string; options: string[]; onChange?: (value: string) => void }) {
  return <label className="field"><span>{label}</span>{onChange ? (
    <select name={name} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
  ) : (
    <select name={name} defaultValue={value}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
  )}</label>;
}

function FormActions({ close, submit }: { close: () => void; submit: string }) {
  return <div className="form-actions"><button className="btn" type="button" onClick={close}>Cancel</button><button className="btn btn-red" type="submit">{submit}</button></div>;
}

function RichSelectionToolbar({ applyTool, applyHighlight }: {
  applyTool: (tool: InlineRichTool) => void;
  applyHighlight: (preset: HighlightPreset) => void;
}) {
  return (
    <div className="rich-selection-toolbar" aria-label="Selected text tools">
      <div className="rich-tool-group">
        {INLINE_RICH_TOOLS.map((tool) => (
          <button
            aria-label={tool.label}
            key={tool.id}
            title={tool.label}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => applyTool(tool)}
          >
            {tool.icon}
          </button>
        ))}
      </div>
      <HighlightPalette applyHighlight={applyHighlight} />
    </div>
  );
}

function HighlightPalette({ applyHighlight }: { applyHighlight: (preset: HighlightPreset) => void }) {
  return (
    <div className="highlight-palette" aria-label="Highlight color presets">
      {HIGHLIGHT_PRESETS.map((preset) => (
        <button
          aria-label={preset.label}
          className={`highlight-swatch ${preset.id}`}
          key={preset.id}
          title={preset.label}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyHighlight(preset)}
        />
      ))}
    </div>
  );
}

function componentKindLabel(kind: DocComponentKind) {
  return DOC_COMPONENT_TYPES.find((type) => type.kind === kind)?.label ?? 'Component';
}

function componentKindIcon(kind: DocComponentKind) {
  if (kind === 'callout') return '!';
  if (kind === 'accordion') return '▤';
  if (kind === 'tabs') return '▦';
  if (kind === 'list') return '•';
  if (kind === 'table') return '▥';
  if (kind === 'regions') return '◎';
  if (kind === 'carousel') return '↔';
  return '01';
}

function hasDocComponentDragType(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes(DOC_COMPONENT_DRAG_TYPE);
}

function readDocComponentDragKind(dataTransfer: DataTransfer): DocComponentKind | null {
  const value = dataTransfer.getData(DOC_COMPONENT_DRAG_TYPE);
  return DOC_COMPONENT_TYPES.some((type) => type.kind === value) ? value as DocComponentKind : null;
}

function componentInsertDescription(kind: DocComponentKind) {
  if (kind === 'callout') return 'Short note or warning';
  if (kind === 'accordion') return 'Expandable grouped detail';
  if (kind === 'tabs') return 'Tabbed comparison';
  if (kind === 'list') return 'Bulleted or ordered content';
  if (kind === 'table') return 'Rows and columns';
  if (kind === 'regions') return 'Screen region breakdown';
  if (kind === 'carousel') return 'Image slider with drag';
  return 'Ordered steps';
}

function componentItemGroupLabel(kind: DocComponentKind) {
  if (kind === 'accordion') return 'Accordion Panels';
  if (kind === 'tabs') return 'Tabs';
  if (kind === 'regions') return 'Regions';
  if (kind === 'steps') return 'Steps';
  if (kind === 'carousel') return 'Slides';
  return 'Items';
}

function componentItemTitleLabel(kind: DocComponentKind) {
  if (kind === 'accordion') return 'Panel Title';
  if (kind === 'tabs') return 'Tab Label';
  if (kind === 'regions') return 'Region Label';
  if (kind === 'steps') return 'Step Title';
  if (kind === 'carousel') return 'Slide Caption';
  return 'Item Label';
}

function componentItemBodyLabel(kind: DocComponentKind) {
  if (kind === 'tabs') return 'Panel Text';
  if (kind === 'regions') return 'Region Description';
  if (kind === 'steps') return 'Step Description';
  if (kind === 'carousel') return 'Image URL';
  return 'Text';
}

function newDocComponentBlock(kind: DocComponentKind, existing: DocComponentBlock[] = []): DocComponentBlock {
  const id = nextDocComponentId(kind, existing);
  if (kind === 'table') {
    return {
      id,
      kind,
      title: 'Reference table',
      body: '',
      variant: 'info',
      ordered: false,
      items: [],
      columns: ['Area', 'Description'],
      rows: [{ id: 'row-1', cells: ['Top bar', 'Primary navigation and status controls'] }],
    };
  }
  if (kind === 'callout') {
    return {
      id,
      kind,
      title: 'Important note',
      body: 'Add the supporting detail here.',
      variant: 'info',
      ordered: false,
      items: [],
      columns: [],
      rows: [],
    };
  }

  return {
    id,
    kind,
    title: defaultDocComponentTitle(kind),
    body: '',
    variant: 'info',
    ordered: kind === 'steps',
    items: [newDocComponentItem([], kind)],
    columns: [],
    rows: [],
  };
}

function defaultDocComponentTitle(kind: DocComponentKind) {
  if (kind === 'accordion') return 'Expandable details';
  if (kind === 'tabs') return 'Grouped options';
  if (kind === 'list') return 'Checklist';
  if (kind === 'regions') return 'Interface regions';
  if (kind === 'steps') return 'Process steps';
  if (kind === 'carousel') return 'Image carousel';
  return componentKindLabel(kind);
}

function newDocComponentItem(existing: DocComponentItem[], kind: DocComponentKind): DocComponentItem {
  const id = nextDocComponentItemId(existing);
  const number = existing.length + 1;
  if (kind === 'regions') return { id, title: `${number}. Region name`, body: 'Describe what users see and how it behaves.' };
  if (kind === 'tabs') return { id, title: `Tab ${number}`, body: 'Describe this tab panel.' };
  if (kind === 'accordion') return { id, title: `Panel ${number}`, body: 'Add expandable details.' };
  if (kind === 'steps') return { id, title: `Step ${number}`, body: 'Explain the action or state.' };
  if (kind === 'carousel') return { id, title: `Slide ${number}`, body: '' };
  return { id, title: `Item ${number}`, body: 'Add item details.' };
}

function duplicateDocComponentBlock(block: DocComponentBlock, existing: DocComponentBlock[]): DocComponentBlock {
  return {
    ...block,
    id: nextDocComponentId(block.kind, existing),
    title: `${block.title || componentKindLabel(block.kind)} copy`,
    items: block.items.map((item, index) => ({ ...item, id: `item-${index + 1}` })),
    rows: block.rows.map((row, index) => ({ ...row, id: `row-${index + 1}`, cells: [...row.cells] })),
    columns: [...block.columns],
  };
}

function nextDocComponentId(kind: DocComponentKind, blocks: DocComponentBlock[]) {
  let nextNumber = blocks.length + 1;
  let id = `component-${kind}-${nextNumber}`;
  while (blocks.some((block) => block.id === id)) {
    nextNumber += 1;
    id = `component-${kind}-${nextNumber}`;
  }
  return id;
}

function nextDocComponentItemId(items: DocComponentItem[]) {
  let nextNumber = items.length + 1;
  let id = `item-${nextNumber}`;
  while (items.some((item) => item.id === id)) {
    nextNumber += 1;
    id = `item-${nextNumber}`;
  }
  return id;
}

function nextDocComponentRowId(rows: DocComponentTableRow[]) {
  let nextNumber = rows.length + 1;
  let id = `row-${nextNumber}`;
  while (rows.some((row) => row.id === id)) {
    nextNumber += 1;
    id = `row-${nextNumber}`;
  }
  return id;
}

function newDocComponentTableRow(rows: DocComponentTableRow[], columnCount: number): DocComponentTableRow {
  return { id: nextDocComponentRowId(rows), cells: Array.from({ length: Math.max(columnCount, 1) }, () => '') };
}

function parseDocComponentBlocks(html: string): DocComponentBlock[] {
  const template = htmlTemplate(html);
  return Array.from(template.content.querySelectorAll<HTMLElement>('[data-doc-component]')).map((element, index) => {
    const kind = safeDocComponentKind(element.getAttribute('data-doc-component'));
    const id = element.getAttribute('data-component-id') || `component-${kind}-${index + 1}`;
    const variant = safeDocComponentVariant(element.getAttribute('data-variant'));
    const title = readComponentTitle(element, kind) || defaultDocComponentTitle(kind);
    const baseBlock: DocComponentBlock = {
      id,
      kind,
      title,
      body: '',
      variant,
      ordered: element.getAttribute('data-ordered') === 'true',
      items: [],
      columns: [],
      rows: [],
    };

    if (kind === 'callout') {
      return { ...baseBlock, body: readComponentBody(element) };
    }
    if (kind === 'table') {
      const columns = Array.from(element.querySelectorAll<HTMLElement>('thead th')).map((cell, cellIndex) => inlineHtmlToEditableText(cell.innerHTML) || `Column ${cellIndex + 1}`);
      const rows = Array.from(element.querySelectorAll<HTMLElement>('tbody tr')).map((row, rowIndex) => ({
        id: row.getAttribute('data-component-row-id') || `row-${rowIndex + 1}`,
        cells: Array.from(row.querySelectorAll<HTMLElement>('td')).map((cell) => inlineHtmlToEditableText(cell.innerHTML)),
      }));
      return {
        ...baseBlock,
        columns: columns.length ? columns : ['Column 1'],
        rows,
      };
    }
    return { ...baseBlock, items: readComponentItems(element, kind) };
  });
}

function writeDocComponentBlocks(html: string, blocks: DocComponentBlock[]) {
  const strippedHtml = stripDocComponentBlocks(html);
  const markup = blocks.map(docComponentMarkup).join('\n\n');
  return markup ? insertBeforeSectionClose(strippedHtml, markup) : strippedHtml;
}

function insertDocComponentAtSlot(html: string, block: DocComponentBlock, slotIndex: number) {
  const template = htmlTemplate(html);
  const container = getSectionContentContainer(template.content);
  if (!container) return insertBeforeSectionClose(html, docComponentMarkup(block));
  const componentTemplate = htmlTemplate(docComponentMarkup(block));
  const componentElement = componentTemplate.content.firstElementChild;
  if (!componentElement) return html;
  const children = Array.from(container.children);
  const target = children[clampBetween(Math.round(slotIndex), 0, children.length)];
  if (target) {
    container.insertBefore(componentElement, target);
  } else {
    container.append(componentElement);
  }
  return template.innerHTML;
}

function updateDocComponentAtIndex(html: string, index: number, block: DocComponentBlock) {
  const template = htmlTemplate(html);
  const target = getDocComponentElements(template.content)[index];
  if (!target) return html;
  target.outerHTML = docComponentMarkup(block);
  return template.innerHTML;
}

function deleteDocComponentAtIndex(html: string, index: number) {
  const template = htmlTemplate(html);
  const target = getDocComponentElements(template.content)[index];
  if (!target) return html;
  target.remove();
  return template.innerHTML;
}

function duplicateDocComponentAtIndex(html: string, index: number) {
  const template = htmlTemplate(html);
  const components = getDocComponentElements(template.content);
  const target = components[index];
  const block = parseDocComponentBlocks(html)[index];
  if (!target || !block) return html;
  const duplicate = duplicateDocComponentBlock(block, parseDocComponentBlocks(html));
  target.insertAdjacentHTML('afterend', docComponentMarkup(duplicate));
  return template.innerHTML;
}

function moveDocComponentAtIndex(html: string, index: number, direction: -1 | 1) {
  const template = htmlTemplate(html);
  const components = getDocComponentElements(template.content);
  const target = components[index];
  const sibling = components[index + direction];
  if (!target || !sibling || target.parentElement !== sibling.parentElement) return html;
  const parent = target.parentElement;
  if (!parent) return html;
  if (direction < 0) {
    parent.insertBefore(target, sibling);
  } else {
    parent.insertBefore(sibling, target);
  }
  return template.innerHTML;
}

function docComponentMarkup(block: DocComponentBlock) {
  const attrs = docComponentAttributes(block);
  const title = escapeHtml(block.title.trim() || componentKindLabel(block.kind));
  const variantClass = `doc-component-variant-${safeDocComponentVariant(block.variant)}`;

  if (block.kind === 'callout') {
    return `<div class="doc-component doc-component-callout ${variantClass} callout ${calloutVariantClass(block.variant)}" ${attrs}>
  <span class="callout-title doc-component-title">${title}</span>
  <p class="doc-component-body">${formatInlineText(block.body)}</p>
</div>`;
  }

  if (block.kind === 'accordion') {
    const items = block.items.map((item) => `  <details data-component-item-id="${escapeHtml(item.id)}">
    <summary class="doc-component-item-title">${escapeHtml(item.title)}</summary>
    <p class="doc-component-item-body">${formatInlineText(item.body)}</p>
  </details>`).join('\n');
    return `<div class="doc-component doc-component-accordion ${variantClass}" ${attrs}>
  <h4 class="doc-component-title">${title}</h4>
${items}
</div>`;
  }

  if (block.kind === 'tabs') {
    const tabs = block.items.map((item, index) => `<span class="${index === 0 ? 'active' : ''}">${escapeHtml(item.title)}</span>`).join('');
    const panels = block.items.map((item) => `  <div class="doc-tab-panel" data-component-item-id="${escapeHtml(item.id)}">
    <strong class="doc-component-item-title">${escapeHtml(item.title)}</strong>
    <p class="doc-component-item-body">${formatInlineText(item.body)}</p>
  </div>`).join('\n');
    return `<div class="doc-component doc-component-tabs ${variantClass}" ${attrs}>
  <h4 class="doc-component-title">${title}</h4>
  <div class="doc-tab-list">${tabs}</div>
  <div class="doc-tab-panels">
${panels}
  </div>
</div>`;
  }

  if (block.kind === 'list') {
    const tag = block.ordered ? 'ol' : 'ul';
    const items = block.items.map((item) => `    <li data-component-item-id="${escapeHtml(item.id)}"><strong class="doc-component-item-title">${escapeHtml(item.title)}</strong><p class="doc-component-item-body">${formatInlineText(item.body)}</p></li>`).join('\n');
    return `<div class="doc-component doc-component-list ${variantClass}" ${attrs}>
  <h4 class="doc-component-title">${title}</h4>
  <${tag}>
${items}
  </${tag}>
</div>`;
  }

  if (block.kind === 'table') {
    const columns = block.columns.length ? block.columns : ['Column 1'];
    const rows = block.rows.map((row) => `    <tr data-component-row-id="${escapeHtml(row.id)}">${syncTableCells(row.cells, columns.length).map((cell) => `<td>${formatInlineText(cell)}</td>`).join('')}</tr>`).join('\n');
    return `<div class="doc-component doc-component-table ${variantClass}" ${attrs}>
  <h4 class="doc-component-title">${title}</h4>
  <table>
    <thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
</div>`;
  }

  if (block.kind === 'regions') {
    const rows = block.items.map((item) => `  <div class="doc-region-row" data-component-item-id="${escapeHtml(item.id)}">
    <dt class="doc-component-item-title">${escapeHtml(item.title)}</dt>
    <dd class="doc-component-item-body">${formatInlineText(item.body)}</dd>
  </div>`).join('\n');
    return `<dl class="doc-component doc-component-regions ${variantClass} ui-list" ${attrs}>
  <dt class="doc-component-title">${title}</dt>
${rows}
</dl>`;
  }

  if (block.kind === 'carousel') {
    const slides = block.items.map((item, index) => `      <figure class="doc-carousel-slide" data-component-item-id="${escapeHtml(item.id)}" data-slide-index="${index}">
        <img src="${escapeHtml(item.body)}" alt="${escapeHtml(item.title || `Slide ${index + 1}`)}" draggable="false">
        <figcaption class="doc-component-item-title">${escapeHtml(item.title || `Slide ${index + 1}`)}</figcaption>
        <p class="doc-component-item-body doc-carousel-slide-src">${escapeHtml(item.body)}</p>
      </figure>`).join('\n');
    const dots = block.items.map((item, index) => `      <button type="button" class="doc-carousel-dot${index === 0 ? ' active' : ''}" data-carousel-dot="${index}" aria-label="Go to ${escapeHtml(item.title || `slide ${index + 1}`)}" aria-pressed="${index === 0 ? 'true' : 'false'}"></button>`).join('\n');
    return `<div class="doc-component doc-component-carousel ${variantClass}" ${attrs}>
  <h4 class="doc-component-title">${title}</h4>
  <div class="doc-carousel" data-doc-carousel>
    <button type="button" class="doc-carousel-nav prev" data-carousel-prev aria-label="Previous slide">‹</button>
    <div class="doc-carousel-viewport">
      <div class="doc-carousel-track">
${slides}
      </div>
    </div>
    <button type="button" class="doc-carousel-nav next" data-carousel-next aria-label="Next slide">›</button>
    <div class="doc-carousel-dots">
${dots}
    </div>
  </div>
</div>`;
  }

  const steps = block.items.map((item) => `    <li data-component-item-id="${escapeHtml(item.id)}"><strong class="doc-component-item-title">${escapeHtml(item.title)}</strong><p class="doc-component-item-body">${formatInlineText(item.body)}</p></li>`).join('\n');
  return `<div class="doc-component doc-component-steps ${variantClass}" ${attrs}>
  <h4 class="doc-component-title">${title}</h4>
  <ol class="steps">
${steps}
  </ol>
</div>`;
}

function docComponentAttributes(block: DocComponentBlock) {
  return `data-doc-component="${block.kind}" data-component-id="${escapeHtml(block.id)}" data-variant="${safeDocComponentVariant(block.variant)}" data-ordered="${block.ordered ? 'true' : 'false'}"`;
}

function calloutVariantClass(variant: string) {
  if (variant === 'success') return 'tip';
  if (variant === 'warning') return 'important';
  if (variant === 'danger') return 'warn';
  return 'info';
}

function safeDocComponentKind(value: string | null): DocComponentKind {
  const match = DOC_COMPONENT_TYPES.find((type) => type.kind === value);
  return match?.kind ?? 'callout';
}

function safeDocComponentVariant(value: string | null | undefined) {
  return DOC_COMPONENT_VARIANTS.includes(value ?? '') ? String(value) : 'info';
}

function htmlTemplate(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template;
}

function getSectionContentContainer(root: DocumentFragment | HTMLElement) {
  return root.querySelector<HTMLElement>('section.content > .container');
}

function getDocComponentElements(root: DocumentFragment | HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-doc-component]'));
}

function stripDocComponentBlocks(html: string) {
  const template = htmlTemplate(html);
  template.content.querySelectorAll('[data-doc-component]').forEach((element) => element.remove());
  return template.innerHTML;
}

function extractDocComponentMarkup(html: string) {
  const template = htmlTemplate(html);
  return Array.from(template.content.querySelectorAll<HTMLElement>('[data-doc-component]')).map((element) => element.outerHTML);
}

function extractPreservedElementMarkup(html: string) {
  const template = htmlTemplate(stripDocComponentBlocks(html));
  return Array.from(template.content.querySelectorAll<HTMLElement>('figure, table')).map((element) => element.outerHTML);
}

function readComponentTitle(element: HTMLElement, kind: DocComponentKind) {
  const selector = kind === 'callout' ? '.doc-component-title, .callout-title' : ':scope > .doc-component-title';
  const titleElement = element.querySelector<HTMLElement>(selector);
  return inlineHtmlToEditableText(titleElement?.innerHTML ?? '');
}

function readComponentBody(element: HTMLElement) {
  const bodyElement = element.querySelector<HTMLElement>(':scope > .doc-component-body');
  return inlineHtmlToEditableText(bodyElement?.innerHTML ?? '');
}

function readComponentItems(element: HTMLElement, kind: DocComponentKind) {
  return Array.from(element.querySelectorAll<HTMLElement>('[data-component-item-id]')).map((itemElement, index) => {
    const titleElement = itemElement.querySelector<HTMLElement>('.doc-component-item-title, summary, dt');
    const bodyElement = itemElement.querySelector<HTMLElement>('.doc-component-item-body, dd');
    return {
      id: itemElement.getAttribute('data-component-item-id') || `item-${index + 1}`,
      title: inlineHtmlToEditableText(titleElement?.innerHTML ?? '') || `${componentItemTitleLabel(kind)} ${index + 1}`,
      body: inlineHtmlToEditableText(bodyElement?.innerHTML ?? ''),
    };
  });
}

function syncTableCells(cells: string[], columnCount: number) {
  return Array.from({ length: Math.max(columnCount, 1) }, (_item, index) => cells[index] ?? '');
}

function moveById<T extends { id: string }>(items: T[], sourceId: string, targetId: string) {
  if (sourceId === targetId) return items;
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return items;
  const nextItems = [...items];
  const [source] = nextItems.splice(sourceIndex, 1);
  nextItems.splice(targetIndex, 0, source);
  return nextItems;
}

function moveByIndex<T extends { id: string }>(items: T[], id: string, direction: -1 | 1) {
  const index = items.findIndex((item) => item.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const nextItems = [...items];
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(nextIndex, 0, item);
  return nextItems;
}

function splitMediaTags(value: string) {
  const raw = value.trim();
  if (!raw) return [];

  const commaSeparated = raw.includes(',')
    ? raw.split(',').map((tag) => tag.trim())
    : raw.split(/\s+/).map((tag) => tag.trim());

  return Array.from(new Set(
    commaSeparated
      .map((tag) => tag.toLowerCase())
      .filter(Boolean),
  )).slice(0, 32);
}

function mediaAuthHeaders() {
  const actor = auth.currentUser();
  return {
    'x-docpilot-user': actor?.id || 'anonymous',
    'x-docpilot-role': actor?.role || 'viewer',
  };
}

async function uploadMediaFilesToServer(files: File[], options?: { onProgress?: (percent: number) => void }): Promise<UploadedMediaFile[]> {
  if (options?.onProgress && typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      files.forEach((file) => form.append('files', file, file.name));
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/docpilot/media/upload');

      const headers = mediaAuthHeaders();
      Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));

      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
        options.onProgress?.(percent);
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed (network error).')));
      xhr.addEventListener('abort', () => reject(new Error('Upload canceled.')));
      xhr.addEventListener('load', () => {
        let payload: { ok?: boolean; error?: string; files?: UploadedMediaFile[] } | null;
        try {
          payload = JSON.parse(xhr.responseText || 'null') as { ok?: boolean; error?: string; files?: UploadedMediaFile[] } | null;
        } catch {
          payload = null;
        }
        if (xhr.status < 200 || xhr.status >= 300 || !payload?.ok) {
          reject(new Error(payload?.error || `Upload failed (${xhr.status}).`));
          return;
        }
        options.onProgress?.(100);
        resolve(Array.isArray(payload.files) ? payload.files : []);
      });

      xhr.send(form);
    });
  }

  const form = new FormData();
  files.forEach((file) => form.append('files', file, file.name));
  const response = await fetch('/api/docpilot/media/upload', {
    method: 'POST',
    headers: mediaAuthHeaders(),
    body: form,
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; files?: UploadedMediaFile[] } | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Upload failed (${response.status}).`);
  return Array.isArray(payload.files) ? payload.files : [];
}

async function deleteMediaFileFromServer(fileName: string) {
  const response = await fetch(`/api/docpilot/media/files/${encodeURIComponent(fileName)}`, {
    method: 'DELETE',
    headers: mediaAuthHeaders(),
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Delete failed (${response.status}).`);
}

async function createVideoThumbnailFromFile(file: File | undefined, mimeTypeHint = ''): Promise<string> {
  if (!file) return '';
  const hintedVideo = mimeTypeHint.toLowerCase().startsWith('video/');
  const fileLooksLikeVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogg)$/i.test(file.name);
  if (!hintedVideo && !fileLooksLikeVideo) return '';
  if (typeof document === 'undefined' || typeof URL === 'undefined') return '';

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    let timeoutId = 0;

    const finish = (thumbnail = '') => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        // ignore cleanup failures
      }
      URL.revokeObjectURL(objectUrl);
      resolve(thumbnail);
    };

    const capture = () => {
      try {
        if (!video.videoWidth || !video.videoHeight) return finish('');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) return finish('');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', 0.86));
      } catch {
        finish('');
      }
    };

    const chooseThumbnailTime = (duration: number) => {
      if (!Number.isFinite(duration) || duration <= 0) return 0;
      if (duration < 1) return duration * 0.5;
      const start = duration * 0.35;
      const end = duration * 0.8;
      const randomMiddle = start + Math.random() * Math.max(0, end - start);
      return Math.min(Math.max(randomMiddle, 0.1), Math.max(0.1, duration - 0.1));
    };

    const seekAndCapture = () => {
      const targetTime = chooseThumbnailTime(video.duration);
      if (targetTime <= 0) {
        capture();
        return;
      }
      const onSeeked = () => capture();
      video.addEventListener('seeked', onSeeked, { once: true });
      try {
        video.currentTime = targetTime;
      } catch {
        video.removeEventListener('seeked', onSeeked);
        capture();
      }
    };

    timeoutId = window.setTimeout(() => finish(''), 6000);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.addEventListener('loadedmetadata', seekAndCapture, { once: true });
    video.addEventListener('error', () => finish(''), { once: true });
    video.src = objectUrl;
  });
}

function mediaAssetKind(asset: MediaAsset): 'image' | 'video' | 'document' | 'data' | 'other' {
  const mime = (asset.mimeType || '').toLowerCase();
  const src = (asset.src || '').toLowerCase();
  if (mime.startsWith('image/') || src.startsWith('data:image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'document';
  if (mime.includes('spreadsheet') || mime === 'application/vnd.ms-excel') return 'document';
  if (mime.includes('csv') || src.endsWith('.csv')) return 'data';
  if (src.endsWith('.pdf') || src.endsWith('.xlsx') || src.endsWith('.xls')) return 'document';
  if (src.endsWith('.mp4') || src.endsWith('.webm')) return 'video';
  if (src.endsWith('.png') || src.endsWith('.jpg') || src.endsWith('.jpeg') || src.endsWith('.gif') || src.endsWith('.webp') || src.endsWith('.svg')) return 'image';
  return 'other';
}

function mediaAssetDisplayName(asset: MediaAsset) {
  return asset.alt?.trim() || asset.originalName || asset.src;
}

function isImageAsset(asset: MediaAsset) {
  return mediaAssetKind(asset) === 'image';
}

function isVideoAsset(asset: MediaAsset) {
  return mediaAssetKind(asset) === 'video';
}

function mediaAssetIcon(asset: MediaAsset) {
  const kind = mediaAssetKind(asset);
  if (kind === 'image') return '🖼';
  if (kind === 'video') return '🎬';
  if (kind === 'data') return '🧾';
  if (asset.mimeType === 'application/pdf' || asset.src.toLowerCase().endsWith('.pdf')) return '📄';
  return '📦';
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 || unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}

function upsertMediaAssetUsage(assets: MediaAsset[], assetId: string, usageLabel: string) {
  if (!usageLabel) return assets;
  return assets.map((asset) => {
    if (asset.id !== assetId) return asset;
    const usageRefs = Array.from(new Set([...(asset.usageRefs || []), usageLabel]));
    return { ...asset, usageRefs, updatedAt: today() };
  });
}

function collectMediaUsageRefs(assets: MediaAsset[], bundles: { doc: DocEntry; sections: SectionEntry[] }[]) {
  const refs: Record<string, string[]> = {};
  for (const asset of assets) refs[asset.id] = [...(asset.usageRefs || [])];
  for (const bundle of bundles) {
    for (const section of bundle.sections) {
      for (const asset of assets) {
        if (!asset.src || !section.html.includes(asset.src)) continue;
        const label = `${bundle.doc.title} · ${section.number} ${section.title}`;
        refs[asset.id] = Array.from(new Set([...(refs[asset.id] || []), label]));
      }
    }
  }
  return refs;
}

function text(form: FormData, key: string) {
  return String(form.get(key) ?? '');
}

function extractManualSections(html: string) {
  const mainMatch = html.match(/<main class="doc-main">([\s\S]*?)<!-- ====================== \/LAYOUT ====================== -->/);
  const mainHtml = mainMatch?.[1] ?? '';
  const matches = [...mainHtml.matchAll(/(?:<!-- ====================== [\s\S]*? ====================== -->\s*)?<div class="section-banner[\s\S]*?(?=(?:<!-- ====================== \d+\.\d)|<!-- ====================== \/LAYOUT)/g)];
  return matches.map((match) => match[0].trim());
}


function starterSectionsForDocument(doc: DocEntry, productName: string) {
  const template = getDocumentTemplate(docTemplateId(doc));
  return template.sections.map((section, index) => docSection(
    `${doc.id}-s${index + 1}`,
    `${index + 1}.0`,
    section.slug,
    section.title,
    section.summary,
    'draft',
    doc.owner || template.owner,
    section.paragraphs.map((paragraph) => paragraph
      .replace(/\bthis product\b/gi, productName)
      .replace(/\bthe document\b/gi, doc.title)
    ),
  ));
}

function docSection(id: string, number: string, slug: string, title: string, summary: string, status: WorkflowStatus, owner: string, paragraphs: string[]): SectionEntry {
  const headingClass = Number.parseInt(number, 10) % 2 === 0 ? ' alt' : '';
  const html = `
<div class="section-banner${headingClass}" id="${id}">
  <div class="container">
    <div class="num">${number}</div>
    <h2>${escapeHtml(title)}</h2>
  </div>
</div>
<section class="content">
  <div class="container">
    ${paragraphs.map((paragraph) => `<p>${formatInlineText(paragraph)}</p>`).join('\n    ')}
    <div class="callout info">
      <span class="callout-title">CMS editable</span>
      <p>This section can be edited with clean writing tools and managed visual components.</p>
    </div>
  </div>
</section>`.trim();
  return { id, number, slug, title, summary, status, owner, updatedAt: '2026-05-05', html };
}

function getSectionSummary(html: string, index: number) {
  const paragraph = html.match(/<p>([\s\S]*?)<\/p>/)?.[1]
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return paragraph || (index === 16 ? 'Mobile content is intentionally marked TBD in the source manual.' : 'Imported from the Claude HTML handoff.');
}

function syncSectionTitle(html: string, title: string) {
  const escapedTitle = escapeHtml(title);
  return html.replace(/(<div class="section-banner(?: alt)?" id="[^"]+">[\s\S]*?<h2>)([\s\S]*?)(<\/h2>)/, `$1${escapedTitle}$3`);
}

const INLINE_EDITABLE_SELECTOR = [
  '.section-banner h2',
  'section.content h3',
  'section.content h4',
  'section.content h5',
  'section.content p',
  'section.content li',
  'section.content dt',
  'section.content dd',
  'section.content th',
  'section.content td',
  'section.content figcaption',
  'section.content .callout-title',
].join(', ');
const SCREENSHOT_EDITABLE_SELECTOR = 'section.content figure';

function decorateInlineEditableHtml(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  getInlineEditableElements(template.content).forEach((element, index) => {
    const label = getInlineEditableLabel(element);
    const kind = getInlineEditableKind(element);
    element.dataset.cmsEditableIndex = String(index);
    element.dataset.cmsEditableKind = kind;
    element.dataset.cmsEditableLabel = label;
    if (kind === 'section-title' || kind === 'heading') element.classList.add('cms-single-inline-action');
  });
  decorateDocComponentControls(template.content);
  getScreenshotEditableElements(template.content).forEach((element, index) => {
    element.dataset.cmsScreenshotIndex = String(index);
    element.dataset.cmsScreenshotLabel = 'Screenshot';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cms-screenshot-edit-button';
    button.setAttribute('aria-label', 'Edit Screenshot');
    button.innerHTML = '<span class="edit-icon" aria-hidden="true"></span>';
    element.append(button);
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'cms-screenshot-delete-button';
    deleteButton.setAttribute('aria-label', 'Delete Screenshot');
    deleteButton.setAttribute('title', 'Delete Screenshot');
    deleteButton.innerHTML = '<span class="trash-icon" aria-hidden="true"></span>';
    element.append(deleteButton);
  });
  decorateComponentInsertSlots(template.content);
  return template.innerHTML;
}

function decorateDocComponentControls(root: DocumentFragment | HTMLElement) {
  getDocComponentElements(root).forEach((element, index) => {
    element.dataset.cmsComponentIndex = String(index);
    element.classList.add('cms-managed-component');
    const actions = document.createElement('div');
    actions.className = 'cms-component-actions';
    actions.innerHTML = [
      componentActionButton('edit', 'Edit component', '✎'),
      componentActionButton('up', 'Move component up', '↑'),
      componentActionButton('down', 'Move component down', '↓'),
      componentActionButton('duplicate', 'Duplicate component', '⧉'),
      componentActionButton('delete', 'Delete component', '🗑', 'danger'),
    ].join('');
    element.append(actions);
  });
}

function componentActionButton(action: string, label: string, content: string, className = '') {
  const icon = content === '✎' ? '<span class="edit-icon" aria-hidden="true"></span>' : content === '🗑' ? '<span class="trash-icon" aria-hidden="true"></span>' : content;
  return `<button class="${className}" type="button" data-cms-component-action="${action}" aria-label="${label}" title="${label}">${icon}</button>`;
}

function decorateComponentInsertSlots(root: DocumentFragment | HTMLElement) {
  const container = getSectionContentContainer(root);
  if (!container) return;
  const children = Array.from(container.children);
  children.forEach((child, index) => {
    container.insertBefore(componentInsertSlot(index), child);
  });
  container.append(componentInsertSlot(children.length));
}

function componentInsertSlot(index: number) {
  const slot = document.createElement('div');
  slot.className = 'cms-insert-slot';
  slot.dataset.cmsInsertIndex = String(index);
  slot.innerHTML = '<span>Drop element here</span>';
  return slot;
}

function updateInlineEditableHtml(html: string, targetIndex: number, value: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const target = getInlineEditableElements(template.content)[targetIndex];
  if (!target) return html;
  target.innerHTML = sanitizeInlineEditorHtml(value);
  return template.innerHTML;
}

function deleteInlineEditableHtml(html: string, targetIndex: number) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const target = getInlineEditableElements(template.content)[targetIndex];
  if (!target || getInlineEditableKind(target) === 'section-title') return html;
  deleteInlineEditableElement(target);
  return template.innerHTML;
}

function deleteInlineEditableElement(target: HTMLElement) {
  if (matchesSelector(target, 'figcaption')) {
    target.remove();
    return;
  }
  if (matchesSelector(target, 'li')) {
    const list = target.parentElement;
    target.remove();
    removeIfEmpty(list);
    return;
  }
  if (matchesSelector(target, 'dt, dd')) {
    const isTerm = matchesSelector(target, 'dt');
    const pair = isTerm ? target.nextElementSibling : target.previousElementSibling;
    const list = target.parentElement;
    target.remove();
    if (pair instanceof HTMLElement && matchesSelector(pair, isTerm ? 'dd' : 'dt')) pair.remove();
    removeIfEmpty(list);
    return;
  }
  if (matchesSelector(target, 'th, td')) {
    target.innerHTML = '';
    return;
  }
  const callout = target.closest<HTMLElement>('.callout');
  if (matchesSelector(target, '.callout-title') && callout) {
    callout.remove();
    return;
  }
  target.remove();
}

function matchesSelector(element: Element, selector: string) {
  return element.matches(selector);
}

function removeIfEmpty(element: Element | null) {
  if (element instanceof HTMLElement && !normalizeInlineEditableValue(element.textContent ?? '')) element.remove();
}

function updateScreenshotEditableHtml(html: string, targetIndex: number, draft: ScreenshotDraft) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const target = getScreenshotEditableElements(template.content)[targetIndex];
  const image = target?.querySelector('img');
  if (!target || !image) return html;

  image.setAttribute('src', draft.src.trim());
  image.setAttribute('alt', draft.alt.trim());

  writeScreenshotMarkers(target, image, draft.markers);

  const nextCaption = normalizeInlineEditableValue(draft.caption);
  const currentCaption = getScreenshotCaption(target);
  if (nextCaption !== currentCaption) {
    const existingCaption = target.querySelector('figcaption');
    if (nextCaption) {
      const caption = existingCaption ?? document.createElement('figcaption');
      caption.innerHTML = formatInlineText(nextCaption);
      if (!existingCaption) target.append(caption);
    } else {
      existingCaption?.remove();
    }
  }

  return template.innerHTML;
}

function deleteScreenshotEditableHtml(html: string, targetIndex: number) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const target = getScreenshotEditableElements(template.content)[targetIndex];
  if (!target) return html;
  target.remove();
  return template.innerHTML;
}

function getInlineEditableElements(root: DocumentFragment | HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(INLINE_EDITABLE_SELECTOR))
    .filter((element) => normalizeInlineEditableValue(element.textContent ?? '').length > 0);
}

function getScreenshotEditableElements(root: DocumentFragment | HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(SCREENSHOT_EDITABLE_SELECTOR))
    .filter((element) => Boolean(element.querySelector('img')));
}

function readInlineEditableTarget(element: HTMLElement, root: HTMLElement): InlineEditableTarget | null {
  const index = Number(element.dataset.cmsEditableIndex);
  if (!Number.isFinite(index)) return null;
  const rootRect = root.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    index,
    kind: (element.dataset.cmsEditableKind ?? getInlineEditableKind(element)) as InlineEditableKind,
    label: element.dataset.cmsEditableLabel ?? getInlineEditableLabel(element),
    value: getInlineEditableElementValue(element),
    top: rect.top - rootRect.top,
    left: rect.left - rootRect.left,
    width: rect.width,
    height: rect.height,
    rootWidth: root.clientWidth,
  };
}

function readScreenshotEditableTarget(element: HTMLElement, root: HTMLElement): ScreenshotEditableTarget | null {
  const index = Number(element.dataset.cmsScreenshotIndex);
  const image = element.querySelector('img');
  if (!Number.isFinite(index) || !image) return null;
  const rootRect = root.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    index,
    label: element.dataset.cmsScreenshotLabel ?? 'Screenshot',
    src: image.getAttribute('src') ?? '',
    alt: image.getAttribute('alt') ?? '',
    caption: getScreenshotCaption(element),
    markers: getScreenshotMarkers(element),
    top: rect.top - rootRect.top,
    left: rect.left - rootRect.left,
    width: rect.width,
    height: rect.height,
    rootWidth: root.clientWidth,
  };
}

function readComponentInsertTarget(element: HTMLElement, root: HTMLElement): ComponentInsertTarget | null {
  const index = Number(element.dataset.cmsInsertIndex);
  if (!Number.isFinite(index)) return null;
  const rootRect = root.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    index,
    top: rect.top - rootRect.top,
    left: rect.left - rootRect.left,
    width: rect.width,
    height: rect.height,
    rootWidth: root.clientWidth,
  };
}

function readComponentEditableTarget(element: HTMLElement, root: HTMLElement | null): ComponentEditableTarget | null {
  if (!root) return null;
  const index = Number(element.dataset.cmsComponentIndex);
  if (!Number.isFinite(index)) return null;
  const block = parseDocComponentBlocks(element.outerHTML)[0];
  if (!block) return null;
  const rootRect = root.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    index,
    label: componentKindLabel(block.kind),
    block,
    top: rect.top - rootRect.top,
    left: rect.left - rootRect.left,
    width: rect.width,
    height: rect.height,
    rootWidth: root.clientWidth,
  };
}

function getInlineEditableKind(element: HTMLElement): InlineEditableKind {
  if (element.matches('.section-banner h2')) return 'section-title';
  if (element.matches('h3, h4, h5')) return 'heading';
  if (element.matches('.callout-title')) return 'callout-title';
  if (element.matches('li')) return 'list-item';
  if (element.matches('dt, dd')) return 'definition';
  if (element.matches('th, td')) return 'table-cell';
  if (element.matches('figcaption')) return 'caption';
  return 'paragraph';
}

function getInlineEditableLabel(element: HTMLElement) {
  const kind = getInlineEditableKind(element);
  if (kind === 'section-title') return 'Section title';
  if (kind === 'heading') return 'Heading';
  if (kind === 'callout-title') return 'Callout title';
  if (kind === 'list-item') return 'List item';
  if (kind === 'definition') return element.matches('dt') ? 'Term' : 'Definition';
  if (kind === 'table-cell') return element.matches('th') ? 'Table header' : 'Table cell';
  if (kind === 'caption') return 'Figure caption';
  return element.closest('.callout') ? 'Callout text' : 'Paragraph';
}

function normalizeInlineEditableValue(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function getInlineEditableElementValue(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.cms-inline-edit-button, .cms-inline-delete-button, .cms-screenshot-edit-button, .cms-screenshot-delete-button, .cms-component-actions, .cms-insert-slot').forEach((button) => button.remove());
  clone.querySelectorAll<HTMLElement>('[data-cms-editable-index], [data-cms-editable-kind], [data-cms-editable-label]').forEach((item) => {
    item.removeAttribute('data-cms-editable-index');
    item.removeAttribute('data-cms-editable-kind');
    item.removeAttribute('data-cms-editable-label');
  });
  return sanitizeInlineEditorHtml(clone.innerHTML);
}

function editableTextFromNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (!(node instanceof HTMLElement)) {
    return Array.from(node.childNodes).map(editableTextFromNode).join('');
  }
  if (node.matches('.cms-inline-edit-button, .cms-inline-delete-button, .cms-screenshot-edit-button, .cms-screenshot-delete-button, .cms-component-actions, .cms-insert-slot')) return '';
  if (node.tagName === 'BR') return '\n';
  const content = Array.from(node.childNodes).map(editableTextFromNode).join('');
  if (node.tagName === 'STRONG' || node.tagName === 'B') return `**${content}**`;
  if (node.tagName === 'EM' || node.tagName === 'I') return `*${content}*`;
  if (node.tagName === 'CODE') return `\`${node.textContent ?? content}\``;
  if (node.tagName === 'A') return `[${content}](${node.getAttribute('href') ?? '#'})`;
  if (node.classList.contains('ui')) return formatHighlightSelection(highlightColorFromClass(node), content || node.textContent || '');
  return content;
}

function inlineHtmlToEditableText(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return normalizeInlineEditableValue(Array.from(template.content.childNodes).map(editableTextFromNode).join(''));
}

function convertUiSpansToHighlightTokens(html: string) {
  return html.replace(/<span\b([^>]*)class=(["'])([^"']*\bui\b[^"']*)\2([^>]*)>([\s\S]*?)<\/span>/gi, (_match, _before: string, _quote: string, className: string, _after: string, content: string) => (
    formatHighlightSelection(highlightColorFromClassName(className), inlineHtmlToEditableText(content))
  ));
}

function getScreenshotCaption(element: HTMLElement) {
  const caption = element.querySelector('figcaption');
  if (!caption) return '';
  const clone = caption.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.cms-inline-edit-button, .cms-inline-delete-button, .cms-screenshot-edit-button, .cms-screenshot-delete-button').forEach((button) => button.remove());
  return normalizeInlineEditableValue(clone.textContent ?? '');
}

function getScreenshotMarkers(element: HTMLElement): MarkerDraft[] {
  const markerDescriptions = getMarkerDescriptions(element);
  return Array.from(element.querySelectorAll<HTMLElement>('.doc-marker')).map((marker, index) => {
    const kind = markerKindFromData(marker.dataset.kind);
    const x = readPctStyle(marker, 'left', 12);
    const y = readPctStyle(marker, 'top', 14);
    const w = readPctStyle(marker, 'width', 24);
    const h = readPctStyle(marker, 'height', 16);
    const fallbackPopover = markerDefaultPopoverPosition({ kind, x, y, w, h });
    const animated = marker.dataset.animated === 'true' || (marker.dataset.animated === undefined && kind !== 'shape');
    return {
      id: `marker-${index + 1}`,
      label: normalizeMarkerWords(
        normalizeMarkerLabelPrefix(
          normalizeInlineEditableValue(marker.querySelector('b')?.textContent ?? `Marker ${index + 1}`),
        ),
        kind === 'shape' ? 16 : 3,
      ),
      description: markerDescriptions.get(index + 1) ?? normalizeInlineEditableValue(marker.dataset.description ?? ''),
      kind,
      borderStyle: markerBorderStyleFromData(marker.dataset.borderStyle || marker.style.borderStyle),
      borderColor: normalizeMarkerColor(marker.dataset.borderColor || extractMarkerColorFromStyle(marker.style.border), MARKER_DEFAULT_BORDER_COLOR),
      borderOpacity: normalizeMarkerOpacity(marker.dataset.borderOpacity ?? extractColorOpacityFromStyle(marker.style.border), MARKER_DEFAULT_BORDER_OPACITY),
      backgroundColor: normalizeMarkerColor(marker.dataset.backgroundColor || marker.style.backgroundColor, MARKER_DEFAULT_BACKGROUND_COLOR),
      backgroundOpacity: normalizeMarkerOpacity(
        marker.dataset.backgroundOpacity ?? extractColorOpacityFromStyle(marker.style.backgroundColor),
        defaultBgOpacityFor(kind),
      ),
      textColor: normalizeMarkerColor(marker.dataset.textColor || marker.style.color, MARKER_DEFAULT_TEXT_COLOR),
      textOpacity: normalizeMarkerOpacity(marker.dataset.textOpacity ?? extractColorOpacityFromStyle(marker.style.color), MARKER_DEFAULT_TEXT_OPACITY),
      dialogBackgroundColor: normalizeMarkerColor(marker.dataset.dialogBackgroundColor, MARKER_DEFAULT_DIALOG_BACKGROUND_COLOR),
      dialogBackgroundOpacity: normalizeMarkerOpacity(marker.dataset.dialogBackgroundOpacity, MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY),
      dialogBorderColor: normalizeMarkerColor(marker.dataset.dialogBorderColor, MARKER_DEFAULT_DIALOG_BORDER_COLOR),
      dialogBorderOpacity: normalizeMarkerOpacity(marker.dataset.dialogBorderOpacity, MARKER_DEFAULT_DIALOG_BORDER_OPACITY),
      dialogTextColor: normalizeMarkerColor(marker.dataset.dialogTextColor, MARKER_DEFAULT_DIALOG_TEXT_COLOR),
      dialogTextOpacity: normalizeMarkerOpacity(marker.dataset.dialogTextOpacity, MARKER_DEFAULT_DIALOG_TEXT_OPACITY),
      ctaBackgroundColor: normalizeMarkerColor(marker.dataset.ctaBackgroundColor, MARKER_DEFAULT_CTA_BACKGROUND_COLOR),
      ctaBackgroundOpacity: normalizeMarkerOpacity(marker.dataset.ctaBackgroundOpacity, MARKER_DEFAULT_CTA_BACKGROUND_OPACITY),
      ctaTextColor: normalizeMarkerColor(marker.dataset.ctaTextColor, MARKER_DEFAULT_CTA_TEXT_COLOR),
      ctaTextOpacity: normalizeMarkerOpacity(marker.dataset.ctaTextOpacity, MARKER_DEFAULT_CTA_TEXT_OPACITY),
      targetSectionId: normalizeMarkerTarget(marker.getAttribute('href') || marker.dataset.targetSectionId),
      animated,
      pointerRotation: normalizePointerRotation(marker.dataset.pointerRotation),
      pointerThickness: normalizePointerThickness(marker.dataset.pointerThickness),
      x,
      y,
      w,
      h,
      popoverX: readPctData(marker.dataset.popoverX, fallbackPopover.x),
      popoverY: readPctData(marker.dataset.popoverY, fallbackPopover.y),
      align: markerTextAlign(marker.dataset.labelAlign),
    };
  });
}

function writeScreenshotMarkers(figure: HTMLElement, image: HTMLImageElement, markers: MarkerDraft[]) {
  figure.querySelectorAll('.doc-marker').forEach((marker) => marker.remove());
  figure.querySelectorAll('.marker-description-list').forEach((list) => list.remove());
  if (!markers.length) {
    const existingContainer = image.closest('.annotated-image');
    if (existingContainer && existingContainer.parentElement === figure) {
      existingContainer.replaceWith(image);
    }
    figure.classList.remove('annotated-figure');
    return;
  }

  const container = ensureAnnotatedImageContainer(figure, image);
  figure.classList.add('annotated-figure');
  markers.forEach((marker, markerIndex) => {
    const markerElement = document.createElement('span');
    const href = markerHref(marker);
    const markerDescription = normalizeInlineEditableValue(marker.description);
    const markerLabelValue = markerLabel(marker, markerIndex + 1);
    markerElement.className = `doc-marker marker-${marker.kind}`;
    markerElement.dataset.kind = marker.kind;
    markerElement.dataset.labelAlign = marker.kind === 'shape' ? markerTextAlign(marker.align) : 'center';
    markerElement.dataset.borderStyle = marker.borderStyle;
    markerElement.dataset.borderColor = marker.borderColor;
    markerElement.dataset.borderOpacity = String(normalizeMarkerOpacity(marker.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY));
    markerElement.dataset.backgroundColor = marker.backgroundColor;
    markerElement.dataset.backgroundOpacity = String(normalizeMarkerOpacity(marker.backgroundOpacity, defaultBgOpacityFor(marker.kind)));
    markerElement.dataset.textColor = marker.textColor;
    markerElement.dataset.textOpacity = String(normalizeMarkerOpacity(marker.textOpacity, MARKER_DEFAULT_TEXT_OPACITY));
    markerElement.dataset.dialogBackgroundColor = marker.dialogBackgroundColor;
    markerElement.dataset.dialogBackgroundOpacity = String(normalizeMarkerOpacity(marker.dialogBackgroundOpacity, MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY));
    markerElement.dataset.dialogBorderColor = marker.dialogBorderColor;
    markerElement.dataset.dialogBorderOpacity = String(normalizeMarkerOpacity(marker.dialogBorderOpacity, MARKER_DEFAULT_DIALOG_BORDER_OPACITY));
    markerElement.dataset.dialogTextColor = marker.dialogTextColor;
    markerElement.dataset.dialogTextOpacity = String(normalizeMarkerOpacity(marker.dialogTextOpacity, MARKER_DEFAULT_DIALOG_TEXT_OPACITY));
    markerElement.dataset.ctaBackgroundColor = marker.ctaBackgroundColor;
    markerElement.dataset.ctaBackgroundOpacity = String(normalizeMarkerOpacity(marker.ctaBackgroundOpacity, MARKER_DEFAULT_CTA_BACKGROUND_OPACITY));
    markerElement.dataset.ctaTextColor = marker.ctaTextColor;
    markerElement.dataset.ctaTextOpacity = String(normalizeMarkerOpacity(marker.ctaTextOpacity, MARKER_DEFAULT_CTA_TEXT_OPACITY));
    markerElement.dataset.targetSectionId = normalizeMarkerTarget(marker.targetSectionId);
    markerElement.dataset.animated = marker.animated ? 'true' : 'false';
    markerElement.dataset.pointerRotation = String(normalizePointerRotation(marker.pointerRotation));
    markerElement.dataset.pointerThickness = String(normalizePointerThickness(marker.pointerThickness));
    markerElement.dataset.popoverX = String(clampPct(marker.popoverX));
    markerElement.dataset.popoverY = String(clampPct(marker.popoverY));
    if (markerDescription) markerElement.dataset.description = markerDescription;
    if (marker.kind !== 'shape') {
      markerElement.setAttribute('role', 'button');
      markerElement.setAttribute('tabindex', '0');
      markerElement.setAttribute('aria-expanded', 'false');
      markerElement.setAttribute('aria-label', markerLabelValue);
      if (href) markerElement.dataset.targetUrl = href;
    }
    markerElement.setAttribute('style', markerStyleMarkup(marker));
    markerElement.innerHTML = `${markerHotspotWavesMarkup(marker.kind)}<b class="doc-marker-chip">${escapeHtml(markerLabelValue)}</b>${markerHotspotPopoverMarkup(marker, markerIndex + 1)}`;
    container.append(markerElement);
  });
  writeMarkerDescriptions(figure, markers);
}

function getMarkerDescriptions(element: HTMLElement) {
  const descriptions = new Map<number, string>();
  element.querySelectorAll<HTMLElement>('.marker-description-list .marker-description').forEach((item, index) => {
    const markerIndex = Number(item.dataset.markerDescriptionIndex);
    const descriptionElement = (item.querySelector('p') ?? item).cloneNode(true) as HTMLElement;
    descriptionElement.querySelectorAll('.cms-inline-edit-button, .cms-inline-delete-button, .cms-screenshot-edit-button, .cms-screenshot-delete-button').forEach((button) => button.remove());
    descriptionElement.querySelectorAll('br').forEach((breakElement) => breakElement.replaceWith('\n'));
    const description = normalizeInlineEditableValue(descriptionElement.textContent ?? '');
    if (description) descriptions.set(Number.isFinite(markerIndex) ? markerIndex : index + 1, description);
  });
  return descriptions;
}

function writeMarkerDescriptions(figure: HTMLElement, markers: MarkerDraft[]) {
  const descriptionMarkup = markerDescriptionListMarkup(markers);
  if (!descriptionMarkup) return;
  const template = document.createElement('template');
  template.innerHTML = descriptionMarkup;
  const descriptionList = template.content.firstElementChild;
  if (!descriptionList) return;
  const caption = figure.querySelector('figcaption');
  if (caption) {
    figure.insertBefore(descriptionList, caption);
  } else {
    figure.append(descriptionList);
  }
}

function ensureAnnotatedImageContainer(figure: HTMLElement, image: HTMLImageElement) {
  const existingContainer = image.closest<HTMLElement>('.annotated-image');
  if (existingContainer) return existingContainer;
  const container = document.createElement('div');
  container.className = 'annotated-image';
  image.replaceWith(container);
  container.append(image);
  const caption = figure.querySelector('figcaption');
  if (caption && container.nextSibling !== caption) {
    figure.insertBefore(container, caption);
  }
  return container;
}

function readPctStyle(element: HTMLElement, property: 'left' | 'top' | 'width' | 'height', fallback: number) {
  const rawValue = element.style[property];
  const value = Number.parseFloat(rawValue);
  return Number.isFinite(value) ? clampPct(value) : fallback;
}

function markerTextAlign(value: string | undefined | null): MarkerTextAlign {
  return value === 'center' || value === 'right' ? value : 'left';
}

function markerKindFromData(value: string | undefined | null): MarkerKind {
  return value === 'link' || value === 'pointer' ? value : 'shape';
}

function markerBorderStyleFromData(value: string | undefined | null): MarkerBorderStyle {
  return value === 'dotted' || value === 'dashed' ? value : 'solid';
}

function normalizeMarkerColor(value: string | undefined | null, fallback: string) {
  if (!value) return fallback;
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) ? value.trim() : fallback;
}

function normalizeMarkerOpacity(value: number | string | undefined | null, fallback = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(clampBetween(parsed, 0, 100));
}

function markerOpacityAlpha(value: number | string | undefined | null, fallback = 100) {
  return normalizeMarkerOpacity(value, fallback) / 100;
}

function extractColorOpacityFromStyle(rawStyle: string | undefined | null) {
  const value = (rawStyle ?? '').trim().toLowerCase();
  if (!value) return null;
  const hexMatch = value.match(/^#(?:[0-9a-f]{4}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    const token = hexMatch[0].replace('#', '');
    if (token.length === 4) {
      const alphaHex = token[3] + token[3];
      return Math.round((Number.parseInt(alphaHex, 16) / 255) * 100);
    }
    const alphaHex = token.slice(6, 8);
    return Math.round((Number.parseInt(alphaHex, 16) / 255) * 100);
  }
  const rgbaMatch = value.match(/rgba?\(([^)]+)\)/i);
  if (!rgbaMatch) return null;
  const channels = rgbaMatch[1].split(',').map((item) => item.trim());
  if (channels.length < 4) return 100;
  const alphaToken = channels[3];
  if (alphaToken.endsWith('%')) {
    const parsed = Number.parseFloat(alphaToken.slice(0, -1));
    return Number.isFinite(parsed) ? normalizeMarkerOpacity(parsed) : null;
  }
  const parsed = Number.parseFloat(alphaToken);
  if (!Number.isFinite(parsed)) return null;
  return normalizeMarkerOpacity(parsed * 100);
}

function normalizePointerRotation(value: number | string | undefined | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return MARKER_DEFAULT_POINTER_ROTATION;
  const normalized = ((parsed % 360) + 360) % 360;
  return Math.round(normalized);
}

function normalizePointerThickness(value: number | string | undefined | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return MARKER_DEFAULT_POINTER_THICKNESS;
  return clampBetween(parsed, 1, 6);
}

function normalizeMarkerLabelPrefix(value: string) {
  return value.replace(/^\d+\.\s*/, '').trim();
}

function normalizeMarkerTarget(value: string | undefined | null) {
  if (!value) return MARKER_DEFAULT_POINTER_TARGET;
  const normalized = value.trim();
  if (!normalized) return MARKER_DEFAULT_POINTER_TARGET;
  if (normalized.startsWith('#')) return normalized;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(normalized) || normalized.startsWith('/')) return normalized;
  return `#${normalized}`;
}

function markerTargetMode(value: string | undefined | null): 'section' | 'external' {
  const normalized = normalizeMarkerTarget(value);
  if (!normalized) return 'section';
  return normalized.startsWith('#') ? 'section' : 'external';
}

function markerSectionTargetId(value: string | undefined | null) {
  const normalized = normalizeMarkerTarget(value);
  return normalized.startsWith('#') ? normalized.slice(1) : '';
}

function extractMarkerColorFromStyle(rawStyle: string) {
  const match = /#(?:[0-9a-f]{3}|[0-9a-f]{6})/i.exec(rawStyle ?? '');
  return match ? match[0] : '';
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{3,6}$/i.test(normalized)) return `rgba(0, 0, 0, ${alpha})`;
  const expanded = normalized.length === 3 ? normalized.split('').map((char) => char + char).join('') : normalized;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function normalizeMarkerWords(value: string, maxWords: number) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(' ');
}

function markerKindLabel(kind: MarkerKind) {
  return MARKER_KINDS_LABELS[kind];
}

function markerDefaultLabel(kind: MarkerKind, markerIndex: number, fallbackLabel = '') {
  // Shape + text accept longer copy (16 words); link/pointer are CTA-style chips (3 words).
  const maxWords = kind === 'shape' || kind === 'text' ? 16 : 3;
  const normalizedLabel = normalizeMarkerWords(fallbackLabel, maxWords);
  if (normalizedLabel) return normalizedLabel;
  if (kind === 'link') return MARKER_DEFAULT_LINK_LABEL;
  if (kind === 'pointer') return `Pointer ${markerIndex}`;
  if (kind === 'text') return 'Add text';
  return `Marker ${markerIndex}`;
}

function markerLabelFromDraft(value: string, kind: MarkerKind, markerIndex: number) {
  return markerDefaultLabel(kind, markerIndex, value);
}

function markerLabel(marker: MarkerDraft, markerIndex: number) {
  if (marker.kind === 'link') {
    return markerDefaultLabel('link', markerIndex, marker.label);
  }
  if (marker.kind === 'pointer') {
    return markerDefaultLabel('pointer', markerIndex, marker.label);
  }
  return markerDefaultLabel('shape', markerIndex, marker.label);
}

function markerDefaultPopoverPosition(marker: Pick<MarkerDraft, 'kind' | 'x' | 'y' | 'w' | 'h'>) {
  const markerWidth = marker.kind === 'shape' ? marker.w : Math.min(marker.w, marker.h);
  const markerHeight = marker.kind === 'shape' ? marker.h : Math.min(marker.w, marker.h);
  return {
    x: clampBetween(marker.x + markerWidth + 1.2, 0, 88),
    y: clampBetween(marker.y + markerHeight + 1.5, 0, 88),
  };
}

function markerPopoverPosition(marker: Pick<MarkerDraft, 'kind' | 'x' | 'y' | 'w' | 'h' | 'popoverX' | 'popoverY'>) {
  const fallback = markerDefaultPopoverPosition(marker);
  return {
    x: readPctData(String(marker.popoverX), fallback.x),
    y: readPctData(String(marker.popoverY), fallback.y),
  };
}

function markerDraftFromSectionEditor(draft: SectionEditorDraft): MarkerDraft {
  const baseMarker = {
    kind: draft.markerKind,
    x: clampBetween(draft.markerX, 0, 100),
    y: clampBetween(draft.markerY, 0, 100),
    w: clampBetween(draft.markerW, MIN_MARKER_SIZE, 100),
    h: clampBetween(draft.markerH, MIN_MARKER_SIZE, 100),
  };
  const popover = markerDefaultPopoverPosition(baseMarker);
  return {
    id: 'marker-1',
    label: markerLabelFromDraft(draft.markerLabel, draft.markerKind, 1),
    description: draft.markerDescription,
    x: baseMarker.x,
    y: baseMarker.y,
    w: baseMarker.w,
    h: baseMarker.h,
    popoverX: popover.x,
    popoverY: popover.y,
    align: draft.markerAlign,
    kind: draft.markerKind,
    borderStyle: draft.markerBorderStyle,
    borderColor: draft.markerBorderColor,
    borderOpacity: normalizeMarkerOpacity(draft.markerBorderOpacity, MARKER_DEFAULT_BORDER_OPACITY),
    backgroundColor: draft.markerBackgroundColor,
    backgroundOpacity: normalizeMarkerOpacity(draft.markerBackgroundOpacity, draft.markerKind === 'shape' ? MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY : MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY),
    textColor: draft.markerTextColor,
    textOpacity: normalizeMarkerOpacity(draft.markerTextOpacity, MARKER_DEFAULT_TEXT_OPACITY),
    dialogBackgroundColor: MARKER_DEFAULT_DIALOG_BACKGROUND_COLOR,
    dialogBackgroundOpacity: MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY,
    dialogBorderColor: MARKER_DEFAULT_DIALOG_BORDER_COLOR,
    dialogBorderOpacity: MARKER_DEFAULT_DIALOG_BORDER_OPACITY,
    dialogTextColor: MARKER_DEFAULT_DIALOG_TEXT_COLOR,
    dialogTextOpacity: MARKER_DEFAULT_DIALOG_TEXT_OPACITY,
    ctaBackgroundColor: MARKER_DEFAULT_CTA_BACKGROUND_COLOR,
    ctaBackgroundOpacity: MARKER_DEFAULT_CTA_BACKGROUND_OPACITY,
    ctaTextColor: MARKER_DEFAULT_CTA_TEXT_COLOR,
    ctaTextOpacity: MARKER_DEFAULT_CTA_TEXT_OPACITY,
    targetSectionId: draft.markerTargetSectionId,
    animated: draft.markerAnimated,
    pointerRotation: normalizePointerRotation(draft.markerPointerRotation),
    pointerThickness: normalizePointerThickness(draft.markerPointerThickness),
  };
}

function markerHref(marker: MarkerDraft) {
  if (marker.kind === 'shape' || !marker.targetSectionId.trim()) return null;
  return normalizeMarkerTarget(marker.targetSectionId);
}

function markerHotspotPopoverMarkup(marker: MarkerDraft, markerIndex: number) {
  if (marker.kind === 'shape') return '';
  const description = normalizeInlineEditableValue(marker.description);
  const href = markerHref(marker);
  const ctaLabel = markerLabel(marker, markerIndex);
  const ctaTarget = href && markerTargetMode(href) === 'external' ? ' target="_blank" rel="noopener noreferrer"' : '';
  const descriptionMarkup = description ? escapeHtml(description).replace(/\n/g, '<br>') : 'Open this hotspot for detailed guidance.';
  const ctaMarkup = href ? `<a class="doc-marker-popover-cta" href="${escapeHtml(href)}"${ctaTarget}>${escapeHtml(ctaLabel || MARKER_DEFAULT_LINK_LABEL)}</a>` : '';
  return `<span class="doc-marker-popover" role="dialog" aria-live="polite"><span class="doc-marker-popover-text">${descriptionMarkup}</span>${ctaMarkup}</span>`;
}

function markerHotspotWavesMarkup(kind: MarkerKind) {
  // Shape (region overlay) and Text (plain on-screenshot text) skip the
  // attention-grabbing wave/glow layers entirely.
  if (kind === 'shape' || kind === 'text') return '';
  const pointerGlyph = kind === 'pointer' ? '<span class="doc-marker-pointer-icon" aria-hidden="true"></span>' : '';
  const linkGlyph = kind === 'link' ? '<span class="doc-marker-link-icon" aria-hidden="true"></span>' : '';
  return `<span class="doc-marker-wave wave-a" aria-hidden="true"></span><span class="doc-marker-wave wave-b" aria-hidden="true"></span><span class="doc-marker-wave wave-c" aria-hidden="true"></span><span class="doc-marker-core-glow" aria-hidden="true"></span>${pointerGlyph}${linkGlyph}`;
}

function markerStyleMarkup(marker: MarkerDraft) {
  const left = clampPct(marker.x);
  const top = clampPct(marker.y);
  const width = clampBetween(marker.w, MIN_MARKER_SIZE, 100 - left);
  const height = clampBetween(marker.h, MIN_MARKER_SIZE, 100 - top);
  const pointerRotation = normalizePointerRotation(marker.pointerRotation);
  const pointerThickness = normalizePointerThickness(marker.pointerThickness);
  const isLink = marker.kind === 'link';
  const borderColor = hexToRgba(marker.borderColor, markerOpacityAlpha(marker.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY));
  const backgroundColor = hexToRgba(
    marker.backgroundColor,
    markerOpacityAlpha(
      marker.backgroundOpacity,
      defaultBgOpacityFor(marker.kind),
    ),
  );
  const textColor = hexToRgba(marker.textColor, markerOpacityAlpha(marker.textOpacity, MARKER_DEFAULT_TEXT_OPACITY));
  const dialogBackgroundColor = hexToRgba(marker.dialogBackgroundColor, markerOpacityAlpha(marker.dialogBackgroundOpacity, MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY));
  const dialogBorderColor = hexToRgba(marker.dialogBorderColor, markerOpacityAlpha(marker.dialogBorderOpacity, MARKER_DEFAULT_DIALOG_BORDER_OPACITY));
  const dialogTextColor = hexToRgba(marker.dialogTextColor, markerOpacityAlpha(marker.dialogTextOpacity, MARKER_DEFAULT_DIALOG_TEXT_OPACITY));
  const ctaBackgroundColor = hexToRgba(marker.ctaBackgroundColor, markerOpacityAlpha(marker.ctaBackgroundOpacity, MARKER_DEFAULT_CTA_BACKGROUND_OPACITY));
  const ctaTextColor = hexToRgba(marker.ctaTextColor, markerOpacityAlpha(marker.ctaTextOpacity, MARKER_DEFAULT_CTA_TEXT_OPACITY));
  const fillSoftAlpha = markerOpacityAlpha(
    marker.backgroundOpacity,
    defaultBgOpacityFor(marker.kind),
  ) * 0.2;
  const glowAlpha = marker.animated
    ? markerOpacityAlpha(
      marker.backgroundOpacity,
      defaultBgOpacityFor(marker.kind),
    ) * 0.4
    : 0;
  return (
    `position:absolute;z-index:2;display:block;` +
    `left:${left}%;` +
    `top:${top}%;` +
    `width:${width}%;` +
    `height:${height}%;` +
    `border-radius:${marker.kind === 'shape' ? '6px' : isLink ? '999px' : '0'};` +
    `border:${marker.kind === 'shape' ? `3px ${marker.borderStyle} ${borderColor}` : isLink ? `2px solid ${borderColor}` : '0'};` +
    `color:${textColor};` +
    `background:${marker.kind === 'shape' || isLink ? backgroundColor : 'transparent'};` +
    `--marker-text:${textColor};` +
    `--marker-fill:${backgroundColor};` +
    `--marker-fill-soft:${hexToRgba(marker.backgroundColor, fillSoftAlpha)};` +
    `--marker-border:${borderColor};` +
    `--marker-pointer-rotation:${pointerRotation}deg;` +
    `--marker-pointer-thickness:${pointerThickness}px;` +
    `--marker-popover-bg:${dialogBackgroundColor};` +
    `--marker-popover-border:${dialogBorderColor};` +
    `--marker-popover-text:${dialogTextColor};` +
    `--marker-cta-bg:${ctaBackgroundColor};` +
    `--marker-cta-text:${ctaTextColor};` +
    `--marker-glow:${hexToRgba(marker.backgroundColor, glowAlpha)};` +
    `--marker-animated:${marker.animated ? '1' : '0'};` +
    `--marker-animation-state:${marker.animated ? 'running' : 'paused'};`
  );
}

function markerElementStyle(marker: MarkerDraft): CSSProperties {
  const left = clampPct(marker.x);
  const top = clampPct(marker.y);
  const width = clampBetween(marker.w, MIN_MARKER_SIZE, 100 - left);
  const height = clampBetween(marker.h, MIN_MARKER_SIZE, 100 - top);
  const pointerRotation = normalizePointerRotation(marker.pointerRotation);
  const pointerThickness = normalizePointerThickness(marker.pointerThickness);
  const isLink = marker.kind === 'link';
  const borderColor = hexToRgba(marker.borderColor, markerOpacityAlpha(marker.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY));
  const backgroundColor = hexToRgba(
    marker.backgroundColor,
    markerOpacityAlpha(
      marker.backgroundOpacity,
      defaultBgOpacityFor(marker.kind),
    ),
  );
  const textColor = hexToRgba(marker.textColor, markerOpacityAlpha(marker.textOpacity, MARKER_DEFAULT_TEXT_OPACITY));
  const dialogBackgroundColor = hexToRgba(marker.dialogBackgroundColor, markerOpacityAlpha(marker.dialogBackgroundOpacity, MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY));
  const dialogBorderColor = hexToRgba(marker.dialogBorderColor, markerOpacityAlpha(marker.dialogBorderOpacity, MARKER_DEFAULT_DIALOG_BORDER_OPACITY));
  const dialogTextColor = hexToRgba(marker.dialogTextColor, markerOpacityAlpha(marker.dialogTextOpacity, MARKER_DEFAULT_DIALOG_TEXT_OPACITY));
  const ctaBackgroundColor = hexToRgba(marker.ctaBackgroundColor, markerOpacityAlpha(marker.ctaBackgroundOpacity, MARKER_DEFAULT_CTA_BACKGROUND_OPACITY));
  const ctaTextColor = hexToRgba(marker.ctaTextColor, markerOpacityAlpha(marker.ctaTextOpacity, MARKER_DEFAULT_CTA_TEXT_OPACITY));
  const fillSoftAlpha = markerOpacityAlpha(
    marker.backgroundOpacity,
    defaultBgOpacityFor(marker.kind),
  ) * 0.2;
  const glowAlpha = marker.animated
    ? markerOpacityAlpha(
      marker.backgroundOpacity,
      defaultBgOpacityFor(marker.kind),
    ) * 0.4
    : 0;
  const style: CSSProperties & Record<string, string> = {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
    borderRadius: marker.kind === 'shape' ? '6px' : isLink ? '999px' : '0',
    border: marker.kind === 'shape' ? `${3}px ${marker.borderStyle} ${borderColor}` : isLink ? `${2}px solid ${borderColor}` : '0',
    color: textColor,
    background: marker.kind === 'shape' || isLink ? backgroundColor : 'transparent',
    '--marker-text': textColor,
    '--marker-fill': backgroundColor,
    '--marker-fill-soft': hexToRgba(marker.backgroundColor, fillSoftAlpha),
    '--marker-border': borderColor,
    '--marker-pointer-rotation': `${pointerRotation}deg`,
    '--marker-pointer-thickness': `${pointerThickness}px`,
    '--marker-popover-bg': dialogBackgroundColor,
    '--marker-popover-border': dialogBorderColor,
    '--marker-popover-text': dialogTextColor,
    '--marker-cta-bg': ctaBackgroundColor,
    '--marker-cta-text': ctaTextColor,
    '--marker-glow': hexToRgba(marker.backgroundColor, glowAlpha),
    '--marker-animated': marker.animated ? '1' : '0',
    '--marker-animation-state': marker.animated ? 'running' : 'paused',
  };
  return style;
}

function markerPopoverStyle(marker: MarkerDraft): CSSProperties {
  const popover = markerPopoverPosition(marker);
  const style: CSSProperties & Record<string, string> = {
    left: `${popover.x}%`,
    top: `${popover.y}%`,
    '--marker-popover-bg': hexToRgba(marker.dialogBackgroundColor, markerOpacityAlpha(marker.dialogBackgroundOpacity, MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY)),
    '--marker-popover-border': hexToRgba(marker.dialogBorderColor, markerOpacityAlpha(marker.dialogBorderOpacity, MARKER_DEFAULT_DIALOG_BORDER_OPACITY)),
    '--marker-popover-text': hexToRgba(marker.dialogTextColor, markerOpacityAlpha(marker.dialogTextOpacity, MARKER_DEFAULT_DIALOG_TEXT_OPACITY)),
    '--marker-cta-bg': hexToRgba(marker.ctaBackgroundColor, markerOpacityAlpha(marker.ctaBackgroundOpacity, MARKER_DEFAULT_CTA_BACKGROUND_OPACITY)),
    '--marker-cta-text': hexToRgba(marker.ctaTextColor, markerOpacityAlpha(marker.ctaTextOpacity, MARKER_DEFAULT_CTA_TEXT_OPACITY)),
  };
  return style;
}

function themePresetStyle(theme: ThemePreset): CSSProperties {
  return {
    '--c-red': theme.primary,
    '--c-sky-blue': theme.accent,
    '--c-eerie-black': theme.ink,
    '--c-pale-white': theme.surface,
    '--marker-fill': theme.markerFill,
    '--marker-border': theme.markerBorder,
    '--marker-fill-soft': hexToRgba(theme.markerFill, 0.18),
    '--marker-glow': hexToRgba(theme.markerFill, 0.34),
  } as CSSProperties;
}

function highlightColor(value: string | undefined | null): HighlightColor {
  return HIGHLIGHT_PRESETS.some((preset) => preset.id === value) ? value as HighlightColor : 'black';
}

function highlightColorFromClass(element: HTMLElement): HighlightColor {
  return highlightColorFromClassName(element.className);
}

function highlightColorFromClassName(className: string): HighlightColor {
  return HIGHLIGHT_PRESETS.find((preset) => className.split(/\s+/).includes(preset.id))?.id ?? 'black';
}

function sanitizeInlineEditorHtml(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return Array.from(template.content.childNodes).map(sanitizeInlineNode).join('').replace(/(<br>){3,}/g, '<br><br>').replace(/^(<br>)+|(<br>)+$/g, '');
}

function sanitizeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '');
  if (!(node instanceof HTMLElement)) return Array.from(node.childNodes).map(sanitizeInlineNode).join('');
  if (node.matches('.cms-inline-edit-button, .cms-inline-delete-button, .cms-screenshot-edit-button, .cms-screenshot-delete-button, .cms-component-actions, .cms-insert-slot, script, style')) return '';

  const content = Array.from(node.childNodes).map(sanitizeInlineNode).join('');
  if (node.tagName === 'BR') return '<br>';
  if (node.tagName === 'STRONG' || node.tagName === 'B') return `<strong>${content}</strong>`;
  if (node.tagName === 'EM' || node.tagName === 'I') return `<em>${content}</em>`;
  if (node.tagName === 'CODE') return `<code>${sanitizeInlineCodeContent(node)}</code>`;
  if (node.tagName === 'A') return `<a href="${escapeHtml(safeInlineHref(node.getAttribute('href')))}">${content}</a>`;
  if (node.tagName === 'SPAN' && node.classList.contains('ui')) return `<span class="ui ${highlightColorFromClass(node)}">${content}</span>`;
  if (node.tagName === 'DIV' || node.tagName === 'P') return content ? `${content}<br>` : '<br>';
  return content;
}

function safeInlineHref(href: string | null) {
  const value = (href ?? '').trim();
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(value)) return value;
  return '#';
}

function safeExternalUrl(url: string | null) {
  const value = (url ?? '').trim();
  if (!/^https?:\/\//i.test(value)) return '';
  try {
    return new URL(value).toString();
  } catch {
    return '';
  }
}

function sanitizeInlineCodeContent(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '');
  if (!(node instanceof HTMLElement)) return Array.from(node.childNodes).map(sanitizeInlineCodeContent).join('');
  if (node.matches('.cms-inline-edit-button, .cms-inline-delete-button, .cms-screenshot-edit-button, .cms-screenshot-delete-button, .cms-component-actions, .cms-insert-slot, script, style')) return '';
  if (node.tagName === 'BR') return '<br>';
  return Array.from(node.childNodes).map(sanitizeInlineCodeContent).join('');
}

function inlineEditorHtmlToPlainText(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html.replace(/<br\s*\/?>/gi, '\n');
  return normalizeInlineEditableValue(template.content.textContent ?? '');
}

function selectionBelongsTo(selection: Selection, root: HTMLElement) {
  return nodeBelongsTo(selection.anchorNode, root) && nodeBelongsTo(selection.focusNode, root);
}

function nodeBelongsTo(node: Node | null, root: HTMLElement) {
  if (!node) return false;
  return node === root || root.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode);
}

function placeCaretAtEnd(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function wrapCurrentSelection(tagName: 'span' | 'code', attributes: Record<string, string> = {}) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const wrapper = document.createElement(tagName);
  Object.entries(attributes).forEach(([key, value]) => wrapper.setAttribute(key, value));
  wrapper.append(range.extractContents());
  range.insertNode(wrapper);

  const nextRange = document.createRange();
  nextRange.selectNodeContents(wrapper);
  selection.removeAllRanges();
  selection.addRange(nextRange);
}

function toggleCurrentSelectionCode(root: HTMLElement | null) {
  const selection = window.getSelection();
  if (!root || !selection || !selection.rangeCount || selection.isCollapsed) return;
  const existingCode = closestSelectionElement(selection, 'code', root);
  if (existingCode) {
    const unwrappedNodes = unwrapElement(existingCode);
    selectNodeRange(unwrappedNodes);
    return;
  }
  wrapCurrentSelection('code');
  normalizeNestedInlineCode(root);
}

function closestSelectionElement(selection: Selection, selector: string, root: HTMLElement) {
  const nodes = [selection.anchorNode, selection.focusNode, selection.getRangeAt(0).commonAncestorContainer];
  for (const node of nodes) {
    const element = node instanceof HTMLElement ? node : node?.parentElement;
    const match = element?.closest<HTMLElement>(selector);
    if (match && root.contains(match)) return match;
  }
  return null;
}

function unwrapElement(element: HTMLElement) {
  const parent = element.parentNode;
  if (!parent) return [];
  const nodes: Node[] = [];
  while (element.firstChild) {
    nodes.push(element.firstChild);
    parent.insertBefore(element.firstChild, element);
  }
  parent.removeChild(element);
  return nodes;
}

function selectNodeRange(nodes: Node[]) {
  if (!nodes.length) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStartBefore(nodes[0]);
  range.setEndAfter(nodes[nodes.length - 1]);
  selection.removeAllRanges();
  selection.addRange(range);
}

function normalizeNestedInlineCode(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('code code').forEach((element) => {
    unwrapElement(element);
  });
}

function resizeMarker(marker: Pick<MarkerDraft, 'x' | 'y' | 'w' | 'h'>, edge: MarkerResizeEdge, pointerX: number, pointerY: number): Partial<MarkerDraft> {
  const right = marker.x + marker.w;
  const bottom = marker.y + marker.h;
  const next: Partial<MarkerDraft> = {};

  if (edge.includes('e')) {
    next.w = clampBetween(pointerX - marker.x, MIN_MARKER_SIZE, 100 - marker.x);
  }
  if (edge.includes('s')) {
    next.h = clampBetween(pointerY - marker.y, MIN_MARKER_SIZE, 100 - marker.y);
  }
  if (edge.includes('w')) {
    const nextX = clampBetween(pointerX, 0, right - MIN_MARKER_SIZE);
    next.x = nextX;
    next.w = right - nextX;
  }
  if (edge.includes('n')) {
    const nextY = clampBetween(pointerY, 0, bottom - MIN_MARKER_SIZE);
    next.y = nextY;
    next.h = bottom - nextY;
  }

  return next;
}

function getMarkerResizeEdge(event: ReactPointerEvent<HTMLElement>, rect: DOMRect): MarkerResizeEdge | null {
  const threshold = clampBetween(Math.min(rect.width, rect.height) * 0.22, 4, 10);
  const nearLeft = event.clientX - rect.left <= threshold;
  const nearRight = rect.right - event.clientX <= threshold;
  const nearTop = event.clientY - rect.top <= threshold;
  const nearBottom = rect.bottom - event.clientY <= threshold;

  if (nearTop && nearLeft) return 'nw';
  if (nearTop && nearRight) return 'ne';
  if (nearBottom && nearRight) return 'se';
  if (nearBottom && nearLeft) return 'sw';
  if (nearTop) return 'n';
  if (nearRight) return 'e';
  if (nearBottom) return 's';
  if (nearLeft) return 'w';
  return null;
}

function markerEdgeCanRotate(edge: MarkerResizeEdge) {
  return edge === 'nw' || edge === 'ne' || edge === 'se' || edge === 'sw';
}

function markerAngleFromCenter(pointerX: number, pointerY: number, centerX: number, centerY: number) {
  return (Math.atan2(pointerY - centerY, pointerX - centerX) * 180) / Math.PI;
}

function nextMarkerDraft(markers: MarkerDraft[], kind: MarkerKind = 'shape'): MarkerDraft {
  let nextNumber = markers.length + 1;
  let id = `marker-${nextNumber}`;
  while (markers.some((marker) => marker.id === id)) {
    nextNumber += 1;
    id = `marker-${nextNumber}`;
  }
  const baseMarker = {
    kind,
    x: 12,
    y: 14,
    // Shape regions are rectangular; link/pointer/text use square footprints.
    // CSS forces 1:1 aspect-ratio on link so the rendered ring is a circle.
    w: kind === 'shape' ? 24 : kind === 'text' ? 18 : 12,
    h: kind === 'shape' ? 16 : kind === 'text' ? 8 : 12,
  };
  const popover = markerDefaultPopoverPosition(baseMarker);
  return {
    id,
    label: markerDefaultLabel(kind, nextNumber),
    description: '',
    x: baseMarker.x,
    y: baseMarker.y,
    w: baseMarker.w,
    h: baseMarker.h,
    popoverX: popover.x,
    popoverY: popover.y,
    align: kind === 'shape' ? 'left' : 'center',
    kind,
    borderStyle: MARKER_DEFAULT_BORDER_STYLE,
    borderColor: MARKER_DEFAULT_BORDER_COLOR,
    borderOpacity: MARKER_DEFAULT_BORDER_OPACITY,
    backgroundColor: MARKER_DEFAULT_BACKGROUND_COLOR,
    backgroundOpacity: defaultBgOpacityFor(kind),
    textColor: MARKER_DEFAULT_TEXT_COLOR,
    textOpacity: MARKER_DEFAULT_TEXT_OPACITY,
    dialogBackgroundColor: MARKER_DEFAULT_DIALOG_BACKGROUND_COLOR,
    dialogBackgroundOpacity: MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY,
    dialogBorderColor: MARKER_DEFAULT_DIALOG_BORDER_COLOR,
    dialogBorderOpacity: MARKER_DEFAULT_DIALOG_BORDER_OPACITY,
    dialogTextColor: MARKER_DEFAULT_DIALOG_TEXT_COLOR,
    dialogTextOpacity: MARKER_DEFAULT_DIALOG_TEXT_OPACITY,
    ctaBackgroundColor: MARKER_DEFAULT_CTA_BACKGROUND_COLOR,
    ctaBackgroundOpacity: MARKER_DEFAULT_CTA_BACKGROUND_OPACITY,
    ctaTextColor: MARKER_DEFAULT_CTA_TEXT_COLOR,
    ctaTextOpacity: MARKER_DEFAULT_CTA_TEXT_OPACITY,
    targetSectionId: MARKER_DEFAULT_POINTER_TARGET,
    animated: kind === 'shape' ? MARKER_DEFAULT_ANIMATION : true,
    pointerRotation: MARKER_DEFAULT_POINTER_ROTATION,
    pointerThickness: MARKER_DEFAULT_POINTER_THICKNESS,
  };
}

function normalizeMarkerColorPresets(presets: MarkerColorPreset[]) {
  const locked = MARKER_COLOR_PRESETS_DEFAULT.map((preset) => ({ ...preset, locked: true }));
  const lockedIds = new Set(locked.map((preset) => preset.id));
  const usedIds = new Set(locked.map((preset) => preset.id));
  const usedPaletteKeys = new Set(locked.map((preset) => markerColorPresetKey(preset)));
  const custom: MarkerColorPreset[] = [];
  const source = Array.isArray(presets) ? presets : [];

  source.forEach((preset, index) => {
    if (!preset || typeof preset !== 'object') return;
    const borderColor = normalizeMarkerColor(preset.borderColor, MARKER_DEFAULT_BORDER_COLOR);
    const borderOpacity = normalizeMarkerOpacity((preset as Partial<MarkerColorPreset>).borderOpacity, MARKER_DEFAULT_BORDER_OPACITY);
    const backgroundColor = normalizeMarkerColor(preset.backgroundColor, MARKER_DEFAULT_BACKGROUND_COLOR);
    const backgroundOpacity = normalizeMarkerOpacity((preset as Partial<MarkerColorPreset>).backgroundOpacity, MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY);
    const textColor = normalizeMarkerColor(preset.textColor, MARKER_DEFAULT_TEXT_COLOR);
    const textOpacity = normalizeMarkerOpacity((preset as Partial<MarkerColorPreset>).textOpacity, MARKER_DEFAULT_TEXT_OPACITY);
    const paletteKey = markerColorPresetKey({ borderColor, borderOpacity, backgroundColor, backgroundOpacity, textColor, textOpacity });
    if (usedPaletteKeys.has(paletteKey)) return;
    if (preset.id && lockedIds.has(preset.id)) return;
    usedPaletteKeys.add(paletteKey);
    const baseId = preset.id && !usedIds.has(preset.id) ? preset.id : `custom-migrated-${index + 1}`;
    let resolvedId = baseId;
    let idIndex = 2;
    while (usedIds.has(resolvedId)) {
      resolvedId = `${baseId}-${idIndex}`;
      idIndex += 1;
    }
    usedIds.add(resolvedId);
    custom.push({
      id: resolvedId,
      name: (preset.name || `Preset ${custom.length + 1}`).trim() || `Preset ${custom.length + 1}`,
      borderColor,
      borderOpacity,
      backgroundColor,
      backgroundOpacity,
      textColor,
      textOpacity,
    });
  });

  const customLimit = Math.max(0, MARKER_COLOR_PRESET_LIMIT - locked.length);
  return [...locked, ...custom.slice(-customLimit)];
}

function normalizeReaderAccent(value: unknown): string {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) {
    return value;
  }
  return '#ff1b23';
}

function normalizeReaderDefaultMode(value: unknown): 'light' | 'dark' | 'system' {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return 'system';
}

function normalizeThemePresets(presets: ThemePreset[]) {
  const locked = DEFAULT_THEME_PRESETS.map((preset) => ({ ...preset, locked: true }));
  const lockedIds = new Set(locked.map((preset) => preset.id));
  const usedIds = new Set(locked.map((preset) => preset.id));
  const custom: ThemePreset[] = [];
  const source = Array.isArray(presets) ? presets : [];

  source.forEach((preset, index) => {
    if (!preset || typeof preset !== 'object' || lockedIds.has(preset.id)) return;
    const baseId = preset.id && !usedIds.has(preset.id) ? preset.id : `theme-custom-${index + 1}`;
    let resolvedId = baseId;
    let idIndex = 2;
    while (usedIds.has(resolvedId)) {
      resolvedId = `${baseId}-${idIndex}`;
      idIndex += 1;
    }
    usedIds.add(resolvedId);
    custom.push({
      id: resolvedId,
      name: (preset.name || `Theme ${custom.length + 1}`).trim() || `Theme ${custom.length + 1}`,
      primary: normalizeMarkerColor(preset.primary, DEFAULT_THEME_PRESETS[0].primary),
      accent: normalizeMarkerColor(preset.accent, DEFAULT_THEME_PRESETS[0].accent),
      ink: normalizeMarkerColor(preset.ink, DEFAULT_THEME_PRESETS[0].ink),
      surface: normalizeMarkerColor(preset.surface, DEFAULT_THEME_PRESETS[0].surface),
      markerFill: normalizeMarkerColor(preset.markerFill, DEFAULT_THEME_PRESETS[0].markerFill),
      markerBorder: normalizeMarkerColor(preset.markerBorder, DEFAULT_THEME_PRESETS[0].markerBorder),
      readerAccent: normalizeReaderAccent(preset.readerAccent),
      readerDefaultMode: normalizeReaderDefaultMode(preset.readerDefaultMode),
    });
  });

  const customLimit = Math.max(0, THEME_PRESET_LIMIT - locked.length);
  return [...locked, ...custom.slice(-customLimit)];
}

function resolveThemePreset(presets: ThemePreset[], id: string) {
  return normalizeThemePresets(presets).find((preset) => preset.id === id) ?? DEFAULT_THEME_PRESETS[0];
}

function themePresetListEqual(current: ThemePreset[], next: ThemePreset[]) {
  if (current.length !== next.length) return false;
  return current.every((preset, index) => {
    const other = next[index];
    if (!other) return false;
    return preset.id === other.id
      && preset.name === other.name
      && preset.primary === other.primary
      && preset.accent === other.accent
      && preset.ink === other.ink
      && preset.surface === other.surface
      && preset.markerFill === other.markerFill
      && preset.markerBorder === other.markerBorder
      && Boolean(preset.locked) === Boolean(other.locked);
  });
}

function markerColorPresetListEqual(current: MarkerColorPreset[], next: MarkerColorPreset[]) {
  if (current.length !== next.length) return false;
  return current.every((preset, index) => {
    const other = next[index];
    if (!other) return false;
    return preset.id === other.id
      && preset.name === other.name
      && markerColorPresetKey(preset) === markerColorPresetKey(other)
      && Boolean(preset.locked) === Boolean(other.locked);
  });
}

function markerColorPresetKey(preset: Pick<MarkerColorPreset, 'borderColor' | 'borderOpacity' | 'backgroundColor' | 'backgroundOpacity' | 'textColor' | 'textOpacity'>) {
  return `${preset.borderColor.toLowerCase()}|${normalizeMarkerOpacity(preset.borderOpacity)}|${preset.backgroundColor.toLowerCase()}|${normalizeMarkerOpacity(preset.backgroundOpacity)}|${preset.textColor.toLowerCase()}|${normalizeMarkerOpacity(preset.textOpacity)}`;
}

function markerColorPresetFromMarker(marker: Pick<MarkerDraft, 'borderColor' | 'borderOpacity' | 'backgroundColor' | 'backgroundOpacity' | 'textColor' | 'textOpacity'>): MarkerColorPreset {
  return {
    id: 'temp',
    name: 'Custom',
    borderColor: marker.borderColor,
    borderOpacity: normalizeMarkerOpacity(marker.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY),
    backgroundColor: marker.backgroundColor,
    backgroundOpacity: normalizeMarkerOpacity(marker.backgroundOpacity, MARKER_DEFAULT_HOTSPOT_BACKGROUND_OPACITY),
    textColor: marker.textColor,
    textOpacity: normalizeMarkerOpacity(marker.textOpacity, MARKER_DEFAULT_TEXT_OPACITY),
  };
}

function plainInlineValue(value: string) {
  return inlineEditorHtmlToPlainText(sanitizeInlineEditorHtml(value));
}

function targetBoxStyle(target: Pick<InlineEditableTarget, 'top' | 'left' | 'width' | 'height'>): CSSProperties {
  return {
    top: target.top,
    left: target.left,
    width: target.width,
    height: target.height,
  };
}

function targetEditorStyle(target: Pick<InlineEditableTarget, 'top' | 'left' | 'width' | 'height' | 'rootWidth'>): CSSProperties {
  const maxWidth = Math.max(260, target.rootWidth - 32);
  const width = Math.min(Math.max(target.width, 340), maxWidth);
  const left = Math.min(Math.max(target.left, 16), Math.max(16, target.rootWidth - width - 16));
  return {
    top: target.top + target.height + 10,
    left,
    width,
  };
}

function floatingEditButtonStyle(target: Pick<InlineEditableTarget, 'top' | 'left' | 'width' | 'height' | 'rootWidth'>): CSSProperties {
  const size = 34;
  const gap = 8;
  const top = Math.max(8, target.top + (target.height / 2) - (size / 2));
  const preferredLeft = target.left + target.width + gap;
  const left = Math.min(Math.max(target.left + gap, preferredLeft), Math.max(8, target.rootWidth - size - 8));
  return { top, left };
}

function htmlToEditableText(html: string) {
  const body = html.match(/<section class="content">[\s\S]*?<div class="container">([\s\S]*?)<\/div>\s*<\/section>/)?.[1] ?? html;
  const componentCount = extractDocComponentMarkup(body).length;
  const bodyWithoutComponents = stripDocComponentBlocks(body);
  const convertedText = convertUiSpansToHighlightTokens(bodyWithoutComponents)
    .replace(/<figcaption>[\s\S]*?<\/figcaption>/g, '')
    .replace(/<figure[\s\S]*?<\/figure>/g, '\n[Figure preserved in visual editor]\n')
    .replace(/<table[\s\S]*?<\/table>/g, '\n[Table preserved in visual editor]\n')
    .replace(/<div class="callout ([^"]+)">[\s\S]*?<span class="callout-title">([\s\S]*?)<\/span>([\s\S]*?)<\/div>/g, (_match, variant: string, title: string, content: string) => {
      const cleanTitle = inlineHtmlToEditableText(title);
      const cleanContent = inlineHtmlToEditableText(content);
      return `\n[${variant.toUpperCase()}: ${cleanTitle}]\n${cleanContent}\n`;
    })
    .replace(/<h([3-5])[^>]*>([\s\S]*?)<\/h\1>/g, (_match, level: string, content: string) => {
      const prefix = level === '3' ? '### ' : level === '4' ? '#### ' : '##### ';
      return `\n${prefix}${inlineHtmlToEditableText(content)}\n`;
    })
    .replace(/<dt[^>]*>([\s\S]*?)<\/dt>/g, (_match, content: string) => `\n#### ${inlineHtmlToEditableText(content)}\n`)
    .replace(/<dd[^>]*>([\s\S]*?)<\/dd>/g, (_match, content: string) => `\n${inlineHtmlToEditableText(content)}\n`)
    .replace(/<\/?dl[^>]*>/g, '\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_match, content: string) => `\n- ${inlineHtmlToEditableText(content)}`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (_match, content: string) => `\n${inlineHtmlToEditableText(content)}\n`)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const componentPlaceholders = Array.from({ length: componentCount }, (_item, index) => `[Managed component ${index + 1} preserved in component editor]`);
  return [convertedText, ...componentPlaceholders].filter(Boolean).join('\n\n');
}

function editableTextToHtml(textValue: string, existingHtml: string) {
  const blocks = textValue.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const preservedElements = extractPreservedElementMarkup(existingHtml);
  const preservedComponents = extractDocComponentMarkup(existingHtml);
  let preservedElementIndex = 0;
  let preservedComponentIndex = 0;
  const content = blocks.map((block) => {
    if (/^\[(Figure|Table)(?: \d+)? preserved in (?:HTML mode|visual editor)\]$/i.test(block)) {
      const preserved = preservedElements[preservedElementIndex] ?? '';
      preservedElementIndex += 1;
      return preserved;
    }
    if (/^\[(?:Managed component|Component)(?: \d+)? preserved in (?:component editor|Component Builder)\]$/i.test(block)) {
      const preserved = preservedComponents[preservedComponentIndex] ?? '';
      preservedComponentIndex += 1;
      return preserved;
    }
    if (/^\[Annotated image inserted/i.test(block)) return '';
    if (block.startsWith('##### ')) return `<h5>${formatInlineText(block.slice(6))}</h5>`;
    if (block.startsWith('#### ')) return `<h4>${formatInlineText(block.slice(5))}</h4>`;
    if (block.startsWith('### ')) return `<h3>${formatInlineText(block.slice(4))}</h3>`;
    if (block.startsWith('> ')) return `<blockquote>${formatInlineText(block.replace(/^> /gm, ''))}</blockquote>`;
    if (block.startsWith('- ')) {
      const items = block.split('\n').filter((line) => line.startsWith('- ')).map((line) => `<li>${formatInlineText(line.slice(2))}</li>`).join('\n');
      return `<ul>\n${items}\n</ul>`;
    }
    if (block.startsWith('[') && block.includes(']')) {
      const [, label = '', body = ''] = block.match(/^\[([^\]]+)\]\s*([\s\S]*)$/) ?? [];
      return `<div class="callout info"><span class="callout-title">${escapeHtml(label)}</span><p>${formatInlineText(body.trim())}</p></div>`;
    }
    return `<p>${formatInlineText(block)}</p>`;
  }).filter(Boolean).join('\n\n');
  const unusedPreservedHtml = [
    ...preservedElements.slice(preservedElementIndex),
    ...preservedComponents.slice(preservedComponentIndex),
  ].join('\n\n');
  const nextContent = [content, unusedPreservedHtml].filter(Boolean).join('\n\n');

  const match = existingHtml.match(/(<section class="content">\s*<div class="container">)([\s\S]*?)(\s*<\/div>\s*<\/section>)/);
  if (!match) return existingHtml;
  return existingHtml.replace(match[0], `${match[1]}\n${nextContent}\n${match[3]}`);
}

function formatTextSelection(tool: TextTool, selected: string) {
  if (tool.id === 'h3') return `### ${selected}`;
  if (tool.id === 'h4') return `#### ${selected}`;
  if (tool.id === 'bold') return `**${selected}**`;
  if (tool.id === 'italic') return `*${selected}*`;
  if (tool.id === 'code') return `\`${selected}\``;
  if (tool.id === 'bullet') return selected.split('\n').map((line) => `- ${line.replace(/^- /, '')}`).join('\n');
  if (tool.id === 'quote') return selected.split('\n').map((line) => `> ${line.replace(/^> /, '')}`).join('\n');
  if (tool.id === 'link') return `[${selected}](https://example.com)`;
  if (tool.id === 'image') return `${selected}\n\n[Use the Image Annotation panel below to insert a screenshot with markers]`;
  return `[INFO: Note]\n${selected}`;
}

function formatHighlightSelection(color: HighlightColor, selected: string) {
  return `[[highlight:${color}|${selected}]]`;
}

function replaceTextareaSelection(
  textarea: HTMLTextAreaElement,
  value: string,
  updateValue: (nextValue: string) => void,
  fallback: string,
  formatSelection: (selected: string) => string,
) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end) || fallback;
  const replacement = formatSelection(selected);
  updateValue(`${value.slice(0, start)}${replacement}${value.slice(end)}`);
  window.requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(start, start + replacement.length);
  });
}

function formatInlineText(value: string) {
  return escapeHtml(value)
    .replace(/\[\[highlight:(black|green|yellow|red|blue|purple|gray)\|([\s\S]*?)\]\]/g, (_match, color: string, content: string) => `<span class="ui ${highlightColor(color)}">${content}</span>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n/g, '<br>');
}

function annotatedImageMarkup({ src, alt, markers = [] }: { src: string; alt: string; markers?: MarkerDraft[] }) {
  return `<figure class="figure annotated-figure">
  <div class="annotated-image">
    <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">
    ${markers.map((marker, markerIndex) => markerElementMarkup(marker, markerIndex + 1)).join('\n')}
  </div>
  ${markerDescriptionListMarkup(markers)}
  <figcaption><strong>Annotation.</strong> ${escapeHtml(markers[0]?.label ?? 'Marker')}${markers.length > 1 ? ' markers' : ''}</figcaption>
</figure>`;
}

function markerElementMarkup(marker: MarkerDraft, markerIndex: number) {
  const tag = 'span';
  const labelAlign = marker.kind === 'shape' ? markerTextAlign(marker.align) : 'center';
  const markerLabelValue = markerLabel(marker, markerIndex);
  const href = markerHref(marker);
  const markerDescription = normalizeInlineEditableValue(marker.description);
  const label = normalizeInlineEditableValue(markerLabelValue);
  const escapedLabel = escapeHtml(label);
  const popover = markerPopoverPosition(marker);
  return `<${tag} class="doc-marker marker-${marker.kind}" data-kind="${marker.kind}" data-label-align="${labelAlign}" data-border-style="${marker.borderStyle}" data-border-color="${marker.borderColor}" data-border-opacity="${normalizeMarkerOpacity(marker.borderOpacity, MARKER_DEFAULT_BORDER_OPACITY)}" data-background-color="${marker.backgroundColor}" data-background-opacity="${normalizeMarkerOpacity(marker.backgroundOpacity, defaultBgOpacityFor(marker.kind))}" data-text-color="${marker.textColor}" data-text-opacity="${normalizeMarkerOpacity(marker.textOpacity, MARKER_DEFAULT_TEXT_OPACITY)}" data-dialog-background-color="${marker.dialogBackgroundColor}" data-dialog-background-opacity="${normalizeMarkerOpacity(marker.dialogBackgroundOpacity, MARKER_DEFAULT_DIALOG_BACKGROUND_OPACITY)}" data-dialog-border-color="${marker.dialogBorderColor}" data-dialog-border-opacity="${normalizeMarkerOpacity(marker.dialogBorderOpacity, MARKER_DEFAULT_DIALOG_BORDER_OPACITY)}" data-dialog-text-color="${marker.dialogTextColor}" data-dialog-text-opacity="${normalizeMarkerOpacity(marker.dialogTextOpacity, MARKER_DEFAULT_DIALOG_TEXT_OPACITY)}" data-cta-background-color="${marker.ctaBackgroundColor}" data-cta-background-opacity="${normalizeMarkerOpacity(marker.ctaBackgroundOpacity, MARKER_DEFAULT_CTA_BACKGROUND_OPACITY)}" data-cta-text-color="${marker.ctaTextColor}" data-cta-text-opacity="${normalizeMarkerOpacity(marker.ctaTextOpacity, MARKER_DEFAULT_CTA_TEXT_OPACITY)}" data-target-section-id="${normalizeMarkerTarget(marker.targetSectionId)}" data-popover-x="${popover.x}" data-popover-y="${popover.y}" data-animated="${marker.animated ? 'true' : 'false'}" data-pointer-rotation="${normalizePointerRotation(marker.pointerRotation)}" data-pointer-thickness="${normalizePointerThickness(marker.pointerThickness)}"${markerDescription ? ` data-description="${escapeHtml(markerDescription)}"` : ''}${href ? ` data-target-url="${escapeHtml(href)}"` : ''}${marker.kind !== 'shape' ? ` role="button" tabindex="0" aria-label="${escapedLabel}" aria-expanded="false"` : ''} style="${markerStyleMarkup(marker)}">${markerHotspotWavesMarkup(marker.kind)}<b class="doc-marker-chip">${escapedLabel}</b>${markerHotspotPopoverMarkup(marker, markerIndex)}</${tag}>`;
}

function markerDescriptionListMarkup(markers: MarkerDraft[]) {
  const items = markers
    .map((marker, index) => {
      const description = normalizeInlineEditableValue(marker.description);
      if (!description) return '';
      return `  <div class="marker-description" data-marker-description-index="${index + 1}">
    <strong>${escapeHtml(markerLabel(marker, index + 1))}</strong>
    <p>${formatInlineText(description)}</p>
  </div>`;
    })
    .filter(Boolean)
    .join('\n');
  return items ? `<div class="marker-description-list">\n${items}\n</div>` : '';
}

function insertBeforeSectionClose(html: string, block: string) {
  const match = html.match(/<\/div>\s*<\/section>\s*$/);
  if (!match || match.index === undefined) return `${html}\n${block}`;
  return `${html.slice(0, match.index)}\n${block}\n${html.slice(match.index)}`;
}

function buildLocalizationKeysFromBundles(bundles: { doc: DocEntry; sections: SectionEntry[] }[]) {
  return uniqueLocalizationKeys(bundles.flatMap((bundle) => buildLocalizationKeys(bundle.sections, bundle.doc)));
}

function buildLocalizationKeys(sections: SectionEntry[], doc: DocEntry): LocalizationKey[] {
  const keys = sections.flatMap((section) => {
    const sectionPrefix = sectionLocalizationPrefix(section, doc);
    const baseHtml = stripDocComponentBlocks(section.html);
    const content = htmlToEditableText(baseHtml);
    const paragraphs = content.split(/\n{2,}/).map((item) => item.trim()).filter((item) => item && !isPreservedVisualPlaceholder(item)).slice(0, 8);
    return [
      localizationKey(doc, section, `${sectionPrefix}.title`, 'Section title', section.title),
      ...paragraphs.map((paragraph, index) => ({
        id: `${sectionPrefix}.text.${index + 1}`,
        section: section.title,
        label: localizationTextLabel(paragraph, index),
        defaultValue: localizationDefaultValue(paragraph.replace(/^#{3,5}\s*/, '')).slice(0, 500),
        docId: doc.id,
        docTitle: doc.title,
      })),
      ...buildFigureLocalizationKeys(section, doc),
      ...buildComponentLocalizationKeys(section, doc, parseDocComponentBlocks(section.html)),
    ];
  });
  return uniqueLocalizationKeys(keys.filter((key) => key.defaultValue.trim()));
}

function buildFigureLocalizationKeys(section: SectionEntry, doc: DocEntry): LocalizationKey[] {
  const sectionPrefix = sectionLocalizationPrefix(section, doc);
  const template = htmlTemplate(section.html);
  return Array.from(template.content.querySelectorAll<HTMLElement>('figure')).flatMap((figure, figureIndex) => {
    const caption = localizationDefaultValue(getScreenshotCaption(figure));
    const imageAlt = localizationDefaultValue(figure.querySelector('img')?.getAttribute('alt') ?? '');
    const figurePrefix = `${sectionPrefix}.figure.${localizationSegment(caption.slice(0, 48) || imageAlt.slice(0, 48), `figure-${figureIndex + 1}`)}`;
    const keys: LocalizationKey[] = [];
    if (caption) {
      keys.push(localizationKey(doc, section, `${figurePrefix}.caption`, `Figure ${figureIndex + 1} · Caption`, caption));
    }
    getScreenshotMarkers(figure).forEach((marker, markerIndex) => {
      const markerPrefix = `${figurePrefix}.marker.${localizationSegment(marker.label, marker.id || `marker-${markerIndex + 1}`)}`;
      if (marker.label) {
        keys.push(localizationKey(doc, section, `${markerPrefix}.label`, `Figure ${figureIndex + 1} · Marker ${markerIndex + 1} · Label`, marker.label));
      }
      if (marker.description) {
        keys.push(localizationKey(doc, section, `${markerPrefix}.description`, `Figure ${figureIndex + 1} · Marker ${markerIndex + 1} · Description`, marker.description));
      }
    });
    return keys;
  });
}

function buildComponentLocalizationKeys(section: SectionEntry, doc: DocEntry, blocks: DocComponentBlock[]): LocalizationKey[] {
  const sectionPrefix = sectionLocalizationPrefix(section, doc);
  return blocks.flatMap((block) => {
    const blockPrefix = `${sectionPrefix}.${localizationSegment(block.kind, 'component')}.${localizationSegment(block.title, block.id)}`;
    const blockLabel = `${componentKindLabel(block.kind)} · ${block.title || componentKindLabel(block.kind)}`;
    const keys: LocalizationKey[] = [
      localizationKey(doc, section, `${blockPrefix}.title`, `${blockLabel} · Title`, block.title || componentKindLabel(block.kind)),
    ];

    if (block.kind === 'callout') {
      keys.push(localizationKey(doc, section, `${blockPrefix}.body`, `${blockLabel} · Text`, block.body));
      return keys;
    }

    if (block.kind === 'table') {
      block.columns.forEach((column, columnIndex) => {
        keys.push({
          id: `${blockPrefix}.column.${localizationSegment(column, `column-${columnIndex + 1}`)}`,
          section: section.title,
          label: `${blockLabel} · Column ${columnIndex + 1}`,
          defaultValue: localizationDefaultValue(column),
          docId: doc.id,
          docTitle: doc.title,
        });
      });
      block.rows.forEach((row, rowIndex) => {
        const rowPrefix = `${blockPrefix}.row.${localizationSegment(row.cells[0], row.id || `row-${rowIndex + 1}`)}`;
        syncTableCells(row.cells, block.columns.length).forEach((cell, columnIndex) => {
          keys.push({
            id: `${rowPrefix}.${localizationSegment(block.columns[columnIndex], `column-${columnIndex + 1}`)}`,
            section: section.title,
            label: `${blockLabel} · Row ${rowIndex + 1} · ${block.columns[columnIndex] || `Column ${columnIndex + 1}`}`,
            defaultValue: localizationDefaultValue(cell),
            docId: doc.id,
            docTitle: doc.title,
          });
        });
      });
      return keys;
    }

    block.items.forEach((item, itemIndex) => {
      const itemPrefix = `${blockPrefix}.${localizationSegment(item.title, item.id || `item-${itemIndex + 1}`)}`;
      const itemLabel = `${blockLabel} · ${item.title || `${componentItemTitleLabel(block.kind)} ${itemIndex + 1}`}`;
      keys.push(localizationKey(doc, section, `${itemPrefix}.title`, `${itemLabel} · Title`, item.title));
      if (block.kind !== 'carousel') {
        keys.push(localizationKey(doc, section, `${itemPrefix}.body`, `${itemLabel} · Text`, item.body));
      }
    });
    return keys;
  });
}

function uniqueLocalizationKeys(keys: LocalizationKey[]) {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const count = seen.get(key.id) ?? 0;
    seen.set(key.id, count + 1);
    return count ? { ...key, id: `${key.id}.${count + 1}` } : key;
  });
}

function localizationKey(doc: DocEntry, section: SectionEntry, id: string, label: string, defaultValue: string): LocalizationKey {
  return {
    id,
    section: section.title,
    label,
    defaultValue: localizationDefaultValue(defaultValue),
    docId: doc.id,
    docTitle: doc.title,
  };
}

function sectionLocalizationPrefix(section: SectionEntry, doc: DocEntry) {
  const sectionSegment = localizationSegment(section.slug || section.title, section.id);
  if (doc.id === 'doc-manual' || doc.id === 'doc-backoffice' || doc.id === 'doc-integration') return sectionSegment;
  return `${sectionSegment}.${localizationSegment(doc.title, doc.id)}`;
}

function localizationSegment(value: string | undefined, fallback: string) {
  return (value ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || fallback.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item';
}

function compactTranslationKey(id: string) {
  return id.length > 42 ? `${id.slice(0, 24)}…${id.slice(-14)}` : id;
}

function localizationTextLabel(value: string, index: number) {
  const heading = value.match(/^#{3,5}\s+(.+)$/)?.[1];
  if (heading) return heading.slice(0, 80);
  if (/^\[(Figure|Table|Managed component|Component)/i.test(value)) return value.replace(/^\[|\]$/g, '').replace(/ preserved .+$/i, '');
  return `Text ${index + 1}`;
}

function isPreservedVisualPlaceholder(value: string) {
  return /^\[(Figure|Table|Managed component|Component)(?: \d+)? preserved in (?:visual editor|component editor|HTML mode|Component Builder)\]$/i.test(value);
}

function localizationDefaultValue(value: string) {
  return stripHtml(value)
    .replace(/\[\[highlight:[^\]|]+\|([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\bHTML mode\b/gi, 'visual editor')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasMarkupLeak(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value) || /\bHTML mode\b/i.test(value);
}

function syncTranslationEntriesWithKeys(entries: TranslationEntry[], keys: LocalizationKey[]) {
  let changed = false;
  const nextEntries = entries.map((entry) => {
    let entryChanged = false;
    const values = { ...entry.values };
    keys.forEach((key) => {
      const hasValue = Object.prototype.hasOwnProperty.call(values, key.id);
      const currentValue = hasValue ? values[key.id] : '';
      let nextValue = currentValue;
      if (entry.code === 'en' && !hasValue) {
        nextValue = key.defaultValue;
      } else if (!hasValue) {
        nextValue = '';
      } else if (hasMarkupLeak(currentValue)) {
        nextValue = localizationDefaultValue(currentValue);
      }
      if (nextValue === currentValue && hasValue) return;
      values[key.id] = nextValue;
      entryChanged = true;
    });
    if (!entryChanged) return entry;
    changed = true;
    return { ...entry, values };
  });
  return changed ? nextEntries : entries;
}

function getTranslationProgress(entry: TranslationEntry, keys: LocalizationKey[] = DEFAULT_LOCALIZATION_KEYS) {
  const total = Math.max(1, keys.length);
  const filled = keys.filter((key) => (entry.values[key.id] ?? '').trim().length > 0).length;
  return Math.round((filled / total) * 100);
}

function getSectionsForDoc(docId: string, manual: SectionEntry[], backOffice: SectionEntry[], integration: SectionEntry[], custom: Record<string, SectionEntry[]>) {
  if (docId === 'doc-manual') return manual;
  if (docId === 'doc-backoffice') return backOffice;
  if (docId === 'doc-integration') return integration;
  return custom[docId] ?? DEFAULT_CUSTOM_SECTIONS[docId] ?? [];
}

function buildProductCatalog(docs: DocEntry[], games: GameEntry[]): ProductEntry[] {
  const docsByProduct = new Map<string, DocEntry[]>();
  docs.forEach((doc) => {
    const items = docsByProduct.get(doc.gameId) ?? [];
    items.push(doc);
    docsByProduct.set(doc.gameId, items);
  });

  const products: ProductEntry[] = games
    .filter((game) => docsByProduct.has(game.id))
    .map((game) => ({
      id: game.id,
      name: game.name,
      description: game.description,
      version: game.version,
      status: game.status,
      updatedAt: game.updatedAt,
      docs: sortDocsForNavigation(docsByProduct.get(game.id) ?? []),
    }));

  docsByProduct.forEach((items, id) => {
    if (products.some((product) => product.id === id)) return;
    const primary = latestDoc(items) ?? items[0];
    products.push({
      id,
      name: productNameFromDocs(id, items),
      description: primary?.description || 'Documentation product managed in DocPilot.',
      version: primary?.version ?? '0.1.0',
      status: primary?.status ?? 'draft',
      updatedAt: primary?.updatedAt ?? today(),
      docs: sortDocsForNavigation(items),
    });
  });

  return products;
}

function emptyProductOption(id: string): ProductEntry {
  const game = DEFAULT_GAMES.find((item) => item.id === id) ?? DEFAULT_GAMES[0];
  return {
    id: game.id,
    name: game.name,
    description: game.description,
    version: game.version,
    status: game.status,
    updatedAt: game.updatedAt,
    docs: [],
  };
}

function latestDoc(items: DocEntry[]) {
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

function productNameFromDocs(id: string, docs: DocEntry[]) {
  const title = latestDoc(docs)?.title.trim();
  if (title) return title.replace(/\s+(docs|documentation|manual|guide|reference)$/i, '') || title;
  return titleFromSlug(id);
}

function titleFromSlug(value: string) {
  return value.split(/[-_]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || 'Product';
}

function roleLabel(role: UserRole) {
  if (role === 'tam') return 'TAM';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function pageWritePermission(page: typeof ADMIN_PAGES[number]): WritePermission | null {
  if (page === 'documents') return 'documents:write';
  if (page === 'sections') return 'sections:write';
  if (page === 'media') return 'media:write';
  if (page === 'translations') return 'translations:write';
  if (page === 'publishing') return 'releases:write';
  if (page === 'users') return 'users:manage';
  return null;
}

function getDocumentTemplate(templateId?: string) {
  return DOCUMENT_TEMPLATES.find((template) => template.id === templateId) ?? DOCUMENT_TEMPLATES[0];
}

function docTemplateId(doc: DocEntry) {
  return doc.templateId || DOCUMENT_TEMPLATES.find((template) => template.type === doc.type)?.id || DOCUMENT_TEMPLATES[0].id;
}

function docSlug(doc: DocEntry) {
  return makeSlug(doc.slug || doc.title || doc.id) || doc.id;
}

function docAudience(doc: DocEntry) {
  return doc.audience?.trim() || getDocumentTemplate(docTemplateId(doc)).audience;
}

function docTaxonomy(doc: DocEntry) {
  return doc.taxonomy?.trim() || getDocumentTemplate(docTemplateId(doc)).taxonomy;
}

function taxonomyTags(value: string) {
  return value
    .split(/[;,]+/)
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function docTaxonomyTags(doc: DocEntry) {
  return Array.from(new Set(taxonomyTags(docTaxonomy(doc))));
}

function taxonomyOptionsForDocs(docs: DocEntry[]) {
  return Array.from(new Set(docs.flatMap((doc) => docTaxonomyTags(doc)))).sort((a, b) => a.localeCompare(b));
}

function docNavPlacement(doc: DocEntry): NavPlacement {
  return doc.navPlacement || getDocumentTemplate(docTemplateId(doc)).navPlacement;
}

function docNavOrder(doc: DocEntry) {
  return typeof doc.navOrder === 'number' && Number.isFinite(doc.navOrder) ? doc.navOrder : 999;
}

function sortDocsForNavigation(docs: DocEntry[]) {
  const navRank: Record<NavPlacement, number> = { primary: 0, secondary: 1, hidden: 2 };
  return [...docs].sort((a, b) => (
    navRank[docNavPlacement(a)] - navRank[docNavPlacement(b)]
    || docNavOrder(a) - docNavOrder(b)
    || String(a.type).localeCompare(String(b.type))
    || String(a.title).localeCompare(String(b.title))
  ));
}

function docPath(doc: DocEntry) {
  return `/docs/${docSlug(doc)}`;
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchesSearchText(haystack: string, query: string) {
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  const normalized = normalizeSearchText(haystack);
  return needle.split(/\s+/).every((part) => normalized.includes(part));
}

function stripHtmlForSearch(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function markerSearchText(html: string) {
  const attributeText = Array.from(html.matchAll(/\s(?:data-description|aria-label|data-target-section-id|data-target-url)=["']([^"']+)["']/gi))
    .map((match) => match[1])
    .join(' ');
  const descriptionText = Array.from(html.matchAll(/<div class=["'][^"']*marker-description[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi))
    .map((match) => stripHtmlForSearch(match[1]))
    .join(' ');
  const chipText = Array.from(html.matchAll(/<b class=["'][^"']*doc-marker-chip[^"']*["'][^>]*>([\s\S]*?)<\/b>/gi))
    .map((match) => stripHtmlForSearch(match[1]))
    .join(' ');
  return `${attributeText} ${descriptionText} ${chipText}`;
}

function sectionSearchHaystack(section: SectionEntry) {
  return [
    section.number,
    section.slug,
    section.title,
    section.summary,
    section.status,
    section.owner,
    section.updatedAt,
    htmlToEditableText(section.html),
    markerSearchText(section.html),
  ].join(' ');
}

function sectionMatchesSearch(section: SectionEntry, query: string) {
  return matchesSearchText(sectionSearchHaystack(section), query);
}

function docSearchHaystack(doc: DocEntry, sections: SectionEntry[]) {
  return [
    doc.id,
    docSlug(doc),
    doc.title,
    doc.description,
    doc.type,
    doc.status,
    doc.owner,
    docAudience(doc),
    docTaxonomy(doc),
    docNavPlacement(doc),
    doc.version,
    String(doc.sections),
    sections.map(sectionSearchHaystack).join(' '),
  ].join(' ');
}

function docMatchesSearch(doc: DocEntry, sections: SectionEntry[], query: string) {
  return matchesSearchText(docSearchHaystack(doc, sections), query);
}

function reorderSections(sections: SectionEntry[], sourceId: string, targetId: string, position: DragPosition) {
  const sourceIndex = sections.findIndex((section) => section.id === sourceId);
  const targetIndex = sections.findIndex((section) => section.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return sections;
  const next = [...sections];
  const [source] = next.splice(sourceIndex, 1);
  const nextTargetIndex = next.findIndex((section) => section.id === targetId);
  next.splice(position === 'after' ? nextTargetIndex + 1 : nextTargetIndex, 0, source);
  return next;
}

function limitRevisions<T>(items: T[]) {
  return items.slice(-REVISION_LIMIT);
}

function limitRevisionHistory(items: RevisionHistoryEntry[]) {
  return items.slice(-REVISION_LIMIT);
}

function cloneRevisionValue<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T;
}

function revisionEqual<T>(a: T, b: T) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function revisionTimestamp() {
  return new Date().toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function nextContentComment(author: string, body: string, scope: string): ContentComment {
  return {
    id: `comment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    author: author.trim() || 'Docs',
    body: body.trim(),
    createdAt: today(),
    scope,
  };
}

function revisionHistoryId(docId: string, index: number, history: { label: string; detail: string }, timestamp: string) {
  return `rev-${docId}-${index}-${makeSlug(`${history.label}-${history.detail}-${timestamp}`)}`;
}

function buildSectionTargetOptions(sections: SectionEntry[]): SectionTargetOption[] {
  const seen = new Set<string>();
  return sections
    .map((section) => {
      const id = sectionAnchorId(section);
      if (!id || seen.has(id)) return null;
      seen.add(id);
      return { id, label: `${section.number} ${section.title}` };
    })
    .filter((item): item is SectionTargetOption => Boolean(item));
}

function sectionAnchorId(section: SectionEntry) {
  const bannerMatch = section.html.match(/<[^>]*class=["'][^"']*section-banner[^"']*["'][^>]*\sid=["']([^"']+)["']/i);
  if (bannerMatch?.[1]) return bannerMatch[1].trim();
  const genericMatch = section.html.match(/\sid=["']([^"']+)["']/i);
  if (genericMatch?.[1]) return genericMatch[1].trim();
  const fallback = section.slug.trim() || `${section.number}`.trim();
  return makeSlug(fallback) || '';
}

function initialSectionEditorDraft(section: SectionEntry): SectionEditorDraft {
  return {
    mode: 'text',
    draftHtml: section.html,
    draftText: htmlToEditableText(section.html),
    imageUrl: '/images/manual/fig-02.png',
    markerLabel: 'Primary action',
    markerDescription: '',
    markerX: 58,
    markerY: 42,
    markerW: 24,
    markerH: 18,
    markerAlign: 'left',
    markerKind: 'shape',
    markerBorderStyle: MARKER_DEFAULT_BORDER_STYLE,
    markerBorderColor: MARKER_DEFAULT_BORDER_COLOR,
    markerBorderOpacity: MARKER_DEFAULT_BORDER_OPACITY,
    markerBackgroundColor: MARKER_DEFAULT_BACKGROUND_COLOR,
    markerBackgroundOpacity: MARKER_DEFAULT_SHAPE_BACKGROUND_OPACITY,
    markerTextColor: MARKER_DEFAULT_TEXT_COLOR,
    markerTextOpacity: MARKER_DEFAULT_TEXT_OPACITY,
    markerTargetSectionId: MARKER_DEFAULT_POINTER_TARGET,
    markerAnimated: MARKER_DEFAULT_ANIMATION,
    markerPointerRotation: MARKER_DEFAULT_POINTER_ROTATION,
    markerPointerThickness: MARKER_DEFAULT_POINTER_THICKNESS,
    title: section.title,
    slug: section.slug,
    owner: section.owner,
    status: section.status,
    reviewer: section.reviewer || section.owner,
    reviewComment: '',
  };
}

function labelForDocKind(kind: DocKind) {
  if (kind === 'game') return 'Game';
  if (kind === 'back-office') return 'Back-Office';
  if (kind === 'operations') return 'Operational Map';
  return 'Integration';
}

function labelForTranslationStatus(status: TranslationStatus) {
  if (status === 'not-started') return 'Not started';
  if (status === 'in-progress') return 'In progress';
  if (status === 'review') return 'In review';
  return 'Published';
}

function getReadiness(doc: DocEntry, bundles: { doc: DocEntry; sections: SectionEntry[] }[], translations: TranslationEntry[], localizationKeys: LocalizationKey[] = DEFAULT_LOCALIZATION_KEYS) {
  const sections = bundles.find((bundle) => bundle.doc.id === doc.id)?.sections ?? [];
  const openSections = sections.filter((section) => section.status === 'draft' || section.status === 'review').length;
  const translationAverage = Math.round(translations.reduce((sum, entry) => sum + getTranslationProgress(entry, localizationKeys), 0) / Math.max(1, translations.length));
  const markerIssues = validateMarkerTargets(sections);
  const unsafeHtmlCount = sections.filter((section) => hasUnsafeHtml(section.html)).length;
  const reasons = [
    openSections ? `${openSections} sections still draft/review` : 'content approved',
    translationAverage < 70 ? `${translationAverage}% translation average` : 'translation baseline met',
    doc.status === 'published' ? 'document published' : `document is ${doc.status}`,
    markerIssues.length ? `${markerIssues.length} broken marker targets` : 'marker targets valid',
    unsafeHtmlCount ? `${unsafeHtmlCount} sections contain unsafe HTML patterns` : 'HTML guardrails passed',
  ];
  const score = Math.max(0, Math.min(100, 100 - (openSections * 12) - (translationAverage < 70 ? 20 : 0) - (doc.status !== 'published' ? 15 : 0) - (markerIssues.length * 10) - (unsafeHtmlCount * 10)));
  return { ready: openSections === 0 && translationAverage >= 70 && doc.status === 'published' && markerIssues.length === 0 && unsafeHtmlCount === 0, score, reasons };
}

function validateDocumentDraft(doc: DocEntry, docs: DocEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!doc.title.trim()) issues.push({ kind: 'error', message: 'Document title is required.' });
  if (!isValidSlug(docSlug(doc))) issues.push({ kind: 'error', message: 'Document slug must contain lowercase letters, numbers, and dashes only.' });
  if (!doc.owner.trim()) issues.push({ kind: 'error', message: 'Owner is required for audit attribution.' });
  if (!isValidVersion(doc.version)) issues.push({ kind: 'error', message: 'Version must use semantic format such as 1.0.0.' });
  if (docs.some((item) => item.id !== doc.id && item.gameId === doc.gameId && item.title.trim().toLowerCase() === doc.title.trim().toLowerCase())) {
    issues.push({ kind: 'error', message: 'Document title must be unique within the selected product.' });
  }
  if (docs.some((item) => item.id !== doc.id && item.gameId === doc.gameId && docSlug(item) === docSlug(doc))) {
    issues.push({ kind: 'error', message: 'Document slug must be unique within the selected product.' });
  }
  if (!docAudience(doc).trim()) issues.push({ kind: 'error', message: 'Audience or visibility is required.' });
  if (!docTaxonomy(doc).trim()) issues.push({ kind: 'warning', message: 'Taxonomy is empty; reader filtering and navigation may be harder to maintain.' });
  if (!doc.description.trim()) issues.push({ kind: 'warning', message: 'Draft saved without description; publish readiness may be harder to review.' });
  return issues;
}

function validateSectionDraft(section: SectionEntry, sections: SectionEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!section.title.trim()) issues.push({ kind: 'error', message: 'Section title is required.' });
  if (!section.number.trim()) issues.push({ kind: 'error', message: 'Section order/number is required.' });
  if (!isValidSlug(section.slug)) issues.push({ kind: 'error', message: 'Slug must contain lowercase letters, numbers, and dashes only.' });
  if (sections.some((item) => item.id !== section.id && item.slug === section.slug)) issues.push({ kind: 'error', message: 'Section slug must be unique in this document.' });
  if (hasUnsafeHtml(section.html)) issues.push({ kind: 'warning', message: 'Unsafe HTML pattern detected; draft is preserved but publish readiness will block until corrected.' });
  issues.push(...validateDocComponentBlocks(parseDocComponentBlocks(section.html)));
  return issues;
}

function validateDocComponentBlocks(blocks: DocComponentBlock[]): ValidationIssue[] {
  return blocks.flatMap(validateDocComponentBlock);
}

function validateDocComponentBlock(block: DocComponentBlock): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const label = block.title.trim() || componentKindLabel(block.kind);
  const prefix = `${componentKindLabel(block.kind)} "${label}"`;

  if (!block.title.trim()) issues.push({ kind: 'error', message: `${componentKindLabel(block.kind)} component title is required.` });
  if (!DOC_COMPONENT_TYPES.some((type) => type.kind === block.kind)) issues.push({ kind: 'error', message: `${prefix} uses an unsupported component type.` });
  if (!DOC_COMPONENT_VARIANTS.includes(block.variant)) issues.push({ kind: 'warning', message: `${prefix} uses an unknown style variant and will render as info.` });

  if (block.kind === 'callout') {
    if (!block.body.trim()) issues.push({ kind: 'error', message: `${prefix} needs body text.` });
    return issues;
  }

  if (block.kind === 'table') {
    if (!block.columns.length) issues.push({ kind: 'error', message: `${prefix} needs at least one column.` });
    block.columns.forEach((column, index) => {
      if (!column.trim()) issues.push({ kind: 'error', message: `${prefix} has an empty column ${index + 1} label.` });
    });
    if (!block.rows.length) issues.push({ kind: 'error', message: `${prefix} needs at least one row.` });
    block.rows.forEach((row, rowIndex) => {
      const cells = syncTableCells(row.cells, block.columns.length);
      if (cells.every((cell) => !cell.trim())) issues.push({ kind: 'warning', message: `${prefix} row ${rowIndex + 1} is empty.` });
    });
    return issues;
  }

  if (block.kind === 'carousel') {
    if (!block.items.length) issues.push({ kind: 'error', message: `${prefix} needs at least one slide.` });
    block.items.forEach((item, index) => {
      if (!item.title.trim()) issues.push({ kind: 'error', message: `${prefix} slide ${index + 1} needs a caption.` });
      if (!item.body.trim()) {
        issues.push({ kind: 'error', message: `${prefix} slide ${index + 1} needs an image URL.` });
        return;
      }
      const looksLikeImage = /^https?:\/\//i.test(item.body)
        || item.body.startsWith('/')
        || item.body.startsWith('data:image/')
        || /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(item.body);
      if (!looksLikeImage) issues.push({ kind: 'warning', message: `${prefix} slide ${index + 1} URL may not point to an image.` });
    });
    return issues;
  }

  if (!block.items.length) issues.push({ kind: 'error', message: `${prefix} needs at least one ${componentItemGroupLabel(block.kind).toLowerCase()} entry.` });
  block.items.forEach((item, index) => {
    if (!item.title.trim()) issues.push({ kind: 'error', message: `${prefix} item ${index + 1} needs a ${componentItemTitleLabel(block.kind).toLowerCase()}.` });
    if (!item.body.trim()) issues.push({ kind: 'error', message: `${prefix} item ${index + 1} needs ${componentItemBodyLabel(block.kind).toLowerCase()}.` });
  });
  return issues;
}

function validateReleaseDraft(release: ReleaseEntry, releases: ReleaseEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!release.label.trim()) issues.push({ kind: 'error', message: 'Release label is required.' });
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._-]{2,80}$/.test(release.label.trim())) issues.push({ kind: 'error', message: 'Release label must be 3-80 readable characters without symbols outside . _ -.' });
  if (!isValidVersion(release.version)) issues.push({ kind: 'error', message: 'Release version must use semantic format such as 1.0.0.' });
  if (releases.some((item) => item.id !== release.id && item.docId === release.docId && item.label.trim().toLowerCase() === release.label.trim().toLowerCase())) {
    issues.push({ kind: 'error', message: 'Release label must be unique for this document.' });
  }
  return issues;
}

function validateMarkerTargets(sections: SectionEntry[]) {
  const sectionIds = new Set(sections.map((section) => section.id));
  return collectMarkerTargets(sections).filter((target) => target && !target.startsWith('http') && !sectionIds.has(target.replace(/^#/, '')));
}

function hasUnsafeHtml(html: string) {
  return /<script[\s>]|on[a-z]+\s*=|javascript:/i.test(html);
}

function isValidSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isValidVersion(value: string) {
  return /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(value.trim());
}

function buildPublishSnapshot({ doc, sections, translations, localizationKeys, readiness, actor, environment, priorSnapshotId }: {
  doc: DocEntry;
  sections: SectionEntry[];
  translations: TranslationEntry[];
  localizationKeys: LocalizationKey[];
  readiness: { ready: boolean; score: number; reasons: string[] };
  actor: string;
  environment: 'staging' | 'production';
  priorSnapshotId?: string;
}): PublishSnapshot {
  const createdAt = new Date().toISOString();
  return {
    id: `snapshot-${doc.id}-${Date.now()}`,
    doc: cloneRevisionValue(doc),
    sections: cloneRevisionValue(sections),
    localization: translations.map((entry) => ({
      code: entry.code,
      status: entry.status,
      progress: getTranslationProgress(entry, localizationKeys),
    })),
    markerTargets: collectMarkerTargets(sections),
    readiness: cloneRevisionValue(readiness),
    actor,
    createdAt,
    environment,
    priorSnapshotId,
  };
}

function latestPublishedSnapshot(releases: ReleaseEntry[], docId: string) {
  return releases.find((release) => release.docId === docId && release.status === 'published' && release.snapshot);
}

function collectMarkerTargets(sections: SectionEntry[]) {
  const targets = new Set<string>();
  for (const section of sections) {
    const matches = section.html.matchAll(/data-target-section-id="([^"]+)"/g);
    for (const match of matches) {
      if (match[1]) targets.add(match[1]);
    }
  }
  return [...targets].sort();
}

function makeSlug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `section-${Date.now()}`;
}

function stripHtml(value: string) {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]*>/g, '');
  return textarea.value.replace(/\s+/g, ' ').trim();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function mergeWithDefaults<T>(stored: T[], defaults: T[], idOf: (item: T) => string): T[] {
  if (!Array.isArray(stored) || !stored.length) return defaults;
  const storedIds = new Set(stored.map(idOf));
  const missing = defaults.filter((item) => !storedIds.has(idOf(item)));
  return missing.length ? [...stored, ...missing] : stored;
}

function NotFound() {
  return <main className="not-found"><h1>404</h1><p>This route is not part of the documentation site.</p><Link className="btn btn-red" to="/">Back to Landing</Link></main>;
}

// Orphaned-but-retained surfaces. Login / Protected / safeExternalUrl are legacy
// helpers retained for a planned re-wire. Referenced here so noUnusedLocals stays happy.
void Login; void Protected; void safeExternalUrl;

export default App;
