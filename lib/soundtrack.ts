// Set only after the selected track has been exported with game-use rights.
// Keep the audio on our own origin; no Suno account or API key ships to players.
export const SOUNDTRACK: { title: string; src: string | null } = {
  title: 'Morning Over Iowa',
  src: '/audio/morning-over-iowa.mp3',
};
