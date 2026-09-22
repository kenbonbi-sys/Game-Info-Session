// Shared timing for the comic cut-in, the bottle throw, the boss defeat, and the team victory clip.

// The hall reads three comic panels before anything moves: the fox winds up, throws, and the
// bottle is in the air with the boss finally noticing it. The canvas takes over on that
// cliffhanger, so the panels lead into the action instead of retelling it.
const COMIC = 4.2;

// liftAt…defeatAt are seconds from the start of the *scene*, which begins once the comic has
// had its say. Everything that draws the throw counts from there and needs no comic awareness.
// Only the phase length and the server's defeat timer run on phase time, which is comic + scene.
export const FINALE = Object.freeze({
  comicSeconds: COMIC,
  liftAt: 0.95,
  throwAt: 2.6,
  impactAt: 4.15,
  defeatAt: 6.85,
  sceneSeconds: 9.1,
  unleashSeconds: COMIC + 9.1,
  victorySeconds: 10,
  videoUrl: '/assets/video/fox-team-victory.webm',
});
