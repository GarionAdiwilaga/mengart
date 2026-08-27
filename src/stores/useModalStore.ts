import { create } from "zustand";

interface ReportTarget {
  type: "artwork" | "comment" | "user" | "challenge_submission";
  id: string;
  title: string;
}

interface ModalState {
  isUploadModalOpen: boolean;
  isReportModalOpen: boolean;
  isInviteModalOpen: boolean;
  isCommandPaletteOpen: boolean;
  reportTarget: ReportTarget | null;

  // Actions
  openUploadModal: () => void;
  closeUploadModal: () => void;
  openReportModal: (target: ReportTarget) => void;
  closeReportModal: () => void;
  openInviteModal: () => void;
  closeInviteModal: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isUploadModalOpen: false,
  isReportModalOpen: false,
  isInviteModalOpen: false,
  isCommandPaletteOpen: false,
  reportTarget: null,

  openUploadModal: () => set({ isUploadModalOpen: true }),
  closeUploadModal: () => set({ isUploadModalOpen: false }),

  openReportModal: (target) => set({ isReportModalOpen: true, reportTarget: target }),
  closeReportModal: () => set({ isReportModalOpen: false, reportTarget: null }),

  openInviteModal: () => set({ isInviteModalOpen: true }),
  closeInviteModal: () => set({ isInviteModalOpen: false }),

  openCommandPalette: () => set({ isCommandPaletteOpen: true }),
  closeCommandPalette: () => set({ isCommandPaletteOpen: false }),
  toggleCommandPalette: () =>
    set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
}));
