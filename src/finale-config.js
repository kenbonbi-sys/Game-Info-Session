// Shared timing for the finishing blow, the boss defeat, and the team victory clip.

// The finishing blow is a five-second film: the fox throws, the water lands, the fear fizzles
// out. It starts the instant the bottle fills — nothing reads, nothing winds up first — and
// hands straight over to the team clip.
const FINISHER = 5.06;

export const FINALE = Object.freeze({
  finisherSeconds: FINISHER,
  finisherWebm: '/assets/video/fox-finisher.webm',
  finisherMp4: '/assets/video/fox-finisher.mp4',
  // The film cuts to the wet, smoking skull here. The hall watches the fear go out at this
  // second, so this is the second the boss loses its last HP.
  defeatAt: 4.15,
  // Half a second on the last frame before the celebration takes over.
  unleashSeconds: FINISHER + 0.5,
  victorySeconds: 10,
  videoUrl: '/assets/video/fox-team-victory.webm',
});
