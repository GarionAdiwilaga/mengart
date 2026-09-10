import { create } from "zustand";

interface GalleryFilterState {
  galleryTab: "bebas" | "challenge";
  searchQuery: string;
  selectedTag: string | null;
  mediaType: "all" | "image" | "video";
  critiqueMode: "all" | "open_for_critique";
  sortBy: "latest" | "oldest";

  // Actions
  setGalleryTab: (tab: "bebas" | "challenge") => void;
  setSearchQuery: (query: string) => void;
  setSelectedTag: (tag: string | null) => void;
  setMediaType: (mediaType: "all" | "image" | "video") => void;
  setCritiqueMode: (mode: "all" | "open_for_critique") => void;
  setSortBy: (sortBy: "latest" | "oldest") => void;
  resetFilters: () => void;
}

export const useGalleryFilterStore = create<GalleryFilterState>((set) => ({
  galleryTab: "bebas",
  searchQuery: "",
  selectedTag: null,
  mediaType: "all",
  critiqueMode: "all",
  sortBy: "latest",

  setGalleryTab: (galleryTab) => set({ galleryTab }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedTag: (selectedTag) => set({ selectedTag }),
  setMediaType: (mediaType) => set({ mediaType }),
  setCritiqueMode: (critiqueMode) => set({ critiqueMode }),
  setSortBy: (sortBy) => set({ sortBy }),
  resetFilters: () =>
    set({
      searchQuery: "",
      selectedTag: null,
      mediaType: "all",
      critiqueMode: "all",
      sortBy: "latest",
    }),
}));

