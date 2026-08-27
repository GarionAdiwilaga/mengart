import { create } from "zustand";

export interface CandidateSubmission {
  submissionId: string;
  artworkId: string;
  title: string;
  mediaType: string;
  publicUrl: string;
  artistName: string;
  artistSlug: string;
  isSelfSubmission?: boolean;
}

interface VotingState {
  challengeId: string | null;
  totalStarAllowance: number;
  maxStarsPerCandidate: number;
  candidates: CandidateSubmission[];
  candidateIndex: number;
  viewMode: "grid" | "focus" | "compare";
  compareCandidateIds: [string | null, string | null];
  allocatedStars: Record<string, number>;
  isReviewDockExpanded: boolean;

  // Actions
  initVotingWorkspace: (params: {
    challengeId: string;
    totalStarAllowance: number;
    maxStarsPerCandidate: number;
    candidates: CandidateSubmission[];
    initialAllocations?: Record<string, number>;
  }) => void;
  setViewMode: (mode: "grid" | "focus" | "compare") => void;
  setCandidateIndex: (index: number | ((prev: number) => number)) => void;
  nextCandidate: () => void;
  prevCandidate: () => void;
  setCompareCandidate: (slot: 0 | 1, submissionId: string) => void;
  allocateStar: (submissionId: string, stars: number) => boolean;
  incrementStar: (submissionId: string) => boolean;
  decrementStar: (submissionId: string) => void;
  resetAllocations: () => void;
  toggleReviewDock: () => void;
}

export const useVotingStore = create<VotingState>((set, get) => ({
  challengeId: null,
  totalStarAllowance: 3,
  maxStarsPerCandidate: 1,
  candidates: [],
  candidateIndex: 0,
  viewMode: "grid",
  compareCandidateIds: [null, null],
  allocatedStars: {},
  isReviewDockExpanded: true,

  initVotingWorkspace: ({
    challengeId,
    totalStarAllowance,
    maxStarsPerCandidate,
    candidates,
    initialAllocations = {},
  }) =>
    set({
      challengeId,
      totalStarAllowance,
      maxStarsPerCandidate,
      candidates,
      allocatedStars: initialAllocations,
      candidateIndex: 0,
      compareCandidateIds: [
        candidates[0]?.submissionId || null,
        candidates[1]?.submissionId || null,
      ],
    }),

  setViewMode: (viewMode) => set({ viewMode }),

  setCandidateIndex: (index) =>
    set((state) => {
      const count = state.candidates.length;
      if (count === 0) return { candidateIndex: 0 };
      const nextIndex = typeof index === "function" ? index(state.candidateIndex) : index;
      return { candidateIndex: (nextIndex + count) % count };
    }),

  nextCandidate: () =>
    set((state) => {
      const count = state.candidates.length;
      return { candidateIndex: (state.candidateIndex + 1) % (count || 1) };
    }),

  prevCandidate: () =>
    set((state) => {
      const count = state.candidates.length;
      return { candidateIndex: (state.candidateIndex - 1 + count) % (count || 1) };
    }),

  setCompareCandidate: (slot, submissionId) =>
    set((state) => {
      const next = [...state.compareCandidateIds] as [string | null, string | null];
      next[slot] = submissionId;
      return { compareCandidateIds: next };
    }),

  allocateStar: (submissionId, stars) => {
    const { allocatedStars, totalStarAllowance, maxStarsPerCandidate, candidates } = get();
    const candidate = candidates.find((c) => c.submissionId === submissionId);
    if (candidate?.isSelfSubmission) return false;

    const currentAssigned = allocatedStars[submissionId] || 0;
    const totalSpentExcludingThis = Object.entries(allocatedStars).reduce(
      (acc, [id, count]) => (id === submissionId ? acc : acc + count),
      0
    );

    const clampedStars = Math.min(
      Math.max(0, stars),
      maxStarsPerCandidate,
      totalStarAllowance - totalSpentExcludingThis
    );

    set({
      allocatedStars: {
        ...allocatedStars,
        [submissionId]: clampedStars,
      },
    });
    return true;
  },

  incrementStar: (submissionId) => {
    const { allocatedStars, totalStarAllowance, maxStarsPerCandidate, candidates } = get();
    const candidate = candidates.find((c) => c.submissionId === submissionId);
    if (candidate?.isSelfSubmission) return false;

    const current = allocatedStars[submissionId] || 0;
    const totalSpent = Object.values(allocatedStars).reduce((a, b) => a + b, 0);

    if (current < maxStarsPerCandidate && totalSpent < totalStarAllowance) {
      set({
        allocatedStars: {
          ...allocatedStars,
          [submissionId]: current + 1,
        },
      });
      return true;
    }
    return false;
  },

  decrementStar: (submissionId) => {
    const { allocatedStars } = get();
    const current = allocatedStars[submissionId] || 0;
    if (current > 0) {
      set({
        allocatedStars: {
          ...allocatedStars,
          [submissionId]: current - 1,
        },
      });
    }
  },

  resetAllocations: () => set({ allocatedStars: {} }),

  toggleReviewDock: () =>
    set((state) => ({ isReviewDockExpanded: !state.isReviewDockExpanded })),
}));
