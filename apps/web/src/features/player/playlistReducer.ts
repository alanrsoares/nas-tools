export type PlaylistState = {
  list: string[];
  idx: number;
};

export type PlaylistAction =
  | { type: "play"; tracks: string[]; startIdx: number }
  | { type: "next" }
  | { type: "prev"; positionMs: number }
  | { type: "advance" }
  | { type: "enqueue"; tracks: string[] }
  | { type: "clear" };

export const EMPTY_PLAYLIST: PlaylistState = { list: [], idx: -1 };

export function playlistReducer(state: PlaylistState, action: PlaylistAction): PlaylistState {
  switch (action.type) {
    case "play":
      return { list: action.tracks, idx: action.startIdx };

    case "next": {
      const idx = state.idx + 1;
      return idx < state.list.length ? { ...state, idx } : state;
    }

    case "prev": {
      if (action.positionMs > 3000 || state.idx <= 0) return state;
      return { ...state, idx: state.idx - 1 };
    }

    case "advance": {
      const idx = state.idx + 1;
      return idx < state.list.length ? { ...state, idx } : { ...state, idx: -1 };
    }

    case "enqueue":
      return { ...state, list: [...state.list, ...action.tracks] };

    case "clear":
      return EMPTY_PLAYLIST;
  }
}
