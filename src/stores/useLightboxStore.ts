import { create } from "zustand";

export interface LightboxArtwork {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  mediaType: "image" | "gif" | "video";
  width?: number | null;
  height?: number | null;
  publicUrl: string;
  masterUrl?: string | null;
  artistName: string;
  artistSlug: string;
  artistAvatar?: string | null;
  critiqueMode: "showcase_only" | "open_for_critique";
  isMemberOnly?: boolean;
}

interface LightboxState {
  isOpen: boolean;
  artwork: LightboxArtwork | null;
  zoomLevel: number; // 1 to 4
  panPosition: { x: number; y: number };
  isMasterQuality: boolean;
  isCritiqueDrawerOpen: boolean;

  // Actions
  openLightbox: (artwork: LightboxArtwork, startWithMaster?: boolean) => void;
  closeLightbox: () => void;
  setZoomLevel: (zoom: number | ((prev: number) => number)) => void;
  resetZoom: () => void;
  setPanPosition: (pos: { x: number; y: number }) => void;
  toggleMasterQuality: () => void;
  toggleCritiqueDrawer: () => void;
  setCritiqueDrawerOpen: (open: boolean) => void;
}

export const useLightboxStore = create<LightboxState>((set) => ({
  isOpen: false,
  artwork: null,
  zoomLevel: 1,
  panPosition: { x: 0, y: 0 },
  isMasterQuality: false,
  isCritiqueDrawerOpen: false,

  openLightbox: (artwork, startWithMaster = false) =>
    set({
      isOpen: true,
      artwork,
      zoomLevel: 1,
      panPosition: { x: 0, y: 0 },
      isMasterQuality: startWithMaster && !!artwork.masterUrl,
      isCritiqueDrawerOpen: false,
    }),

  closeLightbox: () =>
    set({
      isOpen: false,
      artwork: null,
      zoomLevel: 1,
      panPosition: { x: 0, y: 0 },
      isMasterQuality: false,
      isCritiqueDrawerOpen: false,
    }),

  setZoomLevel: (zoom) =>
    set((state) => ({
      zoomLevel:
        typeof zoom === "function"
          ? Math.min(Math.max(zoom(state.zoomLevel), 1), 4)
          : Math.min(Math.max(zoom, 1), 4),
    })),

  resetZoom: () => set({ zoomLevel: 1, panPosition: { x: 0, y: 0 } }),

  setPanPosition: (panPosition) => set({ panPosition }),

  toggleMasterQuality: () =>
    set((state) => ({
      isMasterQuality: !state.isMasterQuality,
    })),

  toggleCritiqueDrawer: () =>
    set((state) => ({ isCritiqueDrawerOpen: !state.isCritiqueDrawerOpen })),

  setCritiqueDrawerOpen: (isCritiqueDrawerOpen) => set({ isCritiqueDrawerOpen }),
}));
